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

/** Exported for slot generation: offset of the timezone from UTC at an instant. */
export { offsetMs }

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/** Weekday name of a YYYY-MM-DD calendar date (timezone-independent). */
export function dayNameOfYmd(ymd: string): typeof DAY_NAMES[number] {
  const [y, m, d] = ymd.split('-').map(Number)
  return DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

/** YYYY-MM-DD plus n calendar days. */
export function addDaysYmd(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** The UTC instant at which the clinic's wall clock reads `ymd` `hhmm`. */
export function zonedToUtc(ymd: string, hhmm: string, tz: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  let t = guess - offsetMs(new Date(guess), tz)
  t = guess - offsetMs(new Date(t), tz) // second pass handles DST edges
  return new Date(t)
}

/** "09:00 AM" — two-digit hour, the format patients already see in slot pickers. */
export function formatSlotLabelInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { hour: '2-digit', minute: '2-digit', hour12: true })
  return `${p.hour}:${p.minute} ${p.dayPeriod}`
}

/** "Wednesday, 28 Oct" */
export function formatDayHeadingInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { weekday: 'long', day: '2-digit', month: 'short' })
  return `${p.weekday}, ${p.day} ${p.month}`
}

/** True if the YYYY-MM-DD string is a real calendar date. */
export function isValidYmd(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Label parts for a YYYY-MM-DD calendar date (no timezone involved). */
export function describeYmd(ymd: string): { weekdayShort: string; weekdayLong: string; day: string; monthShort: string } {
  const [y, m, d] = ymd.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...o }).format(dt)
  return { weekdayShort: f({ weekday: "short" }), weekdayLong: f({ weekday: "long" }), day: String(d), monthShort: f({ month: "short" }) }
}

/** "28 Oct 2026" */
export function formatDateShortInTz(date: Date, tz: string): string {
  const p = parts(date, tz, { day: '2-digit', month: 'short', year: 'numeric' })
  return `${p.day} ${p.month} ${p.year}`
}
