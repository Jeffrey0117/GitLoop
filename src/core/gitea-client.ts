import { env } from '../config/env.js'
import type { GiteaRepo, GiteaCommit } from '../types/index.js'

const BASE_URL = env.GITEA_URL
const TOKEN = env.GITEA_ADMIN_TOKEN

interface RequestOptions {
  readonly method?: string
  readonly body?: unknown
}

async function giteaFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body } = options
  const url = `${BASE_URL}/api/v1${path}`

  const res = await fetch(url, {
    method,
    headers: {
      'Authorization': `token ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gitea API ${method} ${path} failed (${res.status}): ${text}`)
  }

  return res.json() as Promise<T>
}

/** List all repositories */
export async function listRepos(): Promise<readonly GiteaRepo[]> {
  return giteaFetch<GiteaRepo[]>('/repos/search?limit=50')
    .then(r => (r as unknown as { data: GiteaRepo[] }).data ?? r)
}

/** Get a specific repository */
export async function getRepo(owner: string, name: string): Promise<GiteaRepo> {
  return giteaFetch<GiteaRepo>(`/repos/${owner}/${name}`)
}

/** List commits for a repository */
export async function listCommits(
  owner: string,
  name: string,
  branch?: string,
  limit = 10
): Promise<readonly GiteaCommit[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (branch) params.set('sha', branch)
  return giteaFetch<GiteaCommit[]>(`/repos/${owner}/${name}/git/commits?${params}`)
}

/** Get diff between two commits */
export async function getCommitDiff(
  owner: string,
  name: string,
  sha: string
): Promise<string> {
  const url = `${BASE_URL}/api/v1/repos/${owner}/${name}/git/commits/${sha}`
  const res = await fetch(url, {
    headers: {
      'Authorization': `token ${TOKEN}`,
      'Accept': 'application/diff',
    },
  })

  if (!res.ok) {
    throw new Error(`Failed to get diff for ${sha}: ${res.status}`)
  }

  return res.text()
}

/** Create a webhook on a repository */
export async function createWebhook(
  owner: string,
  name: string,
  targetUrl: string,
  secret: string,
  events: readonly string[] = ['push', 'pull_request']
): Promise<{ readonly id: number }> {
  return giteaFetch<{ readonly id: number }>(`/repos/${owner}/${name}/hooks`, {
    method: 'POST',
    body: {
      type: 'gitea',
      config: {
        url: targetUrl,
        content_type: 'json',
        secret,
      },
      events: [...events],
      active: true,
    },
  })
}

/** Create a new repository */
export async function createRepo(
  name: string,
  description = '',
  isPrivate = true
): Promise<GiteaRepo> {
  return giteaFetch<GiteaRepo>('/user/repos', {
    method: 'POST',
    body: {
      name,
      description,
      private: isPrivate,
      auto_init: true,
      default_branch: 'main',
    },
  })
}

/** Mirror a repository from GitHub */
export async function mirrorFromGitHub(
  githubUrl: string,
  name: string
): Promise<GiteaRepo> {
  return giteaFetch<GiteaRepo>('/repos/migrate', {
    method: 'POST',
    body: {
      clone_addr: githubUrl,
      repo_name: name,
      mirror: true,
      service: 'github',
      private: true,
    },
  })
}
