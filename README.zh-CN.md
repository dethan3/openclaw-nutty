# Nutty

> 用户控制的跨平台 AI 对话记忆。只保存你明确选择的回答、问答和片段，写入飞书多维表格，并在之后的对话中重新找回。

[English](README.md) · [产品设计](docs/DESIGN.md) · [技术架构](docs/TECHNICAL_ARCHITECTURE.md)

Nutty 当前是**功能型 MVP / 开发者预览版**。Codex Skill、本地 MCP Server、飞书适配器、去重、搜索、召回和更新流程均已实现，并通过真实飞书端到端测试。ChatGPT/Codex 公共插件目录发布尚未完成。

## Nutty 是什么

每天与 AI 对话会产生大量有价值的答案、决定、偏好和项目上下文，但这些内容通常留在分散的聊天记录里。Nutty 把其中**由你明确选择的内容**保存为一份独立、可搜索、可迁移的长期记忆。

你可以直接对 Codex 说：

```text
Nutty，保存上一个回答。
Nutty，把这一轮问答记为 openclaw-nutty 项目的架构决定。
Nutty，找出我以前保存的 MCP 鉴权方案。
Nutty，把刚才那条记忆的标签改为 mcp 和 security。
```

Nutty 不会默认记录所有对话，也不会保存系统提示词、隐藏推理、工具轨迹或认证信息。

## MVP 状态

| 能力 | 状态 |
|---|---|
| 统一记忆模型、校验、内容哈希和去重 | ✅ 已完成 |
| 保存上一条回答、当前问答、选中片段和手动内容 | ✅ 已完成 |
| 搜索、完整回读和更新记忆 | ✅ 已完成 |
| 飞书多维表格存储适配器 | ✅ 已完成 |
| 本地 `lark-cli` keychain 认证，不保存 App Secret | ✅ 已完成 |
| Codex Skill + stdio MCP bundle | ✅ 已完成 |
| 独立 Streamable HTTP MCP Server | ✅ 已完成 |
| 真实飞书创建、查重、搜索、回读联调 | ✅ 已通过 |
| ChatGPT/Codex 公共插件目录发布 | ⏳ 待发布 |
| ChatGPT Web 远程 OAuth/HTTPS 部署 | ⏳ 后续阶段 |
| OpenClaw MCP 适配器、DeepSeek Harness 插件 | ⏳ 后续阶段 |
| Notion、Google Workspace、本地存储 | ⏳ 后续阶段 |

## 工作方式

```text
用户明确选择内容
        │
        ▼
Codex Skill：判断保存范围和捕获模式
        │
        ▼
Nutty MCP：校验、去重、搜索和更新
        │
        ▼
Nutty Core：统一记忆模型与隐私策略
        │
        ▼
飞书存储适配器 → lark-cli keychain → 飞书多维表格
```

本地 Codex 运行时使用 `stdio + lark-cli`。Skill 负责理解“上一个回答”指哪段可见内容，MCP 工具负责受控写入，Core 负责稳定的数据和安全规则。

## 快速开始：从源码安装到第一次保存

当前版本尚未发布到公共插件目录。推荐先使用下面的**源码安装方式**，它会安装同一个 Nutty Skill，并将自包含 MCP bundle 注册到 Codex。

### 1. 准备环境

- Git
- Node.js `>= 24`
- pnpm `>= 10`
- 已安装并可运行的 Codex CLI
- 一个你有权访问和编辑的飞书多维表格

检查版本：

```bash
node --version
pnpm --version
codex --version
```

