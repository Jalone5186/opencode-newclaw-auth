# Implementation Patterns from opencode-newclaw-auth

## Real-World Code Examples

### 1. URL Failover Architecture (3-Layer)

**File**: `index.ts` lines 254-322

```typescript
const fetchWithUrlFailover = async (
  originalUrl: string,
  init: RequestInit | undefined,
  baseUrls: readonly string[],
  headers: Headers,
): Promise<Response> => {
  for (let urlIndex = 0; urlIndex < baseUrls.length; urlIndex++) {
    const currentUrl = baseUrls[urlIndex]
    const isLastUrl = urlIndex === baseUrls.length - 1

    try {
      let targetUrl = rewriteUrl(originalUrl, currentUrl)
      let finalInit = init

      // Handle explicit endpoint URLs
      if (currentUrl.includes("/chat/completions")) {
        const base = new URL(currentUrl)
        const original = new URL(originalUrl)
        base.search = original.search
        targetUrl = base.toString()
      } else if (targetUrl.includes("/responses")) {
        // Convert Responses API format to Chat Completions format
        targetUrl = targetUrl.replace("/responses", "/chat/completions")
        if (init?.body && typeof init.body === "string") {
          try {
            const body = JSON.parse(init.body)
            // Transform: input → messages
            if (body.input && !body.messages) {
              body.messages = body.input
              delete body.input
            }
            finalInit = { ...init, body: JSON.stringify(body) }
            console.log(`[newclaw-auth] converted request body from Responses to Chat Completions format`)
          } catch {
            // If parsing fails, use original init
          }
        }
      }
      
      const response = await fetch(targetUrl, { ...finalInit, headers })

      if (response.ok) {
        return response
      }

      // Failover on specific status codes
      if (FAILOVER_STATUS_CODES.has(response.status)) {
        if (!isLastUrl) {
          console.log(
            `[newclaw-auth] url-failover: status=${response.status}, trying next URL (${urlIndex + 1}/${baseUrls.length})`
          )
          continue
        }
        console.log(
          `[newclaw-auth] url-failover: status=${response.status}, all URLs exhausted, returning to key loop`
        )
      }

      return response
    } catch (err) {
      if (isLastUrl) throw err
      console.log(
        `[newclaw-auth] url-failover: network error, trying next URL (${urlIndex + 1}/${baseUrls.length}): ${err instanceof Error ? err.message : String(err)}`
      )
    }
  }

  throw new Error("All URL failover attempts exhausted")
}
```

**Key Points**:
- Outer loop: iterate through 3 base URLs
- Inner logic: handle format conversion for `/responses` → `/chat/completions`
- Failover triggers: 401, 403, 429, 500, 502, 503, 504
- Network errors only trigger failover if not last URL
- Logging at each failover step for debugging

---

### 2. Nested Failover: Keys + URLs

**File**: `index.ts` lines 400-450

```typescript
// Outer loop: iterate through candidate API keys
for (let ki = 0; ki < candidateKeys.length; ki++) {
  const currentKey = resolveApiKeyForFamily(family, candidateKeys[ki])
  const isLastKey = ki === candidateKeys.length - 1
  const isCompatible = ki < compatibleKeys.length
  
  if (!isCompatible) {
    console.log(`[newclaw-auth] Trying incompatible key ${currentKey.slice(0, 8)}... (last resort for ${modelId})`)
  }

  try {
    if (isCodexRequest) {
      const transformation = await transformRequestForCodex(init)
      let requestInit = transformation?.updatedInit ?? init

      if (!transformation && init?.body) {
        const sanitized = sanitizeRequestBody(init.body as string)
        requestInit = { ...init, body: sanitized }
      }

      // Create headers with X-Forwarded-Host for streaming
      const headers = createNewclawHeaders(requestInit, currentKey, {
        promptCacheKey: transformation?.body.prompt_cache_key,
      })

      // Inner loop: URL failover (handled inside fetchWithUrlFailover)
      const response = await fetchWithUrlFailover(originalUrl, requestInit, NEWCLAW_BASE_URLS, headers)

      await saveResponseIfEnabled(response.clone(), "codex", { url: originalUrl, model: modelId })

      if (!response.ok) {
        // Failover to next key on 401/403/429
        if (!isLastKey && FAILOVER_STATUS_CODES.has(response.status)) continue
        return await handleErrorResponse(response)
      }

      return await handleSuccessResponse(response, true)
    }
    
    // Similar logic for Claude, DeepSeek, etc.
    
  } catch (err) {
    // Handle errors
  }
}
```

**Architecture**:
```
for each candidate key (sorted by multiplier):
  for each base URL:
    try fetch with this key + URL
    if ok: return response
    if failover status (401/403/429/500/502/503/504):
      if not last URL: try next URL
      if last URL: try next key
    if other error: return error
  if all URLs exhausted: try next key
if all keys exhausted: return error
```

