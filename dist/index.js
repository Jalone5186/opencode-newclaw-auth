// @bun
// index.ts
import { mkdir as mkdir3, readFile as readFile3, writeFile as writeFile3, access as access2 } from "fs/promises";
import path3 from "path";
import os3 from "os";

// lib/constants.ts
var PLUGIN_NAME = "opencode-newclaw-auth";
var PROVIDER_ID = "newclaw";
var AUTH_METHOD_LABEL = "NewClaw API Key";
var NEWCLAW_ANTHROPIC_BASE_URL = "https://newclaw.ai/v1";
var CODEX_BASE_URL = "https://newclaw.ai/v1";
var USER_AGENT = "opencode-newclaw-auth/0.1.0";
var ORIGINATOR = "opencode_newclaw";
var SAVE_RAW_RESPONSE_ENV = "SAVE_RAW_RESPONSE";
var HEADER_NAMES = {
  AUTHORIZATION: "authorization",
  ORIGINATOR: "originator",
  SESSION_ID: "session_id",
  CONVERSATION_ID: "conversation_id",
  USER_AGENT: "user-agent",
  ACCEPT: "accept",
  CONTENT_TYPE: "content-type",
  OPENAI_BETA: "openai-beta",
  CHATGPT_ACCOUNT_ID: "chatgpt-account-id"
};

// lib/logger.ts
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { homedir, tmpdir } from "os";
var LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1";
var DEBUG_ENABLED = process.env.DEBUG_NEWCLAW_PLUGIN === "1" || LOGGING_ENABLED;
var SAVE_RAW_RESPONSE_ENABLED = process.env[SAVE_RAW_RESPONSE_ENV] === "1";
var LOG_DIR = join(homedir(), ".opencode", "logs", PLUGIN_NAME);
var RAW_RESPONSE_DIR = join(tmpdir(), PLUGIN_NAME, "raw-responses");
if (LOGGING_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Request logging ENABLED - logs: ${LOG_DIR}`);
}
if (DEBUG_ENABLED && !LOGGING_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Debug logging ENABLED`);
}
if (SAVE_RAW_RESPONSE_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Raw response saving ENABLED - dir: ${RAW_RESPONSE_DIR}`);
}
var requestCounter = 0;
function logRequest(stage, data) {
  if (!LOGGING_ENABLED)
    return;
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString();
  const requestId = ++requestCounter;
  const filename = join(LOG_DIR, `request-${requestId}-${stage}.json`);
  try {
    writeFileSync(filename, JSON.stringify({ timestamp, requestId, stage, ...data }, null, 2), "utf8");
  } catch (e) {
    const error = e;
    console.error(`[${PLUGIN_NAME}] Failed to write log:`, error.message);
  }
}
function logDebug(message, data) {
  if (!DEBUG_ENABLED)
    return;
  if (data !== undefined) {
    console.log(`[${PLUGIN_NAME}] ${message}`, data);
  } else {
    console.log(`[${PLUGIN_NAME}] ${message}`);
  }
}
var rawResponseCounter = 0;
function saveRawResponse(provider, responseBody, metadata) {
  if (!SAVE_RAW_RESPONSE_ENABLED)
    return;
  if (!existsSync(RAW_RESPONSE_DIR)) {
    mkdirSync(RAW_RESPONSE_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const responseId = ++rawResponseCounter;
  const filename = join(RAW_RESPONSE_DIR, `${provider}-${timestamp}-${responseId}.json`);
  try {
    writeFileSync(filename, JSON.stringify({ timestamp: new Date().toISOString(), responseId, provider, ...metadata, body: responseBody }, null, 2), "utf8");
  } catch (e) {
    const error = e;
    console.error(`[${PLUGIN_NAME}] Failed to save raw response:`, error.message);
  }
}

// lib/request/request-transformer.ts
function normalizeModel(model) {
  if (!model)
    return "gpt-5-codex-high";
  const modelId = model.includes("/") ? model.split("/").pop() : model;
  const normalized = modelId.toLowerCase();
  if (normalized.includes("gpt-5-codex-high") || normalized.includes("gpt 5 codex high")) {
    return "gpt-5-codex-high";
  }
  if (normalized.includes("gpt-5.2") || normalized.includes("gpt 5.2")) {
    return "gpt-5.2";
  }
  if (normalized.includes("codex")) {
    return "gpt-5-codex-high";
  }
  return modelId;
}
function resolveReasoningConfig(modelName, body) {
  const providerOpenAI = body.providerOptions?.openai;
  const existingEffort = body.reasoning?.effort ?? providerOpenAI?.reasoningEffort;
  const existingSummary = body.reasoning?.summary ?? providerOpenAI?.reasoningSummary;
  const mergedConfig = {
    ...existingEffort ? { reasoningEffort: existingEffort } : {},
    ...existingSummary ? { reasoningSummary: existingSummary } : {}
  };
  return getReasoningConfig(modelName, mergedConfig);
}
function resolveTextVerbosity(body) {
  const providerOpenAI = body.providerOptions?.openai;
  return body.text?.verbosity ?? providerOpenAI?.textVerbosity ?? "medium";
}
function resolveInclude(body) {
  const providerOpenAI = body.providerOptions?.openai;
  const base = body.include ?? providerOpenAI?.include ?? ["reasoning.encrypted_content"];
  const include = Array.from(new Set(base.filter(Boolean)));
  if (!include.includes("reasoning.encrypted_content")) {
    include.push("reasoning.encrypted_content");
  }
  return include;
}
function sanitizeItemIds(input) {
  return input.filter((item) => item.type !== "item_reference").map((item) => {
    if (!("id" in item))
      return item;
    const { id, ...rest } = item;
    return rest;
  });
}
function getReasoningConfig(modelName, userConfig = {}) {
  const normalizedName = modelName?.toLowerCase() ?? "";
  const isGpt5Codex = normalizedName.includes("gpt-5-codex") || normalizedName.includes("gpt 5 codex");
  const isGpt52General = normalizedName.includes("gpt-5.2") || normalizedName.includes("gpt 5.2");
  const supportsXhigh = isGpt52General || isGpt5Codex;
  const supportsNone = isGpt52General;
  const defaultEffort = supportsXhigh ? "high" : "medium";
  let effort = userConfig.reasoningEffort || defaultEffort;
  if (!supportsXhigh && effort === "xhigh") {
    effort = "high";
  }
  if (!supportsNone && effort === "none") {
    effort = "low";
  }
  return {
    effort,
    summary: userConfig.reasoningSummary || "auto"
  };
}
function normalizeOrphanedToolOutputs(input) {
  const callIds = new Set;
  for (const item of input) {
    if (item.type === "function_call" && typeof item.call_id === "string") {
      callIds.add(item.call_id);
    }
  }
  return input.filter((item) => {
    if (item.type === "function_call_output" && typeof item.call_id === "string") {
      return callIds.has(item.call_id);
    }
    return true;
  });
}
async function transformRequestBody(body) {
  const originalModel = body.model;
  const normalizedModel = normalizeModel(body.model);
  logDebug(`Model lookup: "${originalModel}" -> "${normalizedModel}"`, {
    hasTools: !!body.tools
  });
  body.model = normalizedModel;
  body.stream = true;
  body.store = false;
  if (body.input && Array.isArray(body.input)) {
    body.input = sanitizeItemIds(body.input);
    body.input = normalizeOrphanedToolOutputs(body.input);
  }
  const reasoningConfig = resolveReasoningConfig(normalizedModel, body);
  body.reasoning = { ...body.reasoning, ...reasoningConfig };
  const verbosity = resolveTextVerbosity(body);
  body.text = { ...body.text, verbosity };
  body.include = resolveInclude(body);
  body.max_output_tokens = undefined;
  body.max_completion_tokens = undefined;
  return body;
}

// lib/request/response-handler.ts
function parseSseStream(sseText) {
  const lines = sseText.split(`
`);
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.substring(6));
        if (data.type === "response.done" || data.type === "response.completed") {
          return data.response;
        }
      } catch {}
    }
  }
  return null;
}
async function convertSseToJson(response, headers) {
  if (!response.body) {
    throw new Error(`[${PLUGIN_NAME}] Response has no body`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder;
  let fullText = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done)
        break;
      fullText += decoder.decode(value, { stream: true });
    }
    if (LOGGING_ENABLED) {
      logRequest("stream-full", { fullContent: fullText });
    }
    const finalResponse = parseSseStream(fullText);
    if (!finalResponse) {
      console.error(`[${PLUGIN_NAME}] Could not find final response in SSE stream`);
      logRequest("stream-error", { error: "No response.done event found" });
      return new Response(fullText, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    const jsonHeaders = new Headers(headers);
    jsonHeaders.set("content-type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(finalResponse), {
      status: response.status,
      statusText: response.statusText,
      headers: jsonHeaders
    });
  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Error converting stream:`, error);
    logRequest("stream-error", { error: String(error) });
    throw error;
  }
}
function ensureContentType(headers) {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "text/event-stream; charset=utf-8");
  }
  return responseHeaders;
}

