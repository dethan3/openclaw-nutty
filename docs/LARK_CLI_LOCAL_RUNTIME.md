# lark-cli 本地运行模式

## 定位

`lark-cli` transport 是 Nutty 的正式本地飞书运行模式。它复用当前操作系统用户已经登录的 lark-cli keychain，不要求 Nutty 进程读取或保存 `FEISHU_APP_SECRET`。

该模式适合 Codex、ChatGPT Desktop、OpenClaw 等运行在用户本机的入口。服务器部署继续使用 `openapi` transport，并通过部署环境提供 App ID 和 App Secret。

## 前置条件

```bash
lark-cli auth status --json --verify
```

默认使用 `--as user`。用户身份必须同时具备飞书应用后台 scope 和当前用户授权，并能访问目标多维表格。

## 配置

在 `apps/mcp-server/.env.local` 中配置：

```dotenv
NUTTY_HOST=127.0.0.1
NUTTY_PORT=3000
NUTTY_ALLOWED_HOSTS=localhost,127.0.0.1
NUTTY_PERSONAL_TOKEN=<至少 32 个字符>
NUTTY_CONFIRMATION_SECRET=<至少 32 个字符>
NUTTY_DESTINATION_ID=feishu-default

FEISHU_TRANSPORT=lark-cli
FEISHU_APP_TOKEN=<base_token>
FEISHU_TABLE_ID=<table_id>
FEISHU_WEB_BASE_URL=https://my.feishu.cn/base
FEISHU_LARK_CLI_BINARY=lark-cli
FEISHU_LARK_CLI_IDENTITY=user
FEISHU_LARK_CLI_TIMEOUT_MS=30000
```

`lark-cli` 是默认 transport，因此可以省略 `FEISHU_TRANSPORT`。本模式不读取 `FEISHU_APP_ID`、`FEISHU_APP_SECRET` 或 `FEISHU_API_BASE_URL`。

## 启动

```bash
pnpm run build
pnpm --filter @nutty/mcp-server start
```

`start` 会自动读取 `apps/mcp-server/.env.local`。启动日志中的 `feishuTransport` 应为 `lark-cli`。

存储健康检查需要 Personal Profile bearer token：

```bash
curl -H "Authorization: Bearer <NUTTY_PERSONAL_TOKEN>" \
  http://127.0.0.1:3000/health/storage
```

健康响应应包含：

```json
{"provider":"feishu","status":"healthy"}
```

## 运行边界

- Storage Adapter 继续只依赖 `FeishuClient`，Core 不感知 CLI 或 OpenAPI 的差异。
- 子进程通过 argv 数组调用，不经过 shell 拼接。
- 写入 JSON 放入权限为 `0600` 的临时文件，调用结束后无论成功或失败都会删除。
- CLI 更新提示和 Skills 提示被关闭，运行时只解析稳定 JSON envelope；成功以 `ok: true` 判断。
- `authorization`、`missing_scope`、限流、并发冲突、网络错误和超时会转换成 Nutty 标准错误。
- lark-cli 的高风险删除确认门禁保持启用；当前 MCP 未暴露删除工具。
- 创建和更新使用 CLI 返回的 record ID 与已提交字段构造结果，避免飞书写后立即回读的短暂一致性窗口。

## OpenAPI 模式

部署环境需要直连时，显式切换：

```dotenv
FEISHU_TRANSPORT=openapi
FEISHU_APP_ID=<app_id>
FEISHU_APP_SECRET=<app_secret>
FEISHU_API_BASE_URL=https://open.feishu.cn/open-apis
```

配置校验只会在 `openapi` 模式要求 App ID 和 App Secret。

## 已验证链路

2026-08-19 使用真实用户 keychain 完成：

1. MCP Server 无 App Secret 启动。
2. 飞书存储健康检查。
3. `save_memory` 创建记录。
4. 相同内容再次保存并返回 `existing`。
5. `search_memories` 找回记录。
6. `update_memory` 更新记录。

验证记录：`recvsJ8kSoJ5A2`
