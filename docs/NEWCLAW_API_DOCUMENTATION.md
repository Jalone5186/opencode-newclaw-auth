# NewClaw API Documentation & Best Practices

## 1. Streaming vs Non-Streaming Requirements

### Official API Behavior

**Key Finding**: NewClaw API distinguishes streaming requests via the `X-Forwarded-Host` header, not just the `stream: true` field in the request body.

#### Streaming Request Identification
- **Primary indicator**: `stream: true` in request body
- **Secondary indicator**: `X-Forwarded-Host` header presence
- **Platform behavior**: Without `X-Forwarded-Host`, platform cannot identify as streaming → returns HTTP 500

#### Request Body Format Differences

**Streaming Request (Chat Completions API)**:
```json
{
  "model": "gpt-5-codex-high",
  "messages": [
    {"role": "user", "content": "Hello"}
  ],
  "stream": true,
  "store": false
}
```

**Non-Streaming Request (Responses API)**:
```json
{
  "model": "gpt-5-codex-high",
  "input": [
    {"type": "text", "text": "Hello"}
  ],
  "stream": false,
  "store": false
}
```

**Critical Difference**: 
- Streaming uses `messages` field (Chat Completions format)
- Non-streaming uses `input` field (Responses API format)
- Platform requires format matching the endpoint type

---

## 2. X-Forwarded-Host Header Requirements

### When It's Required

**Mandatory for**:
- All streaming requests (Chat Completions API)
- DeepSeek, Grok, Gemini models
- Any request with `stream: true`

**Optional for**:
- Non-streaming requests (Responses API)
- Some legacy endpoints

### Implementation Pattern

```typescript
// CORRECT: Always inject for streaming requests
export function createNewclawHeaders(
  init: RequestInit | undefined,
  apiKey: string,
): Headers {
  const headers = new Headers(init?.headers ?? {})
  
  // Critical: Platform uses this to identify streaming requests
  headers.set("x-forwarded-host", "localhost:5173")
  headers.set("authorization", `Bearer ${apiKey}`)
  headers.set("content-type", "application/json")
  
  return headers
}
```

### Why It Breaks Without It

1. **Platform routing**: Without `X-Forwarded-Host`, platform cannot determine if request is streaming
2. **Response format mismatch**: Platform returns non-streaming response format for streaming request
3. **HTTP 500 error**: Mismatch between request format and response format causes internal error
4. **Silent failure**: Error occurs server-side, not in request validation

### Header Injection Best Practice

```typescript
// Pattern: Conditional injection based on request type
const headers = new Headers(init?.headers ?? {})

// Always inject for streaming
if (isStreaming || requestBody.stream === true) {
  headers.set("x-forwarded-host", "localhost:5173")
}

// Provider-specific headers
if (isClaudeRequest) {
  headers.set("x-api-key", apiKey)
  headers.set("anthropic-version", "2023-06-01")
} else {
  headers.set("authorization", `Bearer ${apiKey}`)
}
```

---

## 3. Request Body Format Requirements

### Messages vs Input Fields

#### Chat Completions Format (Streaming)
```typescript
interface ChatCompletionsRequest {
  model: string
  messages: Array<{
    role: "user" | "assistant" | "system"
    content: string | ContentBlock[]
  }>
  stream: true
  store: false
  temperature?: number
  max_tokens?: number
}
```

#### Responses API Format (Non-Streaming)
```typescript
interface ResponsesAPIRequest {
  model: string
  input: Array<{
    type: "text" | "image" | "audio"
    text?: string
    url?: string
    // ... other fields
  }>
  stream: false
  store: false
}
```

### Transformation Logic

**Critical**: When converting between formats, must transform both structure AND semantics:

```typescript
// WRONG: Just changing field name
const body = JSON.parse(init.body)
body.messages = body.input  // ❌ Semantic mismatch
delete body.input

// CORRECT: Transform structure AND content
const body = JSON.parse(init.body)
if (body.input && !body.messages) {
  // Convert input items to message format
  body.messages = body.input.map(item => ({
    role: "user",
    content: item.text || item.url
  }))
  delete body.input
}
```

