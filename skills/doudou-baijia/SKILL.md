---
name: doudou-baijia
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及衍生资产自动发布到百家号创作者平台图文草稿箱（https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1 ）。严格遵循真实人工行为模拟与防风控规约（微随机时延抖动、全链路 DOM 事件派发、百家号 UEditor/Lexical 富文本状态双向同步、视口平滑滚动排版审阅、拟真封面上传与裁切确认），智能解析同名资产目录与 CDN 映射表，支持草稿保存状态验证与存证。
---

# 百家号图文文章自动发布到草稿箱技能 (doudou-baijia)

本技能通过 `chrome-devtools-mcp` 控制浏览器，将用户指定的本地 Markdown 文章及其衍生资产安全发布至**百家号创作者平台（https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1 ）的图文草稿箱**。

技能严格遵循**真实人工行为模拟与防风控规约**，通过自然的事件派发、微小随机时延抖动、百家号 UEditor / Lexical 富文本双向状态同步、视口平滑滚动排版审阅及弹窗式封面真实上传与裁切确认，避免被平台风控拦截。自动提取文章标题、摘要、标签、带 CDN 高清配图的排版正文以及单图/宽屏封面。

---

## 核心规约与防风控原则

1. **草稿安全隔离**：
   - **严格限定仅保存为草稿**（点击「存草稿」按钮，捕获「内容已存入草稿」通知并在 URL 中提取 `article_id`），**绝对不点击「发布」或「定时发布」**，确保所有内容必须经人工最终审核后再公开发布。
2. **防风控与真实人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加正态分布随机等待（输入前 200~400ms、步骤间 400~1000ms、点击悬停 200~400ms），严禁毫秒级瞬时操作。
   - **真实事件完整性**：对于标题输入与表单交互，依次派发 `mouseover`、`mouseenter`、`mousedown`、`mouseup`、`click`、`focus`、`input`、`change`、`blur`，并同步底层 React / UEditor 状态。
   - **百家号 UEditor / Lexical 富文本注入**：调用 `window.editor.setContent(meta.htmlContent)` 注入标准 HTML，自动触发平台 `data-diagnose-id` 诊断与字数统计，完整保留标题、代码块、加粗、引用、列表及 CDN 配图。
   - **平滑视口滚动**：模拟人类自上而下的视觉审阅，分步平滑滚动页面触发浏览器的视口可见性检测。
   - **拟真悬停与点击**：点击元素前先将其 `scrollIntoView({ behavior: 'smooth' })`，派发 `mouseover`、`mouseenter` 悬停后再触发 `click`。
3. **正文内容忠实度保障 (Content Fidelity)**：
   - 注入正文必须直接来自 `parser.mjs` / `resolveArticleHtml` 转换的完整语义 HTML，100% 保留文章中的所有小标题、对比表格、代码块、引用块、有序/无序列表以及末尾的「引用链接」模块，**严禁模型二次脑补、扩写或擅自修改正文结构**。
4. **资产自动解析优先级**：
   - **文章标题**：限制 2～64 字以内（百家号官方限制 2~64 字），自动清洗 Markdown 符号（`#`、`**` 等）并智能截断。
   - **文章正文**：优先读取同名目录下 `[article_name]_cdn.md`（或依据 `cdn_manifest.json` 将本地图片无缝替换为 Cloudflare R2 公开 CDN 链接），转换为带有高清配图的标准语义 HTML。
   - **文章封面**（严格遵循 `baoyu-cover-image` 规约）：
     1. 优先读取同名目录下 `cover/images/` 的本地封面（优先 `cover-main-2.35x1.png` 宽屏主封面、`cover-16x9.png`、`cover-square-1x1.png`）；
     2. 其次读取同名目录下 `cdn_manifest.json` 中 `type: "cover"` 的 CDN 条目；
     3. 再次读取同名目录下 `xhs_images/images/` 下第 1 张封面卡片（如 `01-cover.png`）；
     4. 若均无则跳过封面设置。

---

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径（例如 `mds/AICoding/ddagent.md`）时，依次执行以下流程：

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 资产与封面] --> S1[步骤 1: 打开/聚焦百家号图文发文页并检测登录态]
    S1 --> S2[步骤 2: 拟真人机输入并校准文章标题 2~64字]
    S2 --> S3[步骤 3: 注入 UEditor 富文本正文并同步诊断ID]
    S3 --> S4[步骤 4: 模拟视口平滑滚动排版审阅]
    S4 --> S5[步骤 5: 激活封面插槽、上传 File 并完成裁切弹窗确认]
    S5 --> S6[步骤 6: 滚动至底部并点击「存草稿」按钮]
    S6 --> S7[步骤 7: 捕获「内容已存入草稿」与 article_id 截屏存证]
```

---

### 步骤 0：解析 Markdown 资产与封面

运行辅助解析脚本提取元数据（脚本路径相对本技能目录，即 `SKILL.md` 所在目录）：
```bash
node scripts/parser.mjs <Markdown文件绝对路径>
```
输出包含：
- `articleTitle`: 清洗并规范至 2~64 字以内的文章标题
- `articleSummary`: 100 字以内纯文本摘要
- `tags`: 智能匹配的话题标签数组（最多 4 个）
- `articleHtml`: 包含 CDN 图片、标题、引用与列表的语义 HTML
- `cover`: 高清封面图（Base64 与本地路径）

---

### 步骤 1：打开/聚焦发文页并检测登录态

1. 调用 `list_pages` 检查是否已有百家号图文发文页面（URL 包含 `baijiahao.baidu.com/builder/rc/edit`）。
   - 若已有，调用 `select_page` 切换到该页面；
   - 若无，调用 `new_page` 打开 `https://baijiahao.baidu.com/builder/rc/edit?type=news&is_from_cms=1`。
