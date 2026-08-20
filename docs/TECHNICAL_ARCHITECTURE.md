# Nutty 技术架构设计

> 状态：实施中；Phase B-D 已完成代码与自动化测试，CI 与真实飞书测试 Base 联调待执行
>
> 更新日期：2026-08-19
>
> 范围：Nutty Core、MCP Server、Skills、平台插件、存储适配器和部署

## 1. 架构结论

Nutty 采用 TypeScript 单仓库和模块化单体架构。首期只部署一个 MCP Server，不拆微服务。

系统分成五层：

1. **Core**：纯业务规则、数据模型、用例和端口，不依赖 AI 平台或笔记服务。
2. **MCP Server**：统一远程边界，负责工具协议、认证、授权、输入校验和组合依赖。
3. **Skills**：告诉模型何时捕获或召回、如何取得当前会话内容、如何调用 MCP 工具。
4. **Platform Adapters**：连接 ChatGPT/Codex、OpenClaw 和 DeepSeek Harness，只负责平台上下文。
5. **Storage Adapters**：连接飞书、Notion、Google Workspace 或本地存储，实现统一存储端口。

```text
AI 平台
  │
  │  Skill / 原生插件收集用户可见上下文
  ▼
MCP tools
  │
  ▼
Nutty application use cases
  │
  ▼
StoragePort
  │
  ├── FeishuAdapter        MVP
  ├── NotionAdapter        later
  ├── GoogleAdapter        later
  └── LocalAdapter         later
```

最重要的边界是：**平台适配器决定“保存哪段会话”，Core 决定“如何安全、稳定地保存一条记忆”。**

## 2. 约束和假设

### 2.1 当前约束

- 当前仓库只有 OpenClaw `SKILL.md`，没有应用代码和运行时依赖。
- MVP 优先支持 ChatGPT/Codex 和飞书多维表格。
- DeepSeek Harness 是第二个平台适配器，但不能成为 Core 的依赖。
- 用户明确触发捕获，不默认记录所有会话。
- 飞书是 MVP 的事实来源，Nutty 首期不维护第二份正文数据库。
- 搜索必须与保存同时进入 MVP。

### 2.2 OpenAI 插件约束

根据当前官方 OpenAI 文档：

- Plugin 可以组合 Skills 和 MCP Server。
- ChatGPT 与 Codex 使用统一的公开插件目录。
- 每个插件需要 `.codex-plugin/plugin.json`。
- Skill 依赖的远程 MCP 工具可以在 `agents/openai.yaml` 中声明。
- MCP Server 使用 Streamable HTTP 暴露远程工具。

参考：

