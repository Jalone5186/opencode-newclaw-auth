/**
 * @file types.ts
 * @input  -
 * @output TypeScript interfaces (RequestBody, InputItem, etc.)
 * @pos    Foundation - shared type definitions across lib/
 */

export interface ConfigOptions {
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  reasoningSummary?: "auto" | "concise" | "detailed" | "off" | "on"
  textVerbosity?: "low" | "medium" | "high"
  include?: string[]
}

export interface ReasoningConfig {
  effort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh"
  summary: "auto" | "concise" | "detailed" | "off" | "on"
}

export interface InputItem {
  id?: string
  type: string
  role: string
  content?: unknown
  [key: string]: unknown
}

export interface RequestBody {
  model: string
  store?: boolean
  stream?: boolean
  instructions?: string
  input?: InputItem[]
  tools?: unknown
  reasoning?: Partial<ReasoningConfig>
  text?: {
    verbosity?: "low" | "medium" | "high"
  }
  include?: string[]
  providerOptions?: {
    openai?: Partial<ConfigOptions> & { store?: boolean; include?: string[] }
    [key: string]: unknown
  }
  prompt_cache_key?: string
  max_output_tokens?: number
  max_completion_tokens?: number
  [key: string]: unknown
}

export interface SSEEventData {
  type: string
  response?: unknown
  [key: string]: unknown
}

/**
 * Per-provider key configuration.
 * Users can set different API keys for different model families,
 * or use a single unified key for all.
 */
export interface KeyConfig {
  /** Unified key - used for all providers unless overridden */
  unified?: string
  /** Per-provider overrides */
  claude?: string
  codex?: string
  deepseek?: string
  grok?: string
}
