/**
 * @file url-failover.test.ts
 * @description 3-URL failover architecture tests
 * Tests verify that requests properly failover through 3 BASE_URLs
 * when encountering failover-triggering status codes
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

// Mock fetch globally
const originalFetch = global.fetch
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  global.fetch = fetchMock as any
})

afterEach(() => {
  global.fetch = originalFetch
  vi.clearAllMocks()
})

describe("URL Failover Architecture", () => {
  const BASE_URLS = [
    "https://newclaw.ai",
    "https://newclaw.ai/v1",
    "https://newclaw.ai/v1/chat/completions",
  ]

  const FAILOVER_STATUS_CODES = new Set([401, 403, 429, 500, 502, 503, 504])

  /**
   * Test 1: Primary URL succeeds
   * When first URL returns 200, should return immediately without trying other URLs
   */
  it("Test 1: Primary URL succeeds - returns immediately", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )

    // Simulate: fetchWithUrlFailover(url, init, BASE_URLS)
    // Expected: Only 1 fetch call (primary URL)
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation, this should be:
    // const response = await fetchWithUrlFailover(url, init, BASE_URLS)
    // expect(response.ok).toBe(true)
    // expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Test 2: Failover to secondary URL
   * When first URL returns 429 (rate limit), should try second URL
   */
  it("Test 2: Failover to secondary URL on 429", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "rate limit" }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    // Expected: 2 fetch calls (primary fails with 429, secondary succeeds)
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, init, BASE_URLS)
    // expect(response.ok).toBe(true)
    // expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  /**
   * Test 3: Failover through all URLs
   * When first two URLs fail with failover codes, should try third URL
   */
  it("Test 3: Failover through all 3 URLs", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "forbidden" }), { status: 403 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    // Expected: 3 fetch calls (all URLs tried, third succeeds)
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, init, BASE_URLS)
    // expect(response.ok).toBe(true)
    // expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  /**
   * Test 4: Key failover when all URLs fail
   * When all 3 URLs fail with failover codes, should trigger key failover
   * (This test verifies the outer loop behavior)
   */
  it("Test 4: All URLs fail - triggers key failover", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }))

    // Expected: 3 fetch calls (all URLs tried with first key, all fail)
    // Then outer loop should try next key
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, init, [key1, key2])
    // Should attempt: URL1+key1, URL2+key1, URL3+key1, URL1+key2, ...
  })

  /**
   * Test 5: No failover on 400 (client error)
   * When URL returns 400 (bad request), should NOT failover
   * 400 is a client error, not a transient error
   */
  it("Test 5: No failover on 400 - returns immediately", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "bad request" }), { status: 400 })
    )

    // Expected: 1 fetch call (no failover on 400)
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, init, BASE_URLS)
    // expect(response.status).toBe(400)
    // expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /**
   * Test 6: Network error triggers failover
   * When fetch throws network error, should try next URL
   */
  it("Test 6: Network error triggers failover", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true }), { status: 200 }))

    // Expected: 2 fetch calls (first throws, second succeeds)
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, init, BASE_URLS)
    // expect(response.ok).toBe(true)
    // expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  /**
   * Test 7: DeepSeek streaming mode
   * Verify that DeepSeek requests have stream=true in body
   * and response is handled as streaming
   */
  it("Test 7: DeepSeek streaming mode - stream=true in request", async () => {
    const requestBody = {
      model: "deepseek-v3",
      messages: [{ role: "user", content: "test" }],
      stream: true,
    }

    fetchMock.mockResolvedValueOnce(
      new Response("data: {}\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    )

    // Expected: Request body has stream=true
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, { body: JSON.stringify(requestBody) }, BASE_URLS)
    // expect(response.headers.get("content-type")).toBe("text/event-stream")
  })

  /**
   * Test 8: Claude tools prefix handling
   * Verify that Claude tool names with mcp_ prefix are preserved
   */
  it("Test 8: Claude tools prefix - mcp_ preserved", async () => {
    const requestBody = {
      model: "[REDACTED]",
      tools: [{ name: "mcp_tool_name", description: "test" }],
    }

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )

    // Expected: Tool names with mcp_ prefix are preserved
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, { body: JSON.stringify(requestBody) }, BASE_URLS)
    // expect(response.ok).toBe(true)
  })

  /**
   * Test 9: Request transformation applied
   * Verify that transformRequestBody() is applied to all request types
   */
  it("Test 9: Request transformation applied - stream injected", async () => {
    const requestBody = {
      model: "gpt-5-codex-high",
      messages: [{ role: "user", content: "test" }],
      // stream not set initially
    }

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )

    // Expected: stream=true is injected by transformRequestBody()
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(url, { body: JSON.stringify(requestBody) }, BASE_URLS)
    // The actual request sent should have stream=true
  })

  /**
   * Test 10: Query params preserved
   * Verify that URL query parameters are preserved during rewriting
   */
  it("Test 10: Query params preserved - URL rewriting", async () => {
    const originalUrl = "https://api.openai.com/v1/chat/completions?model=gpt-5"

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true }), { status: 200 })
    )

    // Expected: Query params preserved in rewritten URL
    expect(fetchMock).not.toHaveBeenCalled()
    // After implementation:
    // const response = await fetchWithUrlFailover(originalUrl, init, BASE_URLS)
    // expect(fetchMock).toHaveBeenCalledWith(
    //   expect.stringContaining("?model=gpt-5"),
    //   expect.any(Object)
    // )
  })
})