如果 Node.js 已安装但没有 pnpm：

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
```

### 2. 下载、安装依赖并构建

```bash
git clone https://github.com/dethan3/openclaw-nutty.git
cd openclaw-nutty
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` 会依次执行构建、TypeScript 类型检查、单元测试和插件协议 smoke test。生成的自包含 MCP 位于：

```text
plugins/openai/nutty/mcp/server.mjs
```

### 3. 安装并登录 lark-cli

Nutty 本地模式通过飞书官方生态的 `lark-cli` 使用当前操作系统用户的 keychain。Nutty 不需要读取或保存 `FEISHU_APP_SECRET`。

```bash
npm install -g @larksuite/cli
lark-cli --version
lark-cli config init --new
lark-cli auth login --domain base
lark-cli auth status --json --verify
```

说明：

- `config init --new` 会引导你创建或配置飞书应用。
- `auth login --domain base` 只请求多维表格业务域权限。
- 如果命令返回缺少 scope 和飞书开发者后台链接，请先在后台为应用开通对应权限，再重新登录授权。
- Nutty 默认以 `--as user` 访问你自己的表格；当前用户还必须是目标多维表格的协作者。
- 后续升级 CLI 使用 `lark-cli update`。

### 4. 创建飞书多维表格

创建一个 Base 和一张数据表。字段名区分大小写；不要翻译或改写下面的英文名称。

最小可运行结构只有四个必填字段：

| 字段名 | 飞书字段类型 | 用途 |
|---|---|---|
| `Nutty ID` | 文本 | Nutty 的稳定 UUID |
| `Title` | 文本，可作为主字段 | 标题 |
| `Content` | 文本 | 用户选择保存的原文 |
| `Content Hash` | 文本 | SHA-256 去重指纹 |

建议为完整体验创建以下全部字段：

| 字段名 | 推荐类型 | 可接受类型 | 说明 |
|---|---|---|---|
| `Nutty ID` | 文本 | 文本 | 必填 |
| `Title` | 文本 | 文本 | 必填，可设为主字段 |
| `Content` | 文本 | 文本 | 必填 |
| `Content Hash` | 文本 | 文本 | 必填 |
| `User Prompt` | 文本 | 文本 | 当前问答中的用户问题 |
| `Assistant Response` | 文本 | 文本 | 当前问答中的 AI 回答 |
| `User Note` | 文本 | 文本 | 用户备注 |
| `Summary` | 文本 | 文本 | 摘要 |
| `Type` | 文本 | 文本或单选 | 记忆类型 |
| `Tags` | 文本 | 文本或多选 | 标签；推荐文本以允许任意新标签 |
| `Project` | 文本 | 文本或单选 | 项目名 |
| `Capture Mode` | 文本 | 文本或单选 | 捕获方式 |
| `Source` | 文本 | 文本或单选 | 来源平台 |
| `Source Details` | 文本 | 文本 | 来源 JSON |
| `Sensitivity` | 文本 | 文本或单选 | 敏感级别 |
| `Schema Version` | 数字 | 文本或数字 | 当前为 `1` |
| `Created At` | 日期时间 | 文本或日期时间 | 创建时间 |
| `Updated At` | 日期时间 | 文本或日期时间 | 更新时间 |

如果使用单选或多选字段，必须提前创建 Nutty 将写入的选项：

- `Type`：`conversation`、`decision`、`insight`、`reference`、`task`、`project`、`preference`、`inbox`
- `Capture Mode`：`previous_answer`、`current_exchange`、`selection`、`manual`
- `Source`：`chatgpt`、`codex`、`openclaw`、`deepseek-harness`、`other`
- `Sensitivity`：`normal`、`private`、`restricted`

为了允许 AI 自由生成新标签，`Tags` 最好使用文本字段。若使用多选，飞书会拒绝尚未预先创建的标签选项。

最后复制数据表的**完整 URL**，必须包含 `table` 参数：

```text
https://your-tenant.feishu.cn/base/<base_token>?table=<table_id>
```

### 5. 将 Nutty 注册到 Codex

在仓库根目录执行：

```bash
export NUTTY_REPO="$(pwd)"
export NUTTY_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$NUTTY_CODEX_HOME/skills"
ln -s "$NUTTY_REPO/plugins/openai/nutty/skills/nutty-memory" \
  "$NUTTY_CODEX_HOME/skills/nutty-memory"

