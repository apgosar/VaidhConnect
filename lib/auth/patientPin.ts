import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { derivedKey, getAccess, type PatientSession } from '../modules/patientAccess'
import { tenantDb } from '../db/tenant'
import type { Tenant } from '../tenant/types'

/**
 * A patient who has entered their PIN gets a short, signed, httpOnly cookie
 * tied to one clinic, one phone number and the PIN's version. Resetting the PIN
 * bumps the version, which ends every existing session immediately.
 */
const COOKIE = 'pp_session'
const TTL_SECONDS = 30 * 60

interface Claims { c: string; p: string; v: number; e: number }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')

export function signSession(claims: Claims): string {
  const body = b64(JSON.stringify(claims))
  return `${body}.${b64(createHmac('sha256', derivedKey('session')).update(body).digest())}`
}

/** Pure check of a cookie value: signature, expiry and clinic. */
export function verifySession(token: string | undefined, clinicId: string, nowMs = Date.now()): Claims | null {
  if (!token) return null
  const [body, sig] = token.split('.')
  if (!body || !sig) return null
  const expected = createHmac('sha256', derivedKey('session')).update(body).digest()
  const given = Buffer.from(sig, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as Claims
    return c.c === clinicId && c.e > nowMs ? c : null
  } catch {
    return null
  }
}

export async function startPatientSession(tenant: Tenant, phone: string, pinVersion: number) {
  const token = signSession({ c: tenant.clinicId, p: phone, v: pinVersion, e: Date.now() + TTL_SECONDS * 1000 })
  ;(await cookies()).set(COOKIE, token, {
    maxAge: TTL_SECONDS, httpOnly: true, secure: process.env.NODE_ENV === 'production', path: '/', sameSite: 'lax',
  })
}

export async function endPatientSession() {
  ;(await cookies()).delete(COOKIE)
}

/** The signed-in patient, re-checked against the live record (PIN version, PIN still set). */
export async function getPatientSession(tenant: Tenant): Promise<PatientSession | null> {
  try {
    const claims = verifySession((await cookies()).get(COOKIE)?.value, tenant.clinicId)
    if (!claims) return null
    const access = await getAccess(tenantDb(tenant), claims.p)
    if (!access?.pinHash || access.pinVersion !== claims.v) return null
    return { phone: claims.p, accessId: access.id, verified: !!access.verified }
  } catch {
    return null
  }
}
