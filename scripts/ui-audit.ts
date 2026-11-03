/**
 * Layout audit of EVERY screen on a deployed STAGING site, signed in as each kind of user, at phone, tablet and
 * desktop widths. For each screen and width it records:
 *   - sideways scrolling of the page
 *   - elements that stick out past the right edge of the screen (outside a scrolling box)
 *   - text that overlaps other text
 *   - form fields squeezed too narrow to use
 *   - console errors and failed requests
 * and saves a screenshot, so the result can also be looked at.
 *
 *   npx tsx --env-file=.env.staging scripts/ui-audit.ts --a clinica --a-host <hostA> --admin-host <host in PLATFORM_ADMIN_HOSTS>
 *   ... --widths 320 360 --only settings team     (to narrow it down)
 *
 * Creates one temporary patient/appointment and one temporary operator user, and removes them afterwards.
 * Refuses to run unless FIREBASE_PROJECT_ID contains "staging". Uses the Chrome or Edge on the machine.
 */
import fs from 'node:fs'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import { auth, db, arg } from './_admin'

const projectId = process.env.FIREBASE_PROJECT_ID ?? ''
if (!projectId.includes('staging')) { console.error(`Refusing to run on "${projectId}": not a staging project.`); process.exit(1) }

const a = arg('a')!, aHost = arg('a-host')!, adminHost = arg('admin-host')!
if (!a || !aHost || !adminHost) throw new Error('Required: --a --a-host --admin-host')
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY as string
const list = (flag: string) => { const i = process.argv.indexOf(flag); const out: string[] = []; for (let k = i + 1; i >= 0 && k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]); return out }
const widths = list('--widths').length ? list('--widths').map(Number) : [320, 360, 412, 768, 1280]
const only = list('--only')
const outDir = 'ui-audit'
fs.mkdirSync(outDir, { recursive: true })

