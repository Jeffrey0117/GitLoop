import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { env } from '../config/env.js'

const STATE_FILE = join(process.cwd(), 'data', 'commit-state.json')

interface CommitState {
  readonly [repo: string]: string  // repo -> last seen commit SHA
}

interface CommitInfo {
  readonly sha: string
  readonly message: string
  readonly author: string
  readonly date: string
  readonly url: string
}

export interface PushDetected {
  readonly repo: string
  readonly branch: string
  readonly commits: readonly CommitInfo[]
  readonly compareUrl: string
}

function loadState(): CommitState {
  try {
    if (!existsSync(STATE_FILE)) return {}
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveState(state: CommitState): void {
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

/** Get latest commits for a repo using gh CLI */
function getLatestCommits(repo: string, limit = 5): readonly CommitInfo[] {
  try {
    const raw = execSync(
      `gh api repos/${repo}/commits?per_page=${limit} --jq ".[] | {sha: .sha[0:7], full_sha: .sha, message: .commit.message, author: .commit.author.name, date: .commit.author.date, url: .html_url}"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 15000 }
    ).trim()

    if (!raw) return []

    // gh --jq outputs one JSON object per line
    return raw.split('\n').filter(Boolean).map(line => {
      const obj = JSON.parse(line)
      return {
        sha: obj.full_sha,
        message: obj.message.split('\n')[0],
        author: obj.author,
        date: obj.date,
        url: obj.url,
      }
    })
  } catch (error) {
    console.error(`[monitor] Failed to fetch commits for ${repo}:`, (error as Error).message)
    return []
  }
}

/** Get the default branch for a repo */
function getDefaultBranch(repo: string): string {
  try {
    return execSync(
      `gh api repos/${repo} --jq ".default_branch"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    ).trim()
  } catch {
    return 'main'
  }
}

/** Get diff for a specific commit using gh CLI */
export function getCommitDiff(repo: string, sha: string): string {
  try {
    return execSync(
      `gh api repos/${repo}/commits/${sha} -H "Accept: application/vnd.github.diff"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 30000 }
    )
  } catch (error) {
    console.error(`[monitor] Failed to get diff for ${repo}@${sha}:`, (error as Error).message)
    return ''
  }
}

/** Check a single repo for new pushes */
export function checkRepo(repo: string): PushDetected | null {
  const state = loadState()
  const lastSeen = state[repo]

  const commits = getLatestCommits(repo, 10)
  if (commits.length === 0) return null

  const latestSha = commits[0].sha

  // First run — just record the state
  if (!lastSeen) {
    saveState({ ...state, [repo]: latestSha })
    console.error(`[monitor] ${repo}: initialized (latest: ${latestSha.slice(0, 7)})`)
    return null
  }

  // No new commits
  if (latestSha === lastSeen) return null

  // Find new commits (everything after lastSeen)
  const lastSeenIdx = commits.findIndex(c => c.sha === lastSeen)
  const newCommits = lastSeenIdx === -1
    ? commits.slice(0, 3)  // if lastSeen not in recent 10, just show latest 3
    : commits.slice(0, lastSeenIdx)

  if (newCommits.length === 0) return null

  // Update state
  saveState({ ...state, [repo]: latestSha })

  const branch = getDefaultBranch(repo)
  const compareUrl = `https://github.com/${repo}/compare/${lastSeen.slice(0, 7)}...${latestSha.slice(0, 7)}`

  console.error(`[monitor] ${repo}: ${newCommits.length} new commits detected`)

  return {
    repo,
    branch,
    commits: newCommits,
    compareUrl,
  }
}

/** Get list of repos to monitor */
export function getMonitoredRepos(): readonly string[] {
  // From env var
  if (env.GITHUB_REPOS) {
    return env.GITHUB_REPOS.split(',').map(r => r.trim()).filter(Boolean)
  }

  // Auto-discover: list user's repos
  try {
    const raw = execSync(
      'gh repo list --limit 50 --json nameWithOwner --jq ".[].nameWithOwner"',
      { encoding: 'utf-8', windowsHide: true, timeout: 15000 }
    ).trim()

    return raw.split('\n').filter(Boolean)
  } catch (error) {
    console.error('[monitor] Failed to list repos:', (error as Error).message)
    return []
  }
}

/** Poll all monitored repos */
export function pollAll(): readonly PushDetected[] {
  const repos = getMonitoredRepos()
  const results: PushDetected[] = []

  for (const repo of repos) {
    try {
      const push = checkRepo(repo)
      if (push) results.push(push)
    } catch (error) {
      console.error(`[monitor] Error checking ${repo}:`, (error as Error).message)
    }
  }

  return results
}
