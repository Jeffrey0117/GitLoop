import type { CodeReviewResult, ReviewIssue } from '../types/index.js'

/** Max diff characters to send to any AI provider */
export const MAX_DIFF_LENGTH = 20000

/** Build the standard review prompt for any AI CLI */
export function buildReviewPrompt(diff: string): string {
  return [
    'Review this git diff. Respond ONLY with a JSON object (no markdown, no explanation):',
    '{"summary":"brief summary","issues":[{"severity":"critical|high|medium|low","file":"name","message":"issue"}],"approved":true/false}',
    'Focus on: security (exposed secrets, injection), breaking changes, bugs.',
    'If no issues, return empty issues and approved:true.',
    '',
    diff.slice(0, MAX_DIFF_LENGTH),
  ].join('\n')
}

/** Parse raw AI output into a structured CodeReviewResult */
export function parseReviewOutput(raw: string): CodeReviewResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { summary: raw.slice(0, 200), issues: [], approved: true }
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string
      issues?: ReviewIssue[]
      approved?: boolean
    }

    return {
      summary: parsed.summary ?? 'No summary',
      issues: (parsed.issues ?? []).map(i => ({
        severity: i.severity ?? 'low',
        file: i.file ?? 'unknown',
        line: i.line,
        message: i.message ?? '',
        suggestion: i.suggestion,
      })),
      approved: parsed.approved ?? true,
    }
  } catch {
    return { summary: 'Failed to parse review result.', issues: [], approved: true }
  }
}
