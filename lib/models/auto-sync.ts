/**
 * @file auto-sync.ts
 * @input  NewClaw API /v1/models + /api/pricing responses, multi-key config
 * @output Updated opencode.json with enriched model list (group + ratio in display name)
 * @pos    Core - multi-key model discovery with pricing enrichment on every startup
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { keyRegistry, type KeyProfile } from "./key-registry"
import {
  fetchPricing,
  detectKeyGroup,
  buildDisplayName,
  type PricingData,
  type PricingModelInfo,
} from "./pricing"
import { readCredentials, discoverAllTokenKeys } from "../auth/system-auth"

const API_TIMEOUT_MS = 10_000
const PACKAGE_NAME = "opencode-newclaw-auth"
const PROVIDER_ID = "newclaw"

interface ApiModel {
  id: string
  object?: string
  created?: number
  owned_by?: string
  [key: string]: unknown  // capture all fields
}

interface ApiModelsResponse {
  data: ApiModel[]
}

interface ModelConfig {
  name: string
  limit?: { context: number; output: number }
  modalities?: { input: string[]; output: string[] }
}

interface KeyEntry {
  key: string
  label?: string
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

function getKeyRegistryCachePath(): string {
  const configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
  return path.join(configRoot, "opencode", "newclaw-key-registry.json")
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

function modelIdToDisplayName(id: string): string {
  return id
    .split("-")
    .map((part) => {
      if (/^\d/.test(part)) return part
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(" ")
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
  if (lower.startsWith("deepseek-")) return { input: ["text"], output: ["text"] }
  return { input: ["text", "image"], output: ["text"] }
}

function detectLimits(modelId: string): { context: number; output: number } {
  const lower = modelId.toLowerCase()
  if (lower.includes("codex") || lower.startsWith("gpt-5")) return { context: 400000, output: 128000 }
  if (lower.startsWith("claude-")) {
    if (lower.includes("haiku")) return { context: 200000, output: 8192 }
    return { context: 200000, output: 64000 }
  }
  if (lower.startsWith("deepseek-")) return { context: 128000, output: 64000 }
  if (lower.startsWith("o1-") || lower.startsWith("o3-") || lower.startsWith("o4-")) return { context: 200000, output: 100000 }
  if (lower.startsWith("grok-")) return { context: 200000, output: 100000 }
  if (lower.startsWith("gemini-")) return { context: 1000000, output: 65536 }
  return { context: 128000, output: 32000 }
}

// ===== Key Gathering =====

async function getAuthKey(): Promise<string | undefined> {
  const envKey = process.env.NEWCLAW_API_KEY
  if (envKey?.trim()) return envKey.trim()

  const dataDirs = [
    process.env.XDG_DATA_HOME || path.join(homeDir, ".local", "share"),
    process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config"),
  ]

  for (const dataDir of dataDirs) {
    try {
      const authPath = path.join(dataDir, "opencode", "auth.json")
      const raw = await readFile(authPath, "utf-8")
      const auth = JSON.parse(raw)
      const newclawAuth = auth?.[PROVIDER_ID] ?? auth?.newclaw
      if (newclawAuth?.key?.trim()) return newclawAuth.key.trim()
    } catch {
      // try next
    }
  }
  return undefined
}

async function getConfigKeys(): Promise<KeyEntry[]> {
  const paths = getConfigPaths()
  const configPath = (await fileExists(paths.jsonc)) ? paths.jsonc : paths.json
  const config = await readJsonSafe(configPath)
  if (!config) return []

  const providerConfig = config?.provider?.[PROVIDER_ID]
  if (!providerConfig || typeof providerConfig !== "object") return []

  const keys = (providerConfig as Record<string, unknown>).keys
  if (!Array.isArray(keys)) return []

  return keys
    .filter((k: unknown): k is { key: string } =>
      typeof k === "object" && k !== null && "key" in k && typeof (k as Record<string, unknown>).key === "string",
    )
    .map((k) => ({ key: k.key.trim(), label: (k as Record<string, unknown>).label as string | undefined }))
    .filter((k) => k.key.length > 0)
}

/**
 * Gather all unique keys from: system login (all tokens) → auth.json → config keys[].
 * System login via .newclaw-credentials is the primary source.
 */
