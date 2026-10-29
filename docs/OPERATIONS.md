# Operating the platform

## Concepts
- **Clinic (tenant):** one practice. Identified by the request hostname via a
  `domains/<host>` document. Data lives under `clinics/<id>/…` (new clinics) or in
  the root collections (the original clinic, "legacy").
- **Roles:** `OWNER` (everything incl. team) · `DOCTOR` (clinical + settings) ·
  `STAFF` (front desk: bookings, patients, blocked time, payments). Stored as
  Firebase custom claims `{ clinicId, role }`; one login belongs to one clinic.
- **Platform operator:** a Firebase user with claim `platformAdmin: true`. Uses
  `/admin`, which only exists on hosts in `PLATFORM_ADMIN_HOSTS`.
- **Plan flags** (operator-only): `prescriptions`, `payments`, `products`,
  `videos`, `whatsapp`. Absent = on.

## Environment variables
| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_FIREBASE_*` | Firebase web config — baked in at **build** time |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Admin SDK (runtime) |
| `CRON_SECRET` | Bearer token for `/api/cron/*`. No default; unset = all cron calls rejected |
| `TENANT_LEGACY_FALLBACK` | `off` once all hosts are mapped (see ROLLOUT.md) |
| `PLATFORM_ADMIN_HOSTS` | Comma-separated hosts that serve `/admin`. Unset = console disabled |
| `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | The one shared sender for all clinics |
| `SMTP_*` | Optional email (confirmations, team invites) |

## Day-to-day
| Task | How |
|---|---|
| Onboard a clinic | `/admin` → New clinic (or `scripts/provision-clinic.ts`) |
| Suspend / reactivate | `/admin` → Suspend. Site and APIs stop resolving, jobs skip it, owner sessions are revoked. Takes effect within ~20 seconds |
| Change plan flags | `/admin` → tick/untick a flag |
| Reset an owner's password | `/admin` → Reset owner password (one-time link) |
| Make someone an operator | `npx tsx --env-file=.env scripts/make-platform-admin.ts --email x@y` (they must sign in again) |
| Clinic adds staff | Clinic owner → **Team** in the dashboard |
| Export a clinic's data | `scripts/export-clinic.ts --clinic <id> --out <dir> [--files]` |
| Delete a clinic | Suspend → export → `scripts/delete-clinic.ts --clinic <id>` (dry run) → add `--confirm <id>` |
| See who touched records | Owner → **Activity Log** |

## Background jobs (Cloud Scheduler)
- `POST /api/cron/reminders` every 15 min and `POST /api/cron/daily-summary`
  hourly, header `Authorization: Bearer $CRON_SECRET`.
- Both fan out to every non-suspended clinic, in each clinic's own timezone.
  Response `207` means at least one clinic failed (others still ran); the body
  lists which.

## Patient booking without OTP — what protects it
Anyone can type any phone number, so the public booking flow is built to leak
and change nothing:
- It never reads back or edits an existing patient record.
- Patients get a secret per-appointment token, kept on their device, which alone
  allows viewing/cancelling that appointment. There is no lookup by phone/name.
- Per-clinic rate limits: 3 bookings / phone / day, 10 / IP / hour.
- Residual risk: someone could book under another person's number and cause a
  WhatsApp confirmation to be sent to them. The limits bound this; staff can
  cancel from the dashboard.

## Known limits
- One calendar per clinic (`doctorId` = clinic id). Extra doctors can sign in but
  share the calendar.
- Patient search reads a clinic's patient list and filters in memory — fine for
  thousands of patients per clinic; move to indexed search when that grows.
- Cron runs all clinics in one request (concurrency 5). Move to per-clinic
  queued tasks at ~100 clinics.
- The tenant lookup is cached ~20 s per instance, so status/flag/hostname
  changes are not instantaneous (a mapping that did not exist yet is retried after 5 s).
