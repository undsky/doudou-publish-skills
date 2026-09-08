---
name: doudou-zhihu
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章自动发布到知乎专栏草稿箱（https://zhuanlan.zhihu.com/write）。支持真实人工行为模拟、防风控时延与事件派发、智能封面提取（兼容产物同名目录与 cdn_manifest.json）、知乎 Draft.js 剪贴板富文本注入、官方 UploadPicture 通道封面上传、知乎高频话题搜索匹配以及草稿自动保存状态验证。
---

# 知乎专栏文章自动发布到草稿技能 (doudou-zhihu)

本技能通过 `chrome-devtools-mcp` 控制浏览器，将用户指定的本地 Markdown 文件发布至**知乎专栏创作者编辑器（https://zhuanlan.zhihu.com/write ）的草稿箱**。

技能严格遵循**真实人工行为模拟与防风控规约**，通过自然的事件派发、微小随机时延抖动、视口平滑滚动及悬停交互，避免被知乎平台风控拦截。自动提取文章标题、摘要、知乎官方话题、CDN 版 Markdown 正文以及宽屏封面图。

---

## 核心规约与防风控原则

1. **草稿安全隔离（绝对底线）**：
   - **严格限定仅保存到草稿箱**，绝对不点击最终「发布」确认按钮，确保所有内容必须经人工最终确认后再公开发布。
   - 知乎编辑器具有实时自动同步草稿机制，文章在完成标题、正文、封面与话题设置后，等待 2.5~3.5 秒即可完成云端草稿同步。
2. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
3. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。
4. **防风控与真实人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加正态分布随机等待（输入前 300~600ms、步骤间 600~1500ms、点击悬停 300~500ms），严禁毫秒级突发调用。
   - **真实事件完整性**：对于表单输入，依次派发 `focus`、`keydown`、`input`、`keyup`、`change`、`blur`，并使用 React 原生 Property Setter 同步受控组件状态。
   - **平滑视口滚动**：模拟人类自上而下的视觉审查，分步平滑滚动页面触发浏览器的视口可见性检测。
   - **拟真悬停与点击**：点击按钮前先将视口滚动到按钮可见区域，派发 `mouseover`/`mouseenter` 悬停 300~500ms 后再触发 `click`。
5. **资产自动解析优先级**：
   - **正文**：优先使用同名目录下已将本地图片替换为图床 URL 的 `[article_name]_cdn.md`；若无则使用原 Markdown 文件。
   - **封面图**：
     1. 优先读取同名目录下 `cdn_manifest.json` 中 `type: "cover"` 的条目（优先 2.35:1 宽屏主封面、16:9 封面、1:1 方形封面，本地文件存在时优先读取 Base64 免疫浏览器跨域）；
     2. 其次读取同名目录下 `cover/images/` 的本地图片文件（如 `cover-main-2.35x1.png`、`cover-16x9.png`、`cover-square-1x1.png`）；
     3. 再次读取同名目录下 `xhs_images/images/` 的第一张封面卡片（如 `01-cover.png`）；
     4. 再次从 Markdown 正文前 10 行或任意位置提取第一张网络图片链接或本地图片路径；
     5. 若均无则跳过封面设置。
   - **摘要**：提炼 80~150 字纯文本摘要。
   - **知乎话题**：依据文章内容智能推断 1~3 个知乎官方高频话题（如「人工智能」、「智能体」、「AI 编程」、「Docker」、「程序员」等）并搜索绑定。
6. **发布完成后保留页面（严禁自动关闭）**：
   - 草稿保存与存证截图完成后，**严禁调用 `close_page` 或以任何方式关闭当前平台页面**，必须原样保留页面现场，供用户人工复核草稿内容、补充登录或手动确认发布。
   - 未登录、验证码拦截、网络超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

---

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | URL 匹配 /p/\d+/edit |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `success` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const m = location.pathname.match(/\/p\/(\d+)\/edit/);
  const saved = /已保存|保存成功/.test(document.body.innerText);
  return { passed: Boolean(m), draftId: m?.[1] ?? null, draftUrl: m ? location.href : null, savedTip: saved };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过 |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（知乎不适用） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/zhihu_article.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `article`）：

