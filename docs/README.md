# NewClaw API Documentation

This directory contains comprehensive documentation on NewClaw API integration patterns, best practices, and implementation details for the opencode-newclaw-auth plugin.

## Files

### 1. [RESEARCH_SUMMARY.md](./RESEARCH_SUMMARY.md)
**Start here.** High-level overview of key findings and insights.

- 7 major findings with evidence
- Implementation checklist
- Key insights and recommendations
- Quick reference for debugging

**Read this if**: You want a quick overview of what was researched and why it matters.

---

### 2. [NEWCLAW_API_DOCUMENTATION.md](./NEWCLAW_API_DOCUMENTATION.md)
**Comprehensive reference guide.** Detailed documentation on API requirements and best practices.

**Sections**:
1. Streaming vs Non-Streaming Requirements
   - Official API behavior
   - Request body format differences
   - Streaming identification

2. X-Forwarded-Host Header Requirements
   - When it's required
   - Why it breaks without it
   - Implementation patterns

3. Request Body Format Requirements
   - Messages vs Input fields
   - Transformation logic
   - Sanitization requirements

4. HTTP 500 Error Patterns
   - Root causes table
   - Debugging patterns

5. Conditional Header Injection Best Practices
   - Request type detection
   - Provider-specific injection
   - Nested failover with headers
   - Common mistakes to avoid

6. Testing Patterns
   - Unit test structure (AAA pattern)
   - Integration tests with mocked fetch
   - Mock Service Worker patterns
   - Snapshot testing

**Read this if**: You need detailed explanations and code examples for specific topics.

---

### 3. [IMPLEMENTATION_PATTERNS.md](./IMPLEMENTATION_PATTERNS.md)
**Real-world code examples.** Actual code from the project with annotations.

**Sections**:
1. URL Failover Architecture (3-Layer)
   - Full implementation with comments
   - Key points explained

2. Nested Failover: Keys + URLs
   - Outer loop (keys) + inner loop (URLs)
   - Architecture diagram

3. Conditional Header Injection
   - `createNewclawHeaders()` function
   - Pattern explanation

4. Request Body Transformation
   - `transformRequestForCodex()` function
   - Sanitization logic

5. Request Type Detection
   - Helper functions
   - Model family detection

6. Response Handling
   - Streaming vs non-streaming
   - Content-Type handling

7. Constants Configuration
   - 3-URL failover setup
   - Header names
   - Failover status codes

8. Testing Patterns
   - Unit tests with Vitest
   - Integration tests with mocked fetch
   - Debugging checklist

**Read this if**: You need to understand how the code actually works or want to implement similar patterns.

---

## Quick Reference

### When to Use Each Document

| Scenario | Document |
|----------|----------|
| "What was researched?" | RESEARCH_SUMMARY.md |
| "Why does X-Forwarded-Host matter?" | NEWCLAW_API_DOCUMENTATION.md §2 |
| "How do I fix HTTP 500 errors?" | NEWCLAW_API_DOCUMENTATION.md §4 |
| "How do I test request transformation?" | NEWCLAW_API_DOCUMENTATION.md §6 |
| "Show me the actual code" | IMPLEMENTATION_PATTERNS.md |
| "How does URL failover work?" | IMPLEMENTATION_PATTERNS.md §1 |
| "How do I debug a request?" | IMPLEMENTATION_PATTERNS.md §8 |

---

## Key Findings Summary

### 1. X-Forwarded-Host is Critical
The `X-Forwarded-Host` header is not optional metadata—it's a **routing signal** that tells NewClaw whether a request is streaming. Without it, all 3 URLs return HTTP 500.

**Solution**: Always inject `X-Forwarded-Host: localhost:5173` for streaming requests.

### 2. Request Format Matters
NewClaw distinguishes between:
- **Chat Completions API** (streaming): Uses `messages` field
- **Responses API** (non-streaming): Uses `input` field

Simply renaming the field is insufficient; the content structure must also be transformed.

### 3. 3-URL Failover Architecture
Each URL represents a different routing layer:
- `https://newclaw.ai` - Primary (most flexible)
- `https://newclaw.ai/v1` - Secondary (explicit version)
- `https://newclaw.ai/v1/chat/completions` - Tertiary (explicit endpoint)

If one fails, the next may succeed due to different internal routing logic.

### 4. Nested Failover (Keys + URLs)
The plugin implements 2-level failover:
- **Outer loop**: Iterate through API keys (sorted by multiplier)
- **Inner loop**: Iterate through 3 base URLs

This handles both authentication issues (key failover) and routing issues (URL failover).

### 5. HTTP 500 Root Causes
Most HTTP 500 errors indicate format mismatches:
- Missing `X-Forwarded-Host` header
- Wrong request body format (`input` vs `messages`)
- `store: true` in stateless mode
- Item IDs in stateless mode

---

## Implementation Checklist

- [x] Streaming detection via `stream: true` field
- [x] X-Forwarded-Host header injection
- [x] Request format transformation (input → messages)
- [x] Request sanitization (store=false, remove IDs)
- [x] 3-URL failover on 500/502/503/504
- [x] Key failover on 401/403/429
- [x] Nested failover architecture
- [x] Conditional header injection
- [x] Error logging and debugging
- [x] Unit and integration tests

---

## Debugging Workflow

When you encounter HTTP 500 errors:

1. **Check X-Forwarded-Host header**
   ```typescript
   console.log("X-Forwarded-Host:", headers.get("x-forwarded-host"))
   // Expected: "localhost:5173"
   ```

2. **Check request body format**
   ```typescript
   console.log("Has messages:", !!body.messages)
   console.log("Has input:", !!body.input)
   // Expected: One of these should be true, not both
   ```

3. **Check store flag**
   ```typescript
   console.log("store:", body.store)
   // Expected: false
   ```

4. **Check for item references**
   ```typescript
   console.log("Item types:", body.input?.map(i => i.type))
   // Expected: No "item_reference" types
   ```

5. **Check URL being used**
   ```typescript
   console.log("Target URL:", targetUrl)
   // Expected: One of the 3 base URLs
   ```

See IMPLEMENTATION_PATTERNS.md §8 for full debugging checklist.

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
- API Gateway patterns: https://oneuptime.com/blog/post/2026-01-30-request-transformation/
- Request transformation: https://api7.ai/learning-center/api-gateway-guide/api-gateway-api-aggregation
- Testing patterns: Mock Service Worker, Vitest, Playwright
- HTTP headers: https://requestly.com/blog/x-forwarded-host/

---

## Document Statistics

| Document | Lines | Topics | Code Examples |
|----------|-------|--------|----------------|
| RESEARCH_SUMMARY.md | 274 | 7 findings | 5 |
| NEWCLAW_API_DOCUMENTATION.md | 645 | 6 sections | 25+ |
| IMPLEMENTATION_PATTERNS.md | 538 | 8 patterns | 15+ |
| **Total** | **1,457** | **21** | **45+** |

---

## Contributing

When updating these documents:

1. Keep RESEARCH_SUMMARY.md as the entry point
2. Link between documents for cross-references
3. Include code examples with file paths and line numbers
4. Update the checklist when new patterns are discovered
5. Add new findings to AGENTS.md for project memory

---

**Last Updated**: March 15, 2026  
**Status**: Complete  
**Coverage**: 100% of research scope
