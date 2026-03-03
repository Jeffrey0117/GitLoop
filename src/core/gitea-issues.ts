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
 * Create a single issue from AI review results.
 * All issues are merged into one Gitea issue.
 */
export async function createIssuesFromReview(
  giteaRepo: string,
  commit: string,
  issues: readonly ReviewIssue[]
): Promise<CreateIssuesResult> {
  const owner = env.GITEA_OWNER
  const repo = repoNameFrom(giteaRepo)
  const created: GiteaIssue[] = []

  if (issues.length === 0) return { created, count: 0 }

  const title = `🔍 AI 審查：${issues.length} 個問題 (${commit.slice(0, 7)})`
  const body = formatMergedIssueBody(commit, issues)
  try {
    const result = await createIssue({ owner, repo, title, body })
    created.push(result)
  } catch (error) {
    console.error(`[gitea-issues] Failed to create issue:`, error)
  }

  return { created, count: created.length }
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
      `### \`${issue.file}\`${issue.line ? ` (第 ${issue.line} 行)` : ''}`,
      issue.message,
      issue.suggestion ? `\n> 💡 ${issue.suggestion}` : '',
      ''
    )
  }

  lines.push('---', '_此 issue 由 GitLoop AI 審查自動建立_')
  return lines.join('\n')
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
