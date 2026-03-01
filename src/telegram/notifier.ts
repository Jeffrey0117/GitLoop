import { env } from '../config/env.js'
import type { CodeReviewResult, GiteaPushEvent, GiteaPREvent } from '../types/index.js'
import type { PushDetected } from '../core/github-monitor.js'
import { storeReview } from '../store/review-store.js'

/** Send raw Markdown message (for features to use) */
export async function sendRawMessage(text: string): Promise<void> {
  await sendMessage(text)
}

interface InlineKeyboardButton {
  readonly text: string
  readonly callback_data: string
}

async function sendMessage(text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown'): Promise<void> {
  await sendMessageWithKeyboard(text, parseMode)
}

async function sendMessageWithKeyboard(
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown',
  buttons?: readonly InlineKeyboardButton[]
): Promise<void> {
  const url = `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`

  const payload: Record<string, unknown> = {
    chat_id: env.TELEGRAM_CHAT_ID,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
  }

  if (buttons && buttons.length > 0) {
    payload.reply_markup = {
      inline_keyboard: [buttons],
    }
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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
      const suggestion = i.suggestion ? `\n    \u{1F4A1} _${escapeMarkdown(i.suggestion)}_` : ''
      return `  ${icon} \`${i.file}\`: ${escapeMarkdown(i.message)}${suggestion}`
    })
    .join('\n')

  const text = [
    `${statusEmoji} *AI 審查* \u2014 \`${repo}\` (\`${commit.slice(0, 7)}\`)`,
    '',
    escapeMarkdown(result.summary),
    '',
    criticalCount > 0 ? `\u{1F534} ${criticalCount} 個嚴重問題` : '',
    highCount > 0 ? `\u{1F7E0} ${highCount} 個高風險` : '',
    '',
    issueLines || '  _沒有發現問題_',
  ].filter(Boolean).join('\n')

  if (result.issues.length > 0) {
    const reviewId = storeReview(repo, commit, result)
    const buttons: InlineKeyboardButton[] = [
      { text: '\u{1F4CB} 建立 Issue', callback_data: `issue:${reviewId}` },
      { text: '\u{1F527} 自動修復', callback_data: `fix:${reviewId}` },
    ]
    await sendMessageWithKeyboard(text, 'Markdown', buttons)
  } else {
    await sendMessage(text)
  }
}

/** Notify GitLoop startup */
export async function notifyStartup(repoCount: number, aiProvider: string): Promise<void> {
  const aiLine = aiProvider === 'off'
    ? '\u{1F916} AI 審查：關閉'
    : `\u{1F916} AI 審查：開啟 (${aiProvider})`

  const text = [
    `\u{1F504} *GitLoop* 已啟動`,
    `監控 ${repoCount} 個 repos`,
    `每 ${env.GITHUB_POLL_INTERVAL} 秒輪詢`,
    aiLine,
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