### Request Sanitization Requirements

```typescript
export function sanitizeRequestBody(bodyStr: string): string {
  try {
    const body = JSON.parse(bodyStr)
    
    // Always set store=false for stateless mode
    body.store = false
    
    // Remove item references (not supported in stateless mode)
    if (Array.isArray(body.input)) {
      body.input = body.input.filter(item => item.type !== "item_reference")
      
      // Remove IDs from items (stateless mode doesn't support references)
      body.input = body.input.map(item => {
        const { id, ...rest } = item
        return rest
      })
    }
    
    return JSON.stringify(body)
  } catch {
    return bodyStr
  }
}
```

---

## 4. HTTP 500 Error Patterns in API Aggregation

### Root Causes

| Error Pattern | Root Cause | Solution |
|---|---|---|
| All 3 URLs return 500 | Missing `X-Forwarded-Host` header | Add header to all streaming requests |
| 500 on first URL only | URL routing issue | Try next URL in failover chain |
| 500 with format mismatch | Request body format doesn't match endpoint | Transform `input` → `messages` |
| 500 with stateful request | `store: true` in stateless mode | Set `store: false` |
| 500 with item references | Item IDs in stateless mode | Remove IDs and item_reference types |

### Debugging Pattern

```typescript
// Log request details before sending
console.log({
  url: targetUrl,
  headers: {
    "x-forwarded-host": headers.get("x-forwarded-host"),
    "authorization": headers.get("authorization") ? "***" : "missing",
    "content-type": headers.get("content-type"),
  },
  body: {
    model: body.model,
    hasMessages: !!body.messages,
    hasInput: !!body.input,
    stream: body.stream,
    store: body.store,
  }
})

// If 500 error, check:
// 1. X-Forwarded-Host present?
// 2. messages vs input field correct?
// 3. store = false?
// 4. No item references?
```

---

## 5. Best Practices for Conditional Header Injection

### Pattern 1: Request Type Detection

```typescript
const parseRequestBody = (init?: RequestInit) => {
  if (!init?.body || typeof init.body !== "string") {
    return { model: undefined, isStreaming: false }
  }
  
  try {
    const body = JSON.parse(init.body)
    return {
      model: body.model,
      isStreaming: body.stream === true
    }
  } catch {
    return { model: undefined, isStreaming: false }
  }
}

// Usage
const { model, isStreaming } = parseRequestBody(init)
```

### Pattern 2: Provider-Specific Header Injection

```typescript
const createHeadersForProvider = (
  init: RequestInit | undefined,
  apiKey: string,
  provider: "claude" | "codex" | "deepseek"
): Headers => {
  const headers = new Headers(init?.headers ?? {})
  
  // Common headers
  headers.set("user-agent", "opencode-newclaw-auth/0.4.1")
  headers.set("content-type", "application/json")
  
  // Streaming indicator (required for all non-Claude)
  if (provider !== "claude") {
    headers.set("x-forwarded-host", "localhost:5173")
  }
  
  // Provider-specific auth
  switch (provider) {
    case "claude":
      headers.set("x-api-key", apiKey)
      headers.set("anthropic-version", "2023-06-01")
      break
    case "codex":
    case "deepseek":
      headers.set("authorization", `Bearer ${apiKey}`)
      break
  }
  
  return headers
}
```

### Pattern 3: Nested Failover with Conditional Headers

```typescript
const fetchWithConditionalHeaders = async (
  originalUrl: string,
  init: RequestInit | undefined,
  baseUrls: string[],
  apiKey: string,
  provider: string
): Promise<Response> => {
  for (const baseUrl of baseUrls) {
    try {
      // Create headers based on provider and request type
      const headers = createHeadersForProvider(init, apiKey, provider)
      
      // Rewrite URL to use this baseUrl
      const targetUrl = rewriteUrl(originalUrl, baseUrl)
      
      // Send request
      const response = await fetch(targetUrl, {
        ...init,
        headers
      })
      
      // Check if should failover
      if (response.ok) return response
      if (FAILOVER_STATUS_CODES.has(response.status)) continue
      return response
      
    } catch (err) {
      // Last URL? Throw error
      if (baseUrl === baseUrls[baseUrls.length - 1]) throw err
      // Otherwise continue to next URL
    }
  }
}
```

