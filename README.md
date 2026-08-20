# Nutty

> User-controlled, cross-platform memory for AI conversations. Save only the answers, exchanges, and passages you choose, store them in Feishu Base, and recall them in a later conversation.

[简体中文](README.zh-CN.md) · [Product Design](docs/DESIGN.md) · [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)

Nutty is currently a **functional MVP / developer preview**. The Codex Skill, local MCP server, Feishu adapter, deduplication, search, recall, and update flow are implemented and have passed a real Feishu end-to-end test. Public distribution through the ChatGPT/Codex plugin directory is not finished yet.

## What is Nutty?

AI conversations produce valuable answers, decisions, preferences, and project context every day, but that knowledge usually remains scattered across chat histories. Nutty turns the content **you explicitly select** into an independent, searchable, and portable memory store.

You can say:

```text
Nutty, save the previous answer.
Nutty, save this exchange as an architecture decision for openclaw-nutty.
Nutty, find the MCP authentication plan I saved earlier.
Nutty, change the last memory's tags to mcp and security.
```

Nutty does not record every conversation by default. It does not save system prompts, hidden reasoning, tool traces, or authentication data.

## MVP status

| Capability | Status |
|---|---|
| Unified memory model, validation, content hashing, and deduplication | ✅ Complete |
| Capture previous answer, current exchange, selection, or manual content | ✅ Complete |
| Search, full recall, and updates | ✅ Complete |
| Feishu Base storage adapter | ✅ Complete |
| Local `lark-cli` keychain authentication without storing App Secret | ✅ Complete |
| Codex Skill and self-contained stdio MCP bundle | ✅ Complete |
| Standalone Streamable HTTP MCP server | ✅ Complete |
| Real Feishu create, deduplicate, search, and recall test | ✅ Passed |
| Public ChatGPT/Codex plugin directory release | ⏳ Pending |
| ChatGPT Web remote OAuth/HTTPS deployment | ⏳ Later phase |
| OpenClaw MCP adapter and DeepSeek Harness plugin | ⏳ Later phase |
| Notion, Google Workspace, and local storage | ⏳ Later phase |

## How it works

```text
User explicitly selects content
        │
        ▼
Codex Skill: resolves the content and capture mode
        │
        ▼
Nutty MCP: validates, deduplicates, searches, and updates
        │
        ▼
Nutty Core: applies the shared memory model and privacy policy
        │
        ▼
Feishu adapter → lark-cli keychain → Feishu Base
```

Local Codex uses `stdio + lark-cli`. The Skill decides what “the previous answer” means from visible conversation context. MCP tools control external writes. Core keeps the data and safety rules consistent.

## Quick start: from source to your first saved memory

Nutty is not yet published in the public plugin directory. The current recommended path is a **source installation** that installs the same Nutty Skill and registers the self-contained MCP bundle with Codex.

### 1. Prerequisites

- Git
- Node.js `>= 24`
- pnpm `>= 10`
- A working Codex CLI installation
- A Feishu Base table you can read and edit

Check versions:

```bash
node --version
pnpm --version
codex --version
```

If Node.js is installed but pnpm is not:

```bash
corepack enable
corepack prepare pnpm@10.23.0 --activate
```

### 2. Clone, install, and build

```bash
git clone https://github.com/dethan3/openclaw-nutty.git
cd openclaw-nutty
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm run check` builds every workspace, runs TypeScript checks, unit tests, and the plugin protocol smoke test. The generated self-contained MCP bundle is:

```text
plugins/openai/nutty/mcp/server.mjs
```

### 3. Install and authenticate lark-cli

Nutty's local mode uses the current operating-system user's `lark-cli` keychain. Nutty does not need to read or store `FEISHU_APP_SECRET`.

```bash
npm install -g @larksuite/cli
lark-cli --version
lark-cli config init --new
lark-cli auth login --domain base
lark-cli auth status --json --verify
```

Notes:

- `config init --new` guides you through creating or configuring a Feishu application.
- `auth login --domain base` requests only the Base business-domain permissions.
- If the CLI returns missing scopes and a developer-console URL, enable those scopes for the app, then authorize again.
- Nutty defaults to `--as user`; the authenticated user must also be a collaborator on the target Base.
- Upgrade later with `lark-cli update`.

### 4. Create the Feishu Base schema

Create one Base and one table. Field names are case-sensitive. Keep the English names below unchanged.

The minimum working schema has four required text fields:

