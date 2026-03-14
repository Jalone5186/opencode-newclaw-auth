# Agent Memory — opencode-newclaw-auth

> 本文件是 AI Agent 的永久记忆文件，记录项目的关键信息、架构决策和上下文，供后续对话使用。

---

## 约定

- 用简体中文与我交互，用英文与大模型交互
- 开发过程中发现以下关键信息时，必须追加到本文件对应章节中持久化记录：
    - 项目新发现的约定、隐含规则、新增规范
    - 新需求带来的架构或模式变化
    - Bug 修复经验和踩坑记录
    - 新引入的依赖或工具的用法注意事项
    - 配置变更、环境差异（dev/test/prod）相关经验
    - 用户偏好：对代码风格、命名、架构方案的个人倾向和决策
    - 业务领域知识：项目特有的业务概念、术语、流程逻辑
    - 模块间隐含耦合：改 A 必须同步改 B 之类的依赖关系
    - 性能敏感点：慢查询、接口优化经验、SQL 写法注意事项
    - 第三方服务对接细节：外部 API 限制、签名规则、超时设置等实战经验
    - 数据库变更历史：手动加过的字段、索引、数据迁移脚本
    - 技术决策及原因：为什么选了方案 A 而不是 B，防止后续重复讨论

---

## 项目概述

