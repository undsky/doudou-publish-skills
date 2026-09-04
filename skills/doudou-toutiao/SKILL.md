---
name: doudou-toutiao
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及关联视频（video/*.mp4）自动发布到今日头条/头条号创作者平台草稿箱（文章：https://mp.toutiao.com/profile_v4/graphic/publish ，视频：https://mp.toutiao.com/profile_v4/xigua/upload-video ）。严格遵循真实人工行为模拟与防风控规约（微随机时延抖动、全链路 DOM 事件派发、ProseMirror/Sylph 富文本双向同步、视口平滑滚动排版审阅、异步上传转码就绪等待、抽屉式封面真实上传与弹窗确认），智能解析同名资产目录与 CDN 映射表，支持草稿保存状态验证与存证。
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

## 🎨 资产规范与路径映射

| 资产类型 | 规范路径 / 规则 | 说明 |
| :--- | :--- | :--- |
| **源 Markdown 文章** | `path/to/article_name.md` | 原始文章 |
| **视频成片文件** | `path/to/article_name/video/[video_name].mp4` 或 `[article_name].mp4` | 成品高清视频（优先识别 `video_manifest.json` 登记输出） |
| **视频作品标题** | `<= 30 字`（严格截断） | 自动清洗 Markdown 符号与非规范标点，优先适配 manifestTitle，限制 5~30 字以内 |
| **视频作品描述/简介** | `<= 1000 字` | 核心要点梳理，保留多行分段排版（换行分段），严禁单行塌陷 |
| **长文文章标题** | `<= 30 字`（严格截断） | 限制 2～30 字以内，自动清洗 Markdown 符号（`#`、`**` 等）并智能截断 |
| **长文内容摘要** | `<= 100 字` | 提取首段精炼摘要，超长自动截断 |
| **文章排版 HTML** | `path/to/article_name/[article_name]_cdn.md` | 纯排版正文，依据 `cdn_manifest.json` 替换为 Cloudflare R2 公开 CDN 链接 |
| **文章封面图** | `path/to/article_name/cover/images/` | 优先读取 `xhs_images/images/01-cover.png` 或 `cover/images/` 下宽屏封面 |
| **标签处理约定** | `tags = []` | 遵循全平台发布技能统一规范，保持空数组 |

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

---

## 🚀 双模态自动化发布执行流程

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
   - 平滑滚动至页面底部，等待校验呈现「草稿已保存」，在草稿箱页面截图存证（`toutiao_draft_proof.png`）。

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
   - 严格遵循安全合规原则（不点击直接发布按钮），截取当前就绪状态截图保存至 `toutiao_video_draft_proof.png`。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录）：

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、定位视频成片（.mp4）/长文标题（防超长截断）、摘要、排版 HTML、高清封面及视频描述，`tags` 保持 `[]`。
- [scripts/toutiao_publisher.mjs](scripts/toutiao_publisher.mjs)：浏览器注入脚本生成器（涵盖长文图文 Sylph/ProseMirror 状态双向同步与视频上传就绪核验脚本）。
