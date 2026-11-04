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
- **Save & share on WhatsApp** (appointment page and Quick prescription) saves the prescription and sends the PDF in one tap, with no confirmation. A bar at the bottom of the screen keeps it in reach on a phone. If the send fails the prescription is still saved and the same button tries again. **Save only** saves without sending.
- **What a prescription holds** (`lib/modules/prescriptionSchema.ts`, one schema for both entry points): chief complaint, On examination (O/E), diagnosis, medicines (fixed or tapering), advised investigations, advice, follow-up date, additional notes. A section with nothing in it is left off the PDF, heading and all. Older prescriptions without the new fields print as before.
- **Advice** is ticked from the clinic's own list: Settings → Prescription Advice (`adviceOptions` on the clinic profile, up to 40 items of 200 characters). Until a clinic makes a list it gets the starter list in `DEFAULT_ADVICE` (`lib/constants.ts`). Removing an item from the list does not change prescriptions already written. The doctor can also type advice for one patient.
- **Handwritten prescriptions:** on the Prescription tab, **Take photo** opens the phone camera and **From gallery** picks existing photos (up to 10 per visit). They are shrunk, turned upright, stored privately under `rx-scans/<appointmentId>/` and listed on the visit with short-lived links. They are for the clinic's records and are never sent to the patient. Only owners and doctors can add, see or remove them.

## Visits: length, completion, calendar
- **Saving a prescription marks a booked visit as done** (`savePrescription`), so the doctor does not also tap Done. A cancelled visit is left alone. The **Done** button is still there for a visit with no prescription.
- **Longer visits:** when clinic staff book (New Appointment), after choosing a time they can lengthen the visit with **+** and **-**, one slot at a time (up to 8 slots). Every slot it spans must be free, so the length stops where the free time stops; the server checks this again (`isOpenRun` in `lib/slots.ts`). Patients always book a single slot. A longer visit keeps its length when it is rescheduled, and needs all of its new slots free. The lock for double-booking is still taken on the first slot; the overlap check covers the rest.
- **Full Calendar** shows past visits too (cancelled ones stay hidden) and can go back to any earlier week. Each visit shows its length.
- **The doctor's morning summary** lists only the visits still ahead at the moment it is sent (one in progress counts), and the count matches. If every visit of the day is already over it says so.

- **Edit** (replaces the old Reschedule button on a booked visit) offers **Reschedule** and **Cancel appointment**. Cancelling asks once more inside the dialog, frees the time and tells the patient on WhatsApp (the existing cancellation message). Only booked visits can be edited.
- On the Prescription tab the **handwritten prescription** buttons (Take photo / From gallery) are at the very top of the tab.

## Clinic phone numbers
- Settings → Clinic Information takes up to 5 numbers (`phones` on the clinic profile; the first is the main one and is also kept in `phone`, which the landing page's Call and WhatsApp buttons and older code still read). **All numbers go into every patient message** that names the clinic's phone (booking, reminders, cancellation, reschedule, follow-up reminder, prescription), as one line: `+91 98765 43210, +91 91234 56789` (`clinicPhoneText` in `lib/clinicPhones.ts`). No template change was needed: it is still one variable. The prescription and receipt headers print them as `Tel: ...`, and the landing page lists them under Clinic Information. A clinic that never adds a second number behaves exactly as before.

## Our Services (clinic showcase)
- Settings → **Our Services** lets the clinic publish PDFs and pictures on its public page (`showcase` list on the clinic profile; code in `lib/modules/showcase.ts`, API under `/api/doctor/showcase`, shown by `components/patient/ShowcaseGallery.tsx`). Up to 12 items, each under 10 MB; JPG, PNG, WebP and PDF only, checked by file contents (never SVG). Needs `settings:manage` (owner and doctor). Uploads, renames, moves and removals save immediately, independent of the Settings Save button.
- A **PDF is converted on the server at upload** into one JPEG per page (about 1400px wide, `mupdf`, WebAssembly, listed in `serverExternalPackages`; at most 20 pages; password-protected or damaged PDFs are refused), so patients read it inside the page and the Content-Security-Policy needs no change. The original PDF is kept for the Download button. Pictures are turned upright and shrunk to 1600px.
- Files are public, like the logo and product photos: `clinics/<clinic>/showcase/<id>/` (`file.pdf`, `p1.jpg`..., `image.jpg`). Removing an item deletes its files. There is no per-clinic feature switch.

## Patient details
- **Age and date of birth** are entered together wherever a patient is added (Quick prescription, New Appointment, the patient's own booking form): type either and the other is worked out. An age gives an *estimated* date of birth, stored with `dobApproximate: true`; because that estimate moves every day, such a patient is matched to an existing record by **name and number** rather than by date of birth, so a returning patient is not added twice.
- **Gender** (Male / Female / Other, as `MALE` / `FEMALE` / `OTHER`) is asked for every new patient in those three places and printed on the prescription next to the age. Older patients have none; the Quick prescription screen lets the doctor add it for them and saves it on their record. The API treats it as optional so older clients keep working.

## Rescheduling and blocked periods
- **Rescheduling** keeps the same appointment (same id), so a prescription or payment stays attached. The new slot gets the same checks as a booking, and the old slot is freed in the same step. Clinic staff can move any appointment from its page (**Reschedule**), with no limits. Patients can move their own from My Appointments, **at most 2 times and not within 2 hours of the visit** (`lib/reschedulePolicy.ts`); after that they are asked to call. The patient is told on WhatsApp (`appt_rescheduled`).
- **Block Schedule** lists only periods that have not finished; past ones are hidden. Times are entered and shown in the **clinic's** timezone, not the browser's. A block can be edited, set for whole days, and repeated weekly (up to a year); removing a repeating block offers "only this one" or "this and all later ones".
- Blocking time **does not cancel appointments already booked** in it. The page lists them with a link to each so the clinic can reschedule or cancel them.

## Quick prescription
- **Dashboard → Quick prescription** (also in the menu) is for a consultation by phone or video. The doctor enters the patient's mobile number, name and age (or date of birth), an optional diagnosis and the medicines, then **Save & share on WhatsApp**. The patient receives the PDF on the clinic letterhead, exactly as from the appointment page. **Save only** keeps it without sending.
- From a patient's page, **Quick prescription for <name>** opens this screen with that patient already picked.
- Typing the number first finds patients already on the books with that number (families share phones); pick one, or "Someone else on this number". The same name on the same number is never added twice.
- Behind the scenes it is a **completed visit** (type "Phone / video", no booking slot taken), so history, the PDF, resending, the follow-up reminder and the patient's "Past visits" all work as for any visit. An age is stored as an estimated date of birth (`dobApproximate`).
- Only owners and doctors can use it (the same permission as writing a prescription). Uses the `appointments` visit and `prescriptions` collections; the WhatsApp template is the existing `prescription_share`.

## Known limits
- One calendar per clinic (`doctorId` = clinic id). Extra doctors can sign in but
  share the calendar.
- Patient search reads a clinic's patient list and filters in memory — fine for
  thousands of patients per clinic; move to indexed search when that grows.
- Cron runs all clinics in one request (concurrency 5). Move to per-clinic
  queued tasks at ~100 clinics.
- The tenant lookup is cached ~20 s per instance, so status/flag/hostname
  changes are not instantaneous (a mapping that did not exist yet is retried after 5 s).
