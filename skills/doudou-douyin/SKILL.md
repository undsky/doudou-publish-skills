---
name: doudou-douyin
description: "通过 chrome-devtools-mcp 实现抖音自动填入视频、文章、图文发文页并依托平台原生自动保存功能。用户未明确指定模态时默认发布全部可用模态（视频 + 图文 + 文章），资产缺失的模态自动跳过并登记原因；用户明确指定时只发指定模态。支持根据用户指定的 Markdown 文章及其关联视频（video/*.mp4）与同名资产目录，真实上传 MP4 视频或全套小红书/抖音图文卡片、高清封面（>=500px校验）、纯排版富文本正文（TipTap状态双向同步）、异步上传/转码就绪轮询、Slate/React Fiber 话题与描述同步，全流程模拟真实人类行为防风控，完成后保留标签页不发布。"
---

# 抖音自动化发布技能规范 (doudou-douyin)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现抖音创作者平台（Creator Studio）的内容自动化填入全流程，支持**视频**、**图文**与**文章**三模态自动化发布。

---

## 📌 核心发布入口

- **发布视频入口**：`https://creator.douyin.com/creator-micro/content/upload`
- **发布图文入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=3`
- **发布文章入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=5`

---

## 🎯 模态选择规约（默认全模态发布）

抖音同时支持**视频 / 图文 / 文章**三种模态。模态的取舍**不允许由 Agent 自行揣测或随意挑一个执行**，必须严格遵循以下判定链：

1. **用户未明确指定模态 => 默认发布全部可用模态**。
   - 「把这篇发抖音」「发布到抖音草稿箱」「发一下 xxx.md」等未点名模态的指令，一律理解为**视频 + 图文 + 文章全发**，而非只发其中一种。
   - **严禁**以「资产多、耗时长、担心风控」等理由自行缩减模态；也**严禁**中途反问用户「要发哪一种」——默认答案就是全发。
2. **用户明确指定模态 => 严格只发指定的那些**。
   - 如「只发视频」「发图文和文章」「仅发长文」，则严格按指定集合执行，不得擅自追加其他模态。
3. **模态所需资产缺失 => 自动跳过该模态，其余照常发布**。
   - 缺失不是失败：跳过并在最终报告里明确登记原因，**绝不因为某一模态缺资产而中断整个任务**。
   - 若用户显式点名的模态恰好缺资产，同样跳过，并在报告中提示需要补齐的资产路径。

### 模态可用性判定表

