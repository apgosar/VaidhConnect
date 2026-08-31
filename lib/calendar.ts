export interface CalendarEventDetails {
  id?: string
  title: string
  description: string
  location?: string
  startTime: Date | string
  endTime: Date | string
}

function formatToUtcBasic(dateInput: Date | string): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/**
 * Generates a Google Calendar event creation URL.
 */
export function createGoogleCalendarUrl(event: CalendarEventDetails): string {
  const startUtc = formatToUtcBasic(event.startTime)
  const endUtc = formatToUtcBasic(event.endTime)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${startUtc}/${endUtc}`,
    details: event.description,
  })

  if (event.location) {
    params.set('location', event.location)
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/**
 * Escapes characters for iCalendar string fields per RFC 5545.
 */
function escapeIcsText(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Generates valid iCalendar (.ics) RFC 5545 content.
 */
export function generateIcsContent(event: CalendarEventDetails): string {
  const startUtc = formatToUtcBasic(event.startTime)
  const endUtc = formatToUtcBasic(event.endTime)
  const nowUtc = formatToUtcBasic(new Date())
  const uid = event.id ? `${event.id}@clinic` : `${Date.now()}-${Math.random().toString(36).slice(2)}@clinic`

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Clinic Management App//Appointment Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowUtc}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
  ]

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`)
  }

  lines.push('STATUS:CONFIRMED')
  lines.push('END:VEVENT')
  lines.push('END:VCALENDAR')

  return lines.join('\r\n')
}

/**
 * Initiates an in-browser download of an .ics file for Apple Calendar / Outlook / iCal.
 */
export function downloadIcsFile(event: CalendarEventDetails, filename = 'appointment.ics') {
  const icsData = generateIcsContent(event)
  const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
