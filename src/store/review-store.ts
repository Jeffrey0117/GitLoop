import { randomBytes } from 'node:crypto'
import type { CodeReviewResult } from '../types/index.js'

/** Context stored for each review */
export interface ReviewContext {
  readonly repo: string
  readonly commit: string
  readonly result: CodeReviewResult
  readonly createdAt: number
}

/** In-memory store: short hex ID → full review context */
const store = new Map<string, ReviewContext>()

const ID_LENGTH = 4 // 4 bytes = 8 hex chars
const MAX_AGE_MS = 60 * 60 * 1000 // 1 hour
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes
const MAX_STORE_SIZE = 1000

/** Store a review result and return an 8-char hex ID */
export function storeReview(
  repo: string,
  commit: string,
  result: CodeReviewResult
): string {
  // Evict oldest if at capacity
  if (store.size >= MAX_STORE_SIZE) {
    const oldestId = store.keys().next().value
    if (oldestId) store.delete(oldestId)
  }

  // Generate unique ID with collision check
  let id: string
  do {
    id = randomBytes(ID_LENGTH).toString('hex')
  } while (store.has(id))

  const context: ReviewContext = {
    repo,
    commit,
    result,
    createdAt: Date.now(),
  }
  store.set(id, context)
  return id
}

/** Retrieve a stored review by ID (extends TTL on access) */
export function getReview(id: string): ReviewContext | undefined {
  const review = store.get(id)
  if (review) {
    store.set(id, { ...review, createdAt: Date.now() })
  }
  return review
}

/** Delete a stored review by ID */
export function deleteReview(id: string): void {
  store.delete(id)
}

/** Start periodic cleanup of expired reviews */
export function startReviewCleanup(): void {
  setInterval(() => {
    const now = Date.now()
    for (const [id, ctx] of store) {
      if (now - ctx.createdAt > MAX_AGE_MS) {
        store.delete(id)
      }
    }
  }, CLEANUP_INTERVAL_MS)
}
