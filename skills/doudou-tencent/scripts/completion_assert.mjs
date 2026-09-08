#!/usr/bin/env node
/**
 * completion_assert.mjs — 内容态完成断言（替代「URL 出现草稿 ID」式的间接判定）
 *
 * 判定标准（用户口径）：
 *   article / topic  → 正文有内容 **且** 有封面图  => success
 *   image（图文）     → 有图片                      => success
 *   video（视频）     → 有视频                      => success
 *
 * 为什么改：URL 出现 draftId 只证明「平台存过一次」，不证明产物完整。
 * 出现过标题填了、正文注入失败但 URL 已有 draftId 的情况，旧断言会误判 success。
 * 现在直接检查交付物本身，且**找不到证据一律 passed:false**，绝不静默放行。
 *
 * 用法（父级/技能内）：
 *   node completion_assert.mjs script <skill> <mode>   # 打印可直接喂给 evaluate_script 的片段
 *   node completion_assert.mjs spec   <skill> <mode>   # 查看该平台的选择器与阈值
 */
import { pathToFileURL } from "node:url";

export const ASSERT_TIMEOUT_MS = 45000;
export const ASSERT_POLL_MS = 1500;

/** 各模式的默认阈值；平台可在 SPEC_HINTS 里覆盖 */
const MODE_RULES = Object.freeze({
  article: { needBody: true, needCover: true, minBodyChars: 200 },
  topic: { needBody: true, needCover: false, minBodyChars: 120 },
  image: { needBody: false, needCover: false, minImages: 1 },
  video: { needBody: false, needCover: false, needVideo: true },
  sticker: { needBody: false, needCover: false, minImages: 1 },
});

/**
 * 平台选择器提示。generic 探测器会先试这里的选择器，再退回通用启发式，
 * 所以 hint 写错只会降级为「较慢但仍能判定」，不会直接判错。
 */
const SPEC_HINTS = Object.freeze({
  "doudou-juejin": {
    body: [".CodeMirror", ".markdown-body", "#markdown-editor"],
    cover: [".cover-popover img", ".upload-img img", "[class*=cover] img"],
  },
  "doudou-weixin": {
    body: ["#ueditor_0", ".ProseMirror", "[contenteditable=true]"],
    cover: [".cover_appmsg_item img", "[class*=cover] img", ".js_cover_area img"],
    image: [".appmsg_content img", "[class*=image_list] img"],
  },
  "doudou-toutiao": {
    body: [".ProseMirror", ".syl-editor", "[contenteditable=true]"],
    cover: [".article-cover-add img", "[class*=cover] img"],
    video: ["video", "[class*=video-preview] video"],
  },
  "doudou-baijia": {
    body: [".ProseMirror", "#ueditor_0", "[contenteditable=true]"],
    cover: [".cover-wrapper img", "[class*=cover] img"],
  },
  "doudou-qiehao": {
    body: [".ProseMirror", "[contenteditable=true]"],
    cover: ["[class*=cover] img", ".cover-img img"],
  },
  "doudou-csdn": {
    body: [".CodeMirror", ".editor__inner", "[contenteditable=true]"],
    cover: [".cover-box img", "[class*=cover] img"],
  },
  "doudou-tencent": {
    body: [".CodeMirror", ".ProseMirror", "[contenteditable=true]"],
    cover: ["[class*=cover] img", ".cover-upload img"],
  },
  "doudou-aliyun": {
    body: [".CodeMirror", ".ProseMirror", "[contenteditable=true]"],
    cover: ["[class*=cover] img", ".upload-preview img"],
  },
  "doudou-zhihu": {
    body: [".Editable-unstyled", ".public-DraftEditor-content", "[contenteditable=true]"],
    cover: [".TitleImage img", "[class*=cover] img", "[class*=TitleImage] img"],
  },
  "doudou-bilibili": {
    body: [".ql-editor", ".ProseMirror", "[contenteditable=true]"],
    cover: [".cover-selector img", "[class*=cover] img"],
    video: ["video", "[class*=video] video"],
  },
  "doudou-shipinhao": {
    video: ["video", "[class*=video-preview] video", "[class*=player] video"],
    cover: ["[class*=cover] img"],
  },
  "doudou-xiaohongshu": {
    image: ["[class*=img-preview] img", "[class*=image] img", ".upload-list img"],
    video: ["video"],
  },
  "doudou-douyin": {
    body: [".ProseMirror", "[contenteditable=true]"],
    image: ["[class*=image] img", ".upload-list img"],
    video: ["video"],
    cover: ["[class*=cover] img"],
  },
  "doudou-linuxsb": {
    body: [".d-editor-input", "textarea.d-editor-input", ".cooked"],
  },
});

