---
name: doudou-csdn
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章自动发布到 CSDN 博客草稿箱（https://editor.csdn.net/md）。支持真实人工行为模拟、防风控时延与事件派发、智能封面提取（兼容 doudou-markdown 产物同名目录与 cdn_manifest.json）、原生 Markdown 文件流与 DOM 注入、分类专栏勾选、Mark-Selection 技术标签匹配、官方 CoverImage 封面绑定以及草稿保存状态存证。
---

# CSDN 博客文章自动发布到草稿技能 (doudou-csdn)

本技能通过 `chrome-devtools-mcp` 控制浏览器，将用户指定的本地 Markdown 文件发布至 **CSDN 博客创作者编辑器（https://editor.csdn.net/md ）的草稿箱**。

技能严格遵循**真实人工行为模拟与防风控规约**，通过自然的事件派发、微小随机时延抖动、视口平滑滚动及悬停交互，避免被平台风控拦截。同时与 `doudou-markdown-skill` 资产体系无缝集成，自动提取文章标题、摘要、分类专栏、技术标签、CDN 版 Markdown 正文以及宽屏封面图。

---

## 核心规约与防风控原则

1. **草稿安全隔离**：
   - **严格限定仅点击「保存为草稿」/「保存草稿」按钮**，绝对不点击「发布文章」，确保所有内容必须经人工最终确认后再公开发布。
2. **防风控与真实人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加正态分布随机等待（输入前 300~600ms、步骤间 600~1500ms、点击悬停 300~500ms），严禁毫秒级并发。
   - **真实事件完整性**：对于表单与文本输入，依次派发 `focus`、`keydown`、`input`、`keyup`、`change`、`blur`，并同步 Element-UI 与 Vue 组件实例数据。
   - **平滑视口滚动**：模拟人类自上而下的视觉审查，分步平滑滚动页面触发浏览器的视口可见性检测。
   - **拟真悬停与点击**：点击按钮前先将视口滚动到按钮可见区域，派发 `mouseover`/`mouseenter` 悬停 300~500ms 后再触发 `click`。
3. **资产自动解析优先级**（参考 `doudou-markdown-skill` 规约）：
   - **正文**：优先使用同名目录下已将本地图片替换为图床 URL 的 `[article_name]_cdn.md`；若无则使用原 Markdown 文件。
   - **封面图**：
     1. 优先读取同名目录下 `cdn_manifest.json` 中 `type: "cover"` 的 CDN 链接（优先 2.35:1 / 16:9 / 1:1 封面）；
     2. 其次读取同名目录下 `cover/images/` 的本地图片文件（如 `cover-main-2.35x1.png`、`cover-square-1x1.png`）；
     3. 再次从 Markdown 正文中提取第一张图片链接或本地路径；
     4. 若均无则跳过封面设置。
   - **摘要**：提炼 80~200 字纯文本摘要（CSDN 限制 256 字以内）。
   - **分类专栏与标签**：依据文章内容智能推断分类专栏（如「AI编程」、「AI工具箱」、「n8n教程」、「Dify」等），并匹配 1~5 个官方技术标签（如「AI编程」、「人工智能」、「智能体」、「架构」等）。

---

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径（例如 `mds/AICoding/ddagent.md`）时，依次执行以下 9 个阶段：

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 资产与封面] --> S1[步骤 1: 打开/聚焦发布页并检测登录态]
    S1 --> S2[步骤 2: 注入 Markdown 并触发词法分析]
    S2 --> S3[步骤 3: 拟真人机输入并校准文章标题]
    S3 --> S4[步骤 4: 模拟自然视口滚动检查排版]
    S4 --> S5[步骤 5: 拟真点击「发布文章」打开发布设置抽屉]
    S5 --> S6[步骤 6: 拟真配置文章标签与分类专栏]
    S6 --> S7[步骤 7: 绑定/上传文章封面]
    S7 --> S8[步骤 8: 填写文章摘要并点击「保存为草稿」]
    S8 --> S9[步骤 9: 捕获保存状态与 Article ID 截屏存证]
```

### 步骤 0：解析 Markdown 资产与封面

运行辅助解析脚本提取元数据（脚本路径相对本技能目录，即 `SKILL.md` 所在目录）：
```bash
node scripts/parser.mjs <Markdown文件绝对路径>
```
输出包含：
- `title`: 文章标题（自动清洗 Markdown 符号）
- `summary`: 80~200 字纯文本摘要
- `categoryColumn`: 智能推断匹配的 CSDN 分类专栏（AI编程、AI工具箱、n8n教程等）
- `tags`: 1~5 个技术标签关键词
- `bodyContent`: 过滤掉首行重复 H1 后的 Markdown 正文（优先使用 `_cdn.md`）
- `cover`: 封面图信息（CDN URL 或 Local Base64）

---

### 步骤 1：打开/聚焦发布页并检测登录态

1. 调用 `list_pages` 检查是否已有 CSDN 编辑器页面（URL 包含 `editor.csdn.net/md`）。
   - 若已有，调用 `select_page` 切换到该页面；
   - 若无，调用 `new_page` 打开 `https://editor.csdn.net/md/`。
2. 等待页面加载完成。
3. 执行脚本检测登录态：
   - 检查是否存在标题输入框 `input.article-bar__title` 及编辑器内容区 `.editor__inner`；
   - 若未登录，向用户发出明确提示请用户在浏览器中扫码登录，并在登录完成后继续。

---

### 步骤 2：注入 Markdown 并触发词法分析

