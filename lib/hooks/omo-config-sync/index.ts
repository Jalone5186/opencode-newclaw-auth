/**
 * @file omo-config-sync/index.ts
 * @input  assets/default-omo-config.json
 * @output ~/.config/opencode/oh-my-opencode.json (synced)
 * @pos    Hook - syncs OMO agent/category model assignments at runtime
 *
 * This module writes the default oh-my-opencode.json config file
 * so that oh-my-opencode uses NewClaw models for all agents and categories.
 * Only runs if oh-my-opencode is detected as installed.
 */

import { readFile, writeFile, access, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { PLUGIN_NAME } from "../../constants"
import defaultOmoConfig from "../../../assets/default-omo-config.json"

const homeDir = process.env.OPENCODE_TEST_HOME || os.homedir()
const configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config")
const configDir = path.join(configRoot, "opencode")
const omoConfigPath = path.join(configDir, "oh-my-opencode.json")

const fileExists = async (filePath: string) => {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Check if oh-my-opencode is installed by looking for its package
 */
async function isOmoInstalled(): Promise<boolean> {
  try {
    if (typeof import.meta.resolve === "function") {
      import.meta.resolve("oh-my-opencode")
      return true
    }
  } catch {
    // not found via import.meta.resolve
  }
  // Fallback: check if the config file already exists
  return fileExists(omoConfigPath)
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
 * Sync OMO config: write/update oh-my-opencode.json with NewClaw model assignments.
 * - If no config exists, write the full default config.
 * - If config exists, merge in any missing agents/categories from defaults.
 * - User customizations are preserved.
 */
export async function syncOmoConfig(): Promise<void> {
  const omoInstalled = await isOmoInstalled()
  if (!omoInstalled) {
    return // oh-my-opencode not installed, skip
  }

  await mkdir(configDir, { recursive: true })

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

  // Only write if content actually changed
  let existingStr = ""
  try {
    existingStr = await readFile(omoConfigPath, "utf-8")
  } catch {
    // file doesn't exist yet
  }

  if (mergedStr !== existingStr) {
    await writeFile(omoConfigPath, mergedStr, "utf-8")
    console.log(`[${PLUGIN_NAME}] Synced oh-my-opencode config at ${omoConfigPath}`)
  }
}
