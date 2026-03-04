import { Telegraf, type Context } from 'telegraf'
import { env } from '../config/env.js'
import { generateDailyDigest } from '../features/daily-digest.js'
import { generateDeployReport } from '../features/deploy-tracker.js'
import { getMonitoredRepos } from '../core/github-monitor.js'
import { execSync } from 'node:child_process'
import { getReview, deleteReview, type ReviewContext } from '../store/review-store.js'
import { createIssuesFromReview, commentOnIssue, closeIssue } from '../core/gitea-issues.js'
import { requestAutoFix, pollCommandStatus, buildFixPrompt } from '../integrations/claudebot-client.js'
import { isLearnModeOn, setLearnMode } from './learn-state.js'
import { isReviewEnabled, setReviewEnabled } from './review-state.js'

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
        '/review \u2014 Toggle AI code review',
        '/learnmode \u2014 Toggle learning mode',
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
      `\u{1F916} AI Review: ${isReviewEnabled() ? 'ON' : 'OFF'}`,
      `\u{1F4DA} Learn Mode: ${isLearnModeOn() ? 'ON' : 'OFF'}`,
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

  // /review — toggle AI code review
  bot.command('review', (ctx) => {
    if (!isAuthorized(ctx)) return
    const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase()

    if (arg === 'on') {
      setReviewEnabled(true)
      ctx.reply('\u{1F916} AI 審查：*已開啟*\n每次 push 會自動審查程式碼', { parse_mode: 'Markdown' })
    } else if (arg === 'off') {
      setReviewEnabled(false)
      ctx.reply('\u{1F916} AI 審查：*已關閉*', { parse_mode: 'Markdown' })
    } else {
      const status = isReviewEnabled() ? '\u{2705} ON' : '\u{274C} OFF'
      ctx.reply(
        [
          `\u{1F916} *AI 審查* — ${status}`,
          '',
          '用法：',
          '/review on \u2014 開啟',
          '/review off \u2014 關閉',
        ].join('\n'),
        { parse_mode: 'Markdown' }
      )
    }
  })

  // /learnmode — toggle learning mode
  bot.command('learnmode', (ctx) => {
    if (!isAuthorized(ctx)) return
    const arg = ctx.message.text.split(/\s+/)[1]?.toLowerCase()

    if (arg === 'on') {
      setLearnMode(true)
      ctx.reply('\u{1F4DA} 學習模式：*已開啟*\n每次 push 會附上技術解說', { parse_mode: 'Markdown' })
    } else if (arg === 'off') {
      setLearnMode(false)
      ctx.reply('\u{1F4DA} 學習模式：*已關閉*', { parse_mode: 'Markdown' })
    } else {
      const status = isLearnModeOn() ? '\u{2705} ON' : '\u{274C} OFF'
      ctx.reply(
        [
          `\u{1F4DA} *學習模式* — ${status}`,
          '',
          '用法：',
          '/learnmode on \u2014 開啟',
          '/learnmode off \u2014 關閉',
        ].join('\n'),
        { parse_mode: 'Markdown' }
      )
    }
  })

  // Handle inline keyboard callbacks (issue creation + auto-fix + test generation)
  bot.on('callback_query', async (ctx) => {
    if (!isAuthorized(ctx)) return

    const data = 'data' in ctx.callbackQuery ? ctx.callbackQuery.data : undefined
    if (!data) return

    // Handle "skip" action (no colon separator)
    if (data === 'skip') {
      await ctx.answerCbQuery('已跳過')
      return
    }

    const separatorIdx = data.indexOf(':')
    if (separatorIdx === -1) return

    const action = data.slice(0, separatorIdx)
    const payload = data.slice(separatorIdx + 1)

    if (action === 'test') {
      await handleGenerateTests(ctx, payload)
      return
    }

    // For issue/fix actions, payload is reviewId
    const review = getReview(payload)
    if (!review) {
      await ctx.answerCbQuery('審查資料已過期')
      return
    }

    if (action === 'issue') {
      await handleCreateIssues(ctx, payload, review)
    } else if (action === 'fix') {
      await handleAutoFix(ctx, payload, review)
    } else {
      await ctx.answerCbQuery('未知操作')
    }
  })

  bot.launch({ dropPendingUpdates: true })
    .then(() => console.error('[bot] GitLoop bot started'))
    .catch(err => console.error('[bot] Failed to start:', err))

  // Graceful shutdown
  process.once('SIGINT', () => bot?.stop('SIGINT'))
  process.once('SIGTERM', () => bot?.stop('SIGTERM'))
}

