# Agent Memory — opencode-newclaw-auth

> 本文件是 AI Agent 的永久记忆文件，记录项目的关键信息、架构决策和上下文，供后续对话使用。

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
│   ├── models/
│   │   ├── index.ts            # 模型模块导出
│   │   ├── registry.ts         # 模型注册表（单一数据源）+ resolveApiKeyForFamily
│   │   └── auto-sync.ts        # 模型列表自动同步（每次启动从 API 获取）
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

**两种模式，优先级从高到低：**

```
厂商专用 Key (环境变量) > 统一 Key (NEWCLAW_API_KEY / auth输入) 
```

| 环境变量 | 作用 |
|---------|------|
| `NEWCLAW_API_KEY` | 统一 Key，一键配置所有模型 |
| `NEWCLAW_CLAUDE_API_KEY` | Claude 模型专用 Key |
| `NEWCLAW_CODEX_API_KEY` | Codex/GPT 模型专用 Key |
| `NEWCLAW_DEEPSEEK_API_KEY` | DeepSeek 模型专用 Key |
| `NEWCLAW_GROK_API_KEY` | Grok 模型专用 Key |
| `NEWCLAW_GEMINI_API_KEY` | Gemini 模型专用 Key |

实现位置: `lib/models/registry.ts` → `resolveApiKeyForFamily()`

### 2. Fetch 拦截机制

使用 OpenCode 插件的 `auth.loader` 模式注入自定义 `fetch` 函数到 provider 设置中：
- `loader` 接收 `getAuth()` 获取用户的 API Key
- 返回 `{ apiKey, fetch }` 对象
- 自定义 `fetch` 按模型 ID 路由请求到不同的 NewClaw 端点

**不是**通过 Hooks 的 `fetch` 属性（该属性不存在于 Hooks 接口中）。

### 3. 请求路由

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

每次 OpenCode 启动时，插件从 NewClaw API (`/v1/models`) 获取最新模型列表并更新 `opencode.json`。

**实现位置**:
- TypeScript 版: `lib/models/auto-sync.ts` → `syncModelsFromApi()`
- CJS 版（postinstall）: `scripts/install-opencode-newclaw.cjs` → `syncModelsFromApi()`

**过滤逻辑**: API 返回约 493 个模型，通过 `isCodingModel()` 过滤为约 165 个编程相关模型。

**Auth 位置**: API Key 从 `~/.local/share/opencode/auth.json`（XDG_DATA_HOME）读取，不是 `~/.config/opencode/auth.json`。

**时序问题**: OpenCode 先读配置文件再加载插件，所以首次安装需要**启动两次**才能看到完整模型列表。

---

## 模型过滤条件（扩展新厂商必读）

### 当前过滤规则

过滤条件定义在两个文件中（保持同步）：
- `lib/models/auto-sync.ts` 第 21-42 行
- `scripts/install-opencode-newclaw.cjs` 第 211-212 行

**允许通过的前缀** (`CODING_MODEL_PREFIXES`):
```
claude-, gpt-, o1-, o3-, o4-, deepseek-, grok-, codex-, gemini-
```

**跳过的模式** (`SKIP_PATTERNS`):
```
gpt-3*, gpt-4(非4o)*, embedding, whisper, tts, dall-e, moderation, realtime, audio
```

### 如何添加新厂商模型支持

如果后续 NewClaw API 上线了新厂商的模型（例如 Mistral、Llama 等），只需要：

1. **在 `CODING_MODEL_PREFIXES` 中添加新前缀**
   - `lib/models/auto-sync.ts` 的 `CODING_MODEL_PREFIXES` 数组
   - `scripts/install-opencode-newclaw.cjs` 的 `CODING_MODEL_PREFIXES` 数组
   - 例如添加 `"mistral-"` 或 `"llama-"`

2. **在 `detectLimits()` 中添加对应的 context/output 限制**（两个文件都要改）

3. **在 `detectModalities()` 中设置输入输出模式**（是否支持图片等）

4. **如果新厂商需要独立 API Key**:
   - `lib/types.ts` → `KeyConfig` 接口添加新字段
   - `lib/models/registry.ts` → `resolveApiKeyForFamily()` 添加新的环境变量检查
   - `lib/models/registry.ts` → `detectFamily()` 添加前缀到家族的映射

5. **如果新厂商需要特殊的请求格式**:
   - `provider.ts` → `newclawProvider()` 中添加新的路由分支

6. **更新文档**: README.md 和本文件的模型表格、数据流图

> **重要**: auto-sync.ts 和 install-opencode-newclaw.cjs 中的过滤逻辑必须保持一致，两个文件都要改。

---

## 支持的模型（静态预置）