---

### 3. Conditional Header Injection

**File**: `lib/request/fetch-helpers.ts` lines 65-101

```typescript
export function createNewclawHeaders(
  init: RequestInit | undefined,
  apiKey: string,
  opts?: { promptCacheKey?: string },
): Headers {
  const headers = new Headers(init?.headers ?? {})

  // Remove conflicting headers
  headers.delete(HEADER_NAMES.OPENAI_BETA)
  headers.delete(HEADER_NAMES.CHATGPT_ACCOUNT_ID)
  headers.delete("x-api-key")

  // Set authentication
  headers.set(HEADER_NAMES.AUTHORIZATION, `Bearer ${apiKey}`)
  headers.set(HEADER_NAMES.ORIGINATOR, ORIGINATOR)
  headers.set(HEADER_NAMES.USER_AGENT, USER_AGENT)
  headers.set(HEADER_NAMES.ACCEPT, "application/json")
  
  // CRITICAL: X-Forwarded-Host for streaming identification
  headers.set(HEADER_NAMES.X_FORWARDED_HOST, "localhost:5173")

  logDebug("createNewclawHeaders", {
    hasXForwardedHost: headers.has(HEADER_NAMES.X_FORWARDED_HOST),
    xForwardedHostValue: headers.get(HEADER_NAMES.X_FORWARDED_HOST),
  })

  // Content-Type
  if (!headers.has(HEADER_NAMES.CONTENT_TYPE)) {
    headers.set(HEADER_NAMES.CONTENT_TYPE, "application/json")
  }

  // Optional: Prompt cache key (conversation ID)
  const cacheKey = opts?.promptCacheKey
  if (cacheKey) {
    headers.set(HEADER_NAMES.CONVERSATION_ID, cacheKey)
    headers.set(HEADER_NAMES.SESSION_ID, cacheKey)
  } else {
    headers.delete(HEADER_NAMES.CONVERSATION_ID)
    headers.delete(HEADER_NAMES.SESSION_ID)
  }

  return headers
}
```

**Pattern**:
1. Create headers from existing init
2. Delete conflicting headers
3. Set required headers (auth, user-agent, etc.)
4. **Always** set `X-Forwarded-Host` (critical for streaming)
5. Set optional headers based on request type
6. Log for debugging

---

### 4. Request Body Transformation

**File**: `lib/request/fetch-helpers.ts` lines 34-63

```typescript
export async function transformRequestForCodex(
  init?: RequestInit,
): Promise<{ body: RequestBody; updatedInit: RequestInit } | undefined> {
  if (!init?.body || typeof init.body !== "string") return undefined

  try {
    const body = JSON.parse(init.body as string) as RequestBody
    const transformedBody = await transformRequestBody(body)

    logRequest("after-transform", {
      model: transformedBody.model,
      hasTools: !!transformedBody.tools,
      hasInput: !!transformedBody.input,
    })

    return {
      body: transformedBody,
      updatedInit: { ...init, body: JSON.stringify(transformedBody) },
    }
  } catch (error) {
    logDebug("codex-transform-error", {
      error: error instanceof Error ? error.message : String(error),
    })
    // Fallback: sanitize without full transformation
    const sanitized = sanitizeRequestBody(init.body as string)
    return {
      body: JSON.parse(sanitized),
      updatedInit: { ...init, body: sanitized },
    }
  }
}

export function sanitizeRequestBody(bodyStr: string): string {
  try {
    const body = JSON.parse(bodyStr)
    body.store = false  // Always stateless
    if (Array.isArray(body.input)) {
      body.input = sanitizeItemIds(body.input)
      body.input = normalizeOrphanedToolOutputs(body.input)
    }
    return JSON.stringify(body)
  } catch {
    return bodyStr
  }
}
```

**Pattern**:
1. Parse request body
2. Apply full transformation (model normalization, reasoning config, etc.)
3. Log transformation details
4. Return both transformed body and updated init
5. On error: fallback to sanitization only
6. Always set `store: false`

---

### 5. Request Type Detection

**File**: `index.ts` lines 188-200

```typescript
const parseRequestBody = (init?: RequestInit) => {
  if (!init?.body || typeof init.body !== "string") {
    return { body: undefined as unknown, model: undefined as string | undefined, isStreaming: false }
  }

  try {
    const body = JSON.parse(init.body as string) as { model?: unknown; stream?: boolean }
    const model = typeof body?.model === "string" ? body.model : undefined
    return { body, model, isStreaming: body?.stream === true }
  } catch {
    return { body: undefined as unknown, model: undefined as string | undefined, isStreaming: false }
  }
}

const stripProviderPrefix = (model: string) =>
  model.includes("/") ? model.split("/").pop()! : model

const isModel = (model: string | undefined, prefix: string) =>
  Boolean(model && stripProviderPrefix(model).startsWith(prefix))

const isCodexModel = (model: string | undefined) =>
  Boolean(model && CODEX_MODEL_PREFIXES.some((prefix) => stripProviderPrefix(model).startsWith(prefix)))

const isClaudeUrl = (url: string) => url.includes("/v1/messages")
```

