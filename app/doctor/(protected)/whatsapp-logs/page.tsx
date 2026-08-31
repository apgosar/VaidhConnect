'use client'

import { useState, useEffect, useCallback } from 'react'
import { format, parseISO } from 'date-fns'
import { MessageSquare, CheckCircle2, XCircle, RefreshCw, ChevronDown, Phone, Info, Copy, Check } from 'lucide-react'
import type { Metadata } from 'next'

interface WhatsAppLog {
  id: string
  to: string
  templateName: string
  messageType: string
  recipientName: string
  params: string[]
  messageBody?: string
  status: 'sent' | 'failed'
  errorDetail: string | null
  sentAt: string | null
}

const MESSAGE_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Booking Confirmation': { bg: 'rgba(28,92,70,0.08)', text: 'var(--color-pine)', border: 'rgba(28,92,70,0.20)' },
  'Cancellation':         { bg: 'rgba(181,74,60,0.07)', text: '#B54A3C', border: 'rgba(181,74,60,0.18)' },
  'Appointment Reminder': { bg: 'rgba(201,161,93,0.10)', text: 'var(--color-gold-dark)', border: 'rgba(201,161,93,0.25)' },
  'Daily Summary (Morning)': { bg: 'rgba(15,61,46,0.07)', text: 'var(--color-forest)', border: 'rgba(15,61,46,0.18)' },
  'Daily Summary (Update)':  { bg: 'rgba(15,61,46,0.07)', text: 'var(--color-forest)', border: 'rgba(15,61,46,0.18)' },
}

function getTypeStyle(messageType: string) {
  return MESSAGE_TYPE_COLORS[messageType] ?? {
    bg: 'rgba(122,139,127,0.10)',
    text: 'var(--color-sage)',
    border: 'rgba(122,139,127,0.22)',
  }
}

function LogCard({ log }: { log: WhatsAppLog }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const typeStyle = getTypeStyle(log.messageType)
  const isSent = log.status === 'sent'

  const handleCopyBody = () => {
    if (!log.messageBody) return
    navigator.clipboard.writeText(log.messageBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="card-data overflow-hidden transition-shadow hover:shadow-md"
      style={{ borderLeft: `3px solid ${isSent ? 'var(--color-pine)' : '#B54A3C'}` }}
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        {/* Status icon */}
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ background: isSent ? 'rgba(28,92,70,0.10)' : 'rgba(181,74,60,0.09)' }}
        >
          {isSent
            ? <CheckCircle2 size={18} style={{ color: 'var(--color-pine)' }} />
            : <XCircle size={18} style={{ color: '#B54A3C' }} />
          }
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* Message type pill */}
            <span
              className="text-xs font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
            >
              {log.messageType}
            </span>
            {/* Status badge */}
            <span
              className="text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{
                background: isSent ? 'rgba(28,92,70,0.08)' : 'rgba(181,74,60,0.08)',
                color: isSent ? 'var(--color-pine)' : '#B54A3C',
              }}
            >
              {log.status}
            </span>
          </div>

          {/* Recipient row */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {log.recipientName && (
              <span className="font-semibold" style={{ color: 'var(--color-charcoal)' }}>
                {log.recipientName}
              </span>
            )}
            <span className="flex items-center gap-1 font-tabular" style={{ color: 'var(--color-sage)' }}>
              <Phone size={11} />
              {log.to}
            </span>
          </div>

          {/* Error detail */}
          {!isSent && log.errorDetail && (
            <p className="text-xs mt-1.5 rounded px-2 py-1" style={{ color: '#B54A3C', background: 'rgba(181,74,60,0.06)' }}>
              {log.errorDetail}
            </p>
          )}

          {/* Message Body Content */}
          {log.messageBody && (
            <div
              className="mt-3 p-3 rounded-lg text-sm whitespace-pre-wrap relative group"
              style={{
                background: 'rgba(255, 255, 255, 0.75)',
                border: '1px solid var(--color-sage-border)',
                color: 'var(--color-charcoal)',
              }}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5 pb-1 border-b border-black/5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-sage)]">
                <span className="flex items-center gap-1">
                  <MessageSquare size={11} />
                  Message Body
                </span>
                <button
                  type="button"
                  onClick={handleCopyBody}
                  className="flex items-center gap-1 text-[11px] font-normal hover:text-[var(--color-forest)] transition-colors px-1.5 py-0.5 rounded hover:bg-black/5"
                  title="Copy message text"
                >
                  {copied ? (
                    <>
                      <Check size={11} className="text-green-600" />
                      <span className="text-green-600">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy size={11} />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="leading-relaxed text-[13px]">{log.messageBody}</p>
            </div>
          )}
        </div>

        {/* Timestamp + expand */}
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {log.sentAt && (
            <p className="text-xs font-tabular" style={{ color: 'var(--color-sage)' }}>
              {format(parseISO(log.sentAt), 'dd MMM, hh:mm a')}
            </p>
          )}
          {log.params.length > 0 && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded transition-colors"
              style={{ color: 'var(--color-sage)', background: expanded ? 'var(--color-linen-dark)' : 'transparent' }}
            >
              <Info size={12} />
              {expanded ? 'Hide' : 'Raw Params'}
              <ChevronDown size={11} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
            </button>
          )}
        </div>
      </div>

      {/* Expanded params */}
      {expanded && log.params.length > 0 && (
        <div
          className="px-4 pb-4"
          style={{ borderTop: '1px solid var(--color-sage-border)', paddingTop: '12px' }}
        >
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-sage)' }}>
            Raw Template Parameters
          </p>
          <div className="space-y-1">
            {log.params.map((p, i) => (
              <div key={i} className="flex gap-2 text-xs">
                <span
                  className="w-5 h-5 rounded flex items-center justify-center font-bold flex-shrink-0"
                  style={{ background: 'var(--color-primary-bg)', color: 'var(--color-forest)' }}
                >
                  {i + 1}
                </span>
                <span style={{ color: 'var(--color-charcoal-mid)' }}>{p}</span>
              </div>
            ))}
          </div>
          <p className="text-xs mt-2 font-tabular" style={{ color: 'var(--color-sage-light)' }}>
            Template: <code style={{ fontFamily: 'monospace' }}>{log.templateName}</code>
          </p>
        </div>
      )}
    </div>
  )
}

