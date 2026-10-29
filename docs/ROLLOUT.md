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

> **Behaviour changes patients will notice:** there is no phone/OTP step any more
> (patients enter their details when booking); "My Appointments" shows only
> bookings made on that device. Staff book on behalf of patients from
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
3. **Cut over** during the quiet window: re-run step 2 once more, then in the
   Firestore console set `domains/HOST` → `storage: "scoped"`.
   (Changes reach live traffic within ~1 minute.)
4. Smoke-test as in step 2. **Rollback:** set `storage` back to `"legacy"`.
   Anything booked *after* cut-over lives only in the scoped copy, so roll back
   promptly if you must, and re-copy later.
5. Keep the legacy collections for at least a week before removing them.

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
