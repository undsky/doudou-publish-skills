---
name: doudou-shipinhao
description: "通过 chrome-devtools-mcp 实现微信视频号自动填入视频发文页并依托平台原生自动保存就绪功能。支持根据用户指定的 Markdown 文章及其关联视频（video/*.mp4）与同名资产目录，真实上传 MP4 视频、智能提炼短标题（<=16字）与结构化换行干货描述（<=1000字），全流程模拟真实人类行为防风控，精准穿透微前端 iframe，完成后保留标签页绝不触发发表。"
---

# 微信视频号自动化发布技能规范 (doudou-shipinhao)

本技能通过 `chrome-devtools-mcp` 控制 Chrome 浏览器，实现微信视频号助手（Channels Platform）的自动化视频内容填入全流程。

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
| **视频封面图** | `path/to/article_name/cover.png` 或 `video_cover.png` | 视频自定义封面图，优先解析本地同名目录下封面 |
| **视频作品短标题** | `<= 16 字`（严格截断） | 自动清洗 Markdown 符号与非规范标点，超长自动截断为 15 字 + `…`（共 16 字，对齐视频号短标题上限） |
| **视频作品描述** | `<= 1000 字` | 核心要点梳理，保留多行分段排版（换行 `<p>` 或 `<div>` 分段），严禁单行塌陷 |
| **标签处理约定** | `tags = inferTags(...)`（上限 3） | 由 `asset_resolver.inferTags` 从标题与正文推断，拼入描述末尾的 `#话题`；旧版固定为空数组导致话题串永远为空 |

---

## 🛡️ 防风控与微前端交互规约

1. **微前端 iframe 穿透**：
   - 视频号助手采用微前端同源架构，表单核心控件位于主页面下的 `iframe[name="content"]`（`doc = iframe.contentDocument`）内。
   - 所有元素定位、表单注入及事件监听均需优先通过该内嵌文档执行。
2. **异步上传等待机制（核心）**：
   - 视频派发上传后，页面需要进行分片上传与视频初步转码校验。
   - 必须启动异步轮询等待（10~120秒），直到上传进度达到 100% 且视频预览播放器/封面帧就绪。
3. **随机微延迟与视口滚动**：
   - 表单聚焦、输入、点击之间插入 200ms ~ 600ms 随机延迟（`sleep(ms + Math.random() * 200)`）。
   - 点击操作前先将元素 `scrollIntoView({ behavior: 'smooth', block: 'center' })`，并派发拟真鼠标事件。
4. **原生事件与 Vue 状态双向同步**：
   - 短标题输入框（`input.weui-desktop-form__input`）：设置 `value` 并派发 `input` 与 `change` 原生事件。
   - 视频描述富文本（`.input-editor[contenteditable="true"]`）：注入带换行的结构化富文本内容，并触发 Vue 内部的 `updateDescData` 或派发完整的 `input` 事件，确保其挂载的 `postStore.descData` 与描述字数统计实时同步。
5. **安全隔离与自动保存机制**：
   - **移除对草稿箱按钮的操作**：视频上传与信息填写完毕后，**严禁主动点击「保存草稿」按钮**，**绝对严禁触碰「发表」按钮**。
   - 视口平滑滚动核验后，轮询完成断言直至通过，并在目标目录截取存证截图（`shipinhao_video.png`）。
6. **发布完成后保留页面（严禁自动关闭）**：
   - 表单就绪与存证截图完成后，****每次执行必须无条件调用 `new_page` 新建独立标签页（严禁复用或覆盖已有页面）**；全流程完成后严禁调用 `close_page` 或以任何方式关闭视频号助手页面**，必须原样保留页面现场，供用户人工复核内容、补充扫码登录或手动确认发表。
   - 未登录、扫码验证、视频上传超时等异常中断的场景同样适用：保留页面交由用户接管，不得清理关闭。

---
7. **完成判定必须客观可断言（严禁以「已等待」代替「已完成」）**：
   - 「静候自动保存生效」是**等待动作**，不是验收条件。必须以**完成断言**（见「完成断言与回执协议」）求值为 `true` 才允许判定完成。
   - 断言未通过即为未完成：登记 `timeout` 并保留页面，**严禁登记为 `success`**。
8. **收尾必须落盘回执（父级编排的唯一完成信号）**：
   - 无论成功、失败、缺登录、超时还是跳过，收尾都必须调用 `scripts/receipt.mjs write` 写入回执。
   - 父级 `doudou-UGC-skill` 不解析自然语言汇报，只读回执文件；**缺回执会让父级永久阻塞后续平台**。

## 完成断言与回执协议 (Completion Assertion & Receipt)

> 本段是**父级串行编排的硬契约**。父级（`doudou-UGC-skill`）不读自然语言汇报，只读落盘回执；没有回执，父级会认为本平台仍在进行中而永久阻塞后续平台。

### 完成断言

**严禁以「已等待 N 秒」代替「已完成」。** 必须轮询下面这条可求值的客观判据：

| 项 | 值 |
| :--- | :--- |
| **断言规则** | 视频上传进度达 100% 且「草稿」状态可见 |
| **超时窗口** | 45 秒，轮询间隔 1.5 秒 |
| **通过** | 登记 `success` |
| **超时** | 登记 `timeout`（`statusText` 说明未在 45s 内成立），保留页面，**严禁登记为 success** |

```javascript
// 在 evaluate_script 中求值，返回结构化断言结果
() => {
  const t = document.body.innerText;
  const done = /100%|上传完成|上传成功/.test(t);
  const draft = /草稿/.test(t);
  return { passed: done && draft, uploadDone: done, draftVisible: draft };
};
```

### 状态枚举（六个终态，仅此六种可写入回执）

