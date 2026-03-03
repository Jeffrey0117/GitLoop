import type { LearnInsight } from '../types/index.js'

import { MAX_DIFF_LENGTH } from './review-prompt.js'

/** Build a learning-oriented prompt from a git diff */
export function buildLearnPrompt(diff: string, reviewSummary: string): string {
  return [
    '你是一個友善的技術導師。根據以下 git diff，挑出 1-2 個最值得學習的技術重點。',
    '用口語化繁體中文解說，像朋友聊天一樣。',
    '每個重點用 3-5 句話講完，重點是「為什麼這樣做」和「背後原理」。',
    '',
    '只回傳 JSON（不要 markdown、不要多餘文字）：',
    '{"insights":[{"topic":"技術名稱","explanation":"口語化解說"}]}',
    '',
    `這次變更的摘要：${reviewSummary}`,
    '',
    diff.slice(0, MAX_DIFF_LENGTH),
  ].join('\n')
}

/** Parse raw AI output into structured learn insights */
export function parseLearnOutput(raw: string): readonly LearnInsight[] {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return []

    const parsed = JSON.parse(jsonMatch[0]) as {
      insights?: readonly { topic?: string; explanation?: string }[]
    }

    return (parsed.insights ?? [])
      .filter(i => i.topic && i.explanation)
      .map(i => ({
        topic: i.topic!,
        explanation: i.explanation!,
      }))
  } catch {
    return []
  }
}
