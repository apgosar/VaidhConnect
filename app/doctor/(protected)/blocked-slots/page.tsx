'use client'

import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { Plus, Trash2, Calendar, Clock } from 'lucide-react'

interface BlockedSlot {
  id: string
  startTime: string
  endTime: string
  reason?: string | null
}

export default function BlockedSlotsPage() {
  const [blocks, setBlocks] = useState<BlockedSlot[]>([])
  const [loading, setLoading] = useState(true)
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchBlocks() }, [])

  const fetchBlocks = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/doctor/blocked-slots')
      const data = await res.json()
      setBlocks(data.blocks ?? [])
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!startTime || !endTime) { setError('Please set start and end times'); return }
    if (new Date(endTime) <= new Date(startTime)) { setError('End time must be after start time'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/doctor/blocked-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime, endTime, reason }),
      })
      if (res.ok) {
        setStartTime(''); setEndTime(''); setReason('')
        fetchBlocks()
      } else {
        const data = await res.json()
        setError(data.error ?? 'Failed to create block')
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this blocked slot?')) return
    await fetch('/api/doctor/blocked-slots', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    setBlocks(prev => prev.filter(b => b.id !== id))
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-in">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}>Block Schedule</h1>

      {/* Create form */}
      <div className="card p-6">
        <h2 className="font-semibold text-slate-800 mb-4">Add Blocked Period</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Start Date & Time</label>
              <input
                type="datetime-local"
                className="form-input"
                value={startTime}
                onChange={e => { setStartTime(e.target.value); setError('') }}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">End Date & Time</label>
              <input
                type="datetime-local"
                className="form-input"
                value={endTime}
                onChange={e => { setEndTime(e.target.value); setError('') }}
                min={startTime}
                required
              />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Reason <span className="text-slate-400 text-xs font-normal">(optional)</span></label>
            <input className="form-input" placeholder="e.g. Lunch break, Out of clinic, Surgery" value={reason} onChange={e => setReason(e.target.value)} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Plus size={16} /> {saving ? 'Blocking...' : 'Block This Period'}
          </button>
        </form>
      </div>

      {/* Existing blocks */}
      <div>
        <h2 className="font-semibold text-slate-800 mb-3">Blocked Periods</h2>
        {loading ? (
          <div className="flex justify-center py-8"><div className="spinner" /></div>
        ) : blocks.length === 0 ? (
          <div className="card p-8 text-center">
            <Clock size={32} className="mx-auto mb-2 text-slate-300" />
            <p className="text-slate-400 text-sm">No blocked periods. Your schedule is fully open.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map(block => (
              <div key={block.id} className="card p-4 flex items-start justify-between gap-3">
                <div className="flex gap-3 items-start">
                  <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <Calendar size={14} className="text-red-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800 text-sm">
                      {format(parseISO(block.startTime), 'dd MMM yyyy, hh:mm a')}
                      <span className="text-slate-400 mx-1">→</span>
                      {format(parseISO(block.endTime), 'hh:mm a, dd MMM yyyy')}
                    </p>
                    {block.reason && <p className="text-xs text-slate-500 mt-0.5">{block.reason}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(block.id)}
                  className="btn btn-ghost p-2 text-red-400 hover:text-red-600 shrink-0"
                  aria-label="Delete block"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
