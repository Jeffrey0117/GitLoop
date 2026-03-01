import { z } from 'zod'
import { env } from '../config/env.js'
import type { ReviewIssue } from '../types/index.js'

const commandResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed']),
  output: z.string().optional(),
})

type CommandResponse = z.infer<typeof commandResponseSchema>

interface AutoFixResult {
  readonly success: boolean
  readonly message: string
  readonly commandId?: string
}

const POLL_INTERVAL_MS = 5000
const MAX_POLL_MS = 2 * 60 * 1000 // 2 minutes

/** Request ClaudeBot to auto-fix issues via dashboard API */
export async function requestAutoFix(
  project: string,
  prompt: string
): Promise<AutoFixResult> {
  const baseUrl = env.CLAUDEBOT_URL

  try {
    const res = await fetch(`${baseUrl}/api/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        command: prompt,
        project,
        model: 'opus',
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      return { success: false, message: `ClaudeBot API 失敗 (${res.status}): ${text}` }
    }

    const data = commandResponseSchema.parse(await res.json())
    return { success: true, message: '已送出修復指令', commandId: data.id }
  } catch (error) {
    return { success: false, message: `無法連線 ClaudeBot: ${String(error)}` }
  }
}

/** Poll command status until completed, failed, or timeout */
export async function pollCommandStatus(commandId: string): Promise<AutoFixResult> {
  const baseUrl = env.CLAUDEBOT_URL
  const startTime = Date.now()

  while (Date.now() - startTime < MAX_POLL_MS) {
    try {
      const res = await fetch(`${baseUrl}/api/commands/${commandId}`)
      if (!res.ok) {
        return { success: false, message: `輪詢失敗 (${res.status})`, commandId }
      }

      const data = commandResponseSchema.parse(await res.json())

      if (data.status === 'completed') {
        return {
          success: true,
          message: data.output ?? '修復完成',
          commandId,
        }
      }

      if (data.status === 'failed') {
        return {
          success: false,
          message: data.output ?? '修復失敗',
          commandId,
        }
      }

      // Still running, wait and retry
      await sleep(POLL_INTERVAL_MS)
    } catch (error) {
      return { success: false, message: `輪詢錯誤: ${String(error)}`, commandId }
    }
  }

  return { success: false, message: '修復逾時（超過 2 分鐘）', commandId }
}

/** Build a Chinese fix prompt from review issues */
export function buildFixPrompt(
  repo: string,
  commit: string,
  issues: readonly ReviewIssue[]
): string {
  const issueDescriptions = issues
    .map((issue, i) => {
      const loc = issue.line ? `${issue.file}:${issue.line}` : issue.file
      const sug = issue.suggestion ? `\n   建議：${issue.suggestion}` : ''
      return `${i + 1}. [${issue.severity}] ${loc}\n   ${issue.message}${sug}`
    })
    .join('\n\n')

  return [
    `請修復以下 AI 審查發現的問題。`,
    ``,
    `Repo: ${repo}`,
    `Commit: ${commit.slice(0, 7)}`,
    ``,
    `問題列表：`,
    issueDescriptions,
    ``,
    `請逐一修復，確保不引入新問題。修復後自動 commit。`,
  ].join('\n')
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