### Pattern 4: Avoid Common Mistakes

```typescript
// ❌ WRONG: Inject header unconditionally
headers.set("x-forwarded-host", "localhost:5173")  // Breaks non-streaming

// ✅ CORRECT: Conditional injection
if (isStreaming || provider !== "claude") {
  headers.set("x-forwarded-host", "localhost:5173")
}

// ❌ WRONG: Overwrite existing headers
headers.set("authorization", newKey)  // Loses other auth headers

// ✅ CORRECT: Preserve and update
const headers = new Headers(init?.headers ?? {})
headers.set("authorization", newKey)

// ❌ WRONG: Inject headers after fetch
const response = await fetch(url, init)
response.headers.set("x-forwarded-host", "...")  // Too late!

// ✅ CORRECT: Inject before fetch
const headers = createHeaders(...)
const response = await fetch(url, { ...init, headers })
```

---

## 6. Testing Patterns for Request Transformation Logic

### Unit Test Structure (AAA Pattern)

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import { transformRequestBody, sanitizeRequestBody } from "./request-transformer"

describe("Request Transformation", () => {
  describe("transformRequestBody", () => {
    it("should inject stream=true for streaming requests", async () => {
      // Arrange
      const input = {
        model: "gpt-5-codex-high",
        messages: [{ role: "user", content: "test" }],
        stream: false  // Input has stream=false
      }
      
      // Act
      const result = await transformRequestBody(input)
      
      // Assert
      expect(result.stream).toBe(true)
      expect(result.store).toBe(false)
    })
    
    it("should normalize model names", async () => {
      // Arrange
      const input = {
        model: "GPT-5-CODEX-HIGH",  // Uppercase
        messages: []
      }
      
      // Act
      const result = await transformRequestBody(input)
      
      // Assert
      expect(result.model).toBe("gpt-5-codex-high")
    })
    
    it("should remove item references in stateless mode", async () => {
      // Arrange
      const input = {
        model: "gpt-5-codex-high",
        input: [
          { type: "item_reference", id: "123" },
          { type: "text", text: "hello" }
        ]
      }
      
      // Act
      const result = await transformRequestBody(input)
      
      // Assert
      expect(result.input).toHaveLength(1)
      expect(result.input[0].type).toBe("text")
    })
  })
  
  describe("sanitizeRequestBody", () => {
    it("should set store=false", () => {
      // Arrange
      const input = JSON.stringify({
        model: "gpt-5",
        messages: [],
        store: true
      })
      
      // Act
      const result = sanitizeRequestBody(input)
      const parsed = JSON.parse(result)
      
      // Assert
      expect(parsed.store).toBe(false)
    })
    
    it("should handle invalid JSON gracefully", () => {
      // Arrange
      const input = "{ invalid json"
      
      // Act
      const result = sanitizeRequestBody(input)
      
      // Assert
      expect(result).toBe(input)  // Returns original on parse error
    })
  })
})
```

### Integration Test with Mocked Fetch

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import { fetchWithUrlFailover } from "./fetch-helpers"

describe("Fetch with URL Failover", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  it("should try next URL on 500 error", async () => {
    // Arrange
    const urls = [
      "https://newclaw.ai",
      "https://newclaw.ai/v1",
      "https://newclaw.ai/v1/chat/completions"
    ]
    
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 500 }))  // First URL fails
      .mockResolvedValueOnce(new Response("", { status: 500 }))  // Second URL fails
      .mockResolvedValueOnce(new Response("OK", { status: 200 })) // Third URL succeeds
    
    global.fetch = mockFetch
    
    // Act
    const response = await fetchWithUrlFailover(
      "https://api.openai.com/v1/chat/completions",
      { body: "{}" },
      urls,
      new Headers()
    )
    
    // Assert
    expect(response.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
  
  it("should failover on 401 with multiple keys", async () => {
    // Arrange
    const keys = ["key1", "key2", "key3"]
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))  // key1 fails
      .mockResolvedValueOnce(new Response("", { status: 401 }))  // key2 fails
      .mockResolvedValueOnce(new Response("OK", { status: 200 })) // key3 succeeds
    
    global.fetch = mockFetch
    
    // Act
    let response: Response | undefined
    for (const key of keys) {
      const headers = new Headers()
      headers.set("authorization", `Bearer ${key}`)
      
      response = await fetch("https://newclaw.ai/v1/chat/completions", {
        headers
      })
      
      if (response.ok) break
    }
    
    // Assert
    expect(response?.status).toBe(200)
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })
  
  it("should not failover on non-failover status codes", async () => {
    // Arrange
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 400 }))  // Bad request
    
    global.fetch = mockFetch
    
    // Act
    const response = await fetch("https://newclaw.ai/v1/chat/completions", {})
    
    // Assert
    expect(response.status).toBe(400)
    expect(mockFetch).toHaveBeenCalledTimes(1)  // Only called once
  })
})
```

