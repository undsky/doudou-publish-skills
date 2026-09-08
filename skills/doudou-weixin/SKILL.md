---
name: doudou-weixin
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及衍生资产自动发布到微信公众平台草稿箱（https://mp.weixin.qq.com）。支持「图文文章」与「小绿书贴图」双创作模态，用户未明确指定模态时默认两种全发（资产缺失的模态自动跳过并登记原因），用户明确指定时只发指定模态；真实人机行为模拟（防风控随机时延、ProseMirror 富文本粘贴解析、平滑滚动与拟真悬停）、资产智能解析（兼容产物同名目录、排版 HTML、封面图、小红书图文卡片）以及草稿保存状态验证。
---

# 微信公众平台文章与贴图自动发布到草稿技能 (doudou-weixin)

本技能通过 `chrome-devtools-mcp` 控制浏览器，将用户指定的本地 Markdown 文章及其衍生资产发布至**微信公众平台（https://mp.weixin.qq.com ）的草稿箱**。

技能原生支持**「图文文章 (Article)」**与**「图文贴图 (Sticker)」**双模态创作发布。**效率深度优化铁律**：流程全面固化，严格杜绝多余思考。文章模态**只需要**填写标题、文章正文、上传封面图（坚决不填作者、不填摘要）；贴图模态**只需要**填写标题、简介描述、上传卡片图片。严格遵循真实人机行为防风控与微信原生自动保存机制。

---

## 🎯 模态选择规约（默认全模态发布）

公众平台同时支持**图文文章 / 小绿书贴图**两种模态。模态的取舍**不允许由 Agent 自行揣测或随意挑一个执行**，必须严格遵循以下判定链：

1. **用户未明确指定模态 => 默认发布全部可用模态**。
   - 「把这篇发公众号」「发布到公众号草稿箱」「发一下 xxx.md」等未点名模态的指令，一律理解为**图文文章 + 小绿书贴图全发**，而非只发文章。
   - **严禁**以「资产多、耗时长、担心风控」等理由自行缩减模态；也**严禁**中途反问用户「要发文章还是贴图」——默认答案就是两种都发。
2. **用户明确指定模态 => 严格只发指定的那些**。
   - 如「只发文章」「仅发贴图」「只要小绿书」，则严格按指定集合执行，不得擅自追加其他模态。
3. **模态所需资产缺失 => 自动跳过该模态，其余照常发布**。
   - 缺失不是失败：跳过并在最终报告里明确登记原因，**绝不因为某一模态缺资产而中断整个任务**。
   - 若用户显式点名的模态恰好缺资产，同样跳过，并在报告中提示需要补齐的资产路径。

### 模态可用性判定表

| 模态 | 必需资产 | 缺失时的处置 |
| :--- | :--- | :--- |
| **图文文章（article）** | 排版正文 HTML（`meta.articleHtml.htmlContent` 非空） | 跳过文章模态，登记「未解析出可用排版正文 HTML」 |
| **小绿书贴图（sticker）** | `xhs_images/images/` 卡片集（`meta.stickerCount > 0`） | 跳过贴图模态，登记「未找到贴图卡片集」 |

> 封面图缺失**不构成**跳过文章模态的理由：按既有异常规约降级跳过封面注入，正文草稿照常保存，并在报告中标记封面待手动绑定。

### 确定性模态计划（由解析器给出，禁止手工推断）

`parseAllAssets()` 已内置模态编排，直接读取 `meta.publishPlan`，**不要自行拼凑模态列表**：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";

// requestedModes 留空 / null => 默认全模态；传入 "贴图" 或 ["article"] => 只发指定模态
const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