2. 检测登录态：
   - 检查页面是否存在标题输入框 `[data-testid="news-title-input"]` 与编辑器实例 `window.editor`；
   - 若被重定向至登录页，向用户发出明确提示请用户在浏览器中扫码登录后再继续。

---

### 步骤 2：拟真人机输入文章标题

1. 定位 `[data-testid="news-title-input"] [contenteditable="true"]`；
2. 视口滚动并聚焦，派发 `focus` 事件；
3. 模拟微小随机延迟（200ms~400ms）；
4. 调用 `window.editor.__bjh_news_setTitle(meta.title)` 深度绑定百家号标题状态；
5. 依次派发 `input`、`change`、`blur` 事件。

---

### 步骤 3：注入百家号 UEditor 富文本正文

1. 调用 `window.editor.setContent(meta.htmlContent)` 注入带有 CDN 图片和代码块的标准富文本；
2. 调用 `window.editor.sync()` 同步编辑状态；
3. 随机停顿 800ms~1200ms 让 UEditor 完成节点渲染、字数统计与 `data-diagnose-id` 分配。

---

### 步骤 4：模拟人工视口平滑滚动

1. 平滑滚动到页面 400px，停顿 500ms~800ms；
2. 平滑滚动到页面 900px，停顿 500ms~800ms；
3. 平滑滚动回顶部，停顿 300ms~500ms。

---

### 步骤 5：封面插槽点击、上传与裁切确认

若存在封面图资产：
1. 定位展示封面区域的插槽 `.FeEditorApp-_73a3a52aab7e3a36-content` 或 `.FeEditorApp-_93c3fe2a3121c388-item`；
2. 拟真悬停并触发 React `onClick` 弹出上传选择框；
3. 将封面 Base64 构造成标准 `File` 对象，通过 `DataTransfer` 注入上传 input（`input[name="media"][type="file"]`）；
4. 触发 input 的 React `onChange` 事件并派发 `change`；
5. 等待 1500ms~2000ms 裁切弹窗（`.cheetah-modal`）出现，拟真悬停并点击「确定 (1)」按钮；
6. 检查封面插槽确认封面图片已渲染呈现。

---

### 步骤 6：点击「存草稿」并捕获保存状态

1. 平滑滚动至页面底部按钮区域；
2. 定位包含「存草稿」文本的按钮；
3. 拟真派发 `mouseover`、`mousedown`、`mouseup`、`click` 点击「存草稿」；
4. 等待 2500ms~3500ms；
5. 读取 `.cheetah-message` 浮层通知，校验是否出现「内容已存入草稿」，并从 `location.href` 中提取分配的 `article_id`；
6. 严禁触碰「发布」或「定时发布」按钮。

---

### 步骤 7：截屏存证与交付报告

1. 调用 `take_screenshot` 保存草稿保存成功的浏览器画面作为执行存证；
2. 向用户呈递包含文章标题、字数、封面状态、`article_id` 及草稿存证的结构化报告。

---

## 异常与风控处理

| 异常场景 | 表现特征 | 应对与恢复策略 |
| :--- | :--- | :--- |
| **未登录 / 登录态失效** | 跳转至登录页或未找到标题框与 `window.editor` | 立即暂停自动化流程，向用户发出提示请在浏览器中扫码登录，登录完成后继续。 |
| **标题超长拦截** | 提示“标题限制2~64个字” | 解析器已自动对标题执行 64 字强截断，确保 100% 符合平台规则。 |
| **封面上传弹窗未展开** | 点击封面插槽无响应 | 深度遍历触发父子节点的 React `onClick` 事件，或跳过封面上传，在报告中明确提示，不阻塞草稿主体的保存。 |
| **UEditor 注入失败** | `window.editor` 未找到或未渲染 | 自动降级为操作 iframe (`#ueditor_0`) 的 `contentDocument.body`。 |
| **保存延迟** | 未及时捕获到 Toast 通知 | 额外增加 3 秒轮询等待，检查 URL 是否已带有 `article_id` 参数。 |

---

## 脚本工具与在 Agent 中的调用方法

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- `scripts/parser.mjs`：解析 Markdown，提取标题、摘要、话题标签、语义 HTML 与封面资产。
- `scripts/baijia_publisher.mjs`：浏览器注入脚本生成器（编辑器状态同步与防风控人机模拟）。

### 1. 运行命令行测试

```bash
# 1. 测试资产解析
node scripts/parser.mjs <Markdown文件路径>

# 2. 测试浏览器代码生成
node scripts/baijia_publisher.mjs <Markdown文件路径>
```

### 2. 在 Agent 中配合 `chrome-devtools-mcp` 调用

```javascript
import { parseAllAssets } from './scripts/parser.mjs';
import { buildPublishBrowserScript } from './scripts/baijia_publisher.mjs';

// 1. 解析目标 Markdown 及其同名资产目录
const meta = parseAllAssets(markdownFilePath);

// 2. 生成自包含浏览器执行代码
const code = buildPublishBrowserScript(meta);

// 3. 在百家号发文页执行
const result = await evaluate_script({
  pageId: publishPageId,
  function: code
});

// 4. 截屏存证
await take_screenshot({ pageId: publishPageId });
```
