import { execSync } from 'node:child_process'
import { join } from 'node:path'
import type { AIProvider, AIProviderConfig } from '../types.js'
import type { CodeReviewResult } from '../../types/index.js'
import { buildReviewPrompt, parseReviewOutput } from '../review-prompt.js'

/** Resolve gemini CLI path — PM2 may not have npm global in PATH */
const GEMINI_CMD = join(process.env.APPDATA ?? '', 'npm', 'gemini.cmd')

function runGemini(args: string, input?: string, timeout = 5000): string {
  return execSync(`"${GEMINI_CMD}" ${args}`, {
    input,
    encoding: 'utf-8' as const,
    windowsHide: true,
    shell: 'cmd.exe',
    timeout,
  }).trim()
}

/** Gemini CLI provider — default, high free tier */
export function createGeminiProvider(config: AIProviderConfig): AIProvider {
  const model = config.model ?? 'gemini-2.0-flash'

  return {
    name: 'gemini',

    isAvailable(): boolean {
      try {
        runGemini('--version')
        return true
      } catch {
        return false
      }
    },

    review(diff: string): CodeReviewResult | null {
      const prompt = buildReviewPrompt(diff)

      try {
        const output = runGemini(`-m ${model} -p -`, prompt, config.timeout)
        return parseReviewOutput(output)
      } catch (error) {
        console.error('[ai:gemini] Review failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },

    reviewRaw(prompt: string): string | null {
      try {
        return runGemini(`-m ${model} -p -`, prompt, config.timeout)
      } catch (error) {
        console.error('[ai:gemini] Raw prompt failed:', (error as Error).message?.slice(0, 100))
        return null
      }
    },
  }
}