meta.publishPlan;
// {
//   requested: [],                      // 归一化后的用户指定模态（空数组 = 用户未指定）
//   userSpecified: false,               // false => 走默认全发
//   modes: ["article", "sticker"],      // 本次实际要执行的模态（已按推荐顺序排序）
//   skipped: [{ mode, label, reason }], // 被跳过的模态及原因
//   summary: "用户未指定模态 => 默认发布全部可用模态｜将发布：图文文章 + 小绿书贴图"
// }
```

命令行同样可校验计划（第三个参数留空即默认全模态）：

```bash
node scripts/parser.mjs <Markdown文件绝对路径>          # 默认全模态
node scripts/parser.mjs <Markdown文件绝对路径> "贴图"    # 仅指定模态
```

### 多模态串行执行规约

- **执行顺序**：`article` → `sticker`（先完成信息量最大的长文，再发贴图卡片）。
- **状态隔离**：每个模态**必须回到草稿箱页面重新点击「新的创作」**并选择对应入口（「文章」/「贴图」），严禁在上一模态的编辑器页面内切换创作类型。
- **防重复保存**：两个模态的「保存为草稿」点击之间至少间隔 3 秒（详见风控处理表）。
- **失败隔离**：单个模态失败（未登录、上传超时、选择器失效等）**只标记该模态失败并继续下一个模态**，不得终止剩余模态。
- **页面保留**：所有模态执行完毕后，**全部页面一律原样保留**（详见核心规约第 4 条），不得关闭。
- **统一汇总报告**：任务结束时输出逐模态结果表，含状态、`appmsgid`、存证截图路径与跳过原因：

  | 模态 | 状态 | appmsgid | 存证截图 / 原因 |
  | :--- | :--- | :--- | :--- |
  | 图文文章 | ✅ 已保存为草稿 | ... | `weixin_article.png` |
  | 小绿书贴图 | ⏭️ 已跳过 | — | 未找到 xhs_images 贴图卡片集 |

---

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | URL 出现 appmsgid= 或页面出现「已保存」提示 |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `success` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const m = location.href.match(/appmsgid=(\d+)/);
  const savedTip = /已保存|保存成功/.test(document.body.innerText);
  return { passed: Boolean(m) || savedTip, draftId: m?.[1] ?? null, draftUrl: m ? location.href : null, savedTip };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过 |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（微信公众号不适用） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/weixin_article.png、publishes/screenshots/weixin_sticker.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `article` / `sticker`）：

```json
{
  "skill": "doudou-weixin",
  "platform": "微信公众号",
  "platformSlug": "weixin",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "article",
      "modeDesc": "图文长文",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/weixin_article.png",
      "assertion": { "rule": "URL 出现 appmsgid= 或页面出现「已保存」提示", "passed": true }
    },
    {
      "mode": "sticker",
      "modeDesc": "贴图消息",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/weixin_sticker.png",
      "assertion": { "rule": "URL 出现 appmsgid= 或页面出现「已保存」提示", "passed": true }
    }
  ]
}
```

脚本会强校验并拒绝不合规回执：非终态 `status`、缺 `statusText`、非 `skipped` 却缺 `screenshot` 一律报错退出，从源头杜绝脏数据流入看板。

---

## 核心规约与防风控原则

1. **草稿安全隔离与平台原生自动保存**：
   - **绝对不触发公开发布**，严禁点击「发表」或「群发」按钮；同时**无需主动寻找或点击「保存为草稿」按钮**。微信公众平台在标题、正文及封面配置后具备原生防抖自动存草稿机制。脚本在注入完成后平滑滚动视口模拟人工排版审阅，轮询完成断言直至通过，确保所有内容必须经人工最终审核后再公开发布。
2. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
3. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。
4. **防风控与真实人机行为模拟 (Anti-Bot & Human Simulation)**：
   - **随机时延抖动**：所有操作之间增加正态分布随机等待（输入前 300~600ms、步骤间 600~1500ms、点击前 400~700ms），严禁毫秒级并发。
   - **真实事件完整性**：对于表单输入，依次派发 `focus`、`keydown`、`input`、`keyup`、`change`、`blur`，并同步底层隐藏 textarea/input 与 ProseMirror 编辑器。
   - **ProseMirror 原生富文本注入**：通过派发带有 `text/html` 的 `ClipboardEvent('paste')`，利用微信编辑器官方 DOMParser 解析并渲染复杂排版，保证样式与结构 100% 官方兼容。
   - **平滑视口滚动**：模拟人类自上而下的视觉审查，分步平滑滚动页面触发浏览器的视口可见性检测。
   - **拟真悬停与交互**：交互前先将视口滚动到元素可见区域，派发 `mouseover`/`mouseenter` 悬停 400~600ms 后再交互。
5. **资产自动解析与获取规范**：
   - **文章正文 HTML**：
     - 必须优先读取同名目录下由 `gzh-design` 生成的**纯排版正文 HTML**：`path/to/article_name/article_name_排版_主题(ID).html`（绝对不要使用带复制工具栏的 `_预览.html`）；
     - 注入时先全选清空 ProseMirror 编辑器，派发带有 `text/html` 的 `paste` 事件（辅以 `document.execCommand('insertHTML', false, html)` 保底并同步 `input` 事件），确保主题配色、标题组件、引言卡片、阴影圆角等样式 100% 完整保留。
   - **文章封面图**：
     - 严格优先选用 **2.35:1 宽屏主封面**，且**必须优先选用 `_thumb` 缩略图**（如 `cover/images/cover-2.35x1_thumb.png`，或 `cdn_manifest.json` 中记录的 `thumb_path` / CDN 链接）；若无 `_thumb` 则降级选用 `cover-2.35x1.png`、`cover-16x9_thumb.png` 或 `cover-16x9.png`；
     - 自动展开图片选择弹窗（`.weui-desktop-dialog_img-picker`），将封面文件注入上传，选中刚上传的第一张图片，点击「下一步」进入裁切页面，点击「确认」完成封面绑定。
   - **贴图卡片集**：读取同名目录下 `xhs_images/images/`（或 `xhs_images/`）的所有卡片图片（如 `01-cover.png`, `02-resources.png`, ...），排除 `*_yuantu.png` 原图，按序号升序批量上传至贴图选择器。
   - **标题与摘要**：
     - 文章标题：64 字以内纯文本；贴图标题：20 字以内精炼文案。
     - 摘要：80~120 字纯文本（微信公众号限制 120 字以内）。
     - 贴图描述：100~300 字核心要点梳理 + `#话题标签`。
