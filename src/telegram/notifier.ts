import { env } from '../config/env.js'
import type { CodeReviewResult } from '../types/index.js'
import type { PushDetected } from '../core/github-monitor.js'

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

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}
