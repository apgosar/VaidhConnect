'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Trash2, Calendar, Clock, Pencil, Repeat, AlertTriangle } from 'lucide-react'
import { addDaysYmd, formatSlotLabelInTz, toClinicLocal } from '@/lib/time'
import { blockPresets, describeBlock, wholeDays } from '@/lib/blockLabel'
import { networkFailureText, readFailure } from '@/lib/clientErrors'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/Spinner'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'
import { TextField } from '@/components/ui/Field'

interface Conflict { id: string; patientName: string; startTime: string }
interface Block { id: string; startTime: string; endTime: string; reason: string | null; seriesId: string | null; conflicts: Conflict[] }

/** Booked appointments that fall inside a blocked period: they are not cancelled; the doctor chooses what to do. */
function Conflicts({ conflicts, timezone }: { conflicts: Conflict[]; timezone: string }) {
  if (conflicts.length === 0) return null
  return (
    <Alert variant="warning" className="text-sm">
      <p className="font-medium flex items-center gap-1.5">
        <AlertTriangle size={14} aria-hidden="true" />
        {conflicts.length} booked appointment{conflicts.length === 1 ? '' : 's'} fall{conflicts.length === 1 ? 's' : ''} in this period
      </p>
      <p className="text-xs mt-1">They are still booked. Open each to move it to another time, or cancel it.</p>
      <ul className="mt-2 space-y-1">
        {conflicts.map(c => (
          <li key={c.id}>
            <Link href={`/doctor/appointments/${c.id}`} className="underline font-medium">{c.patientName}</Link>
            <span className="text-xs"> · {new Date(c.startTime).toLocaleDateString('en-GB', { timeZone: timezone, day: '2-digit', month: 'short' })}, {formatSlotLabelInTz(new Date(c.startTime), timezone)}</span>
          </li>
        ))}
      </ul>
    </Alert>
  )
}

