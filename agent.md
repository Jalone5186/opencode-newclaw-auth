# Agent Memory — opencode-newclaw-auth

> 本文件是 AI Agent 的永久记忆文件，记录项目的关键信息、架构决策和上下文，供后续对话使用。

---

## 项目概述

- **项目名称**: `opencode-newclaw-auth`
- **类型**: OpenCode 插件（不是 Claude Code CLI 或 Gemini CLI 的插件）
- **用途**: 通过 NewClaw API 聚合服务 (`https://newclaw.ai/`) 让 OpenCode 用户访问 Claude、Codex、Gemini 模型
- **参考项目**: [opencode-aicodewith-auth](https://github.com/DaneelOlivaw1/opencode-aicodewith-auth) — 同类型插件，为 AICodewith 服务
- **API 文档**: https://newclaw.apifox.cn/
- **技术栈**: TypeScript, Bun, AI SDK (@ai-sdk/anthropic, @ai-sdk/google, @ai-sdk/openai)
- **构建**: `bun run build` → `dist/index.js` + `dist/provider.js`

---

## 项目结构

```
opencode-newclaw-auth/
├── index.ts                    # 插件入口：auth hook, loader(自定义fetch), config注入
├── provider.ts                 # 多供应商工厂：路由到 OpenAI/Anthropic/Google AI SDK
├── lib/
│   ├── constants.ts            # 全局常量：URL、请求头、Provider ID
│   ├── types.ts                # 共享 TypeScript 接口
│   ├── logger.ts               # 调试/请求日志
│   ├── provider-config.json    # 静态 provider 配置（模型列表）
│   ├── models/
│   │   ├── index.ts            # 模型模块导出
│   │   └── registry.ts         # 模型注册表（单一数据源）+ resolveApiKeyForFamily
│   └── request/
│       ├── fetch-helpers.ts    # 请求头构建、URL提取、响应处理
│       ├── request-transformer.ts  # Codex 请求体转换、模型归一化
│       ├── response-handler.ts     # SSE → JSON 转换
│       └── claude-tools-transform.ts # Claude 工具名 mcp_ 前缀处理
├── scripts/
│   └── install-opencode-newclaw.js  # postinstall 自动写入 opencode.json
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
  ├── gpt-*/codex-* → CODEX_BASE_URL + createNewclawHeaders + transformRequestForCodex
  ├── claude-*      → NEWCLAW_ANTHROPIC_BASE_URL + x-api-key + transformClaudeRequest/Response
  ├── gemini-*      → NEWCLAW_GEMINI_BASE_URL + Bearer token
  └── 其他          → NEWCLAW_BASE_URL + createNewclawHeaders (兜底)
```

### 4. URL 重写

`rewriteUrl()` 函数将原始 SDK 请求 URL 的 host 替换为 NewClaw 端点，保留路径。

---

## 支持的模型

| 模型 ID | 家族 | 显示名称 |
|---------|------|---------|
| `claude-opus-4-6-20260205` | claude | Claude Opus 4.6 |
| `claude-sonnet-4-5-20250929` | claude | Claude Sonnet 4.5 |
| `claude-sonnet-4-6` | claude | Claude Sonnet 4.6 |
| `claude-haiku-4-5-20251001` | claude | Claude Haiku 4.5 |
| `gpt-5.3-codex` | codex | GPT-5.3 Codex |
| `gpt-5.2` | codex | GPT-5.2 |
| `gemini-3-pro` | gemini | Gemini 3 Pro |
| `gemini-3.1-pro-preview` | gemini | Gemini 3.1 Pro Preview |

模型注册表位于 `lib/models/registry.ts`，是所有配置的单一数据源。

---

## 关键 API 端点

| 用途 | URL |
|------|-----|
| 统一基础 URL | `https://newclaw.ai/v1` |
| Anthropic 端点 | `https://newclaw.ai/v1` |
| Gemini 端点 | `https://newclaw.ai/v1` |
| Codex 端点 | `https://newclaw.ai/v1` |

所有端点都指向同一个 NewClaw 网关，由网关内部路由到不同的上游 API。

---

## 调试环境变量

| 变量 | 说明 |
|------|------|
| `ENABLE_PLUGIN_REQUEST_LOGGING=1` | 启用请求日志（写入 ~/.opencode/logs/） |
| `DEBUG_NEWCLAW_PLUGIN=1` | 启用调试日志（控制台输出） |
| `SAVE_RAW_RESPONSE=1` | 保存原始响应到临时目录 |

---

## 注意事项

1. **这是 OpenCode 插件**，不是 Claude Code CLI 或 Gemini CLI 的插件
2. **postinstall 脚本**会自动修改 `~/.config/opencode/opencode.json`
3. **Claude 工具前缀**: `claude-tools-transform.ts` 给工具名加 `mcp_` 前缀以绕过 OAuth 限制
4. **Plugin 类型**: `Plugin = (input: PluginInput) => Promise<Hooks>`，必须是 async 函数
5. **Auth 方法类型**: 必须是 `"api"`（不是 `"custom"`），配合 `prompts` 和 `authorize` 使用

---

## 版本历史

- **v0.1.0** (2026-03-06): 初始版本
  - 基于 opencode-aicodewith-auth 参考项目构建
  - 支持 Claude Code、Codex、Gemini 三大模型家族
  - 实现统一 Key + 按厂商独立 Key 双模式
  - TypeScript 零错误，构建通过
