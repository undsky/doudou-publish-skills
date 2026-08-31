---
name: doudou-douyin
description: "通过 chrome-devtools-mcp 实现抖音发布文章、图文到草稿箱功能。支持根据用户指定的 Markdown 文章及其同名资产目录，真实上传高清封面（>=500px校验）、纯排版富文本正文（TipTap状态双向同步）、以及全套真实小红书/抖音信息图卡片（01~05高清PNG），全流程模拟真实人类行为防风控。"
---

# 抖音自动化发布草稿技能规范 (doudou-douyin)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现抖音创作者平台（Creator Studio）的自动化草稿发布流程。

---

## 📌 核心发布入口

- **发布文章入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=5`
- **发布图文入口**：`https://creator.douyin.com/creator-micro/content/upload?default-tab=3`

---

## 🎨 资产规范与路径映射（遵循 doudou-markdown-skill）

| 资产类型 | 规范路径 / 规则 | 说明 |
| :--- | :--- | :--- |
| **源 Markdown 文章** | `path/to/article_name.md` | 原始文章 |
| **长文标题** | `<= 30 字` | 自动清洗 Markdown 符号 |
| **图文标题** | `<= 20 字` | 自动清洗并截断为 20 字以内 |
| **长文内容摘要** | `<= 30 字` | 提取首段精炼摘要 |
| **图文作品描述** | `<= 1000 字` | 核心要点梳理 + `#话题标签` |
| **文章排版 HTML** | `path/to/article_name/[article_name]_排版_[theme].html` | 纯 `<section>` 排版正文（杜绝带复制栏的预览版） |
| **文章头图与封面图** | `path/to/article_name/xhs_images/images/01-cover.png` | 优先选用 `xhs_images/images/` 下第1张封面卡（如 `01-cover.png`），若不存在则降级选用 `cover/images/` |
| **图文信息图卡片集** | `path/to/article_name/xhs_images/images/` | 包含 `01-cover.png` ~ `05-summary.png` 全套卡片 |

---

## 🛡️ 防风控与人机行为模拟规约

1. **随机微延迟**：在表单聚焦、输入、点击之间插入 200ms ~ 600ms 随机延迟（`sleep(ms + Math.random() * 200)`）。
2. **原生事件派发**：文本输入必须触发 `input` 与 `change` 事件；富文本需调用 ProseMirror / TipTap 的 `onUpdate` 回调同步 React 状态。
3. **真实鼠标交互**：点击操作前先将元素 `scrollIntoView({ behavior: 'smooth' })`，派发 `mouseover`、`mouseenter` 再执行 `click`。
4. **确定性草稿保存**：全流程终点统一点击「**暂存离开**」，严禁误触直接「发布」。

---

## 🚀 双模态自动化发布执行流程

### 模式 A：发布图文草稿（Image-Text Post）

1. **导航页面**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload?default-tab=3`。
   - 若出现“是否继续编辑”提示且需上传全新图文，先点击「放弃」。
2. **真实文件上传**：
   - 解析目标文章目录下的 `xhs_images/images/`，获取全部真实 PNG 文件路径（`01-cover.png` ~ `05-summary.png`）。
   - 通过 `upload_file` 工具或派发 `DataTransfer` 至 `input[type="file"]`。
3. **进入编辑页与填充信息**：
   - 页面进入 `post/image` 后，填写标题（限制 20 字）至 `input[placeholder*="添加作品标题"]`。
   - 填写描述与话题至 `.zone-container.editor-kit-container`。
   - 检查右侧手机预览与「已添加5张图片」缩略图列表。
4. **暂存草稿**：
   - 视口平滑滚动后，悬停并点击「**暂存离开**」，保存至草稿箱。

---

### 模式 B：发布文章草稿（Long Article Post）

1. **导航页面**：
   - 访问 `https://creator.douyin.com/creator-micro/content/upload?default-tab=5`。
   - 点击「发文」进入 `post/article` 编辑页面。
2. **填充基础信息**：
   - 填写标题至 `input[placeholder*="请输入文章标题"]`（<= 30 字）。
   - 填写摘要至 `input[placeholder*="添加内容摘要"]`（<= 30 字）。
3. **正文富文本同步**：
   - 聚焦 `div.tiptap.ProseMirror`，执行 `pm.editor.commands.setContent(htmlContent, true)`。
   - 执行 `pm.editor.options.onUpdate({ editor: pm.editor })`，确保字数统计与 `long_article` 状态完全同步。
4. **上传头图与封面图**：
   - 点击文章头图（`.addIcon-Whrj6F`），拦截并注入 `>= 500px` 高清封面，点击弹窗「确定/完成」。
   - 点击封面设置（`.addIcon-WtgoEN`），拦截并注入高清封面，点击弹窗「确定/完成」。
5. **暂存草稿**：
   - 视口平滑滚动后，悬停并点击「**暂存离开**」，保存至草稿箱。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、提取长文/图文标题、摘要、话题、排版 HTML、高清封面及图文卡片集。
- [scripts/douyin_publisher.mjs](scripts/douyin_publisher.mjs)：文章与图文发布浏览器注入脚本生成器。
