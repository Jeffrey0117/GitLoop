import { env } from '../config/env.js'
import type { GiteaPushEvent, GiteaPREvent, CodeReviewResult } from '../types/index.js'

const BOT_TOKEN = env.TELEGRAM_BOT_TOKEN
const CHAT_ID = env.TELEGRAM_CHAT_ID

async function sendMessage(text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: parseMode,
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

/** Notify on push event */
export async function notifyPush(event: GiteaPushEvent): Promise<void> {
  const repo = event.repository.full_name
  const branch = event.ref.replace('refs/heads/', '')
  const pusher = event.pusher.full_name || event.pusher.login
  const commitCount = event.commits.length

  const commitLines = event.commits
    .slice(0, 5)
    .map(c => `  \`${c.sha.slice(0, 7)}\` ${c.message.split('\n')[0]}`)
    .join('\n')

  const more = commitCount > 5 ? `\n  _...and ${commitCount - 5} more_` : ''

  const text = [
    `*\u{1F4E6} Push* to \`${repo}\` (\`${branch}\`)`,
    `by ${pusher} \u2014 ${commitCount} commit${commitCount > 1 ? 's' : ''}`,
    '',
    commitLines + more,
    '',
    `[View diff](${event.compare_url})`,
  ].join('\n')

  await sendMessage(text)
}

/** Notify on pull request event */
export async function notifyPR(event: GiteaPREvent): Promise<void> {
  const pr = event.pull_request
  const repo = event.repository.full_name

  const emoji = {
    opened: '\u{1F7E2}',
    closed: '\u{1F534}',
    reopened: '\u{1F7E1}',
    edited: '\u{270F}\u{FE0F}',
    synchronized: '\u{1F504}',
  }[event.action] ?? '\u{1F4CB}'

  const text = [
    `${emoji} *PR #${event.number}* ${event.action} in \`${repo}\``,
    `*${pr.title}*`,
    `by ${pr.user.login} \u2014 \`${pr.head.ref}\` \u2192 \`${pr.base.ref}\``,
    '',
    `[View PR](${pr.html_url})`,
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
      const icon = i.severity === 'critical' ? '\u{1F534}' : i.severity === 'high' ? '\u{1F7E0}' : '\u{1F7E1}'
      return `  ${icon} \`${i.file}\`: ${i.message}`
    })
    .join('\n')

  const text = [
    `${statusEmoji} *AI Review* for \`${repo}\` (\`${commit.slice(0, 7)}\`)`,
    '',
    result.summary,
    '',
    criticalCount > 0 ? `\u{1F534} ${criticalCount} critical` : '',
    highCount > 0 ? `\u{1F7E0} ${highCount} high` : '',
    '',
    issueLines || '  _No issues found_',
  ].filter(Boolean).join('\n')

  await sendMessage(text)
}

/** Notify deploy trigger */
export async function notifyDeployTrigger(
  repo: string,
  branch: string,
  commit: string
): Promise<void> {
  const text = [
    `\u{1F680} *Deploy triggered* for \`${repo}\``,
    `Branch: \`${branch}\``,
    `Commit: \`${commit.slice(0, 7)}\``,
    '',
    `\u{23F3} CloudPipe deploying...`,
  ].join('\n')

  await sendMessage(text)
}
