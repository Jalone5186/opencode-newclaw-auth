/**
 * @file registry.ts
 * @input  -
 * @output Central model definitions - single source of truth
 * @pos    Foundation - all model configs derive from here
 *
 * HOW TO ADD A NEW MODEL:
 * 1. Add entry to MODELS below
 * 2. Run `bun run build` - configs auto-generate
 * 3. Done!
 */

export type ModelFamily = "codex" | "claude" | "deepseek" | "grok" | "gemini"
export type ReasoningSupport = "none" | "basic" | "full" | "xhigh"

export interface ModelDefinition {
  id: string
  family: ModelFamily
  displayName: string
  version: string
  limit: {
    context: number
    output: number
  }
  modalities: {
    input: ("text" | "image")[]
    output: ("text")[]
  }
  reasoning?: ReasoningSupport
  deprecated?: boolean
  replacedBy?: string
  aliases?: string[]
}

export const PROVIDER_ID = "newclaw"

/**
 * ============================================
 * SINGLE SOURCE OF TRUTH - ALL MODELS DEFINED HERE
 * ============================================
 *
 * Default supported models:
 * - Claude (Anthropic): claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5-20251001
 * - Codex (OpenAI): gpt-5-codex-high, gpt-5.4, gpt-5.2, o4-mini
 * - DeepSeek: deepseek-r1, deepseek-v3
 * - Grok: grok-4
 */
export const MODELS: ModelDefinition[] = [
  // ===== Claude Models =====
  {
    id: "claude-opus-4-6",
    family: "claude",
    displayName: "Claude Opus 4.6",
    version: "4.6",
    limit: { context: 200000, output: 64000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["claude opus 4.6", "opus"],
  },
  {
    id: "claude-sonnet-4-6",
    family: "claude",
    displayName: "Claude Sonnet 4.6",
    version: "4.6",
    limit: { context: 200000, output: 64000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["claude-sonnet-4.6", "sonnet"],
  },
  {
    id: "claude-haiku-4-5-20251001",
    family: "claude",
    displayName: "Claude Haiku 4.5",
    version: "4.5",
    limit: { context: 200000, output: 8192 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "basic",
    aliases: ["claude-haiku", "haiku"],
  },

  // ===== Codex / GPT Models =====
  {
    id: "gpt-5-codex-high",
    family: "codex",
    displayName: "GPT-5 Codex High",
    version: "5",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt 5 codex high", "codex-high", "codex"],
  },
  {
    id: "gpt-5.3-codex",
    family: "codex",
    displayName: "GPT-5.3 Codex",
    version: "5.3",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt 5.3 codex", "codex 5.3"],
  },
  {
    id: "gpt-5.3-codex-high",
    family: "codex",
    displayName: "GPT-5.3 Codex High",
    version: "5.3",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt 5.3 codex high", "codex 5.3 high"],
  },
  {
    id: "gpt-5.4",
    family: "codex",
    displayName: "GPT-5.4",
    version: "5.4",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt 5.4"],
  },
  {
    id: "gpt-5.2",
    family: "codex",
    displayName: "GPT-5.2",
    version: "5.2",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt 5.2"],
  },
  {
    id: "o4-mini",
    family: "codex",
    displayName: "O4 Mini",
    version: "4",
    limit: { context: 200000, output: 100000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["o4 mini"],
  },

  // ===== DeepSeek Models =====
  {
    id: "deepseek-r1",
    family: "deepseek",
    displayName: "DeepSeek R1",
    version: "r1",
    limit: { context: 128000, output: 64000 },
    modalities: { input: ["text"], output: ["text"] },
    reasoning: "full",
    aliases: ["deepseek r1"],
  },
  {
    id: "deepseek-v3",
    family: "deepseek",
    displayName: "DeepSeek V3",
    version: "v3",
    limit: { context: 128000, output: 64000 },
    modalities: { input: ["text"], output: ["text"] },
    reasoning: "basic",
    aliases: ["deepseek v3"],
  },

  // ===== Grok Models =====
  {
    id: "grok-4",
    family: "grok",
    displayName: "Grok 4",
    version: "4",
    limit: { context: 200000, output: 100000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["grok 4"],
  },
]

// ===== Helper functions =====

export function getActiveModels(): ModelDefinition[] {
  return MODELS.filter((m) => !m.deprecated)
}

export function getDeprecatedModels(): ModelDefinition[] {
  return MODELS.filter((m) => m.deprecated)
}

export function getModelById(id: string): ModelDefinition | undefined {
  return MODELS.find((m) => m.id === id)
}

export function getModelByAlias(alias: string): ModelDefinition | undefined {
  const lower = alias.toLowerCase()
  return MODELS.find(
    (m) => m.id === lower || m.aliases?.some((a) => a.toLowerCase() === lower),
  )
}

export function getModelsByFamily(family: ModelFamily): ModelDefinition[] {
  return MODELS.filter((m) => m.family === family && !m.deprecated)
}

export function getFullModelId(modelId: string): string {
  return `${PROVIDER_ID}/${modelId}`
}

/**
 * Build migration map: deprecated model ID → replacement model ID
 */
export function buildModelMigrations(): Record<string, string> {
  const migrations: Record<string, string> = {}
  for (const model of getDeprecatedModels()) {
    if (model.replacedBy) {
      migrations[getFullModelId(model.id)] = getFullModelId(model.replacedBy)
    }
  }
  return migrations
}

/**
 * Build alias map: alias → canonical model ID
 */
export function buildAliasMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const model of getActiveModels()) {
    if (model.aliases) {
      for (const alias of model.aliases) {
        map[alias.toLowerCase()] = model.id
      }
    }
  }
  return map
}

/**
 * Build provider config for opencode.json
 */
export function buildProviderConfig(): Record<string, unknown> {
  const models: Record<string, unknown> = {}
  for (const model of getActiveModels()) {
    models[model.id] = {
      name: model.displayName,
      limit: model.limit,
      modalities: model.modalities,
    }
  }
  return {
    name: "NewClaw",
    api: "https://newclaw.ai/v1",
    env: ["NEWCLAW_API_KEY"],
    models,
  }
}

/**
 * Determine which API key to use for a given model family.
 * Priority: per-provider env var > unified key > auth key
 */
export function resolveApiKeyForFamily(
  family: ModelFamily,
  candidateKey: string,
): string {
  const envMap: Record<ModelFamily, string> = {
    claude: "NEWCLAW_CLAUDE_API_KEY",
    codex: "NEWCLAW_CODEX_API_KEY",
    deepseek: "NEWCLAW_DEEPSEEK_API_KEY",
    grok: "NEWCLAW_GROK_API_KEY",
    gemini: "NEWCLAW_GEMINI_API_KEY",
  }
  const envKey = process.env[envMap[family]]
  if (envKey?.trim()) return envKey.trim()
  return candidateKey
}

/**
 * Detect model family from model ID string
 */
export function detectFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase()
  if (id.startsWith("claude-")) return "claude"
  if (id.startsWith("deepseek-")) return "deepseek"
  if (id.startsWith("grok-")) return "grok"
  if (id.startsWith("gemini-")) return "gemini"
  return "codex"
}
