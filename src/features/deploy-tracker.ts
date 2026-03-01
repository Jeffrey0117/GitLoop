import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const STATE_FILE = join(process.cwd(), 'data', 'deploy-state.json')

interface DeployState {
  readonly [repo: string]: {
    readonly lastDeployedSha: string
    readonly deployedAt: string
  }
}

function loadState(): DeployState {
  try {
    if (!existsSync(STATE_FILE)) return {}
    return JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function saveState(state: DeployState): void {
  const dir = join(process.cwd(), 'data')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&')
}

/** Record a deployment for a repo */
export function recordDeploy(repo: string, sha: string): void {
  const state = loadState()
  saveState({
    ...state,
    [repo]: { lastDeployedSha: sha, deployedAt: new Date().toISOString() },
  })
}

/** Check drift between deployed version and latest commit */
export function checkDeployDrift(repo: string): {
  readonly repo: string
  readonly deployedSha: string
  readonly latestSha: string
  readonly behindBy: number
  readonly deployedAt: string
} | null {
  const state = loadState()
  const repoState = state[repo]

  if (!repoState) return null

  try {
    const latestSha = execSync(
      `gh api repos/${repo}/commits?per_page=1 --jq ".[0].sha"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    ).trim()

    if (latestSha === repoState.lastDeployedSha) return null

    // Count commits between deployed and latest
    const compareRaw = execSync(
      `gh api "repos/${repo}/compare/${repoState.lastDeployedSha.slice(0, 7)}...${latestSha.slice(0, 7)}" --jq ".ahead_by"`,
      { encoding: 'utf-8', windowsHide: true, timeout: 10000 }
    ).trim()

    const behindBy = parseInt(compareRaw, 10) || 0

    return {
      repo,
      deployedSha: repoState.lastDeployedSha,
      latestSha,
      behindBy,
      deployedAt: repoState.deployedAt,
    }
  } catch {
    return null
  }
}

/** Generate deploy drift report for all tracked repos */
export function generateDeployReport(repos: readonly string[]): string {
  const drifts: Array<{
    readonly repo: string
    readonly behindBy: number
    readonly deployedAt: string
  }> = []

  for (const repo of repos) {
    const drift = checkDeployDrift(repo)
    if (drift && drift.behindBy > 0) {
      drifts.push(drift)
    }
  }

  if (drifts.length === 0) {
    return [
      `*\u{1F680} Deploy Status*`,
      '',
      '\u{2705} All tracked repos are up to date',
    ].join('\n')
  }

  const lines = drifts.map(d => {
    const shortName = d.repo.split('/')[1] ?? d.repo
    const age = getTimeAgo(d.deployedAt)
    return `  \u{26A0}\u{FE0F} \`${escapeMarkdown(shortName)}\`: ${d.behindBy} commits behind (deployed ${age})`
  }).join('\n')

  return [
    `*\u{1F680} Deploy Status*`,
    '',
    `${drifts.length} repo${drifts.length > 1 ? 's' : ''} have unreleased changes:`,
    '',
    lines,
  ].join('\n')
}

function getTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
