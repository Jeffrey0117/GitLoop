import { execSync } from 'node:child_process'
import type { AIProvider, AIProviderConfig } from '../types.js'
import type { CodeReviewResult } from '../../types/index.js'
import { buildReviewPrompt, parseReviewOutput } from '../review-prompt.js'

/** Gemini CLI provider — default, high free tier */
export function createGeminiProvider(config: AIProviderConfig): AIProvider {
  const model = config.model ?? 'gemini-2.0-flash'

  return {
    name: 'gemini',

    isAvailable(): boolean {
      try {
        execSync('gemini --version', { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
        return true
      } catch {
        return false
      }
    },

    review(diff: string): CodeReviewResult | null {
      const prompt = buildReviewPrompt(diff)

      try {
        const output = execSync(
          `gemini -m ${model} -p -`,
          {
            input: prompt,
            encoding: 'utf-8',
            windowsHide: true,
            timeout: config.timeout,
          }
        ).trim()

        return parseReviewOutput(output)
      } catch (error) {
        console.error('[ai:gemini] Review failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },
  }
}