codex mcp add nutty -- node "$NUTTY_REPO/plugins/openai/nutty/mcp/server.mjs"
codex mcp list
```

这是一种适合源码开发阶段的安装方式：Skill 使用符号链接，重新构建后 MCP 继续指向仓库里的最新 bundle。

安装完成后，**重新启动 Codex 或打开一个新会话**。当前已经启动的会话不会自动加载新 Skill。

### 6. 首次连接飞书

在新 Codex 对话中输入：

```text
使用 Nutty 检查当前状态。如果尚未配置，请把下面的完整 URL 设置为目标表：
https://your-tenant.feishu.cn/base/<base_token>?table=<table_id>
```

Nutty 会调用 `configure_nutty`，验证表格权限和字段结构，然后将非敏感目标信息写入：

```text
${XDG_CONFIG_HOME:-~/.config}/nutty/config.json
```

配置文件权限为 `0600`，只保存 Base token、table ID 和本地运行选项。用户 access token、refresh token 和 App Secret 仍由 `lark-cli` keychain 管理。

### 7. 保存并找回第一条记忆

```text
Nutty，保存上一个回答。
```

再尝试搜索：

```text
Nutty，搜索我刚才保存的内容。
```

保存成功时，Nutty 会返回标题和飞书记录链接。相同正文再次保存会返回 `existing`，不会新增重复记录。

## 日常使用

### 保存上一条回答

```text
Nutty，保存上一个回答，并标记为 openclaw-nutty 项目的 insight。
```

Nutty 使用 `captureMode: previous_answer`，只保存紧邻的、用户可见的上一条 AI 回答。

### 保存当前问答

```text
Nutty，把这一轮问答保存为 architecture 标签下的 decision。
```

Nutty 使用 `captureMode: current_exchange`，同时保留用户问题和 AI 回答。

### 保存一段明确文本

```text
Nutty，只保存下面这段：
“平台适配器决定保存哪段会话，Core 决定如何安全、稳定地保存。”
```

### 搜索和读取

```text
Nutty，搜索 openclaw-nutty 项目里关于 MCP 鉴权的记忆。
Nutty，打开最相关的那一条并总结给我。
```

Skill 会先调用 `search_memories`，确定目标后才调用 `get_memory` 读取完整正文。

### 更新记忆

```text
Nutty，把刚才那条记忆的标题改为“Nutty MCP 鉴权决定”，标签改为 mcp 和 security。
```

标题、摘要、类型、标签、项目和敏感级别可以直接更新。替换原始正文必须由用户明确确认，并使用 `replaceOriginal: true`。

## MCP 工具参考

| 工具 | 作用 | 是否写入 |
|---|---|---|
| `get_nutty_status` | 检查本地配置和飞书健康状态 | 否 |
| `configure_nutty` | 使用完整 Base URL 配置目标表 | 写本地配置 |
| `save_memory` | 保存记忆；按规范化正文哈希去重 | 是 |
| `search_memories` | 按文本、类型、标签、项目、来源和时间搜索 | 否 |
| `get_memory` | 按 Nutty UUID 读取完整记忆 | 否 |
| `update_memory` | 更新派生字段或经确认替换原文 | 是 |
| `list_destinations` | 列出目标存储和能力 | 否 |

MVP 没有对外暴露删除工具。需要删除记录时，请直接在飞书中操作；后续版本会增加带明确确认门禁的删除流程。

## 数据规则

### 记忆类型

```text
conversation | decision | insight | reference |
task | project | preference | inbox
```

### 捕获模式

```text
previous_answer | current_exchange | selection | manual
```

### 来源平台

```text
chatgpt | codex | openclaw | deepseek-harness | other
```

### 隐私和敏感内容

- 只保存用户明确选择的可见内容。
- 不保存系统/开发者提示词、隐藏推理、工具轨迹、凭据或身份元数据。
- 内容命中私钥、API key、access token、client secret 或密码模式时，Nutty 会要求再次确认。
- 敏感确认 token 绑定用户、目标和内容哈希，并在 5 分钟后过期。
- 每次写入前都会按目标存储检查正文长度。飞书文本单元格最多允许 100,000 字；标题仍限制为 240 字符，摘要为 2,000 字符，每条最多 20 个标签。

## 独立 HTTP MCP Server

插件本地模式不需要 `.env.local`。只有在独立运行 HTTP Server 时才需要下面的配置。

```bash
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
```

编辑 `apps/mcp-server/.env.local`：

```dotenv
NUTTY_HOST=127.0.0.1
NUTTY_PORT=3000
NUTTY_ALLOWED_HOSTS=localhost,127.0.0.1
NUTTY_PERSONAL_TOKEN=<至少 32 个字符的随机值>
NUTTY_PRINCIPAL_ID=personal
NUTTY_CONFIRMATION_SECRET=<至少 32 个字符的随机值>
NUTTY_DESTINATION_ID=feishu-default

