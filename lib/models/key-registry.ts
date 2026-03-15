/**
 * @file key-registry.ts
 * @input  KeyProfile registrations from auto-sync
 * @output Model→key resolution for runtime routing
 * @pos    Core - singleton registry mapping keys to models with group info
 */

// ===== Types =====

export interface KeyProfile {
  /** The API key string (sk-xxx) */
  key: string
  /** Group name, e.g. "Codex专属" */
  groupName: string
  /** Display-friendly group name, e.g. "Codex专属特供" */
  groupDisplayName: string
  /** Group pricing ratio, e.g. 0.8 */
  groupRatio: number
  /** Model IDs this key can access */
  models: string[]
  /** Where this key came from */
  source: "auth" | "config"
  /** Map of model ID to supported endpoint types */
  modelEndpointMap?: Map<string, string[]>
}

// ===== Registry =====

export class KeyRegistry {
  private profiles: KeyProfile[] = []

  /**
   * Register a key profile.
   */
  register(profile: KeyProfile): void {
    this.profiles.push(profile)
  }

  /**
   * Select best key for a model.
   * Priority: lowest groupRatio first (cheapest for user).
   * If model not found in any profile, return fallbackKey.
   */
  selectKeyForModel(modelId: string, fallbackKey: string): string {
    const keys = this.selectKeysForModel(modelId, fallbackKey)
    return keys[0]
  }

  /**
   * Return all candidate keys for a model, sorted by groupRatio ascending (cheapest first).
   * The fallbackKey is appended at the end if not already in the list.
   * Used for failover: try keys[0], on failure try keys[1], etc.
   * 
   * Filters keys by:
   * 1. Model availability in key's model list
   * 2. Endpoint type support (if model requires specific endpoint type)
   */
  selectKeysForModel(modelId: string, fallbackKey: string): string[] {
    const candidates: { key: string; ratio: number }[] = []

    for (const profile of this.profiles) {
      if (!profile.models.includes(modelId)) continue

      // Check if this key supports the required endpoint type for this model
      if (profile.modelEndpointMap) {
        const supportedTypes = profile.modelEndpointMap.get(modelId)
        // DeepSeek/Grok need "openai" endpoint type (for /v1/chat/completions)
        const isDeepSeekOrGrok = modelId.startsWith("deepseek-") || modelId.startsWith("grok-")
        if (isDeepSeekOrGrok && supportedTypes && !supportedTypes.includes("openai")) {
          console.log(`[newclaw-auth] Skipping key ${profile.key.slice(0, 8)}... for ${modelId}: missing 'openai' endpoint type`)
          continue
        }
      }

      candidates.push({ key: profile.key, ratio: profile.groupRatio })
    }

    candidates.sort((a, b) => a.ratio - b.ratio)

    const keys = candidates.map((c) => c.key)

    if (!keys.includes(fallbackKey)) {
      keys.push(fallbackKey)
    }

    return keys.length > 0 ? keys : [fallbackKey]
  }

  /**
   * Get profile for a specific key.
   */
  getProfileForKey(key: string): KeyProfile | undefined {
    return this.profiles.find((p) => p.key === key)
  }

  /**
   * Get all unique models across all keys, with their best (lowest ratio) profile.
   * Used for building the merged model config.
   */
  getAllModels(): Map<string, KeyProfile> {
    const result = new Map<string, KeyProfile>()

    for (const profile of this.profiles) {
      for (const modelId of profile.models) {
        const existing = result.get(modelId)
        if (!existing || profile.groupRatio < existing.groupRatio) {
          result.set(modelId, profile)
        }
      }
    }

    return result
  }

  /**
   * Get all profiles that can access a specific model.
   * Useful for dedup logic (same model, different groups).
   */
  getProfilesForModel(modelId: string): KeyProfile[] {
    return this.profiles.filter((p) => p.models.includes(modelId))
  }

  /**
   * Reset registry. Called before re-sync.
   */
  clear(): void {
    this.profiles = []
  }

  /**
   * Get all registered profiles.
   */
  getProfiles(): KeyProfile[] {
    return [...this.profiles]
  }
}

/** Module-level singleton */
export const keyRegistry = new KeyRegistry()