| Field | Feishu type | Purpose |
|---|---|---|
| `Nutty ID` | Text | Stable Nutty UUID |
| `Title` | Text; may be the primary field | Memory title |
| `Content` | Text | Original user-selected content |
| `Content Hash` | Text | SHA-256 deduplication fingerprint |

For the complete experience, create all fields below:

| Field | Recommended type | Accepted type | Purpose |
|---|---|---|---|
| `Nutty ID` | Text | Text | Required |
| `Title` | Text | Text | Required; may be primary |
| `Content` | Text | Text | Required |
| `Content Hash` | Text | Text | Required |
| `User Prompt` | Text | Text | User side of an exchange |
| `Assistant Response` | Text | Text | Assistant side of an exchange |
| `User Note` | Text | Text | User annotation |
| `Summary` | Text | Text | Derived summary |
| `Type` | Text | Text or single select | Memory type |
| `Tags` | Text | Text or multiple select | Tags; text allows arbitrary new tags |
| `Project` | Text | Text or single select | Project name |
| `Capture Mode` | Text | Text or single select | Capture method |
| `Source` | Text | Text or single select | Source surface |
| `Source Details` | Text | Text | Source JSON |
| `Sensitivity` | Text | Text or single select | Sensitivity level |
| `Schema Version` | Number | Text or number | Currently `1` |
| `Created At` | Date/time | Text or date/time | Creation time |
| `Updated At` | Date/time | Text or date/time | Last update time |

If you use select fields, create every value Nutty may write:

- `Type`: `conversation`, `decision`, `insight`, `reference`, `task`, `project`, `preference`, `inbox`
- `Capture Mode`: `previous_answer`, `current_exchange`, `selection`, `manual`
- `Source`: `chatgpt`, `codex`, `openclaw`, `deepseek-harness`, `other`
- `Sensitivity`: `normal`, `private`, `restricted`

Use a text field for `Tags` if you want the model to create new tags freely. Feishu rejects unknown options in a multiple-select field.

Copy the table's **full URL**, including its `table` parameter:

```text
https://your-tenant.feishu.cn/base/<base_token>?table=<table_id>
```

### 5. Register Nutty with Codex

Run from the repository root:

```bash
export NUTTY_REPO="$(pwd)"
export NUTTY_CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"

mkdir -p "$NUTTY_CODEX_HOME/skills"
ln -s "$NUTTY_REPO/plugins/openai/nutty/skills/nutty-memory" \
  "$NUTTY_CODEX_HOME/skills/nutty-memory"

codex mcp add nutty -- node "$NUTTY_REPO/plugins/openai/nutty/mcp/server.mjs"
codex mcp list
```

This source-development installation keeps the Skill linked to the repository, while MCP points to the generated bundle.

After installation, **restart Codex or open a new session**. A session that was already running will not automatically load a newly installed Skill.

### 6. Connect Nutty to Feishu

In a new Codex conversation, say:

```text
Use Nutty to check its status. If it is not configured, use this full URL as the destination:
https://your-tenant.feishu.cn/base/<base_token>?table=<table_id>
```

Nutty calls `configure_nutty`, validates access and schema, and writes non-secret destination metadata to:

```text
${XDG_CONFIG_HOME:-~/.config}/nutty/config.json
```

The file mode is `0600`. It contains the Base token, table ID, and local runtime options only. User access tokens, refresh tokens, and App Secret stay in the `lark-cli` keychain.

### 7. Save and recall your first memory

```text
Nutty, save the previous answer.
```

Then search for it:

```text
Nutty, search for the memory I just saved.
```

On success, Nutty returns the title and Feishu record link. Saving the same normalized content again returns `existing` instead of creating a duplicate.

## Everyday usage

### Save the previous answer

```text
Nutty, save the previous answer as an insight for the openclaw-nutty project.
```

Nutty uses `captureMode: previous_answer` and saves only the immediately preceding user-visible assistant response.

### Save the current exchange

```text
Nutty, save this exchange as an architecture decision.
```

Nutty uses `captureMode: current_exchange` and preserves both the user prompt and assistant response.

### Save a specific passage

```text
Nutty, save only this passage:
“The platform adapter decides which conversation content to save; Core decides how to save it safely and consistently.”
```

### Search and recall

```text
Nutty, search the openclaw-nutty project for memories about MCP authentication.
Nutty, open the most relevant result and summarize it for me.
```

The Skill searches first, then fetches a full memory only after identifying the relevant result.

