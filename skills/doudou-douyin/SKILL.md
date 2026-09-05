---
name: doudou-douyin
description: "通过 chrome-devtools-mcp 实现抖音发布视频、文章、图文到草稿箱功能。支持根据用户指定的 Markdown 文章及其关联视频（video/*.mp4）与同名资产目录，真实上传 MP4 视频或全套小红书/抖音图文卡片、高清封面（>=500px校验）、纯排版富文本正文（TipTap状态双向同步）、异步上传/转码就绪轮询、Slate/React Fiber 话题与描述同步，全流程模拟真实人类行为防风控并存证。"
---

# 抖音自动化发布草稿技能规范 (doudou-douyin)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现抖音创作者平台（Creator Studio）的自动化草稿发布流程，支持**视频**、**图文**与**文章**三模态自动化发布。

---

## 📌 核心发布入口

- **发布视频入口**：`https://creator.douyin.com/creator-micro/content/upload`
- **发布图文入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=3`
- **发布文章入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=5`

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
6. **确定性草稿保存与存证**：全流程终点统一点击「**暂存离开**」（严禁误触直接「发布」），并在完成暂存后截取存证图片（`douyin_video_draft_proof.png` / `douyin_image_draft_proof.png` / `douyin_draft_proof.png`）。
7. **发布完成后保留页面（严禁自动关闭）**：暂存与截屏存证完成后，**严禁调用 `close_page` 或以任何方式关闭当前页面**，必须原样保留页面现场，供用户人工复核草稿、补充登录或手动确认发布；未登录、验证码拦截、上传超时等异常中断的场景同样适用，保留页面交由用户接管。

---

## 🚀 三模态自动化发布执行流程

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
5. **封面智能处理**：
   - 默认采用平台智能抽帧推荐封面。
   - 若出现“设置横封面获更多流量”等弹窗，自动点击「暂不设置」跳过。
6. **暂存草稿与存证**：
   - 截取当前视频编辑状态截图保存至 `douyin_video_draft_proof.png`。
   - 视口平滑滚动后，悬停并点击「**暂存离开**」，安全保存至草稿箱。
   - 验证页面跳转回上传页并展示未发布草稿提示。

---

### 模式 B：发布图文草稿（Image-Text Post）

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
5. **暂存草稿与存证**：
   - 截取当前编辑状态截图保存至 `douyin_image_draft_proof.png`。
   - 视口平滑滚动后，悬停并点击「**暂存离开**」，保存至草稿箱。

---

### 模式 C：发布文章草稿（Long Article Post）

1. **导航页面与进入发文**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload?default-tab=5`。
   - 若出现未发布提示点击「我要发文」进入 `post/article` 编辑页面。
2. **填充基础信息**：
   - 填写标题至 `input[placeholder*="请输入文章标题"]`（严格限制 30 字以内）。
   - 填写摘要至 `input[placeholder*="添加内容摘要"]`（严格限制 30 字以内）。
3. **正文富文本同步**：
   - 聚焦 `div.tiptap.ProseMirror`，执行 `pm.editor.commands.setContent(htmlContent, true)`。
   - 执行 `pm.editor.options.onUpdate({ editor: pm.editor })` 与 `pm.editor.emit('update')`，确保字数统计与 `long_article` 状态完全同步。
4. **上传头图与封面图**：
   - 点击文章头图（`.addIcon-Whrj6F`），通过 `upload_file` 上传 `>= 500px` 高清 16:9 封面，并在弹窗出现后点击「确定/完成」。
   - 验证头图与封面设置（`.addIcon-WtgoEN`）已自动同步绑定。
5. **话题标签设置**：
   - 定位 `.topicSelector-MJsOhh` 的 React Fiber 实例，通过 `setItem(prev => ({ ...prev, long_article_topic: topicList }))` 同步话题。
6. **暂存草稿与存证**：
   - 截取当前文章编辑状态截图保存至 `douyin_draft_proof.png`。
   - 视口平滑滚动后，悬停并点击「**暂存离开**」，保存至草稿箱。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、提取视频（.mp4）/长文/图文标题（防超长截断）、摘要、话题、排版 HTML、高清封面及图文卡片集。
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
const meta = parseAllAssets(markdownFilePath);

// 2. 可选：先放弃残留的未发布旧草稿，避免编辑器复用旧内容
await evaluate_script({ pageId, function: buildDiscardDraftScript() });

// 3. 按模态择一执行（长文 / 图文卡片 / 视频）
const articleRes = await evaluate_script({ pageId, function: buildArticleBrowserScript(meta) });
const imageRes = await evaluate_script({ pageId, function: buildImagePostEditorScript(meta) });
const videoRes = await evaluate_script({ pageId, function: buildVideoPostEditorScript(meta) });
```
