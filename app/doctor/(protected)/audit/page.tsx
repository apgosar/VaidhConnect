import { getSession } from '@/lib/auth/session'
import { getTenant } from '@/lib/tenant/resolve'
import { tenantDb } from '@/lib/db/tenant'
import { formatDateTimeInTz } from '@/lib/time'
import { notFound } from 'next/navigation'
import { ResponsiveTable } from '@/components/ui/ResponsiveTable'
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
      <ResponsiveTable
        caption="Activity log"
        empty="Nothing recorded yet."
        rows={rows}
        rowKey={(_, i) => i}
        columns={[
          { label: 'When', className: 'whitespace-nowrap font-tabular', render: r => formatDateTimeInTz(r.at.toDate(), tenant.timezone) },
          { label: 'Who', render: r => <>{r.actorEmail ?? r.actorUid} <span className="text-xs" style={{ color: 'var(--color-sage)' }}>{r.role}</span></> },
          { label: 'Action', render: r => r.action },
          { label: 'Record', className: 'font-mono text-xs', render: r => <span className="font-mono text-xs">{r.target}</span> },
        ]}
      />
    </div>
  )
}
