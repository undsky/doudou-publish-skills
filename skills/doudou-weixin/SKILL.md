---
name: doudou-weixin
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及衍生资产自动发布到微信公众平台草稿箱（https://mp.weixin.qq.com）。支持「文章」与「贴图」双创作模态，用户未明确指定模态时默认两种全发（资产缺失的模态自动跳过并登记原因），用户明确指定时只发指定模态。完成后保留页面现场供人工发布。
---

# 微信公众平台文章与贴图自动发布到草稿技能 (doudou-weixin)

## 自动化执行全流程

当接收到用户指定的 Markdown 文件路径时，依次执行以下阶段：

> 下图两个模态**不是「择一执行」的分支**，而是逐模态执行的操作手册：按「模态选择规约」得出的 `publishPlan.modes` 依次执行其中每一个模态（默认两种全发），执行顺序恒为 `article`（步骤 3）→ `sticker`（步骤 4）。

```mermaid
flowchart TD
    S0[步骤 0: 解析 Markdown 衍生资产与封面/排版] --> S1[步骤 1: 打开公众平台提取 Token]
    S1 --> S2[步骤 2: 依据 Token 拼接直达编辑器 URL]

    subgraph 模态一: 文章草稿（Token 直达极简流）
        S2 --> A1[调用 new_page 打开文章发布页 appmsg_edit_v2]
        A1 --> A2[拟真人机输入文章标题]
        A2 --> A3[聚焦正文 ProseMirror 注入纯排版 HTML]
        A3 --> A4[上传封面并完成双画幅裁切绑定]
        A4 --> A5[等待微信原生自动防抖保存就绪]
    end

    subgraph 模态二: 贴图草稿（Token 直达极简流）
        S2 --> B1[调用 new_page 打开贴图发布页 createType=8]
        B1 --> B2[批量上传 xhs_images 卡片图片集]
        B2 --> B3[拟真人机输入贴图标题 20字以内]
        B3 --> B4[拟真输入卡片描述简介正文]
        B4 --> B5[等待微信原生自动防抖保存就绪]
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
- `articleHtml`: `gzh-design` 摸鱼绿/橄榄手记等纯排版正文 HTML
- `cover`: 2.35:1 宽屏主封面（Base64 与 CDN 信息）
- `stickerDesc`: 包含要点总结的贴图描述文案
- `stickerImages`: 图文卡片序列（Base64 数组）

Agent 可直接调用 `scripts/weixin_publisher.mjs` 配合 `chrome-devtools-mcp` 注入文章与贴图：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";
import {
  buildArticleBrowserScript,
  buildStickerBrowserScript,
  getArticleEditorUrl,
  getStickerEditorUrl,
} from "./scripts/weixin_publisher.mjs";

const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);
// 提取后台页面 URL 中的 token 参数后拼接直达链接：
// const articleUrl = getArticleEditorUrl(token);
// const stickerUrl = getStickerEditorUrl(token);
// 文章页面注入: buildArticleBrowserScript(meta)
// 贴图页面注入: buildStickerBrowserScript(meta)
```

---

### 步骤 1：打开微信公众平台并提取 Token

1. **新建独立页面**：调用 `new_page` 打开 `https://mp.weixin.qq.com`（必须每次新建独立页面，严禁复用或覆盖已有页面）。
2. **检测登录态与提取 Token**：
   - 微信公众平台登录成功后会自动重定向至后台首页（形如 `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&token=&lang=zh_CN`）；
   - 若被重定向至登录页或 URL 中未包含 `token` 参数，向用户发出提示请用户在浏览器中微信扫码登录；
   - 登录成功跳转至后台首页后，从当前页面 URL 中提取 `token` 参数（例如通过 `new URL(window.location.href).searchParams.get('token')` 或正则 `/[?&]token=([^&]+)/` 匹配）。

---

### 步骤 2：依据 Token 拼接目标编辑器 URL

获取到 `token` 后，直接使用 `token` 拼接目标发布页面的直达 URL：

