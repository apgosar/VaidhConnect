# Giving a clinic a hostname

A clinic is reached by hostname. Two things must be true: **DNS + TLS** point the
hostname at the service, and **a `domains/<host>` mapping** tells the app which
clinic it is. The operator console's "Add hostname" (or provisioning) creates the
mapping; DNS/TLS is the part below.

## Option A — subdomains of your own domain (recommended)
`drshah.yourdomain.in`, `clinicb.yourdomain.in`, …

One-time setup, then every new clinic is just a console click:
1. Put the service behind a global external HTTPS load balancer with a
   serverless NEG for the Cloud Run service.
2. Create a **wildcard** certificate for `*.yourdomain.in` (Certificate Manager
   with DNS authorization) and attach it.
3. Add a wildcard DNS record `*.yourdomain.in` → the load balancer's IP.
4. In the console, add the hostname to the clinic. Live within ~1 minute.

## Option B — a clinic's own domain (`www.drshahclinic.in`)
1. In the console, add the hostname to the clinic.
2. Ask the clinic to point it at you: a CNAME (subdomain) or A/AAAA records
   (apex) as shown by the load balancer / `gcloud beta run domain-mappings`.
3. Certificate is issued automatically once DNS resolves (managed certificate)
   or add the hostname to the wildcard/SAN certificate.

Simple alternative without a load balancer (small scale only):
```powershell
gcloud beta run domain-mappings create --service <service> --domain <host> --region asia-south1 --project <project>
```
(requires verifying domain ownership in Search Console; one mapping per host).

## Notes
- Hostnames are matched case-insensitively and without port.
- A hostname can belong to exactly one clinic; the console refuses duplicates.
- To retire a hostname, remove it in the console — the clinic's other hostnames keep working.
- Firebase Auth "authorized domains" are **not** needed: sign-in uses email/password
  and password-reset links are hosted on Firebase's own domain.
