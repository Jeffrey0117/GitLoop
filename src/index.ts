import { startServer, stopServer, setWebhookHandlers } from './webhook/server.js'
import { pollAll, getMonitoredRepos } from './core/github-monitor.js'
import { notifyPush, notifyReview, notifyLearn, notifyStartup, notifyGiteaPush, notifyGiteaPR, sendRawMessage } from './telegram/notifier.js'
import { reviewCommit, generateLearnInsights, getActiveProviderName } from './ai/reviewer.js'
import { isLearnModeOn } from './bot/learn-state.js'
import { isReviewEnabled } from './bot/review-state.js'
import { scheduleDailyDigest } from './features/daily-digest.js'
import { checkAllBranches, formatBranchChange } from './features/branch-monitor.js'
import { startBot } from './bot/bot.js'
import { startReviewCleanup } from './store/review-store.js'
import { env } from './config/env.js'

console.error('[gitloop] Starting GitLoop...')

setWebhookHandlers({
  onPush: async (event) => {
    console.error(`[gitloop] Gitea push: ${event.repository.full_name} (${event.commits.length} commits)`)
    await notifyGiteaPush(event)
  },
  onPullRequest: async (event) => {
    console.error(`[gitloop] Gitea PR ${event.action}: ${event.repository.full_name}#${event.number}`)
    await notifyGiteaPR(event)
  },
})

const repos = getMonitoredRepos()
console.error(`[gitloop] Monitoring ${repos.length} GitHub repos:`)
repos.forEach(r => console.error(`  - ${r}`))

if (env.GITEA_URL) {
  console.error(`[gitloop] Gitea webhook endpoint: :${env.PORT}/webhook`)
}

const aiProvider = env.REVIEW_ENABLED ? getActiveProviderName() : 'off'
notifyStartup(repos.length, aiProvider).catch(() => {})

scheduleDailyDigest(sendRawMessage, 9)

async function runPollCycle(): Promise<void> {
  const pushes = await pollAll()

  for (const push of pushes) {
    await notifyPush(push)

    if (isReviewEnabled() && push.commits.length > 0) {
      const latestCommit = push.commits[0]
      let reviewSummary = ''
      try {
        const review = await reviewCommit(push.repo, latestCommit.sha)
        if (review) {
          reviewSummary = review.summary
          if (review.issues.length > 0 || !review.approved) {
            await notifyReview(push.repo, latestCommit.sha, review)
          }
        }
      } catch (error) {
        console.error(`[gitloop] Review error for ${push.repo}:`, error)
      }

      if (isLearnModeOn()) {
        try {
          const insights = await generateLearnInsights(push.repo, latestCommit.sha, reviewSummary)
          await notifyLearn(push.repo, latestCommit.sha, insights)
        } catch (error) {
          console.error(`[gitloop] Learn error for ${push.repo}:`, error)
        }
      }
    }
  }

  const branchChanges = await checkAllBranches(repos)
  for (const change of branchChanges) {
    const msg = formatBranchChange(change)
    await sendRawMessage(msg)
  }
}

setTimeout(() => {
  console.error('[gitloop] Running initial GitHub poll...')
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, 5000)

const intervalMs = env.GITHUB_POLL_INTERVAL * 1000
setInterval(() => {
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, intervalMs)

console.error(`[gitloop] GitHub polling every ${env.GITHUB_POLL_INTERVAL}s`)

startServer()
startBot()
startReviewCleanup()

function shutdown(signal: string): void {
  console.error(`[gitloop] Received ${signal}, shutting down...`)
  stopServer()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

console.error('[gitloop] GitLoop is running.')
