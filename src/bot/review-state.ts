import { env } from '../config/env.js'

/** Runtime review mode state — defaults to env config, toggleable via /review */
let reviewEnabled: boolean = env.REVIEW_ENABLED

export function isReviewEnabled(): boolean {
  return reviewEnabled
}

export function setReviewEnabled(on: boolean): void {
  reviewEnabled = on
}
