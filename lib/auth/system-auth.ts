/**
 * @file system-auth.ts
 * @input  NewClaw platform username/password
 * @output Session credentials, all API token keys
 * @pos    Auth - programmatic login to NewClaw system API for token discovery
 *
 * Login flow:
 *   POST /api/user/login  →  session cookie + user id
 *   GET  /api/user/self/token  →  access_token (32-char)
 *   GET  /api/token/?p=1&page_size=100  →  token list (keys masked)
 *   POST /api/token/:id/key  →  full key per token
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const PACKAGE_NAME = "opencode-newclaw-auth"
const BASE_URL = "https://newclaw.ai"
const API_TIMEOUT_MS = 15_000
const TOKEN_PAGE_SIZE = 100

// ===== Credentials File =====

export interface NewclawCredentials {
  username: string
  password: string
}

export interface SystemSession {
  userId: number
  accessToken: string
}

export interface TokenInfo {
  id: number
  key: string
  name: string
  group: string
  status: number
  models: string
  modelLimitsEnabled: boolean
}

function getPluginDir(): string {
  return path.resolve(
    import.meta.dirname ?? path.join(os.homedir(), ".cache", "opencode", "node_modules", PACKAGE_NAME),
  )
}

function getCredentialsPath(): string {
  return path.join(getPluginDir(), ".newclaw-credentials")
}

export async function readCredentials(): Promise<NewclawCredentials | undefined> {
  try {
    const raw = await readFile(getCredentialsPath(), "utf-8")
    const parsed = JSON.parse(raw)
    if (parsed?.username && parsed?.password) {
      return { username: parsed.username, password: parsed.password }
    }
  } catch {
    // file not found or invalid
  }
  return undefined
}

export async function saveCredentials(creds: NewclawCredentials): Promise<void> {
  const filePath = getCredentialsPath()
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, JSON.stringify(creds, null, 2) + "\n", "utf-8")
}

// ===== System API Client =====

async function timedFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Login and obtain system session.
 * POST /api/user/login → session cookie + user id
 * GET  /api/user/self/token → access_token
 */
export async function systemLogin(creds: NewclawCredentials): Promise<SystemSession | undefined> {
  try {
    const loginRes = await timedFetch(`${BASE_URL}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
      redirect: "manual",
    })

    if (!loginRes.ok) {
      const body = await loginRes.json().catch(() => ({})) as Record<string, unknown>
      console.warn(`[${PACKAGE_NAME}] Login failed: ${body.message ?? loginRes.status}`)
      return undefined
    }

    const loginData = (await loginRes.json()) as { success: boolean; data?: { id?: number; require_2fa?: boolean } }
    if (!loginData.success) return undefined
    if (loginData.data?.require_2fa) {
      console.warn(`[${PACKAGE_NAME}] 2FA is enabled on this account — not supported in CLI mode`)
      return undefined
    }

    const userId = loginData.data?.id
    if (!userId) return undefined

    // Extract session cookie from Set-Cookie header
    const setCookieHeaders = loginRes.headers.getSetCookie?.() ?? []
    const cookieStr = setCookieHeaders.map((c: string) => c.split(";")[0]).join("; ")

    // Get access_token via the session
    const tokenRes = await timedFetch(`${BASE_URL}/api/user/self/token`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookieStr,
        "New-Api-User": String(userId),
      },
    })

    if (!tokenRes.ok) {
      console.warn(`[${PACKAGE_NAME}] Failed to get access token: HTTP ${tokenRes.status}`)
      return undefined
    }

    const tokenData = (await tokenRes.json()) as { success: boolean; data?: string }
    if (!tokenData.success || !tokenData.data) return undefined

    return { userId, accessToken: tokenData.data }
  } catch (err) {
    console.warn(`[${PACKAGE_NAME}] System login error: ${err instanceof Error ? err.message : err}`)
    return undefined
  }
}

// ===== Token Discovery =====

interface TokenListResponse {
  success: boolean
  data?: {
    page: number
    page_size: number
    total: number
    items: Array<{
      id: number
      key: string
      name: string
      group: string
      status: number
      model_limits: string
      model_limits_enabled: boolean
    }>
  }
}

interface TokenKeyResponse {
  success: boolean
  data?: { key: string }
}

function systemHeaders(session: SystemSession): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: session.accessToken,
    "New-Api-User": String(session.userId),
  }
}

export async function fetchAllTokens(session: SystemSession): Promise<TokenInfo[]> {
  const tokens: TokenInfo[] = []
  let page = 1
  let total = Infinity

  while (tokens.length < total) {
    try {
      const res = await timedFetch(
        `${BASE_URL}/api/token/?p=${page}&page_size=${TOKEN_PAGE_SIZE}`,
        { method: "GET", headers: systemHeaders(session) },
      )

      if (!res.ok) break

      const data = (await res.json()) as TokenListResponse
      if (!data.success || !data.data) break

      total = data.data.total
      const items = data.data.items ?? []
      if (items.length === 0) break

      for (const item of items) {
        // Skip disabled/expired tokens (status 1 = enabled)
        if (item.status !== 1) continue

        tokens.push({
          id: item.id,
          key: item.key,
          name: item.name,
          group: item.group,
          status: item.status,
          models: item.model_limits,
          modelLimitsEnabled: item.model_limits_enabled,
        })
      }

      page++
    } catch {
      break
    }
  }

  return tokens
}

export async function fetchTokenKey(session: SystemSession, tokenId: number): Promise<string | undefined> {
  try {
    const res = await timedFetch(
      `${BASE_URL}/api/token/${tokenId}/key`,
      { method: "POST", headers: systemHeaders(session) },
    )

    if (!res.ok) return undefined

    const data = (await res.json()) as TokenKeyResponse
    if (!data.success || !data.data?.key) return undefined

    return data.data.key
  } catch {
    return undefined
  }
}

/**
 * Full flow: login → get all tokens → resolve all full keys.
 * Returns array of { key, group, name } for each active token.
 */
export async function discoverAllTokenKeys(creds: NewclawCredentials): Promise<
  Array<{ key: string; group: string; name: string; tokenId: number }> | undefined
> {
  const session = await systemLogin(creds)
  if (!session) return undefined

  console.log(`[${PACKAGE_NAME}] System login successful (userId=${session.userId})`)

  const tokens = await fetchAllTokens(session)
  if (tokens.length === 0) {
    console.warn(`[${PACKAGE_NAME}] No active tokens found for this account`)
    return undefined
  }

  console.log(`[${PACKAGE_NAME}] Found ${tokens.length} active token(s), resolving keys...`)

  // Resolve full keys in parallel (masked keys from list are useless)
  const results = await Promise.allSettled(
    tokens.map(async (t) => {
      const fullKey = await fetchTokenKey(session, t.id)
      return fullKey ? { key: fullKey, group: t.group, name: t.name, tokenId: t.id } : undefined
    }),
  )

  const resolved = results
    .filter((r): r is PromiseFulfilledResult<{ key: string; group: string; name: string; tokenId: number } | undefined> =>
      r.status === "fulfilled",
    )
    .map((r) => r.value)
    .filter((v): v is { key: string; group: string; name: string; tokenId: number } => v !== undefined)

  if (resolved.length === 0) {
    console.warn(`[${PACKAGE_NAME}] Could not resolve any token keys`)
    return undefined
  }

  console.log(`[${PACKAGE_NAME}] Resolved ${resolved.length} token key(s)`)
  return resolved
}
