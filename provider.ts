/**
 * @file provider.ts
 * @input  Provider settings (apiKey, baseURL, headers)
 * @output Multi-provider language model factory (OpenAI/Anthropic/Google)
 * @pos    Core provider - routes model requests to appropriate SDK
 */

import type { LanguageModelV2 } from "@ai-sdk/provider"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAI } from "@ai-sdk/openai"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import type { FetchFunction } from "@ai-sdk/provider-utils"

export type NewclawProviderSettings = {
  apiKey?: string
  baseURL?: string
  headers?: Record<string, string>
  fetch?: FetchFunction
  anthropic?: {
    apiKey?: string
    baseURL?: string
    headers?: Record<string, string>
  }
  google?: {
    apiKey?: string
    baseURL?: string
    headers?: Record<string, string>
  }
}

export interface NewclawProvider {
  (modelId: string): LanguageModelV2
  chat(modelId: string): LanguageModelV2
  responses(modelId: string): LanguageModelV2
  languageModel(modelId: string): LanguageModelV2
}

const isClaude = (modelId: string) => modelId.startsWith("claude-")
const isGemini = (modelId: string) => modelId.startsWith("gemini-")
const isResponses = (modelId: string) => modelId.startsWith("gpt-") || modelId.startsWith("codex")
const isDeepSeekOrGrok = (modelId: string) => modelId.startsWith("deepseek-") || modelId.startsWith("grok-")

const normalizeModelId = (modelId: string) => String(modelId).trim()

export function createNewclaw(options: NewclawProviderSettings = {}): NewclawProvider {
  console.log(`[newclaw-provider] createNewclaw called: apiKey=${options.apiKey ? options.apiKey.slice(0, 8) + "****" : "none"}, baseURL=${options.baseURL}, hasFetch=${!!options.fetch}`)

  const openai = createOpenAI({
    apiKey: options.apiKey,
    baseURL: options.baseURL,
    headers: options.headers,
    fetch: options.fetch,
  })

  const openaiLanguageModel =
    typeof openai.languageModel === "function" ? openai.languageModel : openai.chat
  const openaiChatModel = typeof openai.chat === "function" ? openai.chat : openaiLanguageModel

  const anthropic = createAnthropic({
    apiKey: options.anthropic?.apiKey ?? options.apiKey,
    baseURL: options.anthropic?.baseURL ?? options.baseURL,
    headers: options.anthropic?.headers ?? options.headers,
    fetch: options.fetch,
  })

  const google = createGoogleGenerativeAI({
    apiKey: options.google?.apiKey ?? options.apiKey,
    baseURL: options.google?.baseURL ?? options.baseURL,
    headers: options.google?.headers ?? options.headers,
    fetch: options.fetch,
  })

  const createModel = (modelId: string) => {
    const id = normalizeModelId(modelId)
    if (isClaude(id)) return anthropic.languageModel(id)
    if (isGemini(id)) return google.languageModel(id) as unknown as LanguageModelV2
    // DeepSeek and Grok use responses() to declare streaming support
    if ((isResponses(id) || isDeepSeekOrGrok(id)) && typeof openai.responses === "function") return openai.responses(id)
    return openaiLanguageModel(id)
  }

  const provider = ((modelId: string) => createModel(modelId)) as NewclawProvider
  provider.languageModel = createModel
  provider.chat = (modelId: string) => {
    const id = normalizeModelId(modelId)
    if (isClaude(id)) return anthropic.languageModel(id)
    if (isGemini(id)) return google.languageModel(id) as unknown as LanguageModelV2
    return openaiChatModel(id)
  }
  provider.responses = (modelId: string) => {
    const id = normalizeModelId(modelId)
    if (isClaude(id)) return provider.chat(id)
    if (isGemini(id)) return provider.chat(id) as LanguageModelV2
    return openai.responses(id)
  }

  return provider
}