```json
{
  "skill": "doudou-zhihu",
  "platform": "知乎",
  "platformSlug": "zhihu",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "article",
      "modeDesc": "图文长文",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/zhihu_article.png",
      "assertion": { "rule": "URL 匹配 /p/\\d+/edit", "passed": true }
    }
  ]
}
```

脚本会强校验并拒绝不合规回执：非终态 `status`、缺 `statusText`、非 `skipped` 却缺 `screenshot` 一律报错退出，从源头杜绝脏数据流入看板。

---

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径时，依次执行以下极简阶段（严格遵循文章仅标题、正文、封面三要素）：

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 资产与封面] --> S1[步骤 1: 打开/聚焦知乎写文章页并检测登录态]
    S1 --> S2[步骤 2: 拟真人机输入文章标题]
    S2 --> S3[步骤 3: 注入富文本并触发 Draft.js 剪贴板渲染]
    S3 --> S4[步骤 4: 模拟自然视口平滑滚动检查排版]
    S4 --> S5[步骤 5: 官方通道上传并绑定文章封面]
    S5 --> S6[步骤 6: 等待草稿自动同步并截屏存证]
```

### 步骤 0：解析 Markdown 资产、封面与话题

运行辅助解析脚本提取元数据：

```bash
node scripts/parser.mjs <Markdown文件绝对路径>
```

输出包含：

- `title`: 文章标题（自动清洗 Markdown 符号）
- `summary`: 80~150 字纯文本摘要
- `topics`: 智能推断的知乎话题关键词数组
- `bodyContent`: 过滤掉首行重复 H1 后的 Markdown 正文（优先使用 `_cdn.md`）
- `htmlContent`: 适配知乎 Draft.js 剪贴板规范的富文本 HTML
- `cover`: 封面图信息（CDN URL 或 Local Base64）

---

### 步骤 1：打开/聚焦知乎写文章页并检测登录态

1. **新建独立页面**：调用 `new_page` 打开 `https://zhuanlan.zhihu.com/write`（必须每次新建独立页面，严禁复用或覆盖已有页面）。
2. 等待页面加载完成。
3. 执行脚本检测登录态：
   - 检查是否存在标题输入框 `textarea[placeholder*="请输入标题"]` 及编辑器容器 `.notranslate.public-DraftEditor-content`；
   - 若未登录，向用户发出明确提示请用户在浏览器中扫码登录，并在登录完成后继续。
4. 自动检测并确认关闭可能弹出的干扰对话框（如破解复制插件提示「仍要继续」）。

---

### 步骤 2：拟真人机输入文章标题

1. 聚焦标题输入框 `textarea[placeholder*="请输入标题"]`。
2. 模拟微小随机延迟（300ms~600ms）。
3. 使用 React 原生 property setter 设置标题值，并派发 `input` 与 `change` 事件：

```javascript
const titleTextarea = document.querySelector(
  '.WriteIndex-titleInput textarea, textarea[placeholder*="请输入标题"]',
);
if (titleTextarea) {
  titleTextarea.focus();
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  setter.call(titleTextarea, articleTitle);
  titleTextarea.dispatchEvent(new Event("input", { bubbles: true }));
  titleTextarea.dispatchEvent(new Event("change", { bubbles: true }));
  titleTextarea.blur();
}
```

4. 随机停顿 500ms~900ms。

---

### 步骤 3：注入富文本并触发 Draft.js 剪贴板渲染

知乎专栏采用 Facebook Draft.js 富文本编辑器体系：

1. 聚焦编辑器容器 `.notranslate.public-DraftEditor-content`；
2. 构造包含 `text/html` 和 `text/plain` 格式的 `DataTransfer` 剪贴板对象；
3. 派发真实的 `paste` 剪贴板事件，触发知乎词法分析器构建 ContentState（自动生成标题、加粗、列表、代码块、引用与图片等）：

