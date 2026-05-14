# 🐿️ Nutty - 松鼠知识坚果收藏助手

[![OpenClaw Skill](https://img.shields.io/badge/OpenClaw-Skill-blue)](https://openclaw.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/YOUR_USERNAME/openclaw-nutty?style=social)](https://github.com/YOUR_USERNAME/openclaw-nutty)

像松鼠 Nutty 一样收藏和整理知识的坚果小助手。自动保存链接、想法、项目、任务到飞书多维表格。

## ✨ 特性

- 🐿️ **可爱松鼠主题** - 使用松鼠收藏坚果的比喻，回复充满趣味
- 🔗 **智能路由** - 自动识别内容类型并保存到对应表格
- 🏷️ **自动标签提取** - 从消息中提取 `#标签` 和 `@项目`
- 📊 **飞书集成** - 无缝对接飞书多维表格
- 🎯 **简单易用** - 自然语言输入，无需复杂命令
- 💾 **原始保存** - 优先保存而非分析，保留完整上下文

## 🚀 快速开始

### 安装

1. 克隆本仓库到 OpenClaw 技能目录：
   ```bash
   cd ~/.openclaw/workspace/skills
   git clone https://github.com/YOUR_USERNAME/openclaw-nutty.git nutty
   ```

2. 重启 OpenClaw 或等待技能重新加载

### 配置

1. 在飞书中创建名为 "Collector_Base" 的多维表格应用
2. 创建以下数据表：Links, Ideas, Projects, Tasks, Inbox
3. 确保 OpenClaw 已配置飞书 API 权限

### 使用示例

```
# 保存链接
https://github.com/openai/openai-python #AI #API

# 记录想法
idea: 做一个自动整理笔记的AI工具 #AI #工具

# 创建项目
project: AI学习助手
目标：开发个性化学习推荐系统

# 添加任务
todo: 明天上午10点开会讨论项目计划 #会议
```

## 📋 功能详情

### 链接收藏 (Links)
- 自动识别 URL 并保存
- 支持 GitHub、YouTube、arXiv 等网站类型识别
- 提取标签和关联项目
- 清理 URL 跟踪参数

### 想法记录 (Ideas)
- 以 `idea:`、`灵感:` 开头的消息
- 保存原始想法内容
- 自动分类和标签

### 项目管理 (Projects)
- 以 `project:`、`项目:` 开头的消息
- 记录项目目标、描述、下一步行动

### 任务管理 (Tasks)
- 以 `todo:`、`task:`、`待办:` 开头的消息
- 支持截止时间（如明确指定）

### 收件箱 (Inbox)
- 不确定的内容自动保存到这里
- 后续手动整理

## 🛠️ 技术细节

### 路由规则
- **链接**: 包含 `http://` 或 `https://`
- **想法**: 以 `idea:`、`thought:`、`灵感:` 开头
- **项目**: 以 `project:`、`项目:` 开头
- **任务**: 以 `todo:`、`task:`、`待办:` 开头
- **其他**: 保存到 Inbox

### 字段映射
详细字段配置请参考 [SKILL.md](SKILL.md)。

## 📖 完整文档

查看 [SKILL.md](SKILL.md) 了解完整的功能说明、路由规则和配置指南。

## 🤝 贡献

欢迎贡献！请参考 [CONTRIBUTING.md](CONTRIBUTING.md)。

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 🙏 致谢

感谢所有为这个项目做出贡献的人！

## 🐿️ 关于 Nutty

Nutty 是一只可爱的松鼠助手，它喜欢收藏和整理你的知识坚果。就像松鼠为冬天收藏坚果一样，Nutty 帮你为未来收藏有价值的知识。

---

**让知识管理变得有趣！** 🥜