export default function WhatsAppLogsPage() {
  const [logs, setLogs] = useState<WhatsAppLog[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchLogs = useCallback(async (before?: string) => {
    const isFetchingMore = !!before
    if (isFetchingMore) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const url = `/api/doctor/whatsapp-logs?limit=50${before ? `&before=${encodeURIComponent(before)}` : ''}`
      const res = await fetch(url)
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Failed to load logs')

      const newLogs: WhatsAppLog[] = data.logs ?? []
      if (isFetchingMore) {
        setLogs(prev => [...prev, ...newLogs])
      } else {
        setLogs(newLogs)
      }
      setHasMore(newLogs.length === 50)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleLoadMore = () => {
    const last = logs[logs.length - 1]
    if (last?.sentAt) fetchLogs(last.sentAt)
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--color-charcoal)' }}
          >
            WhatsApp Logs
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-sage)' }}>
            All WhatsApp messages sent by the system
          </p>
        </div>
        <button
          onClick={() => fetchLogs()}
          disabled={loading}
          className="btn btn-outline btn-sm flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      {!loading && logs.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Shown', value: logs.length, color: 'var(--color-forest)' },
            { label: 'Sent', value: logs.filter(l => l.status === 'sent').length, color: 'var(--color-pine)' },
            { label: 'Failed', value: logs.filter(l => l.status === 'failed').length, color: '#B54A3C' },
            {
              label: 'Today',
              value: logs.filter(l => l.sentAt && new Date(l.sentAt).toDateString() === new Date().toDateString()).length,
              color: 'var(--color-gold-dark)',
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="card-data p-4 text-center">
              <p className="text-2xl font-bold font-tabular" style={{ color }}>{value}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-sage)' }}>{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {error && (
        <div
          className="rounded-lg p-4 text-sm flex items-center gap-2"
          style={{ background: 'rgba(181,74,60,0.07)', border: '1px solid rgba(181,74,60,0.18)', color: '#B54A3C' }}
        >
          <XCircle size={16} />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2" style={{ color: 'var(--color-sage)' }}>
          <div className="spinner" />
          <span className="text-sm">Loading logs...</span>
        </div>
      ) : logs.length === 0 && !error ? (
        <div className="card p-12 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: 'var(--color-primary-bg)' }}
          >
            <MessageSquare size={28} style={{ color: 'var(--color-sage)' }} />
          </div>
          <p className="font-semibold" style={{ color: 'var(--color-charcoal)' }}>No messages yet</p>
          <p className="text-sm mt-1" style={{ color: 'var(--color-sage)' }}>
            WhatsApp messages will appear here once the system sends them.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {logs.map(log => (
            <LogCard key={log.id} log={log} />
          ))}

          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="btn btn-outline w-full flex items-center justify-center gap-2"
            >
              {loadingMore ? (
                <><div className="spinner w-4 h-4" style={{ borderTopColor: 'var(--color-forest)' }} /><span>Loading...</span></>
              ) : (
                <><ChevronDown size={15} /><span>Load More</span></>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
