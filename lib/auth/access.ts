import { apiError } from '../errors'
/**
 * Role-based access for clinic users. One owner per clinic, plus optional
 * doctors and front-desk staff. Roles are Firebase custom claims set when
 * the user is created, and are re-verified on every request via getSession().
 *
 *   OWNER  everything, including managing the team
 *   DOCTOR clinical work and clinic settings
 *   STAFF  front desk: appointments, patients, blocked time, payments
 */
export const ROLES = ['OWNER', 'DOCTOR', 'STAFF'] as const
export type Role = typeof ROLES[number]

export const PERMISSIONS = {
  'appointments:manage': ['OWNER', 'DOCTOR', 'STAFF'],
  'patients:manage': ['OWNER', 'DOCTOR', 'STAFF'],
  'blocked:manage': ['OWNER', 'DOCTOR', 'STAFF'],
  'payments:manage': ['OWNER', 'DOCTOR', 'STAFF'],
  'prescriptions:manage': ['OWNER', 'DOCTOR'],
  'settings:manage': ['OWNER', 'DOCTOR'],
  'logs:view': ['OWNER', 'DOCTOR'],
  'team:manage': ['OWNER'],
  'audit:view': ['OWNER'],
} as const satisfies Record<string, readonly Role[]>

export type Permission = keyof typeof PERMISSIONS

export const can = (role: Role | undefined, permission: Permission): boolean =>
  !!role && (PERMISSIONS[permission] as readonly Role[]).includes(role)

/** Returns a 403 Response if the session lacks the permission, else null. */
export function forbid(session: { role?: Role } | null, permission: Permission): Response | null {
  return can(session?.role, permission)
    ? null
    : apiError('FORBIDDEN')
}
