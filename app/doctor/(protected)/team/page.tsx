'use client'

import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Copy, Check } from 'lucide-react'

interface Member { uid: string; email: string | null; name: string | null; role: 'OWNER' | 'DOCTOR' | 'STAFF'; disabled?: boolean }

const ROLE_HELP: Record<string, string> = {
  OWNER: 'Everything, including the team',
  DOCTOR: 'Clinical work and settings',
  STAFF: 'Front desk: bookings, patients, payments',
}

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', role: 'STAFF' as 'DOCTOR' | 'STAFF' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState('')
  const [notice, setNotice] = useState('')
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/doctor/team')
    if (res.ok) setMembers((await res.json()).members)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  const invite = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setLink(''); setNotice('')
    const res = await fetch('/api/doctor/team', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not add this person'); return }
    setForm({ name: '', email: '', role: 'STAFF' })
    if (data.link) setLink(data.link)
    else setNotice(`We emailed ${data.member.email} a link to set their password.`)
    load()
  }

  const update = async (uid: string, patch: { role?: 'DOCTOR' | 'STAFF'; disabled?: boolean }) => {
    const res = await fetch('/api/doctor/team', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid, ...patch }) })
    if (!res.ok) setError((await res.json()).error ?? 'Could not update')
    load()
  }

  return (
    <div className="space-y-6 max-w-3xl animate-fade-in">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Team</h1>

      <section className="card p-5 space-y-4">
        <h2 className="font-semibold flex items-center gap-2"><UserPlus size={16} /> Add someone</h2>
        <form onSubmit={invite} className="grid sm:grid-cols-4 gap-3 items-end">
          <div className="form-group sm:col-span-1"><label className="form-label">Name</label><input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
          <div className="form-group sm:col-span-1"><label className="form-label">Email</label><input type="email" className="form-input" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
          <div className="form-group sm:col-span-1">
            <label className="form-label">Role</label>
            <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'DOCTOR' | 'STAFF' }))}>
              <option value="STAFF">Front desk</option>
              <option value="DOCTOR">Doctor</option>
            </select>
          </div>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Adding…' : 'Add'}</button>
        </form>
        <p className="text-xs" style={{ color: 'var(--color-sage)' }}>
          Front desk: {ROLE_HELP.STAFF}. Doctor: {ROLE_HELP.DOCTOR}. They set their own password from an emailed link.
        </p>
        {error && <p className="form-error">{error}</p>}
        {notice && <p className="text-sm" style={{ color: 'var(--color-pine)' }}>{notice}</p>}
        {link && (
          <div className="rounded-lg p-3 text-sm space-y-2" style={{ background: 'var(--color-primary-bg)' }}>
            <p>Email isn’t set up for this clinic, so share this one-time link with them yourself:</p>
            <div className="flex gap-2">
              <input readOnly className="form-input text-xs" value={link} onFocus={e => e.currentTarget.select()} />
              <button type="button" className="btn btn-outline btn-sm" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="card overflow-hidden">
        {loading ? <div className="flex justify-center py-10"><div className="spinner" /></div> : (
          <ul>
            {members.map(m => (
              <li key={m.uid} className="flex flex-wrap items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--color-sage-border)' }}>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{m.name ?? m.email}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--color-sage)' }}>{m.email}</p>
                </div>
                {m.role === 'OWNER' ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}>Owner</span>
                ) : (
                  <>
                    <select className="form-input w-auto text-sm" value={m.role} disabled={m.disabled} onChange={e => update(m.uid, { role: e.target.value as 'DOCTOR' | 'STAFF' })}>
                      <option value="STAFF">Front desk</option>
                      <option value="DOCTOR">Doctor</option>
                    </select>
                    <button className={`btn btn-sm ${m.disabled ? 'btn-primary' : 'btn-outline'}`} onClick={() => update(m.uid, { disabled: !m.disabled })}>
                      {m.disabled ? 'Restore access' : 'Remove access'}
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