6. **发布完成后保留页面（严禁自动关闭）**：
   - 图文与贴图草稿保存及存证截图完成后，**严禁调用 `close_page` 或以任何方式关闭编辑器页面与公众平台后台页面**，必须原样保留页面现场，供用户人工复核草稿内容、补充登录或手动确认发表。
   - 未登录、扫码验证、网络超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

---

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径时，依次执行以下阶段：

> 下图两个模态**不是「择一执行」的分支**，而是逐模态执行的操作手册：按「模态选择规约」得出的 `publishPlan.modes` 依次执行其中每一个模态（默认两种全发），执行顺序恒为 `article`（步骤 3）→ `sticker`（步骤 4）。

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 衍生资产与封面/排版] --> S1[步骤 1: 打开微信公众平台并进入草稿箱]
    S1 --> S2[步骤 2: 点击「新的创作」下拉菜单]

    subgraph 模态一: 图文文章草稿（极简三步）
        S2 --> A1[点击「文章」打开图文编辑器页面]
        A1 --> A2[拟真人机输入文章标题]
        A2 --> A3[聚焦正文 ProseMirror 注入纯排版 HTML]
        A3 --> A4[打开图片库上传 2.35:1 封面并裁切确认]
        A4 --> A5[平滑视口滚动模拟排版审查]
        A5 --> A6[等待微信原生自动防抖保存就绪]
        A6 --> A7[验证状态并截屏存证]
    end

    subgraph 模态二: 小绿书贴图草稿（极简三步）
        S2 --> B1[点击「贴图」打开贴图编辑器页面 createType=8]
        B1 --> B2[批量上传 xhs_images 卡片图片集]
        B2 --> B3[拟真人机输入贴图标题 20字以内]
        B3 --> B4[拟真输入卡片描述简介正文]
        B4 --> B5[平滑视口滚动检查卡片轮播]
        B5 --> B6[等待微信原生自动防抖保存就绪]
        B6 --> B7[验证状态并截屏存证]
    end
