/**
 * @file omo-config-sync/index.ts
 * @input  assets/default-omo-config.json
 * @output ~/.config/opencode/oh-my-openagent.json (synced)
 * @pos    Hook - syncs OMO agent/category model assignments at runtime
 *
 * This module writes the default oh-my-openagent.json config file
 * so that oh-my-openagent uses NewClaw models for all agents and categories.
 * Only runs if oh-my-openagent (or legacy oh-my-opencode) is detected as installed.
 */

import { readFile, writeFile, access, mkdir, rename } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { PLUGIN_NAME } from "../../constants"
import defaultOmoConfig from "../../../assets/default-omo-config.json"

const homeDir = process.env.OPENCODE_TEST_HOME || os.homedir()
const configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
const configDir = path.join(configRoot, "opencode")
const omoConfigPath = path.join(configDir, "oh-my-openagent.json")
const legacyOmoConfigPath = path.join(configDir, "oh-my-opencode.json")

const OMO_PLUGIN_NAME = "oh-my-openagent"
const OMO_LEGACY_PLUGIN_NAME = "oh-my-opencode"

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function isOmoInstalled(): Promise<boolean> {
  try {
    if (typeof import.meta.resolve === "function") {
      import.meta.resolve(OMO_LEGACY_PLUGIN_NAME)
      return true
    }
  } catch {
    // not found via import.meta.resolve
  }
  return (await fileExists(omoConfigPath)) || (await fileExists(legacyOmoConfigPath))
}

/**
 * Deep merge: existing config takes priority for user-customized values,
 * but missing agents/categories are filled in from defaults.
 */
function mergeOmoConfig(
  existing: Record<string, any>,
  defaults: Record<string, any>,
): Record<string, any> {
  const merged = { ...defaults }

  // Preserve $schema from defaults
  if (defaults.$schema) {
    merged.$schema = defaults.$schema
  }

  // Merge agents: keep user overrides, add missing defaults
  if (defaults.agents) {
    merged.agents = { ...defaults.agents }
    if (existing.agents && typeof existing.agents === "object") {
      for (const [name, config] of Object.entries(existing.agents)) {
        merged.agents[name] = config
      }
    }
  }

  // Merge categories: keep user overrides, add missing defaults
  if (defaults.categories) {
    merged.categories = { ...defaults.categories }
    if (existing.categories && typeof existing.categories === "object") {
      for (const [name, config] of Object.entries(existing.categories)) {
        merged.categories[name] = config
      }
    }
  }

  return merged
}

/**
 * Sync OMO config: write/update oh-my-openagent.json with NewClaw model assignments.
 * - If no config exists, write the full default config.
 * - If config exists, merge in any missing agents/categories from defaults.
 * - User customizations are preserved.
 * - Migrates legacy oh-my-opencode.json → oh-my-openagent.json if needed.
 */
export async function syncOmoConfig(): Promise<void> {
  const omoInstalled = await isOmoInstalled()
  if (!omoInstalled) {
    return
  }

  await mkdir(configDir, { recursive: true })

  // Migrate legacy config file if new one doesn't exist yet
  if (!(await fileExists(omoConfigPath)) && (await fileExists(legacyOmoConfigPath))) {
    try {
      await rename(legacyOmoConfigPath, omoConfigPath)
      console.log(`[${PLUGIN_NAME}] Migrated ${legacyOmoConfigPath} → ${omoConfigPath}`)
    } catch {
      // Non-fatal: just copy content instead
    }
  }

  // 1. Ensure oh-my-openagent is in opencode.json plugin list (replace legacy entry)
  const opencodeConfigPath = path.join(configDir, "opencode.json")
  const jsoncPath = path.join(configDir, "opencode.jsonc")
  const activeConfigPath = (await fileExists(jsoncPath)) ? jsoncPath : opencodeConfigPath
  try {
    let configText = ""
    try { configText = await readFile(activeConfigPath, "utf-8") } catch { /* no file */ }
    if (configText) {
      const config = JSON.parse(configText) as Record<string, any>
      const plugins: unknown[] = Array.isArray(config.plugin) ? config.plugin : []
      const hasNew = plugins.some(
        (e) => typeof e === "string" && (e === OMO_PLUGIN_NAME || (e as string).startsWith(OMO_PLUGIN_NAME + "@")),
      )
      const hasLegacy = plugins.some(
        (e) => typeof e === "string" && (e === OMO_LEGACY_PLUGIN_NAME || (e as string).startsWith(OMO_LEGACY_PLUGIN_NAME + "@")),
      )
      if (!hasNew) {
        const updatedPlugins = hasLegacy
          ? plugins.map((e) =>
              typeof e === "string" && (e === OMO_LEGACY_PLUGIN_NAME || (e as string).startsWith(OMO_LEGACY_PLUGIN_NAME + "@"))
                ? OMO_PLUGIN_NAME
                : e,
            )
          : [...plugins, OMO_PLUGIN_NAME]
        config.plugin = updatedPlugins
        await writeFile(activeConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8")
        console.log(`[${PLUGIN_NAME}] Updated plugin entry to ${OMO_PLUGIN_NAME} in plugin list`)
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Sync oh-my-openagent.json model assignments
  let existingConfig: Record<string, any> = {}
  if (await fileExists(omoConfigPath)) {
    try {
      const text = await readFile(omoConfigPath, "utf-8")
      existingConfig = JSON.parse(text)
    } catch {
      existingConfig = {}
    }
  }

  const mergedConfig = mergeOmoConfig(existingConfig, defaultOmoConfig)
  const mergedStr = JSON.stringify(mergedConfig, null, 2) + "\n"

  let existingStr = ""
  try {
    existingStr = await readFile(omoConfigPath, "utf-8")
  } catch {
    // file doesn't exist yet
  }

  if (mergedStr !== existingStr) {
    await writeFile(omoConfigPath, mergedStr, "utf-8")
    console.log(`[${PLUGIN_NAME}] Synced oh-my-openagent config at ${omoConfigPath}`)
  }
}
