import type { CodeReviewResult, ReviewIssue } from '../types/index.js'

const SECRET_PATTERNS: ReadonlyArray<{ readonly pattern: RegExp; readonly name: string }> = [
  { pattern: /['"]sk-[a-zA-Z0-9]{20,}['"]/, name: 'OpenAI API key' },
  { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, name: 'GitHub token' },
  { pattern: /['"]AKIA[A-Z0-9]{16}['"]/, name: 'AWS access key' },
  { pattern: /password\s*[:=]\s*['"][^'"]{4,}['"]/, name: 'Hardcoded password' },
]

/** Free pattern-based review — no AI needed */
export function basicReview(diff: string): CodeReviewResult {
  const issues: ReviewIssue[] = []
  const lines = diff.split('\n')

  let currentFile = 'unknown'

  for (const line of lines) {
    const fileMatch = line.match(/^\+\+\+ b\/(.+)/)
    if (fileMatch) {
      currentFile = fileMatch[1]
      continue
    }

    if (!line.startsWith('+') || line.startsWith('+++')) continue

    for (const { pattern, name } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        issues.push({ file: currentFile, message: `Potential ${name} detected` })
      }
    }
  }

  const consoleLogCount = lines.filter(l =>
    l.startsWith('+') && /console\.log\(/.test(l)
  ).length
  if (consoleLogCount > 0) {
    issues.push({ file: 'multiple', message: `${consoleLogCount} console.log statement(s) added` })
  }

  const addedLines = lines.filter(l => l.startsWith('+') && !l.startsWith('+++')).length
  if (addedLines > 500) {
    issues.push({ file: 'multiple', message: `Large change: ${addedLines}+ lines added` })
  }

  return {
    summary: issues.length === 0
      ? 'No issues detected.'
      : `Found ${issues.length} issue(s) via pattern analysis.`,
    issues,
    approved: issues.length === 0,
  }
}
