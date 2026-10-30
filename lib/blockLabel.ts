import { addDaysYmd, describeYmd, formatSlotLabelInTz, toClinicLocal } from './time'

const day = (ymd: string) => { const p = describeYmd(ymd); return `${p.weekdayShort} ${p.day} ${p.monthShort}` }

/**
 * How a blocked period reads on the Block Schedule page, in the clinic's own time:
 *   "All day · Tue 17 Nov"            midnight to midnight, one day
 *   "All day · Tue 17 Nov – Wed 18 Nov"
 *   "Tue 17 Nov, 02:00 PM – 04:00 PM"  within a day
 *   "Tue 17 Nov, 06:00 PM → Wed 18 Nov, 09:00 AM"
 */
export function describeBlock(start: Date, end: Date, tz: string): { text: string; allDay: boolean } {
  const s = toClinicLocal(start, tz), e = toClinicLocal(end, tz)
  const sDay = s.slice(0, 10), eDay = e.slice(0, 10)
  const allDay = s.slice(11) === '00:00' && e.slice(11) === '00:00' && eDay > sDay
  if (allDay) {
    const last = addDaysYmd(eDay, -1)
    return { allDay, text: last === sDay ? `All day · ${day(sDay)}` : `All day · ${day(sDay)} – ${day(last)}` }
  }
  const t = (d: Date) => formatSlotLabelInTz(d, tz)
  return { allDay, text: sDay === eDay ? `${day(sDay)}, ${t(start)} – ${t(end)}` : `${day(sDay)}, ${t(start)} → ${day(eDay)}, ${t(end)}` }
}

/** The "All day" form values for a block, when it is whole days; otherwise null. */
export function wholeDays(start: Date, end: Date, tz: string): { startDate: string; endDate: string } | null {
  const s = toClinicLocal(start, tz), e = toClinicLocal(end, tz)
  if (s.slice(11) !== '00:00' || e.slice(11) !== '00:00' || e.slice(0, 10) <= s.slice(0, 10)) return null
  return { startDate: s.slice(0, 10), endDate: addDaysYmd(e.slice(0, 10), -1) }
}

/** Quick choices for the Block Schedule form, from the clinic's current date and time. */
export function blockPresets(today: string, nowLocal: string): Array<{ label: string; allDay: boolean; start: string; end: string }> {
  return [
    { label: 'Rest of today', allDay: false, start: nowLocal, end: `${addDaysYmd(today, 1)}T00:00` },
    { label: 'Tomorrow, all day', allDay: true, start: addDaysYmd(today, 1), end: addDaysYmd(today, 1) },
    { label: 'Next 3 days', allDay: true, start: today, end: addDaysYmd(today, 2) },
    { label: 'Next 7 days', allDay: true, start: today, end: addDaysYmd(today, 6) },
  ]
}
