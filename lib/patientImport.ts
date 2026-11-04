import { dobFromAge, isValidYmd } from './time'
import { isGender, type Gender } from './gender'
import { normalizePhone } from './validation'

/** Bringing patients over from another system (or a spreadsheet) as a CSV file. */
export const MAX_IMPORT_ROWS = 5000
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024

/** Reads CSV text (commas, optional "quotes", a BOM and Windows line ends are fine) into rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/^﻿/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (quoted) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false } else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some(x => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some(x => x.trim() !== '')) rows.push(row)
  return rows
}

const HEADERS = {
  name: ['name', 'patient name', 'full name', 'patient'],
  phone: ['phone', 'mobile', 'mobile number', 'phone number', 'contact', 'contact no', 'whatsapp'],
  gender: ['gender', 'sex'],
  dob: ['dob', 'date of birth', 'birth date', 'birthdate'],
  age: ['age'],
  email: ['email', 'email id', 'e-mail'],
  history: ['medical history', 'history', 'notes'],
  legacyId: ['id', 'patient id', 'legacy id', 'old id', 'external id'],
} as const
type Field = keyof typeof HEADERS

export interface ImportRow {
  line: number
  name: string
  phone: string
  gender?: Gender
  dob: string
  dobApproximate: boolean
  email?: string
  medicalHistory?: string
  legacyId?: string
}
export interface RejectedRow { line: number; name: string; phone: string; reason: string }

/** Which column holds what, from the header line. Returns a message when name or phone cannot be found. */
export function mapHeaders(header: string[]): { columns: Partial<Record<Field, number>> } | { error: string } {
  const norm = header.map(h => h.trim().toLowerCase().replace(/[_\s]+/g, ' '))
  const columns: Partial<Record<Field, number>> = {}
  for (const field of Object.keys(HEADERS) as Field[]) {
    const at = norm.findIndex(h => (HEADERS[field] as readonly string[]).includes(h))
    if (at >= 0) columns[field] = at
  }
  if (columns.name === undefined || columns.phone === undefined) {
    return { error: 'The first line of the file must name the columns, with at least "name" and "phone" (for example: name,phone,gender,dob).' }
  }
  if (columns.dob === undefined && columns.age === undefined) {
    return { error: 'The file needs a "dob" (date of birth) or an "age" column.' }
  }
  return { columns }
}

/** DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD to YYYY-MM-DD, or null. */
export function parseDate(raw: string): string | null {
  const s = raw.trim()
  let y: string, m: string, d: string, hit: RegExpMatchArray | null
  if ((hit = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) [, y, m, d] = hit
  else if ((hit = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [, d, m, y] = hit
  else return null
  const ymd = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  return isValidYmd(ymd) ? ymd : null
}

const GENDER_WORDS: Record<string, Gender> = { m: 'MALE', male: 'MALE', man: 'MALE', f: 'FEMALE', female: 'FEMALE', woman: 'FEMALE', o: 'OTHER', other: 'OTHER' }

/** An Indian mobile as +91XXXXXXXXXX (accepts +91, 91, 0 prefixes); anything else is refused so it can be checked by hand. */
export function importPhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, '')
  if (/^\+?91\d{10}$/.test(s)) s = s.replace(/^\+?91/, '')
  const p = normalizePhone(s)
  return /^\+91[6-9]\d{9}$/.test(p) ? p : null
}

/** Checks one line of the file. Anything doubtful is rejected with a reason rather than guessed. */
export function checkRow(cells: string[], columns: Partial<Record<Field, number>>, line: number, today: string, markApproximate: boolean): ImportRow | RejectedRow {
  const get = (f: Field) => (columns[f] === undefined ? '' : (cells[columns[f]!] ?? '').trim())
  const name = get('name').replace(/\s+/g, ' ')
  const phoneRaw = get('phone')
  const bad = (reason: string): RejectedRow => ({ line, name, phone: phoneRaw, reason })

  if (name.length < 2) return bad('The name is missing or too short')
  if (name.length > 100) return bad('The name is too long')
  const phone = importPhone(phoneRaw)
  if (!phone) return bad(phoneRaw ? 'The mobile number does not look right (it must be a 10-digit Indian mobile number)' : 'The mobile number is missing')

  let dob: string | null = null
  let approx = markApproximate
  const dobRaw = get('dob'), ageRaw = get('age')
  if (dobRaw) {
    dob = parseDate(dobRaw)
    if (!dob) return bad('The date of birth is not a valid date (use DD-MM-YYYY)')
    if (dob > today || Number(dob.slice(0, 4)) <= 1900) return bad('The date of birth is in the future or too old')
  } else if (/^\d{1,3}$/.test(ageRaw) && Number(ageRaw) <= 120) {
    dob = dobFromAge(Number(ageRaw), today); approx = true
  } else return bad('There is no date of birth or age')

  const genderWord = get('gender').toLowerCase()
  const gender = GENDER_WORDS[genderWord]
  if (genderWord && !gender) return bad('The gender is not Male, Female or Other')

  const email = get('email')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad('The email address is not valid')

  const history = get('history').slice(0, 2000)
  const legacyId = get('legacyId').slice(0, 40)
  return {
    line, name, phone, dob, dobApproximate: approx,
    ...(gender && isGender(gender) ? { gender } : {}),
    ...(email ? { email } : {}),
    ...(history ? { medicalHistory: history } : {}),
    ...(legacyId ? { legacyId } : {}),
  }
}

export const isRejected = (r: ImportRow | RejectedRow): r is RejectedRow => 'reason' in r

/** The key that says two lines are the same person: the same name on the same number. */
export const personKey = (name: string, phone: string) => `${name.trim().toLowerCase().replace(/\s+/g, ' ')}|${phone}`
