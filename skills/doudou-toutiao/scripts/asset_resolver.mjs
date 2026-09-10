#!/usr/bin/env node
/**
 * asset_resolver.mjs — CDN 清单解析与标签推断（修复两个长期 bug）
 *
 * Bug A：各 parser 的 resolveCoverImage 只读 `manifest.assets` 并筛 `type === 'cover'`，
 *        但 doudou-r2 实际产出的 cdn_manifest.json 用的是 `files[]`，条目里既没有 `type`
 *        也没有 `slug` / `name` / `aspect_ratio`，只有 local_path / cdn_url / thumb_path /
 *        original_name。结果 CDN 分支被静默跳过，降级去读本地图并转成数百 KB base64
 *        塞进 evaluate_script 载荷（claw163 实测 586KB）。
 *
 * Bug B：各 parser 把 `const tags = []` 硬编码为空数组，从不推断。发布脚本里的标签逻辑
 *        普遍被 `data.tags.length > 0` 整段跳过，等于永远不配标签。
 *
 * 本模块只做纯函数，不碰浏览器，可独立单测。
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** 读取并归一化 cdn_manifest.json：兼容 assets[] / files[] / 顶层数组三种结构 */
export function readManifestItems(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return [];
  }
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw.assets)
      ? raw.assets
      : Array.isArray(raw.files)
        ? raw.files
        : [];
  return list.map(normalizeItem).filter(Boolean);
}

