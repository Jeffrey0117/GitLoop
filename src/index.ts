import { startServer, setWebhookHandlers } from './webhook/server.js'
import { pollAll, getMonitoredRepos } from './core/github-monitor.js'
import { notifyPush, notifyReview, notifyStartup, notifyGiteaPush, notifyGiteaPR, sendRawMessage } from './telegram/notifier.js'
import { reviewCommit } from './ai/reviewer.js'
import { scheduleDailyDigest } from './features/daily-digest.js'
import { checkAllBranches, formatBranchChange } from './features/branch-monitor.js'
import { env } from './config/env.js'

console.error('[gitloop] Starting GitLoop...')

// Register Gitea webhook handlers → Telegram
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

// Discover repos to monitor (GitHub polling)
const repos = getMonitoredRepos()
console.error(`[gitloop] Monitoring ${repos.length} GitHub repos:`)
repos.forEach(r => console.error(`  - ${r}`))

if (env.GITEA_URL) {
  console.error(`[gitloop] Gitea webhook endpoint: :${env.PORT}/webhook`)
}

// Send startup notification
notifyStartup(repos.length).catch(() => {})

// Schedule daily digest at 9:00 AM
scheduleDailyDigest(sendRawMessage, 9)

// Main polling loop (GitHub + branch monitoring)
async function runPollCycle(): Promise<void> {
  // 1. GitHub push detection
  const pushes = pollAll()

  for (const push of pushes) {
    await notifyPush(push)

    if (env.REVIEW_ENABLED && push.commits.length > 0) {
      const latestCommit = push.commits[0]
      try {
        const review = await reviewCommit(push.repo, latestCommit.sha)
        if (review && (review.issues.length > 0 || !review.approved)) {
          await notifyReview(push.repo, latestCommit.sha, review)
        }
      } catch (error) {
        console.error(`[gitloop] Review error for ${push.repo}:`, error)
      }
    }
  }

  // 2. Branch monitoring (every poll cycle)
  const branchChanges = checkAllBranches(repos)
  for (const change of branchChanges) {
    const msg = formatBranchChange(change)
    await sendRawMessage(msg)
  }
}

// Initial poll (with delay)
setTimeout(() => {
  console.error('[gitloop] Running initial GitHub poll...')
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, 5000)

// Recurring polls
const intervalMs = env.GITHUB_POLL_INTERVAL * 1000
setInterval(() => {
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, intervalMs)

console.error(`[gitloop] GitHub polling every ${env.GITHUB_POLL_INTERVAL}s`)

// Start webhook server
startServer()

console.error('[gitloop] GitLoop is running.')
