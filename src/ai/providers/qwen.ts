import { execSync } from 'node:child_process'
import type { AIProvider, AIProviderConfig } from '../types.js'
import type { CodeReviewResult } from '../../types/index.js'
import { buildReviewPrompt, parseReviewOutput } from '../review-prompt.js'

/** Qwen CLI provider — local/free alternative */
export function createQwenProvider(config: AIProviderConfig): AIProvider {
  const model = config.model ?? 'qwen2.5-coder'

  return {
    name: 'qwen',

    isAvailable(): boolean {
      try {
        execSync('qwen --version', { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
        return true
      } catch {
        return false
      }
    },

    review(diff: string): CodeReviewResult | null {
      const prompt = buildReviewPrompt(diff)

      try {
        const output = execSync(
          `qwen -m ${model} -p -`,
          {
            input: prompt,
            encoding: 'utf-8',
            windowsHide: true,
            timeout: config.timeout,
          }
        ).trim()

        return parseReviewOutput(output)
      } catch (error) {
        console.error('[ai:qwen] Review failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },
  }
}
