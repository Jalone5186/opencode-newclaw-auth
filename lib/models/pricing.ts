/**
 * @file pricing.ts
 * @input  NewClaw /api/pricing response
 * @output Parsed pricing data, group detection, display name formatting
 * @pos    Foundation - provides pricing/group info for multi-key model sync
 */

const PRICING_API_URL = "https://newclaw.ai/api/pricing"
const PRICING_TIMEOUT_MS = 10_000
const PACKAGE_NAME = "opencode-newclaw-auth"

// ===== Types =====

export interface PricingModelPrice {
  priceType: number // 0=per-token, 1=per-request
  price: number
}

export interface PricingGroupInfo {
  DisplayName: string
  GroupRatio: number
  ModelPrice: Record<string, PricingModelPrice>
}

export interface PricingModelInfo {
  key: string
  name: string
  supplier: string
  tags: string[]
  illustrate: string
  show_order: number
}

export interface PricingData {
  model_group: Record<string, PricingGroupInfo>
  group_special: Record<string, string[]>
  model_info: Record<string, PricingModelInfo>
  model_completion_ratio: Record<string, number>
  owner_by: Record<string, unknown>
}

export interface PricingResponse {
  success: boolean
  data: PricingData
}

// ===== API Client =====

/**
 * Fetch pricing data from NewClaw API. No auth required.
 * Returns undefined on failure (network error, timeout, invalid response).
 */
export async function fetchPricing(): Promise<PricingData | undefined> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PRICING_TIMEOUT_MS)

    try {
      const response = await fetch(PRICING_API_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      })
      clearTimeout(timeout)

      if (!response.ok) {
        console.warn(`[${PACKAGE_NAME}] Pricing API returned HTTP ${response.status}`)
        return undefined
      }

      const body = (await response.json()) as PricingResponse
      if (!body?.success || !body?.data?.model_group) {
        console.warn(`[${PACKAGE_NAME}] Pricing API returned invalid data`)
        return undefined
      }

      return body.data
    } finally {
      clearTimeout(timeout)
    }
  } catch {
    console.warn(`[${PACKAGE_NAME}] Pricing API fetch failed (network error or timeout)`)
    return undefined
  }
}

// ===== Group Detection =====

/**
 * Detect which group a key belongs to by matching its model set
 * against pricing group data.
 *
 * Algorithm: for each group in model_group, count how many of
 * tokenModels appear in that group's ModelPrice. The group with
 * the highest match ratio (matchCount / tokenModels.length) wins.
 */
export function detectKeyGroup(
  tokenModels: string[],
  pricingData: PricingData,
): { groupName: string; displayName: string; groupRatio: number } | undefined {
  if (tokenModels.length === 0) return undefined

  const tokenSet = new Set(tokenModels)
  let bestGroup: string | undefined
  let bestScore = 0

  for (const [groupName, groupInfo] of Object.entries(pricingData.model_group)) {
    const groupModelIds = Object.keys(groupInfo.ModelPrice)
    if (groupModelIds.length === 0) continue

    let matchCount = 0
    for (const modelId of tokenModels) {
      if (modelId in groupInfo.ModelPrice) {
        matchCount++
      }
    }

    // Score = fraction of token's models found in this group
    const score = matchCount / tokenModels.length
    if (score > bestScore) {
      bestScore = score
      bestGroup = groupName
    }
  }

  // Require at least 50% of token models to match
  if (!bestGroup || bestScore < 0.5) return undefined

  const groupInfo = pricingData.model_group[bestGroup]
  return {
    groupName: bestGroup,
    displayName: getGroupDisplayName(groupInfo.DisplayName),
    groupRatio: groupInfo.GroupRatio,
  }
}

// ===== Display Name Formatting =====

/**
 * Get display-friendly group name.
 * If DisplayName contains semicolons, use only the first part.
 * e.g. "支持所有模型;GPT、Claude..." → "支持所有模型"
 */
export function getGroupDisplayName(rawDisplayName: string): string {
  if (!rawDisplayName) return ""
  const firstPart = rawDisplayName.split(";")[0].trim()
  return firstPart || rawDisplayName.trim()
}

/**
 * Build display name with group and ratio info.
 * e.g. "Claude Opus 4.6" + "默认" + 1 → "Claude Opus 4.6 [默认/1x]"
 */
export function buildDisplayName(
  baseName: string,
  groupDisplayName: string,
  groupRatio: number,
): string {
  const ratioStr =
    Math.floor(groupRatio) === groupRatio
      ? `${groupRatio}x`
      : `${groupRatio.toFixed(1)}x`
  return `${baseName} [${groupDisplayName}/${ratioStr}]`
}
