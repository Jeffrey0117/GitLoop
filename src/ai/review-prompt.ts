import type { CodeReviewResult, ReviewIssue, TestSuggestion } from '../types/index.js'

/** Max diff characters to send to any AI provider */
export const MAX_DIFF_LENGTH = 20000

/** Build the standard review prompt for any AI CLI */
export function buildReviewPrompt(diff: string): string {
  return [
    '請用繁體中文審查以下 git diff。只回傳 JSON（不要 markdown、不要解釋）：',
    '{"summary":"簡要總結","issues":[{"file":"檔名","message":"問題描述","suggestion":"修改建議"}],"approved":true/false,"testSuggestions":[{"file":"檔名","function":"函數名","reason":"為何需要測試","testType":"unit|integration|e2e"}]}',
    '重點檢查：',
    '1. 安全性（暴露的密鑰、注入攻擊）、破壞性變更、bug、效能問題',
    '2. 測試覆蓋率缺口 — 列出缺測試的函數/檔案，建議測試類型',
    '每個 issue 都必須附上 suggestion（具體的修改建議）。',
    '如果沒有問題，回傳空 issues 和 approved:true。',
    'testSuggestions 只在有明顯缺測試的邏輯時才加入，trivial 變更可省略。',
    '',
    diff.slice(0, MAX_DIFF_LENGTH),
  ].join('\n')
}

/** Parse raw AI output into a structured CodeReviewResult */
export function parseReviewOutput(raw: string): CodeReviewResult {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { summary: raw.slice(0, 200), issues: [], approved: true }
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      summary?: string
      issues?: ReviewIssue[]
      approved?: boolean
      testSuggestions?: TestSuggestion[]
    }

    return {
      summary: parsed.summary ?? 'No summary',
      issues: (parsed.issues ?? []).map(i => ({
        file: i.file ?? 'unknown',
        line: i.line,
        message: i.message ?? '',
        suggestion: i.suggestion,
      })),
      approved: parsed.approved ?? true,
      testSuggestions: (parsed.testSuggestions ?? []).map(t => ({
        file: t.file ?? 'unknown',
        function: t.function,
        reason: t.reason ?? '',
        testType: t.testType ?? 'unit',
      })),
    }
  } catch {
    return { summary: 'Failed to parse review result.', issues: [], approved: true }
  }
}