FEISHU_TRANSPORT=lark-cli
FEISHU_APP_TOKEN=<base_token>
FEISHU_TABLE_ID=<table_id>
FEISHU_WEB_BASE_URL=https://your-tenant.feishu.cn/base
FEISHU_LARK_CLI_BINARY=lark-cli
FEISHU_LARK_CLI_IDENTITY=user
FEISHU_LARK_CLI_TIMEOUT_MS=30000
```

可以生成随机值：

```bash
openssl rand -hex 32
```

启动：

```bash
pnpm run build
pnpm --filter @nutty/mcp-server start
```

检查服务和飞书存储：

```bash
curl http://127.0.0.1:3000/health
curl -H "Authorization: Bearer <NUTTY_PERSONAL_TOKEN>" \
  http://127.0.0.1:3000/health/storage
```

HTTP 接口：

| 路径 | 鉴权 | 用途 |
|---|---|---|
| `GET /health` | 无 | 进程健康状态 |
| `GET /health/storage` | Bearer token | 飞书存储状态 |
| `GET /metrics` | Bearer token | MCP 调用指标 |
| `POST /mcp` | Bearer token | Streamable HTTP MCP |

当前 HTTP Profile 是单用户 personal profile。不要直接暴露到公网；面向 ChatGPT Web 的正式部署仍需要 HTTPS、标准用户授权和远程部署加固。

### OpenAPI transport

服务器环境无法使用本机 keychain 时，可以切换为 OpenAPI：

```dotenv
FEISHU_TRANSPORT=openapi
FEISHU_APP_ID=<app_id>
FEISHU_APP_SECRET=<app_secret>
FEISHU_API_BASE_URL=https://open.feishu.cn/open-apis
```

只有 `openapi` 模式要求 App ID 和 App Secret。本地 Codex 推荐继续使用 `lark-cli`。

## 开发命令

```bash
pnpm run build          # 构建全部 workspace 和插件 bundle
pnpm run typecheck      # TypeScript 类型检查
pnpm run test:unit      # Core、飞书适配器、MCP 单元测试
pnpm run test:plugin    # 自包含插件 stdio 协议 smoke test
pnpm run check          # 完整质量门禁
pnpm run build:plugin   # 只重新生成 mcp/server.mjs
```

项目要求 Node.js `>=24.0.0`、pnpm `>=10.0.0`。

## 更新和卸载

更新源码安装：

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run check
```

Skill 使用符号链接，MCP 指向仓库内 bundle，因此不需要重新注册。重新启动 Codex 即可加载新版本。

卸载：

```bash
codex mcp remove nutty
unlink "${CODEX_HOME:-$HOME/.codex}/skills/nutty-memory"
```

卸载不会删除飞书中的记忆，也不会自动删除本地目标配置。若需要清理配置，可自行移除 `${XDG_CONFIG_HOME:-~/.config}/nutty/config.json`。

