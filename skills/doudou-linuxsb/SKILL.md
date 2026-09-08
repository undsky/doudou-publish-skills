---
name: doudou-linuxsb
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章自动填入烧饼社区发帖页（https://linux.sb/topic_edit?fid=4）。支持真实人工行为模拟、防风控时延与事件派发、社区规范发帖弹窗自动确认、智能版块选择（技术交流/资源分享/福利放送等）、CDN 正文自动替换、NB-Editor Markdown 注入与实时预览渲染、以及填入就绪状态截屏存证（严禁自动触发保存，由用户人工核验后手动提交）。
---

# 烧饼社区文章自动发布技能 (doudou-linuxsb)

本技能通过 `chrome-devtools-mcp` 控制浏览器，将用户指定的 Markdown 文件内容自动填入**烧饼社区（https://linux.sb/topic_edit?fid=4 ）**。

技能严格遵循**真实人工行为模拟与防风控规约**，通过自然的事件派发、微小随机时延、社区发帖规范弹窗自动处理、视口平滑滚动及 NB-Editor Markdown 渲染，避免被平台拦截。自动提取文章标题、摘要、CDN 版 Markdown 正文及智能推荐版块。

> [!IMPORTANT]
> **【核心铁律】严禁自动点击「保存」发布！**
> 烧饼社区发帖页面的「保存」按钮点击后会**直接公开发布新主题**（平台无独立后台草稿箱）。因此，本技能在完成标题输入、版块选择、Markdown 正文注入及实时预览校验后，**必须立即停止，不得调用或触发保存/提交点击**。由用户在浏览器中做最后人工审查并由用户手动点击「保存」。

---

## 核心规约与防风控原则

1. **绝对禁止自动触发保存**：
   - 自动流程在完成正文注入与预览校验后立即截屏并向用户汇报，**严禁触发 `button[type="submit"]` 或「保存」按钮的点击事件**。
2. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
3. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。
4. **社区规范弹窗自动响应**：
   - 首次或每次进入发帖页面时，平台常弹出《社区发帖规范》（`.posting-notice-backdrop`）阻断视口，技能需自动识别并拟真悬停点击「我已阅读并确认」（`.posting-notice-confirm`）清除遮罩。
5. **防风控与真实人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加正态分布随机等待（输入前 300~600ms、步骤间 400~1000ms），严禁毫秒级机械化并发。
   - **真实事件完整性**：对于标题输入与正文填充，依次派发 `focus`、`keydown`、`input`、`keyup`、`change`、`blur`，确保表单状态与 NB-Editor 内部状态完全同步。
   - **平滑视口滚动**：模拟人类自上而下的视觉审查，分步平滑滚动页面触发浏览器的视口可见性检测。
6. **版块智能推断与匹配**：
   - 默认推荐 `fid=4`（技术交流）；
   - 根据文章标题、正文关键词与路径特征智能推荐匹配版块（如资源分享 `fid=3`、福利放送 `fid=2`、求助问答 `fid=5`、深度思考 `fid=7`、我要推广 `fid=8`、社区治理 `fid=6`、大禹治水 `fid=10`）。
7. **资产自动解析优先级**：
   - **正文**：优先使用同名目录下已将本地图片替换为图床 URL 的 `[article_name]_cdn.md`；若无则使用原 Markdown 文件。
   - **图片**：优先使用 CDN 公开链接，确保图片在社区中完美显示。
8. **发布完成后保留页面（严禁自动关闭）**：
   - 正文注入、预览校验与截屏存证完成后，**严禁调用 `close_page` 或以任何方式关闭发帖页面**，必须原样保留页面现场——本技能不会自动保存，页面即是用户手动点击保存的唯一入口。
   - 未登录、验证码拦截、网络超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

---

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | 标题非空 + 预览区渲染非空（平台禁止自动保存 => ready_for_review） |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `ready_for_review` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const titleEl = document.querySelector('input[name="title"], input[placeholder*="标题"]');
  const filled = Boolean(titleEl && titleEl.value && titleEl.value.trim().length > 0);
  const preview = document.querySelector('.preview, .markdown-body, [class*="preview"]');
  const rendered = Boolean(preview && preview.innerText.trim().length > 50);
  return { passed: filled && rendered, titleFilled: filled, previewRendered: rendered };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过（本平台不适用） |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（**本平台的正常终态**） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/linuxsb_topic.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `topic`）：

