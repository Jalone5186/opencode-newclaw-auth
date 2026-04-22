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
  "claude-opus-4-6": { name: "Claude Opus 4.6", modalities: IMAGE_MODALITIES },
  "claude-sonnet-4-6": { name: "Claude Sonnet 4.6", modalities: IMAGE_MODALITIES },
  "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5", modalities: IMAGE_MODALITIES },
  "gpt-5-codex-high": { name: "GPT-5 Codex High", modalities: IMAGE_MODALITIES },
  "gpt-5.3-codex": { name: "GPT-5.3 Codex", modalities: IMAGE_MODALITIES },
  "gpt-5.3-codex-high": { name: "GPT-5.3 Codex High", modalities: IMAGE_MODALITIES },
  "gpt-5.4": { name: "GPT-5.4", modalities: IMAGE_MODALITIES },
  "gpt-5.2": { name: "GPT-5.2", modalities: IMAGE_MODALITIES },
  "o4-mini": { name: "O4 Mini", modalities: IMAGE_MODALITIES },
  "deepseek-r1": { name: "DeepSeek R1", modalities: { input: ["text"], output: ["text"] } },
  "deepseek-v3": { name: "DeepSeek V3", modalities: { input: ["text"], output: ["text"] } },
  "grok-4": { name: "Grok 4", modalities: IMAGE_MODALITIES },
};

const DEFAULT_MODEL = "newclaw/claude-opus-4-6";

const ALLOWED_MODEL_IDS = Object.keys(MODEL_CONFIGS);

const home = process.env.OPENCODE_TEST_HOME || os.homedir();
const configRoot = process.env.XDG_CONFIG_HOME || path.join(home, ".config");
const configDir = path.join(configRoot, "opencode");
const configJsoncPath = path.join(configDir, "opencode.jsonc");
const configPath = path.join(configDir, "opencode.json");

// Plugin entry uses package name; provider npm uses file:// absolute path
// so OpenCode's Go binary can load it directly without Node.js module resolution
var PLUGIN_ENTRY = PACKAGE_NAME;
var PROVIDER_NPM = "file://" + path.resolve(__dirname, "..", "dist", "provider.js");

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

  if (next.npm !== PROVIDER_NPM) {
    next.npm = PROVIDER_NPM;
    changed = true;
  }

  if (next.api !== DEFAULT_API) {
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
  // npm sets INIT_CWD to the directory where `npm install` was run
  // npm_config_local_prefix points to the project root with node_modules
  var installRoot = process.env.INIT_CWD || process.env.npm_config_local_prefix || process.cwd();
  // Method 1: Check node_modules in the install root (new name first, then legacy)
  var nmPathNew = path.join(installRoot, "node_modules", "oh-my-openagent");
  if (existsSync(nmPathNew)) return true;
  var nmPath = path.join(installRoot, "node_modules", "oh-my-opencode");
  if (existsSync(nmPath)) return true;
  // Method 2: Check sibling from __dirname
  var siblingPathNew = path.resolve(__dirname, "..", "..", "oh-my-openagent");
  if (existsSync(siblingPathNew)) return true;
  var siblingPath = path.resolve(__dirname, "..", "..", "oh-my-opencode");
  if (existsSync(siblingPath)) return true;
  // Method 3: Try require.resolve
  try {
    require.resolve("oh-my-opencode");
    return true;
  } catch {
    // not resolvable
  }
  // Method 4: Check global node_modules
  try {
    var npmPrefix = require("child_process").execSync("npm prefix -g", { encoding: "utf-8" }).trim();
    if (existsSync(path.join(npmPrefix, "lib", "node_modules", "oh-my-opencode"))) return true;
  } catch {
    // npm not available
  }
  return false;
}

