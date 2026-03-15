/**
 * @file request-transformer.ts
 * @input  RequestBody from OpenCode
 * @output Transformed RequestBody for Codex API
 * @pos    Core transformation - model normalization, reasoning config, input filtering
 */

import { logDebug } from "../logger"
import type { ConfigOptions, InputItem, ReasoningConfig, RequestBody } from "../types"

export function normalizeModel(model: string | undefined): string {
  if (!model) return "gpt-5-codex-high"

  const modelId = model.includes("/") ? model.split("/").pop()! : model
  const normalized = modelId.toLowerCase()

  if (normalized.includes("gpt-5-codex-high") || normalized.includes("gpt 5 codex high")) {
    return "gpt-5-codex-high"
  }
  if (normalized.includes("gpt-5.2") || normalized.includes("gpt 5.2")) {
    return "gpt-5.2"
  }
  if (normalized.includes("codex")) {
    return "gpt-5-codex-high"
  }

  return modelId
}

function resolveReasoningConfig(modelName: string, body: RequestBody): ReasoningConfig {
  const providerOpenAI = body.providerOptions?.openai
  const existingEffort = body.reasoning?.effort ?? providerOpenAI?.reasoningEffort
  const existingSummary = body.reasoning?.summary ?? providerOpenAI?.reasoningSummary

  const mergedConfig: ConfigOptions = {
    ...(existingEffort ? { reasoningEffort: existingEffort } : {}),
    ...(existingSummary ? { reasoningSummary: existingSummary } : {}),
  }

  return getReasoningConfig(modelName, mergedConfig)
}

function resolveTextVerbosity(body: RequestBody): "low" | "medium" | "high" {
  const providerOpenAI = body.providerOptions?.openai
  return body.text?.verbosity ?? providerOpenAI?.textVerbosity ?? "medium"
}

function resolveInclude(body: RequestBody): string[] {
  const providerOpenAI = body.providerOptions?.openai
  const base = body.include ?? providerOpenAI?.include ?? ["reasoning.encrypted_content"]
  const include = Array.from(new Set(base.filter(Boolean)))
  if (!include.includes("reasoning.encrypted_content")) {
    include.push("reasoning.encrypted_content")
  }
  return include
}

/**
 * Sanitizes item IDs in the input array for stateless (store:false) mode
 */
export function sanitizeItemIds(input: InputItem[]): InputItem[] {
  return input
    .filter((item) => item.type !== "item_reference")
    .map((item) => {
      if (!("id" in item)) return item
      const { id, ...rest } = item as InputItem & { id: unknown }
      return rest as InputItem
    })
}

export function getReasoningConfig(
  modelName: string | undefined,
  userConfig: ConfigOptions = {},
): ReasoningConfig {
  const normalizedName = modelName?.toLowerCase() ?? ""

  const isGpt5Codex =
    normalizedName.includes("gpt-5-codex") || normalizedName.includes("gpt 5 codex")
  const isGpt52General =
    normalizedName.includes("gpt-5.2") || normalizedName.includes("gpt 5.2")

  const supportsXhigh = isGpt52General || isGpt5Codex
  const supportsNone = isGpt52General

  const defaultEffort: ReasoningConfig["effort"] = supportsXhigh ? "high" : "medium"

  let effort = userConfig.reasoningEffort || defaultEffort

  if (!supportsXhigh && effort === "xhigh") {
    effort = "high"
  }
  if (!supportsNone && effort === "none") {
    effort = "low"
  }

  return {
    effort,
    summary: userConfig.reasoningSummary || "auto",
  }
}
/**
 * Normalize orphaned tool outputs: if a function_call_output has no matching
 * function_call in the input, remove it to prevent API errors.
 */
export function normalizeOrphanedToolOutputs(input: InputItem[]): InputItem[] {
  const callIds = new Set<string>()
  for (const item of input) {
    if (item.type === "function_call" && typeof item.call_id === "string") {
      callIds.add(item.call_id)
    }
  }
  return input.filter((item) => {
    if (item.type === "function_call_output" && typeof item.call_id === "string") {
      return callIds.has(item.call_id)
    }
    return true
  })
}

export async function transformRequestBody(body: RequestBody): Promise<RequestBody> {
  const originalModel = body.model
  const normalizedModel = normalizeModel(body.model)

  logDebug(`Model lookup: "${originalModel}" -> "${normalizedModel}"`, {
    hasTools: !!body.tools,
  })

  body.model = normalizedModel
  body.stream = true
  body.store = false

  if (body.input && Array.isArray(body.input)) {
    body.input = sanitizeItemIds(body.input)
    body.input = normalizeOrphanedToolOutputs(body.input)
    
    if (!body.messages) {
      body.messages = body.input as any
    }
    delete body.input
  }

  const reasoningConfig = resolveReasoningConfig(normalizedModel, body)
  body.reasoning = { ...body.reasoning, ...reasoningConfig }

  const verbosity = resolveTextVerbosity(body)
  body.text = { ...body.text, verbosity }

  body.include = resolveInclude(body)

  body.max_output_tokens = undefined
  body.max_completion_tokens = undefined

  return body
}