## 故障排查

### Codex 找不到 Nutty Skill

- 确认 `${CODEX_HOME:-~/.codex}/skills/nutty-memory/SKILL.md` 存在。
- 运行 `codex mcp list`，确认 `nutty` 已注册。
- 安装后重新启动 Codex 或打开新会话。

### `DESTINATION_NOT_FOUND`

尚未配置目标表。提供包含 `?table=<table_id>` 的完整飞书 Base URL，让 Nutty 调用 `configure_nutty`。

### `AUTH_REQUIRED` 或 `FORBIDDEN`

```bash
lark-cli auth status --json --verify
lark-cli auth login --domain base
```

同时确认：

- 飞书应用后台已开通错误信息列出的 scope。
- 当前用户已完成授权。
- 当前用户有目标 Base 和数据表的访问权限。

### `SCHEMA_MISMATCH`

检查四个必填字段是否存在且为文本：`Nutty ID`、`Title`、`Content`、`Content Hash`。字段名必须完全一致。

### 状态为 `degraded`

四个必填字段可让 Nutty 工作，但缺少可选字段时，部分元数据会被跳过。按“创建飞书多维表格”章节补齐字段即可恢复完整体验。

### 新类型或新标签写入失败

单选/多选字段只接受表中已经存在的选项。推荐将 `Type`、`Tags`、`Project`、`Capture Mode`、`Source` 和 `Sensitivity` 建为文本字段；或者提前创建所有需要的选项。

### 再次保存返回 `existing`

这是正常的去重结果。Nutty 对规范化后的正文计算 SHA-256，相同正文不会重复创建。

### lark-cli 版本问题

```bash
lark-cli update
lark-cli --version
```

## 项目结构

```text
openclaw-nutty/
├── packages/core/                 # 记忆模型、用例、隐私、去重、存储端口
├── packages/storage-feishu/       # 飞书 OpenAPI / lark-cli 适配器
├── apps/mcp-server/               # stdio 和 Streamable HTTP MCP
├── plugins/openai/nutty/          # Codex Skill、插件清单、自包含 MCP bundle
├── plugins/openclaw/              # 后续 OpenClaw 兼容入口
├── plugins/deepseek-harness/      # 后续 DeepSeek Harness 薄插件
├── scripts/                       # 插件构建和 smoke test
└── docs/                          # 产品、架构和运行文档
```

## 设计原则

- **用户选择优先**：只有明确要求才写入长期记忆。
- **原文优先**：标题、摘要和标签是派生数据，不覆盖原文。
- **平台薄适配**：平台负责取得可见上下文，Core 负责统一保存规则。
- **保存和召回同等重要**：MVP 同时提供写入、搜索和完整回读。
- **存储归用户所有**：飞书是当前事实来源，Nutty 不另建正文数据库。
- **凭据最小化**：本地凭据留在 `lark-cli` keychain。

更多设计背景见 [产品设计](docs/DESIGN.md)、[技术架构](docs/TECHNICAL_ARCHITECTURE.md)、[lark-cli 本地运行](docs/LARK_CLI_LOCAL_RUNTIME.md) 和 [OpenAI 插件说明](docs/OPENAI_PLUGIN.md)。OpenAI 官方将插件定义为 Skill、MCP Server 和可选 UI 的组合；Nutty 当前采用 Skill + MCP Server 这一形态，参见 [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)。

## 当前限制和路线图

1. 将 Nutty 发布到 ChatGPT/Codex 公共插件目录。
2. 为 ChatGPT Web 提供 HTTPS、标准 OAuth 和多用户远程 MCP。
3. 完成 OpenClaw MCP 兼容适配器。
4. 增加 DeepSeek Harness 薄插件。
5. 增加 Notion、Google Workspace 和本地存储适配器。
6. 增加显式确认的删除与导出能力。
7. 根据真实使用数据评估全文索引和语义召回。

## 许可证

[MIT](LICENSE)
