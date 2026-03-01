import { Telegraf, type Context } from 'telegraf'
import { env } from '../config/env.js'
import { generateDailyDigest } from '../features/daily-digest.js'
import { generateDeployReport } from '../features/deploy-tracker.js'
import { getMonitoredRepos } from '../core/github-monitor.js'
import { execSync } from 'node:child_process'

let bot: Telegraf | null = null

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

function isAuthorized(ctx: Context): boolean {
  return String(ctx.chat?.id) === env.TELEGRAM_CHAT_ID
}

/** Start the GitLoop Telegram bot */
export function startBot(): void {
  bot = new Telegraf(env.TELEGRAM_BOT_TOKEN)

  // /start
  bot.start((ctx) => {
    if (!isAuthorized(ctx)) return
    ctx.reply(
      [
        '\u{1F504} *GitLoop* — Your Git command center',
        '',
        'Commands:',
        '/status \u2014 System overview',
        '/digest \u2014 24h activity summary',
        '/repos \u2014 List monitored repos',
        '/branches \u2014 Show branches per repo',
        '/deploy \u2014 Deploy drift report',
        '/health \u2014 Service health check',
      ].join('\n'),
      { parse_mode: 'Markdown' }
    )
  })

  // /status — overall system status
  bot.command('status', (ctx) => {
    if (!isAuthorized(ctx)) return
    const repos = getMonitoredRepos()
    const giteaOk = checkGiteaHealth()

    const lines = [
      `\u{1F504} *GitLoop Status*`,
      '',
      `\u{1F4E6} GitHub repos: ${repos.length}`,
      `\u{1F5C4}\u{FE0F} Gitea: ${!env.GITEA_URL ? '\u{2796} Not configured' : giteaOk ? '\u{2705} Online' : '\u{274C} Offline'}`,
      `\u{1F916} AI Review: ${env.REVIEW_ENABLED ? 'ON' : 'OFF'}`,
      `\u{23F1}\u{FE0F} Poll interval: ${env.GITHUB_POLL_INTERVAL}s`,
      `\u{1F310} Webhook: :${env.PORT}/webhook`,
    ]

    ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
  })

  // /digest — on-demand daily digest
  bot.command('digest', (ctx) => {
    if (!isAuthorized(ctx)) return
    try {
      const digest = generateDailyDigest()
      ctx.reply(digest, { parse_mode: 'Markdown' })
    } catch (error) {
      ctx.reply('\u{274C} Failed to generate digest')
    }
  })

  // /repos — list monitored repos
  bot.command('repos', (ctx) => {
    if (!isAuthorized(ctx)) return
    const repos = getMonitoredRepos()
    const lines = repos.map((r, i) => {
      const shortName = r.split('/')[1] ?? r
      return `  ${i + 1}\\. \`${escapeMarkdown(shortName)}\``
    })

    ctx.reply(
      [`*\u{1F4CB} Monitored Repos*`, '', ...lines].join('\n'),
      { parse_mode: 'Markdown' }
    )
  })

  // /branches — show branches per repo
  bot.command('branches', async (ctx) => {
    if (!isAuthorized(ctx)) return
    const repos = getMonitoredRepos()
    const lines: string[] = [`*\u{1F33F} Branches*`, '']

    for (const repo of repos) {
      try {
        const raw = execSync(
          `gh api "repos/${repo}/branches?per_page=20" --jq ".[].name"`,
          { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
        ).trim()

        const branches = raw ? raw.split('\n') : []
        const shortName = repo.split('/')[1] ?? repo
        lines.push(`\`${escapeMarkdown(shortName)}\`: ${branches.map(b => `\`${escapeMarkdown(b)}\``).join(', ')}`)
      } catch {
        const shortName = repo.split('/')[1] ?? repo
        lines.push(`\`${escapeMarkdown(shortName)}\`: _error_`)
      }
    }

    ctx.reply(lines.join('\n'), { parse_mode: 'Markdown' })
  })

  // /deploy — deploy drift report
  bot.command('deploy', (ctx) => {
    if (!isAuthorized(ctx)) return
    const repos = getMonitoredRepos()
    const report = generateDeployReport(repos)
    ctx.reply(report, { parse_mode: 'Markdown' })
  })

  // /health — quick health check
  bot.command('health', (ctx) => {
    if (!isAuthorized(ctx)) return
    const giteaOk = checkGiteaHealth()
    const webhookOk = true // we're running, so webhook is up

    ctx.reply(
      [
        `*\u{1FA7A} Health Check*`,
        '',
        `GitLoop: \u{2705}`,
        `Webhook: \u{2705} :${env.PORT}`,
        `Gitea: ${giteaOk ? '\u{2705}' : '\u{274C}'} ${env.GITEA_URL ?? 'not configured'}`,
      ].join('\n'),
      { parse_mode: 'Markdown' }
    )
  })

  bot.launch({ dropPendingUpdates: true })
    .then(() => console.error('[bot] GitLoop bot started'))
    .catch(err => console.error('[bot] Failed to start:', err))

  // Graceful shutdown
  process.once('SIGINT', () => bot?.stop('SIGINT'))
  process.once('SIGTERM', () => bot?.stop('SIGTERM'))
}

function checkGiteaHealth(): boolean {
  if (!env.GITEA_URL) return false
  try {
    execSync(`curl -s --max-time 3 ${env.GITEA_URL}/api/v1/version`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000,
    })
    return true
  } catch {
    return false
  }
}

/** Get the bot instance for sending messages */
export function getBot(): Telegraf | null {
  return bot
}
