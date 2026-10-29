# Rolling the multi-tenant release to production

The release is built so that **deploying it changes nothing for the existing
clinic** until you deliberately cut it over. Each step below has a rollback.
Always pass `--project` explicitly — a bare `firebase`/`gcloud` command may
target the wrong project.

Replace `PROD` with `vaidhconnect-app` and `HOST` with the clinic's public hostname.

## 0. Before you start
- [ ] Rehearsal passed on staging (see "Rehearsal" below).
- [ ] PR merged to `main`, CI green.
- [ ] Quiet window chosen for step 4 (late night local time).
- [ ] Production backup taken and restore-tested (step 1).

## 1. Back up production (always first)
```powershell
gcloud firestore export gs://<backup-bucket>/pre-multitenant-$(Get-Date -Format yyyyMMdd) --project PROD
```
Restore test: import that export into the **staging** project, never into production.

## 2. Deploy with the legacy fallback ON
Deploy normally (`.\deploy.ps1`). `TENANT_LEGACY_FALLBACK` is unset, so an
unmapped host still serves the existing clinic exactly as before.

Verify: home page, a test booking, cancel from "My Appointments", doctor login,
dashboard, and both Cloud Scheduler jobs return 200/207.

> **Behaviour changes patients will notice:** there is no phone/OTP step any more.
> Patients choose a 4-digit PIN on their first booking and use it (with their
> mobile number) in "My Appointments" to view or cancel. Forgotten PINs are reset
> by WhatsApp code or by clinic staff. **Set `PATIENT_PIN_SECRET` before deploying**
> and get the WhatsApp template `patient_pin_reset` approved. Staff book on behalf of patients from
> **New Appointment** in the dashboard. Tell the clinic staff before deploying.

Rollback: redeploy the previous revision (`gcloud run services update-traffic ... --to-revisions=<old>=100`).

## 3. Set the one-time Firestore settings
```powershell
# Let rate-limit counters expire on their own
gcloud firestore fields ttls update expiresAt --collection-group=rate_limits --enable-ttl --project PROD
# Optional: operator console only on your admin hostname
#   set PLATFORM_ADMIN_HOSTS=admin.yourdomain.in in the service environment
```
Deploy the indexes file if it changed: `firebase deploy --only firestore:indexes --project PROD`.

## 4. Move the existing clinic to the scoped layout (optional but recommended)
Only needed to put clinic #1 on the same footing as all new clinics. New
clinics never need this.

1. **Dry run** — prints document counts, changes nothing:
   ```powershell
   npx tsx --env-file=.env scripts/migrate-legacy-to-scoped.ts --clinic <doctorUid> --domain HOST
   ```
2. **Copy** (re-runnable; the source is never modified, so it is your rollback):
   ```powershell
   npx tsx --env-file=.env scripts/migrate-legacy-to-scoped.ts --clinic <doctorUid> --domain HOST --execute
   ```
   Check the "verified in target" counts match.
3. **Cut over** using the maintenance sequence below, in the quiet window. Each
   running instance caches which storage a hostname uses for up to ~20 seconds,
   so for a moment two instances could disagree about where to write. Taking the
   clinic offline first removes any chance of a booking landing in the wrong copy:

   1. Operator console → **Suspend** the clinic (or set `status: "suspended"` on its
      `doctors/<id>` document). The site and APIs now answer "Clinic not found".
   2. **Wait ~30 seconds** so every instance has noticed.
   3. Run the copy once more (`--execute`) — it is idempotent — and check the counts.
   4. In the Firestore console set `domains/HOST` → `storage: "scoped"`.
   5. **Wait ~30 seconds.**
   6. **Reactivate**: set `status: "active"` on the *scoped* document
      `clinics/<id>` (the console does this for you once the scoped copy exists).
4. Smoke-test as in step 2 (book, cancel, doctor login, calendar).
   **Rollback:** repeat the sequence in reverse — suspend, wait, set `storage` back
   to `"legacy"`, wait, set `status: "active"` on `doctors/<id>`, wait. Anything booked
   *after* cut-over exists only in the scoped copy, so roll back promptly and re-copy
   before trying again.
5. Keep the legacy collections for at least a week before removing them.

> This whole sequence is exercised end-to-end, with synthetic data, by
> `scripts/rehearse-migration.ts` on staging. Run it before doing this for real.

## 5. Turn the fallback off
Once every real hostname has a `domains/<host>` mapping (the operator console
shows them), set `TENANT_LEGACY_FALLBACK=off` and redeploy. From then on an
unknown hostname returns "Clinic not found" instead of serving a clinic.

## 6. Onboard clinic #2
Operator console (`/admin` on your admin host) → **New clinic**, or:
```powershell
npx tsx --env-file=.env scripts/provision-clinic.ts --id <id> --name "<Clinic>" --doctor "<Name>" --email <owner@…> --domain <host>
```
Send the printed one-time link to the owner. Map the hostname (see
`CUSTOM_DOMAINS.md`). Then verify isolation on that environment:
```powershell
npx tsx --env-file=.env scripts/verify-tenant-isolation.ts --a <idA> --a-host <hostA> --b <idB> --b-host <hostB>
```
(The isolation script refuses to run unless the project id contains `staging`.)

## Rehearsal on staging
1. Export production Firestore to a bucket; import into the staging project
   (this is the only step that moves real patient data — delete it afterwards).
2. Run step 4 against staging with a staging hostname.
3. Run `verify-tenant-isolation.ts` and click through the doctor and patient flows.
4. Confirm the Content-Security-Policy causes no console errors on the
   patient page, doctor login, calendar, and PDF generation.
