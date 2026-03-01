import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { MirrorConfig } from '../types/index.js'

const MIRRORS_FILE = join(process.cwd(), 'data', 'mirrors.json')

function loadMirrors(): readonly MirrorConfig[] {
  try {
    if (!existsSync(MIRRORS_FILE)) return []
    return JSON.parse(readFileSync(MIRRORS_FILE, 'utf-8')) as MirrorConfig[]
  } catch {
    return []
  }
}

function saveMirrors(mirrors: readonly MirrorConfig[]): void {
  writeFileSync(MIRRORS_FILE, JSON.stringify(mirrors, null, 2))
}

/** Add a mirror configuration */
export function addMirror(config: MirrorConfig): void {
  const mirrors = loadMirrors()
  const exists = mirrors.some(
    m => m.giteaRepo === config.giteaRepo && m.githubRepo === config.githubRepo
  )
  if (exists) {
    throw new Error(`Mirror already exists: ${config.giteaRepo} <-> ${config.githubRepo}`)
  }
  saveMirrors([...mirrors, config])
}

/** Remove a mirror configuration */
export function removeMirror(giteaRepo: string): void {
  const mirrors = loadMirrors()
  saveMirrors(mirrors.filter(m => m.giteaRepo !== giteaRepo))
}

/** List all mirror configurations */
export function listMirrors(): readonly MirrorConfig[] {
  return loadMirrors()
}

/** Sync a specific mirror: push from Gitea to GitHub */
export function syncToGitHub(giteaRepo: string, repoDir: string): void {
  const mirrors = loadMirrors()
  const mirror = mirrors.find(m => m.giteaRepo === giteaRepo && m.enabled)
  if (!mirror) return

  try {
    // Check if github remote exists
    const remotes = execSync('git remote', {
      cwd: repoDir,
      encoding: 'utf-8',
      windowsHide: true,
    }).trim()

    if (!remotes.includes('github')) {
      execSync(`git remote add github ${mirror.githubRepo}`, {
        cwd: repoDir,
        windowsHide: true,
      })
    }

    // Push to GitHub
    execSync('git push github --all', {
      cwd: repoDir,
      windowsHide: true,
      timeout: 60000,
    })

    execSync('git push github --tags', {
      cwd: repoDir,
      windowsHide: true,
      timeout: 30000,
    })

    console.error(`[mirror] Synced ${giteaRepo} -> GitHub`)
  } catch (error) {
    console.error(`[mirror] Sync failed for ${giteaRepo}:`, error)
  }
}
