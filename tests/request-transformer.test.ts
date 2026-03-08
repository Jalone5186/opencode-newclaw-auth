import { describe, expect, it } from "vitest"

import { getReasoningConfig, normalizeModel, transformRequestBody } from "../lib/request/request-transformer"
import type { RequestBody } from "../lib/types"

describe("normalizeModel", () => {
  it("maps legacy codex model names to gpt-5-codex-high", () => {
    expect(normalizeModel("newclaw/gpt-5-codex")).toBe("gpt-5-codex-high")
  })

  it("keeps gpt-5-codex-high normalized", () => {
    expect(normalizeModel("newclaw/gpt-5-codex-high")).toBe("gpt-5-codex-high")
  })

  it("defaults to gpt-5-codex-high when no model specified", () => {
    expect(normalizeModel(undefined)).toBe("gpt-5-codex-high")
  })

  it("maps generic codex to gpt-5-codex-high", () => {
    expect(normalizeModel("codex")).toBe("gpt-5-codex-high")
  })

  it("passes through non-codex models unchanged", () => {
    expect(normalizeModel("claude-opus-4-6")).toBe("claude-opus-4-6")
    expect(normalizeModel("deepseek-r1")).toBe("deepseek-r1")
    expect(normalizeModel("grok-4")).toBe("grok-4")
  })
})

describe("getReasoningConfig", () => {
  it("defaults to high effort for gpt-5-codex-high", () => {
    expect(getReasoningConfig("gpt-5-codex-high").effort).toBe("high")
  })

  it("treats legacy gpt-5-codex as codex-high for reasoning defaults", () => {
    expect(getReasoningConfig("gpt-5-codex").effort).toBe("high")
  })

  it("defaults to high effort for gpt-5.2", () => {
    expect(getReasoningConfig("gpt-5.2").effort).toBe("high")
  })
})

describe("transformRequestBody", () => {
  it("normalizes legacy codex model and sets high reasoning effort", async () => {
    const body: RequestBody = {
      model: "newclaw/gpt-5-codex",
      input: [],
    }

    const transformed = await transformRequestBody(body)

    expect(transformed.model).toBe("gpt-5-codex-high")
    expect(transformed.reasoning?.effort).toBe("high")
  })
})