async function handleCreateIssues(
  ctx: Context,
  reviewId: string,
  review: ReviewContext
): Promise<void> {
  await ctx.answerCbQuery('建立 Issue 中...')

  try {
    const result = await createIssuesFromReview(
      review.repo,
      review.commit,
      review.result.issues
    )

    const issueLinks = result.created
      .map(i => `  [#${i.number}](${i.html_url})`)
      .join('\n')

    await ctx.reply(
      [
        `\u{2705} 已建立 ${result.count} 個 Issue`,
        '',
        issueLinks || '  _無 issue 建立_',
      ].join('\n'),
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    )

    deleteReview(reviewId)
  } catch (error) {
    console.error('[bot] Create issues failed:', error)
    await ctx.reply(`\u{274C} 建立 Issue 失敗: ${String(error)}`)
  }
}

async function handleGenerateTests(ctx: Context, payload: string): Promise<void> {
  await ctx.answerCbQuery('生成測試中...')

  // payload format: "repo:commit"
  const parts = payload.split(':')
  if (parts.length < 2) {
    await ctx.reply('\u{274C} 無效的測試生成請求')
    return
  }

  const repo = parts.slice(0, -1).join(':') // Handle repo names with colons
  const commit = parts[parts.length - 1]

  const project = env.CLAUDEBOT_PROJECT ?? repo
  const prompt = `為 ${repo}@${commit} 生成測試檔案。請用 TDD agent 分析 commit diff，找出缺測試的函數，生成 unit/integration/e2e 測試。確保覆蓋率 80%+。`

  const result = await requestAutoFix(project, prompt)

  if (!result.success) {
    await ctx.reply(`\u{274C} 測試生成失敗: ${result.message}`)
    return
  }

  await ctx.reply(`\u{1F9EA} ${result.message}（背景執行中...）`)

  if (result.commandId) {
    pollCommandStatus(result.commandId)
      .then(async (pollResult) => {
        const emoji = pollResult.success ? '\u{2705}' : '\u{274C}'
        const truncated = pollResult.message.length > 300
          ? `${pollResult.message.slice(0, 300)}...`
          : pollResult.message
        await ctx.reply(`${emoji} 測試生成結果:\n${truncated}`)
      })
      .catch(async (err) => {
        console.error('[bot] Poll test generation failed:', err)
        try {
          await ctx.reply(`\u{274C} 無法取得生成狀態: ${String(err)}`)
        } catch { /* swallow reply error */ }
      })
  }
}

async function handleAutoFix(
  ctx: Context,
  reviewId: string,
  review: ReviewContext
): Promise<void> {
  await ctx.answerCbQuery('建立 Issue + 送出修復指令...')

  // Step 1: Create issues first (paper trail)
  let issueNumbers: readonly number[] = []
  try {
    const issueResult = await createIssuesFromReview(
      review.repo,
      review.commit,
      review.result.issues
    )
    issueNumbers = issueResult.created.map(i => i.number)

    const issueLinks = issueResult.created
      .map(i => `  [#${i.number}](${i.html_url})`)
      .join('\n')

    await ctx.reply(
      [
        `\u{1F4CB} 已建立 ${issueResult.count} 個 Issue`,
        issueLinks,
        '',
        `\u{1F527} 正在送出自動修復指令...`,
      ].join('\n'),
      { parse_mode: 'Markdown', link_preview_options: { is_disabled: true } }
    )
  } catch (error) {
    console.error('[bot] Create issues for auto-fix failed:', error)
    await ctx.reply(`\u{26A0}\u{FE0F} Issue 建立失敗，但仍嘗試修復...`)
  }

  // Step 2: Send fix command to ClaudeBot
  const project = env.CLAUDEBOT_PROJECT ?? review.repo
  const prompt = buildFixPrompt(review.repo, review.commit, review.result.issues)
  const result = await requestAutoFix(project, prompt)

  if (!result.success) {
    await ctx.reply(`\u{274C} 自動修復失敗: ${result.message}`)
    return
  }

  await ctx.reply(`\u{1F527} ${result.message}（背景執行中...）`)

  // Step 3: Background polling — update issues when done
  if (result.commandId) {
    pollCommandStatus(result.commandId)
      .then(async (pollResult) => {
        const emoji = pollResult.success ? '\u{2705}' : '\u{274C}'
        const truncated = pollResult.message.length > 500
          ? `${pollResult.message.slice(0, 500)}...`
          : pollResult.message
        await ctx.reply(`${emoji} 自動修復結果:\n${truncated}`)

        // Update Gitea issues with fix result
        for (const issueNum of issueNumbers) {
          try {
            const comment = pollResult.success
              ? `\u{2705} 已由 ClaudeBot 自動修復\n\n${truncated}`
              : `\u{274C} 自動修復失敗\n\n${truncated}`
            await commentOnIssue(review.repo, issueNum, comment)
            if (pollResult.success) {
              await closeIssue(review.repo, issueNum)
            }
          } catch (err) {
            console.error(`[bot] Failed to update issue #${issueNum}:`, err)
          }
        }

        deleteReview(reviewId)
      })
      .catch(async (err) => {
        console.error('[bot] Poll auto-fix failed:', err)
        try {
          await ctx.reply(`\u{274C} 無法取得修復狀態: ${String(err)}`)
        } catch { /* swallow reply error */ }
      })
  }
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