CSDN Markdown 编辑器支持通过原生文件导入组件 `#import-markdown-file-input` 进行精准解析：
1. 构造标准 Markdown `File` 与 `DataTransfer` 对象；
2. 注入 `#import-markdown-file-input` 并派发 `change` 事件触发词法树构建；
3. 随机停顿 800ms~1500ms，让编辑器完成 Markdown 语法树分析、代码高亮与右侧实时预览。

---

### 步骤 3：拟真人机输入并校准文章标题

1. 聚焦标题输入框 `input.article-bar__title`；
2. 模拟微小随机延迟（300ms~600ms）；
3. 填入文章完整标题，派发 `input` 与 `change` 事件；
4. 随机停顿 400ms~800ms。

---

### 步骤 4：模拟自然视口滚动检查排版

模拟人类作者自上而下检查文章排版：
1. 平滑滚动到页面 500px 处，等待 600ms~900ms；
2. 平滑滚动回顶部，等待 500ms~800ms：
```javascript
window.scrollTo({ top: 500, behavior: 'smooth' });
// 延时后
window.scrollTo({ top: 0, behavior: 'smooth' });
```

---

### 步骤 5：拟真点击「发布文章」打开发布设置面板

1. 寻找顶部「发布文章」按钮 `.btn-publish`；
2. 视口滚动至按钮可见区域，派发 `mouseover`/`mouseenter` 悬停 300~500ms 后点击：
   `publishBtn.click();`
3. 随机停顿 1000ms~1600ms，等待 `.modal__publish-article` 抽屉面板展开。

---

### 步骤 6：拟真配置文章标签与分类专栏

在展开的发布面板中：
1. **文章标签**：
   - 点击 `.tag__btn-tag` 打开标签输入/选择区；
   - 获取 `mark-selection` Vue 组件实例 `msVue`，依次调用 `msVue.handleSelect({ value: tag })` 添加 1~5 个技术标签；
   - 备用方案：在 `input[placeholder*="请输入文字搜索"]` 中输入并回车。
2. **分类专栏**：
   - 在 `.form-entry` 中查找分类专栏列表；
   - 找到匹配的专栏项（如「AI编程」），派发 hover 并点击选中复选框。
3. 随机停顿 400ms~800ms。

---

### 步骤 7：绑定/上传文章封面

若存在封面图资产：
1. 在 `.modal__publish-article` 内定位 `CoverImage` Vue 组件与 `input[type="file"].el-upload__input`；
2. 若为本地图片：转换 Base64 为 `File` 对象注入 `fileInput` 触发官方上传；
3. 若为 CDN 链接：直接赋值 `coverComp.currentImg = coverUrl` 完成即时绑定；
4. 随机停顿 600ms~1200ms。

---

### 步骤 8：填写文章摘要并安全点击「保存为草稿」

1. 聚焦摘要输入框 `textarea.el-textarea__inner` 填入精炼摘要（256 字以内），派发 `input` 与 `change` 事件；
2. **安全隔离核心操作**：
   - 寻找面板底部的「保存为草稿」按钮（`button.btn-b-normal.ml16`）；
   - 视口滚动并派发 `mouseover`/`mouseenter` 悬停 400~700ms；
   - 点击「保存为草稿」，**严格避免触碰「发布文章」红钮**；
3. 等待 3 秒让 CSDN 完成云端草稿存储；
4. 点击「取消」或关闭按钮退出弹窗。

---

### 步骤 9：捕获保存状态与 Article ID 截屏存证

1. 从当前 URL 中提取保存后的 `articleId`（`https://editor.csdn.net/md?articleId=<article_id>`）；
2. 调用 `take_screenshot` 保存当前页面截图作为存证；
3. 输出结构化结果报告（文章标题、草稿 ID、专栏、标签、摘要、封面状态、操作日志）。

---

## 异常与风控处理

| 异常场景 | 表现特征 | 应对与恢复策略 |
| :--- | :--- | :--- |
| **未登录 / 登录态过期** | 未找到 `.editor__inner` 或跳转至登录页 | 立即停止自动化输入，向用户发送提示，等待用户在浏览器中完成扫码登录后再继续。 |
| **发布面板未展开** | 点击 `.btn-publish` 后未出现 `.modal__publish-article` | 自动降级为直接在主编辑区点击顶部「保存草稿」按钮，保证文章主体内容不丢失。 |
| **封面上传失败 / 超时** | 图片拉取超时或格式不兼容 | 降级通过 CDN URL 绑定或跳过封面上传，在最终报告中标记，不阻塞草稿主体的保存。 |
| **专栏无完全匹配项** | 分类专栏列表中未找到推断的专栏名 | 保持默认或跳过专栏勾选，不影响草稿保存。 |
| **防重复保存拦截** | 保存按钮处于 loading 状态 | 确保调用间隔大于 3 秒，避免高频连击。 |

---

## 脚本工具与使用方法

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- `scripts/parser.mjs`：解析 Markdown，提取标题、摘要、分类专栏、标签、正文与封面资产。
- `scripts/csdn_publisher.mjs`：浏览器注入脚本生成器（Markdown 编辑器状态同步与防风控人机模拟）。

1. **直接运行 Node.js 脚本测试解析**：
```bash
node scripts/parser.mjs <Markdown文件路径>
```

2. **在 Agent 中配合 `chrome-devtools-mcp` 调用**：
```javascript
import { buildBrowserPublishScript } from './scripts/csdn_publisher.mjs';

// 1. 生成自包含执行代码
const code = buildBrowserPublishScript(markdownFilePath);

// 2. 调用 evaluate_script 在 CSDN 发布页执行
const result = await evaluate_script({
  pageId: targetPageId,
  function: code
});

// 3. 截屏存证
await take_screenshot({ pageId: targetPageId });
```
