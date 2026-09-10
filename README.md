<div align="center">

# doudou-publish-skills

多平台自媒体与开发者社区文章、图文、视频自动发布技能合集。

</div>

![doudou-publish-skills](./assets/cover.png)

---

## 📦 技能列表 (Skills)

| 技能名称               | 目录                                                       | 一句话介绍                                                           |
| :--------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------- |
| **doudou-weixin**      | [`skills/doudou-weixin`](./skills/doudou-weixin)           | 将文章、图文发布到 [微信公众平台](https://mp.weixin.qq.com)          |
| **doudou-toutiao**     | [`skills/doudou-toutiao`](./skills/doudou-toutiao)         | 将文章、视频发布到 [今日头条](https://mp.toutiao.com)                |
| **doudou-baijia**      | [`skills/doudou-baijia`](./skills/doudou-baijia)           | 将文章、视频发布到 [百度百家号](https://baijiahao.baidu.com)         |
| **doudou-qiehao**      | [`skills/doudou-qiehao`](./skills/doudou-qiehao)           | 将文章、视频发布到 [企鹅号](https://om.qq.com)                       |
| **doudou-juejin**      | [`skills/doudou-juejin`](./skills/doudou-juejin)           | 将文章发布到 [稀土掘金](https://juejin.cn)                           |
| **doudou-csdn**        | [`skills/doudou-csdn`](./skills/doudou-csdn)               | 将文章发布到 [CSDN 博客](https://mp.csdn.net/)                       |
| **doudou-tencent**     | [`skills/doudou-tencent`](./skills/doudou-tencent)         | 将文章发布到 [腾讯云开发者社区](https://cloud.tencent.com/developer) |
| **doudou-aliyun**      | [`skills/doudou-aliyun`](./skills/doudou-aliyun)           | 将文章发布到 [阿里云开发者社区](https://developer.aliyun.com)        |
| **doudou-bilibili**    | [`skills/doudou-bilibili`](./skills/doudou-bilibili)       | 将文章、视频发布到 [哔哩哔哩](https://member.bilibili.com)           |
| **doudou-xiaohongshu** | [`skills/doudou-xiaohongshu`](./skills/doudou-xiaohongshu) | 将图文、视频发布到 [小红书](https://creator.xiaohongshu.com)         |
| **doudou-douyin**      | [`skills/doudou-douyin`](./skills/doudou-douyin)           | 将图文、视频发布到 [抖音](https://creator.douyin.com)                |
| **doudou-zhihu**       | [`skills/doudou-zhihu`](./skills/doudou-zhihu)             | 将文章发布到 [知乎专栏](https://zhuanlan.zhihu.com)                  |
| **doudou-shipinhao**   | [`skills/doudou-shipinhao`](./skills/doudou-shipinhao)     | 将视频发布到 [微信视频号](https://channels.weixin.qq.com)            |
| **doudou-linuxsb**     | [`skills/doudou-linuxsb`](./skills/doudou-linuxsb)         | 将文章发布到 [烧饼社区](https://linux.sb)                            |

---

## 🏗️ 三种发布架构对比

自媒体多平台发布属于典型的**富前端 SPA 自动化**（涉及动态弹窗、Canvas 裁剪、微前端 iframe、反爬风控），需要在「稳定性」、「维护成本」与「风控安全」之间取得平衡：

| 发布模式                                                                   | 实现原理                                                  | 优点                                                                            | 致命缺陷 / 风险                                                                                                                       | 稳定性评估          |
| :------------------------------------------------------------------------- | :-------------------------------------------------------- | :------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------ |
| **A. 逆向 / 协议 API**                                                     | 不走浏览器，直接抓包调用后端发文接口（带 Cookie / Token） | 毫秒级极速，彻底不受 UI 变动影响                                                | 字节/腾讯系全站挂载高强度动态反爬（`_signature` / `msToken` / 设备指纹 / 滑块），协议极易失效，且**极易触发批量发文风控导致永久封号** | ❌ 个人号极易封禁   |
| **B. 传统脚本 DOM 模拟**                                                   | 单向顺序执行：固定选择器 + sleep 延时 + 粗暴点击          | 编写简单快速                                                                    | **极脆弱**：类名变动、弹窗拦截、网络卡顿都会静默漏跑步骤；无自检机制，容易谎报成功                                                    | ⚠️ 30%~50% 容易脆断 |
| 🏆 **C. CDP 状态机 + 门禁强断言**<br>👉 **<mark>🎯 本项目采用方案</mark>** | **有限状态机 (FSM) + 语义树感知 + 闭环断言门禁**          | 100% 模拟真实人类行为防风控；具备自愈能力；每一步均有客观断言，杜绝半成品与谎报 | 需要针对平台特定交互建立可观测断言                                                                                                    | ✅ **98%+ 高可靠**  |
