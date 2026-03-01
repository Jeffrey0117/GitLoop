import { execSync } from 'node:child_process'
import { getCommitDiff } from '../core/github-monitor.js'
import { env } from '../config/env.js'
import type { CodeReviewResult, ReviewIssue } from '../types/index.js'

/**
 * AI-powered code review using Claude CLI (zero API cost).
 * Falls back to basic pattern-based analysis if CLI unavailable.
 */
export async function reviewCommit(
  repo: string,
  sha: string
): Promise<CodeReviewResult | null> {
  if (!env.REVIEW_ENABLED) return null

  try {
    const diff = getCommitDiff(repo, sha)

    if (!diff || diff.length < 50) {
      return { summary: 'Trivial change, skipped review.', issues: [], approved: true }
    }
    if (diff.length > 50000) {
      return { summary: 'Diff too large for AI review.', issues: [], approved: true }
    }

    // Try Claude CLI first (zero cost)
    const cliResult = reviewWithClaudeCLI(diff)
    if (cliResult) return cliResult

    // Fallback: basic pattern-based review
    return basicReview(diff)
  } catch (error) {
    console.error(`[ai] Review failed for ${repo}@${sha}:`, error)
    return null
  }
}

/** Review using Claude CLI — zero cost, uses your existing auth */
function reviewWithClaudeCLI(diff: string): CodeReviewResult | null {
  const prompt = [
    'Review this git diff. Respond ONLY with a JSON object (no markdown, no explanation):',
    '{"summary":"brief summary","issues":[{"severity":"critical|high|medium|low","file":"name","message":"issue"}],"approved":true/false}',
    'Focus on: security (exposed secrets, injection), breaking changes, bugs.',
    'If no issues, return empty issues and approved:true.',
    '',
    diff.slice(0, 20000),
  ].join('\n')

  try {
    const output = execSync(
      'claude --output-format text --model haiku -p -',
      {
        input: prompt,
        encoding: 'utf-8',
        windowsHide: true,
        timeout: 60000,
      }
    ).trim()

    return parseReviewResult(output)
  } catch (error) {
    console.error('[ai] Claude CLI failed:', (error as Error).message?.slice(0, 100))
    return null
  }
}

/** Fallback: basic pattern-based review (no AI needed) */
function basicReview(diff: string): CodeReviewResult {
  const issues: ReviewIssue[] = []
  const lines = diff.split('\n')

  // Check for exposed secrets
  const secretPatterns: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /['"]sk-[a-zA-Z0-9]{20,}['"]/, name: 'OpenAI API key' },
    { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, name: 'GitHub token' },
    { pattern: /['"]AKIA[A-Z0-9]{16}['"]/, name: 'AWS access key' },
    { pattern: /password\s*[:=]\s*['"][^'"]{4,}['"]/, name: 'Hardcoded password' },
  ]

  let currentFile = 'unknown'

  for (const line of lines) {
    // Track current file
    const fileMatch = line.match(/^\+\+\+ b\/(.+)/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      continue
    }

    // Only check added lines
    if (!line.startsWith('+') || line.startsWith('+++')) continue

    for (const { pattern, name } of secretPatterns) {
      if (pattern.test(line)) {
        issues.push({
          severity: 'critical',
          file: currentFile,
          message: `Potential ${name} detected`,
        })
      }
    }
  }

  // Check for console.log
  const consoleLogCount = lines.filter(l =>
    l.startsWith('+') && /console\.log\(/.test(l)
  ).length
  if (consoleLogCount > 0) {
    issues.push({
      severity: 'low',
      file: 'multiple',
      message: `${consoleLogCount} console.log statement(s) added`,
    })
  }

  // Check for large changes
  const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
  if (addedLines > 500) {
    issues.push({
      severity: 'medium',
      file: 'multiple',
      message: `Large change: ${addedLines}+ lines added`,
    })
  }

  const hasCritical = issues.some(i => i.severity === 'critical')

  return {
    summary: issues.length === 0
      ? 'No issues detected.'
      : `Found ${issues.length} issue(s) via pattern analysis.`,
    issues,
    approved: !hasCritical,
  }
}

function parseReviewResult(raw: string): CodeReviewResult {
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
