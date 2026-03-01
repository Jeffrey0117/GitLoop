import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const STATE_FILE = join(process.cwd(), 'data', 'branch-state.json')

interface BranchState {
  readonly [repo: string]: readonly string[]
}

interface BranchChange {
  readonly repo: string
  readonly created: readonly string[]
  readonly deleted: readonly string[]
}

function loadState(): BranchState {
  try {
    if (!existsSync(STATE_FILE)) return {}
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveState(state: BranchState): void {
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

function getBranches(repo: string): readonly string[] {
  try {
    const raw = execSync(
      `gh api "repos/${repo}/branches?per_page=100" --jq ".[].name"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 15000 }
    ).trim()

    return raw ? raw.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

/** Check a single repo for branch changes */
export function checkBranches(repo: string): BranchChange | null {
  const state = loadState()
  const previousBranches = state[repo]
  const currentBranches = getBranches(repo)

  if (currentBranches.length === 0) return null

  // First run — initialize
  if (!previousBranches) {
    saveState({ ...state, [repo]: currentBranches })
    console.error(`[branches] ${repo}: initialized with ${currentBranches.length} branches`)
    return null
  }

  const created = currentBranches.filter(b => !previousBranches.includes(b))
  const deleted = previousBranches.filter(b => !currentBranches.includes(b))

  if (created.length === 0 && deleted.length === 0) return null

  // Update state
  saveState({ ...state, [repo]: currentBranches })

  return { repo, created, deleted }
}

/** Check all repos for branch changes */
export function checkAllBranches(repos: readonly string[]): readonly BranchChange[] {
  const results: BranchChange[] = []

  for (const repo of repos) {
    try {
      const change = checkBranches(repo)
      if (change) results.push(change)
    } catch (error) {
      console.error(`[branches] Error checking ${repo}:`, (error as Error).message)
    }
  }

  return results
}

/** Format branch changes for Telegram */
export function formatBranchChange(change: BranchChange): string {
  const shortName = change.repo.split('/')[1] ?? change.repo
  const lines: string[] = [
    `*\u{1F33F} Branch Update* \u2014 \`${escapeMarkdown(shortName)}\``,
    '',
  ]

  for (const branch of change.created) {
    lines.push(`  \u{1F7E2} Created: \`${escapeMarkdown(branch)}\``)
  }

  for (const branch of change.deleted) {
    lines.push(`  \u{1F534} Deleted: \`${escapeMarkdown(branch)}\``)
  }

  return lines.join('\n')
}