// lib/request/fetch-helpers.ts
function extractRequestUrl(input) {
  if (typeof input === "string")
    return input;
  if (input instanceof URL)
    return input.toString();
  return input.url;
}
function sanitizeRequestBody(bodyStr) {
  try {
    const body = JSON.parse(bodyStr);
    body.store = false;
    if (Array.isArray(body.input)) {
      body.input = sanitizeItemIds(body.input);
      body.input = normalizeOrphanedToolOutputs(body.input);
    }
    return JSON.stringify(body);
  } catch {
    return bodyStr;
  }
}
async function transformRequestForCodex(init) {
  if (!init?.body || typeof init.body !== "string")
    return;
  try {
    const body = JSON.parse(init.body);
    const transformedBody = await transformRequestBody(body);
    logRequest("after-transform", {
      model: transformedBody.model,
      hasTools: !!transformedBody.tools,
      hasInput: !!transformedBody.input
    });
    return {
      body: transformedBody,
      updatedInit: { ...init, body: JSON.stringify(transformedBody) }
    };
  } catch (error) {
    logDebug("codex-transform-error", {
      error: error instanceof Error ? error.message : String(error)
    });
    const sanitized = sanitizeRequestBody(init.body);
    return {
      body: JSON.parse(sanitized),
      updatedInit: { ...init, body: sanitized }
    };
  }
}
function createNewclawHeaders(init, apiKey, opts) {
  const headers = new Headers(init?.headers ?? {});
  headers.delete(HEADER_NAMES.OPENAI_BETA);
  headers.delete(HEADER_NAMES.CHATGPT_ACCOUNT_ID);
  headers.delete("x-api-key");
  headers.set(HEADER_NAMES.AUTHORIZATION, `Bearer ${apiKey}`);
  headers.set(HEADER_NAMES.ORIGINATOR, ORIGINATOR);
  headers.set(HEADER_NAMES.USER_AGENT, USER_AGENT);
  headers.set(HEADER_NAMES.ACCEPT, "text/event-stream");
  if (!headers.has(HEADER_NAMES.CONTENT_TYPE)) {
    headers.set(HEADER_NAMES.CONTENT_TYPE, "application/json");
  }
  const cacheKey = opts?.promptCacheKey;
  if (cacheKey) {
    headers.set(HEADER_NAMES.CONVERSATION_ID, cacheKey);
    headers.set(HEADER_NAMES.SESSION_ID, cacheKey);
  } else {
    headers.delete(HEADER_NAMES.CONVERSATION_ID);
    headers.delete(HEADER_NAMES.SESSION_ID);
  }
  return headers;
}
async function handleErrorResponse(response) {
  logRequest("error-response", {
    status: response.status,
    statusText: response.statusText
  });
  return response;
}
async function handleSuccessResponse(response, isStreaming) {
  const responseHeaders = ensureContentType(response.headers);
  if (!isStreaming) {
    return await convertSseToJson(response, responseHeaders);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

// lib/request/claude-tools-transform.ts
var TOOL_PREFIX = "mcp_";
function transformClaudeRequest(init) {
  if (!init?.body || typeof init.body !== "string") {
    return init;
  }
  try {
    const parsed = JSON.parse(init.body);
    let modified = false;
    if (parsed.tools && Array.isArray(parsed.tools)) {
      parsed.tools = parsed.tools.map((tool) => {
        if (tool.name && !tool.name.startsWith(TOOL_PREFIX)) {
          modified = true;
          return { ...tool, name: `${TOOL_PREFIX}${tool.name}` };
        }
        return tool;
      });
    }
    if (parsed.messages && Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map((msg) => {
        if (msg.content && Array.isArray(msg.content)) {
          const newContent = msg.content.map((block) => {
            if (block.type === "tool_use" && block.name && !block.name.startsWith(TOOL_PREFIX)) {
              modified = true;
              return { ...block, name: `${TOOL_PREFIX}${block.name}` };
            }
            return block;
          });
          return { ...msg, content: newContent };
        }
        return msg;
      });
    }
    if (!modified)
      return init;
    return { ...init, body: JSON.stringify(parsed) };
  } catch {
    return init;
  }
}
function transformClaudeResponse(response) {
  if (!response.body || !response.ok)
    return response;
  const reader = response.body.getReader();
  const decoder = new TextDecoder;
  const encoder = new TextEncoder;
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        let text = decoder.decode(value, { stream: true });
        text = text.replace(new RegExp(`"name"\\s*:\\s*"${TOOL_PREFIX}([^"]+)"`, "g"), '"name": "$1"');
        controller.enqueue(encoder.encode(text));
      } catch (error) {
        controller.error(error);
      }
    },
    cancel() {
      reader.cancel();
    }
  });
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// lib/models/registry.ts
function resolveApiKeyForFamily(family, unifiedKey) {
  const envMap = {
    claude: "NEWCLAW_CLAUDE_API_KEY",
    codex: "NEWCLAW_CODEX_API_KEY",
    deepseek: "NEWCLAW_DEEPSEEK_API_KEY",
    grok: "NEWCLAW_GROK_API_KEY",
    gemini: "NEWCLAW_GEMINI_API_KEY"
  };
  const envKey = process.env[envMap[family]];
  if (envKey?.trim())
    return envKey.trim();
  return unifiedKey;
}
function detectFamily(modelId) {
  const id = modelId.toLowerCase();
  if (id.startsWith("claude-"))
    return "claude";
  if (id.startsWith("deepseek-"))
    return "deepseek";
  if (id.startsWith("grok-"))
    return "grok";
  if (id.startsWith("gemini-"))
    return "gemini";
  return "codex";
}
// lib/provider-config.json
var provider_config_default = {
  name: "NewClaw",
  api: "https://newclaw.ai/v1",
  env: [
    "NEWCLAW_API_KEY"
  ],
  models: {
    "claude-opus-4-6": {
      name: "Claude Opus 4.6",
      limit: {
        context: 200000,
        output: 64000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "claude-sonnet-4-6": {
      name: "Claude Sonnet 4.6",
      limit: {
        context: 200000,
        output: 64000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "claude-haiku-4-5-20251001": {
      name: "Claude Haiku 4.5",
      limit: {
        context: 200000,
        output: 8192
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "gpt-5-codex-high": {
      name: "GPT-5 Codex High",
      limit: {
        context: 400000,
        output: 128000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "gpt-5.3-codex": {
      name: "GPT-5.3 Codex",
      limit: {
        context: 400000,
        output: 128000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "gpt-5.3-codex-high": {
      name: "GPT-5.3 Codex High",
      limit: {
        context: 400000,
        output: 128000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "gpt-5.4": {
      name: "GPT-5.4",
      limit: {
        context: 400000,
        output: 128000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "gpt-5.2": {
      name: "GPT-5.2",
      limit: {
        context: 400000,
        output: 128000
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "o4-mini": {
      name: "O4 Mini",
      limit: {
        context: 200000,
        output: 1e5
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    },
    "deepseek-r1": {
      name: "DeepSeek R1",
      limit: {
        context: 128000,
        output: 64000
      },
      modalities: {
        input: ["text"],
        output: ["text"]
      }
    },
    "deepseek-v3": {
      name: "DeepSeek V3",
      limit: {
        context: 128000,
        output: 64000
      },
      modalities: {
        input: ["text"],
        output: ["text"]
      }
    },
    "grok-4": {
      name: "Grok 4",
      limit: {
        context: 200000,
        output: 1e5
      },
      modalities: {
        input: ["text", "image"],
        output: ["text"]
      }
    }
  }
};

// lib/hooks/omo-config-sync/index.ts
import { readFile, writeFile, access, mkdir } from "fs/promises";
import path from "path";
import os from "os";
// assets/default-omo-config.json
var default_omo_config_default = {
  $schema: "https://raw.githubusercontent.com/code-yeongyu/oh-my-opencode/dev/assets/oh-my-opencode.schema.json",
  agents: {
    sisyphus: {
      model: "newclaw/claude-opus-4-6",
      variant: "max"
    },
    hephaestus: {
      model: "newclaw/gpt-5-codex-high",
      variant: "medium"
    },
    oracle: {
      model: "newclaw/deepseek-r1",
      variant: "high"
    },
    librarian: {
      model: "newclaw/claude-sonnet-4-6"
    },
    explore: {
      model: "newclaw/claude-sonnet-4-6"
    },
    "multimodal-looker": {
      model: "newclaw/gpt-5-codex-high",
      variant: "medium"
    },
    prometheus: {
      model: "newclaw/claude-opus-4-6",
      variant: "max"
    },
    metis: {
      model: "newclaw/claude-opus-4-6",
      variant: "max"
    },
    momus: {
      model: "newclaw/gpt-5.4",
      variant: "medium"
    },
    atlas: {
      model: "newclaw/claude-sonnet-4-6"
    },
    build: {
      model: "newclaw/claude-opus-4-6"
    },
    plan: {
      model: "newclaw/claude-opus-4-6"
    },
    "sisyphus-junior": {
      model: "newclaw/claude-sonnet-4-6"
    },
    "OpenCode-Builder": {
      model: "newclaw/claude-opus-4-6"
    },
    general: {
      model: "newclaw/claude-sonnet-4-6"
    },
    "frontend-ui-ux-engineer": {
      model: "newclaw/claude-sonnet-4-6"
    },
    "document-writer": {
      model: "newclaw/claude-haiku-4-5-20251001"
    }
  },
  categories: {
    "visual-engineering": {
      model: "newclaw/claude-sonnet-4-6",
      variant: "high"
    },
    ultrabrain: {
      model: "newclaw/deepseek-r1",
      variant: "high"
    },
    deep: {
      model: "newclaw/gpt-5-codex-high",
      variant: "medium"
    },
    artistry: {
      model: "newclaw/claude-opus-4-6",
      variant: "high"
    },
    quick: {
      model: "newclaw/claude-haiku-4-5-20251001"
    },
    "unspecified-low": {
      model: "newclaw/claude-sonnet-4-6"
    },
    "unspecified-high": {
      model: "newclaw/claude-sonnet-4-6"
    },
    writing: {
      model: "newclaw/claude-sonnet-4-6"
    },
    visual: {
      model: "newclaw/claude-sonnet-4-6"
    },
    "business-logic": {
      model: "newclaw/gpt-5.4"
    },
    "data-analysis": {
      model: "newclaw/claude-sonnet-4-6"
    }
  }
};

// lib/hooks/omo-config-sync/index.ts
var homeDir = process.env.OPENCODE_TEST_HOME || os.homedir();
var configRoot = process.env.XDG_CONFIG_HOME || path.join(homeDir, ".config");
var configDir = path.join(configRoot, "opencode");
var omoConfigPath = path.join(configDir, "oh-my-opencode.json");
var fileExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};
async function isOmoInstalled() {
  try {
    if (typeof import.meta.resolve === "function") {
      import.meta.resolve("oh-my-opencode");
      return true;
    }
  } catch {}
  return fileExists(omoConfigPath);
}
function mergeOmoConfig(existing, defaults) {
  const merged = { ...defaults };
  if (defaults.$schema) {
    merged.$schema = defaults.$schema;
  }
  if (defaults.agents) {
    merged.agents = { ...defaults.agents };
    if (existing.agents && typeof existing.agents === "object") {
      for (const [name, config] of Object.entries(existing.agents)) {
        merged.agents[name] = config;
      }
    }
  }
  if (defaults.categories) {
    merged.categories = { ...defaults.categories };
    if (existing.categories && typeof existing.categories === "object") {
      for (const [name, config] of Object.entries(existing.categories)) {
        merged.categories[name] = config;
      }
    }
  }
  return merged;
}
async function syncOmoConfig() {
  const omoInstalled = await isOmoInstalled();
  if (!omoInstalled) {
    return;
  }
  await mkdir(configDir, { recursive: true });
  const opencodeConfigPath = path.join(configDir, "opencode.json");
  const jsoncPath = path.join(configDir, "opencode.jsonc");
  const activeConfigPath = await fileExists(jsoncPath) ? jsoncPath : opencodeConfigPath;
  try {
    let configText = "";
    try {
      configText = await readFile(activeConfigPath, "utf-8");
    } catch {}
    if (configText) {
      const config = JSON.parse(configText);
      const plugins = Array.isArray(config.plugin) ? config.plugin : [];
      const hasOmo = plugins.some((e) => typeof e === "string" && (e === "oh-my-opencode" || e.startsWith("oh-my-opencode@")));
      if (!hasOmo) {
        config.plugin = [...plugins, "oh-my-opencode"];
        await writeFile(activeConfigPath, JSON.stringify(config, null, 2) + `
`, "utf-8");
        console.log(`[${PLUGIN_NAME}] Added oh-my-opencode to plugin list`);
      }
    }
  } catch {}
  let existingConfig = {};
  if (await fileExists(omoConfigPath)) {
    try {
      const text = await readFile(omoConfigPath, "utf-8");
      existingConfig = JSON.parse(text);
    } catch {
      existingConfig = {};
    }
  }
  const mergedConfig = mergeOmoConfig(existingConfig, default_omo_config_default);
  const mergedStr = JSON.stringify(mergedConfig, null, 2) + `
`;
  let existingStr = "";
  try {
    existingStr = await readFile(omoConfigPath, "utf-8");
  } catch {}
  if (mergedStr !== existingStr) {
    await writeFile(omoConfigPath, mergedStr, "utf-8");
    console.log(`[${PLUGIN_NAME}] Synced oh-my-opencode config at ${omoConfigPath}`);
  }
}

// lib/models/auto-sync.ts
import { readFile as readFile2, writeFile as writeFile2, mkdir as mkdir2 } from "fs/promises";
import path2 from "path";
import os2 from "os";
var API_TIMEOUT_MS = 1e4;
var PACKAGE_NAME = "opencode-newclaw-auth";
var PROVIDER_ID3 = "newclaw";
var CODING_MODEL_PREFIXES = [
  "claude-",
  "gpt-",
  "o1-",
  "o3-",
  "o4-",
  "deepseek-",
  "grok-",
  "codex-",
  "gemini-"
];
var SKIP_PATTERNS = [
  /^gpt-3/,
  /^gpt-4(?!o)/i,
  /embedding/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /moderation/i,
  /realtime/i,
  /audio/i
];
var homeDir2 = process.env.OPENCODE_TEST_HOME || os2.homedir();
function getConfigPaths() {
  const configRoot2 = process.env.XDG_CONFIG_HOME || path2.join(homeDir2, ".config");
  const dir = path2.join(configRoot2, "opencode");
  return {
    json: path2.join(dir, "opencode.json"),
    jsonc: path2.join(dir, "opencode.jsonc"),
    dir
  };
}
async function readJsonSafe(filePath) {
  try {
    const text = await readFile2(filePath, "utf-8");
    const stripped = filePath.endsWith(".jsonc") ? text.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m).replace(/,(\s*[}\]])/g, "$1") : text;
    return JSON.parse(stripped);
  } catch {
    return;
  }
}
async function fileExists2(filePath) {
  try {
    await readFile2(filePath);
    return true;
  } catch {
    return false;
  }
}
function isCodingModel(modelId) {
  const lower = modelId.toLowerCase();
  const matchesPrefix = CODING_MODEL_PREFIXES.some((prefix) => lower.startsWith(prefix));
  if (!matchesPrefix)
    return false;
  const shouldSkip = SKIP_PATTERNS.some((pattern) => pattern.test(lower));
  return !shouldSkip;
}
function modelIdToDisplayName(id) {
  return id.split("-").map((part) => {
    if (/^\d/.test(part))
      return part;
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join(" ").replace(/^Gpt /, "GPT-").replace(/^O(\d)/, "O$1").replace(/^Claude /, "Claude ").replace(/^Deepseek /, "DeepSeek ").replace(/^Grok /, "Grok ").replace(/^Codex /, "Codex ").replace(/^Gemini /, "Gemini ");
}
function detectModalities(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("deepseek-")) {
    return { input: ["text"], output: ["text"] };
  }
  return { input: ["text", "image"], output: ["text"] };
}
function detectLimits(modelId) {
  const lower = modelId.toLowerCase();
  if (lower.includes("codex") || lower.startsWith("gpt-5")) {
    return { context: 400000, output: 128000 };
  }
  if (lower.startsWith("claude-")) {
    if (lower.includes("haiku"))
      return { context: 200000, output: 8192 };
    return { context: 200000, output: 64000 };
  }
  if (lower.startsWith("deepseek-")) {
    return { context: 128000, output: 64000 };
  }
  if (lower.startsWith("o1-") || lower.startsWith("o3-") || lower.startsWith("o4-")) {
    return { context: 200000, output: 1e5 };
  }
  if (lower.startsWith("grok-")) {
    return { context: 200000, output: 1e5 };
  }
  if (lower.startsWith("gemini-")) {
    return { context: 1e6, output: 65536 };
  }
  return { context: 128000, output: 32000 };
}
function apiModelsToConfig(apiModels) {
  const result = {};
  for (const model of apiModels) {
    if (!isCodingModel(model.id))
      continue;
    result[model.id] = {
      name: modelIdToDisplayName(model.id),
      limit: detectLimits(model.id),
      modalities: detectModalities(model.id)
    };
  }
  return result;
}
async function fetchModelsFromApi(apiKey) {
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const controller = new AbortController;
    const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    try {
      const response = await fetch("https://newclaw.ai/v1/models", {
        method: "GET",
        headers,
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!response.ok) {
        console.warn(`[${PACKAGE_NAME}] Model sync: API returned HTTP ${response.status}`);
        return;
      }
      const data = await response.json();
      if (!data || !Array.isArray(data.data)) {
        return;
      }
      return data.data;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return;
  }
}
async function getApiKey() {
  const envKey = process.env.NEWCLAW_API_KEY;
  if (envKey?.trim())
    return envKey.trim();
  const dataDirs = [
    process.env.XDG_DATA_HOME || path2.join(homeDir2, ".local", "share"),
    process.env.XDG_CONFIG_HOME || path2.join(homeDir2, ".config")
  ];
  for (const dataDir of dataDirs) {
    try {
      const authPath = path2.join(dataDir, "opencode", "auth.json");
      const raw = await readFile2(authPath, "utf-8");
      const auth = JSON.parse(raw);
      const newclawAuth = auth?.[PROVIDER_ID3] ?? auth?.newclaw;
      if (newclawAuth?.key?.trim())
        return newclawAuth.key.trim();
    } catch {}
  }
  return;
}
async function syncModelsFromApi() {
  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      console.log(`[${PACKAGE_NAME}] Model sync skipped: no API key found (run 'opencode auth login' first)`);
      return false;
    }
    console.log(`[${PACKAGE_NAME}] Syncing models from NewClaw API...`);
    const apiModels = await fetchModelsFromApi(apiKey);
    if (!apiModels || apiModels.length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: API returned no models (check network or API key)`);
      return false;
    }
    console.log(`[${PACKAGE_NAME}] API returned ${apiModels.length} models, filtering coding models...`);
    const modelConfigs = apiModelsToConfig(apiModels);
    if (Object.keys(modelConfigs).length === 0) {
      console.warn(`[${PACKAGE_NAME}] Model sync: no coding models found after filtering`);
      return false;
    }
    return await updateConfigModels(modelConfigs);
  } catch (err) {
    console.warn(`[${PACKAGE_NAME}] Model auto-sync failed: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}
async function updateConfigModels(newModels) {
  const paths = getConfigPaths();
  const jsoncExists = await fileExists2(paths.jsonc);
  const jsonExists = await fileExists2(paths.json);
  const configPath = jsoncExists ? paths.jsonc : jsonExists ? paths.json : paths.json;
  const config = await readJsonSafe(configPath) ?? {};
  if (!config || typeof config !== "object")
    return false;
  const providerMap = config.provider && typeof config.provider === "object" ? config.provider : {};
  const provider = providerMap[PROVIDER_ID3] && typeof providerMap[PROVIDER_ID3] === "object" ? providerMap[PROVIDER_ID3] : {};
  const existingModels = provider.models && typeof provider.models === "object" ? provider.models : {};
  const mergedModels = {};
  for (const [id, config2] of Object.entries(newModels)) {
    mergedModels[id] = config2;
  }
  for (const [id, existingConfig] of Object.entries(existingModels)) {
    if (typeof existingConfig === "object" && existingConfig !== null) {
      mergedModels[id] = {
        ...mergedModels[id],
        ...existingConfig
      };
    }
  }
  const existingKeys = Object.keys(existingModels).sort().join(",");
  const mergedKeys = Object.keys(mergedModels).sort().join(",");
  if (existingKeys === mergedKeys) {
    let same = true;
    for (const key of Object.keys(mergedModels)) {
      if (JSON.stringify(existingModels[key]) !== JSON.stringify(mergedModels[key])) {
        same = false;
        break;
      }
    }
    if (same)
      return false;
  }
  provider.models = mergedModels;
  providerMap[PROVIDER_ID3] = provider;
  config.provider = providerMap;
  await mkdir2(paths.dir, { recursive: true });
  await writeFile2(configPath, `${JSON.stringify(config, null, 2)}
`, "utf-8");
  const modelCount = Object.keys(mergedModels).length;
  console.log(`[${PACKAGE_NAME}] Synced ${modelCount} models from NewClaw API`);
  return true;
}

// index.ts
var CODEX_MODEL_PREFIXES = ["gpt-", "codex"];
var PACKAGE_NAME2 = "opencode-newclaw-auth";
var PLUGIN_ENTRY = PACKAGE_NAME2;
var PROVIDER_NPM = `${PACKAGE_NAME2}/provider`;
var DEFAULT_OUTPUT_TOKEN_MAX = 32000;
var homeDir3 = process.env.OPENCODE_TEST_HOME || os3.homedir();
var configRoot2 = process.env.XDG_CONFIG_HOME || path3.join(homeDir3, ".config");
var configDir2 = path3.join(configRoot2, "opencode");
var configPathJson = path3.join(configDir2, "opencode.json");
var configPathJsonc = path3.join(configDir2, "opencode.jsonc");
var ensureConfigPromise;
var fileExists3 = async (filePath) => {
  try {
    await access2(filePath);
    return true;
  } catch {
    return false;
  }
};
var stripJsonComments = (content) => {
  return content.replace(/\\"|"(?:\\"|[^"])*"|(\/\/.*|\/\*[\s\S]*?\*\/)/g, (m, g) => g ? "" : m).replace(/,(\s*[}\]])/g, "$1");
};
var readJsonOrJsonc = async (filePath) => {
  try {
    const text = await readFile3(filePath, "utf-8");
    const stripped = filePath.endsWith(".jsonc") ? stripJsonComments(text) : text;
    return JSON.parse(stripped);
  } catch {
    return;
  }
};
var deepEqual = (a, b) => {
  if (a === b)
    return true;
  if (typeof a !== typeof b)
    return false;
  if (a === null || b === null)
    return a === b;
  if (typeof a !== "object")
    return false;
  const aObj = a;
  const bObj = b;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length)
    return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bObj, key))
      return false;
    if (!deepEqual(aObj[key], bObj[key]))
      return false;
  }
  return true;
};
var isPackageEntry = (value) => value === PACKAGE_NAME2 || value.startsWith(`${PACKAGE_NAME2}@`);
var ensurePluginEntry = (list) => {
  if (!Array.isArray(list))
    return [PLUGIN_ENTRY];
  const filtered = list.filter((entry) => !(typeof entry === "string" && entry.startsWith("file://") && entry.includes(PACKAGE_NAME2)));
  const hasPlugin = filtered.some((entry) => typeof entry === "string" && (entry === PLUGIN_ENTRY || isPackageEntry(entry)));
  if (hasPlugin) {
    return filtered.length === list.length ? list : filtered;
  }
  return [...filtered, PLUGIN_ENTRY];
};
var buildStandardProviderConfig = () => ({
  ...provider_config_default,
  npm: PROVIDER_NPM
});
var applyProviderConfig = (config) => {
  let changed = false;
  const providerMap = config.provider && typeof config.provider === "object" ? config.provider : {};
  const existingProvider = providerMap[PROVIDER_ID];
  const standardProvider = buildStandardProviderConfig();
  if (!deepEqual(existingProvider, standardProvider)) {
    providerMap[PROVIDER_ID] = standardProvider;
    config.provider = providerMap;
    changed = true;
  }
  const nextPlugins = ensurePluginEntry(config.plugin);
  if (nextPlugins !== config.plugin) {
    config.plugin = nextPlugins;
    changed = true;
  }
  return changed;
};
var ensureConfigFile = async () => {
  if (ensureConfigPromise)
    return ensureConfigPromise;
  ensureConfigPromise = (async () => {
    const jsoncExists = await fileExists3(configPathJsonc);
    const jsonExists = await fileExists3(configPathJson);
    let configPath;
    let config;
    if (jsoncExists) {
      configPath = configPathJsonc;
      config = await readJsonOrJsonc(configPath) ?? {};
    } else if (jsonExists) {
      configPath = configPathJson;
      config = await readJsonOrJsonc(configPath) ?? {};
    } else {
      configPath = configPathJson;
      config = { $schema: "https://opencode.ai/config.json" };
    }
    if (!config || typeof config !== "object")
      return;
    const changed = applyProviderConfig(config);
    if (!changed)
      return;
    await mkdir3(configDir2, { recursive: true });
    await writeFile3(configPath, `${JSON.stringify(config, null, 2)}
`, "utf-8");
  })().catch((err) => {
    ensureConfigPromise = undefined;
    throw err;
  });
  return ensureConfigPromise;
};
var parseRequestBody = (init) => {
  if (!init?.body || typeof init.body !== "string") {
    return { body: undefined, model: undefined, isStreaming: false };
  }
  try {
    const body = JSON.parse(init.body);
    const model = typeof body?.model === "string" ? body.model : undefined;
    return { body, model, isStreaming: body?.stream === true };
  } catch {
    return { body: undefined, model: undefined, isStreaming: false };
  }
};
var stripProviderPrefix = (model) => model.includes("/") ? model.split("/").pop() : model;
var isModel = (model, prefix) => Boolean(model && stripProviderPrefix(model).startsWith(prefix));
var isCodexModel = (model) => Boolean(model && CODEX_MODEL_PREFIXES.some((prefix) => stripProviderPrefix(model).startsWith(prefix)));
var isClaudeUrl = (url) => url.includes("/v1/messages");
var saveResponseIfEnabled = async (response, provider, metadata) => {
  if (!SAVE_RAW_RESPONSE_ENABLED)
    return response;
  const cloned = response.clone();
  const body = await cloned.text();
  saveRawResponse(provider, body, { url: metadata.url, status: response.status, model: metadata.model });
  return response;
};
var rewriteUrl = (originalUrl, baseUrl) => {
  try {
    const base = new URL(baseUrl);
    const original = new URL(originalUrl);
    const basePath = base.pathname.replace(/\/$/, "");
    const normalizedBase = `${base.origin}${basePath}`;
    const normalizedOriginal = `${original.origin}${original.pathname}`;
    if (normalizedOriginal.startsWith(normalizedBase)) {
      return original.toString();
    }
    const rewritten = new URL(original.toString());
    rewritten.protocol = base.protocol;
    rewritten.host = base.host;
    let targetPath = original.pathname;
    if (basePath.endsWith("/v1") && targetPath.startsWith("/v1/")) {
      targetPath = targetPath.slice(3);
    }
    rewritten.pathname = `${basePath}${targetPath}`;
    return rewritten.toString();
  } catch {
    return originalUrl;
  }
};
var getOutputTokenLimit = (input, output) => {
  const modelLimit = input.model.limit.output;
  if (typeof modelLimit === "number" && modelLimit > 0) {
    return modelLimit;
  }
  const optionLimit = output.options?.maxTokens;
  if (typeof optionLimit === "number" && optionLimit > 0) {
    return optionLimit;
  }
  return DEFAULT_OUTPUT_TOKEN_MAX;
};
var NewclawAuthPlugin = async (ctx) => {
  await ensureConfigFile().catch((error) => {
    console.warn(`[${PACKAGE_NAME2}] Failed to update config: ${error instanceof Error ? error.message : error}`);
  });
  await syncModelsFromApi().catch((error) => {
    console.warn(`[${PACKAGE_NAME2}] Model auto-sync failed: ${error instanceof Error ? error.message : error}`);
  });
  syncOmoConfig().catch((error) => {
    console.warn(`[${PACKAGE_NAME2}] Failed to sync OMO config: ${error instanceof Error ? error.message : error}`);
  });
  const authHook = {
    provider: PROVIDER_ID,
    loader: async (getAuth, _provider) => {
      const auth = await getAuth();
      if (auth.type !== "api" || !auth.key) {
        return {};
      }
      const apiKey = auth.key.trim();
      if (!apiKey)
        return {};
      return {
        apiKey,
        fetch: async (input, init) => {
          const originalUrl = extractRequestUrl(input);
          const { model, isStreaming } = parseRequestBody(init);
          const modelId = model ? stripProviderPrefix(model) : "";
          const family = detectFamily(modelId);
          const resolvedApiKey = resolveApiKeyForFamily(family, apiKey);
          const isClaudeRequest = isModel(model, "claude-") || isClaudeUrl(originalUrl);
          const isCodexRequest = !isClaudeRequest && isCodexModel(model);
          if (isCodexRequest) {
            const transformation = await transformRequestForCodex(init);
            let requestInit = transformation?.updatedInit ?? init;
            if (!transformation && init?.body) {
              const sanitized = sanitizeRequestBody(init.body);
              requestInit = { ...init, body: sanitized };
            }
            const headers2 = createNewclawHeaders(requestInit, resolvedApiKey, {
              promptCacheKey: transformation?.body.prompt_cache_key
            });
            const targetUrl = rewriteUrl(originalUrl, CODEX_BASE_URL);
            const response = await fetch(targetUrl, {
              ...requestInit,
              headers: headers2
            });
            await saveResponseIfEnabled(response.clone(), "codex", { url: targetUrl, model: modelId });
            if (!response.ok) {
              return await handleErrorResponse(response);
            }
            return await handleSuccessResponse(response, isStreaming);
          }
          if (isClaudeRequest) {
            const targetUrl = rewriteUrl(originalUrl, NEWCLAW_ANTHROPIC_BASE_URL);
            let transformedInit = transformClaudeRequest(init);
            const finalInit = transformedInit ?? init;
            const headers2 = new Headers(finalInit?.headers ?? {});
            headers2.set("x-api-key", resolvedApiKey);
            headers2.set("anthropic-version", "2023-06-01");
            if (!headers2.has(HEADER_NAMES.CONTENT_TYPE)) {
              headers2.set(HEADER_NAMES.CONTENT_TYPE, "application/json");
            }
            const response = await fetch(targetUrl, {
              ...finalInit,
              headers: headers2
            });
            const savedResponse = await saveResponseIfEnabled(response, "claude", { url: targetUrl, model: modelId });
            return transformClaudeResponse(savedResponse);
          }
          const headers = createNewclawHeaders(init, resolvedApiKey);
          return await fetch(originalUrl, { ...init, headers });
        }
      };
    },
    methods: [
      {
        type: "api",
        label: AUTH_METHOD_LABEL,
        prompts: [
          {
            type: "text",
            key: "apiKey",
            message: "NewClaw API key",
            placeholder: "sk-..."
          }
        ],
        authorize: async (inputs) => {
          const key = inputs?.apiKey?.trim();
          if (!key)
            return { type: "failed" };
          return { type: "success", key };
        }
      }
    ]
  };
  return {
    auth: authHook,
    config: async (config) => {
      applyProviderConfig(config);
    },
    "chat.params": async (input, output) => {
      if (input.model.providerID !== PROVIDER_ID)
        return;
      if (isCodexModel(input.model.id)) {
        const next2 = { ...output.options };
        next2.store = false;
        output.options = next2;
        return;
      }
      if (!input.model.id?.startsWith("claude-"))
        return;
      const thinking = output.options?.thinking;
      if (!thinking || typeof thinking !== "object")
        return;
      const budgetTokens = thinking.budgetTokens;
      if (typeof budgetTokens !== "number")
        return;
      const maxTokens = getOutputTokenLimit(input, output);
      if (budgetTokens < maxTokens)
        return;
      const next = { ...output.options };
      delete next.thinking;
      output.options = next;
    }
  };
};
var opencode_newclaw_auth_default = NewclawAuthPlugin;
export {
  opencode_newclaw_auth_default as default,
  NewclawAuthPlugin
};