```

---

### 步骤 0：解析 Markdown 资产与贴图

运行辅助解析脚本提取文章与贴图的完整元数据（脚本路径相对本技能目录，即 `SKILL.md` 所在目录）：

```bash
node scripts/parser.mjs <Markdown文件绝对路径>
```

输出包含：

- `title`: 清洗后的文章标题（64 字以内）
- `author`: 作者名称（默认“undsky”）
- `summary`: 80~120 字精炼纯文本摘要
- `tags`: 核心话题标签列表
- `stickerDesc`: 包含要点总结与 `#标签` 的贴图描述文案
- `articleHtml`: `gzh-design` 摸鱼绿/橄榄手记等纯排版正文 HTML
- `cover`: 2.35:1 宽屏主封面（Base64 与 CDN 信息）
- `stickerImages`: 图文卡片序列（Base64 数组）

---

### 步骤 1：打开微信公众平台并进入草稿箱

1. **新建独立页面**：调用 `new_page` 打开 `https://mp.weixin.qq.com`（必须每次新建独立页面，严禁复用或覆盖已有页面）。
2. 检测登录态：
   - 检查页面是否存在 `.weui-desktop-menu` 或左侧「内容管理」菜单；
   - 若被重定向至登录页，向用户发出提示请用户在浏览器中微信扫码登录。
3. 模拟点击左侧菜单「草稿箱」（`a.weui-desktop-menu__link` 包含“草稿箱”），进入草稿箱列表页面（URL 包含 `type=77&action=list_card`）。

---

### 步骤 2：触发「新的创作」

在草稿箱页面中：

1. 定位绿色「新的创作」按钮（`.weui-desktop-btn_primary`，文字为“新的创作”）；
2. 派发点击事件展开下拉创作菜单（包含「文章」、「选择已有内容」、「贴图」、「视频」、「播客」等选项）。

---

### 步骤 3：发布「图文文章」到草稿

1. 点击下拉菜单中的「文章」选项（`.weui-desktop-dropdown__list-ele` 包含“文章”）；
2. 浏览器将自动新开图文编辑器页面（URL 包含 `appmsg_edit_v2` 或 `type=10`）；
3. 调用 `list_pages` 与 `select_page` 聚焦到文章编辑器页面；
4. 调用 `evaluate_script` 执行 `buildArticleBrowserScript(meta)`：
   - 拟真输入标题 ProseMirror 并同步 `#title`；
   - 聚焦正文 ProseMirror，派发带 `text/html` 的 `paste` 事件注入纯排版 HTML（`insertHTML` 保底）；
   - 若存在封面图，展开图片选择弹窗（`.weui-desktop-dialog_img-picker`）向其 `input[type="file"]` 注入封面并完成「下一步 → 确定」裁切绑定；
   - **严禁填写作者或摘要**，减少一切多余操作；
   - 模拟平滑向下滚动 380px 审查排版后滚回顶部；
   - 依托微信原生自动防抖存草稿机制，轮询完成断言（1.5s 间隔，最长 45s）直至通过；
   - 捕获 `appmsgid` 与页面就绪状态；
5. 调用 `take_screenshot` 保存文章草稿截图存证。

---

### 步骤 4：发布「贴图卡片」到草稿

1. 切换回草稿箱页面，再次点击「新的创作」；
2. 点击下拉菜单中的「贴图」选项（`.weui-desktop-dropdown__list-ele` 包含“贴图”）；
3. 浏览器将自动新开贴图编辑器页面（URL 包含 `createType=8`）；
4. 调用 `list_pages` 与 `select_page` 聚焦到贴图编辑器页面；
5. 调用 `evaluate_script` 执行 `buildStickerBrowserScript(meta)`：
   - 将 `xhs_images` 的所有卡片转为 `File` 对象，通过 `DataTransfer` 赋值给贴图上传 input，派发 `change` 触发批量上传；
   - 拟真输入贴图标题（20 字以内）；
   - 拟真输入贴图描述（要点梳理 + `#话题标签`）；
   - 模拟平滑视口滚动；
   - 依托微信原生自动防抖存草稿机制，轮询完成断言（1.5s 间隔，最长 45s）直至通过；
   - 捕获 `appmsgid` 与页面就绪状态；
