// Fails if tenant-owned collections are referenced outside lib/db/tenant.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const TENANT = ['patients', 'appointments', 'prescriptions', 'payments', 'blocked_slots', 'whatsapp_logs']
const re = new RegExp(String.raw`adminDb\s*\.collection\(\s*['"](${TENANT.join('|')})['"]`)
const bad = []

function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) { if (f !== 'node_modules' && f !== '.next') walk(p) }
    else if (/\.(ts|tsx)$/.test(f) && !p.split('\\').join('/').endsWith('lib/db/tenant.ts')) {
      readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
        if (re.test(line)) bad.push(`${p}:${i + 1}: ${line.trim()}`)
      })
    }
  }
}
for (const d of ['app', 'lib', 'components']) walk(d)
if (bad.length) { console.error(`${bad.length} direct tenant-collection access(es):\n` + bad.join('\n')); process.exit(1) }
console.log('tenant access check passed')
