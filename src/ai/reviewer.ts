import { getCommitDiff } from '../core/github-monitor.js'
import { env } from '../config/env.js'
import { createProvider } from './provider-factory.js'
import { basicReview } from './basic-review.js'
import { buildLearnPrompt, parseLearnOutput } from './learn-prompt.js'
import type { CodeReviewResult, LearnInsight } from '../types/index.js'

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

export function getActiveProviderName(): string {
  return getProvider().name
}

export async function reviewCommit(
  repo: string,
  sha: string
): Promise<CodeReviewResult | null> {
  try {
    const diff = await getCommitDiff(repo, sha)
    if (!diff || diff.length < 50) {
      return { summary: 'Trivial change, skipped review.', issues: [], approved: true }
    }
    if (diff.length > 50000) {
      return { summary: 'Diff too large for AI review.', issues: [], approved: true }
    }
    const aiResult = getProvider().review(diff)
    if (aiResult) return aiResult
    return basicReview(diff)
  } catch (error) {
    console.error(`[ai] Review failed for ${repo}@${sha}:`, error)
    return null
  }
}

export async function generateLearnInsights(
  repo: string,
  sha: string,
  reviewSummary: string
): Promise<readonly LearnInsight[]> {
  try {
    const diff = await getCommitDiff(repo, sha)
    if (!diff || diff.length < 100) return []
    const prompt = buildLearnPrompt(diff, reviewSummary)
    const provider = getProvider()
    const output = provider.reviewRaw?.(prompt)
    if (!output) return []
    return parseLearnOutput(output)
  } catch (error) {
    console.error(`[ai] Learn insights failed for ${repo}@${sha}:`, error)
    return []
  }
}