| 模态 | 必需资产 | 缺失时的处置 |
| :--- | :--- | :--- |
| **视频（video）** | `video/*.mp4` 成片（`meta.video.hasVideo === true`） | 跳过视频模态，登记「未找到 video/*.mp4 视频成片」 |
| **图文（image）** | `xhs_images/images/` 卡片集（`meta.cardCount > 0`） | 跳过图文模态，登记「未找到图文卡片集」 |
| **文章（article）** | 排版正文 HTML（`meta.articleHtml.htmlContent` 非空） | 跳过文章模态，登记「未解析出可用正文 HTML」 |

### 确定性模态计划（由解析器给出，禁止手工推断）

`parseAllAssets()` 已内置模态编排，直接读取 `meta.publishPlan`，**不要自行拼凑模态列表**：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";

// requestedModes 留空 / null => 默认全模态；传入 "视频" 或 ["image","article"] => 只发指定模态
const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

meta.publishPlan;
// {
//   requested: [],                       // 归一化后的用户指定模态（空数组 = 用户未指定）
//   userSpecified: false,                // false => 走默认全发
//   modes: ["video", "image", "article"],// 本次实际要执行的模态（已按推荐顺序排序）
//   skipped: [{ mode, label, reason }],  // 被跳过的模态及原因
//   summary: "用户未指定模态 => 默认发布全部可用模态｜将发布：视频 + 图文 + 文章"
// }

for (const mode of meta.publishPlan.modes) {
  // 依次执行：video -> image -> article
}
```

命令行同样可校验计划（第三个参数留空即默认全模态）：

```bash
node scripts/parser.mjs <Markdown文件绝对路径>            # 默认全模态
node scripts/parser.mjs <Markdown文件绝对路径> "视频,图文"  # 仅指定模态
```

### 多模态串行执行规约

- **执行顺序**：`video` → `image` → `article`（视频转码最慢，优先启动；文章最快，收尾执行）。
- **状态隔离**：每个模态**必须重新导航到自己的发布入口**，且在上传前执行 `buildDiscardDraftScript()` 放弃残留旧草稿，严禁复用上一模态的编辑器页面或残留内容。
- **失败隔离**：单个模态失败（上传超时、验证码拦截、选择器失效等）**只标记该模态失败并继续下一个模态**，不得终止剩余模态。
- **页面保留**：所有模态执行完毕后，**全部页面一律原样保留**（详见防风控规约第 7 条），不得关闭。
- **统一汇总报告**：任务结束时输出逐模态结果表，含状态、标题、存证截图路径与跳过原因：

  | 模态 | 状态 | 标题 | 存证截图 / 原因 |
  | :--- | :--- | :--- | :--- |
  | 视频 | ✅ 已暂存草稿 | ... | `douyin_video.png` |
  | 图文 | ✅ 已暂存草稿 | ... | `douyin_image.png` |
  | 文章 | ⏭️ 已跳过 | — | 未解析出可用正文 HTML |

---

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | 「暂存离开」后草稿箱可见该标题 |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `success` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const t = document.body.innerText;
  const inDraftBox = /草稿/.test(t);
  return { passed: inDraftBox, draftBoxVisible: inDraftBox, url: location.href };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过 |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（抖音不适用） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/douyin_video.png、publishes/screenshots/douyin_image.png、publishes/screenshots/douyin_article.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `video` / `image` / `article`）：

```json
{
  "skill": "doudou-douyin",
  "platform": "抖音",
  "platformSlug": "douyin",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "video",
      "modeDesc": "视频",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/douyin_video.png",
      "assertion": { "rule": "「暂存离开」后草稿箱可见该标题", "passed": true }
    },
    {
      "mode": "image",
      "modeDesc": "图文",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/douyin_image.png",
      "assertion": { "rule": "「暂存离开」后草稿箱可见该标题", "passed": true }
    },
    {
      "mode": "article",
      "modeDesc": "文章",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/douyin_article.png",
      "assertion": { "rule": "「暂存离开」后草稿箱可见该标题", "passed": true }
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
| **视频作品标题** | `<= 30 字`（严格截断） | 自动清洗 Markdown 符号，超长自动截断为 27 字 + `...`（共 30 字） |
| **视频作品描述** | `<= 1000 字` | 核心要点梳理 + `#话题标签` |
| **长文标题** | `<= 30 字`（严格截断） | 自动清洗 Markdown 符号，超长自动截断为 27 字 + `...`（共 30 字） |
| **长文内容摘要** | `<= 30 字`（严格截断） | 提取首段精炼摘要，超长自动截断为 27 字 + `...`（共 30 字） |
| **文章排版 HTML** | `path/to/article_name/[article_name]_排版_[theme].html` | 纯 `<section>` 排版正文（杜绝带复制栏的预览版） |
| **文章头图与封面图** | `path/to/article_name/cover/images/cover.png` | 优先选用 `cover/images/` 下 `>= 500px` 高清 16:9 封面，降级选用 `xhs_images/images/` |
| **图文标题** | `<= 20 字`（严格截断） | 自动清洗并截断为 17 字 + `...`（共 20 字） |
| **图文作品描述** | `<= 1000 字` | 核心要点梳理 + `#话题标签` |
| **图文信息图卡片集** | `path/to/article_name/xhs_images/images/` | 包含 `01-cover.png` ~ `05-summary.png` 全套卡片 |

---

## 🛡️ 防风控与人机行为模拟规约

1. **旧草稿安全重置**：进入发布入口若检测到“是否继续编辑”提示，先点击「放弃」以重置干净的上传区域。
2. **异步上传等待机制（核心）**：
   - **视频上传**：视频派发上传后，页面自动跳转至 `content/post/video`，必须异步轮询等待直到页面出现「上传成功」（或重新上传就绪），严禁提前暂存导致视频转码截断或丢失。
   - **图文上传**：卡片上传派发后，必须异步轮询等待直到出现「已添加N张图片」，确认手机预览区图片加载完毕后再填写暂存。
3. **随机微延迟**：在表单聚焦、输入、点击之间插入 200ms ~ 600ms 随机延迟（`sleep(ms + Math.random() * 200)`）。
4. **原生事件与状态双向同步**：文本输入必须派发 `input` 与 `change` 事件；富文本调用 TipTap/Slate/Selection 状态同步；话题标签保持精准绑定。
5. **真实鼠标交互**：点击操作前先将元素 `scrollIntoView({ behavior: 'smooth' })`，派发 `mouseover`、`mouseenter` 再执行 `click`。
6. **安全隔离与自动保存机制**：抖音创作者平台具备输入实时自动保存机制。**彻底移除点击「暂存离开」按钮的操作**（防止页面跳出当前编辑器回到内容管理列表），**严格禁止误触直接「发布」**。全流程表单与资产注入完成后，平滑滚动视口审阅，轮询完成断言直至通过，并截取当前编辑页存证图片（`douyin_video.png` / `douyin_image.png` / `douyin_article.png`）。
7. **发布完成后保留页面（严禁自动关闭）**：填入与截屏存证完成后，**严禁调用 `close_page` 或以任何方式关闭当前页面**，必须原样保留页面现场，供用户人工复核草稿、补充登录或手动确认发布；未登录、验证码拦截、上传超时等异常中断的场景同样适用，保留页面交由用户接管。

---
8. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
9. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。

## 🚀 三模态自动化发布执行流程

> 下列模式**不是「择一执行」的选项**，而是逐模态执行的操作手册：按「模态选择规约」得出的 `publishPlan.modes` 依次执行其中每一个模态（默认三种全发）。模式字母仅为编号，实际执行顺序恒为 `video` → `image` → `article`。

### 模式 A：发布视频草稿（Video Post）

1. **导航页面与重置**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload`。
   - 若出现“你还有上次未发布的视频，是否继续编辑？”提示且需上传全新视频，先点击「放弃」。
2. **真实视频文件上传**：
   - 解析目标文章目录下的 `video/`，获取真实 `.mp4` 文件路径（如 `video_manifest.json` 指定的成片或默认 `.mp4`）。
   - 通过 `upload_file` 工具将视频文件派发至 `input[type="file"]`。
3. **进入编辑页与等待上传完成**：
   - 页面自动进入 `content/post/video` 后，**启动轮询等待（10~120秒）**，直到「上传成功」出现且视频处理完成。
4. **填充信息**：
   - 填写标题（严格限制 30 字以内）至 `input[placeholder*="填写作品标题"]`。
   - 填写作品简介与话题标签（严格限制 1000 字以内）至 `.zone-container.editor-kit-container`。
5. **封面上传与设置**：
   - 检测目标文章封面资产，唤起「选择封面」弹窗并切换至「本地上传」注入封面；若无自定义封面则复用平台原生抽帧推荐。
   - 若出现“设置横封面获更多流量”等弹窗，自动点击「暂不设置」跳过。
6. **平滑滚动审阅与就绪存证**：
   - 视口平滑滚动后，按「完成断言与回执协议」以 1.5s 间隔轮询完成断言，最长 45s（**严禁以固定等待代替断言**）；
   - 严格绝不点击「暂存离开」（避免跳出编辑器），绝对禁止触碰「发布」；
   - 截取当前视频编辑状态截图保存至 `douyin_video.png`，保留当前编辑页。

---

### 模式 B：发布图文（Image-Text Post）

1. **导航页面与重置**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`。
   - 若出现“是否继续编辑”提示且需上传全新图文，先点击「放弃」。
2. **真实文件上传**：
   - 解析目标文章目录下的 `xhs_images/images/`，获取全部真实 PNG 文件路径（`01-cover.png` ~ `05-summary.png`）。
   - 通过 `upload_file` 工具将全套文件派发至 `input[type="file"]`。
3. **进入编辑页与等待上传完成**：
   - 页面进入 `post/image` 后，**启动轮询等待（10~30秒）**，直到「已添加5张图片」出现且右侧手机预览加载完成。
4. **填充信息**：
   - 填写标题（严格限制 20 字以内）至 `input[placeholder*="添加作品标题"]`。
   - 填写描述与话题（严格限制 1000 字以内）至 `.zone-container.editor-kit-container`。
5. **平滑滚动审阅与就绪存证**：
   - 视口平滑滚动后，按「完成断言与回执协议」以 1.5s 间隔轮询完成断言，最长 45s（**严禁以固定等待代替断言**）；
   - 严格绝不点击「暂存离开」，绝对禁止触碰「发布」；
   - 截取当前编辑状态截图保存至 `douyin_image.png`，保留当前编辑页。

---

### 模式 C：发布文章（Long Article Post）

1. **导航页面与进入发文**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload?default-tab=5`。
   - 若出现未发布提示点击「我要发文」进入 `post/article` 编辑页面。
2. **填写文章标题**：
   - 填写标题至 `input[placeholder*="请输入文章标题"]`（严格限制 30 字以内）。
3. **正文富文本同步**：
   - 聚焦 `div.tiptap.ProseMirror`，执行 `pm.editor.commands.setContent(htmlContent, true)`。
   - 执行 `pm.editor.options.onUpdate({ editor: pm.editor })` 与 `pm.editor.emit('update')`，确保字数统计与 `long_article` 状态完全同步。
4. **上传头图与封面图**：
   - 点击文章头图（`.addIcon-Whrj6F`），通过 `upload_file` 上传 `>= 500px` 高清 16:9 封面，并在弹窗出现后点击「确定/完成」。
   - 验证头图与封面设置（`.addIcon-WtgoEN`）已自动同步绑定。
5. **平滑滚动审阅与就绪存证**：
   - 视口平滑滚动后，按「完成断言与回执协议」以 1.5s 间隔轮询完成断言，最长 45s（**严禁以固定等待代替断言**）；
   - 严格绝不点击「暂存离开」，绝对禁止触碰「发布」；
   - 截取当前文章编辑状态截图保存至 `douyin_article.png`，保留当前编辑页。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、提取视频（.mp4）/长文/图文标题（防超长截断）、摘要、话题、排版 HTML、高清封面及图文卡片集；并产出确定性模态计划 `publishPlan`（`PUBLISH_MODES` / `normalizeRequestedModes` / `resolvePublishPlan`）。
- [scripts/douyin_publisher.mjs](scripts/douyin_publisher.mjs)：视频、文章与图文发布浏览器注入脚本生成器（含放弃旧草稿、上传/CDN就绪轮询、Slate/React Fiber 状态双向同步与暂存草稿）。

### Agent 调用范式

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";
import {
  buildDiscardDraftScript,
  buildArticleBrowserScript,
  buildImagePostEditorScript,
  buildVideoPostEditorScript,
} from "./scripts/douyin_publisher.mjs";

// 1. 解析目标 Markdown（parseAllAssets 为同步函数）
//    requestedModes 留空 => 默认全模态；仅当用户明确点名模态时才传入
const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

// 2. 读取确定性模态计划，严禁自行推断要发哪些模态
const { modes, skipped, summary } = meta.publishPlan;
console.log(summary); // 预期输出：用户未指定模态 => 默认发布全部可用模态｜将发布：视频 + 图文 + 文章

// 3. 逐模态串行执行；单模态失败不影响后续模态
const results = [];
for (const mode of modes) {
  // 3.1 每个模态都重新导航至各自入口（video / image / article）
  await navigate_page({ pageId, url: ENTRY_URL[mode] });

  // 3.2 放弃残留的未发布旧草稿，避免编辑器复用上一模态内容
  await evaluate_script({ pageId, function: buildDiscardDraftScript() });

  try {
    if (mode === "video") {
      // upload_file 派发 meta.video.videoPath -> 轮询上传成功 -> 填充文案
      results.push(await evaluate_script({ pageId, function: buildVideoPostEditorScript(meta) }));
    } else if (mode === "image") {
      // upload_file 批量派发 meta.cardFilePaths -> 轮询「已添加N张图片」-> 填充文案
      results.push(await evaluate_script({ pageId, function: buildImagePostEditorScript(meta) }));
    } else {
      results.push(await evaluate_script({ pageId, function: buildArticleBrowserScript(meta) }));
    }
  } catch (e) {
    results.push({ mode, ok: false, error: String(e) }); // 记录失败并继续下一模态
  }
}

// 4. 汇总逐模态结果 + skipped 跳过原因，输出统一报告（页面一律保留不关闭）
```
