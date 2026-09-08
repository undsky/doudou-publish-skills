# doudou-publish-skills

多平台自媒体与开发者社区文章草稿自动发布技能合集。基于 `chrome-devtools-mcp` 控制浏览器，支持将本地 Markdown 及其衍生资产（排版 HTML、宽屏封面、图文卡片、CDN 图片等）一键自动同步至各大平台草稿箱。

---

## 📦 技能列表 (Skills)

| 技能名称               | 目录                                                       | 一句话介绍                                                                                                                  |
| :--------------------- | :--------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| **doudou-weixin**      | [`skills/doudou-weixin`](./skills/doudou-weixin)           | 自动将文章排版 HTML 发布至 [微信公众平台](https://mp.weixin.qq.com) 草稿箱（支持长文排版与小绿书贴图双模态）。              |
| **doudou-toutiao**     | [`skills/doudou-toutiao`](./skills/doudou-toutiao)         | 自动将 Markdown 文章及封面发布至 [今日头条 / 头条号](https://mp.toutiao.com) 创作者平台草稿箱。                             |
| **doudou-baijia**      | [`skills/doudou-baijia`](./skills/doudou-baijia)           | 自动将 Markdown 文章及封面发布至 [百度百家号](https://baijiahao.baidu.com) 创作者平台草稿箱。                               |
| **doudou-qiehao**      | [`skills/doudou-qiehao`](./skills/doudou-qiehao)           | 自动将 Markdown 文章及封面发布至 [企鹅号（腾讯内容开放平台）](https://om.qq.com) 图文草稿箱。                               |
| **doudou-juejin**      | [`skills/doudou-juejin`](./skills/doudou-juejin)           | 自动将 Markdown 文章、技术标签与封面发布至 [稀土掘金社区](https://juejin.cn/creator/home) 草稿箱。                          |
| **doudou-csdn**        | [`skills/doudou-csdn`](./skills/doudou-csdn)               | 自动将 Markdown 原生内容、专栏分类与标签发布至 [CSDN 博客](https://mp.csdn.net/) 草稿箱。                                   |
| **doudou-tencent**     | [`skills/doudou-tencent`](./skills/doudou-tencent)         | 自动将 Markdown 文章、技术标签与封面发布至 [腾讯云开发者社区](https://cloud.tencent.com/developer/creator/article) 草稿箱。 |
| **doudou-aliyun**      | [`skills/doudou-aliyun`](./skills/doudou-aliyun)           | 自动将 Markdown 文章及宽屏封面发布至 [阿里云开发者社区](https://developer.aliyun.com/creatorcenter/home) 草稿箱。           |
| **doudou-bilibili**    | [`skills/doudou-bilibili`](./skills/doudou-bilibili)       | 自动将 Markdown 文章及封面发布至 [哔哩哔哩（B站）专栏](https://member.bilibili.com) 草稿箱。                                |
| **doudou-xiaohongshu** | [`skills/doudou-xiaohongshu`](./skills/doudou-xiaohongshu) | 自动将长文专栏与图文笔记（含 3:4 归藏卡片）发布至 [小红书创作者服务平台](https://creator.xiaohongshu.com) 草稿箱。          |
| **doudou-douyin**      | [`skills/doudou-douyin`](./skills/doudou-douyin)           | 自动将长文文章与图文笔记（含信息图卡片）发布至 [抖音创作者平台](https://creator.douyin.com) 草稿箱。                        |
| **doudou-zhihu**       | [`skills/doudou-zhihu`](./skills/doudou-zhihu)             | 自动将 Markdown 文章、知乎话题与封面发布至 [知乎专栏](https://www.zhihu.com/creator/manage/creation/all) 草稿箱。           |
| **doudou-shipinhao**   | [`skills/doudou-shipinhao`](./skills/doudou-shipinhao)     | 自动将视频成片、短标题与结构化描述发布至 [微信视频号助手](https://channels.weixin.qq.com) 草稿箱。                          |
| **doudou-linuxsb**     | [`skills/doudou-linuxsb`](./skills/doudou-linuxsb)         | 自动将 Markdown 文章与版块填入 [烧饼社区 (Linux.sb)](https://linux.sb) 发帖页（保留编辑就绪态供人工审查，不自动触发保存）。 |

---

## 🏗️ 三种发布架构对比

自媒体多平台发布属于典型的**富前端 SPA 自动化**（涉及动态弹窗、Canvas 裁剪、微前端 iframe、反爬风控），需要在「稳定性」、「维护成本」与「风控安全」之间取得平衡：

| 发布模式                                                                   | 实现原理                                                  | 优点                                                                            | 致命缺陷 / 风险                                                                                                                       | 稳定性评估          |
| :------------------------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------ |
| **A. 逆向 / 协议 API**                                                     | 不走浏览器，直接抓包调用后端发文接口（带 Cookie / Token） | 毫秒级极速，彻底不受 UI 变动影响                                                | 字节/腾讯系全站挂载高强度动态反爬（`_signature` / `msToken` / 设备指纹 / 滑块），协议极易失效，且**极易触发批量发文风控导致永久封号** | ❌ 个人号极易封禁   |
| **B. 传统脚本 DOM 模拟**                                                   | 单向顺序执行：固定选择器 + sleep 延时 + 粗暴点击          | 编写简单快速                                                                    | **极脆弱**：类名变动、弹窗拦截、网络卡顿都会静默漏跑步骤；无自检机制，容易谎报成功                                                    | ⚠️ 30%~50% 容易脆断 |
| 🏆 **C. CDP 状态机 + 门禁强断言**<br>👉 **<mark>🎯 本项目采用方案</mark>** | **有限状态机 (FSM) + 语义树感知 + 闭环断言门禁**          | 100% 模拟真实人类行为防风控；具备自愈能力；每一步均有客观断言，杜绝半成品与谎报 | 需要针对平台特定交互建立可观测断言                                                                                                    | ✅ **98%+ 高可靠**  |