### Update a memory

```text
Nutty, rename that memory to “Nutty MCP authentication decision” and set its tags to mcp and security.
```

Title, summary, type, tags, project, and sensitivity can be updated directly. Replacing original content requires explicit user confirmation and `replaceOriginal: true`.

## MCP tool reference

| Tool | Purpose | Writes data? |
|---|---|---|
| `get_nutty_status` | Check local configuration and Feishu health | No |
| `configure_nutty` | Configure a destination from a full Base URL | Local config only |
| `save_memory` | Save a memory and deduplicate normalized content | Yes |
| `search_memories` | Filter by text, type, tags, project, source, and time | No |
| `get_memory` | Read a complete memory by Nutty UUID | No |
| `update_memory` | Update derived fields or replace original content after confirmation | Yes |
| `list_destinations` | List configured storage and capabilities | No |

The MVP does not expose a delete tool. Delete records directly in Feishu for now. A future release will add deletion with an explicit confirmation gate.

## Data reference

Memory types:

```text
conversation | decision | insight | reference |
task | project | preference | inbox
```

Capture modes:

```text
previous_answer | current_exchange | selection | manual
```

Source surfaces:

```text
chatgpt | codex | openclaw | deepseek-harness | other
```

Privacy and sensitive content:

- Nutty saves only user-selected, user-visible content.
- It excludes system/developer prompts, hidden reasoning, tool traces, credentials, and identity metadata.
- Content matching private keys, API keys, access tokens, client secrets, or password patterns requires a second confirmation.
- Sensitive confirmation tokens bind the user, destination, and content hash, and expire after five minutes.
- Content length is checked against the selected destination before every write. Feishu text cells allow up to 100,000 characters; titles remain limited to 240, summaries to 2,000, and tags to 20 per memory.

## Standalone HTTP MCP server

Local plugin mode does not require `.env.local`. The standalone HTTP server does:

```bash
cp apps/mcp-server/.env.example apps/mcp-server/.env.local
```

Edit `apps/mcp-server/.env.local`:

```dotenv
NUTTY_HOST=127.0.0.1
NUTTY_PORT=3000
NUTTY_ALLOWED_HOSTS=localhost,127.0.0.1
NUTTY_PERSONAL_TOKEN=<random value of at least 32 characters>
NUTTY_PRINCIPAL_ID=personal
NUTTY_CONFIRMATION_SECRET=<random value of at least 32 characters>
NUTTY_DESTINATION_ID=feishu-default

FEISHU_TRANSPORT=lark-cli
FEISHU_APP_TOKEN=<base_token>
FEISHU_TABLE_ID=<table_id>
FEISHU_WEB_BASE_URL=https://your-tenant.feishu.cn/base
FEISHU_LARK_CLI_BINARY=lark-cli
FEISHU_LARK_CLI_IDENTITY=user
FEISHU_LARK_CLI_TIMEOUT_MS=30000
```

Generate random values with:

```bash
openssl rand -hex 32
```

Start the server:

```bash
pnpm run build
pnpm --filter @nutty/mcp-server start
```

Check process and storage health:

```bash
curl http://127.0.0.1:3000/health
curl -H "Authorization: Bearer <NUTTY_PERSONAL_TOKEN>" \
  http://127.0.0.1:3000/health/storage
```

HTTP endpoints:

| Path | Authentication | Purpose |
|---|---|---|
| `GET /health` | None | Process health |
| `GET /health/storage` | Bearer token | Feishu storage health |
| `GET /metrics` | Bearer token | MCP invocation metrics |
| `POST /mcp` | Bearer token | Streamable HTTP MCP |

The current HTTP profile is a single-user personal profile. Do not expose it directly to the public internet. A production ChatGPT Web deployment still needs HTTPS, standard user authorization, and remote deployment hardening.

### OpenAPI transport

For server environments that cannot use a local keychain:

```dotenv
FEISHU_TRANSPORT=openapi
FEISHU_APP_ID=<app_id>
FEISHU_APP_SECRET=<app_secret>
FEISHU_API_BASE_URL=https://open.feishu.cn/open-apis
```

Only `openapi` mode requires App ID and App Secret. Local Codex should normally use `lark-cli`.

## Development commands

```bash
pnpm run build          # Build all workspaces and the plugin bundle
pnpm run typecheck      # Run TypeScript type checking
pnpm run test:unit      # Test Core, Feishu adapter, and MCP server
pnpm run test:plugin    # Smoke-test the self-contained stdio plugin
pnpm run check          # Run the complete quality gate
pnpm run build:plugin   # Regenerate only mcp/server.mjs
```

