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

/**
 * Endpoint type to request path mapping
 * Maps supported_endpoint_types from API to actual request paths
 */
export const ENDPOINT_TYPE_TO_PATH: Record<string, string> = {
  // Chat/Completions endpoints
  "openai": "/v1/chat/completions",
  "openai-response": "/v1/responses",
  "anthropic": "/v1/messages",
  "gemini": "/v1/generateContent",
  
  // Embedding endpoints
  "嵌入": "/v1/embeddings",
  "embedding": "/v1/embeddings",
  
  // Image generation endpoints
  "image-generation": "/v1/images/generations",
  "dall-e-3": "/v1/images/generations",
  "aigc-image": "/v1/images/generations",
  "kling生图": "/v1/images/generations",
  "omni-image": "/v1/images/generations",
  
  // Video generation endpoints
  "openAI视频格式": "/v1/video/create",
  "vidu生图": "/v1/video/create",
  "grok视频": "/v1/video/create",
  "runway图生视频": "/v1/video/create",
  "wan视频生成": "/v1/video/create",
  "aigc-video": "/v1/video/create",
  "omni-video": "/v1/video/create",
  
  // Reranking endpoints
  "rerank": "/v1/rerank",
  
  // Music generation endpoints
  "suno音乐生成": "/v1/audio/generations",
  
  // Midjourney endpoints
  "mj动作": "/v1/midjourney/imagine",
  
  // Fallback for unknown types
} as const

/**
 * Get request path for endpoint type
 * Returns /v1/chat/completions as fallback for unknown types
 */
export function getPathForEndpointType(endpointType: string): string {
  return ENDPOINT_TYPE_TO_PATH[endpointType] || "/v1/chat/completions"
}
