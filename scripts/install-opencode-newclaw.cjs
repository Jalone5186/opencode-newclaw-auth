#!/usr/bin/env node

/**
 * @file install-opencode-newclaw.js
 * @input  ~/.config/opencode/opencode.json
 * @output Updated opencode.json with newclaw provider config
 * @pos    postinstall script - auto-configures OpenCode for NewClaw
 *
 * NOTE: This script uses CommonJS for maximum Node.js compatibility.
 */

const { existsSync } = require("node:fs");
const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const PACKAGE_NAME = "opencode-newclaw-auth";
const PROVIDER_ID = "newclaw";
const PROVIDER_NAME = "NewClaw";
const DEFAULT_API = "https://newclaw.ai/v1";
const DEFAULT_ENV = ["NEWCLAW_API_KEY"];

const IMAGE_MODALITIES = { input: ["text", "image"], output: ["text"] };

const MODEL_CONFIGS = {
  "claude-opus-4-6-20260205": { name: "Claude Opus 4.6", modalities: IMAGE_MODALITIES },
  "claude-sonnet-4-5-20250929": { name: "Claude Sonnet 4.5", modalities: IMAGE_MODALITIES },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", modalities: IMAGE_MODALITIES },
  "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5", modalities: IMAGE_MODALITIES },
  "gpt-5.3-codex": { name: "GPT-5.3 Codex", modalities: IMAGE_MODALITIES },
  "gpt-5.2": { name: "GPT-5.2", modalities: IMAGE_MODALITIES },
  "gemini-3-pro": { name: "Gemini 3 Pro", modalities: IMAGE_MODALITIES },
  "gemini-3.1-pro-preview": { name: "Gemini 3.1 Pro Preview", modalities: IMAGE_MODALITIES },
};

const DEFAULT_MODEL = "newclaw/claude-opus-4-6-20260205";

const ALLOWED_MODEL_IDS = Object.keys(MODEL_CONFIGS);

const home = process.env.OPENCODE_TEST_HOME || os.homedir();
const configRoot = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
const configDir = path.join(configRoot, "opencode");
const configJsoncPath = path.join(configDir, "opencode.jsonc");
const configPath = path.join(configDir, "opencode.json");

// Plugin entry uses package name (portable across machines)
const PLUGIN_ENTRY = PACKAGE_NAME;
const PROVIDER_NPM = require("node:url").pathToFileURL(path.resolve(__dirname, "..", "provider.ts")).href;