async function mintCookie(uid: string, host: string, path: string, name: string) {
  const customToken = await auth.createCustomToken(uid)
  const ex = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
  })
  const { idToken } = await ex.json() as { idToken: string }
  const res = await fetch(`https://${host}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) })
  const c = res.headers.getSetCookie().find(x => x.startsWith(`${name}=`))
  if (!c) throw new Error(`no ${name} cookie from ${host}${path} (HTTP ${res.status})`)
  return c.split(';')[0].slice(name.length + 1)
}

type Who = 'visitor' | 'patient' | 'doctor' | 'operator'
interface Screen { name: string; who: Who; host: () => string; path: () => string; act?: (page: Page) => Promise<void> }
const tap = async (page: Page, name: string | RegExp) => { await page.getByRole('button', { name }).first().click({ timeout: 8000 }); await page.waitForTimeout(700) }

const inspectScript = fs.readFileSync(new URL('./ui-audit-inspect.js', import.meta.url), 'utf8')

async function main() {
  const stamp = Date.now()
  const cleanup: Array<() => Promise<unknown>> = []
  const clinic = (await db.collection('clinics').doc(a).get()).data()!
  const ownerUid = clinic.ownerUid as string

  // a patient with an appointment, so the detail screens have something to show
  const person = { name: `ZZ Audit ${stamp}`, phone: '+91' + (9700000000 + (stamp % 99999999)).toString().padStart(10, '9').slice(0, 10), dob: '1990-05-06' }
  const cfg = (await (await fetch(`https://${aHost}/api/public/config`)).json() as any).config
  let slot: any
  for (let i = 1; i < 15 && !slot; i++) {
    const d = new Date(Date.UTC(+cfg.today.slice(0, 4), +cfg.today.slice(5, 7) - 1, +cfg.today.slice(8, 10) + i)).toISOString().slice(0, 10)
    slot = ((await (await fetch(`https://${aHost}/api/appointments?mode=slots&date=${d}`)).json() as any).slots ?? [])[0]
  }
  const booked = await fetch(`https://${aHost}/api/appointments`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ patient: person, startTime: slot.start, endTime: slot.end, chiefComplaint: 'layout audit', pin: '4827' }) })
  const apptId = ((await booked.json()) as any).appointment?.id as string
  if (!apptId) throw new Error('could not create the audit appointment')
  const patientCookie = booked.headers.getSetCookie().map(c => c.split(';')[0]).find(c => c.startsWith('pp_session='))!.slice('pp_session='.length)
  cleanup.push(async () => { await db.collection('clinics').doc(a).collection('appointments').doc(apptId).delete() })
  cleanup.push(async () => { const s = await db.collection('clinics').doc(a).collection('patients').where('name', '==', person.name).get(); await Promise.all(s.docs.map(d => d.ref.delete())) })
  cleanup.push(async () => { const s = await db.collection('clinics').doc(a).collection('patient_access').get(); await Promise.all(s.docs.map(d => d.ref.delete())) })
  const patientId = (await db.collection('clinics').doc(a).collection('appointments').doc(apptId).get()).data()!.patientId as string

  const adminUser = await auth.createUser({ email: `zz-audit-${stamp}@example.invalid` })
  await auth.setCustomUserClaims(adminUser.uid, { platformAdmin: true })
  cleanup.push(async () => { await auth.deleteUser(adminUser.uid).catch(() => {}) })

  const cookies: Record<Who, { name: string; value: string; host: string } | null> = {
    visitor: null,
    patient: { name: 'pp_session', value: patientCookie, host: aHost },
    doctor: { name: 'session', value: await mintCookie(ownerUid, aHost, '/api/auth/session', 'session'), host: aHost },
    operator: { name: 'admin_session', value: await mintCookie(adminUser.uid, adminHost, '/api/admin/session', 'admin_session'), host: adminHost },
  }

  const A = () => aHost
  const everyScreen: Screen[] = [
    { name: 'home', who: 'visitor', host: A, path: () => '/' },
    { name: 'book', who: 'visitor', host: A, path: () => '/book' },
    { name: 'register', who: 'visitor', host: A, path: () => '/register' },
    { name: 'my-appointments-signed-out', who: 'visitor', host: A, path: () => '/appointments' },
    { name: 'my-appointments', who: 'patient', host: A, path: () => '/appointments' },
    { name: 'doctor-login', who: 'visitor', host: A, path: () => '/doctor/login' },
    { name: 'dashboard', who: 'doctor', host: A, path: () => '/doctor/dashboard' },
    { name: 'calendar', who: 'doctor', host: A, path: () => '/doctor/calendar' },
    { name: 'new-appointment', who: 'doctor', host: A, path: () => '/doctor/appointments/new' },
    { name: 'appointment', who: 'doctor', host: A, path: () => `/doctor/appointments/${apptId}` },
    { name: 'patients', who: 'doctor', host: A, path: () => '/doctor/patients' },
    { name: 'patient', who: 'doctor', host: A, path: () => `/doctor/patients/${patientId}` },
    { name: 'blocked-slots', who: 'doctor', host: A, path: () => '/doctor/blocked-slots' },
    { name: 'settings', who: 'doctor', host: A, path: () => '/doctor/settings' },
    { name: 'team', who: 'doctor', host: A, path: () => '/doctor/team' },
    { name: 'audit', who: 'doctor', host: A, path: () => '/doctor/audit' },
    { name: 'whatsapp-logs', who: 'doctor', host: A, path: () => '/doctor/whatsapp-logs' },
    { name: 'operator-login', who: 'visitor', host: () => adminHost, path: () => '/admin/login' },
    { name: 'operator-console', who: 'operator', host: () => adminHost, path: () => '/admin' },
    // screens that only appear after a tap
    { name: 'doctor-menu-open', who: 'doctor', host: A, path: () => '/doctor/dashboard', act: async p => { await p.getByRole('button', { name: /menu/i }).first().click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(600) } },
    { name: 'calendar-week', who: 'doctor', host: A, path: () => '/doctor/calendar', act: p => tap(p, /^Week$/) },
    { name: 'new-appointment-new-patient', who: 'doctor', host: A, path: () => '/doctor/appointments/new', act: p => tap(p, /New patient/) },
    { name: 'appointment-prescription', who: 'doctor', host: A, path: () => `/doctor/appointments/${apptId}`, act: p => tap(p, /Prescription/) },
    { name: 'appointment-prescription-medicine', who: 'doctor', host: A, path: () => `/doctor/appointments/${apptId}`, act: async p => { await tap(p, /Prescription/); await tap(p, /Add medicine/i); await p.getByText(/Tapering/i).first().click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500) } },
    { name: 'appointment-payment', who: 'doctor', host: A, path: () => `/doctor/appointments/${apptId}`, act: p => tap(p, /Payment/) },
    { name: 'appointment-reschedule', who: 'doctor', host: A, path: () => `/doctor/appointments/${apptId}`, act: p => tap(p, /Reschedule/) },
    { name: 'blocked-slots-all-options', who: 'doctor', host: A, path: () => '/doctor/blocked-slots', act: async p => { await p.getByRole('switch', { name: /repeat/i }).click({ timeout: 4000 }).catch(() => {}); await p.getByRole('switch', { name: /all day/i }).click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(500) } },
    { name: 'my-appointments-reschedule', who: 'patient', host: A, path: () => '/appointments', act: p => tap(p, /^Reschedule/) },
    { name: 'my-appointments-cancel', who: 'patient', host: A, path: () => '/appointments', act: p => tap(p, /Cancel Appointment/) },
    { name: 'book-choose-time', who: 'visitor', host: A, path: () => '/book', act: async p => {
        await p.getByPlaceholder(/full name/i).fill('Audit Person'); await p.getByPlaceholder(/98765/).fill('9876543210')
        await p.locator('input[type=date]').fill('1990-01-01'); await p.locator('textarea').first().fill('Fever'); await tap(p, /Continue to Book/) } },
    { name: 'operator-new-clinic', who: 'operator', host: () => adminHost, path: () => '/admin', act: p => tap(p, /New clinic/) },
  ]
  const screens = everyScreen.filter(s => !only.length || only.some(o => s.name.includes(o)))

  let browser: Browser | undefined
  for (const channel of ['chrome', 'msedge']) { try { browser = await chromium.launch({ channel }); break } catch { /* next */ } }
  if (!browser) throw new Error('Neither Chrome nor Edge could be started.')

  const rows: Array<Record<string, unknown>> = []
  let problems = 0
  try {
    for (const s of screens) {
      for (const width of widths) {
        const ctx: BrowserContext = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 1, hasTouch: width < 768, isMobile: width < 768 })
        const ck = cookies[s.who]
        if (ck) await ctx.addCookies([{ name: ck.name, value: ck.value, domain: ck.host, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }])
        const page = await ctx.newPage()
        const errors: string[] = []
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 140)) })
        page.on('pageerror', e => errors.push(String(e).slice(0, 140)))
        page.on('response', r => { if (r.status() >= 500) errors.push(`${r.status()} ${new URL(r.url()).pathname}`) })
        let note = ''
        try {
          await page.goto(`https://${s.host()}${s.path()}`, { waitUntil: 'load', timeout: 60000 })
          await page.waitForTimeout(1500)
          if (s.act) { try { await s.act(page); await page.waitForTimeout(500) } catch (e) { note = `COULD NOT OPEN THIS STATE (${String(e).slice(0, 90).replace(/\s+/g, ' ')})` } }
          const url = new URL(page.url())
          if (s.who !== 'visitor' && /login/.test(url.pathname)) note = 'REDIRECTED TO LOGIN'
          const r = (await page.evaluate(inspectScript)) as { pageOverflow: number; sticksOut: string[]; spills: string[]; overlaps: string[]; tooNarrow: string[] }
          const height = await page.evaluate(() => document.documentElement.scrollHeight)
          await page.screenshot({ path: `${outDir}/${s.name}-${width}.png`, fullPage: true, clip: { x: 0, y: 0, width, height: Math.min(height, Number(process.env.AUDIT_MAX_HEIGHT ?? 2600)) } })
          const bad = r.pageOverflow > 0 || r.sticksOut.length || r.spills.length || r.overlaps.length || r.tooNarrow.length || errors.length || note
          if (bad) {
            problems++
            console.log(`\n✗ ${s.name} @${width}${note ? '  ' + note : ''}`)
            if (r.pageOverflow > 0) console.log(`    page scrolls sideways by ${r.pageOverflow}px`)
            for (const x of r.sticksOut) console.log(`    sticks out: ${x}`)
            for (const x of r.spills) console.log(`    spills out of its box: ${x}`)
            for (const x of r.overlaps) console.log(`    overlap: ${x}`)
            for (const x of r.tooNarrow) console.log(`    narrow field: ${x}`)
            for (const x of [...new Set(errors)].slice(0, 4)) console.log(`    console: ${x}`)
          }
          rows.push({ screen: s.name, width, overflow: r.pageOverflow, out: r.sticksOut.length, spill: r.spills.length, overlap: r.overlaps.length, narrow: r.tooNarrow.length, errors: errors.length })
        } catch (e) {
          problems++
          console.log(`\n✗ ${s.name} @${width}  could not load: ${String(e).slice(0, 120)}`)
        }
        await ctx.close()
      }
    }
  } finally {
    await browser.close()
    for (const fn of cleanup.reverse()) await fn().catch(() => {})
  }
  console.log(`\n${screens.length} screens × ${widths.length} widths. ${problems} with problems. Screenshots are in ./${outDir}`)
  process.exit(problems ? 1 : 0)
}
main().catch(e => { console.error(e); process.exit(1) })
