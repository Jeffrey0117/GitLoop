import type { CodeReviewResult } from '../types/index.js'

/** Supported AI provider identifiers */
export type AIProviderName = 'gemini' | 'qwen' | 'claude' | 'basic'

/** AI provider interface — all providers must implement this */
export interface AIProvider {
  readonly name: AIProviderName
  /** Check if this provider is available (CLI installed, etc.) */
  isAvailable(): boolean
  /** Review a git diff and return structured results */
  review(diff: string): CodeReviewResult | null
  /** Run a raw prompt and return the raw output string (for learn mode, etc.) */
  reviewRaw?(prompt: string): string | null
}

/** Provider configuration from environment */
export interface AIProviderConfig {
  readonly provider: AIProviderName
  /** Model override (e.g., 'gemini-2.0-flash', 'qwen2.5-coder') */
  readonly model?: string
  /** Timeout in milliseconds */
  readonly timeout: number
}