async function gatherAllKeys(): Promise<{ entries: KeyEntry[]; authKey: string | undefined }> {
  const seen = new Set<string>()
  const entries: KeyEntry[] = []

  // Source 1: System login — discover all tokens via platform account
  const creds = await readCredentials()
  if (creds) {
    const tokenKeys = await discoverAllTokenKeys(creds)
    if (tokenKeys && tokenKeys.length > 0) {
      for (const tk of tokenKeys) {
        if (!seen.has(tk.key)) {
          seen.add(tk.key)
          entries.push({ key: tk.key, label: tk.name || tk.group })
        }
      }
    }
  }

  // Source 2: auth.json (opencode auth login)
  const authKey = await getAuthKey()
  if (authKey && !seen.has(authKey)) {
    seen.add(authKey)
    entries.push({ key: authKey })
  }

  // Source 3: opencode.json keys[] array
  const configKeys = await getConfigKeys()
  for (const ck of configKeys) {
    if (!seen.has(ck.key)) {
      seen.add(ck.key)
      entries.push(ck)
    }
  }

  return { entries, authKey }
}

// ===== Per-Key Model Discovery =====

async function fetchModelsForKey(apiKey: string): Promise<string[] | undefined> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

    try {
      const response = await fetch("https://newclaw.ai/v1/models", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) return undefined

      const data = (await response.json()) as ApiModelsResponse
      if (!data || !Array.isArray(data.data)) return undefined

      // Log first model to see all available fields
      if (data.data.length > 0) {
        const firstModel = data.data[0]
        console.log(`[newclaw-auth] First model from /v1/models:`, JSON.stringify(firstModel, null, 2))
      }

      return data.data.map((m) => m.id)
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    return undefined
  }
}

async function discoverKeyProfile(
  entry: KeyEntry,
  source: "auth" | "config",
  pricingData: PricingData | undefined,
): Promise<KeyProfile | undefined> {
  const models = await fetchModelsForKey(entry.key)
  if (!models || models.length === 0) return undefined

  let groupName = "unknown"
  let groupDisplayName = "未知分组"
  let groupRatio = 1

  if (pricingData) {
    const detected = detectKeyGroup(models, pricingData)
    if (detected) {
      groupName = detected.groupName
      groupDisplayName = detected.displayName
      groupRatio = detected.groupRatio
    }
  }

  return { key: entry.key, groupName, groupDisplayName, groupRatio, models, source }
}

// ===== Key Registry Cache =====

interface CachedRegistryData {
  profiles: Array<{
    keyPrefix: string
    groupName: string
    groupDisplayName: string
    groupRatio: number
    models: string[]
    source: "auth" | "config"
  }>
  timestamp: number
}

function maskKey(key: string): string {
  if (key.length <= 8) return key
  return key.slice(0, 4) + "****" + key.slice(-4)
}

