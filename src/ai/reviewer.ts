import { env } from '../config/env.js'
import { getCommitDiff } from '../core/gitea-client.js'
import type { CodeReviewResult, ReviewIssue } from '../types/index.js'

/** AI-powered code review using Claude API */
export async function reviewCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<CodeReviewResult | null> {
  if (!env.CLAUDE_API_KEY) return null

  try {
    const diff = await getCommitDiff(owner, repo, sha)

    // Skip trivial commits (too small or too large)
    if (diff.length < 50) {
      return { summary: 'Trivial change, skipped review.', issues: [], approved: true }
    }
    if (diff.length > 50000) {
      return { summary: 'Diff too large for review. Please review manually.', issues: [], approved: false }
    }

    const prompt = buildReviewPrompt(diff)
    const result = await callClaude(prompt)
    return parseReviewResult(result)
  } catch (error) {
    console.error(`[ai] Review failed for ${sha}:`, error)
    return null
  }
}

function buildReviewPrompt(diff: string): string {
  return [
    'You are a senior code reviewer. Analyze this git diff and provide a code review.',
    'Focus on:',
    '1. Security issues (API key leaks, injection, XSS)',
    '2. Breaking changes',
    '3. Bugs or logic errors',
    '4. Performance concerns',
    '',
    'Respond in JSON format:',
    '{',
    '  "summary": "Brief summary of changes",',
    '  "issues": [',
    '    {',
    '      "severity": "critical|high|medium|low",',
    '      "file": "filename",',
    '      "line": 42,',
    '      "message": "Description of the issue",',
    '      "suggestion": "How to fix it"',
    '    }',
    '  ],',
    '  "approved": true/false',
    '}',
    '',
    'If no significant issues found, return empty issues array and approved: true.',
    '',
    '--- DIFF START ---',
    diff.slice(0, 30000),
    '--- DIFF END ---',
  ].join('\n')
}

async function callClaude(prompt: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.CLAUDE_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Claude API error (${res.status}): ${text}`)
  }

  const data = await res.json() as { content: Array<{ text: string }> }
  return data.content[0]?.text ?? ''
}

function parseReviewResult(raw: string): CodeReviewResult {
  try {
    // Extract JSON from response (may be wrapped in markdown)
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