/** 覆盖：平台无封面字段时不要强求封面 */
const RULE_OVERRIDES = Object.freeze({
  // 烧饼社区是论坛贴，没有封面位
  "doudou-linuxsb:topic": { needCover: false },
});

export function resolveSpec(skill, mode) {
  const base = MODE_RULES[mode];
  if (!base) throw new Error(`未知模式："${mode}"，可选：${Object.keys(MODE_RULES).join("/")}`);
  const hints = SPEC_HINTS[skill] ?? {};
  return {
    skill,
    mode,
    ...base,
    ...(RULE_OVERRIDES[`${skill}:${mode}`] ?? {}),
    selectors: {
      body: hints.body ?? [],
      cover: hints.cover ?? [],
      image: hints.image ?? [],
      video: hints.video ?? [],
    },
  };
}

/**
 * 页内断言主体。**必须是纯函数**：会被 toString() 后注入浏览器执行。
 * 返回 { passed, reason, evidence }，evidence 用于回执留证与排障。
 */
function inPageAssert(spec) {
  const q = (sels) => {
    for (const s of sels) {
      try {
        const found = Array.from(document.querySelectorAll(s));
        if (found.length) return found;
      } catch (e) {
        /* 选择器不合法则跳过 */
      }
    }
    return [];
  };
  const realSrc = (el) => {
    const s = el.currentSrc || el.src || el.getAttribute("src") || "";
    return /^(https?:|blob:|data:image)/.test(s) ? s : "";
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };

  // ---- 正文字数：CodeMirror 取实例值，其余取 innerText / value
  let bodyChars = 0;
  let bodyFrom = "none";
  const cmEl = document.querySelector(".CodeMirror");
  if (cmEl && cmEl.CodeMirror && typeof cmEl.CodeMirror.getValue === "function") {
    bodyChars = cmEl.CodeMirror.getValue().trim().length;
    bodyFrom = "CodeMirror.getValue";
  }
  if (!bodyChars) {
    const docs = [document];
    for (const iframe of Array.from(document.querySelectorAll("iframe"))) {
      try {
        const idoc = iframe.contentDocument || iframe.contentWindow?.document;
        if (idoc) docs.push(idoc);
      } catch (e) {}
    }
    const cands = [];
    for (const d of docs) {
      cands.push(...q(spec.selectors.body));
      cands.push(...Array.from(d.querySelectorAll('[contenteditable="true"],.ProseMirror,.ql-editor,.tiptap,textarea')));
    }
    for (const el of cands) {
      const t = (el.value != null && el.value !== "" ? el.value : el.innerText || "").trim();
      if (t.length > bodyChars) {
        bodyChars = t.length;
        bodyFrom = el.className || el.tagName;
      }
    }
  }

  // ---- 封面：优先平台选择器，退回「祖先含 cover/封面」的启发式
  let coverSrc = "";
  for (const el of q(spec.selectors.cover)) {
    if (realSrc(el)) { coverSrc = realSrc(el); break; }
  }
  if (!coverSrc) {
    for (const el of Array.from(document.querySelectorAll("img"))) {
      if (!realSrc(el)) continue;
      const ctx = (el.closest('[class*="cover" i],[class*="Cover"],[id*="cover" i]') ? "cover" : "");
      if (ctx) { coverSrc = realSrc(el); break; }
    }
  }

  // ---- 补充：抽屉已收起/关闭时的状态兼容与发布器存证
  if (!coverSrc) {
    if (window.__doudou_cover_status) {
      coverSrc = String(window.__doudou_cover_status);
    } else if (window.__doudou_cover_url) {
      coverSrc = String(window.__doudou_cover_url);
    } else {
      try {
        // 掘金 Vue 实例草稿封面
        const jDraft = document.querySelector('.markdown-editor')?.__vue__?.$parent?.draft;
        if (jDraft && jDraft.cover_image) coverSrc = jDraft.cover_image;
        // CSDN Vue 组件实例封面
        const csdnComp = Array.from(document.querySelectorAll('*')).find(el => el.__vue__?.$options?.name === 'CoverImage');
        if (csdnComp && csdnComp.__vue__ && csdnComp.__vue__.currentImg) coverSrc = csdnComp.__vue__.currentImg;
      } catch (e) {}
    }
  }

  // ---- 图片数：可见且有真实 src
  const imgPool = q(spec.selectors.image);
  const images = (imgPool.length ? imgPool : Array.from(document.querySelectorAll("img")))
    .filter((el) => realSrc(el) && visible(el))
    .map((el) => realSrc(el));

  // ---- 视频：video 元素有 src / readyState，或进度显示 100%
  const vids = (q(spec.selectors.video).length ? q(spec.selectors.video) : Array.from(document.querySelectorAll("video")))
    .filter((el) => realSrc(el) || el.readyState > 0 || el.duration > 0);
  const bodyText = document.body ? document.body.innerText : "";
  const uploadDone = /上传成功|上传完成|100%/.test(bodyText);

  const evidence = {
    url: location.href,
    bodyChars,
    bodyFrom,
    coverSrc: coverSrc ? coverSrc.slice(0, 160) : null,
    imageCount: images.length,
    videoCount: vids.length,
    uploadDoneHint: uploadDone,
    titleValue: (() => {
      const t = document.querySelector('input[placeholder*="标题"],input[class*="title"],textarea[placeholder*="标题"]');
      return t ? (t.value || "").trim().slice(0, 120) : null;
    })(),
  };

  const fails = [];
  if (spec.needBody && bodyChars < spec.minBodyChars) {
    fails.push(`正文仅 ${bodyChars} 字（需 ≥ ${spec.minBodyChars}）`);
  }
  const skipCoverCheck = spec.allowMissingCover || window.__doudou_allow_missing_cover;
  if (spec.needCover && !coverSrc && !skipCoverCheck) {
    fails.push("未检测到封面图（若封面在发布抽屉内，请在抽屉打开状态下断言）");
  }
  if (spec.minImages && images.length < spec.minImages) {
    fails.push(`图片 ${images.length} 张（需 ≥ ${spec.minImages}）`);
  }
  if (spec.needVideo && vids.length === 0 && !uploadDone) {
    fails.push("未检测到已就绪的视频");
  }

  return {
    passed: fails.length === 0,
    reason: fails.length ? fails.join("；") : "内容态断言通过",
    spec: { skill: spec.skill, mode: spec.mode },
    evidence,
  };
}

