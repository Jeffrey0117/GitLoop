import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),

  // GitHub monitoring
  GITHUB_REPOS: z.string().default(''),  // comma-separated: owner/repo,owner/repo2
  GITHUB_POLL_INTERVAL: z.coerce.number().default(60),  // seconds

  // Gitea (optional — for future self-hosted git)
  GITEA_URL: z.string().optional(),
  GITEA_ADMIN_TOKEN: z.string().optional(),
  GITEA_WEBHOOK_SECRET: z.string().default(''),

  // AI review
  REVIEW_ENABLED: z.coerce.boolean().default(true),
  AI_PROVIDER: z.enum(['gemini', 'qwen', 'claude', 'basic']).default('gemini'),
  AI_MODEL: z.string().optional(),
  AI_TIMEOUT: z.coerce.number().default(60000),

  // ClaudeBot integration
  CLAUDEBOT_URL: z.string().default('http://localhost:3100'),
  CLAUDEBOT_PROJECT: z.string().optional(),

  // Gitea owner
  GITEA_OWNER: z.string().default('jeffrey'),

  // Server
  PORT: z.coerce.number().default(4012),
})

function loadDotenv(): void {
  try {
    const envPath = join(process.cwd(), '.env')
    const content = readFileSync(envPath, 'utf-8')

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) continue
      const key = trimmed.slice(0, eqIdx)
      const val = trimmed.slice(eqIdx + 1).replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  } catch {
    // .env not found
  }
}

loadDotenv()

export type Env = z.infer<typeof envSchema>
export const env: Env = envSchema.parse(process.env)
