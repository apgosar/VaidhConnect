'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Copy, Check, LogOut } from 'lucide-react'
import { LoadingBlock } from '@/components/ui/Spinner'

interface Clinic {
  id: string; storage: 'legacy' | 'scoped'; clinicName: string; doctor: string | null; email: string | null
  status: 'active' | 'suspended'; timezone: string; features: Record<string, boolean>
  theme: string | null; domains: string[]
}

const blank = { id: '', name: '', doctor: '', email: '', domain: '', timezone: 'Asia/Kolkata', primary: '' }

export default function AdminPage() {
  const router = useRouter()
  const [clinics, setClinics] = useState<Clinic[] | null>(null)
  const [featureNames, setFeatureNames] = useState<string[]>([])
  const [form, setForm] = useState(blank)
  const [showForm, setShowForm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [link, setLink] = useState<{ label: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [newDomain, setNewDomain] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const me = await fetch('/api/admin/session')
    if (me.status === 404) { setError('The console is not enabled on this host.'); setClinics([]); return }
    if (!(await me.json()).authenticated) { router.replace('/admin/login'); return }
    const res = await fetch('/api/admin/clinics')
    const data = await res.json()
    setClinics(data.clinics); setFeatureNames(data.features)
  }, [router])
  useEffect(() => { load() }, [load])

  const patch = async (id: string, body: Record<string, unknown>, label?: string) => {
    setError('')
    const res = await fetch(`/api/admin/clinics/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Update failed'); return }
    if (data.passwordResetLink) setLink({ label: label ?? 'Password link', url: data.passwordResetLink })
    load()
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(''); setLink(null)
    const res = await fetch('/api/admin/clinics', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, primary: form.primary || undefined }) })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Could not create the clinic'); return }
    setLink({ label: `Owner link for ${data.clinicId}`, url: data.passwordResetLink })
    setForm(blank); setShowForm(false); load()
  }

  const signOut = async () => { await fetch('/api/admin/session', { method: 'DELETE' }); router.replace('/admin/login') }

  if (!clinics) return <LoadingBlock className="py-20" />

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ backgroundColor: 'var(--color-linen)' }}>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Clinics <span className="text-base font-normal" style={{ color: 'var(--color-sage)' }}>({clinics.length})</span></h1>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}><Plus size={16} /> New clinic</button>
            <button className="btn btn-outline" onClick={signOut}><LogOut size={16} /> Sign out</button>
          </div>
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}
        {link && (
          <div className="card p-4 text-sm space-y-2">
            <p className="font-medium">{link.label} — one-time link, shown once:</p>
            <div className="flex gap-2">
              <input aria-label={link.label} readOnly className="form-input text-xs" value={link.url} onFocus={e => e.currentTarget.select()} />
              <button className="btn btn-outline btn-sm" onClick={async () => { await navigator.clipboard.writeText(link.url); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={create} className="card p-5 grid sm:grid-cols-3 gap-3">
            {([['id', 'Clinic id (a-z, 0-9, -)'], ['name', 'Clinic name'], ['doctor', 'Doctor name'], ['email', 'Owner email'], ['domain', 'Hostname (e.g. drshah.example.in)'], ['timezone', 'Timezone'], ['primary', 'Brand colour (optional, #RRGGBB)']] as const).map(([k, label]) => (
              <div className="form-group" key={k}>
                <label className="form-label" htmlFor={`new-clinic-${k}`}>{label}</label>
                <input id={`new-clinic-${k}`} className="form-input" required={k !== 'primary'} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} />
              </div>
            ))}
            <div className="flex items-end"><button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Creating…' : 'Create clinic'}</button></div>
          </form>
        )}

        <div className="space-y-4">
          {clinics.map(c => (
            <div key={`${c.storage}-${c.id}`} className="card p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{c.clinicName} <span className="text-xs font-normal" style={{ color: 'var(--color-sage)' }}>· {c.id} · {c.storage}</span></h2>
                  <p className="text-sm" style={{ color: 'var(--color-sage)' }}>{c.doctor ? `Dr. ${c.doctor}` : ''} {c.email ? `· ${c.email}` : ''} · {c.timezone}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: c.status === 'active' ? 'rgba(28,92,70,0.12)' : 'rgba(181,74,60,0.12)', color: c.status === 'active' ? 'var(--color-pine)' : '#B54A3C' }}>{c.status}</span>
                  <button className="btn btn-outline btn-sm" onClick={() => patch(c.id, { status: c.status === 'active' ? 'suspended' : 'active' })}>{c.status === 'active' ? 'Suspend' : 'Reactivate'}</button>
                  {c.email && <button className="btn btn-ghost btn-sm" onClick={() => patch(c.id, { resetOwnerPassword: true }, `Password link for ${c.email}`)}>Reset owner password</button>}
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-sm">
                {featureNames.map(f => (
                  <label key={f} className="flex items-center gap-1.5">
                    <input type="checkbox" checked={c.features[f]} onChange={e => patch(c.id, { features: { [f]: e.target.checked } })} /> {f}
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  {c.domains.length === 0 && <span style={{ color: 'var(--color-sage)' }}>No hostnames mapped</span>}
                  {c.domains.map(d => (
                    <span key={d} className="inline-flex items-center gap-1 rounded-full px-3 py-1" style={{ background: 'var(--color-primary-bg)' }}>
                      {d}<button aria-label={`Remove ${d}`} className="opacity-60 hover:opacity-100" onClick={() => patch(c.id, { removeDomain: d })}>×</button>
                    </span>
                  ))}
                </div>
                <form className="flex gap-2" onSubmit={e => { e.preventDefault(); const d = newDomain[c.id]; if (d) { patch(c.id, { addDomain: d }); setNewDomain(s => ({ ...s, [c.id]: '' })) } }}>
                  <input aria-label={`Add a hostname to ${c.id}`} className="form-input text-sm" placeholder="Add hostname" value={newDomain[c.id] ?? ''} onChange={e => setNewDomain(s => ({ ...s, [c.id]: e.target.value }))} />
                  <button className="btn btn-outline btn-sm">Add</button>
                </form>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs" style={{ color: 'var(--color-sage)' }}>Changes to status, plan flags and hostnames reach live traffic within about a minute.</p>
      </div>
    </div>
  )
}
