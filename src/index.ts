import { startServer } from './webhook/server.js'
import { pollAll, getMonitoredRepos } from './core/github-monitor.js'
import { notifyPush, notifyReview, notifyStartup } from './telegram/notifier.js'
import { reviewCommit } from './ai/reviewer.js'
import { env } from './config/env.js'

console.error('[gitloop] Starting GitLoop...')

// Discover repos to monitor
const repos = getMonitoredRepos()
console.error(`[gitloop] Monitoring ${repos.length} repos:`)
repos.forEach(r => console.error(`  - ${r}`))

// Send startup notification
notifyStartup(repos.length).catch(() => {})

// Main polling loop
async function runPollCycle(): Promise<void> {
  const pushes = pollAll()

  for (const push of pushes) {
    // 1. Telegram notification — instant
    await notifyPush(push)

    // 2. AI code review — async per commit
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
}

// Initial poll (with delay to let things settle)
setTimeout(() => {
  console.error('[gitloop] Running initial poll...')
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, 5000)

// Schedule recurring polls
const intervalMs = env.GITHUB_POLL_INTERVAL * 1000
setInterval(() => {
  runPollCycle().catch(e => console.error('[gitloop] Poll error:', e))
}, intervalMs)

console.error(`[gitloop] Polling every ${env.GITHUB_POLL_INTERVAL}s`)

// Start webhook server (for Gitea/GitHub webhooks)
startServer()

console.error('[gitloop] GitLoop is running.')