/** 生成可直接粘贴进 chrome-devtools evaluate_script 的片段 */
export function buildAssertionScript(skill, mode) {
  const spec = resolveSpec(skill, mode);
  return `() => (${inPageAssert.toString()})(${JSON.stringify(spec)})`;
}

/** 人类可读的断言描述，写进 SKILL.md / 队列文件 */
export function describeAssertion(skill, mode) {
  const s = resolveSpec(skill, mode);
  const parts = [];
  if (s.needBody) parts.push(`正文 ≥ ${s.minBodyChars} 字`);
  if (s.needCover) parts.push("封面图已就位");
  if (s.minImages) parts.push(`图片 ≥ ${s.minImages} 张`);
  if (s.needVideo) parts.push("视频已就绪");
  return parts.join(" + ") || "内容非空";
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [cmd, skill, mode] = process.argv.slice(2);
  try {
    if (cmd === "script") console.log(buildAssertionScript(skill, mode));
    else if (cmd === "spec") console.log(JSON.stringify(resolveSpec(skill, mode), null, 2));
    else if (cmd === "desc") console.log(describeAssertion(skill, mode));
    else throw new Error("用法: node completion_assert.mjs <script|spec|desc> <skill> <mode>");
  } catch (e) {
    console.error(`❌ ${e.message}`);
    process.exit(1);
  }
}
