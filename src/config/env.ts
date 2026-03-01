import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const envSchema = z.object({
  // Gitea
  GITEA_URL: z.string().url().default('http://localhost:3000'),
  GITEA_ADMIN_TOKEN: z.string().min(1),
  GITEA_WEBHOOK_SECRET: z.string().default(''),

  // Telegram (optional)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional(),

  // AI (optional)
  CLAUDE_API_KEY: z.string().optional(),

  // Server
  PORT: z.coerce.number().default(4100),
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