- [Plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Build skills](https://developers.openai.com/plugins/build/skills)
- [Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)

### 2.3 不做的假设

- 不假设 MCP Server 能主动读取 ChatGPT 或 Codex 的完整会话历史。
- 不假设所有平台都能提供稳定的会话 ID、消息 ID 或会话 URL。
- 不假设所有存储端都有相同的全文搜索、事务或字段类型。
- 不假设模型生成的标题、标签和分类一定正确。
- 不假设外部写入超时等于写入失败。

## 3. 技术选型

### 3.1 语言和运行时

首选 TypeScript 和 Node.js 当前活跃 LTS，实施时在 `engines` 和锁文件中固定版本。

选择理由：

- 官方 MCP TypeScript SDK 可直接使用。
- OpenAI 插件和 DeepSeek Harness 都适合使用 JavaScript/TypeScript 生态集成。
- Zod 可以让运行时校验和 TypeScript 类型共享一份定义。
- 飞书、Notion 和 Google 都有成熟的 HTTP 或 Node SDK。
- 一个运行时可以覆盖 Core、MCP Server、适配器和测试。

### 3.2 仓库和构建

- `pnpm` workspace 管理单仓库。
- TypeScript project references 或等价工作区构建管理依赖顺序。
- Zod 定义公开输入输出 Schema。
- Vitest 承担单元和集成测试。
- ESLint、Prettier 和 TypeScript strict mode 作为基础质量门禁。
- MCP Server 产出容器镜像；Skills 和插件清单作为静态发布产物。

### 3.3 暂不引入

- 消息队列。
- 微服务。
- PostgreSQL。
- 向量数据库。
- 服务端第二次 LLM 调用。
- 自定义前端 UI。

这些组件只有在真实使用数据证明需要时才加入。

## 4. 仓库结构

建议逐步迁移为以下结构：

```text
openclaw-nutty/
├── apps/
│   └── mcp-server/
│       ├── src/
│       │   ├── auth/
│       │   ├── tools/
│       │   ├── transport/
│       │   ├── observability/
│       │   └── main.ts
│       └── tests/
├── packages/
│   ├── core/
│   │   ├── src/
│   │   │   ├── domain/
│   │   │   ├── application/
│   │   │   ├── ports/
│   │   │   ├── policies/
│   │   │   └── errors/
│   │   └── tests/
│   └── storage-feishu/
│       ├── src/
│       └── tests/
├── plugins/
│   ├── openai/
│   │   ├── .codex-plugin/plugin.json
│   │   ├── .app.json
│   │   ├── agents/openai.yaml
│   │   └── skills/
│   │       ├── nutty-capture/SKILL.md
│   │       └── nutty-recall/SKILL.md
│   ├── deepseek-harness/          # 第二阶段
│   └── openclaw/                  # 现有 Skill 的兼容入口
├── tests/
│   ├── contract/
│   ├── e2e/
│   └── evals/
├── docs/
├── package.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

首期不创建独立的 `contracts` 包。Core 直接导出领域类型、端口和 Zod Schema，减少过早拆包。只有出现第二个独立发布的 TypeScript 客户端时，才提取 `@nutty/contracts`。

## 5. 依赖方向

依赖必须单向指向 Core：

```text
plugins/openai ───────────────┐
plugins/openclaw ─────────────┼── MCP protocol ──► apps/mcp-server
plugins/deepseek-harness ─────┘                       │
                                                     ▼
                                             packages/core
                                                     ▲
                                                     │ implements port
                                        packages/storage-feishu
```

编译期依赖：

```text
apps/mcp-server          -> packages/core
apps/mcp-server          -> packages/storage-feishu
packages/storage-feishu  -> packages/core
packages/core            -> no provider package
plugins/*                -> no Core import for remote deployments
```

禁止的依赖：

- Core 导入 MCP SDK。
- Core 导入飞书、Notion 或 Google SDK。
- Storage Adapter 调用模型或读取会话。
- Skill 包含第三方凭据或直接实现 HTTP API。
- DeepSeek Harness 插件绕过 MCP Server 直接写入飞书。

## 6. Core 设计

### 6.1 Core 的职责

Core 是一个无网络、无数据库、无平台 SDK 的 TypeScript 包，负责：

- Memory 领域模型和 Schema。
- 保存、搜索、读取、更新和删除用例。
- 内容规范化和哈希。
- 幂等判断和重复处理。
- 隐私检测策略。
- 分类、标签和标题的校验。
- 存储能力协商。
- 统一错误类型。

Core 不负责：

- HTTP 或 MCP 连接。
- 用户登录和 OAuth 回调。
- 飞书字段 ID。
- 获取“上一条回答”。
- 调用另一个 LLM 生成摘要。
- 输出宠物语气的最终回复。

### 6.2 领域对象

```ts
type Memory = {
  id: string;
  title: string;
  content: string;
  userPrompt?: string;
  assistantResponse?: string;
  userNote?: string;
  summary?: string;
  type: MemoryType;
  tags: string[];
  project?: string;
  captureMode: CaptureMode;
  source: MemorySource;
  sensitivity: Sensitivity;
  contentHash: string;
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  externalRefs: ExternalRef[];
};
```

当前实现位于 `packages/core`，公开字段继续以本节契约为准。

`MemoryType` 首期取值：

```text
conversation | decision | insight | reference |
task | project | preference | inbox
```

`CaptureMode` 首期取值：

```text
previous_answer | current_exchange | selection | manual
```

### 6.3 来源对象

```ts
type MemorySource = {
  surface: "chatgpt" | "codex" | "openclaw" | "deepseek-harness" | "other";
  conversationId?: string;
  userMessageId?: string;
  assistantMessageId?: string;
  conversationUrl?: string;
  model?: string;
};
```

缺失字段保持为空。Core 不允许平台适配器用标题或内容哈希伪造平台消息 ID。

### 6.4 应用用例

Core 公开六个用例：

```text
SaveMemory
SearchMemories
GetMemory
UpdateMemory
DeleteMemory
ListDestinations
```

MVP 对外开放 Save、Search、Get、Update 和 ListDestinations；可以暂缓开放 `DeleteMemory`，但 Core 的端口从第一天保留删除语义，避免以后无法兑现数据所有权。

### 6.5 端口

```ts
interface StoragePort {
  capabilities(): Promise<StorageCapabilities>;
  findByHash(scope: StorageScope, hash: string): Promise<StoredMemory | null>;
  create(memory: Memory, options: CreateOptions): Promise<StoredMemory>;
  get(id: string): Promise<StoredMemory | null>;
  search(query: MemoryQuery): Promise<SearchPage>;
  update(id: string, patch: MemoryPatch, expectedVersion?: string): Promise<StoredMemory>;
  delete(id: string): Promise<void>;
  health(): Promise<StorageHealth>;
}
```

`StorageCapabilities` 至少声明：

- 是否支持全文搜索。
- 是否支持结构化过滤。
- 是否支持乐观并发控制。
- 是否支持软删除。
- 单条正文最大尺寸。
- 支持的字段类型。

Core 根据能力返回明确限制，不模拟存储端不存在的能力。

## 7. MCP Server 设计

### 7.1 角色

MCP Server 是所有平台的统一运行时边界。它组合 Core 和 Storage Adapter，并负责 Core 不应该知道的基础设施问题。

```text
Streamable HTTP /mcp
        │
        ▼
Authentication middleware
        │ Principal
        ▼
MCP tool handler
        │ validated input
        ▼
Application use case
        │ StoragePort
        ▼
Provider adapter
```

### 7.2 MCP 工具

#### `save_memory`

保存明确提供的内容。它不接受“previous”作为没有正文的指令。

必填输入：

- `content`
- `capture_mode`
- `source.surface`

可选输入：

- `user_prompt`
- `assistant_response`
- `user_note`
- `title`
- `summary`
- `type`
- `tags`
- `project`
- `destination_id`
- 可验证的来源消息信息

`destination_id` 缺失时，服务端从当前用户配置解析默认目标；没有默认目标时返回明确错误，不让模型猜测。服务端从认证上下文获得 `principal` 和租户范围。工具输入不得接受 `user_id` 或 `tenant_id`，避免模型越权指定身份。

#### `search_memories`

支持：

- 查询文本。
- 类型、标签、项目和来源过滤。
- 时间范围。
- 游标分页。
- 有上限的 `limit`。

默认只返回摘要信息。完整正文由 `get_memory` 获取。

#### `get_memory`

按 Nutty ID 或受当前用户约束的外部引用读取完整记忆。

#### `update_memory`

默认只能更新派生字段。覆盖 `content`、`user_prompt` 或 `assistant_response` 必须使用显式的 `replace_original: true`，并由 Skill 再次确认。

#### `list_destinations`

返回用户可以使用的目标和能力，不返回第三方令牌、飞书 App Secret 或内部字段 ID。

#### 后续工具

- `delete_memory`
- `export_memories`
- `suggest_memories`

### 7.3 工具注解

| 工具 | readOnly | destructive | openWorld |
|---|---:|---:|---:|
| `save_memory` | false | false | true |
| `search_memories` | true | false | false |
| `get_memory` | true | false | false |
| `update_memory` | false | false | true |
| `list_destinations` | true | false | false |
| `delete_memory` | false | true | true |

注解辅助模型和宿主选择安全行为，但不能替代服务端授权、校验和确认。

### 7.4 错误契约

所有工具返回稳定错误码和安全的用户消息：

```text
INVALID_INPUT
AUTH_REQUIRED
FORBIDDEN
DESTINATION_NOT_FOUND
DESTINATION_UNAVAILABLE
SCHEMA_MISMATCH
CONTENT_TOO_LARGE
SENSITIVE_CONTENT_CONFIRMATION_REQUIRED
CONFLICT
RATE_LIMITED
PROVIDER_TIMEOUT
PARTIAL_WRITE
INTERNAL_ERROR
```

错误响应包含：

- `code`
- `retryable`
- `request_id`
- 可安全展示的 `message`
- 可选 `recovery_action`

错误响应不包含第三方响应正文、Token、内部栈或用户无权查看的记录。

## 8. Skills 设计

首期拆为两个 Skill，而不是继续把所有行为放在一个大 Skill 中。

### 8.1 `nutty-capture`

触发目标：保存上一个回答、当前问答、选中片段或用户直接提供的内容。

职责：

- 根据当前平台能力取得用户可见正文。
- 区分原始正文和 AI 派生字段。
- 解析显式目标、标签、项目和备注。
- 在敏感、超长或范围不明确时请求确认。
- 调用一次 `save_memory`。
- 用用户语言报告实际写入结果。

不允许：

- 只传“上一条回答”而不传正文。
- 声称取得平台没有提供的消息 ID。
- 在工具返回失败时回复“已保存”。
- 保存隐藏推理或系统提示词。

### 8.2 `nutty-recall`

触发目标：查找、读取、比较或把已有记忆带入当前任务。

职责：

- 先调用 `search_memories`。
- 只对用户选定或高相关记录调用 `get_memory`。
- 显示来源和存储目标。
- 明确区分已保存事实与当前模型推论。
- 在注入大量正文前控制上下文预算。

### 8.3 后续 `nutty-manage`

更新原文、删除、导出和批量整理具有不同的权限与确认要求，后续放入独立管理 Skill。

### 8.4 Skill 测试

每个 Skill 都需要离线 eval 集合：

- 应触发的直接请求。
- 应触发的间接请求。
- 不应触发的闲聊和普通问答。
- 缺少上一条回答的请求。
- 只保存选中片段的请求。
- 含疑似密钥的请求。
- 写入失败和重复记录。
- 多语言请求。
- 不得编造消息 ID 或保存状态的反例。

## 9. 平台适配器

### 9.1 OpenAI Plugin

OpenAI Plugin 是静态插件包，不承载业务服务：

```text
plugins/openai/
├── .codex-plugin/plugin.json
├── .app.json
├── agents/openai.yaml
└── skills/
    ├── nutty-capture/SKILL.md
    └── nutty-recall/SKILL.md
```

职责：

- 声明插件身份和展示信息。
- 声明远程 MCP Server 连接。
- 打包两个 Skills。
- 提供 ChatGPT/Codex 共用的自然语言入口。

`.app.json`、`agents/openai.yaml` 和部署配置必须引用同一个 MCP 连接定义或由同一份配置生成，避免 ChatGPT 与 Codex 指向不同环境。任何文件都不写入用户凭据。

OpenAI Plugin 不保存用户数据，也不复制 Core 代码。

### 9.2 DeepSeek Harness Plugin

第二阶段实现一个原生插件，监听用户可见会话事件，构造与 `save_memory` 相同的请求。

```text
Harness visible event
       │ filter roles and visibility
       ▼
CaptureEnvelope
       │ MCP client
       ▼
Nutty MCP Server
```

必须在适配器内过滤：

- 系统提示词。
- 隐藏推理。
- 工具内部参数。
- 子 Agent 私密上下文。
- 未展示给用户的中间事件。

即使 Harness 允许本地直接加载 TypeScript 包，第一版也通过 MCP 调用 Core。这样所有平台共享相同的授权、隐私和幂等路径。

### 9.3 OpenClaw Adapter

保留当前根目录 `SKILL.md` 作为迁移来源。后续新增兼容 Skill，通过 MCP 工具写入，不再依赖宿主恰好安装某组飞书工具。

迁移期间禁止同时让旧 Skill 和新 MCP 路径处理同一次请求。使用显式配置选择一种写入方式。

## 10. 飞书存储适配器

### 10.1 目标结构

MVP 推荐单一 `Memories` 表：

| 逻辑字段 | 飞书字段建议 | 用途 |
|---|---|---|
| `id` | Nutty ID | 稳定主键 |
| `title` | Title | 主标题 |
| `content` | Content | 需要保存的原文主体 |
| `userPrompt` | User Prompt | 用户问题原文 |
| `assistantResponse` | Assistant Response | AI 回答原文 |
| `summary` | Summary | 派生摘要 |
| `type` | Type | 单选分类 |
| `tags` | Tags | 多选标签 |
| `project` | Project | 关联项目 |
| `captureMode` | Capture Mode | 捕获方式 |
| `source.surface` | Source | 来源平台 |
| 来源消息信息 | Conversation/Message IDs | 可选追溯信息 |
| `contentHash` | Content Hash | 幂等和去重 |
| `sensitivity` | Sensitivity | 敏感级别 |
| `schemaVersion` | Schema Version | 迁移版本 |
| 时间字段 | Created/Updated At | 审计时间 |

### 10.2 Schema Registry

适配器启动时不自动创建或破坏字段。它执行：

```text
inspect schema
   │
   ├── compatible ──► ready
   ├── missing optional fields ──► ready with warnings
   ├── missing required fields ──► SCHEMA_MISMATCH
   └── destructive mismatch ─────► migration required
```

字段 ID 和表 ID 只存在于适配器配置中，不进入 Skill、Core 或工具响应。

### 10.3 Provider 行为

- 先按当前用户范围和 `contentHash` 检查重复。
- 写入使用客户端生成的 Nutty ID。
- 遇到 429、短暂 5xx 或网络错误时执行有上限重试。
- 超时后先按 Nutty ID 或 Hash 对账，避免重复写入。
- 字段缺失时只跳过可选字段。
- 必填字段缺失时拒绝写入并返回 Schema 错误。

### 10.4 旧表兼容

现有 Links、Ideas、Projects、Tasks 和 Inbox 使用 `legacy` 适配配置支持，不进入 Core 分支逻辑。

```text
StorageProfile = unified | legacy
```

`legacy` 只负责字段映射。Core 仍然处理统一 Memory，不恢复五套领域模型。

## 11. 保存数据流

```text
User: “Nutty，保存上一个回答”
  │
  ▼
nutty-capture Skill
  ├── 找到用户可见的上一条回答
  ├── 保留原文
  └── 构造 save_memory 输入
  │
  ▼
MCP Server
  ├── 认证 -> Principal
  ├── Zod 校验
  ├── 解析 destination_id
  └── 调用 SaveMemory
  │
  ▼
Core SaveMemory
  ├── normalize
  ├── privacy scan
  ├── content hash
  ├── duplicate lookup
  └── StoragePort.create
  │
  ▼
FeishuAdapter
  ├── resolve field IDs
  ├── write record
  └── return external ref
  │
  ▼
Tool result -> Skill confirmation -> User
```

### 11.1 敏感内容分支

```text
privacy scan detects probable secret
  │
  ▼
return SENSITIVE_CONTENT_CONFIRMATION_REQUIRED
  │ no write happened
  ▼
Skill asks the user
  │ explicit confirmation
  ▼
second save_memory call with a short-lived confirmation token
```

确认令牌绑定内容 Hash、用户、目标和过期时间。工具不能只接受一个可由模型自行设置的 `allow_sensitive: true`。

Personal Profile 可以使用服务端密钥签名的短期令牌，不需要为确认流程增加数据库。

### 11.2 幂等键

优先级：

```text
source message IDs + capture mode + destination
                │ unavailable
                ▼
normalized content hash + user scope + destination
```

相同幂等键再次提交时返回已有记录。用户明确要求“另存一份”时生成新的保存意图 ID。

Personal Profile 固定运行一个 MCP Server 副本，并使用进程内按幂等键加锁，避免并发双写。Hosted Profile 扩展到多个副本前，必须增加共享幂等存储或具有唯一约束的内部索引，不能依赖进程内锁。

## 12. 检索数据流

```text
User query
  │
  ▼
nutty-recall Skill
  │ search_memories(query, filters, limit)
  ▼
Core SearchMemories
  │ StoragePort.search
  ▼
FeishuAdapter
  ├── provider-native filter/search
  └── bounded page results
  │
  ▼
summary results
  │ user/model selects relevant IDs
  ▼
get_memory for selected records only
```

MVP 不引入向量检索。先使用结构化过滤、标题、摘要和有界关键词匹配。只有真实搜索失败数据证明需要语义索引时，才增加独立索引层。

## 13. 一致性和并发

### 13.1 单目标写入

MVP 一次只写一个主目标，使用同步请求。成功条件是目标存储返回可识别的外部记录引用。

### 13.2 多目标写入

后续版本不做跨存储分布式事务，采用：

```text
primary destination: required
replica destinations: best effort
```

主目标失败则整体失败。主目标成功但副本失败时返回 `PARTIAL_WRITE`，列出每个目标状态，禁止回复“全部保存成功”。

### 13.3 更新冲突

`update_memory` 接受可选版本或更新时间。存储端支持时执行乐观并发控制；不支持时，适配器先读取并比较上次看到的更新时间。

冲突返回 `CONFLICT`，不使用最后写入覆盖。

### 13.4 删除

删除属于明确的破坏性操作：

- 必须确认记录和目标。
- 记录审计元数据，但不在日志中保留已删除正文。
- 多目标删除必须返回逐目标结果。
- 支持软删除的存储端优先软删除。

## 14. 认证和授权

### 14.1 两种部署 Profile

#### Personal Profile

用于最早验证：

- 单用户 MCP Server。
- 飞书凭据来自部署环境的 Secret。
- 只允许受控客户端访问。
- 不提供公共注册。

#### Hosted Profile

用于多人产品：

- OAuth 2.1 用户认证。
- 每个请求生成不可伪造的 `Principal`。
- 第三方连接凭据加密存储。
- 所有记录查询包含租户和用户范围。
- OAuth 回调、撤销、轮换和审计独立测试。

MVP 先实现 Personal Profile，但 Core 和 MCP Handler 不硬编码单一用户。单用户身份由 Composition Root 注入。

### 14.2 信任边界

```text
Untrusted:
  model-generated tool input
  captured webpage text
  user-provided content
  provider API responses

Trusted only after validation:
  Principal from auth middleware
  destination config resolved server-side
  normalized Memory validated by Core
```

用户身份、租户、授权范围和真实字段 ID 永远不由模型决定。

## 15. 隐私和安全

### 15.1 内容规则

Nutty 不保存：

- 隐藏推理和思维链。
- 系统提示词。
- OAuth Token、API Key、Cookie 和密码。
- 与用户目标无关的工具内部参数。
- 平台没有展示给用户的中间事件。

### 15.2 分层保护

```text
Skill policy
  -> platform visibility filter
  -> server input limits
  -> Core privacy scan
  -> adapter field sanitization
  -> metadata-only logs
```

单层检测失败不能直接导致敏感信息被静默保存。

### 15.3 日志

允许记录：

- `request_id`
- 工具名称。
- 用户的不可逆匿名标识。
- 目标类型。
- 延迟、重试次数和结果码。
- 内容字节数和 Hash 前缀。

默认禁止记录：

- 完整正文。
- 用户问题和 AI 回答。
- 第三方 Token。
- 飞书原始错误正文中可能包含的敏感数据。

## 16. 重试、超时和故障恢复

| 故障 | 行为 | 用户看到什么 |
|---|---|---|
| Provider 429 | 尊重 Retry-After，有上限重试 | 稍后重试或明确限流 |
| Provider 5xx | 指数退避并加入抖动 | 可重试错误 |
| 请求超时 | 按 ID/Hash 对账后决定是否重试 | 不声称确定失败 |
| Schema 不兼容 | 阻止写入 | 指出缺失的逻辑字段 |
| 重复请求 | 返回已有记录 | 已存在，不创建副本 |
| 内容过长 | 不静默截断 | 提供缩短或更换目标建议 |
| 搜索目标不可用 | 不编造结果 | 明确目标暂不可用 |
| 部分副本失败 | 保留主记录并报告逐目标状态 | 部分成功 |

重试只发生在确认幂等的操作上。更新和删除不在不确定状态下盲目重试。

## 17. 可观测性

### 17.1 指标

- MCP 请求量和错误率。
- 各工具 P50、P95 和 P99 延迟。
- 各存储适配器成功率。
- 429、5xx、超时和重试次数。
- 重复记录命中率。
- 隐私确认触发率。
- 搜索结果为空的比例。

### 17.2 Trace

一个 `request_id` 贯穿：

```text
MCP request -> use case -> storage adapter -> provider request
```

Trace 只包含元数据，不包含记忆正文。

### 17.3 健康检查

- `/health/live`：进程存活，不调用第三方。
- `/health/ready`：配置完成且 MCP Server 可以接受请求。
- Provider 健康通过 `list_destinations` 或内部诊断暴露，不让第三方短暂失败导致整个进程退出流量。

## 18. 测试架构

### 18.1 单元测试

Core 目标为完整分支覆盖：

- Schema 校验。
- 内容规范化和 Hash。
- 标签处理。
- 隐私检测。
- 重复处理。
- 存储能力协商。
- 每一种领域错误。

### 18.2 Adapter Contract Suite

所有 Storage Adapter 必须运行同一套契约测试：

```text
create -> get
create duplicate -> existing record
search pagination
filter by type/tag/project/source
update with current version
update conflict
delete
provider timeout mapping
schema mismatch mapping
```

测试套件接受一个 `StoragePort` factory。新增 Notion 或 Google Adapter 时不能另写一套不同语义。

### 18.3 MCP 集成测试

使用内存 Fake Storage 验证：

- 工具注册和 Schema。
- 未认证和越权请求。
- 输入不能覆盖 Principal。
- 工具注解。
- 错误码和安全响应。
- 敏感确认的两阶段流程。
- 幂等重试。

### 18.4 飞书集成测试

对专用测试 Base 运行，不使用用户生产表：

- Schema 检查。
- 真实字段映射。
- 写入和读取。
- 分页搜索。
- 429 和超时模拟。
- 清理测试记录。

### 18.5 Skill Evals

Skill 的质量不由代码覆盖率衡量。需要 eval 验证：

- 正确触发。
- 正确选择上一条回答或当前问答。
- 原文完整性。
- 不编造来源字段。
- 不在工具失败后报告成功。
- 不捕获隐藏或敏感内容。

### 18.6 端到端测试

至少验证三条真实链路：

```text
ChatGPT/Codex -> save_memory -> Feishu record
ChatGPT/Codex -> search_memories -> get_memory -> answer
duplicate save -> existing record returned -> no duplicate row
```

## 19. 部署架构

### 19.1 MCP Server

```text
Public HTTPS
   │
   ▼
MCP Server container
   ├── stateless application process
   ├── Secret injection
   ├── structured logs
   └── outbound provider calls
          └── Feishu OpenAPI
```

MCP Server 使用稳定 `/mcp` Endpoint 和 Streamable HTTP。容器不在本地文件系统保存用户正文。

### 19.2 配置

配置分三类：

- 非敏感运行配置：超时、重试、默认 Profile。
- Secret：飞书凭据、OAuth Secret、签名密钥。
- 用户连接：Hosted Profile 中加密保存的第三方授权。

所有配置在启动时校验。缺少必填配置时 readiness 失败，不等到第一次用户保存才暴露。

### 19.3 发布物

| 发布物 | 目标 |
|---|---|
| MCP Server 容器 | 容器仓库和部署平台 |
| OpenAI Plugin 包 | 本地 Marketplace、工作区或公开目录 |
| OpenClaw Skill | OpenClaw 技能目录 |
| DeepSeek Harness Plugin | Harness 插件生态 |

CI 应分别构建和验证这些发布物。插件静态包的版本与 MCP API 兼容版本分开记录。

## 20. 版本和兼容

### 20.1 Memory Schema

每条记录带 `schemaVersion`。升级遵循：

- 新增可选字段属于兼容升级。
- 修改语义或删除字段需要迁移。
- 适配器不能在启动时执行破坏性迁移。

### 20.2 MCP 工具

- 工具名称在 v1 内保持稳定。
- 输入只做可选字段扩展。
- 删除或修改必填字段需要新工具版本。
- Skill 声明兼容的 MCP 能力版本。

### 20.3 插件

OpenAI Plugin 的静态 Skill 是提交时或安装时的版本快照。Skill 更新后必须重新打包和测试，不能假设运行时自动读取仓库最新文件。

## 21. 实施阶段

### Phase A：工程骨架（本地骨架完成，CI 待配置）

- 建立 pnpm workspace、TypeScript strict、lint 和 test。
- 新建 `packages/core` 和 `apps/mcp-server`。
- 迁移时保留当前根目录 `SKILL.md`，不改变现有行为。
- 创建 CI 基础门禁。

### Phase B：Core 和 Fake Storage（已完成）

- 定义 Memory Schema、错误和 StoragePort。
- 实现 Save、Search、Get、Update 用例。
- 实现隐私确认和幂等策略。
- 使用内存 Fake 完成 Core 单元测试。

### Phase C：Feishu Adapter（代码与契约测试已完成）

- 实现 unified Schema 检查和字段映射。
- 实现 StoragePort 契约。
- 增加专用测试 Base 集成测试。
- 增加 legacy 映射，但不扩散到 Core。

### Phase D：MCP Server（已完成）

- 注册工具和注解。
- 实现 Personal Profile 认证。
- 加入错误映射、日志、指标和健康检查。
- 完成 MCP 集成测试。

### Phase E：OpenAI Plugin

- 创建 `.codex-plugin/plugin.json` 和 MCP 映射。
- 编写 `nutty-capture` 与 `nutty-recall`。
- 建立 Skill eval 数据集。
- 在 ChatGPT/Codex 开发者模式验证真实链路。

### Phase F：DeepSeek Harness

- 实现可见会话事件过滤。
- 将事件转换为统一 `save_memory` 请求。
- 验证消息范围准确性和隐私边界。
- 不修改 Core 或飞书适配器语义。

## 22. 并行开发建议

Core 契约确定后可以并行：

| Lane | 工作 | 依赖 |
|---|---|---|
| A | Core 领域模型和用例 | Phase A |
| B | MCP 工具壳和认证 | Core Schema |
| C | Feishu Adapter | StoragePort |
| D | OpenAI Skills 和 eval cases | MCP 工具 Schema |

执行顺序：

```text
Phase A
  │
  ▼
Core Schema + StoragePort
  │
  ├── Lane B: MCP Server
  ├── Lane C: Feishu Adapter
  └── Lane D: Skills/evals
          │
          ▼
      integration + E2E
```

在 Schema 稳定前并行会造成重复返工，因此数据契约是第一个合并点。

## 23. 关键技术决定

### ADR-001：模块化单体，不拆微服务

原因：当前只有一个写入域和少量适配器。微服务会增加部署、鉴权和一致性成本，不能改善 MVP 验证。

### ADR-002：MCP 是统一平台边界

原因：ChatGPT、Codex、OpenClaw 和 Harness 都可以通过薄适配器调用同一组工具，避免每个平台复制飞书逻辑。

### ADR-003：Core 不知道“上一条回答”

原因：这是平台上下文概念。Core 只接受明确正文，保证测试确定性和跨平台一致性。

### ADR-004：飞书是 MVP 事实来源

原因：不同时维护 Nutty 数据库和飞书副本，避免同步问题。跨存储索引等有真实需求后再加入。

### ADR-005：同步单目标写入

原因：MVP 的保存动作需要立即确认，单目标写入不需要队列。幂等和超时对账解决主要故障。

### ADR-006：服务端不做第二次 LLM 整理

原因：调用当前模型已经可以提供可选标题、摘要和标签。服务端只校验，不增加延迟、成本和新的提示词维护面。

### ADR-007：捕获与召回拆成两个 Skill

原因：两者触发条件、权限和成功标准不同。拆分能减少误触发，也便于独立 eval。

### ADR-008：平台插件通过 MCP 调用，不直接导入 Core

原因：统一认证、隐私、日志和错误语义。代价是本地 Harness 也需要 MCP 连接，但避免两条业务执行路径。

## 24. 待验证问题

实施前需要通过小型 Spike 确认：

1. ChatGPT 和 Codex 对“上一条完整回答”的工具参数传递准确率。
2. OpenAI Plugin 本地 Marketplace 和远程 MCP 的实际安装、认证流程。
3. 飞书 Base 的长文本、过滤、分页和限流实际边界。
4. 飞书是否能可靠按 Content Hash 查询，或是否需要专用唯一索引策略。
5. DeepSeek Harness 中用户可见事件与完整轨迹的稳定区分接口。
6. Personal Profile 如何让 ChatGPT 安全访问单用户 MCP Endpoint。
7. 目标平台超时后通过 Nutty ID 或 Hash 对账的成本和一致性。

Spike 只验证接口和边界，不在 Spike 中建立第二套临时架构。

## 25. 不在首期范围

- 多用户 Hosted Profile 正式上线。
- Notion 和 Google Adapter。
- 向量数据库和知识图谱。
- 全量聊天导入。
- 自动保存全部会话。
- 跨存储双向同步。
- 自定义 ChatGPT UI。
- 后台任务队列。
- 多目标强事务。
- 自动破坏性 Schema 迁移。

## 26. 架构验收标准

开始实现后，架构只有满足以下条件才算落地：

- Core 测试不加载 MCP、飞书或平台 SDK。
- 所有平台都通过同一 MCP 工具语义保存和搜索。
- 飞书适配器通过共享 StoragePort 契约测试。
- 重复提交不会创建重复记录。
- Provider 超时不会导致不受控的重复写入。
- 工具输入无法指定或覆盖认证用户身份。
- 敏感内容未经显式确认不会写入。
- 工具失败时 Skill 不报告成功。
- 搜索结果可以追溯到真实存储记录。
- 日志和 Trace 不包含记忆正文或凭据。
- README、旧产品设计和现有 Skill 在规划阶段保持不变。

## 27. 下一步

下一步不是直接写完整 MCP Server，而是完成三个小型设计验证：

1. 定稿 Memory Schema 和 StoragePort。
2. 用 Fake Storage 跑通 `save_memory` 与 `search_memories` 的工具契约。
3. 用一个飞书测试 Base 验证字段、去重、搜索和超时对账能力。

这三个结果稳定后，再创建 OpenAI Plugin 清单和正式 Skills，可以避免把不稳定的数据契约发布到多个平台。