function stripJsoncComments(text) {
  // Remove single-line comments and multi-line comments
  return text
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

async function readJson(filePath) {
  try {
    const text = await readFile(filePath, "utf-8");
    const isJsonc = filePath.endsWith(".jsonc");
    return JSON.parse(isJsonc ? stripJsoncComments(text) : text);
  } catch {
    return undefined;
  }
}

function toModelMap(ids, existing) {
  existing = existing || {};
  return ids.reduce(function (acc, id) {
    const existingConfig = Object.prototype.hasOwnProperty.call(existing, id) ? existing[id] : {};
    const defaultConfig = MODEL_CONFIGS[id] || {};
    acc[id] = Object.assign({}, defaultConfig, typeof existingConfig === "object" ? existingConfig : {});
    return acc;
  }, {});
}

function ensurePluginEntry(list) {
  if (!Array.isArray(list)) return [PLUGIN_ENTRY];
  const hasPlugin = list.some(function (entry) {
    return (
      typeof entry === "string" &&
      (entry === PLUGIN_ENTRY || entry === PACKAGE_NAME || entry.startsWith(PACKAGE_NAME + "@"))
    );
  });
  return hasPlugin ? list : list.concat([PLUGIN_ENTRY]);
}

function applyProviderConfig(config) {
  if (!config || typeof config !== "object") return false;

  let changed = false;

  const providerMap = config.provider && typeof config.provider === "object" ? config.provider : {};
  const existing = providerMap[PROVIDER_ID] && typeof providerMap[PROVIDER_ID] === "object" ? providerMap[PROVIDER_ID] : {};
  const existingModels = existing.models && typeof existing.models === "object" ? existing.models : {};

  const next = Object.assign({}, existing);

  if (!next.name) {
    next.name = PROVIDER_NAME;
    changed = true;
  }

  if (!Array.isArray(next.env)) {
    next.env = DEFAULT_ENV;
    changed = true;
  }

  if (
    !next.npm ||
    (typeof next.npm === "string" &&
      (next.npm === PACKAGE_NAME || next.npm.startsWith(PACKAGE_NAME + "@")))
  ) {
    next.npm = PROVIDER_NPM;
    changed = true;
  }

  if (!next.api) {
    next.api = DEFAULT_API;
    changed = true;
  }

  const hasMissingModels = ALLOWED_MODEL_IDS.some(function (id) {
    return !Object.prototype.hasOwnProperty.call(existingModels, id);
  });
  if (!next.models || hasMissingModels) {
    next.models = Object.assign({}, existingModels, toModelMap(ALLOWED_MODEL_IDS, existingModels));
    changed = true;
  }

  providerMap[PROVIDER_ID] = next;
  if (config.provider !== providerMap) {
    config.provider = providerMap;
    changed = true;
  }

  const nextPlugins = ensurePluginEntry(config.plugin);
  if (nextPlugins !== config.plugin) {
    config.plugin = nextPlugins;
    changed = true;
  }

  if (!config.model) {
    config.model = DEFAULT_MODEL;
    changed = true;
  }

  return changed;
}

async function checkOmoInstalled() {
  try {
    require.resolve("oh-my-opencode");
    return true;
  } catch {
    return false;
  }
}

async function writeOmoConfig() {
  var omoConfigPath = path.join(configDir, "oh-my-opencode.json");
  var defaultConfigPath = path.resolve(__dirname, "..", "assets", "default-omo-config.json");

  try {
    var defaultConfig = JSON.parse(await readFile(defaultConfigPath, "utf-8"));
    var existingConfig = {};

    try {
      existingConfig = JSON.parse(await readFile(omoConfigPath, "utf-8"));
    } catch {
      // no existing config
    }

    // Merge: defaults first, then user overrides
    var merged = Object.assign({}, defaultConfig);
    if (existingConfig.agents && typeof existingConfig.agents === "object") {
      merged.agents = Object.assign({}, defaultConfig.agents, existingConfig.agents);
    }
    if (existingConfig.categories && typeof existingConfig.categories === "object") {
      merged.categories = Object.assign({}, defaultConfig.categories, existingConfig.categories);
    }

    await writeFile(omoConfigPath, JSON.stringify(merged, null, 2) + "\n", "utf-8");
    console.log("[" + PACKAGE_NAME + "] Synced oh-my-opencode config at " + omoConfigPath);
  } catch (e) {
    // Non-fatal: OMO config sync is optional
    console.warn("[" + PACKAGE_NAME + "] Could not sync OMO config: " + (e instanceof Error ? e.message : e));
  }
}

async function main() {
  var activeConfigPath = existsSync(configJsoncPath) ? configJsoncPath : configPath;
  var config = (await readJson(activeConfigPath)) || {};

  var changed = applyProviderConfig(config);

  // If oh-my-opencode is installed, register it as a plugin too
  var omoInstalled = await checkOmoInstalled();
  if (omoInstalled) {
    var plugins = Array.isArray(config.plugin) ? config.plugin : [];
    var hasOmo = plugins.some(function (entry) {
      return typeof entry === "string" && (entry === "oh-my-opencode" || entry.startsWith("oh-my-opencode@"));
    });
    if (!hasOmo) {
      config.plugin = plugins.concat(["oh-my-opencode"]);
      changed = true;
      console.log("[" + PACKAGE_NAME + "] Added oh-my-opencode to plugin list");
    }
  }

  if (changed) {
    await mkdir(configDir, { recursive: true });
    await writeFile(activeConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log("[" + PACKAGE_NAME + "] Updated OpenCode config at " + activeConfigPath);
  }

  // Sync OMO model assignments config
  if (omoInstalled) {
    await writeOmoConfig();
  }
}

main().catch(function (error) {
  console.error(
    "[" + PACKAGE_NAME + "] Failed to update opencode config: " + (error instanceof Error ? error.message : error)
  );
});
