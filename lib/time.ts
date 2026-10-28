/**
 * Clinic-timezone helpers. Servers run in UTC (or whatever the container is
 * set to), so anything that depends on "today", "the hour" or how a time reads
 * to the patient must be computed in the clinic's own timezone.
 */
const parts = (date: Date, tz: string, opts: Intl.DateTimeFormatOptions) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts })
      .formatToParts(date)
      .map(p => [p.type, p.value]),
  ) as Record<string, string>

/** Local hour of day (0-23) in the timezone. */
export function hourInTz(date: Date, tz: string): number {
  return Number(parts(date, tz, { hour: '2-digit', hourCycle: 'h23' }).hour)
}

/** Local calendar date as YYYY-MM-DD in the timezone. */
export function ymdInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { year: 'numeric', month: '2-digit', day: '2-digit' })
  return `${p.year}-${p.month}-${p.day}`
}

/** Offset of the timezone from UTC at the given instant, in ms. */
function offsetMs(date: Date, tz: string): number {
  const p = parts(date, tz, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The UTC instants bounding the local calendar day containing `date`. */
export function dayBoundsInTz(date: Date, tz: string): { start: Date; end: Date } {
  const [y, m, d] = ymdInTz(date, tz).split('-').map(Number)
  const localMidnightUtc = (day: number) => {
    const guess = Date.UTC(y, m - 1, day)
    // Two passes handle offsets that change on the day (DST).
    let t = guess - offsetMs(new Date(guess), tz)
    t = guess - offsetMs(new Date(t), tz)
    return t
  }
  return { start: new Date(localMidnightUtc(d)), end: new Date(localMidnightUtc(d + 1) - 1) }
}

/** "10:30 AM" */
export function formatTimeInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { hour: 'numeric', minute: '2-digit', hour12: true })
  return `${p.hour}:${p.minute} ${p.dayPeriod}`
}

/** "28 Oct 2026, 10:30 AM" */
export function formatDateTimeInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} ${p.dayPeriod}`
}

/** "October 28, 2026" */
export function formatDateLongInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { month: 'long', day: 'numeric', year: 'numeric' })
  return `${p.month} ${p.day}, ${p.year}`
}