```json
{
  "skill": "doudou-linuxsb",
  "platform": "Linux 中国",
  "platformSlug": "linuxsb",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "topic",
      "modeDesc": "主题帖",
      "status": "ready_for_review",
      "statusText": "内容已就绪，待人工确认发布",
      "title": "……",
      "screenshot": "screenshots/linuxsb_topic.png",
      "assertion": { "rule": "标题非空 + 预览区渲染非空（平台禁止自动保存 => ready_for_review）", "passed": true }
    }
  ]
}
```

脚本会强校验并拒绝不合规回执：非终态 `status`、缺 `statusText`、非 `skipped` 却缺 `screenshot` 一律报错退出，从源头杜绝脏数据流入看板。

---

## 社区版块映射表 (Forum Boards)

| 版块 ID (`fid`) | 版块名称 | 适用主题特征 |
| :--- | :--- | :--- |
| **`4` (默认)** | **技术交流** | AI、编程、架构、教程、Linux、Docker、前后端开发、深度实践 |
| **`3`** | **资源分享** | 实用软件、开源项目、工具合集、优质资源、素材分享 |
| **`2`** | **福利放送** | 免费福利、抽奖、礼包、社区活动 |
| **`5`** | **求助问答** | 遇到报错、技术求助、使用疑问、请教交流 |
| **`7`** | **深度思考** | 行业认知、心路历程、复盘思考、哲学感悟、长文分析 |
| **`8`** | **我要推广** | 推广链接、Affiliate、自荐产品、活动优惠 |
| **`6`** | **社区治理** | 社区规则、治理建议、公告反馈 |
| **`10`** | **大禹治水** | 闲聊摸鱼、日常灌水、社区互动 |
| **`1`** | **错误地方** | 误发版块归档 |

---

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径时，依次执行以下 7 个阶段：

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 资产与推断版块] --> S1[步骤 1: 打开/聚焦发帖页并检测登录态]
    S1 --> S2[步骤 2: 自动检测并确认社区规范弹窗]
    S2 --> S3[步骤 3: 拟真选择发帖版块 fid]
    S3 --> S4[步骤 4: 拟真人机输入文章标题]
    S4 --> S5[步骤 5: 注入 Markdown 正文并同步 NB-Editor]
    S5 --> S6[步骤 6: 模拟自然视口滚动并触发实时预览]
    S6 --> S7[步骤 7: 截取填入就绪状态存证并提醒用户手动保存]
```

### 步骤 0：解析 Markdown 资产与推断版块

运行辅助解析脚本提取元数据（脚本路径相对本技能目录）：
```bash
node scripts/parser.mjs <Markdown文件绝对路径> [可选指定fid]
```
输出包含：
- `title`: 文章标题（自动清洗 Markdown 符号）
- `fid` / `forumName`: 智能推荐或指定的版块 ID 与版块名称
- `summary`: 80~200 字纯文本摘要
- `bodyContent`: 过滤掉首行重复 H1 后的 Markdown 正文（优先使用 `_cdn.md`）
- `cover`: 封面图资产信息

---

### 步骤 1：打开/聚焦发帖页并检测登录态

1. 调用 `list_pages` 检查是否已有烧饼社区发帖页（URL 包含 `linux.sb/topic_edit`）。
   - 若已有，直接调用 `select_page` 切换到该页面；
   - 若无，调用 `new_page` 打开 `https://linux.sb/topic_edit?fid=4`。
2. 等待页面加载完成。
3. 执行脚本检测登录态：
   - 检查页面是否存在用户主页链接（`a[href*="/user/"]`）或表单元素 `form[action*="topic_edit"]`；
   - 若未登录，向用户发出明确提示请用户在浏览器中完成登录，并在登录完成后继续。

---

### 步骤 2：自动检测并确认社区规范弹窗

若页面弹出发帖规范提示遮罩（`.posting-notice-backdrop`）：
```javascript
const noticeConfirmBtn = document.querySelector('.posting-notice-confirm');
if (noticeConfirmBtn && noticeConfirmBtn.offsetParent !== null) {
  noticeConfirmBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
  noticeConfirmBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  noticeConfirmBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  noticeConfirmBtn.click();
}
```
等待 400ms~700ms 确认遮罩消失。

---

### 步骤 3：拟真选择发帖版块

