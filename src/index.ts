import { startServer, setWebhookHandlers } from './webhook/server.js'
import { notifyPush, notifyPR, notifyReview, notifyDeployTrigger } from './telegram/notifier.js'
import { reviewCommit } from './ai/reviewer.js'
import type { GiteaPushEvent, GiteaPREvent } from './types/index.js'

console.error('[gitloop] Starting GitLoop...')

// Wire up webhook handlers
setWebhookHandlers({
  async onPush(event: GiteaPushEvent) {
    const repo = event.repository.full_name
    const branch = event.ref.replace('refs/heads/', '')
    const latestCommit = event.commits[event.commits.length - 1]

    console.error(`[gitloop] Push to ${repo} (${branch}): ${event.commits.length} commits`)

    // 1. Telegram notification
    await notifyPush(event)

    // 2. AI code review (if configured)
    if (latestCommit) {
      const [owner, name] = repo.split('/')
      const review = await reviewCommit(owner, name, latestCommit.sha)

      if (review && review.issues.length > 0) {
        await notifyReview(repo, latestCommit.sha, review)
      }
    }

    // 3. Trigger CloudPipe deploy (if applicable)
    if (latestCommit) {
      await notifyDeployTrigger(repo, branch, latestCommit.sha)
    }
  },

  async onPullRequest(event: GiteaPREvent) {
    const repo = event.repository.full_name
    console.error(`[gitloop] PR #${event.number} ${event.action} in ${repo}`)

    // Telegram notification
    await notifyPR(event)

    // AI review on new/updated PRs
    if (event.action === 'opened' || event.action === 'synchronized') {
      const [owner, name] = repo.split('/')
      const review = await reviewCommit(owner, name, event.pull_request.head.sha)

      if (review) {
        await notifyReview(repo, event.pull_request.head.sha, review)
      }
    }
  },
})

// Start the webhook server
startServer()

console.error('[gitloop] GitLoop is running.')