- **项目名称**: `opencode-newclaw-auth`
- **类型**: OpenCode 插件（不是 Claude Code CLI 或其他 CLI 的插件）
- **用途**: 通过 NewClaw API 聚合服务 (`https://newclaw.ai/`) 让 OpenCode 用户访问 Claude、GPT/Codex、Gemini、DeepSeek、Grok 模型
- **参考项目**: [opencode-aicodewith-auth](https://github.com/DaneelOlivaw1/opencode-aicodewith-auth) — 同类型插件，为 AICodewith 服务
- **API 文档**: https://newclaw.apifox.cn/
- **技术栈**: TypeScript, Bun, AI SDK (@ai-sdk/anthropic, @ai-sdk/openai, @ai-sdk/google)
- **构建**: `bun run build` → `dist/index.js` + `dist/provider.js`

---

## 项目结构

```
opencode-newclaw-auth/
├── index.ts                    # 插件入口：auth hook, loader(自定义fetch), config注入
├── provider.ts                 # 多供应商工厂：路由到 OpenAI/Anthropic/Google AI SDK
├── lib/
│   ├── constants.ts            # 全局常量：URL、请求头名称
│   ├── types.ts                # 共享 TypeScript 接口
│   ├── logger.ts               # 调试/请求日志
│   ├── provider-config.json    # 静态 provider 配置（预置模型列表）
│   ├── auth/
│   │   └── system-auth.ts      # 平台账号登录 + 令牌发现
│   ├── models/
│   │   ├── index.ts            # 模型模块导出
│   │   ├── registry.ts         # 模型注册表（单一数据���）
│   │   ├── auto-sync.ts        # 模型列表自动同步（每次启动从 API 获取）
│   │   ├── pricing.ts          # /api/pricing 分组倍率获取
│   │   └── key-registry.ts     # 多 Key 注册表 + failover
│   └── request/
│       ├── fetch-helpers.ts    # 请求头构建、URL提取、响应处理
│       ├── request-transformer.ts  # Codex 请求体转换、模型归一化
│       ├── response-handler.ts     # SSE → JSON 转换
│       └── claude-tools-transform.ts # Claude 工具名 mcp_ 前缀处理
├── scripts/
│   └── install-opencode-newclaw.cjs  # postinstall 自动写入 opencode.json + 模型同步
├── package.json
├── tsconfig.json
└── README.md
```

---

## 核心架构决策

### 1. API Key 配置模式（核心特性）

**三层 Key 来源，运行时优先级从高到低：**

```
环境变量覆盖 (NEWCLAW_API_KEY) > KeyRegistry 匹配（最低倍率优先）> auth.json 统一 key
```

**Key 来源层级：**

```
系统登录（.newclaw-credentials）→ auth.json → opencode.json keys[]
```

1. **系统账号登录**（推荐）: `lib/auth/system-auth.ts` 用用户名/密码登录平台，获取所有令牌列表，注册到 `KeyRegistry`
2. **auth.json 统一 key**: OpenCode 内置的 `auth.json` 存储的 key 作为兜底
3. **环境变量覆盖**（可选）: `NEWCLAW_API_KEY` 直接覆盖所有来源

实现位置: `lib/models/key-registry.ts` → `selectKeysForModel()`

### 2. Fetch 拦截机制

使用 OpenCode 插件的 `auth.loader` 模式注入自定义 `fetch` 函数到 provider 设置中：
- `loader` 接收 `getAuth()` 获取用户的 API Key
- 返回 `{ apiKey, fetch }` 对象
- 自定义 `fetch` 按模型 ID 路由请求到不同的 NewClaw 端点

**自动降级（failover）**:
- `selectKeysForModel()` 返回按倍率升序排序的候选 key 列表
- fetch 拦截器遍历 key 列表发起请求
- 某个 key 返回 401/403/429，或非最后一个 key 发生网络错误，自动切换到下一个 key
- 所有 key 均失败才向上层报错

**不是**通过 Hooks 的 `fetch` 属性（该属性不存在于 Hooks 接口中）。

### 3. URL 三层故障转移（新增 v0.4.0）

**三个 BASE_URL，按顺序尝试：**

```
URL1: https://newclaw.ai              (主要 - 基础域名)
URL2: https://newclaw.ai/v1           (备用 - 显式版本)
URL3: https://newclaw.ai/v1/chat/completions  (备用 - 显式端点)
```

**故障转移触发条件**：
- HTTP 状态码：401, 403, 429, 500, 502, 503, 504
- 网络错误（非最后一个 URL）

**嵌套故障转移架构**：
```
外层循环：遍历 KeyRegistry 中的候选 key（按倍率升序）
  内层循环：遍历 3 个 BASE_URL
    1. 确定请求类型（Codex/Claude/Fallback）
    2. 转换请求体（transformRequestBody）
    3. 构建请求头（createNewclawHeaders）
    4. 重写 URL（rewriteUrl）
    5. 发送请求（fetch）
    
    如果响应 ok → 返回成功
    如果状态码在 FAILOVER_STATUS_CODES 且非最后 URL → 尝试下一个 URL
    如果网络错误且非最后 URL → 尝试下一个 URL
    否则 → 返回响应或继续外层循环
```

**实现位置**:
- `lib/constants.ts`: `NEWCLAW_BASE_URLS` 数组 + `FAILOVER_STATUS_CODES` 集合
- `index.ts`: `fetchWithUrlFailover()` 函数（第 254-289 行）
- `index.ts`: fetch 拦截器中 3 个请求路径都使用 `fetchWithUrlFailover()`

**为什么需要 3 个 URL**：
- URL1（基础域名）：最具弹性，平台内部路由到正确端点
- URL2（显式版本）：当基础域名路由失败时的备用
- URL3（显式端点）：当版本路由失败时的最后备用

**关键设计决策**：
- 按请求故障转移（per-request），不是按会话
- 每个 URL 都尝试所有候选 key，然后才切换到下一个 URL
- 网络错误和 HTTP 错误都触发故障转移
- 日志记录每次 URL 切换事件，便于调试

### 4. 请求路由

```
用户请求 → OpenCode → auth.loader 返回的自定义 fetch →
  ├── gpt-*/codex-*/o4-* → CODEX_BASE_URL + createNewclawHeaders + transformRequestForCodex
  ├── claude-*          → NEWCLAW_ANTHROPIC_BASE_URL + x-api-key + transformClaudeRequest/Response
  ├── gemini-*          → NEWCLAW_BASE_URL + Google AI SDK
  ├── deepseek-*        → NEWCLAW_BASE_URL + Bearer token
  ├── grok-*            → NEWCLAW_BASE_URL + Bearer token
  └── 其他              → NEWCLAW_BASE_URL + createNewclawHeaders (兜底)
```

### 4. URL 重写

`rewriteUrl()` 函数将原始 SDK 请求 URL 的 host 替换为 NewClaw 端点，保留路径。

### 5. 模型自动同步

每次 OpenCode 启动时，插件从 NewClaw API 获取最新模型列表并更新 `opencode.json`。

**实现位置**:
- TypeScript 版: `lib/models/auto-sync.ts` → `syncModelsFromApi()`
- CJS 版（postinstall）: `scripts/install-opencode-newclaw.cjs` → `syncModelsFromApi()`
- 平台账号登录: `lib/auth/system-auth.ts` → 登录后获取所有令牌
- 分组倍率: `lib/models/pricing.ts` → GET `/api/pricing`（公开接口，无需鉴权）
- 多 Key 管理: `lib/models/key-registry.ts` → 注册、排序、failover

**多 Key 发现流程**:
1. `system-auth.ts` 用用户名/密码登录平台，获取所有令牌列表
2. 每个令牌并行调 `/v1/models`，取所有模型并集
3. `pricing.ts` 调 `/api/pricing` 获取分组名和倍率
4. 模型显示名格式: `模型名 [分组/倍率]`（例如 `Claude Opus 4.6 [默认/1x]`）
5. 所有模型注册到 `KeyRegistry`，不做过滤

**Auth 位置**: API Key 从 `~/.local/share/opencode/auth.json`（XDG_DATA_HOME）读取，不是 `~/.config/opencode/auth.json`。凭证文件保存在插件目录 `.newclaw-credentials`。

**时序问题**: OpenCode 先读配置文件再加载插件，所以首次安装需要**启动两次**才能看到完整模型列表。

---

## 模型注册说明

所有 API 返回的模型均注册，不做过滤。

---

## 支持的模型（静态预置）

| 模型 ID | 家族 | 显示名称 |
|---------|------|---------|
| `[REDACTED]` | claude | Claude Opus 4.6 |
| `[REDACTED]` | claude | Claude Sonnet 4.6 |
| `[REDACTED]` | claude | Claude Haiku 4.5 |
| `gpt-5-codex-high` | codex | GPT-5 Codex High |
| `gpt-5.2` | codex | GPT-5.2 |
| `gpt-5.3-codex` | codex | GPT-5.3 Codex |
| `gpt-5.3-codex-high` | codex | GPT-5.3 Codex High |
| `gpt-5.4` | codex | GPT-5.4 |
| `o4-mini` | codex | O4 Mini |
| `deepseek-r1` | deepseek | DeepSeek R1 |
| `deepseek-v3` | deepseek | DeepSeek V3 |
| `grok-4` | grok | Grok 4 |

---

## 跨平台插件更新命令

### Windows PowerShell
```powershell
$d = if(Test-Path "$env:LOCALAPPDATA\opencode"){"$env:LOCALAPPDATA\opencode"}else{"$env:USERPROFILE\.cache\opencode"}; cd $d; npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

### macOS Bash
```bash
cd ~/.cache/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

### Linux Bash
```bash
cd ${XDG_CACHE_HOME:-~/.cache}/opencode && npm install https://github.com/Jalone5186/opencode-newclaw-auth/tarball/main
```

**更新后需要重启 OpenCode**

---

## 已知问题修复历史

### 2026-03-15: X-Forwarded-Host 请求头修复 (v0.4.1)

**问题**: DeepSeek/Grok/Gemini 模型调用时，所有 3 个 BASE_URL 均返回 HTTP 500

**根本原因**:
- 通过对比 NewClaw 官方 API 文档（流式 vs 非流式接口）发现关键差异
- 流式接口文档（api-422972708）包含 `X-Forwarded-Host` 请求头
- 非流式接口文档（api-422972709）不包含此头
- 平台依赖 `X-Forwarded-Host` 头来识别流式请求
- `createNewclawHeaders()` 函数缺少此头 → 平台无法识别为流式请求 → 返回 500

**解决方案**:
- `lib/constants.ts`: 添加 `X_FORWARDED_HOST: "x-forwarded-host"` 到 `HEADER_NAMES`
- `lib/request/fetch-helpers.ts`: 在 `createNewclawHeaders()` 中添加 `headers.set(HEADER_NAMES.X_FORWARDED_HOST, "localhost:5173")`
- 所有使用 `createNewclawHeaders()` 的路径（Codex/Fallback）自动获得此修复

**关键洞察**:
- 官方文档中 `X-Forwarded-Host` 是流式接口独有的请求头
- 平台用此头区分流式和非流式请求，而不仅仅依赖请求体中的 `stream: true`
- Claude 路径不受影响（使用独立的头构建逻辑）

**代码变更**:
- `lib/constants.ts`: +1 行
- `lib/request/fetch-helpers.ts`: +1 行
- 净增：+2 行，极小改动

### 2026-03-15: 3-URL 故障转移架构实现 (v0.4.0) — 根本解决

**问题**: 之前的 DeepSeek/Qwen 修复虽然解决了流式模式问题，但架构不够清晰，缺少 URL 级别的故障转移

**根本原因分析**:
- NewClaw 官方 API 文档明确指出支持 3 个不同的 BASE_URL
- 官方建议："不同客户端可能需要使用不同的 BASE_URL，建议依次尝试以上地址"
- 之前的实现只用了一个 BASE_URL，没有实现 URL 级别的故障转移

**解决方案** (v0.4.0):
1. 定义 3 个 BASE_URL：
   - `https://newclaw.ai` (主要)
   - `https://newclaw.ai/v1` (备用)
   - `https://newclaw.ai/v1/chat/completions` (备用)

2. 实现 `fetchWithUrlFailover()` 函数：
   - 嵌套故障转移：外层 Key，内层 URL
   - 触发条件：401, 403, 429, 500, 502, 503, 504
   - 按请求级别故障转移（per-request）

3. 修改所有 3 个请求路径（Codex/Claude/Fallback）使用 URL 故障转移

4. 恢复到 commit 8870e83（真正的根本修复）：
   - 删除了 5 个症状修复提交（fa9500c, cf6fad1, 4d3ea73, 5ef53d0, e01ed48, c589c03, 5c06b7b）
   - 保留了 8870e83（应用完整的 transformRequestBody()）
   - 移除了 `/responses` → `/chat/completions` 的字符串替换 hack

**代码变更**:
- `lib/constants.ts`: +15 行（NEWCLAW_BASE_URLS 数组 + FAILOVER_STATUS_CODES）
- `index.ts`: +40 行（fetchWithUrlFailover 函数）
- `index.ts`: -28 行（简化 3 个请求路径，移除 hack）
- 净增：+27 行，代码更清晰

**影响**:
- DeepSeek/Qwen/Grok 模型现在通过 URL 故障转移获得更好的容错性
- Claude/GPT 模型也获得 URL 级别的故障转移
- 架构更符合 NewClaw 官方建议
- 代码更易维护（移除��字符串替换 hack）

### 2026-03-14: DeepSeek/Qwen 流式模式修复 (v0.3.2) — 最终解决

**问题**: DeepSeek/Qwen 模型调用时，API 聚合平台显示"非流"模式，返回"Request conversion failed"错误

**根本原因** (经过深入调查后发现):
- Fallback 路径（处理 DeepSeek/Grok/Gemini）只手动注入 `stream: true`
- 但缺少 Codex 路径中的完整请求转换（`transformRequestBody()`）
- `transformRequestBody()` 做的关键转换：
  - 模型归一化
  - `stream = true` 注入
  - `store = false` 设置
  - 输入清理和规范化
  - 推理配置解析
  - 文本冗长度设置
  - Include 字段解析
  - 移除 max_output_tokens/max_completion_tokens
- 平台收到不完整/格式错误的请求 → "Request conversion failed"

**修复过程**:

1. **第一次修复** (提交 `720ef94`)
   - 在 fallback 路径中注入 `stream: true`
   - 问题：缺少其他必要的请求转换

2. **第二次修复** (提交 `b69e68e`)
   - 改为强制 `handleSuccessResponse(response, true)`
   - 问题：仍然缺少请求转换

3. **第三次修复** (提交 `4d3ea73`)
   - 添加 URL 重写到 NEWCLAW_BASE_URL
   - 问题：URL 重写是对的，但请求转换问题仍未解决

4. **第四次修复** (提交 `fa9500c`)
   - 引入 `fallbackIsStreaming` 变量
   - 问题：这只是修复了 SDK 元数据，没有修复实际请求格式

5. **第五次修复** (提交 `cf6fad1`)
   - 为 DeepSeek/Grok 添加 `responses()` 路由
   - 问题：这修复了 SDK 元数据，但实际请求仍然格式错误

6. **第六次修复** (提交 `8870e83`) — **真正的根本解决**
   - 在 fallback 路径中应用完整的 `transformRequestBody()` 转换
   - 导入 `transformRequestBody` 从 request-transformer
   - 替换手动 `stream: true` 注入为完整的 `transformRequestBody()` 调用
   - 这确保 DeepSeek/Qwen/Grok 请求有所有必需的字段正确设置

**修改文件**: `index.ts` (第 378-408 行)

**技术细节**:
- 第 35 行：导入 `transformRequestBody` 从 request-transformer
- 第 378-395 行：Fallback 路径现在调用 `transformRequestBody()` 而不是手动注入
- 这与 Codex 路径的处理方式一致（第 322 行调用 `transformRequestForCodex()`）

**关键洞察**:
- 问题不在 SDK 元数据或 fetch 拦截
- 问题在于请求体格式：平台需要完整的、正确格式化的请求
- Codex 路径已经做了这个转换，Fallback 路径需要做同样的事情

**影响**:
- DeepSeek/Qwen/Grok 模型现在发送格式正确的流式请求
- 平台不再返回"Request conversion failed"
- 平台日志现在显示"流"模式而不是"非流"
- 模型调用现在成功

---

## 版本历史

- **v0.4.1** (2026-03-15): X-Forwarded-Host 请求头修复
  - 修复 DeepSeek/Grok/Gemini 模型调用时所有 3 个 BASE_URL 均返回 HTTP 500 的问题
  - 根本原因：`createNewclawHeaders()` 缺少 `X-Forwarded-Host` 头，平台无法识别为流式请求
  - 修复：添加 `X-Forwarded-Host: localhost:5173` 到所有非 Claude 请求头
  - 净增 2 行代码，极小改动
- **v0.4.0** (2026-03-15): 3-URL 故障转移架构
  - 实现 3-URL 故障转移：`https://newclaw.ai` → `/v1` → `/v1/chat/completions`
  - 嵌套故障转移：外层 Key，内层 URL
  - 触发条件：401, 403, 429, 500, 502, 503, 504
- **v0.3.2** (2026-03-14): DeepSeek/Qwen 流式模式修复
  - 修复 fallback 路径（DeepSeek/Grok）没有注入 `stream: true` 的问题
  - 修复 fallback 路径没有调用 `handleSuccessResponse()` 导致 SSE 响应无法正确转换
  - 对齐 fallback 路径的错误处理逻辑
  - **最终修复**：应用完整的 `transformRequestBody()` 转换而不是手动注入
  - 根本原因：Fallback 路径缺少 Codex 路径中的完整请求转换，导致平台收到格式错误的请求
- **v0.3.1** (2026-03-09): 重大 Bug 修复 + Gemini 恢复
  - 修复 auth.json 路径错误（XDG_CONFIG_HOME → XDG_DATA_HOME），模型自动同步终于正常工作
  - 修复 applyProviderConfig 覆盖模型列表，启动后不再丢失同步的模型
  - 恢复 Gemini 模型支持（@ai-sdk/google 依赖、provider 路由、模型过滤）
  - 移除模型同步 24h 缓存，改为每次启动都从 API 获取最新模型列表
  - 添加 gpt-5.3-codex / gpt-5.3-codex-high 到静态预置
  - 添加 NEWCLAW_GEMINI_API_KEY 环境变量支持
  - 添加模型同步诊断日志（所有失败路径都有输出）
  - 完善 README：Gemini 模型表格、数据流图、一键环境变量配置、Windows 教程、常见问题
- **v0.3.0** (2026-03-09): 清理 Gemini、升级版本
  - 添加 DeepSeek、Grok 模型支持
  - 实现模型列表自动同步（启动时同步调 API）
  - 扩充模型注册表至 10 个模型
  - 更新文档为傻瓜式一键安装教程（macOS/Windows/Linux）
- **v0.2.0** (2026-03-06): 全面优化
  - 修复 postinstall 使用绝对路径导致跨机器安装失败的 bug
  - 修复 postinstall 依赖 bun 的问题，改用 node + CommonJS
  - 添加 normalizeOrphanedToolOutputs 防止孤立工具输出导致 API 报错
  - 修复 Claude 工具前缀双重应用 bug（添加 startsWith 检查）
  - 修��� rewriteUrl 缺少 try/catch 导致异常 URL 崩溃
  - 修复 fallback fetch 不注入认证头导致 401 错误
  - 修复 isOmoInstalled 在旧 Node.js 下误判的问题
  - 添加 postinstall 对 .jsonc 配置文件的支持
  - 添加 oh-my-opencode 可选集成（一键安装 + 自动配置同步）
  - 添加 INSTALL-WITH-OMO.md 安装文档
  - 添加 README 常见问题排查
- **v0.1.0** (2026-03-06): 初始版本
  - 基于 opencode-aicodewith-auth 参考项目构建
  - 支持 Claude Code、Codex 模型家族
  - 实现统一 Key + 按厂商独立 Key 双模式
  - TypeScript 零错误，构建通过
