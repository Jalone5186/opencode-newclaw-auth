# 自定义模型扩展指南

本文档介绍如何向 opencode-newclaw-auth 插件添加新的模型提供商（如 Grok、千问等）。

---

## 快速开始

添加新模型只需 3 步：

1. **在模型注册表中添加模型定义**
2. **（可选）添加专用请求处理逻辑**
3. **重新构建插件**

---

## 示例：添加 Grok 模型

### 第 1 步：添加模型定义

编辑 `lib/models/registry.ts`，在 `MODELS` 数组中添加新模型：

```typescript
export const MODELS: ModelDefinition[] = [
  // ... 现有模型 ...
  
  // ===== Grok Models =====
  {
    id: "grok-2",
    family: "codex",  // 如果 API 兼容 OpenAI，使用 "codex"
    displayName: "Grok 2",
    version: "2.0",
    limit: { context: 128000, output: 4096 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "basic",
    aliases: ["grok-2", "grok 2"],
  },
  {
    id: "grok-2-vision",
    family: "codex",
    displayName: "Grok 2 Vision",
    version: "2.0",
    limit: { context: 128000, output: 4096 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "basic",
    aliases: ["grok-2-vision", "grok vision"],
  },
]
```

**字段说明：**

| 字段 | 说明 | 示例 |
|------|------|------|
| `id` | 模型 ID（必须与 NewClaw API 的模型名一致） | `"grok-2"` |
| `family` | 模型家族（决定使用哪个 SDK） | `"codex"` / `"claude"` / `"deepseek"` / `"grok"` |
| `displayName` | 显示名称 | `"Grok 2"` |
| `version` | 版本号 | `"2.0"` |
| `limit.context` | 上下文窗口大小（tokens） | `128000` |
| `limit.output` | 最大输出长度（tokens） | `4096` |
| `modalities.input` | 支持的输入类型 | `["text", "image"]` |
| `modalities.output` | 支持的输出类型 | `["text"]` |
| `reasoning` | 推理能力等级 | `"none"` / `"basic"` / `"full"` / `"xhigh"` |
| `aliases` | 别名列表（可选） | `["grok-2", "grok 2"]` |

### 第 2 步：更新 provider-config.json

编辑 `lib/provider-config.json`，添加模型配置：

```json
{
  "name": "NewClaw",
  "env": ["NEWCLAW_API_KEY"],
  "models": {
    "grok-2": {
      "name": "Grok 2",
      "limit": {
        "context": 128000,
        "output": 4096
      },
      "modalities": {
        "input": ["text", "image"],
        "output": ["text"]
      }
    },
    "grok-2-vision": {
      "name": "Grok 2 Vision",
      "limit": {
        "context": 128000,
        "output": 4096
      },
      "modalities": {
        "input": ["text", "image"],
        "output": ["text"]
      }
    }
  }
}
```

### 第 3 步：（可选）添加专用 API Key 支持

如果你想为 Grok 模型使用独立的 API Key：

#### 3.1 更新 `lib/constants.ts`

```typescript
export const PER_PROVIDER_KEY_ENV = {
  CLAUDE: "NEWCLAW_CLAUDE_API_KEY",
  CODEX: "NEWCLAW_CODEX_API_KEY",
  DEEPSEEK: "NEWCLAW_DEEPSEEK_API_KEY",
  GROK: "NEWCLAW_GROK_API_KEY",
} as const
```

#### 3.2 更新 `lib/models/registry.ts` 的 `detectFamily`

```typescript
export function detectFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase()
  if (id.startsWith("claude-")) return "claude"
  if (id.startsWith("deepseek-")) return "deepseek"
  if (id.startsWith("grok-")) return "grok"
  return "codex"
}
```

#### 3.3 更新 `resolveApiKeyForFamily`

```typescript
export function resolveApiKeyForFamily(
  family: ModelFamily,
  unifiedKey: string,
): string {
  const envMap: Record<ModelFamily, string> = {
    claude: "NEWCLAW_CLAUDE_API_KEY",
    codex: "NEWCLAW_CODEX_API_KEY",
    deepseek: "NEWCLAW_DEEPSEEK_API_KEY",
    grok: "NEWCLAW_GROK_API_KEY",
  }
  const envKey = process.env[envMap[family]]
  if (envKey?.trim()) return envKey.trim()
  return unifiedKey
}
```

### 第 4 步：重新构建

```bash
cd /path/to/opencode-newclaw-auth
bun run build
```

### 第 5 步：使用新模型

```bash
# 设置 API Key（可选，如果使用统一 Key 则跳过）
export NEWCLAW_GROK_API_KEY="sk-your-grok-key"

# 使用 Grok 模型
opencode --model newclaw/grok-2
```

---

## 示例：添加千问（Qwen）模型

### 完整示例代码

**1. 编辑 `lib/models/registry.ts`：**

```typescript
export const MODELS: ModelDefinition[] = [
  // ... 现有模型 ...
  
  // ===== Qwen Models =====
  {
    id: "qwen-max",
    family: "codex",  // 如果 API 兼容 OpenAI
    displayName: "通义千问 Max",
    version: "max",
    limit: { context: 30000, output: 8000 },
    modalities: { input: ["text"], output: ["text"] },
    reasoning: "full",
    aliases: ["qwen-max", "qwen max", "千问"],
  },
  {
    id: "qwen-plus",
    family: "codex",
    displayName: "通义千问 Plus",
    version: "plus",
    limit: { context: 30000, output: 8000 },
    modalities: { input: ["text"], output: ["text"] },
    reasoning: "basic",
    aliases: ["qwen-plus", "qwen plus"],
  },
]
```

