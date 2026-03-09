/**
 * @file auto-sync.ts
 * @input  NewClaw API /v1/models response
 * @output Updated opencode.json with latest model list
 * @pos    Plan B - auto-sync models from API on every startup
 *
 * Called during plugin init to fetch the latest models from NewClaw API
 * and update the local opencode.json configuration.
 * Fetches fresh data on every startup — no caching.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const API_TIMEOUT_MS = 10_000 // 10 seconds
const PACKAGE_NAME = "opencode-newclaw-auth"
const PROVIDER_ID = "newclaw"

// Model family prefixes we care about for coding
const CODING_MODEL_PREFIXES = [
  "claude-",
  "gpt-",
  "o1-", "o3-", "o4-",
  "deepseek-",
  "grok-",
  "codex-",
  "gemini-",
]

// Models to skip even if they match prefixes (too old, irrelevant, etc.)
const SKIP_PATTERNS = [
  /^gpt-3/,
  /^gpt-4(?!o)/i, // skip gpt-4 but not gpt-4o
  /embedding/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /moderation/i,
  /realtime/i,
  /audio/i,
]

interface ApiModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
}

interface ApiModelsResponse {
  data: ApiModel[]
}


interface ModelConfig {
  name: string
  limit?: {
    context: number
    output: number
  }
  modalities?: {
    input: string[]
    output: string[]
  }
}

const homeDir = process.env.OPENCODE_TEST_HOME || os.homedir()


function getConfigPaths(): { json: string; jsonc: string; dir: string } {
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
  const dir = path.join(configRoot, "opencode")
  return {
    json: path.join(dir, "opencode.json"),
    jsonc: path.join(dir, "opencode.jsonc"),
    dir,
  }
}

async function readJsonSafe(filePath: string): Promise<Record<string, any> | undefined> {
  try {
    const text = await readFile(filePath, "utf-8")
    const stripped = filePath.endsWith(".jsonc")
      ? text
          .replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => (g ? "" : m))
          .replace(/,(\s*[}\]])/g, "$1")
      : text
    return JSON.parse(stripped)
  } catch {
    return undefined
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await readFile(filePath)
    return true
  } catch {
    return false
  }
}


function isCodingModel(modelId: string): boolean {
  const lower = modelId.toLowerCase()
  // Must match at least one prefix
  const matchesPrefix = CODING_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix))
  if (!matchesPrefix) return false
  // Must not match any skip pattern
  const shouldSkip = SKIP_PATTERNS.some((pattern) => pattern.test(lower))
  return !shouldSkip
}

function modelIdToDisplayName(id: string): string {
  return id
    .split("-")
    .map((part) => {
      // Handle version numbers like "4.5", "5.2"
      if (/^\d/.test(part)) return part
      // Capitalize first letter
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
    // Fix common patterns
    .replace(/^Gpt /, "GPT-")
    .replace(/^O(\d)/, "O$1")
    .replace(/^Claude /, "Claude ")
    .replace(/^Deepseek /, "DeepSeek ")
    .replace(/^Grok /, "Grok ")
    .replace(/^Codex /, "Codex ")
    .replace(/^Gemini /, "Gemini ")
}

function detectModalities(modelId: string): { input: string[]; output: string[] } {
  const lower = modelId.toLowerCase()
  // DeepSeek models are text-only
  if (lower.startsWith("deepseek-")) {
    return { input: ["text"], output: ["text"] }
  }
  // Most other modern models support images
  return { input: ["text", "image"], output: ["text"] }
}

function detectLimits(modelId: string): { context: number; output: number } {
  const lower = modelId.toLowerCase()
  if (lower.includes("codex") || lower.startsWith("gpt-5")) {
    return { context: 400000, output: 128000 }
  }
  if (lower.startsWith("claude-")) {
    if (lower.includes("haiku")) return { context: 200000, output: 8192 }
    return { context: 200000, output: 64000 }
  }
  if (lower.startsWith("deepseek-")) {
    return { context: 128000, output: 64000 }
  }
  if (lower.startsWith("o1-") || lower.startsWith("o3-") || lower.startsWith("o4-")) {
    return { context: 200000, output: 100000 }
  }
  if (lower.startsWith("grok-")) {
    return { context: 200000, output: 100000 }
  }
  if (lower.startsWith("gemini-")) {
    return { context: 1000000, output: 65536 }
  }
  // Default
  return { context: 128000, output: 32000 }
}

function apiModelsToConfig(apiModels: ApiModel[]): Record<string, ModelConfig> {
  const result: Record<string, ModelConfig> = {}
  for (const model of apiModels) {
    if (!isCodingModel(model.id)) continue
    result[model.id] = {
      name: modelIdToDisplayName(model.id),
      limit: detectLimits(model.id),
      modalities: detectModalities(model.id),
    }
  }
  return result
}

async function fetchModelsFromApi(apiKey?: string): Promise<ApiModel[] | undefined> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    }
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

    try {
      const response = await fetch("https://newclaw.ai/v1/models", {
        method: "GET",
        headers,
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        console.warn(`[${PACKAGE_NAME}] Model sync: API returned HTTP ${response.status}`)
        return undefined
      }

      const data = (await response.json()) as ApiModelsResponse
      if (!data || !Array.isArray(data.data)) {
        return undefined
      }

      return data.data
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return undefined
  }
}

/**
 * Read the API key from auth.json for model sync.
 * Falls back to env var NEWCLAW_API_KEY.
 */
