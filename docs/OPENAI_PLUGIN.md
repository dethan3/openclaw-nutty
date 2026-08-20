# Nutty OpenAI 插件

## 组成

插件根目录为 `plugins/openai/nutty`：

```text
nutty/
├── .codex-plugin/plugin.json
├── .mcp.json
├── mcp/server.mjs
└── skills/nutty-memory/
    ├── SKILL.md
    └── agents/openai.yaml
```

- `nutty-memory` 负责理解“记录上一条回答”“保存当前对话”“搜索以前的记忆”等用户意图。
- `.mcp.json` 让 Codex 以 stdio 启动插件内的本地 MCP。
- `mcp/server.mjs` 是构建时生成的自包含 bundle，不依赖原仓库路径或仓库中的 `node_modules`。
- 飞书登录凭据由本机 lark-cli keychain 提供。

## 首次连接

插件即使尚未配置飞书目标也能正常启动，并暴露 `get_nutty_status` 与 `configure_nutty`。用户明确选择一个飞书多维表格后，向 `configure_nutty` 提供完整表格 URL。Nutty 会：

1. 解析 Base token 与 table ID。
2. 使用当前 lark-cli 用户身份验证表格可访问性和字段结构。
3. 仅在验证通过后，将非敏感目标信息写入用户配置目录。
4. 继续通过 keychain 使用飞书凭据，不把凭据复制到插件或仓库。

## 构建与验证

```bash
pnpm run build:plugin
pnpm run test:plugin
pnpm run check
```

`test:plugin` 会把插件复制到临时目录，再通过 MCP JSON-RPC stdio 协议检查七个工具和未配置状态，证明 bundle 不依赖原仓库路径。

插件和 Skill 结构分别使用官方 `plugin-creator` 与 `skill-creator` 校验器验证。

## 当前边界

本地 Codex 版本使用 stdio + lark-cli keychain。面向 ChatGPT Web 发布时继续复用现有 streamable HTTP MCP，但需要稳定 HTTPS、标准用户授权和远程部署配置；这些不进入本地插件 MVP。
