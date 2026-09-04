---
name: doudou-shipinhao
description: "通过 chrome-devtools-mcp 实现微信视频号自动发布视频到草稿箱功能。支持根据用户指定的 Markdown 文章及其关联视频（video/*.mp4）与同名资产目录，真实上传 MP4 视频、智能提炼短标题（<=20字）与结构化换行干货描述（<=1000字），全流程模拟真实人类行为防风控，精准穿透微前端 iframe 并触发「保存草稿」安全存证。"
---

# 微信视频号自动化发布草稿技能规范 (doudou-shipinhao)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现微信视频号助手（Channels Platform）的自动化视频草稿发布流程。

---

## 📌 核心发布入口

- **视频号助手发表动态入口**：`https://channels.weixin.qq.com/platform/post/create`
- **内部微前端真实页面**：`https://channels.weixin.qq.com/micro/content/post/create`（同源内嵌于 `iframe[name="content"]`）

---

## 🎨 资产规范与路径映射

| 资产类型 | 规范路径 / 规则 | 说明 |
| :--- | :--- | :--- |
| **源 Markdown 文章** | `path/to/article_name.md` | 原始文章 |
| **视频成片文件** | `path/to/article_name/video/[video_name].mp4` 或 `[article_name].mp4` | 成品高清视频（优先识别 `video_manifest.json` 登记输出） |
| **视频作品短标题** | `<= 20 字`（严格截断） | 自动清洗 Markdown 符号与非规范标点，超长自动截断为 17 字 + `...`（共 20 字） |
| **视频作品描述** | `<= 1000 字` | 核心要点梳理，保留多行分段排版（换行 `<p>` 或 `<div>` 分段），严禁单行塌陷 |
| **标签处理约定** | `tags = []` | 遵循多平台发布技能合集规范，保持空数组 |

---

## 🛡️ 防风控与微前端交互规约

1. **微前端 iframe 穿透**：
   - 视频号助手采用微前端同源架构，表单核心控件位于主页面下的 `iframe[name="content"]`（`doc = iframe.contentDocument`）内。
   - 所有元素定位、表单注入及事件监听均需优先通过该内嵌文档执行。
2. **异步上传等待机制（核心）**：
   - 视频派发上传后，页面需要进行分片上传与视频初步转码校验。
   - 必须启动异步轮询等待（10~120秒），直到上传进度达到 100% 且视频预览播放器/封面帧就绪，严禁提前点击保存导致草稿截断。
3. **随机微延迟与视口滚动**：
   - 表单聚焦、输入、点击之间插入 200ms ~ 600ms 随机延迟（`sleep(ms + Math.random() * 200)`）。
   - 点击操作前先将元素 `scrollIntoView({ behavior: 'smooth', block: 'center' })`，并派发拟真鼠标事件。
4. **原生事件与 Vue 状态双向同步**：
   - 短标题输入框（`input.weui-desktop-form__input`）：设置 `value` 并派发 `input` 与 `change` 原生事件。
   - 视频描述富文本（`.input-editor[contenteditable="true"]`）：注入带换行的结构化富文本内容，并触发 Vue 内部的 `updateDescData` 或派发完整的 `input` 事件，确保其挂载的 `postStore.descData` 与描述字数统计实时同步。
5. **确定性草稿保存与存证**：
   - 全流程终点统一点击「**保存草稿**」（严禁触碰「发表」按钮）。
   - 确认草稿保存成功提示（如“保存成功”或进入草稿箱状态），并在目标目录截取存证截图（`shipinhao_video_draft_proof.png`）。
6. **发布完成后保留页面（严禁自动关闭）**：
   - 草稿保存与存证截图完成后，**严禁调用 `close_page` 或以任何方式关闭视频号助手页面**，必须原样保留页面现场，供用户人工复核草稿内容、补充扫码登录或手动确认发表。
   - 未登录、扫码验证、视频上传超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

---

## 🚀 视频发布执行流程

1. **导航至发布入口**：
   - 访问 `https://channels.weixin.qq.com/platform/post/create`。
   - 等待主框架及内嵌 `iframe[name="content"]` 加载完成。
2. **定位并派发视频上传**：
   - 解析目标文章目录下的 `video/` 目录，获取真实 `.mp4` 文件路径（如 `video_manifest.json` 指定的成片）。
   - 通过 `upload_file` 将视频文件派发至内嵌 `input[type="file"]`（`accept*="video/mp4"`）。
3. **轮询等待视频上传完毕**：
   - 异步监听视频上传完成标志（如进度条结束、生成视频缩略图预览、或「保存草稿」按钮解除 disabled 状态）。
4. **注入短标题与分段描述**：
   - 填入清洗后的短标题（<= 20 字）至短标题输入框并触发数据同步。
   - 填入多行结构化描述（<= 1000 字）至 `.input-editor`，确保每行分段清晰无挤压。
5. **暂存草稿与存证**：
   - 检查「保存草稿」按钮状态，执行拟真点击。
   - 截图保存至目标文章同名目录：`shipinhao_video_draft_proof.png`。
   - 验证草稿成功保存。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录）：

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、定位视频成片（.mp4）、提取规范短标题（<= 20 字）、结构化多行描述（<= 1000 字），`tags` 保持 `[]`。
- [scripts/shipinhao_publisher.mjs](scripts/shipinhao_publisher.mjs)：生成视频号自动化发布浏览器脚本（含 iframe 穿透、异步就绪轮询、Vue 状态同步与草稿保存）。
