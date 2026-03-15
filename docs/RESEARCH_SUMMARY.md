# NewClaw API Research Summary

**Date**: March 15, 2026  
**Project**: opencode-newclaw-auth  
**Status**: Complete

---

## Research Scope

This research documents:
1. NewClaw API official streaming vs non-streaming requirements
2. X-Forwarded-Host header requirements and when it breaks requests
3. Request body format requirements (messages vs input fields)
4. HTTP 500 error patterns in API aggregation services
5. Best practices for conditional header injection in fetch interceptors
6. Testing patterns for request transformation logic

---

## Key Findings

### 1. Streaming Identification (Critical Discovery)

**Finding**: NewClaw API uses `X-Forwarded-Host` header as the primary streaming indicator, not just `stream: true` in the request body.

**Impact**: Without this header, the platform cannot identify streaming requests → returns HTTP 500 for all 3 base URLs simultaneously.

**Evidence**: 
- `lib/request/fetch-helpers.ts` line 80: `headers.set(HEADER_NAMES.X_FORWARDED_HOST, "localhost:5173")`
- `lib/constants.ts` line 45: `X_FORWARDED_HOST: "x-forwarded-host"` defined as critical header
- AGENTS.md v0.4.1 fix: "Platform depends on `X-Forwarded-Host` header to identify streaming requests"

**Solution**: Always inject `X-Forwarded-Host: localhost:5173` for all non-Claude streaming requests.

---

### 2. Request Body Format Transformation

**Finding**: Platform distinguishes between two request formats:
- **Chat Completions API** (streaming): Uses `messages` field
- **Responses API** (non-streaming): Uses `input` field

**Critical**: Simply renaming the field is insufficient. The content structure must also be transformed.

**Evidence**:
- `index.ts` lines 275-291: Converts `/responses` → `/chat/completions` and transforms `input` → `messages`
- `lib/request/fetch-helpers.ts` lines 20-32: `sanitizeRequestBody()` removes item references and IDs

**Solution**: 
```typescript
if (body.input && !body.messages) {
  body.messages = body.input.map(item => ({
    role: "user",
    content: item.text || item.url
  }))
  delete body.input
}
```

---

### 3. URL Failover Architecture (3-Layer)

**Finding**: NewClaw API supports 3 different base URLs with different routing behaviors:
1. `https://newclaw.ai` - Primary (most flexible)
2. `https://newclaw.ai/v1` - Secondary (explicit version)
3. `https://newclaw.ai/v1/chat/completions` - Tertiary (explicit endpoint)

**Why 3 URLs**: Each URL represents a different routing layer. If one fails, the next may succeed due to different internal routing logic.

**Evidence**:
- `lib/constants.ts` lines 16-20: `NEWCLAW_BASE_URLS` array with 3 URLs
- `index.ts` lines 254-322: `fetchWithUrlFailover()` implements nested loop through all 3 URLs
- AGENTS.md v0.4.0: "3-URL failover architecture" documented as root solution

**Failover Triggers**: 401, 403, 429, 500, 502, 503, 504

---

### 4. Nested Failover: Keys + URLs

**Finding**: The plugin implements a 2-level failover system:
- **Outer loop**: Iterate through candidate API keys (sorted by multiplier)
- **Inner loop**: Iterate through 3 base URLs

**Architecture**:
```
for each key (sorted by multiplier):
  for each URL:
    try fetch
    if ok: return
    if failover status: try next URL
  if all URLs fail: try next key
if all keys fail: return error
```

**Evidence**:
- `index.ts` lines 400-450: Outer key loop with inner URL failover
- `lib/models/key-registry.ts`: Keys sorted by multiplier (lowest first)
- AGENTS.md: "Nested failover: outer layer Key, inner layer URL"

---

### 5. HTTP 500 Error Root Causes

**Finding**: HTTP 500 errors in API aggregation typically indicate format mismatches:

| Pattern | Root Cause | Fix |
|---------|-----------|-----|
| All 3 URLs return 500 | Missing `X-Forwarded-Host` | Add header |
| 500 with `input` field | Format mismatch | Transform to `messages` |
| 500 with `store: true` | Stateful request in stateless mode | Set `store: false` |
| 500 with item IDs | References in stateless mode | Remove IDs |
| 500 on first URL only | Routing issue | Try next URL |

**Evidence**:
- AGENTS.md v0.4.1: "Platform cannot identify as streaming → returns 500"
- `lib/request/fetch-helpers.ts` lines 20-32: Sanitization removes problematic fields
- `index.ts` lines 275-291: Format conversion handles `/responses` → `/chat/completions`

---

### 6. Conditional Header Injection Pattern

**Finding**: Headers must be injected conditionally based on request type and provider:

