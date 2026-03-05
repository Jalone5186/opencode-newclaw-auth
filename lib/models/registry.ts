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

export type ModelFamily = "codex" | "claude" | "gemini"
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
 * - Claude Code (Anthropic): claude-sonnet-4-5, claude-opus-4-6
 * - Codex (OpenAI): gpt-5.3-codex, gpt-5.2
 * - Gemini (Google): gemini-3-pro, gemini-3.1-pro-preview
 */
export const MODELS: ModelDefinition[] = [
  // ===== Claude Code Models =====
  {
    id: "claude-opus-4-6-20260205",
    family: "claude",
    displayName: "Claude Opus 4.6",
    version: "4.6",
    limit: { context: 200000, output: 64000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["claude-opus-4-6", "claude opus 4.6", "opus"],
  },
  {
    id: "claude-sonnet-4-5-20250929",
    family: "claude",
    displayName: "Claude Sonnet 4.5",
    version: "4.5",
    limit: { context: 200000, output: 64000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["claude-sonnet-4-5", "claude sonnet 4.5", "sonnet"],
  },
  {
    id: "claude-sonnet-4-6",
    family: "claude",
    displayName: "Claude Sonnet 4.6",
    version: "4.6",
    limit: { context: 200000, output: 64000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["claude-sonnet-4.6"],
  },
  {
    id: "claude-haiku-4-5-20251001",
    family: "claude",
    displayName: "Claude Haiku 4.5",
    version: "4.5",
    limit: { context: 200000, output: 8192 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "basic",
    aliases: ["claude-haiku-4-5", "haiku"],
  },

  // ===== Codex / GPT Models =====
  {
    id: "gpt-5.3-codex",
    family: "codex",
    displayName: "GPT-5.3 Codex",
    version: "5.3",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt-5.3-codex", "gpt 5.3 codex", "codex"],
  },
  {
    id: "gpt-5.2",
    family: "codex",
    displayName: "GPT-5.2",
    version: "5.2",
    limit: { context: 400000, output: 128000 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "xhigh",
    aliases: ["gpt-5.2", "gpt 5.2"],
  },

  // ===== Gemini Models =====
  {
    id: "gemini-3-pro",
    family: "gemini",
    displayName: "Gemini 3 Pro",
    version: "3.0",
    limit: { context: 1048576, output: 65536 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["gemini-3-pro", "gemini 3 pro", "gemini"],
  },
  {
    id: "gemini-3.1-pro-preview",
    family: "gemini",
    displayName: "Gemini 3.1 Pro Preview",
    version: "3.1",
    limit: { context: 1048576, output: 65536 },
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: "full",
    aliases: ["gemini-3.1-pro", "gemini 3.1 pro"],
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
  unifiedKey: string,
): string {
  const envMap: Record<ModelFamily, string> = {
    claude: "NEWCLAW_CLAUDE_API_KEY",
    codex: "NEWCLAW_CODEX_API_KEY",
    gemini: "NEWCLAW_GEMINI_API_KEY",
  }
  const envKey = process.env[envMap[family]]
  if (envKey?.trim()) return envKey.trim()
  return unifiedKey
}

/**
 * Detect model family from model ID string
 */
export function detectFamily(modelId: string): ModelFamily {
  const id = modelId.toLowerCase()
  if (id.startsWith("claude-")) return "claude"
  if (id.startsWith("gemini-")) return "gemini"
  return "codex"
}
