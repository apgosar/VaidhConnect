import { getSession } from '@/lib/auth/session'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { formatDateTimeInTz } from '@/lib/time'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Activity log' }

// Who did what to clinical data, newest first. Owner-only (see ./layout.tsx).
export default async function AuditPage() {
  const session = await getSession()
  const tenant = await getTenant()
  if (!session || !tenant) notFound()

  const snap = await tenantDb(tenant).col('audit_logs').orderBy('at', 'desc').limit(200).get()
  const rows = snap.docs.map(d => d.data() as any)

  return (
    <div className="space-y-4 max-w-5xl animate-fade-in">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Activity log</h1>
      <p className="text-sm" style={{ color: 'var(--color-sage)' }}>The most recent 200 actions on patient, appointment, prescription and payment records.</p>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left" style={{ color: 'var(--color-sage)' }}>
              <th className="px-4 py-3">When</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: 'var(--color-sage)' }}>Nothing recorded yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--color-sage-border)' }}>
                <td className="px-4 py-2 whitespace-nowrap font-tabular">{formatDateTimeInTz(r.at.toDate(), tenant.timezone)}</td>
                <td className="px-4 py-2">{r.actorEmail ?? r.actorUid} <span className="text-xs" style={{ color: 'var(--color-sage)' }}>{r.role}</span></td>
                <td className="px-4 py-2">{r.action}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
