/** Gitea repository info */
export interface GiteaRepo {
  readonly id: number
  readonly name: string
  readonly full_name: string
  readonly description: string
  readonly html_url: string
  readonly clone_url: string
  readonly default_branch: string
  readonly updated_at: string
}

/** Gitea commit info */
export interface GiteaCommit {
  readonly sha: string
  readonly message: string
  readonly author: {
    readonly name: string
    readonly email: string
    readonly date: string
  }
  readonly url: string
}

/** Gitea push webhook payload */
export interface GiteaPushEvent {
  readonly ref: string
  readonly before: string
  readonly after: string
  readonly compare_url: string
  readonly commits: readonly GiteaCommit[]
  readonly repository: GiteaRepo
  readonly pusher: {
    readonly login: string
    readonly full_name: string
  }
}

/** Gitea pull request webhook payload */
export interface GiteaPREvent {
  readonly action: 'opened' | 'closed' | 'reopened' | 'edited' | 'synchronized'
  readonly number: number
  readonly pull_request: {
    readonly id: number
    readonly title: string
    readonly body: string
    readonly state: string
    readonly html_url: string
    readonly user: { readonly login: string }
    readonly head: { readonly ref: string; readonly sha: string }
    readonly base: { readonly ref: string }
    readonly mergeable: boolean | null
  }
  readonly repository: GiteaRepo
}

/** AI code review result */
export interface CodeReviewResult {
  readonly summary: string
  readonly issues: readonly ReviewIssue[]
  readonly approved: boolean
}

export interface ReviewIssue {
  readonly severity: 'critical' | 'high' | 'medium' | 'low'
  readonly file: string
  readonly line?: number
  readonly message: string
  readonly suggestion?: string
}

/** Deploy trigger info */
export interface DeployTrigger {
  readonly projectId: string
  readonly commit: string
  readonly branch: string
  readonly triggeredBy: 'push' | 'manual' | 'pr-merge'
}

/** Gitea issue */
export interface GiteaIssue {
  readonly id: number
  readonly number: number
  readonly title: string
  readonly body: string
  readonly html_url: string
}

/** GitHub mirror config */
export interface MirrorConfig {
  readonly giteaRepo: string
  readonly githubRepo: string
  readonly direction: 'gitea-to-github' | 'github-to-gitea' | 'bidirectional'
  readonly enabled: boolean
}
