import { describe, expect, it } from "vitest"

import { getReasoningConfig, normalizeModel, transformRequestBody } from "../lib/request/request-transformer"
import type { RequestBody } from "../lib/types"

describe("normalizeModel", () => {
  it("maps legacy codex model names to gpt-5.3-codex-high", () => {
    expect(normalizeModel("newclaw/gpt-5.3-codex")).toBe("gpt-5.3-codex-high")
  })

  it("keeps gpt-5.3-codex-high normalized", () => {
    expect(normalizeModel("newclaw/gpt-5.3-codex-high")).toBe("gpt-5.3-codex-high")
  })
})

describe("getReasoningConfig", () => {
  it("defaults to high effort for gpt-5.3-codex-high", () => {
    expect(getReasoningConfig("gpt-5.3-codex-high").effort).toBe("high")
  })

  it("treats legacy gpt-5.3-codex as codex-high for reasoning defaults", () => {
    expect(getReasoningConfig("gpt-5.3-codex").effort).toBe("high")
  })
})

describe("transformRequestBody", () => {
  it("normalizes legacy codex model and sets high reasoning effort", async () => {
    const body: RequestBody = {
      model: "newclaw/gpt-5.3-codex",
      input: [],
    }

    const transformed = await transformRequestBody(body)

    expect(transformed.model).toBe("gpt-5.3-codex-high")
    expect(transformed.reasoning?.effort).toBe("high")
  })
})