async function getApiKey(): Promise<string | undefined> {
  // Try env var first
  const envKey = process.env.NEWCLAW_API_KEY
  if (envKey?.trim()) return envKey.trim()

  // Try auth.json
  try {
    const configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
    const authPath = path.join(configRoot, "opencode", "auth.json")
    const raw = await readFile(authPath, "utf-8")
    const auth = JSON.parse(raw)
    // auth.json structure: { "newclaw": { "type": "api", "key": "sk-..." } }
    const newclawAuth = auth?.[PROVIDER_ID] ?? auth?.newclaw
    if (newclawAuth?.key?.trim()) return newclawAuth.key.trim()
  } catch {
    // No auth.json or can't parse
  }

  return undefined
}

/**
 * Main sync function. Called during plugin init.
 * Fetches latest models from NewClaw API and updates opencode.json.
 *
 * @returns true if models were updated, false otherwise
 */
export async function syncModelsFromApi(): Promise<boolean> {
  try {
    // Get API key
    const apiKey = await getApiKey()
    if (!apiKey) {
      console.log(`[${PACKAGE_NAME}] Model sync skipped: no API key found (run 'opencode auth login' first)`)
      return false
    }

    console.log(`[${PACKAGE_NAME}] Syncing models from NewClaw API...`)

    // Fetch from API (every startup, no cache)
    const apiModels = await fetchModelsFromApi(apiKey)
    if (!apiModels || apiModels.length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: API returned no models (check network or API key)`)
      return false
    }

    console.log(`[${PACKAGE_NAME}] API returned ${apiModels.length} models, filtering coding models...`)

    // Convert and update config
    const modelConfigs = apiModelsToConfig(apiModels)
    if (Object.keys(modelConfigs).length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: no coding models found after filtering`)
      return false
    }

    return await updateConfigModels(modelConfigs)
  } catch (err) {
    console.warn(
      `[${PACKAGE_NAME}] Model auto-sync failed: ${err instanceof Error ? err.message : err}`,
    )
    return false
  }
}

/**
 * Update opencode.json with the given model configs.
 * Merges with existing models — API-discovered models are added,
 * but user-customized models are preserved.
 */
async function updateConfigModels(newModels: Record<string, ModelConfig>): Promise<boolean> {
  const paths = getConfigPaths()
  const jsoncExists = await fileExists(paths.jsonc)
  const jsonExists = await fileExists(paths.json)

  const configPath = jsoncExists ? paths.jsonc : jsonExists ? paths.json : paths.json
  const config = (await readJsonSafe(configPath)) ?? {}

  if (!config || typeof config !== "object") return false

  // Navigate to provider.newclaw.models
  const providerMap = config.provider && typeof config.provider === "object" ? config.provider : {}
  const provider =
    providerMap[PROVIDER_ID] && typeof providerMap[PROVIDER_ID] === "object"
      ? providerMap[PROVIDER_ID]
      : {}
  const existingModels =
    provider.models && typeof provider.models === "object" ? provider.models : {}

  // Merge: new models from API + existing models (existing take priority for customized fields)
  const mergedModels: Record<string, ModelConfig> = {}

  // Add all API-discovered models
  for (const [id, config] of Object.entries(newModels)) {
    mergedModels[id] = config
  }

  // Overlay any existing user customizations
  for (const [id, existingConfig] of Object.entries(existingModels)) {
    if (typeof existingConfig === "object" && existingConfig !== null) {
      mergedModels[id] = {
        ...mergedModels[id],
        ...(existingConfig as ModelConfig),
      }
    }
  }

  // Check if anything actually changed
  const existingKeys = Object.keys(existingModels).sort().join(",")
  const mergedKeys = Object.keys(mergedModels).sort().join(",")
  if (existingKeys === mergedKeys) {
    // Same set of models — check if any values differ
    let same = true
    for (const key of Object.keys(mergedModels)) {
      if (JSON.stringify(existingModels[key]) !== JSON.stringify(mergedModels[key])) {
        same = false
        break
      }
    }
    if (same) return false
  }

  // Apply changes
  provider.models = mergedModels
  providerMap[PROVIDER_ID] = provider
  config.provider = providerMap

  // Write back
  await mkdir(paths.dir, { recursive: true })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")

  const modelCount = Object.keys(mergedModels).length
  console.log(`[${PACKAGE_NAME}] Synced ${modelCount} models from NewClaw API`)
  return true
}