**Pattern**:
1. Safely parse request body (handle errors)
2. Extract model and streaming flag
3. Strip provider prefix (e.g., "newclaw/gpt-5" → "gpt-5")
4. Detect model family by prefix matching
5. Detect Claude by URL pattern

---

### 6. Response Handling

**File**: `lib/request/fetch-helpers.ts` lines 111-126

```typescript
export async function handleSuccessResponse(
  response: Response,
  isStreaming: boolean,
): Promise<Response> {
  const responseHeaders = ensureContentType(response.headers)

  if (!isStreaming) {
    // Convert SSE format to JSON for non-streaming
    return await convertSseToJson(response, responseHeaders)
  }

  // Keep streaming response as-is
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  })
}
```

**Pattern**:
1. Ensure response has correct Content-Type
2. If non-streaming: convert SSE format to JSON
3. If streaming: pass through as-is
4. Preserve status and headers

---

### 7. Constants: 3-URL Failover Configuration

**File**: `lib/constants.ts` lines 12-28

```typescript
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
```

**Why 3 URLs**:
- URL1: Most flexible, platform routes internally
- URL2: Explicit version, helps if URL1 routing fails
- URL3: Explicit endpoint, helps if version routing fails

---

### 8. Header Names Constants

**File**: `lib/constants.ts` lines 35-46

```typescript
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
  X_FORWARDED_HOST: "x-forwarded-host",  // CRITICAL for streaming
} as const
```

**Usage**:
```typescript
headers.set(HEADER_NAMES.X_FORWARDED_HOST, "localhost:5173")
headers.delete(HEADER_NAMES.OPENAI_BETA)
```

---

## Testing Patterns

### Unit Test: Request Transformation

```typescript
import { describe, it, expect } from "vitest"
import { sanitizeRequestBody } from "../lib/request/fetch-helpers"

describe("sanitizeRequestBody", () => {
  it("should set store=false", () => {
    const input = JSON.stringify({
      model: "gpt-5",
      messages: [],
      store: true
    })
    
    const result = sanitizeRequestBody(input)
    const parsed = JSON.parse(result)
    
    expect(parsed.store).toBe(false)
  })

  it("should remove item_reference types", () => {
    const input = JSON.stringify({
      model: "gpt-5",
      input: [
        { type: "item_reference", id: "123" },
        { type: "text", text: "hello" }
      ]
    })
    
    const result = sanitizeRequestBody(input)
    const parsed = JSON.parse(result)
    
    expect(parsed.input).toHaveLength(1)
    expect(parsed.input[0].type).toBe("text")
  })

  it("should handle invalid JSON gracefully", () => {
    const input = "{ invalid json"
    const result = sanitizeRequestBody(input)
    expect(result).toBe(input)
  })
})
```

### Integration Test: URL Failover

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fetchWithUrlFailover } from "../index"

describe("fetchWithUrlFailover", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should try next URL on 500 error", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("", { status: 500 }))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }))
    
    global.fetch = mockFetch
    
    const response = await fetchWithUrlFailover(
      "https://api.openai.com/v1/chat/completions",
      { body: "{}" },
      ["https://newclaw.ai", "https://newclaw.ai/v1", "https://newclaw.ai/v1/chat/completions"],
      new Headers()
    )
    
    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it("should not failover on 400 error", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 400 }))
    
    global.fetch = mockFetch
    
    const response = await fetchWithUrlFailover(
      "https://api.openai.com/v1/chat/completions",
      { body: "{}" },
      ["https://newclaw.ai"],
      new Headers()
    )
    
    expect(response.status).toBe(400)
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})
```

---

## Debugging Checklist

When HTTP 500 errors occur:

```typescript
// 1. Check X-Forwarded-Host header
console.log("X-Forwarded-Host:", headers.get("x-forwarded-host"))
// Expected: "localhost:5173"

// 2. Check request body format
console.log("Has messages:", !!body.messages)
console.log("Has input:", !!body.input)
// Expected: One of these should be true, not both

// 3. Check store flag
console.log("store:", body.store)
// Expected: false

// 4. Check for item references
console.log("Item types:", body.input?.map(i => i.type))
// Expected: No "item_reference" types

// 5. Check URL being used
console.log("Target URL:", targetUrl)
// Expected: One of the 3 base URLs

// 6. Check API key
console.log("API key prefix:", apiKey.slice(0, 8))
// Expected: Valid key format
```

