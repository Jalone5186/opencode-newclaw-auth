/**
 * @file system-auth.ts
 * @input  NewClaw platform username/password
 * @output Session credentials, all API token keys
 * @pos    Auth - programmatic login to NewClaw system API for token discovery
 *
 * Login flow (verified against live NewClaw API):
 *   POST /api/user/login  →  session cookie + user id
 *   GET  /api/token/?p=1&page_size=100  →  token list with full keys (using session cookie)
 */

import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import os from "node:os"

const PACKAGE_NAME = "opencode-newclaw-auth"
const BASE_URL = "https://newclaw.ai"
const API_TIMEOUT_MS = 15_000
const TOKEN_PAGE_SIZE = 100
const TOKEN_KEY_PREFIX = "sk-"

export interface NewclawCredentials {
  username: string
  password: string
}

interface LoginSession {
  userId: number
  cookie: string
}

export interface TokenInfo {
  id: number
  key: string
  name: string
  group: string
  status: number
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

async function timedFetch(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function systemLogin(creds: NewclawCredentials): Promise<LoginSession | undefined> {
  try {
    const loginRes = await timedFetch(`${BASE_URL}/api/user/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: creds.username, password: creds.password }),
    })

    if (!loginRes.ok) {
      const body = await loginRes.json().catch(() => ({})) as Record<string, unknown>
      console.warn(`[${PACKAGE_NAME}] Login failed: ${body.message ?? loginRes.status}`)
      return undefined
    }

    const loginData = (await loginRes.json()) as { success: boolean; message?: string; data?: { id?: number } }
    if (!loginData.success) {
      console.warn(`[${PACKAGE_NAME}] Login failed: ${loginData.message ?? "unknown error"}`)
      return undefined
    }

    const userId = loginData.data?.id
    if (!userId) return undefined

    const setCookieHeaders = loginRes.headers.getSetCookie?.() ?? []
    const cookie = setCookieHeaders.map((c: string) => c.split(";")[0]).join("; ")
    if (!cookie) {
      console.warn(`[${PACKAGE_NAME}] Login succeeded but no session cookie returned`)
      return undefined
    }

    return { userId, cookie }
  } catch (err) {
    console.warn(`[${PACKAGE_NAME}] System login error: ${err instanceof Error ? err.message : err}`)
    return undefined
  }
}

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
    }>
  }
}

function ensureKeyPrefix(key: string): string {
  return key.startsWith(TOKEN_KEY_PREFIX) ? key : TOKEN_KEY_PREFIX + key
}

async function fetchAllTokens(session: LoginSession): Promise<TokenInfo[]> {
  const tokens: TokenInfo[] = []
  let page = 1
  let total = Infinity

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: session.cookie,
    "New-Api-User": String(session.userId),
  }

  while (tokens.length < total) {
    try {
      const res = await timedFetch(
        `${BASE_URL}/api/token/?p=${page}&page_size=${TOKEN_PAGE_SIZE}`,
        { method: "GET", headers },
      )

      if (!res.ok) break

      const data = (await res.json()) as TokenListResponse
      if (!data.success || !data.data) break

      total = data.data.total
      const items = data.data.items ?? []
      if (items.length === 0) break

      for (const item of items) {
        if (item.status !== 1) continue

        tokens.push({
          id: item.id,
          key: ensureKeyPrefix(item.key),
          name: item.name,
          group: item.group,
          status: item.status,
        })
      }

      page++
    } catch {
      break
    }
  }

  return tokens
}

/**
 * Full flow: login with username/password → fetch all tokens with full keys.
 * Returns array of { key, group, name } for each active token.
 *
 * NewClaw API returns full (unmasked) keys in the token list response,
 * so no extra per-token key fetch is needed.
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

  console.log(`[${PACKAGE_NAME}] Found ${tokens.length} active token(s)`)
  return tokens.map((t) => ({ key: t.key, group: t.group, name: t.name, tokenId: t.id }))
}
