/** A UPI ID (virtual payment address): a name, an "@", and the bank or app handle. */
const UPI_ID = /^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$/

export const isUpiId = (id: string | null | undefined): id is string => !!id && UPI_ID.test(id.trim())

/**
 * The link that opens a UPI app (the phone offers whichever are installed: Google Pay, PhonePe, Paytm, BHIM...)
 * with the payee already filled in. The patient types the amount. null when the ID is not a valid UPI ID.
 */
export function upiPayLink(upiId: string | null | undefined, payeeName: string): string | null {
  if (!isUpiId(upiId)) return null
  const q = new URLSearchParams({ pa: upiId.trim(), pn: payeeName.trim() || 'Clinic', cu: 'INR' })
  return `upi://pay?${q.toString().replace(/\+/g, '%20')}`
}