- **文章发布页**：
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=${token}&lang=zh_CN`
- **贴图发布页**：
  `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&createType=8&token=${token}&lang=zh_CN`

也可直接调用 `scripts/weixin_publisher.mjs` 中的辅助函数 `getArticleEditorUrl(token)` 与 `getStickerEditorUrl(token)` 获取。

---

### 步骤 3：发布「文章」到草稿

1. **新建独立页面直达文章编辑器**：调用 `new_page` 打开拼接好的文章发布页 URL；
2. 调用 `evaluate_script` 执行 `buildArticleBrowserScript(meta)`：
   - 拟真输入标题 ProseMirror 并同步 `#title`；
   - 拟真输入摘要（直接填入文章标题），同步至 `#js_description` / `name="digest"` 及其 Vue 状态；
   - 正文从同名目录下的 `article_name_排版_{主题中文名}({英文标识}).html` 文件中获取纯排版 HTML（排除带工具栏的 `_预览.html`）；注入时最优先穿透 Vue 实例调用微信官方 `mp-appmsg-editor.replaceAllContent` 进行 100% 原生保真注入，降级方案走 ProseMirror 选区清空并派发带 `text/html` 的 `paste` 富文本事件（`insertHTML` 保底）；
   - 封面图从同名目录下的 cover/images 目录中提取，脚本内自动展开图片库选择弹窗（`.weui-desktop-dialog_img-picker`）派发上传，轮询选中新上传图片，并连续完成微信「2.35:1 宽屏 + 1:1 双画幅裁切闭环」（下一步 → 完成）；
3. 资产填入完成后直接判定完成；
4. **安全隔离**：原样保留文章草稿编辑页面供人工复核与发布，严禁调用 `close_page`。

---

### 步骤 4：发布「贴图」到草稿

1. **新建独立页面直达贴图编辑器**：调用 `new_page` 打开拼接好的贴图发布页 URL；
2. 调用 `evaluate_script` 执行 `buildStickerBrowserScript(meta)`：
   - **卡片批量上传**：将 `xhs_images` 的所有卡片转为 `File` 对象，通过 `DataTransfer` 赋值给贴图上传 input，派发 `change` 触发批量上传；
   - **拟真输入贴图标题**：优先读取 `meta.stickerTitle`，无则降级为文章标题，严格控制在 20 字以内（超长自动截断 `19字 + …`），拟真同步 `#title` 与标题 ProseMirror；
   - **高质量描述正文排版保真注入（核心规范）**：
     - **底层机理**：微信贴图正文为纯行内文档（Schema `docContent: "(inline|text)*"`），内部**不支持 `<p>` 段落标签**。若直接注入 `<p>`，编辑器会自动滤除并导致全部段落粘连挤占在一行！唯一正确的排版方式是通过官方原生的 **`hardbreak`（`<br>`）节点**构建单行换行与双行段落间隔；
     - **方案 A（最优先）**：穿透 Vue 祖先实例获取原生 ProseMirror `EditorView`，逐行按 `schema.text(line)` 与 `schema.nodes.hardbreak.create()` 构造全保真文档，通过 `view.dispatch(tr)` 触发底层事务替换；
     - **方案 B（降级一）**：构造标准 `ClipboardEvent('paste')` 剪贴板事件，注入包含 `\n` 的纯文本与 `<br>` 的 HTML，依赖微信原生剪贴板解析器转换为 `hardbreak`；
     - **方案 C（保底）**：`document.execCommand('insertText')` 注入带分段换行的纯文本；
     - **响应式状态与计数同步**：自动穿透触发 Vue 实例的 `handleInput`、`handleCounterChange` 并同步 `content`，确保字数统计正常同步（如 `631/1000`）；
   - **自动点击保存草稿**：填入完成后自动查找并触发「保存为草稿」按钮，并等待微信后台保存确认（提取 URL 中的 `appmsgid`）；
3. 资产填入完成后直接判定完成；
4. **安全隔离**：原样保留贴图草稿编辑页面供人工复核与发布，严禁调用 `close_page`。