export default function BlockedSlotsPage() {
  const [blocks, setBlocks] = useState<Block[]>([])
  const [timezone, setTimezone] = useState('Asia/Kolkata')
  const [today, setToday] = useState('')
  const [nowLocal, setNowLocal] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // create form
  const [allDay, setAllDay] = useState(false)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [repeat, setRepeat] = useState(false)
  const [repeatUntil, setRepeatUntil] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<{ count: number; conflicts: Conflict[] } | null>(null)

  // editing one block
  const [editing, setEditing] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editReason, setEditReason] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [editConflicts, setEditConflicts] = useState<{ id: string; list: Conflict[] } | null>(null)

  // deleting
  const [removeSeries, setRemoveSeries] = useState<Block | null>(null)
  const { confirm, dialog } = useConfirm()

  const fetchBlocks = useCallback(async () => {
    setLoading(true); setLoadError('')
    try {
      const res = await fetch('/api/doctor/blocked-slots')
      if (!res.ok) { setLoadError(await readFailure(res, 'Could not load the blocked periods.')); return }
      const data = await res.json()
      setBlocks(data.blocks ?? []); setTimezone(data.timezone ?? 'Asia/Kolkata'); setToday(data.today ?? ''); setNowLocal(data.nowLocal ?? '')
    } catch {
      setLoadError(networkFailureText())
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { fetchBlocks() }, [fetchBlocks])

  const applyPreset = (p: ReturnType<typeof blockPresets>[number]) => {
    setError(''); setCreated(null); setAllDay(p.allDay)
    if (p.allDay) { setStartDate(p.start); setEndDate(p.end) } else { setStartTime(p.start); setEndTime(p.end) }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setCreated(null)
    const start = allDay ? (startDate && `${startDate}T00:00`) : startTime
    const end = allDay ? (endDate && `${addDaysYmd(endDate, 1)}T00:00`) : endTime
    if (!start || !end) { setError(allDay ? 'Please choose the first and last day' : 'Please set start and end times'); return }
    if (allDay && endDate < startDate) { setError('The last day cannot be before the first day'); return }
    if (!allDay && end <= start) { setError('End time must be after start time'); return }
    if (repeat && !repeatUntil) { setError('Choose the date to repeat until'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/doctor/blocked-slots', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start, end, reason, ...(repeat ? { repeat: { until: repeatUntil } } : {}) }),
      })
      if (!res.ok) { setError(await readFailure(res, 'Could not block this period')); return }
      const data = await res.json()
      setCreated({ count: data.blocks?.length ?? 1, conflicts: data.conflicts ?? [] })
      setStartTime(''); setEndTime(''); setStartDate(''); setEndDate(''); setReason(''); setRepeat(false); setRepeatUntil('')
      fetchBlocks()
    } catch {
      setError(networkFailureText())
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (b: Block) => {
    setEditing(b.id); setEditError(''); setEditConflicts(null)
    setEditStart(toClinicLocal(new Date(b.startTime), timezone)); setEditEnd(toClinicLocal(new Date(b.endTime), timezone)); setEditReason(b.reason ?? '')
  }

  const saveEdit = async (id: string) => {
    setEditError('')
    if (!editStart || !editEnd) { setEditError('Please set start and end times'); return }
    if (editEnd <= editStart) { setEditError('End time must be after start time'); return }
    setEditSaving(true)
    try {
      const res = await fetch('/api/doctor/blocked-slots', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, start: editStart, end: editEnd, reason: editReason }),
      })
      if (!res.ok) { setEditError(await readFailure(res, 'Could not save the changes')); return }
      const data = await res.json()
      setEditing(null)
      setEditConflicts(data.conflicts?.length ? { id, list: data.conflicts } : null)
      fetchBlocks()
    } catch {
      setEditError(networkFailureText())
    } finally {
      setEditSaving(false)
    }
  }

  const remove = async (b: Block, scope: 'this' | 'series') => {
    try {
      const res = await fetch('/api/doctor/blocked-slots', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, scope }),
      })
      if (!res.ok) { setLoadError(await readFailure(res, 'Could not remove the block')); return }
      setCreated(null)
      fetchBlocks()
    } catch {
      setLoadError(networkFailureText())
    }
  }

  const handleDelete = async (b: Block) => {
    if (b.seriesId) { setRemoveSeries(b); return }
    if (await confirm({ title: 'Remove this blocked period?', message: 'Patients will be able to book that time again.', confirmLabel: 'Remove', danger: true })) remove(b, 'this')
  }

  const presets = today && nowLocal ? blockPresets(today, nowLocal) : []

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      {dialog}
      <Modal open={!!removeSeries} onClose={() => setRemoveSeries(null)} title="Remove a repeating block">
        <p className="text-sm" style={{ color: 'var(--color-charcoal-mid)' }}>This block repeats every week. Patients can book the freed time again.</p>
        <div className="flex flex-col gap-2">
          <Button variant="outline" onClick={() => { const b = removeSeries!; setRemoveSeries(null); remove(b, 'this') }}>Only this one</Button>
          <Button variant="danger" onClick={() => { const b = removeSeries!; setRemoveSeries(null); remove(b, 'series') }}>This and all later ones</Button>
          <Button variant="ghost" onClick={() => setRemoveSeries(null)}>Cancel</Button>
        </div>
      </Modal>

      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Block Schedule</h1>

      {/* Create form */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-1">Add Blocked Period</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--color-sage)' }}>Times are the clinic&apos;s time{timezone ? ` (${timezone})` : ''}. Appointments already booked in a blocked period are kept; you will see them listed.</p>

        {presets.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Quick choices">
            {presets.map(p => <Button key={p.label} variant="outline" size="sm" onClick={() => applyPreset(p)}>{p.label}</Button>)}
          </div>
        )}

        <form onSubmit={handleCreate} className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <Switch checked={allDay} onChange={setAllDay} />
            <span className="text-sm font-medium text-slate-700">All day</span>
          </label>

          {allDay ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="First day" type="date" value={startDate} min={today} onChange={e => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value); setError('') }} required />
              <TextField label="Last day" type="date" value={endDate} min={startDate || today} onChange={e => { setEndDate(e.target.value); setError('') }} required />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="Start Date & Time" type="datetime-local" value={startTime} onChange={e => { setStartTime(e.target.value); setError('') }} required />
              <TextField label="End Date & Time" type="datetime-local" value={endTime} min={startTime} onChange={e => { setEndTime(e.target.value); setError('') }} required />
            </div>
          )}

          <TextField label="Reason" optionalText="(optional)" placeholder="e.g. Lunch break, Out of clinic, Surgery" value={reason} onChange={e => setReason(e.target.value)} maxLength={200} />

          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Switch checked={repeat} onChange={setRepeat} />
              <span className="text-sm font-medium text-slate-700">Repeat every week</span>
            </label>
            {repeat && (
              <TextField label="Repeat until" type="date" fieldClassName="max-w-xs" value={repeatUntil} min={(allDay ? startDate : startTime.slice(0, 10)) || today} onChange={e => setRepeatUntil(e.target.value)} hint="Up to a year of weekly blocks can be made at once." required />
            )}
          </div>

          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={saving}><Plus size={16} aria-hidden="true" /> {saving ? 'Blocking...' : repeat ? 'Block Every Week' : 'Block This Period'}</Button>
        </form>

        {created && (
          <div className="mt-4 space-y-3">
            <Alert variant="success">{created.count === 1 ? 'Period blocked.' : `${created.count} weekly blocks created.`}</Alert>
            <Conflicts conflicts={created.conflicts} timezone={timezone} />
          </div>
        )}
      </div>

      {/* Upcoming blocks */}
      <div>
        <h2 className="font-semibold text-slate-800 mb-3">Blocked Periods</h2>
        {loadError && <Alert className="mb-3">{loadError}</Alert>}
        {loading ? (
          <LoadingBlock className="py-8" />
        ) : blocks.length === 0 ? (
          <EmptyState icon={<Clock size={32} />} title="No upcoming blocked periods." hint="Your schedule is fully open. Past blocks are not listed." />
        ) : (
          <ul className="space-y-2">
            {blocks.map(b => {
              const d = describeBlock(new Date(b.startTime), new Date(b.endTime), timezone)
              const isEditing = editing === b.id
              return (
                <li key={b.id} className="card p-4 space-y-3">
                  {isEditing ? (
                    <form onSubmit={e => { e.preventDefault(); saveEdit(b.id) }} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <TextField label="Start Date & Time" type="datetime-local" value={editStart} onChange={e => setEditStart(e.target.value)} required />
                        <TextField label="End Date & Time" type="datetime-local" value={editEnd} min={editStart} onChange={e => setEditEnd(e.target.value)} required />
                      </div>
                      <TextField label="Reason" optionalText="(optional)" value={editReason} onChange={e => setEditReason(e.target.value)} maxLength={200} />
                      {b.seriesId && <p className="text-xs" style={{ color: 'var(--color-sage)' }}>This changes only this one. The other weekly blocks stay as they are.</p>}
                      {editError && <Alert>{editError}</Alert>}
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" loading={editSaving}>{editSaving ? 'Saving...' : 'Save changes'}</Button>
                        <Button variant="ghost" size="sm" onClick={() => setEditing(null)} disabled={editSaving}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3 items-start min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5" aria-hidden="true">
                          <Calendar size={14} className="text-red-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-sm">{d.text}</p>
                          {b.reason && <p className="text-xs text-slate-500 mt-0.5 break-words">{b.reason}</p>}
                          {b.seriesId && <p className="mt-1"><Badge tone="gray"><Repeat size={11} aria-hidden="true" className="mr-1" /> Repeats weekly</Badge></p>}
                        </div>
                      </div>
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(b)} aria-label={`Edit block: ${d.text}`}><Pencil size={15} aria-hidden="true" /></Button>
                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(b)} aria-label={`Delete block: ${d.text}`}><Trash2 size={15} aria-hidden="true" /></Button>
                      </div>
                    </div>
                  )}
                  {!isEditing && <Conflicts conflicts={b.conflicts} timezone={timezone} />}
                  {editConflicts?.id === b.id && !isEditing && b.conflicts.length === 0 && <Conflicts conflicts={editConflicts.list} timezone={timezone} />}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