1. 聚焦版块下拉框 `select[name="forum_id"]`。
2. 设置 `fid` 对应值并派发 DOM 事件：
```javascript
const forumSelect = document.querySelector('select[name="forum_id"]');
if (forumSelect) {
  forumSelect.focus();
  forumSelect.value = targetFid;
  forumSelect.dispatchEvent(new Event('input', { bubbles: true }));
  forumSelect.dispatchEvent(new Event('change', { bubbles: true }));
  forumSelect.blur();
}
```
3. 随机停顿 300ms~600ms。

---

### 步骤 4：拟真人机输入文章标题

1. 聚焦标题输入框 `input[name="title"]`。
2. 模拟微小随机延迟（300ms~600ms）。
3. 采用原生 Setter 设值并派发事件：
```javascript
const titleInput = document.querySelector('input[name="title"]');
if (titleInput) {
  titleInput.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(titleInput, articleTitle);
  } else {
    titleInput.value = articleTitle;
  }
  titleInput.dispatchEvent(new Event('input', { bubbles: true }));
  titleInput.dispatchEvent(new Event('change', { bubbles: true }));
  titleInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
  titleInput.blur();
}
```
4. 随机停顿 300ms~600ms。

---

### 步骤 5：注入 Markdown 正文并同步 NB-Editor

1. 聚焦正文多行文本框 `textarea[name="body"]`。
2. 模拟微小随机延迟（400ms~700ms）。
3. 注入 Markdown 正文并派发事件：
```javascript
const textarea = document.querySelector('textarea[name="body"]');
if (textarea) {
  textarea.focus();
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(textarea, bodyContent);
  } else {
    textarea.value = bodyContent;
  }
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
}
```
4. 同步 NB-Editor 本地草稿存储（`data-nb-editor-draft`），避免意外刷新丢失数据。
5. 随机停顿 500ms~800ms。

---

### 步骤 6：模拟自然视口滚动并触发实时预览

1. 平滑滚动到页面下方（`window.scrollTo({ top: 350, behavior: 'smooth' })`），等待 500ms~800ms；
2. 滚动回顶部，等待 300ms~600ms；
3. 点击工具栏的「实时预览」按钮（`button[data-nb-editor-action="preview"]`），触发 Markdown 解析与后端渲染校验；
4. 校验 `.nb-editor-preview` 渲染成功后，再次点击切回编辑视图。

---

### 步骤 7：截取填入就绪状态存证并提醒用户手动保存

1. **绝对不点击「保存」按钮**。
2. 调用 `take_screenshot` 保存当前表单已填充就绪的页面截图作为存证（如 `mds/<分类>/<文件名>/linuxsb_ready_screenshot.png`）。
3. 输出结构化结果报告（文章标题、发布版块、字符数、图片数等），提示用户可在浏览器中直接审查内容并手动点击「保存」完成发帖。

---

## 异常与风控处理

| 异常场景 | 表现特征 | 应对与恢复策略 |
| :--- | :--- | :--- |
| **未登录 / 登录态过期** | 未找到发帖表单或跳转登录页 | 立即停止自动化输入，向用户发送提示，等待用户在浏览器中完成登录后再继续。 |
| **发帖规范遮罩阻断** | 页面存在 `.posting-notice-backdrop` 无法交互 | 自动寻找 `.posting-notice-confirm` 派发拟真点击关闭遮罩。 |
| **Markdown 渲染异常** | 预览内容为空或报错 | 校验 Markdown 内容，确保特殊符号与换行转义正确。 |
| **版块选择无效** | `forum_id` 未更新 | 派发原生 `change` 和 `input` 事件以激活浏览器表单监听。 |

---

## 脚本工具与使用方法

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- `scripts/parser.mjs`：解析 Markdown，提取标题、版块、摘要与正文。
- `scripts/linuxsb_publisher.mjs`：浏览器注入脚本生成器（NB-Editor 状态同步、防风控人机模拟与预览）。

### 1. 运行 Node.js 脚本测试解析
```bash
node scripts/parser.mjs <Markdown文件路径> [fid]
```

### 2. 在 Agent 中配合 `chrome-devtools-mcp` 调用
```javascript
import { buildBrowserPublishScript } from './scripts/linuxsb_publisher.mjs';

// 1. 生成并执行表单填充代码（标题、版块、Markdown 正文、预览）
const fillCode = buildBrowserPublishScript(markdownFilePath, { fid: '4' });
const fillResult = await evaluate_script({ pageId, function: fillCode });

// 2. 截屏存证（不触发保存，保留表单状态供用户人工检查）
await take_screenshot({ pageId });
```
