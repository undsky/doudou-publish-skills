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
    S0[步骤 0: 解析 Markdown 衍生资产与封面/排版] --> S1[步骤 1: 打开微信公众平台并进入草稿箱]
    S1 --> S2[步骤 2: 点击「新的创作」下拉菜单]

    subgraph 模态一: 文章草稿（极简流程）
        S2 --> A1[点击「文章」打开图文编辑器页面]
        A1 --> A2[拟真人机输入文章标题]
        A2 --> A3[聚焦正文 ProseMirror 注入纯排版 HTML]
        A3 --> A4[打开图片库上传 2.35:1 封面并裁切确认]
        A4 --> A5[等待微信原生自动防抖保存就绪]
    end

    subgraph 模态二: 贴图草稿（极简流程）
        S2 --> B1[点击「贴图」打开贴图编辑器页面 createType=8]
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
- `stickerDesc`: 包含要点总结与 `#标签` 的贴图描述文案
- `stickerImages`: 图文卡片序列（Base64 数组）

Agent 可直接调用 `scripts/weixin_publisher.mjs` 配合 `chrome-devtools-mcp` 注入文章与贴图：

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";
import {
  buildArticleBrowserScript,
  buildStickerBrowserScript,
} from "./scripts/weixin_publisher.mjs";

const meta = parseAllAssets(markdownFilePath, "undsky", requestedModes ?? null);
// 文章页面注入: buildArticleBrowserScript(meta)
// 贴图页面注入: buildStickerBrowserScript(meta)
```

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

### 步骤 3：发布「文章」到草稿

1. 点击下拉菜单中的「文章」选项（`.weui-desktop-dropdown__list-ele` 包含“文章”）；
2. 浏览器将自动新开图文编辑器页面（URL 包含 `appmsg_edit_v2` 或 `type=10`）；
3. 调用 `list_pages` 与 `select_page` 聚焦到文章编辑器页面；
4. 调用 `evaluate_script` 执行 `buildArticleBrowserScript(meta)`：
   - 拟真输入标题 ProseMirror 并同步 `#title`；
   - 聚焦正文 ProseMirror，派发带 `text/html` 的 `paste` 事件注入纯排版 HTML（`insertHTML` 保底）；
   - 若存在封面图，展开图片选择弹窗（`.weui-desktop-dialog_img-picker`）向其 `input[type="file"]` 注入封面并完成「下一步 → 确定」裁切绑定；
5. 资产填入完成后直接判定完成；
6. **安全隔离**：原样保留文章草稿编辑页面供人工复核与发布，严禁调用 `close_page`。

---

### 步骤 4：发布「贴图」到草稿

1. 切换回草稿箱页面，再次点击「新的创作」；
2. 点击下拉菜单中的「贴图」选项（`.weui-desktop-dropdown__list-ele` 包含“贴图”）；
3. 浏览器将自动新开贴图编辑器页面（URL 包含 `createType=8`）；
4. 调用 `list_pages` 与 `select_page` 聚焦到贴图编辑器页面；
5. 调用 `evaluate_script` 执行 `buildStickerBrowserScript(meta)`：
   - 将 `xhs_images` 的所有卡片转为 `File` 对象，通过 `DataTransfer` 赋值给贴图上传 input，派发 `change` 触发批量上传；
   - 拟真输入贴图标题（20 字以内）；
   - 拟真输入贴图描述（要点梳理）；
6. 资产填入完成后直接判定完成；
7. **安全隔离**：原样保留贴图草稿编辑页面供人工复核与发布，严禁调用 `close_page`。