The project requires Node.js `>=24.0.0` and pnpm `>=10.0.0`.

## Update and uninstall

Update a source installation:

```bash
git pull --ff-only
pnpm install --frozen-lockfile
pnpm run check
```

The Skill is symlinked and MCP points to the repository bundle, so no registration change is needed. Restart Codex to load the new version.

Uninstall:

```bash
codex mcp remove nutty
unlink "${CODEX_HOME:-$HOME/.codex}/skills/nutty-memory"
```

Uninstalling does not remove memories from Feishu or automatically remove local destination metadata. Remove `${XDG_CONFIG_HOME:-~/.config}/nutty/config.json` yourself if you also want to clear the local configuration.

## Troubleshooting

### Codex cannot find the Nutty Skill

- Confirm `${CODEX_HOME:-~/.codex}/skills/nutty-memory/SKILL.md` exists.
- Run `codex mcp list` and confirm `nutty` is registered.
- Restart Codex or open a new session after installation.

### `DESTINATION_NOT_FOUND`

No destination is configured. Give Nutty the full Feishu Base URL containing `?table=<table_id>` so it can call `configure_nutty`.

### `AUTH_REQUIRED` or `FORBIDDEN`

```bash
lark-cli auth status --json --verify
lark-cli auth login --domain base
```

Also confirm that:

- The Feishu app has every scope named in the error.
- The current user completed authorization.
- The current user can access the target Base and table.

### `SCHEMA_MISMATCH`

Confirm the four required text fields exist with exact names: `Nutty ID`, `Title`, `Content`, and `Content Hash`.

### Status is `degraded`

The four required fields let Nutty work, but missing optional fields cause some metadata to be skipped. Add the fields from the full schema table to restore the complete experience.

### A new type or tag fails to save

Single-select and multiple-select fields only accept options that already exist. Prefer text fields for `Type`, `Tags`, `Project`, `Capture Mode`, `Source`, and `Sensitivity`, or pre-create every option you plan to use.

### Saving again returns `existing`

This is the expected deduplication result. Nutty calculates SHA-256 over normalized content and does not create another record for the same body.

### lark-cli version problems

```bash
lark-cli update
lark-cli --version
```

## Repository layout

```text
openclaw-nutty/
├── packages/core/                 # Model, use cases, privacy, dedupe, storage port
├── packages/storage-feishu/       # Feishu OpenAPI and lark-cli adapter
├── apps/mcp-server/               # stdio and Streamable HTTP MCP
├── plugins/openai/nutty/          # Codex Skill, manifest, self-contained MCP
├── plugins/openclaw/              # Planned OpenClaw compatibility adapter
├── plugins/deepseek-harness/      # Planned DeepSeek Harness thin plugin
├── scripts/                       # Plugin build and smoke test
└── docs/                          # Product, architecture, and runtime docs
```

## Design principles

- **User choice first:** nothing enters long-term memory without an explicit request.
- **Original content first:** title, summary, and tags never replace the source text.
- **Thin platform adapters:** platforms resolve visible context; Core owns shared persistence rules.
- **Save and recall together:** the MVP includes write, search, and full recall.
- **User-owned storage:** Feishu is the current source of truth; Nutty does not keep a second body database.
- **Minimal credentials:** local credentials stay in the `lark-cli` keychain.

Read [Product Design](docs/DESIGN.md), [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md), [lark-cli Local Runtime](docs/LARK_CLI_LOCAL_RUNTIME.md), and [OpenAI Plugin](docs/OPENAI_PLUGIN.md) for more detail. OpenAI describes a plugin as a package containing Skills, an MCP server, optional UI, or a combination of those pieces. Nutty currently uses the Skill + MCP Server shape; see the official [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins).

## Current limitations and roadmap

1. Publish Nutty in the shared ChatGPT/Codex plugin directory.
2. Add HTTPS, standard OAuth, and multi-user remote MCP for ChatGPT Web.
3. Complete the OpenClaw MCP compatibility adapter.
4. Add the DeepSeek Harness thin plugin.
5. Add Notion, Google Workspace, and local storage adapters.
6. Add explicitly confirmed deletion and export.
7. Evaluate full-text indexing and semantic recall from real usage data.

## License

[MIT](LICENSE)
