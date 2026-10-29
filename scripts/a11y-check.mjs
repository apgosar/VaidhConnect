/**
 * Accessibility and responsiveness check of the patient pages on a running site, in a real browser:
 *
 *   npm run a11y:check -- --host clinica---swasthya-connect-staging-vhgr7hjm4q-el.a.run.app
 *   npm run a11y:check -- --host <host> --pages / /register /appointments --widths 360 768 1280
 *
 * For every page at every width it runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules), measures sideways
 * overflow and tap targets, and saves a screenshot to ./a11y-report. It exits with 1 if axe finds a
 * serious or critical violation or a page scrolls sideways, so it can gate a release.
 *
 * Uses the browser already on the machine (Chrome or Edge); nothing is downloaded. The doctor pages need a
 * login and are not covered here.
 */
import { chromium } from 'playwright-core'
import AxeBuilder from '@axe-core/playwright'
import fs from 'node:fs'

const args = process.argv.slice(2)
const take = flag => {
  const i = args.indexOf(flag)
  if (i < 0) return []
  const out = []
  for (let k = i + 1; k < args.length && !args[k].startsWith('--'); k++) out.push(args[k])
  return out
}
const host = take('--host')[0]
if (!host) { console.error('Required: --host <hostname>'); process.exit(2) }
const pages = take('--pages').length ? take('--pages') : ['/', '/register', '/appointments', '/doctor/login']
const widths = take('--widths').length ? take('--widths').map(Number) : [360, 768, 1280]
const outDir = 'a11y-report'
fs.mkdirSync(outDir, { recursive: true })

async function launch() {
  for (const channel of ['chrome', 'msedge']) {
    try { return await chromium.launch({ channel }) } catch { /* try the next one */ }
  }
  throw new Error('Neither Chrome nor Edge could be started. Install one of them.')
}

const browser = await launch()
let failed = false
const rows = []

for (const path of pages) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    await page.goto(`https://${host}${path}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200) // entrance animations settle before measuring

    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
    const serious = axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')

    const metrics = await page.evaluate(() => {
      const over = document.documentElement.scrollWidth - window.innerWidth
      const targets = [...document.querySelectorAll('a,button,input,select,textarea,[role=button],[role=switch]')]
        .filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 })
      const small = targets.filter(e => { const r = e.getBoundingClientRect(); return r.height < 24 || r.width < 24 })
      return { over, smallTargets: small.length }
    })

    const shot = `${outDir}/${(path === '/' ? 'home' : path.replace(/\//g, '_').replace(/^_/, ''))}-${width}.png`
    await page.screenshot({ path: shot, fullPage: true })
    await context.close()

    const bad = serious.length > 0 || metrics.over > 0
    if (bad) failed = true
    rows.push({ page: path, width, violations: axe.violations.length, serious: serious.length, overflowPx: metrics.over, tinyTargets: metrics.smallTargets })
    for (const v of serious) console.log(`  ${path} @${width}: [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} element${v.nodes.length === 1 ? '' : 's'})`)
  }
}

await browser.close()
console.table(rows)
console.log(failed ? 'FAILED: serious accessibility problems or sideways scrolling found.' : `OK: no serious violations and no sideways scrolling. Screenshots are in ./${outDir}`)
process.exit(failed ? 1 : 0)
