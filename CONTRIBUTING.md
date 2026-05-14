# 🤝 贡献指南

欢迎为 Nutty 技能贡献代码！以下是参与贡献的指南。

## 🚀 开始之前

### 开发环境
- OpenClaw 运行时环境
- 飞书开发者账号（用于测试）
- Git

### 技能结构
```
nutty/
├── SKILL.md          # 技能主文件
├── README.md         # 项目说明
├── LICENSE           # MIT 许可证
├── CONTRIBUTING.md   # 贡献指南（本文档）
└── .gitignore        # Git 忽略规则
```

## 🛠️ 开发流程

### 1. Fork 仓库
1. 点击 GitHub 页面右上角的 "Fork" 按钮
2. 克隆你的 Fork 到本地：
   ```bash
   git clone https://github.com/你的用户名/openclaw-nutty.git
   cd openclaw-nutty
   ```

### 2. 创建分支
```bash
git checkout -b feature/你的功能名称
# 或
git checkout -b fix/问题描述
```

### 3. 进行修改
- 修改 `SKILL.md` 文件以更新技能逻辑
- 更新 `README.md` 以反映更改
- 添加测试用例（如果适用）

### 4. 测试修改
1. 复制修改后的技能到 OpenClaw：
   ```bash
   cp -r . ~/.openclaw/workspace/skills/nutty
   ```
2. 重启 OpenClaw 或等待技能重新加载
3. 测试功能是否正常工作

### 5. 提交更改
```bash
git add .
git commit -m "feat: 添加新功能描述"
# 或
git commit -m "fix: 修复问题描述"
```

### 6. 推送到 GitHub
```bash
git push origin feature/你的功能名称
```

### 7. 创建 Pull Request
1. 访问你的 Fork 的 GitHub 页面
2. 点击 "Compare & pull request"
3. 填写 PR 描述，说明你的更改
4. 提交 PR

## 📝 代码规范

### 文档规范
- 使用中文编写文档
- 保持 Markdown 格式整洁
- 添加适当的标题层级
- 使用表情符号增强可读性

### 技能规范
- 遵循 OpenClaw 技能开发规范
- 保持回复简洁友好
- 错误处理要友好
- 遵循 "Save first, analyze later" 原则

### 提交信息规范
- **feat**: 新功能
- **fix**: 修复问题
- **docs**: 文档更新
- **style**: 代码格式调整
- **refactor**: 代码重构
- **test**: 测试相关
- **chore**: 构建过程或辅助工具变动

示例：
```
feat: 添加对 YouTube 链接的自动识别
fix: 修复标签提取中的空值错误
docs: 更新安装说明
```

## 🐛 报告问题

### 创建 Issue
1. 访问 [Issues 页面](https://github.com/YOUR_USERNAME/openclaw-nutty/issues)
2. 点击 "New issue"
3. 选择问题类型（Bug、功能请求等）
4. 填写问题描述

### Issue 模板
```markdown
## 问题描述
[清晰描述问题]

## 重现步骤
1. [第一步]
2. [第二步]
3. [第三步]

## 预期行为
[描述期望的行为]

## 实际行为
[描述实际发生的行为]

## 环境信息
- OpenClaw 版本：[版本号]
- 操作系统：[如 Ubuntu 22.04]
- 飞书版本：[如飞书桌面版 6.0]

## 附加信息
[其他相关信息]
```

## 💡 功能建议

如果你有新功能的想法：
1. 先检查是否已有相关 Issue
2. 描述功能的用途和场景
3. 说明为什么这个功能对 Nutty 有用
4. 如果可以，提供实现思路

## 🧪 测试

### 测试内容
- 链接保存功能
- 想法记录功能
- 项目管理功能
- 任务管理功能
- 错误处理
- 回复格式

### 测试方法
1. 在 OpenClaw 中加载技能
2. 发送测试消息
3. 检查飞书多维表格中的结果
4. 验证回复格式

## 📚 文档更新

如果你改动了功能，请同时更新：
1. `SKILL.md` - 技能逻辑文档
2. `README.md` - 项目说明文档
3. 相关的示例和注释

## 🏷️ 版本发布

版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：
- **主版本号**：不兼容的 API 修改
- **次版本号**：向下兼容的功能性新增
- **修订号**：向下兼容的问题修正

## ❓ 获取帮助

- 查看 [SKILL.md](SKILL.md) 了解技能详细说明
- 在 [Discussions](https://github.com/YOUR_USERNAME/openclaw-nutty/discussions) 中提问
- 查看现有 [Issues](https://github.com/YOUR_USERNAME/openclaw-nutty/issues)

## 🙏 感谢贡献

感谢你为 Nutty 做出贡献！你的每一份贡献都让这个项目变得更好。

---

**一起让 Nutty 变得更强大！** 🐿️💪