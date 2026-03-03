import { getCommitDiff } from '../core/github-monitor.js'
import { env } from '../config/env.js'
import { createProvider } from './provider-factory.js'
import { basicReview } from './basic-review.js'
import { buildLearnPrompt, parseLearnOutput } from './learn-prompt.js'
import type { CodeReviewResult, LearnInsight } from '../types/index.js'

/** Lazily initialized AI provider */
let provider: ReturnType<typeof createProvider> | null = null

function getProvider() {
  if (!provider) {
    provider = createProvider({
      provider: env.AI_PROVIDER,
      model: env.AI_MODEL,
      timeout: env.AI_TIMEOUT,
    })
  }
  return provider
}

/** Get the active AI provider name (triggers lazy init) */
export function getActiveProviderName(): string {
  return getProvider().name
}

/**
 * AI-powered code review with configurable provider.
 * Default: Gemini (free) → Qwen (local) → Claude (precious) → basic patterns.
 */
export async function reviewCommit(
  repo: string,
  sha: string
): Promise<CodeReviewResult | null> {
  try {
    const diff = getCommitDiff(repo, sha)

    if (!diff || diff.length < 50) {
      return { summary: 'Trivial change, skipped review.', issues: [], approved: true }
    }
    if (diff.length > 50000) {
      return { summary: 'Diff too large for AI review.', issues: [], approved: true }
    }

    // Try configured AI provider
    const aiResult = getProvider().review(diff)
    if (aiResult) return aiResult

    // Fallback: basic pattern-based review (always free)
    return basicReview(diff)
  } catch (error) {
    console.error(`[ai] Review failed for ${repo}@${sha}:`, error)
    return null
  }
}

/**
 * Generate learning insights from a commit diff.
 * Uses the same AI provider as code review, with a teaching-oriented prompt.
 * Gracefully returns empty array on failure — never blocks the main flow.
 */
export function generateLearnInsights(
  repo: string,
  sha: string,
  reviewSummary: string
): readonly LearnInsight[] {
  try {
    const diff = getCommitDiff(repo, sha)
    if (!diff || diff.length < 100) return []

    const prompt = buildLearnPrompt(diff, reviewSummary)
    const provider = getProvider()

    // Reuse the provider's internal execution to run a custom prompt
    const output = provider.reviewRaw?.(prompt)
    if (!output) return []

    return parseLearnOutput(output)
  } catch (error) {
    console.error(`[ai] Learn insights failed for ${repo}@${sha}:`, error)
    return []
  }
}
