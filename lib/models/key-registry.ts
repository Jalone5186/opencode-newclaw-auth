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
  private modelEndpointMaps: Map<string, Map<string, string[]>> = new Map()

  /**
   * Register a key profile.
   */
  register(profile: KeyProfile): void {
    this.profiles.push(profile)
    // Store modelEndpointMap in memory (not serialized to JSON)
    if (profile.modelEndpointMap) {
      this.modelEndpointMaps.set(profile.key, profile.modelEndpointMap)
    }
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
   * Returns ALL keys that have the model (no endpoint type filtering).
   * Endpoint type compatibility is checked at request time in the fetch interceptor.
   * This enables proper Key rotation: if first Key fails, try second Key.
   */
  selectKeysForModel(modelId: string, fallbackKey: string): string[] {
    const candidates: { key: string; ratio: number }[] = []

    for (const profile of this.profiles) {
      if (!profile.models.includes(modelId)) continue
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
   * Check if a key supports a specific endpoint type for a model.
   * Used by fetch interceptor to validate Key compatibility before sending request.
   */
  supportsEndpointType(key: string, modelId: string, endpointType: string): boolean {
    const endpointMap = this.modelEndpointMaps.get(key)
    if (!endpointMap) return true // No endpoint map = assume compatible
    
    const supportedTypes = endpointMap.get(modelId)
    if (!supportedTypes) return true // Model not in map = assume compatible
    
    return supportedTypes.includes(endpointType)
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
    this.modelEndpointMaps.clear()
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
