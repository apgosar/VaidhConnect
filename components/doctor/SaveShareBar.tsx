'use client'

import { Save } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'

export type ShareState = { state: 'idle' | 'sending' | 'sent' | 'failed'; message?: string }

/**
 * The two ways to finish a prescription, kept in reach at the bottom of the screen while the form scrolls:
 * save and send it to the patient on WhatsApp in one tap (no confirmation), or just save.
 * The send button is the main one; it is only unavailable when there is nowhere to send to.
 */
export function SaveShareBar({ onSaveAndShare, onSave, busy, canShare, sendTo, problem, share, bleed }: {
  onSaveAndShare: () => void
  onSave: () => void
  busy: 'save' | 'send' | null
  canShare: boolean
  /** Shown under the button so the doctor can see where it goes, e.g. "+91 98765 43210". */
  sendTo?: string
  problem?: string
  share?: ShareState
  /** Inside a padded card: stretch to the card's edges. */
  bleed?: boolean
}) {
  return (
    <div className={`sticky bottom-0 z-30 ${bleed ? '-mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5' : '-mx-4 px-4 md:-mx-6 md:px-6'} border-t border-slate-200 bg-white/95 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur space-y-2 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]`}>
      {problem && <Alert variant="error">{problem}</Alert>}
      {share?.state === 'sent' && <Alert variant="success">{share.message}. The patient has the prescription on WhatsApp.</Alert>}
      {share?.state === 'failed' && <Alert variant="error">{share.message} The prescription is saved. You can try again.</Alert>}
      <button type="button" onClick={onSaveAndShare} disabled={busy !== null || !canShare}
        className="btn btn-lg w-full disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#25D366', color: 'var(--color-on-whatsapp)' }}>
        <WhatsAppIcon size={18} /> {busy === 'send' ? 'Saving and sending...' : 'Save & share on WhatsApp'}
      </button>
      <p className="text-xs text-center text-slate-500">
        {canShare ? (sendTo ? `Goes to ${sendTo}` : '') : 'Add a valid mobile number to send on WhatsApp'}
      </p>
      <button type="button" onClick={onSave} disabled={busy !== null} className="btn btn-outline w-full disabled:opacity-60">
        <Save size={16} aria-hidden="true" /> {busy === 'save' ? 'Saving...' : 'Save only'}
      </button>
    </div>
  )
}
