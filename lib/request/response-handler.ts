/**
 * @file response-handler.ts
 * @input  SSE Response stream
 * @output JSON Response (for non-streaming) or passthrough (for streaming)
 * @pos    Response layer - SSE parsing and content-type handling
 */

import { PLUGIN_NAME } from "../constants"
import { logRequest, LOGGING_ENABLED } from "../logger"
import type { SSEEventData } from "../types"

function parseSseStream(sseText: string): unknown | null {
  const lines = sseText.split("\n")

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const data = JSON.parse(line.substring(6)) as SSEEventData
        if (data.type === "response.done" || data.type === "response.completed") {
          return data.response
        }
      } catch {
        // Skip malformed JSON
      }
    }
  }

  return null
}

export async function convertSseToJson(response: Response, headers: Headers): Promise<Response> {
  if (!response.body) {
    throw new Error(`[${PLUGIN_NAME}] Response has no body`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let fullText = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      fullText += decoder.decode(value, { stream: true })
    }

    if (LOGGING_ENABLED) {
      logRequest("stream-full", { fullContent: fullText })
    }

    const finalResponse = parseSseStream(fullText)

    if (!finalResponse) {
      console.error(`[${PLUGIN_NAME}] Could not find final response in SSE stream`)
      logRequest("stream-error", { error: "No response.done event found" })

      return new Response(fullText, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    }

    const jsonHeaders = new Headers(headers)
    jsonHeaders.set("content-type", "application/json; charset=utf-8")

    return new Response(JSON.stringify(finalResponse), {
      status: response.status,
      statusText: response.statusText,
      headers: jsonHeaders,
    })
  } catch (error) {
    console.error(`[${PLUGIN_NAME}] Error converting stream:`, error)
    logRequest("stream-error", { error: String(error) })
    throw error
  }
}

export function ensureContentType(headers: Headers): Headers {
  const responseHeaders = new Headers(headers)
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "text/event-stream; charset=utf-8")
  }
  return responseHeaders
}
