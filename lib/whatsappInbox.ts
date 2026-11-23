import { adminDb } from './firebase/server'
import { tenantDb } from './db/tenant'
import { clinicPhoneText } from './clinicPhones'
import { sendSessionText } from './whatsapp'

/**
 * The sender is one shared number for every clinic, and nobody reads what arrives on it. A patient who
 * replies gets one automatic answer pointing them to their clinic's phone numbers.
 *
 * A reply carries only the sender's number, so we remember which clinics last messaged each number
 * (`whatsapp_recipient_index/<digits>`). A number that is a patient at two clinics gets both clinics' numbers.
 */
const COLLECTION = 'whatsapp_recipient_index'
const RECENT_MS = 7 * 86_400_000
const ONE_REPLY_PER_MS = 24 * 3_600_000

interface Seen { storage: 'legacy' | 'scoped'; at: Date }

const digits = (p: string) => p.replace(/\D/g, '')

/** Called after every outgoing message, so a later reply can be matched to the clinic(s) that wrote to this number. */
export async function rememberRecipient(phone: string, clinicId: string, storage: 'legacy' | 'scoped') {
  await adminDb.collection(COLLECTION).doc(digits(phone)).set({ clinics: { [clinicId]: { storage, at: new Date() } } }, { merge: true })
}

export function autoReplyText(clinics: { name: string; phones: string }[]): string {
  const help = clinics.length === 0
    ? 'please contact your clinic directly.'
    : clinics.length === 1
      ? `please call ${clinics[0].name} on ${clinics[0].phones || 'the clinic'}.`
      : `please call the clinic you are in touch with: ${clinics.map(c => `${c.name} on ${c.phones || 'the clinic'}`).join('; ')}.`
  return `Hello, this is an automated number used only to send appointment messages, so replies sent here are not read. If you need any help, ${help} Thank you.`
}

/** Replies once per 24 hours per number. Returns true when a reply was sent. */
export async function handleInboundMessage(from: string, now = new Date()): Promise<boolean> {
  const phone = digits(from)
  if (!phone) return false
  const ref = adminDb.collection(COLLECTION).doc(phone)
  const snap = await ref.get()
  const data = (snap.exists ? snap.data() : {}) as { clinics?: Record<string, { storage: 'legacy' | 'scoped'; at: any }>; lastAutoReplyAt?: any }

  const last = data.lastAutoReplyAt?.toDate?.() ?? data.lastAutoReplyAt
  if (last && now.getTime() - new Date(last).getTime() < ONE_REPLY_PER_MS) return false
  // Claim the slot first so two quick messages (or a retried webhook) cannot produce two replies.
  await ref.set({ lastAutoReplyAt: now }, { merge: true })

  const seen = Object.entries(data.clinics ?? {}).map(([clinicId, v]) => ({
    clinicId, storage: v.storage, at: (v.at?.toDate?.() ?? new Date(v.at)) as Date,
  } satisfies Seen & { clinicId: string })).sort((a, b) => b.at.getTime() - a.at.getTime())
  const recent = seen.filter(s => now.getTime() - s.at.getTime() <= RECENT_MS)
  const chosen = recent.length > 0 ? recent : seen.slice(0, 1)

  const clinics: { name: string; phones: string }[] = []
  for (const c of chosen) {
    const profile = await tenantDb({ clinicId: c.clinicId, storage: c.storage } as never).profile().get()
    if (!profile.exists) continue
    const d = profile.data() as Record<string, unknown>
    clinics.push({ name: String(d.clinicName ?? 'the clinic'), phones: clinicPhoneText(d) })
  }

  const result = await sendSessionText(phone, autoReplyText(clinics))
  return result.ok
}
