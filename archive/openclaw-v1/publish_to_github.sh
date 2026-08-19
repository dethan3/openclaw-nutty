#!/bin/bash
# Nutty Skill 发布到 GitHub 的脚本

set -e

echo "🐿️ 准备发布 Nutty 技能到 GitHub..."

# 检查是否在 nutty 目录中
if [ ! -f "SKILL.md" ] || [ ! -f "README.md" ]; then
    echo "❌ 错误：请在 nutty 技能目录中运行此脚本"
    echo "cd ~/.openclaw/workspace/skills/nutty"
    exit 1
fi

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "📁 创建临时目录: $TEMP_DIR"

# 复制文件
cp -r . "$TEMP_DIR/nutty"

# 进入临时目录
cd "$TEMP_DIR/nutty"

# 创建 LICENSE 文件
echo "📄 创建 MIT 许可证文件..."
cat > LICENSE << 'EOF'
MIT License

Copyright (c) $(date +%Y) [你的名字]

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# 创建 .gitignore
echo "📄 创建 .gitignore..."
cat > .gitignore << 'EOF'
# 忽略临时文件
*.tmp
*.log

# 忽略 IDE 文件
.vscode/
.idea/
*.swp
*.swo

# 忽略 macOS 系统文件
.DS_Store

# 忽略敏感信息
*.key
*.pem
*.secret
config.local.*
.env
EOF

# 更新 README.md 添加安装说明
echo "📝 更新 README.md..."
cat >> README.md << 'EOF'

## 📦 安装

### 方法一：手动安装
1. 克隆本仓库或下载 ZIP 文件
2. 将 `nutty` 文件夹复制到 OpenClaw 技能目录：
   ```bash
   cp -r nutty ~/.openclaw/workspace/skills/
   ```
3. 重启 OpenClaw 或等待技能重新加载

### 方法二：通过 Git 安装
```bash
cd ~/.openclaw/workspace/skills
git clone https://github.com/你的用户名/openclaw-nutty.git nutty
```

## 🚀 快速开始

1. 确保已安装 OpenClaw 并配置了飞书多维表格
2. 发送链接给 Nutty：
   ```
   https://example.com #标签 @项目
   ```
3. Nutty 会自动保存到对应的表格

## 📖 详细文档

查看 [SKILL.md](SKILL.md) 了解完整的功能说明和配置指南。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

## 📄 许可证

本项目基于 MIT 许可证开源 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢所有为这个项目做出贡献的人！

---

🐿️ **Nutty - 你的知识坚果收藏家**
</EOF>

# 初始化 Git 仓库
echo "🐿️ 初始化 Git 仓库..."
git init
git add .
git commit -m "feat: Initial release of Nutty skill

- 🐿️ Squirrel-inspired knowledge collector
- 🔗 Save links, ideas, projects, tasks to Feishu Bitable
- 🏷️ Auto-tagging and project association
- 📝 Simple and cute responses
- 📦 Ready for OpenClaw installation"

echo ""
echo "✅ 准备完成！"
echo ""
echo "📋 下一步操作："
echo ""
echo "1. 在 GitHub 上创建新仓库："
echo "   https://github.com/new"
echo "   仓库名：openclaw-nutty 或 nutty-skill"
echo ""
echo "2. 连接到远程仓库并推送："
echo "   git remote add origin https://github.com/你的用户名/仓库名.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "3. 添加仓库描述："
echo "   🐿️ Nutty - Squirrel-inspired knowledge collector for OpenClaw"
echo ""
echo "4. 添加 Topics：openclaw, skill, feishu, bitable, knowledge-management"
echo ""
echo "📁 文件已准备在：$TEMP_DIR/nutty"
echo "📦 包含文件："
ls -la
echo ""
echo "🐿️ 祝你好运！"