| 模型 ID | 家族 | 显示名称 |
|---------|------|---------|
| `claude-opus-4-6` | claude | Claude Opus 4.6 |
| `claude-sonnet-4-6` | claude | Claude Sonnet 4.6 |
| `claude-haiku-4-5-20251001` | claude | Claude Haiku 4.5 |
| `gpt-5-codex-high` | codex | GPT-5 Codex High |
| `gpt-5.3-codex` | codex | GPT-5.3 Codex |
| `gpt-5.3-codex-high` | codex | GPT-5.3 Codex High |
| `gpt-5.4` | codex | GPT-5.4 |
| `gpt-5.2` | codex | GPT-5.2 |
| `o4-mini` | codex | O4 Mini |
| `deepseek-r1` | deepseek | DeepSeek R1 |
| `deepseek-v3` | deepseek | DeepSeek V3 |
| `grok-4` | grok | Grok 4 |
| `gemini-2.5-pro` | gemini | Gemini 2.5 Pro |
| `gemini-2.5-flash` | gemini | Gemini 2.5 Flash |

以上为静态预置模型（`lib/models/registry.ts` + `lib/provider-config.json`）。

启动时 `auto-sync.ts` 从 API 同步约 165 个编程模型（覆盖 Claude、GPT/Codex、DeepSeek、Grok、Gemini 五大厂商），自动合并到配置中。

---

## 关键 API 端点

| 用途 | URL |
|------|-----|
| 统一基础 URL | `https://newclaw.ai/v1` |
| Anthropic 端点 | `https://newclaw.ai/v1` |
| Codex 端点 | `https://newclaw.ai/v1` |
| 模型列表 | `https://newclaw.ai/v1/models` |

所有端点都指向同一个 NewClaw 网关，由网关内部路由到不同的上游 API。

---

## 关键文件路径

| 文件 | 路径 | 说明 |
|------|------|------|
| OpenCode 配置 | `~/.config/opencode/opencode.json` | 模型列表写入位置 |
| API Key 存储 | `~/.local/share/opencode/auth.json` | **注意是 XDG_DATA_HOME，不是 XDG_CONFIG_HOME** |
| 插件安装目录 | `~/.cache/opencode/node_modules/` | OpenCode 从这里加载插件 |

---

## 调试环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_PLUGIN_REQUEST_LOGGING=1` | 启用请求日志（写入 ~/.opencode/logs/） |
| `DEBUG_NEWCLAW_PLUGIN=1` | 启用调试日志（控制台输出） |
| `SAVE_RAW_RESPONSE=1` | 保存原始响应到临时目录 |

---

## 注意事项

1. **这是 OpenCode 插件**，不是 Claude Code CLI 或其他 CLI 的插件
2. **postinstall 脚本**使用 CommonJS (.cjs) + node 执行，兼容无 bun 环境
3. **Claude 工具前缀**: `claude-tools-transform.ts` 给工具名加 `mcp_` 前缀（带防重复检查）
4. **Plugin 类型**: `Plugin = (input: PluginInput) => Promise<Hooks>`，必须是 async 函数
5. **Auth 方法类型**: 必须是 `"api"`（不是 `"custom"`），配合 `prompts` 和 `authorize` 使用
6. **oh-my-opencode 集成**: 可选，安装后自动同步 OMO 配置到 `~/.config/opencode/oh-my-opencode.json`
7. **@ai-sdk/google v3 兼容**: 使用 `as unknown as LanguageModelV2` 断言解决 v3/v2 类型冲突
8. **首次安装需要启动两次**: OpenCode 先读配置再加载插件，第一次同步写入的模型第二次才可见

---

## 已知 Bug 修复记录

### auth.json 路径错误（v0.3.1 修复，commit `2aaf845`）
- **问题**: `getApiKey()` 读取 `~/.config/opencode/auth.json`（XDG_CONFIG_HOME），但 OpenCode 实际将 auth 存储在 `~/.local/share/opencode/auth.json`（XDG_DATA_HOME）
- **影响**: 模型自动同步一直不工作——找不到 API Key 就静默跳过
- **修复**: 现在按优先级搜索两个位置：先 XDG_DATA_HOME，后 XDG_CONFIG_HOME
- **涉及文件**: `lib/models/auto-sync.ts`、`scripts/install-opencode-newclaw.cjs`

### applyProviderConfig 覆盖模型列表（v0.3.1 修复，commit `719cda7`）
- **问题**: `ensureConfigFile()` → `applyProviderConfig()` 用静态的 `provider-config.json`（14 个模型）整个替换 provider 配置中的 models 字段
- **影响**: 每次启动都把 auto-sync 写入的 165 个模型覆盖回 14 个
- **修复**: `applyProviderConfig` 现在只合并缺失的预置模型，保留已有的 `models` 字段
- **涉及文件**: `scripts/install-opencode-newclaw.cjs` → `applyProviderConfig()`

---

## 版本历史

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
  - 修复 rewriteUrl 缺少 try/catch 导致异常 URL 崩溃
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