async function saveKeyRegistryCache(profiles: KeyProfile[]): Promise<void> {
  try {
    const cachePath = getKeyRegistryCachePath()
    const data: CachedRegistryData = {
      profiles: profiles.map((p) => ({
        keyPrefix: maskKey(p.key),
        groupName: p.groupName,
        groupDisplayName: p.groupDisplayName,
        groupRatio: p.groupRatio,
        models: p.models,
        source: p.source,
      })),
      timestamp: Date.now(),
    }
    await mkdir(path.dirname(cachePath), { recursive: true })
    await writeFile(cachePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
  } catch {
    // non-fatal
  }
}

// ===== Model Config Building =====

function getModelDisplayName(modelId: string, pricingData: PricingData | undefined): string {
  const pricingName = pricingData?.model_info?.[modelId]?.name
  if (pricingName && pricingName !== modelId) {
    return pricingName
  }
  return modelIdToDisplayName(modelId)
}

function buildEnrichedModelConfigs(
  pricingData: PricingData | undefined,
): Record<string, ModelConfig> {
  const allModels = keyRegistry.getAllModels()
  const result: Record<string, ModelConfig> = {}

  for (const [modelId, bestProfile] of allModels) {
    const baseName = getModelDisplayName(modelId, pricingData)
    const displayName = buildDisplayName(baseName, bestProfile.groupDisplayName, bestProfile.groupRatio)

    result[modelId] = {
      name: displayName,
      limit: detectLimits(modelId),
      modalities: detectModalities(modelId),
    }
  }

  return result
}

// ===== Config Write =====

async function updateConfigModels(newModels: Record<string, ModelConfig>): Promise<boolean> {
  const paths = getConfigPaths()
  const jsoncExists = await fileExists(paths.jsonc)
  const jsonExists = await fileExists(paths.json)
  const configPath = jsoncExists ? paths.jsonc : jsonExists ? paths.json : paths.json
  const config = (await readJsonSafe(configPath)) ?? {}

  if (!config || typeof config !== "object") return false

  const providerMap = config.provider && typeof config.provider === "object" ? config.provider : {}
  const provider =
    providerMap[PROVIDER_ID] && typeof providerMap[PROVIDER_ID] === "object"
      ? providerMap[PROVIDER_ID]
      : {}
  const existingModels =
    provider.models && typeof provider.models === "object" ? provider.models : {}

  const mergedModels: Record<string, ModelConfig> = {}

  for (const [id, cfg] of Object.entries(newModels)) {
    mergedModels[id] = cfg
  }

  // Preserve user customizations on top of API-discovered models
  for (const [id, existingConfig] of Object.entries(existingModels)) {
    if (typeof existingConfig === "object" && existingConfig !== null) {
      // Only preserve user overrides for fields like limit/modalities, not the auto-generated name
      const existing = existingConfig as Record<string, unknown>
      if (mergedModels[id]) {
        // Keep API name (with group info), but allow user to override limit/modalities
        if (existing.limit) mergedModels[id].limit = existing.limit as ModelConfig["limit"]
        if (existing.modalities) mergedModels[id].modalities = existing.modalities as ModelConfig["modalities"]
      } else {
        // Model only exists in user config (not from API) — keep it
        mergedModels[id] = existingConfig as ModelConfig
      }
    }
  }

  const existingKeys = Object.keys(existingModels).sort().join(",")
  const mergedKeys = Object.keys(mergedModels).sort().join(",")
  if (existingKeys === mergedKeys) {
    let same = true
    for (const key of Object.keys(mergedModels)) {
      if (JSON.stringify(existingModels[key]) !== JSON.stringify(mergedModels[key])) {
        same = false
        break
      }
    }
    if (same) return false
  }

  provider.models = mergedModels
  providerMap[PROVIDER_ID] = provider
  config.provider = providerMap

  await mkdir(paths.dir, { recursive: true })
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8")

  const modelCount = Object.keys(mergedModels).length
  console.log(`[${PACKAGE_NAME}] Synced ${modelCount} models to config`)
  return true
}

// ===== Main Entry =====

export async function syncModelsFromApi(): Promise<boolean> {
  try {
    const { entries, authKey } = await gatherAllKeys()
    if (entries.length === 0) {
      console.log(`[${PACKAGE_NAME}] Model sync skipped: no API key found (run 'opencode auth login' first)`)
      return false
    }

    console.log(`[${PACKAGE_NAME}] Syncing models from NewClaw API (${entries.length} key(s))...`)

    const pricing = await fetchPricing()

    const discoveryResults = await Promise.allSettled(
      entries.map((entry, i) =>
        discoverKeyProfile(entry, i === 0 && authKey ? "auth" : "config", pricing),
      ),
    )

    // Register all successful profiles
    keyRegistry.clear()
    for (const result of discoveryResults) {
      if (result.status === "fulfilled" && result.value) {
        keyRegistry.register(result.value)
        const p = result.value
        console.log(
          `[${PACKAGE_NAME}] Key ${maskKey(p.key)}: ${p.models.length} models, group="${p.groupName}" (${p.groupDisplayName}, ${p.groupRatio}x)`,
        )
      }
    }

    const profiles = keyRegistry.getProfiles()
    if (profiles.length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: no valid keys returned models`)
      return false
    }

    // Save key registry cache
    await saveKeyRegistryCache(profiles)

    // Build enriched model configs with group info in display names
    const enrichedModels = buildEnrichedModelConfigs(pricing)
    if (Object.keys(enrichedModels).length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: no models found`)
      return false
    }

    return await updateConfigModels(enrichedModels)
  } catch (err) {
    console.warn(
      `[${PACKAGE_NAME}] Model auto-sync failed: ${err instanceof Error ? err.message : err}`,
    )
    return false
  }
}