```javascript
const editorEl = document.querySelector(
  ".notranslate.public-DraftEditor-content",
);
if (editorEl) {
  editorEl.focus();
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/html", htmlContent);
  dataTransfer.setData("text/plain", bodyContent);
  const pasteEvent = new ClipboardEvent("paste", {
    clipboardData: dataTransfer,
    bubbles: true,
    cancelable: true,
  });
  editorEl.dispatchEvent(pasteEvent);
}
```

4. 随机停顿 1200ms~2000ms，让编辑器完成富文本与图片语法树构建与渲染。

---

### 步骤 4：模拟自然视口平滑滚动检查排版

模拟人类作者自上而下检查文章排版：

1. 平滑滚动到页面 450px 处，等待 600ms~900ms；
2. 平滑滚动回顶部，等待 500ms~800ms：

```javascript
window.scrollTo({ top: 450, behavior: "smooth" });
// 延时后
window.scrollTo({ top: 0, behavior: "smooth" });
```

---

### 步骤 5：官方通道上传并绑定文章封面

若存在封面图资产（CDN URL 或本地 Base64）：

1. 在浏览器端将图片转换为 `File` 对象（`new File([blob], 'cover.png', { type: blob.type })`）；
2. 获取知乎官方封面上传输入组件 `input.UploadPicture-input` 上的 React Props；
3. 调用 `props.onChange({ target: { files: [file] } })` 触发官方通道上传与绑定；
4. 监听封面状态由「添加文章封面」变更为「更换 / 删除」；
5. 随机停顿 600ms~1000ms。

---

### 步骤 6：等待草稿自动同步并截屏存证

1. **安全隔离核心规约**：知乎写文章具备实时自动同步草稿机制，**严禁打开发布设置或搜索添加话题，严禁点击最终「发布」确认按钮**，只保存到草稿箱。
2. 轮询完成断言（1.5s 间隔，最长 45s）确认知乎已完成云端草稿存储；
3. 捕获页面底部或顶部的草稿保存状态文字（如 `刚刚 · 草稿`，字数统计等）；
4. 调用 `take_screenshot` 保存当前页面截图作为存证（`publishes/screenshots/zhihu_article.png`）。

---

## 异常与风控处理

| 异常场景                | 表现特征                                            | 应对与恢复策略                                                               |
| :---------------------- | :-------------------------------------------------- | :--------------------------------------------------------------------------- |
| **未登录 / 登录态过期** | 未找到 `.public-DraftEditor-content` 或跳转至登录页 | 立即停止自动化输入，向用户发送提示，等待用户在浏览器中完成扫码登录后再继续。 |
| **插件提示弹窗拦截**    | 弹出「温馨提示：检测到您安装了某些破解复制插件...」 | 自动检测并点击「仍要继续」按钮关闭弹窗，恢复正常编辑。                       |
| **封面上传失败 / 超时** | 图片拉取超时或格式不兼容                            | 降级跳过封面上传，在最终报告中标记，不阻塞草稿主体的保存。                   |
| **话题搜索无精确匹配**  | 搜索未返回预期的完全匹配项                          | 自动选用首项候选话题，或降级为默认「人工智能」话题。                         |
| **发布设置抽屉未展开**  | 点击后未弹出抽屉                                    | 自动降级为保留主编辑区内容与封面，保证文章主体内容草稿不丢失。               |

---

## 脚本工具与使用方法

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- `scripts/parser.mjs`：解析 Markdown，提取标题、摘要、话题、封面资产与 Draft.js 剪贴板富文本 HTML。
- `scripts/zhihu_publisher.mjs`：浏览器注入脚本生成器（Draft.js 状态注入、话题搜索绑定、防风控人机模拟）。

1. **直接运行 Node.js 脚本测试解析**：

```bash
node scripts/parser.mjs <Markdown文件路径>
```

2. **在 Agent 中配合 `chrome-devtools-mcp` 调用**：

```javascript
import { buildBrowserPublishScript } from "./scripts/zhihu_publisher.mjs";

// 1. 生成自包含执行代码
const code = buildBrowserPublishScript(markdownFilePath);

// 2. 调用 evaluate_script 在知乎写文章页面执行
const result = await evaluate_script({
  pageId: targetPageId,
  function: code,
});

// 3. 截屏存证
await take_screenshot({ pageId: targetPageId });
```
