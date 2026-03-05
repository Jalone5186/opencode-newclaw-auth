/**
 * @file constants.ts
 * @input  -
 * @output Global constants (URLs, header names, provider IDs)
 * @pos    Foundation - imported by most other modules
 */

export const PLUGIN_NAME = "opencode-newclaw-auth"
export const PROVIDER_ID = "newclaw"
export const AUTH_METHOD_LABEL = "NewClaw API Key"

// NewClaw API base URLs - all traffic routes through https://newclaw.ai
export const NEWCLAW_BASE_URL = "https://newclaw.ai/v1"
export const NEWCLAW_ANTHROPIC_BASE_URL = "https://newclaw.ai/v1"
export const NEWCLAW_GEMINI_BASE_URL = "https://newclaw.ai/v1"

// Codex-specific endpoint (OpenAI Responses API compatible)
export const CODEX_BASE_URL = "https://newclaw.ai/v1"

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
  X_GOOG_API_KEY: "x-goog-api-key",
  X_GOOG_API_CLIENT: "x-goog-api-client",
} as const

/**
 * Environment variable names for per-provider API keys.
 * If set, these override the unified NEWCLAW_API_KEY for that provider.
 */
export const PER_PROVIDER_KEY_ENV = {
  CLAUDE: "NEWCLAW_CLAUDE_API_KEY",
  CODEX: "NEWCLAW_CODEX_API_KEY",
  GEMINI: "NEWCLAW_GEMINI_API_KEY",
} as const

export const UNIFIED_KEY_ENV = "NEWCLAW_API_KEY"