**Pattern**:
```typescript
const headers = new Headers(init?.headers ?? {})

// Always for streaming
if (isStreaming) {
  headers.set("x-forwarded-host", "localhost:5173")
}

// Provider-specific
if (isClaudeRequest) {
  headers.set("x-api-key", apiKey)
} else {
  headers.set("authorization", `Bearer ${apiKey}`)
}
```

**Evidence**:
- `lib/request/fetch-helpers.ts` lines 65-101: `createNewclawHeaders()` shows pattern
- `index.ts` lines 435-446: Claude uses different headers than Codex
- Logging at line 82-85: Debug logs verify header injection

---

### 7. Testing Patterns

**Finding**: Effective testing requires:
1. **Unit tests**: Test transformation logic in isolation
2. **Integration tests**: Test failover with mocked fetch
3. **Snapshot tests**: Ensure consistent transformation
4. **MSW mocks**: Test with realistic network scenarios

**Evidence**:
- `tests/` directory structure shows test organization
- Vitest configuration in `package.json`
- Mock Service Worker patterns documented in research

---

## Implementation Checklist

- [x] Streaming detection via `stream: true` field
- [x] X-Forwarded-Host header injection for all streaming
- [x] Request format transformation (input → messages)
- [x] Request sanitization (store=false, remove IDs)
- [x] 3-URL failover on 500/502/503/504
- [x] Key failover on 401/403/429
- [x] Nested failover architecture
- [x] Conditional header injection
- [x] Error logging and debugging
- [x] Unit and integration tests

---

## Documentation Files

### 1. NEWCLAW_API_DOCUMENTATION.md
Comprehensive guide covering:
- Streaming vs non-streaming requirements
- X-Forwarded-Host header requirements
- Request body format requirements
- HTTP 500 error patterns
- Conditional header injection best practices
- Testing patterns with code examples

### 2. IMPLEMENTATION_PATTERNS.md
Real-world code examples from the project:
- URL failover architecture (3-layer)
- Nested failover (keys + URLs)
- Conditional header injection
- Request body transformation
- Request type detection
- Response handling
- Constants configuration
- Unit and integration tests
- Debugging checklist

---

## Key Insights

### Why X-Forwarded-Host Matters

The `X-Forwarded-Host` header is not just metadata—it's a **routing signal** that tells the NewClaw platform:
1. This is a streaming request (not just `stream: true`)
2. Use streaming response format (not non-streaming)
3. Apply streaming-specific processing

Without it, the platform:
- Treats streaming request as non-streaming
- Returns non-streaming response format
- Causes format mismatch → HTTP 500

### Why 3 URLs Exist

Each URL represents a different routing layer:
- **URL1** (`https://newclaw.ai`): Most flexible, internal routing
- **URL2** (`https://newclaw.ai/v1`): Explicit version, helps if URL1 routing fails
- **URL3** (`https://newclaw.ai/v1/chat/completions`): Explicit endpoint, helps if version routing fails

This 3-layer approach provides maximum resilience against routing failures.

### Why Nested Failover Works

The nested failover (keys + URLs) provides two independent failure recovery mechanisms:
1. **URL failover**: Recovers from platform routing issues
2. **Key failover**: Recovers from authentication or quota issues

Together, they handle most failure scenarios without user intervention.

---

## References

### Official Documentation
- NewClaw API: https://newclaw.apifox.cn/
- X-Forwarded-Host standard: https://http.dev/x-forwarded-host

### Project Files
- `index.ts`: Main plugin entry, fetch interceptor, failover logic
- `lib/request/fetch-helpers.ts`: Header injection, request transformation
- `lib/constants.ts`: URL and header configuration
- `lib/models/key-registry.ts`: Key selection and sorting
- `AGENTS.md`: Project memory with version history

### Research Sources
- API Gateway patterns (2026): https://oneuptime.com/blog/post/2026-01-30-request-transformation/
- Request transformation best practices: https://api7.ai/learning-center/api-gateway-guide/api-gateway-api-aggregation
- Testing patterns: Mock Service Worker, Vitest, Playwright
- HTTP header security: https://requestly.com/blog/x-forwarded-host/

---

## Recommendations

1. **Documentation**: Keep NEWCLAW_API_DOCUMENTATION.md updated as API changes
2. **Testing**: Expand test coverage for edge cases (malformed requests, timeout scenarios)
3. **Monitoring**: Add metrics for failover frequency (indicates platform issues)
4. **Logging**: Enhance debug logs to include request/response body samples
5. **Versioning**: Document API version compatibility in AGENTS.md

---

## Conclusion

The opencode-newclaw-auth plugin implements a sophisticated multi-layer failover system that handles both platform routing issues (via URL failover) and authentication issues (via key failover). The critical insight is that `X-Forwarded-Host` is not optional metadata but a required routing signal for streaming requests. Understanding this distinction is key to debugging HTTP 500 errors in API aggregation scenarios.

