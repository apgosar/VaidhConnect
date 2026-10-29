import type { TaperStep } from './constants'

export const MAX_TAPER_STEPS = 12

export interface TaperLine extends TaperStep {
  /** First and last day of this step, counting from day 1 of the course. */
  from: number
  to: number
}

/** Lay the steps out on the course timeline: step 1 is days 1-5, step 2 days 6-10, and so on. */
export function taperSchedule(steps: TaperStep[]): TaperLine[] {
  let day = 1
  return steps.map(step => {
    const days = Math.max(1, Math.floor(Number(step.days) || 1))
    const line = { ...step, days, from: day, to: day + days - 1 }
    day += days
    return line
  })
}

export const taperTotalDays = (steps: TaperStep[]) => taperSchedule(steps).reduce((n, s) => n + s.days, 0)

/** "Day 1" or "Day 1-5" */
export const dayRangeLabel = (line: { from: number; to: number }) =>
  line.from === line.to ? `Day ${line.from}` : `Day ${line.from}-${line.to}`
