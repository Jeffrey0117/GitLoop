import { env } from '../config/env.js'
import type { CodeReviewResult, GiteaPushEvent, GiteaPREvent } from '../types/index.js'
import type { PushDetected } from '../core/github-monitor.js'

/** Send raw Markdown message (for features to use) */
export async function sendRawMessage(text: string): Promise<void> {
  await sendMessage(text)
}

async function sendMessage(text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[telegram] Send failed (${res.status}): ${body}`)
    }
  } catch (error) {
    console.error('[telegram] Send error:', error)
  }
}

/** Notify on push detection */
export async function notifyPush(push: PushDetected): Promise<void> {
  const commitCount = push.commits.length

  const commitLines = push.commits
    .slice(0, 5)
    .map(c => `  \`${c.sha.slice(0, 7)}\` ${escapeMarkdown(c.message)}`)
    .join('\n')

  const more = commitCount > 5 ? `\n  _...and ${commitCount - 5} more_` : ''

  const text = [
    `*\u{1F4E6} Push* to \`${push.repo}\` (\`${push.branch}\`)`,
    `${commitCount} commit${commitCount > 1 ? 's' : ''}`,
    '',
    commitLines + more,
    '',
    `[View diff](${push.compareUrl})`,
  ].join('\n')

  await sendMessage(text)
}

/** Notify AI code review result */
export async function notifyReview(
  repo: string,
  commit: string,
  result: CodeReviewResult
): Promise<void> {
  const statusEmoji = result.approved ? '\u{2705}' : '\u{26A0}\u{FE0F}'
  const criticalCount = result.issues.filter(i => i.severity === 'critical').length
  const highCount = result.issues.filter(i => i.severity === 'high').length

  const issueLines = result.issues
    .slice(0, 5)
    .map(i => {
      const icon = i.severity === 'critical' ? '\u{1F534}'
        : i.severity === 'high' ? '\u{1F7E0}'
        : '\u{1F7E1}'
      return `  ${icon} \`${i.file}\`: ${escapeMarkdown(i.message)}`
    })
    .join('\n')

  const text = [
    `${statusEmoji} *AI Review* \u2014 \`${repo}\` (\`${commit.slice(0, 7)}\`)`,
    '',
    escapeMarkdown(result.summary),
    '',
    criticalCount > 0 ? `\u{1F534} ${criticalCount} critical` : '',
    highCount > 0 ? `\u{1F7E0} ${highCount} high` : '',
    '',
    issueLines || '  _No issues found_',
  ].filter(Boolean).join('\n')

  await sendMessage(text)
}

/** Notify GitLoop startup */
export async function notifyStartup(repoCount: number): Promise<void> {
  const text = [
    `\u{1F504} *GitLoop* started`,
    `Monitoring ${repoCount} repos`,
    `Polling every ${env.GITHUB_POLL_INTERVAL}s`,
    env.REVIEW_ENABLED ? '\u{1F916} AI review: ON' : '\u{1F916} AI review: OFF',
  ].join('\n')

  await sendMessage(text)
}

/** Notify on Gitea push webhook */
export async function notifyGiteaPush(event: GiteaPushEvent): Promise<void> {
  const repo = event.repository.full_name
  const branch = event.ref.replace('refs/heads/', '')
  const commitCount = event.commits.length

  if (commitCount === 0) return

  const commitLines = event.commits
    .slice(0, 5)
    .map(c => `  \`${c.sha.slice(0, 7)}\` ${escapeMarkdown(c.message)}`)
    .join('\n')

  const more = commitCount > 5 ? `\n  _...and ${commitCount - 5} more_` : ''

  const text = [
    `*\u{1F4E6} Gitea Push* \u2014 \`${escapeMarkdown(repo)}\` (\`${escapeMarkdown(branch)}\`)`,
    `${commitCount} commit${commitCount > 1 ? 's' : ''}`,
    '',
    commitLines + more,
    '',
    event.compare_url ? `[View diff](${event.compare_url})` : '',
  ].filter(Boolean).join('\n')

  await sendMessage(text)
}

/** Notify on Gitea PR event */
export async function notifyGiteaPR(event: GiteaPREvent): Promise<void> {
  const repo = event.repository.full_name
  const pr = event.pull_request
  const actionEmoji = event.action === 'opened' ? '\u{1F7E2}'
    : event.action === 'closed' ? '\u{1F534}'
    : '\u{1F7E1}'

  const text = [
    `${actionEmoji} *PR ${event.action}* \u2014 \`${escapeMarkdown(repo)}\``,
    `*#${event.number}* ${escapeMarkdown(pr.title)}`,
    `\`${escapeMarkdown(pr.head.ref)}\` \u2192 \`${escapeMarkdown(pr.base.ref)}\``,
    '',
    `[View PR](${pr.html_url})`,
  ].join('\n')

  await sendMessage(text)
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}
