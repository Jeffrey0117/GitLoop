import type { AIProvider, AIProviderConfig, AIProviderName } from './types.js'
import { createGeminiProvider } from './providers/gemini.js'
import { createQwenProvider } from './providers/qwen.js'
import { createClaudeProvider } from './providers/claude.js'

const providerConstructors: Record<AIProviderName, (config: AIProviderConfig) => AIProvider> = {
  gemini: createGeminiProvider,
  qwen: createQwenProvider,
  claude: createClaudeProvider,
  basic: () => ({ name: 'basic', isAvailable: () => true, review: () => null }),
}

/** Fallback order when preferred provider is unavailable */
const FALLBACK_ORDER: readonly AIProviderName[] = ['gemini', 'qwen', 'claude'] as const

/**
 * Create an AI provider with automatic fallback.
 * Tries preferred provider first, then falls back through the chain.
 * Returns 'basic' (pattern-only) if nothing is available.
 */
export function createProvider(config: AIProviderConfig): AIProvider {
  // Try preferred provider first
  const preferred = providerConstructors[config.provider](config)
  if (config.provider === 'basic' || preferred.isAvailable()) {
    console.error(`[ai] Using provider: ${config.provider}`)
    return preferred
  }

  console.error(`[ai] Provider '${config.provider}' not available, trying fallbacks...`)

  // Try fallback chain
  for (const name of FALLBACK_ORDER) {
    if (name === config.provider) continue
    const fallback = providerConstructors[name]({ ...config, provider: name })
    if (fallback.isAvailable()) {
      console.error(`[ai] Fallback to provider: ${name}`)
      return fallback
    }
  }

  // Nothing available — use basic pattern matching
  console.error('[ai] No AI CLI available, using basic pattern review only')
  return providerConstructors.basic(config)
}
