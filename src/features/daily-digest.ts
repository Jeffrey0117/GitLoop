import { execSync } from 'node:child_process'
import { env } from '../config/env.js'
import { getMonitoredRepos } from '../core/github-monitor.js'

interface RepoDigest {
  readonly repo: string
  readonly commitCount: number
  readonly authors: readonly string[]
  readonly latestCommit: string
  readonly latestMessage: string
}

function getRepoDigest(repo: string, since: string): RepoDigest | null {
  try {
    const raw = execSync(
      `gh api "repos/${repo}/commits?since=${since}&per_page=100" --jq ".[].commit | .author.name + \"|||\" + .message"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 15000 }
    ).trim()

    if (!raw) return null

    const lines = raw.split('\n').filter(Boolean)
    const authors = [...new Set(lines.map(l => l.split('|||')[0]))]
    const messages = lines.map(l => l.split('|||')[1]?.split('\n')[0] ?? '')

    return {
      repo,
      commitCount: lines.length,
      authors,
      latestCommit: '',
      latestMessage: messages[0] ?? '',
    }
  } catch {
    return null
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

export function generateDailyDigest(): string {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const since = yesterday.toISOString()

  const repos = getMonitoredRepos()
  const digests: RepoDigest[] = []

  for (const repo of repos) {
    const digest = getRepoDigest(repo, since)
    if (digest && digest.commitCount > 0) {
      digests.push(digest)
    }
  }

  if (digests.length === 0) {
    return [
      `*\u{1F4CA} Daily Digest*`,
      `_${new Date().toLocaleDateString('zh-TW')}_`,
      '',
      '\u{1F634} No activity in the last 24 hours',
    ].join('\n')
  }

  const totalCommits = digests.reduce((sum, d) => sum + d.commitCount, 0)
  const allAuthors = [...new Set(digests.flatMap(d => d.authors))]

  const repoLines = digests.map(d => {
    const shortName = d.repo.split('/')[1] ?? d.repo
    return `  \`${escapeMarkdown(shortName)}\`: ${d.commitCount} commits \u2014 _${escapeMarkdown(d.latestMessage)}_`
  }).join('\n')

  return [
    `*\u{1F4CA} Daily Digest*`,
    `_${new Date().toLocaleDateString('zh-TW')}_`,
    '',
    `\u{1F4DD} ${totalCommits} commits across ${digests.length} repos`,
    `\u{1F464} ${allAuthors.map(a => escapeMarkdown(a)).join(', ')}`,
    '',
    repoLines,
  ].join('\n')
}

/** Schedule daily digest at specified hour (0-23) */
export function scheduleDailyDigest(
  sendFn: (text: string) => Promise<void>,
  hour = 9,
): void {
  function scheduleNext(): void {
    const now = new Date()
    const next = new Date(now)
    next.setHours(hour, 0, 0, 0)

    if (next <= now) {
      next.setDate(next.getDate() + 1)
    }

    const delayMs = next.getTime() - now.getTime()
    console.error(`[digest] Next daily digest at ${next.toLocaleString('zh-TW')} (${Math.round(delayMs / 60000)}m)`)

    setTimeout(async () => {
      try {
        const digest = generateDailyDigest()
        await sendFn(digest)
      } catch (error) {
        console.error('[digest] Failed to send:', error)
      }
      scheduleNext()
    }, delayMs)
  }

  scheduleNext()
}
