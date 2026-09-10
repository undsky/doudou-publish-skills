---
name: doudou-qiehao
description: 通过 chrome-devtools-mcp 实现将本地 Markdown 文章及关联视频（video/*.mp4）自动填入企鹅号（腾讯内容开放平台）发文草稿箱（文章：https://om.qq.com/main/creation/article ，视频：https://om.qq.com/main/creation/video ）。支持「视频」与「长文图文」双模态自动发布。用户未明确指定模态时默认按序发布全部可用模态（视频 + 长文图文），资产缺失的模态自动跳过并登记原因。支持真实人工行为模拟、防风控时延、16:9 视频封面设置与裁剪绑定、ExEditor (ProseMirror) 正文与 CDN 配图注入、自主声明自动处理、AI 生成声明合规确认弹窗自动提交、标签严格留空规约以及平台原生草稿就绪存证。资产填入完成后直接判定完成，原样保留页面现场供人工发布，严禁调用 `close_page`。
---

# 企鹅号（腾讯内容开放平台）自动发布技能 (doudou-qiehao)

## 自动化执行全流程与双模态架构

当接收到用户指定的 Markdown 文件路径时，本技能依次支持**视频作品**与**长文图文**双创作模态发布：

```mermaid
flowchart TD
    S0[步骤 0: 解析资产与推导发布计划] --> Branch{多模态调度}
    Branch -->|模态 A: 视频发布 (video)| V1[V1: 打开独立视频发文页并暴露上传控件]
    V1 --> V2[V2: 派发视频文件并异步轮询等待就绪]
    V2 --> V3[V3: 填入标题 5~64字 与结构化干货简介]
    V3 --> V4[V4: 本地上传并裁剪绑定 16:9 封面]
    V4 --> V5[V5: 匹配常用分类并完成自主声明确认]
    V5 --> V6[V6: 点击存草稿并自动提交「AI生成声明」弹窗]
    
    Branch -->|模态 B: 长文图文发布 (article)| A1[A1: 打开独立图文发文页并检测登录态]
    A1 --> A2[A2: 拟真人机输入并校准文章标题]
    A2 --> A3[A3: ExEditor 引擎极速注入富文本正文与 CDN 配图]
    A3 --> A4[A4: 激活封面插槽、上传 File 并完成裁切确认]
    A4 --> A5[A5: 匹配常用分类并遵循标签严格留空规约]
    A5 --> A6[A6: 点击存草稿并捕获保存就绪状态]

    V6 --> SFinal[最终阶段: 截取双模态现场存证并更新清单，保留现场]
    A6 --> SFinal
```

---

### 步骤 0：解析 Markdown 资产与推导发布计划

运行辅助解析脚本提取元数据（脚本路径相对本技能目录，即 `SKILL.md` 所在目录）：
```bash
node scripts/parser.mjs <Markdown文件绝对路径> [模态: video|article] [--title "自定义新标题"]
```

解析脚本输出包含：
- `publishPlan`: `{ modes: ['video', 'article'], skipped: [], summary: '...' }`
- `articleTitle`: 清洗并规范至 5~64 字以内的长文标题
- `articleHtml`: 包含 CDN 图片、标题、代码块、引用与列表的 ExEditor 语义 HTML
- `cover`: 文章高清封面图（本地路径、Base64 与 CDN URL）
- `video`: 视频资产信息（路径 `video/*.mp4`、文件名、体积、时长）
- `videoTitle`: 规范至 5~64 字以内的视频标题
- `videoDesc`: 结构化多行要点简介（不超过 1000 字）
- `videoCover`: 专属 16:9 高清封面（优先 `cover-16x9.png`）
- `tags`: 遵循用户规范，无论视频还是文章，**标签严格留空（`[]`）**，由用户人工按需设置
- `category`: 依据语义推断并默认选择的企鹅号分类（默认「互联网」，与长文图文一致）

---

## 模态 A：视频作品发布（video）

### 页面地址
`https://om.qq.com/main/creation/video`

### 步骤 V1：打开独立视频发文页并暴露上传控件
1. **新建独立页面**：调用 `new_page` 打开 `https://om.qq.com/main/creation/video`（严禁复用或覆盖已有页面）。
2. **暴露上传控件**：页面上的视频文件上传控件 `<input name="Filedata" hidden="" type="file">` 默认处于隐藏状态。
   调用 `buildPrepareVideoUploadBrowserScript()` 解除隐藏属性并设置内联样式（`display: block !important; position: fixed !important; ...`），使其具有物理尺寸并被 Accessibility 树感知。
3. **获取 input 引用**：调用 `take_snapshot` 找到暴露出的黄色上传按钮/控件（或对应 `uid`）。

### 步骤 V2：派发视频文件并异步轮询等待就绪
1. **上传视频**：调用 MCP `upload_file` 将本地 `.mp4` 文件（例如 `video/ddcolor.mp4`）派发至该控件。
2. **异步轮询就绪**：调用 `buildWaitVideoUploadReadyBrowserScript(180)`，每 2 秒检测一次视频表单、预览元素与上传完成状态，直至页面出现标题编辑框或 `<video>` 元素。

### 步骤 V3：填入视频标题与多行简介
1. **输入标题**：定位 `.omui-inputautogrowing__inner`，填入 `meta.videoTitle`（5~64 字），派发 React `onInput` 合成事件与 DOM `input`/`change` 事件。
2. **输入简介**：定位 `textarea.omui-textarea__inner`，填入 `meta.videoDesc`，派发 React `onChange` 合成事件与 DOM `change` 事件。

### 步骤 V4：本地上传与裁剪绑定 16:9 视频封面
1. **触发弹窗**：点击封面设置插槽（`.commonThumb-cls1nhB7` 或 `[class*="addCover"]`）。
2. **切换本地上传**：在弹出对话框中点击切换至「本地上传」标签页（`.omui-tab__label`）。
3. **注入文件并派发事件**：获取对话框内 `input[type="file"]`，通过 `DataTransfer` 注入 16:9 封面 `File` 对象，派发 React `onChange` 与 DOM `change`。
4. **点击下一步**：等待「下一步」按钮（`.uploadNextBtn-clssB59u`）可用并点击，进入裁剪界面。
5. **完成裁剪绑定**：等待裁剪界面「完成」按钮（`button.omui-button--primary`）可用并点击，封面成功绑定并同步至腾讯官方 `inews.gtimg.com` 存储。

### 步骤 V5：设置分类（默认「互联网」，与文章一致）与自主声明确认
1. **选择分类**：
   - 视频发文页分类默认与长文图文一致选择**「互联网」**；
   - 优先检测「常用分类」区域是否存在「互联网」标签并直接点击；
   - 若常用分类为「暂无」，通过 `.videocat-suggestion` 下拉控件激活输入框，写入「互联网」，自动筛选出「互联网」选项后点击选中；
   - 备选兼容 `#articlePublish-category_id` 区域点选。
2. **标签留空**：**标签输入框严格保持留空**，不自动录入任何标签。
3. **自主声明确认**：企鹅号视频要求自主声明。点击 `[id*="selfDeclaration"] button` 打开自主声明弹窗，点击「确认」按钮关闭弹窗，消除必填拦截。

### 步骤 V6：安全存草稿与自动确认「AI生成声明」
1. **点击存草稿**：定位并点击页面底部的「存草稿」按钮。
2. **自动确认 AI 声明**：存草稿时页面会异步弹出「AI生成声明」合规确认弹窗（`.omui-dialog` 包含「AI生成声明」文字），脚本自动识别并点击其主按钮「提交」。
3. **存证留痕**：捕获页面保存成功状态，截取视频草稿现场图片（如 `qiehao_video_draft_proof.png` 与 `qiehao_video_cover_proof.png`）。
4. **保留现场**：**严禁调用 `close_page`**，保留视频发布页现场。

---

## 模态 B：长文图文发布（article）

### 页面地址
`https://om.qq.com/main/creation/article`

### 步骤 A1：打开独立图文发文页并检测登录态
1. **新建独立页面**：调用 `new_page` 打开 `https://om.qq.com/main/creation/article`。
2. **检测登录态**：检查页面是否存在标题输入框与 `window.ExEditor` 编辑器实例；若提示登录，引导用户登录。

### 步骤 A2：拟真人机输入文章标题
1. 定位 `.omui-articletitle__input1 .omui-inputautogrowing__inner`；
2. 聚焦并注入文章标题（5~64 字），深度调用 React `onInput` 派发完成双向状态绑定。

### 步骤 A3：极速注入 ExEditor 富文本正文与 CDN 配图
1. 使用已图床化的 `[article_name]_cdn.md` 生成的标准语义 HTML；
2. 调用 `window.ExEditor.sliceFromHTML(meta.htmlContent)`；
3. 调用 `window.ExEditor.view.dispatch(tr)` 极速注入正文，保留完整的文字层级、引用、代码块与高清 CDN 插图。

### 步骤 A4：激活封面插槽并完成裁切确认
1. 定位封面插槽（`.addCoverBtn-cls3gyHX` 或 `.omui-thumb__action`）；
2. 切换至「本地上传」标签并注入封面 `File` 对象；
3. 等待「确认」按钮可用并点击，确认裁剪并绑定至 `inews.gtimg.com`。

### 步骤 A5：匹配分类与标签留空规约
1. **分类**：在 `#articlePublish-category_id` 中点击匹配分类（如「互联网」/「科技」）；
2. **标签留空**：遵循用户要求，标签严格保持留空。

### 步骤 A6：安全存草稿与完成发布就绪
1. 点击「存草稿」按钮，捕获「保存成功」或「已保存」状态；
2. 截取图文草稿现场存证图片（如 `qiehao_article_draft_proof.png` 与 `qiehao_article_cover_proof.png`）；
3. **保留现场**：**严禁调用 `close_page`**，保留图文发文页现场。

---

## 一键自动化注入调用示例

```javascript
import { parseAllAssets } from './scripts/parser.mjs';
import { 
  buildPrepareVideoUploadBrowserScript, 
  buildWaitVideoUploadReadyBrowserScript, 
  buildVideoPublishBrowserScript, 
  buildPublishBrowserScript 
} from './scripts/qiehao_publisher.mjs';

const meta = parseAllAssets(markdownFilePath);

// 若发布视频：
if (meta.publishPlan.modes.includes('video')) {
  // 1. 暴露上传控件
  await evaluate_script({ pageId: videoPageId, function: buildPrepareVideoUploadBrowserScript() });
  // 2. 上传本地视频
  await upload_file({ pageId: videoPageId, file_path: meta.video.videoPath, uid: videoInputUid });
  // 3. 等待上传完成
  await evaluate_script({ pageId: videoPageId, function: buildWaitVideoUploadReadyBrowserScript(180) });
  // 4. 一键注入元数据、封面、分类并存草稿
  await evaluate_script({ pageId: videoPageId, function: buildVideoPublishBrowserScript(meta) });
}

// 若发布图文文章：
if (meta.publishPlan.modes.includes('article')) {
  // 一键注入标题、正文、封面、分类并存草稿
  await evaluate_script({ pageId: articlePageId, function: buildPublishBrowserScript(meta) });
}
```

---

## 核心约束与安全红线

1. **草稿隔离红线**：全流程严格限定为「存草稿」，绝不触碰任何形式的公开发表按钮。
2. **页面现场保留红线**：发布就绪后**严禁调用 `close_page`**，图文发文页与视频发文页必须完好保留在浏览器中，供用户人工最终审阅与提交。
3. **标签留空规约**：视频与图文发文页的标签输入框**严格保持留空**，严禁自动灌入未经用户核准的标签。
4. **16:9 封面规约**：视频封面严格优先选用 16:9 高清封面原图（`cover-16x9.png`），排除 `_thumb` 压缩图，保证在各端播放器中的展示效果。