/** 把不同产出版本的字段名归一成统一形状 */
function normalizeItem(item) {
  if (!item || typeof item !== "object") return null;
  const localPath = item.local_path ?? item.localPath ?? item.path ?? null;
  const name = item.original_name ?? item.name ?? item.slug ?? (localPath ? path.basename(localPath) : null);
  return {
    type: item.type ?? null,
    localPath,
    thumbPath: item.thumb_path ?? item.thumbPath ?? null,
    cdnUrl: item.cdn_url ?? item.cdnUrl ?? item.url ?? null,
    name,
    aspectRatio: item.aspect_ratio ?? item.aspectRatio ?? null,
    mimeType: item.mime_type ?? item.mimeType ?? null,
    // 归一化的判定用小写全路径签名
    sig: [item.type, localPath, item.thumb_path, name, item.slug]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

/**
 * 判定是否封面资产。
 * 关键修复：不再依赖 `type === 'cover'`（真实清单没有该字段），
 * 改为同时接受显式 type 与 cover/ 路径前缀、cover- 文件名前缀等路径信号。
 */
export function isCoverItem(it) {
  if (!it) return false;
  if (it.type === "cover") return true;
  return /(^|[\\/])cover[\\/]|(^|[\\/])cover[-_.]|封面/.test(it.sig);
}

const ASPECT_MATCHERS = Object.freeze({
  "2.35:1": (it) => it.aspectRatio === "2.35:1" || /2\.35|main/.test(it.sig),
  "16:9": (it) => it.aspectRatio === "16:9" || /16x9|16-9|16_9/.test(it.sig),
  "1:1": (it) => it.aspectRatio === "1:1" || /1x1|square/.test(it.sig),
});
const DEFAULT_ASPECT_PRIORITY = ["2.35:1", "16:9", "1:1"];

/**
 * 封面优先级打分。默认 2.35:1 / main > 16:9 > 1:1；
 * bilibili 等以 16:9 为主的平台传 aspectPriority: ['16:9','2.35:1','1:1'] 覆盖。
 * 缩略图加分（体积友好），原图重罚。
 */
export function scoreCover(it, aspectPriority = DEFAULT_ASPECT_PRIORITY) {
  const s = it.sig;
  let score = 10;
  for (let i = 0; i < aspectPriority.length; i++) {
    const m = ASPECT_MATCHERS[aspectPriority[i]];
    if (m && m(it)) {
      score = 100 - i * 30;
      break;
    }
  }
  // 缩略图体积友好（但视频封面应使用原图，排版长文可偏好缩略图）
  if (/_thumb|thumb/.test(s)) score += 5;
  return score;
}

/**
 * 从产物目录解析最佳封面。
 *
 * 返回体是各平台两族形状的**超集**，任一平台都能直接消费：
 *   - `{type}` 族（juejin/aliyun/csdn/linuxsb/tencent/zhihu/bilibili）
 *   - `{hasCover, fileName}` 族（baijia/douyin/qiehao/toutiao/weixin）
 *   - `cdnUrl` 供 qiehao 的 `cover.cdnUrl || cover.url` 读取
 *
 * base64 策略：默认**不读**本地文件转 base64（避免注入载荷被数百 KB 图片撑爆，
 * claw163 实测单图 764KB）。仅当平台把 base64 内联进浏览器脚本、没有 URL 分支时，
 * 才传 preferBase64: true。
 *   - preferBase64 必需：baijia / douyin / qiehao / toutiao / weixin
 *   - 用 localPath 走 MCP upload_file：aliyun
 *   - 可浏览器内 fetch(url)：juejin / tencent / csdn / zhihu / bilibili
 *
 * @param {string} artifactDir 产物同名目录
 * @param {{preferBase64?: boolean, aspectPriority?: string[]}} opts
 */
export function resolveCoverFromManifest(artifactDir, opts = {}) {
  const items = readManifestItems(path.join(artifactDir, "cdn_manifest.json"));
  const covers = items.filter(isCoverItem);
  if (!covers.length) return null;

  const best = covers
    .slice()
    .sort((a, b) => scoreCover(b, opts.aspectPriority) - scoreCover(a, opts.aspectPriority))[0];
  const localFull = best.localPath ? path.resolve(artifactDir, best.localPath) : null;
  const localExists = !!(localFull && fs.existsSync(localFull));
  const ext = path.extname(localFull || best.name || "").toLowerCase().replace(".", "");
  const mimeType = best.mimeType ?? (ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png");
  const fileName = best.name || (localFull ? path.basename(localFull) : "cover.png");

  const wantBase64 = !!opts.preferBase64 && localExists;
  if (!best.cdnUrl && !localExists) return null;

  return {
    // {type} 族
    type: wantBase64 ? "local" : best.cdnUrl ? "cdn" : "local",
    url: best.cdnUrl ?? undefined,
    cdnUrl: best.cdnUrl ?? undefined, // qiehao 读这个
    localPath: localExists ? localFull : undefined,
    base64: wantBase64 ? fs.readFileSync(localFull).toString("base64") : undefined,
    mimeType,
    // {hasCover} 族
    hasCover: true,
    fileName,
    pickedFrom: wantBase64 ? "cdn_manifest+local" : "cdn_manifest",
    name: fileName,
  };
}

/**
 * 通用标签词表：产出「平台无关」的关键词，由各平台发布脚本再去官方标签库做匹配
 * （掘金 tagInputVue.handleSearch、知乎话题搜索等已有此逻辑）。
 */
const TAG_RULES = [
  { tag: "人工智能", kw: ["ai", "人工智能", "大模型", "llm", "aigc", "gpt", "深度学习", "机器学习"] },
  { tag: "AI编程", kw: ["ai编程", "aicoding", "claude code", "copilot", "cursor", "代码生成", "vibe coding"] },
  { tag: "智能体", kw: ["agent", "智能体", "mcp", "工具调用", "多智能体"] },
  { tag: "大模型", kw: ["deepseek", "openai", "claude", "gemini", "qwen", "推理模型"] },
  { tag: "Docker", kw: ["docker", "compose", "容器", "镜像"] },
  { tag: "Kubernetes", kw: ["kubernetes", "k8s", "helm"] },
  { tag: "Node.js", kw: ["node.js", "nodejs", "npm", "pnpm", "express", "egg.js"] },
  { tag: "JavaScript", kw: ["javascript", "typescript", "es6"] },
  { tag: "前端", kw: ["vue", "react", "前端", "css", "tailwind", "vite", "webpack"] },
  { tag: "后端", kw: ["后端", "服务端", "微服务", "springboot", "spring boot", "mybatis"] },
  { tag: "Java", kw: ["java", "jvm", "spring"] },
  { tag: "Python", kw: ["python", "pip", "fastapi", "django"] },
  { tag: "Go", kw: ["golang", "go 语言"] },
  { tag: "数据库", kw: ["mysql", "postgres", "sqlite", "redis", "d1 数据库", "数据库"] },
  { tag: "Linux", kw: ["linux", "ubuntu", "alpine", "debian", "shell", "nginx"] },
  { tag: "开源", kw: ["开源", "github", "open source", "仓库"] },
  { tag: "自动化", kw: ["自动化", "n8n", "workflow", "ci/cd", "工作流", "脚本"] },
  { tag: "工具", kw: ["工具", "插件", "效率", "cli", "利器"] },
  { tag: "Serverless", kw: ["serverless", "cloudflare workers", "worker", "无服务器", "边缘计算"] },
  { tag: "云计算", kw: ["cloudflare", "阿里云", "腾讯云", "aws", "对象存储", "r2", "cdn"] },
  { tag: "邮箱", kw: ["邮箱", "email", "smtp", "imap", "收信", "临时邮箱"] },
  { tag: "音视频", kw: ["remotion", "ffmpeg", "视频渲染", "tts", "配音", "字幕"] },
];

/**
 * 从标题与正文推断 1~maxTags 个通用标签（按命中次数降序）。
 * @returns {string[]}
 */
export function inferTags(content, title = "", maxTags = 3) {
  const text = `${title}\n${title}\n${content}`.toLowerCase(); // 标题加权一次
  const scored = [];
  for (const { tag, kw } of TAG_RULES) {
    let hits = 0;
    for (const k of kw) {
      const idx = text.split(k.toLowerCase()).length - 1;
      if (idx > 0) hits += idx;
    }
    if (hits > 0) scored.push({ tag, hits });
  }
  scored.sort((a, b) => b.hits - a.hits || TAG_RULES.findIndex((r) => r.tag === a.tag) - TAG_RULES.findIndex((r) => r.tag === b.tag));
  const out = scored.slice(0, maxTags).map((s) => s.tag);
  return out.length ? out : ["人工智能"]; // 兜底，确保发布脚本的标签分支不被跳过
}

// ---------------------------------------------------------------- CLI 自测
// node asset_resolver.mjs <产物目录> [用于标签推断的 md 文件]
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, mdFile] = process.argv.slice(2);
  if (!dir) {
    console.error("用法: node asset_resolver.mjs <产物目录> [md文件]");
    process.exit(1);
  }
  const items = readManifestItems(path.join(dir, "cdn_manifest.json"));
  console.log(`清单条目数：${items.length}｜识别为封面：${items.filter(isCoverItem).length}`);
  console.log("最佳封面：", JSON.stringify(resolveCoverFromManifest(dir), null, 2));
  if (mdFile && fs.existsSync(mdFile)) {
    const c = fs.readFileSync(mdFile, "utf8");
    console.log("推断标签：", inferTags(c, path.basename(mdFile, ".md")).join(", "));
  }
}
