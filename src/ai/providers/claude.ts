import { execSync } from 'node:child_process'
import type { AIProvider, AIProviderConfig } from '../types.js'
import type { CodeReviewResult } from '../../types/index.js'
import { buildReviewPrompt, parseReviewOutput } from '../review-prompt.js'

/** Claude CLI provider — high quality, precious tokens */
export function createClaudeProvider(config: AIProviderConfig): AIProvider {
  const model = config.model ?? 'haiku'

  return {
    name: 'claude',

    isAvailable(): boolean {
      try {
        execSync('claude --version', { encoding: 'utf-8', windowsHide: true, timeout: 5000 })
        return true
      } catch {
        return false
      }
    },

    review(diff: string): CodeReviewResult | null {
      const prompt = buildReviewPrompt(diff)

      try {
        const output = execSync(
          `claude --output-format text --model ${model} -p -`,
          {
            input: prompt,
            encoding: 'utf-8',
            windowsHide: true,
            timeout: config.timeout,
          }
        ).trim()

        return parseReviewOutput(output)
      } catch (error) {
        console.error('[ai:claude] Review failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },

    reviewRaw(prompt: string): string | null {
      try {
        return execSync(
          `claude --output-format text --model ${model} -p -`,
          {
            input: prompt,
            encoding: 'utf-8',
            windowsHide: true,
            timeout: config.timeout,
          }
        ).trim()
      } catch (error) {
        console.error('[ai:claude] Raw prompt failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },
  }
}
