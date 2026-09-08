---
name: doudou-toutiao
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及关联视频（video/*.mp4）自动发布到今日头条/头条号创作者平台草稿箱（文章：https://mp.toutiao.com/profile_v4/graphic/publish ，视频：https://mp.toutiao.com/profile_v4/xigua/upload-video ）。用户未明确指定模态时默认发布全部可用模态（视频 + 长文图文），资产缺失的模态自动跳过并登记原因；用户明确指定时只发指定模态。严格遵循真实人工行为模拟与防风控规约（微随机时延抖动、全链路 DOM 事件派发、ProseMirror/Sylph 富文本双向同步、视口平滑滚动排版审阅、异步上传转码就绪等待、抽屉式封面真实上传与弹窗确认），智能解析同名资产目录与 CDN 映射表，支持草稿保存状态验证与存证。
---

# 头条号自动化发布草稿技能规范 (doudou-toutiao)

本技能通过 `chrome-devtools-mcp` 控制浏览器，实现今日头条/头条号创作者平台（https://mp.toutiao.com ）的**长文图文文章**与**视频**双模态自动化发布全流程。

---

## 📌 核心发布入口

- **发布文章入口**：`https://mp.toutiao.com/profile_v4/graphic/publish`
- **发布视频入口**：`https://mp.toutiao.com/profile_v4/xigua/upload-video`
- **草稿箱管理入口**：`https://mp.toutiao.com/profile_v4/manage/draft`
- **西瓜内容管理入口**：`https://mp.toutiao.com/profile_v4/xigua/content-manage-v2`

---

## 🎯 模态选择规约（默认全模态发布）

头条号同时支持**视频 / 长文图文**两种模态。模态的取舍**不允许由 Agent 自行揣测或随意挑一个执行**，必须严格遵循以下判定链：

1. **用户未明确指定模态 => 默认发布全部可用模态**。
   - 「把这篇发头条」「发布到头条号草稿箱」「发一下 xxx.md」等未点名模态的指令，一律理解为**视频 + 长文图文全发**，而非只发文章。
   - **严禁**以「资产多、耗时长、担心风控」等理由自行缩减模态；也**严禁**中途反问用户「要发文章还是视频」——默认答案就是两种都发。
2. **用户明确指定模态 => 严格只发指定的那些**。
   - 如「只发文章」「仅发视频」，则严格按指定集合执行，不得擅自追加其他模态。
3. **模态所需资产缺失 => 自动跳过该模态，其余照常发布**。
   - 缺失不是失败：跳过并在最终报告里明确登记原因，**绝不因为某一模态缺资产而中断整个任务**。
   - 若用户显式点名的模态恰好缺资产，同样跳过，并在报告中提示需要补齐的资产路径。

### 模态可用性判定表

| 模态 | 必需资产 | 缺失时的处置 |
| :--- | :--- | :--- |
| **视频（video）** | `video/*.mp4` 成片（`meta.video.hasVideo === true`） | 跳过视频模态，登记「未找到 video/*.mp4 视频成片」 |
| **长文图文（article）** | 排版正文 HTML（`meta.articleHtml.htmlContent` 非空） | 跳过文章模态，登记「未解析出可用排版正文 HTML」 |

> 两个模态的终点态不同，必须分别遵守：图文模态等待「草稿已保存」；视频模态**仅停在就绪态截屏存证，绝不点击发布**（详见防风控规约第 1 条）。

### 确定性模态计划（由解析器给出，禁止手工推断）

`parseAllAssets()` 已内置模态编排，直接读取 `meta.publishPlan`，**不要自行拼凑模态列表**：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";

// requestedModes 留空 / null => 默认全模态；传入 "视频" 或 ["article"] => 只发指定模态
const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

meta.publishPlan;
// {
//   requested: [],                      // 归一化后的用户指定模态（空数组 = 用户未指定）
//   userSpecified: false,               // false => 走默认全发
//   modes: ["video", "article"],        // 本次实际要执行的模态（已按推荐顺序排序）
//   skipped: [{ mode, label, reason }], // 被跳过的模态及原因
//   summary: "用户未指定模态 => 默认发布全部可用模态｜将发布：视频 + 长文图文"
// }
```

命令行同样可校验计划（第三个参数留空即默认全模态）：

```bash
node scripts/parser.mjs <Markdown文件绝对路径>          # 默认全模态
node scripts/parser.mjs <Markdown文件绝对路径> "视频"    # 仅指定模态
```

### 多模态串行执行规约

- **执行顺序**：`video` → `article`（视频上传与转码最慢，优先启动；长文随后执行）。
- **状态隔离**：每个模态**必须重新导航到自己的发布入口**，严禁复用上一模态的编辑器页面或残留内容。
- **失败隔离**：单个模态失败（上传超时、验证码拦截、选择器失效等）**只标记该模态失败并继续下一个模态**，不得终止剩余模态。
- **页面保留**：所有模态执行完毕后，**全部页面一律原样保留**（详见防风控规约第 3 条）——视频模态尤其关键，页面即创作者人工确认发布的唯一入口。
- **统一汇总报告**：任务结束时输出逐模态结果表，含状态、标题、存证截图路径与跳过原因：

  | 模态 | 状态 | 标题 | 存证截图 / 原因 |
  | :--- | :--- | :--- | :--- |
  | 视频 | ✅ 表单就绪待人工发布 | ... | `toutiao_video.png` |
  | 长文图文 | ✅ 草稿已保存 | ... | `toutiao_article.png` |

---

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | 页面出现「已保存」/「草稿已保存」状态文字 |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `success` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const t = document.body.innerText;
  const saved = /草稿已保存|已保存|保存成功/.test(t);
  return { passed: saved, savedTip: saved, draftUrl: location.href };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过 |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（今日头条不适用） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/toutiao_article.png、publishes/screenshots/toutiao_video.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `article` / `video`）：

```json
{
  "skill": "doudou-toutiao",
  "platform": "今日头条",
  "platformSlug": "toutiao",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "article",
      "modeDesc": "长文图文",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/toutiao_article.png",
      "assertion": { "rule": "页面出现「已保存」/「草稿已保存」状态文字", "passed": true }
    },
    {
      "mode": "video",
      "modeDesc": "视频",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/toutiao_video.png",
      "assertion": { "rule": "页面出现「已保存」/「草稿已保存」状态文字", "passed": true }
    }
  ]
}
```

脚本会强校验并拒绝不合规回执：非终态 `status`、缺 `statusText`、非 `skipped` 却缺 `screenshot` 一律报错退出，从源头杜绝脏数据流入看板。

---

## 🎨 资产规范与路径映射

| 资产类型 | 规范路径 / 规则 | 说明 |
| :--- | :--- | :--- |
| **源 Markdown 文章** | `path/to/article_name.md` | 原始文章 |
| **视频成片文件** | `path/to/article_name/video/[video_name].mp4` 或 `[article_name].mp4` | 成品高清视频（优先识别 `video_manifest.json` 登记输出） |
| **视频作品标题** | `<= 30 字`（AI 智能提炼，严禁硬截断） | 全角=1字、半角=0.5字；保留合规中文标点；若超 30 字由 Agent 结合主旨提炼新标题（`--title`） |
| **视频作品描述/简介** | `<= 1000 字` | 核心要点梳理，保留多行分段排版（换行分段），严禁单行塌陷 |
| **长文文章标题** | `<= 30 字`（AI 智能提炼，严禁硬截断） | 全角=1字、半角=0.5字；若原标题超长由 Agent 结合主旨提炼新标题（`--title`） |
| **长文内容摘要** | `<= 100 字` | 提取首段精炼摘要，超长自动截断 |
| **文章排版 HTML** | `path/to/article_name/[article_name]_cdn.md` | 纯排版正文，依据 `cdn_manifest.json` 替换为 Cloudflare R2 公开 CDN 链接 |
| **文章封面图** | `path/to/article_name/cover/images/` | 优先读取 `xhs_images/images/01-cover.png` 或 `cover/images/` 下宽屏封面 |
| **标签处理约定** | `tags = inferTags(...)`（上限 3） | 由 `asset_resolver.inferTags` 从标题与正文推断；旧版固定为空数组导致下游标签分支被判空跳过 |

---

## 🛡️ 防风控与真实人机行为模拟规约

1. **草稿安全隔离与终点控制**：
   - **图文发文**：严格限定为草稿保存（等待页面自动提示「草稿已保存」并在草稿箱列表验证），**绝对不点击「预览并发布」或「定时发布」**。
   - **视频发布**：视频文件派发上传后异步轮询等待直至「上传成功」，填入精炼短标题（<=30字）并完成视口平滑滚动校验。由于西瓜/头条视频发布在当前页面仅提供「发布」按钮（无草稿暂存按钮），为了绝对安全，系统完成全套表单配置后**严格保持在就绪状态并截屏存证，绝不自动触碰发布按钮**，由创作者人工最终审阅后确认发布。
2. **防风控与人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加随机等待（输入前 200~500ms、步骤间 400~1000ms、点击悬停 200~400ms），严禁毫秒级瞬时操作。
   - **真实事件完整性**：对于标题输入与表单交互，依次派发 `focus`、`keydown`、`input`、`keyup`、`change`、`blur`，并同步底层 React 状态。
   - **ProseMirror / Sylph 富文本注入**：利用 React Fiber 上的 Editor 实例（`reactEditor.pasteContent`）及标准 `ClipboardEvent('paste')` 注入内容，完整保留标题、代码块、加粗、引用、列表及 CDN 配图。
   - **平滑视口滚动**：模拟人类自上而下的视觉审阅，分步平滑滚动页面触发浏览器的视口可见性检测。
   - **拟真悬停与点击**：点击元素前先将其 `scrollIntoView({ behavior: 'smooth' })`，派发 `mouseover`、`mouseenter` 悬停后再触发 `click`。
3. **发布完成后保留页面（严禁自动关闭）**：
   - 草稿保存或视频表单就绪并完成截屏存证后，**严禁调用 `close_page` 或以任何方式关闭当前页面**，必须原样保留页面现场——视频模式尤其关键，页面即是创作者人工审阅后点击发布的唯一入口。
   - 未登录、验证码拦截、上传超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

4. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
5. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。

---

## 🚀 双模态自动化发布执行流程

> 下列模式**不是「择一执行」的选项**，而是逐模态执行的操作手册：按「模态选择规约」得出的 `publishPlan.modes` 依次执行其中每一个模态（默认两种全发）。模式字母仅为编号，实际执行顺序恒为 `video`（模式 B）→ `article`（模式 A）。

### 模式 A：发布长文图文草稿（Long Article Post）

1. **解析 Markdown 资产与封面**：
   - 运行 `node scripts/parser.mjs <Markdown文件绝对路径>`。
2. **打开/聚焦发文页并检测登录态**：
   - 访问 `https://mp.toutiao.com/profile_v4/graphic/publish`。
3. **拟真人机输入文章标题**：
   - 定位 `textarea[placeholder*="请输入文章标题"]`，填入 2~30 字标题并派发原生事件。
4. **注入 ProseMirror 富文本正文**：
   - 定位 `.ProseMirror` 内容可编辑区域并聚焦，通过 React Fiber 调用 `reactEditor.pasteContent` 注入正文。
5. **视口平滑滚动排版审阅**：
   - 分步滚动视口模拟人工阅读。
6. **抽屉式封面真实上传与确认**：
   - 若存在封面图资产，点击 `.article-cover-add` 展开 `.byte-drawer` 抽屉，注入 `File` 对象并自动完成确认裁剪。
7. **等待草稿云端保存并存证**：
   - 平滑滚动至页面底部，等待校验呈现「草稿已保存」，在草稿箱页面截图存证（`toutiao_article.png`）。

---

### 模式 B：发布视频草稿（Video Post）

1. **导航至视频上传页**：
   - 访问 `https://mp.toutiao.com/profile_v4/xigua/upload-video`。
2. **暴露并定位文件上传控件**：
   - 运行准备脚本将隐藏的 `input[type="file"]` 暴露给 accessibility tree，赋予 `id="doudou-toutiao-video-input"`。
3. **派发真实视频文件上传**：
   - 解析目标文章同名目录下的 `video/` 目录，获取真实 `.mp4` 文件路径（如 `video_manifest.json` 指定成片）。
   - 通过 `upload_file` 工具将视频文件派发至上传 input。
4. **异步轮询等待视频上传完成**：
   - 异步轮询页面状态（10~120秒），直到页面呈现「上传成功」或出现「重新上传/删除」，且进度提示结束。
5. **填入视频作品标题**：
   - 定位 `input.xigua-input`，填入清洗后的 5~30 字视频标题，派发 `input` 与 `change` 原生事件并同步 React 内部状态。
6. **模拟视口滚动与就绪核验**：
   - 视口平滑滚动模拟人工核验，验证右侧手机端推荐样式预览展示正常。
7. **就绪状态截图存证**：
   - 严格遵循安全合规原则（不点击直接发布按钮），截取当前就绪状态截图保存至 `toutiao_video.png`。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录）：

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、定位视频成片（.mp4）/长文标题（防超长截断）、摘要、排版 HTML、高清封面及视频描述，`tags` 保持 `[]`；并产出确定性模态计划 `publishPlan`（`PUBLISH_MODES` / `normalizeRequestedModes` / `resolvePublishPlan`）。
- [scripts/toutiao_publisher.mjs](scripts/toutiao_publisher.mjs)：浏览器注入脚本生成器（涵盖长文图文 Sylph/ProseMirror 状态双向同步与视频上传就绪核验脚本）。

### Agent 调用范式

```javascript
import { parseAllAssets, calcPlatformWords } from "./scripts/parser.mjs";
import {
  buildPublishBrowserScript,
  buildPrepareVideoUploadBrowserScript,
  buildWaitVideoUploadReadyBrowserScript,
  buildVideoPublishBrowserScript,
} from "./scripts/toutiao_publisher.mjs";

// 1. 解析目标 Markdown 资产（parseAllAssets 为同步函数）
//    requestedModes 留空 => 默认全模态；仅当用户明确点名模态时才传入
let meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

// 2. 标题字数与 AI 智能重构校验（严禁机械截断）
//    平台规则：全角汉字/符号=1字，半角英文/数字/空格=0.5字，上限 30 字。
//    若 calcPlatformWords(meta.articleTitle) > 30：
//    执行 Agent 必须发挥自身 AI 语义理解能力，结合文章主旨智能提炼一个 <= 30 字的精炼新标题
//    （保留核心框架/品牌名与主要动宾意图，语言吸睛且语义完整），重新注入：
//    meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null, aiGeneratedTitle);

// 3. 读取确定性模态计划，严禁自行推断要发哪些模态
const { modes, skipped, summary } = meta.publishPlan;
console.log(summary); // 预期输出：用户未指定模态 => 默认发布全部可用模态｜将发布：视频 + 长文图文

// 3. 逐模态串行执行（video -> article）；单模态失败不影响后续模态
const results = [];
for (const mode of modes) {
  try {
    if (mode === "video") {
      // 视频：平台无草稿按钮，仅保留就绪态供人工确认发布
      await navigate_page({ pageId, url: "https://mp.toutiao.com/profile_v4/xigua/upload-video" });
      await evaluate_script({ pageId, function: buildPrepareVideoUploadBrowserScript() });
      await upload_file({ pageId, uid: inputUid, filePaths: [meta.video.videoPath] });
      await evaluate_script({ pageId, function: buildWaitVideoUploadReadyBrowserScript(120) });
      results.push(await evaluate_script({ pageId, function: buildVideoPublishBrowserScript(meta) }));
    } else {
      // 长文图文：等待页面提示「草稿已保存」
      await navigate_page({ pageId, url: "https://mp.toutiao.com/profile_v4/graphic/publish" });
      results.push(await evaluate_script({ pageId, function: buildPublishBrowserScript(meta) }));
    }
  } catch (e) {
    results.push({ mode, ok: false, error: String(e) }); // 记录失败并继续下一模态
  }
}

// 4. 汇总逐模态结果 + skipped 跳过原因，输出统一报告（页面一律保留不关闭）
```