**2. 更新 `lib/provider-config.json`：**

```json
{
  "models": {
    "qwen-max": {
      "name": "通义千问 Max",
      "limit": { "context": 30000, "output": 8000 },
      "modalities": { "input": ["text"], "output": ["text"] }
    },
    "qwen-plus": {
      "name": "通义千问 Plus",
      "limit": { "context": 30000, "output": 8000 },
      "modalities": { "input": ["text"], "output": ["text"] }
    }
  }
}
```

**3. 使用：**

```bash
opencode --model newclaw/qwen-max
```

---

## 高级：添加新的模型家族（非 OpenAI 兼容）

如果新模型的 API 不兼容 OpenAI（如需要特殊的请求头、URL 构建、响应格式），需要添加专用处理逻辑。

### 示例：添加一个需要特殊处理的模型

#### 1. 定义新的 ModelFamily

编辑 `lib/models/registry.ts`：

```typescript
export type ModelFamily = "codex" | "claude" | "deepseek" | "grok" | "custom"  // 添加 "custom"
```

#### 2. 在 index.ts 中添加检测和处理逻辑

编辑 `index.ts`，在 fetch 拦截器中添加：

```typescript
// 在 parseRequestBody 之后添加
const isCustomModel = (model: string | undefined) =>
  Boolean(model && stripProviderPrefix(model).startsWith("custom-"))

// 在 fetch 拦截器中添加分支
if (isCustomModel(model)) {
  // 自定义 URL 构建
  const customUrl = `https://api.custom-provider.com/v1/chat/completions`
  
  // 自定义请求头
  const headers = new Headers(init?.headers ?? {})
  headers.set("Authorization", `Bearer ${resolvedApiKey}`)
  headers.set("X-Custom-Header", "custom-value")
  
  const response = await fetch(customUrl, {
    ...init,
    headers,
  })
  
  return await saveResponseIfEnabled(response, "custom", { url: customUrl, model: modelId })
}
```

#### 3. 添加自定义 URL 构建器（如果需要）

```typescript
const buildCustomUrl = (originalUrl: string, modelId: string) => {
  // 自定义 URL 构建逻辑
  return `https://api.custom-provider.com/v1/models/${modelId}/generate`
}
```

---

## 常见问题

### Q: 如何知道模型的 `family` 应该设置为什么？

**A:** 根据 API 兼容性选择：

- **OpenAI 兼容**（支持 `/v1/chat/completions` 端点）→ `"codex"`
- **Anthropic 兼容**（支持 `/v1/messages` 端点）→ `"claude"`
- **DeepSeek 兼容**（支持 `/v1/chat/completions` 端点）→ `"deepseek"`
- **Grok 兼容**（支持 `/v1/chat/completions` 端点）→ `"grok"`
- **完全自定义** → 添加新的 family 类型并实现专用处理逻辑

### Q: 如何测试新添加的模型？

**A:** 

```bash
# 1. 重新构建
bun run build

# 2. 检查配置是否生效
cat ~/.config/opencode/opencode.json | grep "your-model-id"

# 3. 测试请求
opencode --model newclaw/your-model-id

# 4. 启用调试日志查看详细信息
export DEBUG_NEWCLAW_PLUGIN=1
opencode --model newclaw/your-model-id
```

### Q: 新模型不显示在 OpenCode 的模型列表中？

**A:** 确保：

1. `lib/provider-config.json` 中已添加模型配置
2. 运行了 `bun run build`
3. 重新运行了 postinstall 脚本：
   ```bash
   node node_modules/opencode-newclaw-auth/scripts/install-opencode-newclaw.cjs
   ```

### Q: 如何为新模型设置独立的 API Key？

**A:** 

1. 在 `lib/constants.ts` 的 `PER_PROVIDER_KEY_ENV` 中添加环境变量名
2. 更新 `lib/models/registry.ts` 的 `detectFamily` 和 `resolveApiKeyForFamily`
3. 设置环境变量：
   ```bash
   export NEWCLAW_YOUR_MODEL_API_KEY="sk-your-key"
   ```

### Q: 如何添加模型别名？

**A:** 在模型定义的 `aliases` 数组中添加：

```typescript
{
  id: "grok-2",
  aliases: ["grok-2", "grok 2", "grok", "x-ai"],  // 支持多个别名
  // ...
}
```

用户可以用任何别名调用：
```bash
opencode --model newclaw/grok
opencode --model newclaw/x-ai
```

---

## 贡献你的模型配置

如果你添加了新的模型配置并测试通过，欢迎提交 PR 到 [GitHub 仓库](https://github.com/Jalone5186/opencode-newclaw-auth)！

**PR 检查清单：**

- [ ] 在 `lib/models/registry.ts` 中添加了模型定义
- [ ] 在 `lib/provider-config.json` 中添加了配置
- [ ] 更新了 `README.md` 的支持模型列表
- [ ] 运行 `bun run typecheck` 无错误
- [ ] 运行 `bun run build` 成功
- [ ] 实际测试了新模型可以正常工作

---

## 参考资料

- [NewClaw API 文档](https://newclaw.apifox.cn/)
- [OpenCode 插件开发文档](https://opencode.ai/docs/plugins)
- [AI SDK Provider 接口](https://sdk.vercel.ai/docs/ai-sdk-core/providers)
