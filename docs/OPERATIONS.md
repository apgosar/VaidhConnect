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
| `PATIENT_PIN_SECRET` | Random string, 32+ chars. Peppers PIN hashes and signs patient sessions. **Required** — without it PIN features return 503. Changing it invalidates every PIN. |
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
Anyone can type any phone number, so the public flow is built to leak and change
nothing, and a 4-digit PIN (chosen on the first booking) gates anything a patient
can see or change:
- Public booking never reads back or edits an existing patient record.
- The PIN is per phone number **per clinic**. Stored as scrypt + keyed pepper, never
  shown. 5 wrong tries lock the number for 15 min, then 1 h, then 24 h.
- **Verified vs unverified PIN.** A PIN set by staff at the desk, or after a WhatsApp
  code, is *verified*: "My Appointments" shows every upcoming appointment on that
  number (including ones staff booked for them). A PIN set remotely on a first
  booking is *unverified* (someone could have typed another person's number): it
  sees only bookings made under that PIN until the patient taps "Confirm my number"
  (WhatsApp code).
- A number that already has a PIN needs it to book again. Staff booking from the
  dashboard never needs the PIN.
- **Forgot PIN:** patient self-resets by WhatsApp code (needs the Meta template
  `patient_pin_reset`, one {{1}} body parameter, category Authentication/Utility), or calls
  the clinic and staff use **Reset PIN** / **Set PIN at desk** on the patient page
  (audited without the PIN). Either way every existing session is signed out.
- Per-clinic rate limits: 3 bookings / phone / day (counted only after the PIN is
  proven, so strangers cannot use up a patient's allowance), 10 / IP / hour.
- Residual risk: someone could book under another person's *new* number and cause a
  WhatsApp confirmation to be sent to them. The limits bound this; staff can cancel.

## Prescriptions
- **PDFs are built on the server** (`lib/modules/documents.ts`), never in the browser: the browser's WebAssembly is blocked by the production CSP. Download, print, WhatsApp and the patient's copy all come from the same renderer.
- **Fonts** for Hindi and Gujarati (and the rupee sign) are bundled in `public/fonts/pdf` (SIL Open Font License).
- **Letterhead:** an A4 JPG/PNG a clinic uploads in Settings, kept privately under `letterheads/`. "Print on letterhead" prints content only, spaced by the clinic's top/bottom/left/right millimetres, for paper that already carries the letterhead.
- **Shared copies:** a prescription sent on WhatsApp is stored at `shares/<clinicId>/<prescriptionId>/` and deleted after 7 days by a storage rule: `gcloud storage buckets update gs://<bucket> --lifecycle-file=scripts/storage-lifecycle.json`.
- **Patients** download their own prescriptions from My Appointments after PIN sign-in (a verified PIN sees every visit on the number, an unverified one only visits booked under it).
- **Medicine suggestions** come from each clinic's own history (`medicine_catalog`). To fill it from existing prescriptions: `npx tsx --env-file=.env scripts/backfill-medicine-catalog.ts --clinic <id> --execute` (dry run without `--execute`).
- **Follow-up reminders** need the `followup_reminder` template (see WHATSAPP_NOTIFICATIONS.md).

## Known limits
- One calendar per clinic (`doctorId` = clinic id). Extra doctors can sign in but
  share the calendar.
- Patient search reads a clinic's patient list and filters in memory — fine for
  thousands of patients per clinic; move to indexed search when that grows.
- Cron runs all clinics in one request (concurrency 5). Move to per-clinic
  queued tasks at ~100 clinics.
- The tenant lookup is cached ~20 s per instance, so status/flag/hostname
  changes are not instantaneous (a mapping that did not exist yet is retried after 5 s).
