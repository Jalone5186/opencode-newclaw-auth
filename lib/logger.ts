/**
 * @file logger.ts
 * @input  Log stage, data objects
 * @output File logs (~/.opencode/logs/), console debug output
 * @pos    Utility - debug/request logging for development
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir, tmpdir } from "node:os"
import { PLUGIN_NAME, SAVE_RAW_RESPONSE_ENV } from "./constants"

export const LOGGING_ENABLED = process.env.ENABLE_PLUGIN_REQUEST_LOGGING === "1"
export const DEBUG_ENABLED = process.env.DEBUG_NEWCLAW_PLUGIN === "1" || LOGGING_ENABLED
export const SAVE_RAW_RESPONSE_ENABLED = process.env[SAVE_RAW_RESPONSE_ENV] === "1"
const LOG_DIR = join(homedir(), ".opencode", "logs", PLUGIN_NAME)
const RAW_RESPONSE_DIR = join(tmpdir(), PLUGIN_NAME, "raw-responses")

if (LOGGING_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Request logging ENABLED - logs: ${LOG_DIR}`)
}
if (DEBUG_ENABLED && !LOGGING_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Debug logging ENABLED`)
}
if (SAVE_RAW_RESPONSE_ENABLED) {
  console.log(`[${PLUGIN_NAME}] Raw response saving ENABLED - dir: ${RAW_RESPONSE_DIR}`)
}

let requestCounter = 0

export function logRequest(stage: string, data: Record<string, unknown>): void {
  if (!LOGGING_ENABLED) return

  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString()
  const requestId = ++requestCounter
  const filename = join(LOG_DIR, `request-${requestId}-${stage}.json`)

  try {
    writeFileSync(
      filename,
      JSON.stringify({ timestamp, requestId, stage, ...data }, null, 2),
      "utf8",
    )
  } catch (e) {
    const error = e as Error
    console.error(`[${PLUGIN_NAME}] Failed to write log:`, error.message)
  }
}

export function logDebug(message: string, data?: unknown): void {
  if (!DEBUG_ENABLED) return
  if (data !== undefined) {
    console.log(`[${PLUGIN_NAME}] ${message}`, data)
  } else {
    console.log(`[${PLUGIN_NAME}] ${message}`)
  }
}

export function logWarn(message: string, data?: unknown): void {
  if (!DEBUG_ENABLED && !LOGGING_ENABLED) return
  if (data !== undefined) {
    console.warn(`[${PLUGIN_NAME}] ${message}`, data)
  } else {
    console.warn(`[${PLUGIN_NAME}] ${message}`)
  }
}

let rawResponseCounter = 0

export function saveRawResponse(
  provider: string,
  responseBody: string,
  metadata?: { url?: string; status?: number; model?: string },
): void {
  if (!SAVE_RAW_RESPONSE_ENABLED) return

  if (!existsSync(RAW_RESPONSE_DIR)) {
    mkdirSync(RAW_RESPONSE_DIR, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const responseId = ++rawResponseCounter
  const filename = join(RAW_RESPONSE_DIR, `${provider}-${timestamp}-${responseId}.json`)

  try {
    writeFileSync(
      filename,
      JSON.stringify({ timestamp: new Date().toISOString(), responseId, provider, ...metadata, body: responseBody }, null, 2),
      "utf8",
    )
  } catch (e) {
    const error = e as Error
    console.error(`[${PLUGIN_NAME}] Failed to save raw response:`, error.message)
  }
}