6. 调用 `take_screenshot` 保存贴图草稿截图存证。

---

## 异常与风控处理

| 异常场景                 | 表现特征                              | 应对与恢复策略                                                              |
| :----------------------- | :------------------------------------ | :-------------------------------------------------------------------------- |
| **未登录 / 登录态过期**  | 跳转至二维码登录页或未找到菜单        | 立即停止自动化输入，向用户发送提示，等待用户在浏览器中扫码登录后再继续。    |
| **ProseMirror 粘贴受限** | ClipboardEvent 未被拦截或正文为空     | 自动降级为直接替换 `bodyPm.innerHTML` 并派发 `input` 事件，确保内容不丢失。 |
| **封面上传/拖拽超时**    | 封面区域未识别 drop 事件              | 降级跳过封面注入，在最终报告中标记封面待手动绑定，不阻塞草稿主体的保存。    |
| **贴图卡片缺失**         | 未检测到 `xhs_images/images` 目录     | 自动降级为纯文本贴图或仅执行文章草稿发布，在报告中清晰提示。                |
| **防重复保存拦截**       | 保存按钮处于 loading 或 disabled 状态 | 每次保存操作之间间隔至少 3 秒，避免高频连击。                               |

---

## 脚本工具与使用方法

以下路径均相对本技能目录（`SKILL.md` 所在目录），执行前先切换到该目录，或将其拼接为绝对路径使用。

- `scripts/parser.mjs`：解析 Markdown，提取标题、作者、摘要、话题、贴图文案、排版 HTML 与封面/图文卡片资产；并产出确定性模态计划 `publishPlan`（`PUBLISH_MODES` / `normalizeRequestedModes` / `resolvePublishPlan`）。
- `scripts/weixin_publisher.mjs`：文章与贴图发布浏览器注入脚本生成器（编辑器状态同步与防风控人机模拟）。

1. **直接运行 Node.js 脚本测试资产解析与代码生成**：

```bash
node scripts/parser.mjs <Markdown文件路径>
node scripts/weixin_publisher.mjs <Markdown文件路径>
```

2. **在 Agent 中配合 `chrome-devtools-mcp` 全流程调用**：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";
import {
  buildArticleBrowserScript,
  buildStickerBrowserScript,
} from "./scripts/weixin_publisher.mjs";

// 1. 解析目标 Markdown
//    requestedModes 留空 => 默认全模态；仅当用户明确点名模态时才传入
const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);

// 2. 读取确定性模态计划，严禁自行推断要发哪些模态
const { modes, skipped, summary } = meta.publishPlan;
console.log(summary); // 预期输出：用户未指定模态 => 默认发布全部可用模态｜将发布：图文文章 + 小绿书贴图

// 3. 逐模态串行执行（article -> sticker）；单模态失败不影响后续模态
const results = [];
for (const mode of modes) {
  // 3.1 回到草稿箱页面，点击「新的创作」并选择本模态对应入口（「文章」/「贴图」）
  //     严禁在上一模态的编辑器页面内切换创作类型
  const editorPageId = await openEditorViaNewCreation(mode);

  try {
    const code =
      mode === "article"
        ? buildArticleBrowserScript(meta)
        : buildStickerBrowserScript(meta);
    results.push(await evaluate_script({ pageId: editorPageId, function: code }));
  } catch (e) {
    results.push({ mode, ok: false, error: String(e) }); // 记录失败并继续下一模态
  }

  await sleep(3000); // 两次操作之间平滑等待，依托微信原生自动保存并规避并发风控
}

// 4. 汇总逐模态结果 + skipped 跳过原因，输出统一报告（页面一律保留不关闭）
```
