<div align="center">

# 豆豆多平台自动发布技能库

<p align="center">
  <b>简体中文</b> | <a href="README_EN.md">English</a>
</p>

多平台自媒体与开发者社区文章、图文、视频自动发布技能合集。通过 AI Agent 并使用 `chrome-devtools-mcp` 控制浏览器，遵循真实人机行为模拟与全链路防风控规约，实现自动化解析本地 Markdown 与多媒体资产、智能调度多创作模态、精准注入排版内容并安全存入草稿箱。

已全面支持 **14+ 主流自媒体与开发者社区平台**：微信公众平台、今日头条、百度百家号、企鹅号、稀土掘金、CSDN、知乎专栏、腾讯云开发者社区、阿里云开发者社区、哔哩哔哩、小红书、抖音、微信视频号及烧饼社区等。

![doudou-publish-skills](./assets/cover_thumb.png)

</div>

---

## 📑 目录导航

- [📖 技能使用指南](#-技能使用指南)
  - [一、安装](#一安装)
  - [二、使用](#二使用)
- [📦 技能列表](#-技能列表)
- [💬 社区与交流](#-社区与交流)
- [📄 许可证](#-许可证)

---

## 📖 技能使用指南

本技能库作为 **AI Agent 的多平台自动化发布助手**（支持 Antigravity、Claude Code、OpenCode 等）。

---

### 一、安装

在任何目标工程根目录下，通过命令行一键安装：

```bash
npx skills add undsky/doudou-publish-skills --yes
```

---

### 二、使用

直接用大白话告诉 AI 想要将哪篇文章或资产发布到指定平台草稿箱即可：

```text
帮我把 articles/ai-guide.md 发布到微信公众号和今日头条草稿箱
```

---

## 📦 技能列表

| 技能名称               | 目录                                                       | 一句话介绍                                                                       |
| :--------------------- | :--------------------------------------------------------- | :------------------------------------------------------------------------------- |
| **doudou-weixin**      | [`skills/doudou-weixin`](./skills/doudou-weixin)           | 将文章、图文发布到 [微信公众平台](https://mp.weixin.qq.com)                      |
| **doudou-toutiao**     | [`skills/doudou-toutiao`](./skills/doudou-toutiao)         | 将文章、视频发布到 [今日头条](https://mp.toutiao.com)                            |
| **doudou-baijia**      | [`skills/doudou-baijia`](./skills/doudou-baijia)           | 将文章、视频发布到 [百度百家号](https://baijiahao.baidu.com)                     |
| **doudou-qiehao**      | [`skills/doudou-qiehao`](./skills/doudou-qiehao)           | 将文章、视频发布到 [企鹅号](https://om.qq.com)                                   |
| **doudou-juejin**      | [`skills/doudou-juejin`](./skills/doudou-juejin)           | 将文章发布到 [稀土掘金](https://juejin.cn)                                       |
| **doudou-csdn**        | [`skills/doudou-csdn`](./skills/doudou-csdn)               | 将文章发布到 [CSDN 博客](https://mp.csdn.net/)                                   |
| **doudou-tencent**     | [`skills/doudou-tencent`](./skills/doudou-tencent)         | 将文章发布到 [腾讯云开发者社区](https://cloud.tencent.com/developer)             |
| **doudou-aliyun**      | [`skills/doudou-aliyun`](./skills/doudou-aliyun)           | 将文章发布到 [阿里云开发者社区](https://developer.aliyun.com/creatorcenter/home) |
| **doudou-bilibili**    | [`skills/doudou-bilibili`](./skills/doudou-bilibili)       | 将文章、视频发布到 [哔哩哔哩](https://member.bilibili.com)                       |
| **doudou-xiaohongshu** | [`skills/doudou-xiaohongshu`](./skills/doudou-xiaohongshu) | 将图文、视频发布到 [小红书](https://creator.xiaohongshu.com)                     |
| **doudou-douyin**      | [`skills/doudou-douyin`](./skills/doudou-douyin)           | 将图文、视频发布到 [抖音](https://creator.douyin.com)                            |
| **doudou-zhihu**       | [`skills/doudou-zhihu`](./skills/doudou-zhihu)             | 将文章发布到 [知乎专栏](https://zhuanlan.zhihu.com)                              |
| **doudou-shipinhao**   | [`skills/doudou-shipinhao`](./skills/doudou-shipinhao)     | 将视频发布到 [微信视频号](https://channels.weixin.qq.com)                        |
| **doudou-linuxsb**     | [`skills/doudou-linuxsb`](./skills/doudou-linuxsb)         | 将文章发布到 [烧饼社区](https://linux.sb)                                        |

---

## 💬 社区与交流

| 公众号                                       | QQ群（1095058701）                            |
| -------------------------------------------- | --------------------------------------------- |
| ![公众号](https://cdn.undsky.com/img/gh.jpg) | ![QQ群](https://cdn.undsky.com/img/qqqun.jpg) |

---

## 📄 许可证

本项目采用 [CC BY-NC 4.0](LICENSE) 许可证。

- 个人使用、学习、研究与非商业项目可以直接使用。
- 公开发布衍生作品时，请注明来源。
- 商业用途需要单独授权，请联系作者。