async function writeOmoConfig() {
  var omoConfigPath = path.join(configDir, "oh-my-openagent.json");
  var legacyOmoConfigPath = path.join(configDir, "oh-my-opencode.json");
  var defaultConfigPath = path.resolve(__dirname, "..", "assets", "default-omo-config.json");

  try {
    var defaultConfig = JSON.parse(await readFile(defaultConfigPath, "utf-8"));
    var existingConfig = {};

    // Read from new path first, fall back to legacy
    try {
      existingConfig = JSON.parse(await readFile(omoConfigPath, "utf-8"));
    } catch {
      try {
        existingConfig = JSON.parse(await readFile(legacyOmoConfigPath, "utf-8"));
      } catch {
        // no existing config
      }
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
    console.log("[" + PACKAGE_NAME + "] Synced oh-my-openagent config at " + omoConfigPath);
  } catch (e) {
    // Non-fatal: OMO config sync is optional
    console.warn("[" + PACKAGE_NAME + "] Could not sync OMO config: " + (e instanceof Error ? e.message : e));
  }
}


var CODING_MODEL_PREFIXES = ["claude-", "gpt-", "o1-", "o3-", "o4-", "deepseek-", "grok-", "codex-", "gemini-"];
var SKIP_PATTERNS = [/^gpt-3/, /^gpt-4(?!o)/i, /embedding/i, /whisper/i, /tts/i, /dall-e/i, /moderation/i, /realtime/i, /audio/i];
var API_TIMEOUT_MS = 10000;


function isCodingModel(id) {
  var lower = id.toLowerCase();
  var matches = CODING_MODEL_PREFIXES.some(function (p) { return lower.startsWith(p); });
  if (!matches) return false;
  return !SKIP_PATTERNS.some(function (p) { return p.test(lower); });
}

function modelIdToDisplayName(id) {
  return id.split("-").map(function (part) {
    if (/^\d/.test(part)) return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(" ")
    .replace(/^Gpt /, "GPT-")
    .replace(/^O(\d)/, "O$1")
    .replace(/^Deepseek /, "DeepSeek ")
    .replace(/^Codex /, "Codex ")
    .replace(/^Gemini /, "Gemini ");
}

function detectModalities(id) {
  if (id.toLowerCase().startsWith("deepseek-")) return { input: ["text"], output: ["text"] };
  return { input: ["text", "image"], output: ["text"] };
}

function detectLimits(id) {
  var lower = id.toLowerCase();
  if (lower.includes("codex") || lower.startsWith("gpt-5")) return { context: 400000, output: 128000 };
  if (lower.startsWith("claude-")) {
    if (lower.includes("haiku")) return { context: 200000, output: 8192 };
    return { context: 200000, output: 64000 };
  }
  if (lower.startsWith("deepseek-")) return { context: 128000, output: 64000 };
  if (/^o[134]-/.test(lower) || lower.startsWith("grok-")) return { context: 200000, output: 100000 };
  if (lower.startsWith("gemini-")) return { context: 1000000, output: 65536 };
  return { context: 128000, output: 32000 };
}

async function syncModelsFromApi() {
  try {
    var apiKey = process.env.NEWCLAW_API_KEY;
    if (!apiKey) {
      var dataDirs = [
        process.env.XDG_DATA_HOME || path.join(home, ".local", "share"),
        process.env.XDG_CONFIG_HOME || path.join(home, ".config"),
      ];
      for (var i = 0; i < dataDirs.length; i++) {
        try {
          var authPath = path.join(dataDirs[i], "opencode", "auth.json");
          var authData = JSON.parse(await readFile(authPath, "utf-8"));
          var newclawAuth = authData && (authData[PROVIDER_ID] || authData.newclaw);
          if (newclawAuth && newclawAuth.key) { apiKey = newclawAuth.key.trim(); break; }
        } catch { /* try next location */ }
      }
    }

    if (!apiKey) {
      // Try keys[] from opencode.json config
      var activeConfigPath1 = existsSync(configJsoncPath) ? configJsoncPath : configPath;
      var configForKeys = await readJson(activeConfigPath1);
      if (configForKeys && configForKeys.provider && configForKeys.provider[PROVIDER_ID]) {
        var provKeys = configForKeys.provider[PROVIDER_ID].keys;
        if (Array.isArray(provKeys)) {
          for (var j = 0; j < provKeys.length; j++) {
            if (provKeys[j] && provKeys[j].key) { apiKey = provKeys[j].key.trim(); break; }
          }
        }
      }
    }

    if (!apiKey) {
      console.log("[" + PACKAGE_NAME + "] Model sync skipped: no API key found (run 'opencode auth login' first)");
      return;
    }

    console.log("[" + PACKAGE_NAME + "] Syncing models from NewClaw API...");

    var https = require("node:https");
    var data = await new Promise(function (resolve) {
      var req = https.get("https://newclaw.ai/v1/models", {
        headers: { "Authorization": "Bearer " + apiKey },
        timeout: API_TIMEOUT_MS,
      }, function (res) {
        if (res.statusCode !== 200) {
          console.warn("[" + PACKAGE_NAME + "] Model sync: API returned HTTP " + res.statusCode);
          resolve(null);
          return;
        }
        var chunks = [];
        res.on("data", function (c) { chunks.push(c); });
        res.on("end", function () {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
          catch { resolve(null); }
        });
      });
      req.on("error", function () { resolve(null); });
      req.on("timeout", function () { req.destroy(); resolve(null); });
    });

    if (!data || !Array.isArray(data.data)) {
      console.warn("[" + PACKAGE_NAME + "] Model sync: API returned no models (check network or API key)");
      return;
    }

    console.log("[" + PACKAGE_NAME + "] API returned " + data.data.length + " models, syncing to config...");

    var newModels = {};
    data.data.forEach(function (m) {
      newModels[m.id] = {
        name: modelIdToDisplayName(m.id),
        limit: detectLimits(m.id),
        modalities: detectModalities(m.id),
      };
    });

    var modelCount = Object.keys(newModels).length;
    if (modelCount === 0) return;

    var activeConfigPath2 = existsSync(configJsoncPath) ? configJsoncPath : configPath;
    var config2 = (await readJson(activeConfigPath2)) || {};
    var prov = (config2.provider && config2.provider[PROVIDER_ID]) || {};
    var existing = prov.models || {};

    var merged = Object.assign({}, newModels, existing);
    prov.models = merged;
    if (!config2.provider) config2.provider = {};
    config2.provider[PROVIDER_ID] = prov;

    await writeFile(activeConfigPath2, JSON.stringify(config2, null, 2) + "\n", "utf-8");
    console.log("[" + PACKAGE_NAME + "] Synced " + modelCount + " models from NewClaw API");
  } catch (e) {
    console.warn("[" + PACKAGE_NAME + "] Model sync failed (non-fatal): " + (e instanceof Error ? e.message : e));
  }
}
var credentialsPath = path.resolve(__dirname, "..", ".newclaw-credentials");

function askQuestion(rl, question) {
  return new Promise(function (resolve) {
    rl.question(question, function (answer) {
      resolve(answer.trim());
    });
  });
}

async function promptCredentials() {
  // Check if credentials already exist
  try {
    var existing = JSON.parse(await readFile(credentialsPath, "utf-8"));
    if (existing && existing.username && existing.password) {
      console.log("[" + PACKAGE_NAME + "] Found existing credentials for: " + existing.username);
      return;
    }
  } catch { /* no existing credentials */ }

  // Check if running in non-interactive mode (CI/CD)
  if (!process.stdin.isTTY) {
    console.log("[" + PACKAGE_NAME + "] Non-interactive mode — skip credential setup (run 'opencode auth login' later)");
    return;
  }

  var readline = require("node:readline");
  var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("");
    console.log("[" + PACKAGE_NAME + "] 🔐 NewClaw 平台账号配置");
    console.log("[" + PACKAGE_NAME + "] 请输入你在 newclaw.ai 注册的账号和密码");
    console.log("[" + PACKAGE_NAME + "] (跳过此步也可以，之后运行 opencode auth login 配置)");
    console.log("");

    var username = await askQuestion(rl, "NewClaw 用户名/邮箱 (回车跳过): ");
    if (!username) {
      console.log("[" + PACKAGE_NAME + "] 已跳过账号配置");
      return;
    }

    var password = await askQuestion(rl, "NewClaw 密码: ");
    if (!password) {
      console.log("[" + PACKAGE_NAME + "] 已跳过账号配置");
      return;
    }

    await mkdir(path.dirname(credentialsPath), { recursive: true });
    await writeFile(credentialsPath, JSON.stringify({ username: username, password: password }, null, 2) + "\n", "utf-8");
    console.log("[" + PACKAGE_NAME + "] ✅ 账号已保存至 " + credentialsPath);
  } finally {
    rl.close();
  }
}

async function main() {
  var activeConfigPath = existsSync(configJsoncPath) ? configJsoncPath : configPath;
  var config = (await readJson(activeConfigPath)) || {};

  var changed = applyProviderConfig(config);

  var omoInstalled = await checkOmoInstalled();
  if (omoInstalled) {
    var plugins = Array.isArray(config.plugin) ? config.plugin : [];
    var hasOmoNew = plugins.some(function (entry) {
      return typeof entry === "string" && (entry === "oh-my-openagent" || entry.startsWith("oh-my-openagent@"));
    });
    if (!hasOmoNew) {
      // Replace legacy entry or add new entry
      var hasOmoLegacy = plugins.some(function (entry) {
        return typeof entry === "string" && (entry === "oh-my-opencode" || entry.startsWith("oh-my-opencode@"));
      });
      if (hasOmoLegacy) {
        config.plugin = plugins.map(function (entry) {
          if (typeof entry === "string" && (entry === "oh-my-opencode" || entry.startsWith("oh-my-opencode@"))) {
            return "oh-my-openagent";
          }
          return entry;
        });
      } else {
        config.plugin = plugins.concat(["oh-my-openagent"]);
      }
      changed = true;
      console.log("[" + PACKAGE_NAME + "] Added oh-my-openagent to plugin list");
    }
  }

  if (changed) {
    await mkdir(configDir, { recursive: true });
    await writeFile(activeConfigPath, JSON.stringify(config, null, 2) + "\n", "utf-8");
    console.log("[" + PACKAGE_NAME + "] Updated OpenCode config at " + activeConfigPath);
  }

  await syncModelsFromApi();

  if (omoInstalled) {
    await writeOmoConfig();
  }

  await promptCredentials();
}

main().catch(function (error) {
  console.error(
    "[" + PACKAGE_NAME + "] Failed to update opencode config: " + (error instanceof Error ? error.message : error)
  );
});
