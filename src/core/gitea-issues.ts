import { giteaFetch } from './gitea-client.js'
import { env } from '../config/env.js'
import type { GiteaIssue, ReviewIssue } from '../types/index.js'

interface CreateIssueParams {
  readonly owner: string
  readonly repo: string
  readonly title: string
  readonly body: string
  readonly labels?: readonly string[]
}

/** Create a single issue on Gitea */
export async function createIssue(params: CreateIssueParams): Promise<GiteaIssue> {
  const { owner, repo, title, body } = params
  return giteaFetch<GiteaIssue>(`/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: { title, body },
  })
}

interface CreateIssuesResult {
  readonly created: readonly GiteaIssue[]
  readonly count: number
}

/** Extract repo name from full_name (e.g. "jeffrey/MyApp" → "MyApp") */
function repoNameFrom(fullName: string): string {
  const parts = fullName.split('/')
  return parts[parts.length - 1] ?? fullName
}

/**
 * Create issues from AI review results.
 * - critical/high → one issue each
 * - medium/low → merged into a single issue
 */
export async function createIssuesFromReview(
  giteaRepo: string,
  commit: string,
  issues: readonly ReviewIssue[]
): Promise<CreateIssuesResult> {
  const owner = env.GITEA_OWNER
  const repo = repoNameFrom(giteaRepo)
  const created: GiteaIssue[] = []

  const critical = issues.filter(i => i.severity === 'critical')
  const high = issues.filter(i => i.severity === 'high')
  const lower = issues.filter(i => i.severity === 'medium' || i.severity === 'low')

  // Critical: one issue each
  for (const issue of critical) {
    const title = `🔴 嚴重問題：${issue.file} — ${truncate(issue.message, 60)}`
    const body = formatIssueBody(commit, issue)
    try {
      const result = await createIssue({ owner, repo, title, body })
      created.push(result)
    } catch (error) {
      console.error(`[gitea-issues] Failed to create critical issue:`, error)
    }
  }

  // High: one issue each
  for (const issue of high) {
    const title = `🟠 高風險：${issue.file} — ${truncate(issue.message, 60)}`
    const body = formatIssueBody(commit, issue)
    try {
      const result = await createIssue({ owner, repo, title, body })
      created.push(result)
    } catch (error) {
      console.error(`[gitea-issues] Failed to create high issue:`, error)
    }
  }

  // Medium + Low: merged into one
  if (lower.length > 0) {
    const title = `🟡 AI 審查：${lower.length} 個中低風險問題 (${commit.slice(0, 7)})`
    const body = formatMergedIssueBody(commit, lower)
    try {
      const result = await createIssue({ owner, repo, title, body })
      created.push(result)
    } catch (error) {
      console.error(`[gitea-issues] Failed to create merged issue:`, error)
    }
  }

  return { created, count: created.length }
}

function formatIssueBody(commit: string, issue: ReviewIssue): string {
  const lines = [
    `## AI 審查發現`,
    '',
    `**Commit**: \`${commit.slice(0, 7)}\``,
    `**嚴重度**: ${severityLabel(issue.severity)}`,
    `**檔案**: \`${issue.file}\`${issue.line ? ` (第 ${issue.line} 行)` : ''}`,
    '',
    `### 問題描述`,
    issue.message,
  ]

  if (issue.suggestion) {
    lines.push('', `### 建議修復`, issue.suggestion)
  }

  lines.push('', '---', '_此 issue 由 GitLoop AI 審查自動建立_')
  return lines.join('\n')
}

function formatMergedIssueBody(commit: string, issues: readonly ReviewIssue[]): string {
  const lines = [
    `## AI 審查發現`,
    '',
    `**Commit**: \`${commit.slice(0, 7)}\``,
    `**問題數**: ${issues.length}`,
    '',
  ]

  for (const issue of issues) {
    lines.push(
      `### ${severityLabel(issue.severity)} \`${issue.file}\`${issue.line ? ` (第 ${issue.line} 行)` : ''}`,
      issue.message,
      issue.suggestion ? `\n> 💡 ${issue.suggestion}` : '',
      ''
    )
  }

  lines.push('---', '_此 issue 由 GitLoop AI 審查自動建立_')
  return lines.join('\n')
}

function severityLabel(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴 嚴重'
    case 'high': return '🟠 高'
    case 'medium': return '🟡 中'
    case 'low': return '🟢 低'
    default: return severity
  }
}

/** Add a comment to an existing issue */
export async function commentOnIssue(
  giteaRepo: string,
  issueNumber: number,
  body: string
): Promise<void> {
  const owner = env.GITEA_OWNER
  const repo = repoNameFrom(giteaRepo)
  await giteaFetch(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    body: { body },
  })
}

/** Close an issue */
export async function closeIssue(
  giteaRepo: string,
  issueNumber: number
): Promise<void> {
  const owner = env.GITEA_OWNER
  const repo = repoNameFrom(giteaRepo)
  await giteaFetch(`/repos/${owner}/${repo}/issues/${issueNumber}`, {
    method: 'PATCH',
    body: { state: 'closed' },
  })
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen - 1)}…`
}
