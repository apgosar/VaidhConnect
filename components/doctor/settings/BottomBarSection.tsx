'use client'

import { useState } from 'react'
import { Section } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { readFailure, networkFailureText } from '@/lib/clientErrors'
import { NAV_LABEL, NAV_SECTIONS, NAV_SLOTS, cleanBottomNav, type NavSection } from '@/lib/bottomNav'

/**
 * Settings → Bottom bar: the public page's bottom bar always has five buttons. About and Book stay; the clinic picks
 * the other three. Saved straight away, like Our Services.
 */
export function BottomBarSection({ value }: { value?: string[] | null }) {
  const [chosen, setChosen] = useState<NavSection[]>(cleanBottomNav(value) ?? [])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const toggle = async (key: NavSection) => {
    const next = chosen.includes(key) ? chosen.filter(k => k !== key) : [...chosen, key]
    setChosen(next); setError(''); setNotice('')
    if (next.length !== NAV_SLOTS) return
    setBusy(true)
    try {
      const res = await fetch('/api/doctor/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bottomNav: next }) })
      if (!res.ok) setError(await readFailure(res, 'Could not save your choice.'))
      else setNotice('Saved. Your public page now shows these buttons.')
    } catch { setError(networkFailureText()) } finally { setBusy(false) }
  }

  return (
    <Section title="Bottom bar buttons" description="The bar at the bottom of your public page has five buttons. About and Book are always there. Choose three more. A button for a section with nothing in it is greyed out.">
      <div className="space-y-3">
        {error && <Alert variant="error">{error}</Alert>}
        {notice && <Alert variant="success">{notice}</Alert>}
        <fieldset className="space-y-2" disabled={busy}>
          <legend className="form-label">Choose {NAV_SLOTS} ({chosen.length} chosen)</legend>
          {NAV_SECTIONS.map(key => {
            const on = chosen.includes(key)
            return (
              <label key={key} className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
                <input type="checkbox" checked={on} disabled={!on && chosen.length >= NAV_SLOTS} onChange={() => toggle(key)} />
                {NAV_LABEL[key]}
              </label>
            )
          })}
        </fieldset>
        {chosen.length === 0 && <p className="text-xs text-slate-500">Until you choose, the page shows the sections that have something in them.</p>}
        {chosen.length > 0 && chosen.length < NAV_SLOTS && <p className="text-xs text-slate-500">Choose {NAV_SLOTS - chosen.length} more to save.</p>}
      </div>
    </Section>
  )
}
