/**
 * @file constants.ts
 * @input  -
 * @output Global constants (URLs, header names, provider IDs)
 * @pos    Foundation - imported by most other modules
 */

export const PLUGIN_NAME = "opencode-newclaw-auth"
export const PROVIDER_ID = "newclaw"
export const AUTH_METHOD_LABEL = "NewClaw API Key"

// NewClaw API base URLs - 3-layer failover architecture
// URL1: Primary (base domain)
// URL2: Secondary (explicit version)
// URL3: Tertiary (explicit endpoint path)
export const NEWCLAW_BASE_URLS = [
  "https://newclaw.ai",
  "https://newclaw.ai/v1",
  "https://newclaw.ai/v1/chat/completions",
] as const

// Backward compatibility - keep old constants pointing to primary URL
export const NEWCLAW_BASE_URL = NEWCLAW_BASE_URLS[0]
export const NEWCLAW_ANTHROPIC_BASE_URL = NEWCLAW_BASE_URLS[0]
export const CODEX_BASE_URL = NEWCLAW_BASE_URLS[0]

// HTTP status codes that trigger URL failover
export const FAILOVER_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504])

export const USER_AGENT = "opencode-newclaw-auth/0.1.0"
export const ORIGINATOR = "opencode_newclaw"

export const SAVE_RAW_RESPONSE_ENV = "SAVE_RAW_RESPONSE"

export const HEADER_NAMES = {
  AUTHORIZATION: "authorization",
  ORIGINATOR: "originator",
  SESSION_ID: "session_id",
  CONVERSATION_ID: "conversation_id",
  USER_AGENT: "user-agent",
  ACCEPT: "accept",
  CONTENT_TYPE: "content-type",
  OPENAI_BETA: "openai-beta",
  CHATGPT_ACCOUNT_ID: "chatgpt-account-id",
  X_FORWARDED_HOST: "x-forwarded-host",
} as const

/**
 * Environment variable names for per-provider API keys.
 * If set, these override the unified NEWCLAW_API_KEY for that provider.
 */
export const PER_PROVIDER_KEY_ENV = {
  CLAUDE: "NEWCLAW_CLAUDE_API_KEY",
  CODEX: "NEWCLAW_CODEX_API_KEY",
  DEEPSEEK: "NEWCLAW_DEEPSEEK_API_KEY",
  GROK: "NEWCLAW_GROK_API_KEY",
} as const

export const UNIFIED_KEY_ENV = "NEWCLAW_API_KEY"