| 状态 | 含义 |
| :--- | :--- |
| `success` | 草稿已保存且完成断言通过 |
| `ready_for_review` | 内容已填入就绪，平台禁止自动保存（微信视频号不适用） |
| `needs_login` | 登录态缺失/过期，已保留页面待补登 |
| `failed` | 明确失败（选择器失效、注入异常） |
| `timeout` | 完成断言在 45s 窗口内未成立 |
| `skipped` | 资产缺失或用户主动跳过 |

### 存证截图统一命名

必须存至 publishes/screenshots/shipinhao_video.png（格式 `<platformSlug>_<mode>.png`），**不得使用技能私有命名**——父级看板按统一命名反查存证。

### 临时脚本与中间文件存放规约（严禁污染工作区根目录）

- **统一落盘位置**：自动化发文执行过程中，凡需生成的任何临时注入脚本（如浏览器富文本注入 `.mjs` / `.js`）、临时数据载荷（如 `--payload-file <json>`）、调试脚本或中间辅助文件，**严禁放置在当前工作区根目录、项目根目录或技能目录中**！
- **强制同名资产目录**：所有临时文件**必须统一放置在目标 Markdown 文章对应的同名资产目录下**（即去除 `.md` 后缀的同名资产目录），文件名建议统一以 `scratch_` 为前缀。
- **可追溯与可清理**：执行完毕且回执落盘后，临时中间文件安全留存于同名资产目录供事后复核排查，或由清理指令统一清空，彻底避免根目录污染。

### 回执落盘（收尾必调，异常也要写）

```bash
node scripts/receipt.mjs write <Markdown文件绝对路径> --payload-file <json文件路径>
```

> 载荷含正则/反斜杠时**务必用 `--payload-file`**，直接内联 `--payload` 会被 shell 转义破坏。

`--payload` 结构（`results` 为逐模态数组，本技能含 `video`）：

```json
{
  "skill": "doudou-shipinhao",
  "platform": "微信视频号",
  "platformSlug": "shipinhao",
  "startedAt": "<技能启动时即记录，不要收尾时倒填>",
  "results": [
    {
      "mode": "video",
      "modeDesc": "视频",
      "status": "success",
      "statusText": "草稿已保存",
      "title": "……",
      "screenshot": "screenshots/shipinhao_video.png",
      "assertion": { "rule": "视频上传进度达 100% 且「草稿」状态可见", "passed": true }
    }
  ]
}
```

脚本会强校验并拒绝不合规回执：非终态 `status`、缺 `statusText`、非 `skipped` 却缺 `screenshot` 一律报错退出，从源头杜绝脏数据流入看板。

---

## 🚀 视频发布执行流程

1. **导航至发布入口**：
   - 访问 `https://channels.weixin.qq.com/platform/post/create`。
   - 等待主框架及内嵌 `iframe[name="content"]` 加载完成。
2. **定位并派发视频上传**：
   - 解析目标文章目录下的 `video/` 目录，获取真实 `.mp4` 文件路径（如 `video_manifest.json` 指定的成片）。
   - 通过 `upload_file` 将视频文件派发至内嵌 `input[type="file"]`（`accept*="video/mp4"`）。
3. **轮询等待视频上传完毕**：
   - 异步监听视频上传完成标志（如进度条结束、生成视频缩略图预览就绪）。
4. **注入短标题与分段描述**：
   - 填入清洗后的短标题（<= 16 字）至短标题输入框并触发数据同步。
   - 填入多行结构化描述（<= 1000 字）至 `.input-editor`，确保每行分段清晰无挤压。
5. **上传自定义视频封面**：
   - 若存在封面资产（`meta.cover` / `meta.coverBase64`），定位「设置封面」/「更换封面」按钮或文件输入框上传封面图片，确认保存。
6. **平滑滚动审阅与就绪存证**：
   - 视口平滑滚动模拟人工阅读检查；
   - 轮询完成断言直至通过，严格绝不点击「保存草稿」或「发表」按钮；
   - 截图保存至目标文章同名目录：`shipinhao_video.png`，保留当前页面。

---

## 🛠️ 核心脚本

以下路径均相对本技能目录（`SKILL.md` 所在目录）：

- [scripts/parser.mjs](scripts/parser.mjs)：解析 Markdown、定位视频成片（.mp4）、提取规范短标题（<= 16 字）、结构化多行描述（<= 1000 字），`tags` 保持 `[]`。
- [scripts/shipinhao_publisher.mjs](scripts/shipinhao_publisher.mjs)：生成视频号自动化发布浏览器脚本（含 iframe 穿透、异步就绪轮询、Vue 状态同步与草稿保存）。

### Agent 调用范式

```javascript
import { parseAllAssets } from "./scripts/parser.mjs";
import {
  buildPrepareUploadBrowserScript,
  buildWaitUploadReadyBrowserScript,
  buildSaveDraftBrowserScript,
} from "./scripts/shipinhao_publisher.mjs";

// 1. 解析视频成片与文案（parseAllAssets 为同步函数）
const meta = parseAllAssets(markdownFilePath);

// 2. 暴露 iframe 内的上传控件并取得 uid
await evaluate_script({ pageId, function: buildPrepareUploadBrowserScript() });

// 3. 派发真实视频文件上传
await upload_file({ pageId, uid: inputUid, filePaths: [meta.video.videoPath] });

// 4. 轮询等待上传与转码就绪（参数为最长等待秒数）
await evaluate_script({ pageId, function: buildWaitUploadReadyBrowserScript(120) });

// 5. 填入短标题与描述并保存草稿
const saveRes = await evaluate_script({
  pageId,
  function: buildSaveDraftBrowserScript(meta),
});
```
