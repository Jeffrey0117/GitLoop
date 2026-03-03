import { env } from '../config/env.js'

/** Runtime learn mode state — defaults to env config, toggleable via /learn */
let learnMode: boolean = env.LEARN_MODE

export function isLearnModeOn(): boolean {
  return learnMode
}

export function setLearnMode(on: boolean): void {
  learnMode = on
}
