/**
 * Checks the template IDs in lib/whatsappTemplates.ts against Gupshup: each must exist, be APPROVED,
 * and have the number of variables the code sends.
 *
 *   npx tsx --env-file=.env.staging scripts/check-gupshup-templates.ts --app-id <Gupshup app id>
 *
 * Read-only. Needs GUPSHUP_API_KEY in the environment (never pass it on the command line).
 */
import { GUPSHUP_TEMPLATE_IDS, GUPSHUP_TEMPLATE_PARAM_COUNTS } from '../lib/whatsappTemplates'

const appId = process.argv[process.argv.indexOf('--app-id') + 1] || process.env.GUPSHUP_APP_ID
const apiKey = process.env.GUPSHUP_API_KEY
if (!appId || appId.startsWith('--') || !apiKey) { console.error('Need --app-id <id> and GUPSHUP_API_KEY in the environment.'); process.exit(1) }

async function main() {
  const res = await fetch(`https://api.gupshup.io/wa/app/${appId}/template`, { headers: { apikey: apiKey!, Authorization: apiKey! } })
  const text = await res.text()
  if (!res.ok) { console.error(`Gupshup answered ${res.status}: ${text.slice(0, 300)}`); process.exit(1) }
  const list: any[] = JSON.parse(text).templates ?? []

  let bad = 0
  for (const [name, id] of Object.entries(GUPSHUP_TEMPLATE_IDS)) {
    const t = list.find(x => x.id === id)
    if (!t) { console.log(`FAIL  ${name}: id ${id} not found in this app`); bad++; continue }
    const status = String(t.status ?? '').toUpperCase()
    const variables = new Set((String(t.data ?? '').match(/\{\{\d+\}\}/g) ?? [])).size
    const expected = GUPSHUP_TEMPLATE_PARAM_COUNTS[name]
    const issues = [
      status !== 'APPROVED' ? `status ${status}` : '',
      name !== "patient_pin_reset" && variables !== expected ? `${variables} variables, code sends ${expected}` : '',
      t.elementName && t.elementName !== name ? `named "${t.elementName}" in Gupshup` : '',
    ].filter(Boolean)
    console.log(`${issues.length ? 'FAIL' : 'ok  '}  ${name}${issues.length ? ': ' + issues.join('; ') : ''}`)
    if (issues.length) bad++
  }
  process.exitCode = bad ? 1 : 0
}
main()