### Mock Service Worker (MSW) Pattern

```typescript
import { setupServer } from "msw/node"
import { http, HttpResponse } from "msw"
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest"

const server = setupServer(
  // Mock successful streaming request
  http.post("https://newclaw.ai/v1/chat/completions", ({ request }) => {
    const headers = request.headers
    
    // Verify required headers
    if (!headers.get("x-forwarded-host")) {
      return HttpResponse.json({ error: "Missing x-forwarded-host" }, { status: 500 })
    }
    
    if (!headers.get("authorization")) {
      return HttpResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    return HttpResponse.json({
      id: "chatcmpl-123",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: "Hello!" } }]
    })
  }),
  
  // Mock failover scenario
  http.post("https://newclaw.ai/v1/chat/completions", ({ request }) => {
    // First call fails, second succeeds
    if (request.headers.get("x-retry") === "1") {
      return HttpResponse.json({ error: "Server error" }, { status: 500 })
    }
    return HttpResponse.json({ choices: [{ message: { content: "OK" } }] })
  })
)

describe("Request Transformation with MSW", () => {
  beforeAll(() => server.listen())
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())
  
  it("should send request with correct headers", async () => {
    // Arrange
    const headers = new Headers()
    headers.set("x-forwarded-host", "localhost:5173")
    headers.set("authorization", "Bearer test-key")
    
    // Act
    const response = await fetch("https://newclaw.ai/v1/chat/completions", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "gpt-5-codex-high",
        messages: [{ role: "user", content: "test" }],
        stream: true
      })
    })
    
    // Assert
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.choices).toBeDefined()
  })
})
```

### Snapshot Testing for Request Transformation

```typescript
import { describe, it, expect } from "vitest"
import { transformRequestBody } from "./request-transformer"

describe("Request Transformation Snapshots", () => {
  it("should transform Codex request consistently", async () => {
    // Arrange
    const input = {
      model: "gpt-5-codex-high",
      messages: [
        { role: "system", content: "You are helpful" },
        { role: "user", content: "Hello" }
      ],
      temperature: 0.7,
      max_tokens: 1000
    }
    
    // Act
    const result = await transformRequestBody(input)
    
    // Assert - snapshot ensures consistent transformation
    expect(result).toMatchSnapshot()
  })
})
```

---

## Summary: Implementation Checklist

- [ ] **Streaming Detection**: Parse `stream: true` from request body
- [ ] **Header Injection**: Add `X-Forwarded-Host: localhost:5173` for all streaming requests
- [ ] **Request Format**: Transform `input` → `messages` when converting between APIs
- [ ] **Sanitization**: Set `store: false`, remove item references and IDs
- [ ] **URL Failover**: Try 3 URLs in sequence on 500/502/503/504 errors
- [ ] **Key Failover**: Try next API key on 401/403/429 errors
- [ ] **Error Handling**: Log all failover attempts for debugging
- [ ] **Testing**: Unit tests for transformation, integration tests for failover
- [ ] **Logging**: Debug logs for header injection and request format

