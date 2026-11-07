import { Phone } from 'lucide-react'
import { WhatsAppIcon } from '@/components/ui/WhatsAppIcon'

/**
 * Call and WhatsApp for a patient, so the number itself never has to be shown or copied.
 * `phone` is stored with its country code, e.g. +919800000001. Nothing is shown when there is no number.
 */
export function ContactButtons({ phone, name, className = '' }: { phone?: string | null; name?: string; className?: string }) {
  const number = (phone ?? '').trim()
  const digits = number.replace(/\D/g, '')
  if (digits.length < 8) return null
  const who = name ? ` ${name}` : ''
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      <a href={`tel:+${digits}`} className="btn btn-outline btn-sm" aria-label={`Call${who}`}>
        <Phone size={14} aria-hidden="true" /> Call
      </a>
      <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm" aria-label={`WhatsApp${who}`}>
        <WhatsAppIcon size={14} /> WhatsApp
      </a>
    </div>
  )
}
