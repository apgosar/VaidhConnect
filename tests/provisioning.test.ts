import { describe, it, expect, beforeEach } from 'vitest'
import { FakeFirestore } from './helpers/fakeFirestore'
import { provisionClinic, ProvisionError } from '@/lib/modules/provisioning'

function fakeAuth() {
  const users = new Map<string, { uid: string; email: string; claims?: any }>()
  let n = 0
  return {
    users,
    async getUserByEmail(email: string) {
      const u = [...users.values()].find(x => x.email === email)
      if (!u) throw Object.assign(new Error('not found'), { code: 'auth/user-not-found' })
      return u
    },
    async createUser({ email }: { email: string }) { const u = { uid: `uid${++n}`, email }; users.set(u.uid, u); return u },
    async setCustomUserClaims(uid: string, claims: any) { users.get(uid)!.claims = claims },
    async deleteUser(uid: string) { users.delete(uid) },
    async generatePasswordResetLink(email: string) { return `https://reset.example/${email}` },
  }
}

let fs: FakeFirestore
let auth: ReturnType<typeof fakeAuth>
const input = { id: 'drshah', name: 'Shah Clinic', doctor: 'Abhay Shah', email: 'Owner@Example.com', domain: 'DrShah.Example.in' }
const run = (over: Record<string, unknown> = {}) => provisionClinic({ auth: auth as any, db: fs as any }, { ...input, ...over } as any)

beforeEach(() => { fs = new FakeFirestore(); auth = fakeAuth() })

describe('provisionClinic', () => {
  it('creates the clinic, an owner login bound to it, and the hostname mapping', async () => {
    const r = await run({ primary: '#0B6E4F', timezone: 'Asia/Dubai' })
    expect(r).toMatchObject({ clinicId: 'drshah', domain: 'drshah.example.in' })
    expect(r.passwordResetLink).toContain('owner@example.com')

    const clinic = fs.coll('clinics').get('drshah')!
    expect(clinic).toMatchObject({ clinicName: 'Shah Clinic', status: 'active', timezone: 'Asia/Dubai', theme: { primary: '#0B6E4F' } })
    expect(clinic.ownerUid).toBe(r.ownerUid)
    expect(auth.users.get(r.ownerUid)!.claims).toEqual({ clinicId: 'drshah', role: 'OWNER' })
    expect(fs.coll('domains').get('drshah.example.in')).toMatchObject({ clinicId: 'drshah', storage: 'scoped' })
    expect(fs.coll('clinics/drshah/users').get(r.ownerUid)).toMatchObject({ role: 'OWNER' })
  })

  it('defaults features to all-on and timezone to Asia/Kolkata', async () => {
    await run()
    expect(fs.coll('clinics').get('drshah')).toMatchObject({ features: {}, timezone: 'Asia/Kolkata' })
  })

  it('refuses a clinic id, hostname or owner email that is already taken', async () => {
    await run()
    await expect(run({ domain: 'other.example.in', email: 'x@y.in' })).rejects.toMatchObject({ status: 409 })   // id
    await expect(run({ id: 'second', email: 'x@y.in' })).rejects.toMatchObject({ status: 409 })                 // domain
    await expect(run({ id: 'second', domain: 'second.example.in' })).rejects.toMatchObject({ status: 409 })     // email
    expect(fs.coll('clinics').size).toBe(1)
    expect(auth.users.size).toBe(1)
  })

  it('also refuses an id that collides with a legacy clinic', async () => {
    fs.coll('doctors').set('drshah', { clinicName: 'Old' })
    await expect(run()).rejects.toMatchObject({ status: 409 })
  })

  it.each([
    ['a reserved id', { id: 'admin' }],
    ['a malformed id', { id: 'Bad Id!' }],
    ['a malformed domain', { domain: 'not a domain' }],
    ['a malformed email', { email: 'nope' }],
    ['an unknown timezone', { timezone: 'Mars/Olympus' }],
    ['a brand colour too light for white text', { primary: '#FFFF00' }],
    ['a blank clinic name', { name: '  ' }],
  ])('rejects %s without creating anything', async (_label, over) => {
    await expect(run(over)).rejects.toBeInstanceOf(ProvisionError)
    expect(auth.users.size).toBe(0)
    expect(fs.coll('clinics').size).toBe(0)
  })

  it('undoes the login and clinic if a later step fails', async () => {
    const realCollection = fs.collection.bind(fs)
    ;(fs as any).collection = (name: string) => {
      const c: any = realCollection(name)
      if (name === 'domains') { const doc = c.doc.bind(c); c.doc = (id?: string) => { const d = doc(id); d.set = async () => { throw new Error('boom') }; return d } }
      return c
    }
    await expect(run()).rejects.toThrow('boom')
    expect(auth.users.size).toBe(0)                 // no orphaned login
    expect(fs.coll('clinics').has('drshah')).toBe(false)
  })
})
