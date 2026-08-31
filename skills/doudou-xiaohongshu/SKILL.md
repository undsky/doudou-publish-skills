---
name: doudou-xiaohongshu
description: "通过 chrome-devtools-mcp 实现小红书发布长文专栏与图文笔记到草稿箱功能。支持用户指定的 Markdown 文章及其同名资产目录，真实批量上传 3:4 高清归藏社交卡片（guizang_cards/editorial 或 swiss，01~05卡片集），双向同步 TipTap/ProseMirror 专属图片节点与富文本正文，自动完成标题（<=20字/<=64字）、描述话题（<=1000字）与一键排版，全流程模拟真实人类行为防风控，精准操作 Shadow DOM 下的「暂存离开」安全保存草稿。"
---

# 小红书自动化发布草稿技能规范 (doudou-xiaohongshu)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现小红书创作者服务平台（Creator Studio）的**长文专栏**与**图文笔记**自动化草稿发布流程。

---

## 📌 核心发布入口

- **发布文章入口**：`https://creator.xiaohongshu.com/publish/publish?from=menu&target=article`
- **发布图文入口**：`https://creator.xiaohongshu.com/publish/publish?from=menu&target=image`

---

## 🎨 资产规范与路径映射（遵循 doudou-markdown-skill）

| 资产类型 | 规范路径 / 规则 | 说明 |
| :--- | :--- | :--- |
| **源 Markdown 文章** | `path/to/article_name.md` | 用户指定的源文章 |
| **长文标题** | `<= 64 字` | 自动清洗 Markdown 符号与标点 |
| **图文笔记标题** | `<= 20 字` | 提炼吸睛短标题，严格截断至 20 字内 |
| **长文内容摘要** | `<= 60 字` | 提取首段精炼摘要 |
| **图文作品描述** | `<= 1000 字` | 核心观点梳理 + 序号干货清单 + `#热门话题标签` |
| **文章排版 HTML** | `path/to/article_name/` 结合 `_cdn.md` | 必须使用小红书 TipTap 专属 `data-dom-type="image"` 节点封装全部 CDN 配图，确保排版器完美解析多图 |
| **图文社交卡片集** | `path/to/article_name/guizang_cards/editorial/` 或 `swiss/` | 遵循 `doudou-markdown-skill:L134-L160`，提取 `01-cover.png` ~ `05-summary.png` 高清 3:4 卡片（自动排除 `_yuantu.png`） |

---

## 🖼️ 小红书长文正文插图解析规范（TipTap Image Node）

小红书网页端长文编辑器采用 TipTap / ProseMirror 架构，普通 `<p><img src="..."></p>` 会被其自定义 schema 过滤。**正文插图必须封装为小红书专属 Image 节点结构**：

```html
<div data-dom-type="image" data-imgs="[{&quot;src&quot;:&quot;https://cdn.example.com/img.jpg&quot;,&quot;desc&quot;:&quot;插图说明&quot;,&quot;width&quot;:600,&quot;height&quot;:400}]" contenteditable="false">
  <div data-dom-type="img-wrapper" class="img-wrapper" style="width: 100%; height: 400px; display: flex; justify-content: center;">
    <img data-dom-type="img" class="image" src="https://cdn.example.com/img.jpg" style="width: 600px; min-height: 400px;">
    <span data-dom-type="desc" class="desc">插图说明</span>
  </div>
</div>
```

`scripts/parser.mjs` 中的 `resolveArticleHtml` 已全自动处理 Markdown 中所有的 `![alt](url)` 与 `<img ...>` 语法转换为上述标准节点。

---

## 🛡️ 防风控与人机行为模拟规约

1. **随机时延抖动**：所有交互前插入 250ms ~ 650ms 随机延迟（`sleep(ms + Math.floor(Math.random() * 200))`），模拟人类打字与反应节奏。
2. **原生事件完整派发**：文本输入必须触发 `input` 与 `change`（带 `bubbles: true, composed: true`）；富文本需调用 TipTap / ProseMirror 的 `setContent` 与 `emit('update')` 回调同步 Vue 响应式状态与字数统计。
3. **真实鼠标与视口交互**：点击操作前先将元素 `scrollIntoView({ behavior: 'smooth', block: 'center' })`，派发 `mouseover`、`mouseenter` 再执行 `click`；分步平滑滚动页面模拟人工审阅。
4. **Web Component 与 Shadow DOM 适配**：小红书底部操作栏采用自定义元素 `<xhs-publish-btn>`，其 Shadow DOM (`_sr`) 内包含「暂存离开」与「发布」按钮。
5. **绝对安全隔离底线**：全流程终点统一点击「**暂存离开**」，严禁误触直接「发布」。

---

## 🚀 双模态自动化发布执行流程

```mermaid
flowchart TD
    Start([用户指定 Markdown 文章]) --> Parse[步骤 0: scripts/parser.mjs 解析资产与转换 TipTap 图片节点]
    Parse --> ModeCheck{选择发布模式}

    subgraph 模式 A: 发布长文草稿 (target=article)
        A1[导航至 target=article] --> A2[若在列表页点击「新的创作」]
        A2 --> A3[填写长文标题 <= 64字]
        A3 --> A4[注入含 data-dom-type='image' 的富文本并同步字数]
        A4 --> A5[点击「一键排版」进入模板与封面选择（支持9卡切片）]
        A5 --> A6[点击「下一步」进入发布设置]
        A6 --> A7[注入话题描述与封面设置]
        A7 --> A8[悬停并点击「暂存离开」]
    end

    subgraph 模式 B: 发布图文草稿 (target=image)
        B1[导航至 target=image] --> B2[调用 upload_file 上传 3:4 归藏卡片集]
        B2 --> B3[进入编辑页填写标题 <= 20字]
        B3 --> B4[注入 1000字以内要点描述与话题标签]
        B4 --> B5[视口平滑滚动模拟人工检查]
        B5 --> B6[Shadow DOM 下悬停并点击「暂存离开」]
    end

    ModeCheck -->|发布长文| A1
    ModeCheck -->|发布图文| B1
    A8 --> Finish[草稿箱状态检测与截屏存证]
    B6 --> Finish
```

---

## 🛠️ 核心脚本

- [scripts/parser.mjs](file:///Users/jyx/project/doudou-xiaohongshu-skill/scripts/parser.mjs)：解析 Markdown、提取长文/图文标题、摘要、话题、TipTap 专属图片节点 HTML 以及 3:4 归藏社媒卡片集。
- [scripts/xhs_publisher.mjs](file:///Users/jyx/project/doudou-xiaohongshu-skill/scripts/xhs_publisher.mjs)：长文与图文发布浏览器注入脚本生成器（涵盖 TipTap 状态同步、Shadow DOM 交互与防风控人机模拟）。
