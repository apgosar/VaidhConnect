param (
    # Default is production, exactly as before: .\deploy.ps1
    # Staging is always explicit:               .\deploy.ps1 -Environment staging
    [ValidateSet("production", "staging")]
    [string]$Environment = "production",
    [string]$Region = "asia-south1",
    [string]$ServiceName
)

Write-Host "Deploying to Google Cloud Run ($Environment)..." -ForegroundColor Cyan

$targets = @{
    production = @{ ProjectId = "vaidhconnect-app";        ServiceName = "swasthya-connect";         EnvFile = ".env" }
    staging    = @{ ProjectId = "swasthya-staging-dec36";  ServiceName = "swasthya-connect-staging"; EnvFile = ".env.staging" }
}
$target = $targets[$Environment]
$ProjectId = $target.ProjectId
if (-not $ServiceName) { $ServiceName = $target.ServiceName }

Write-Host "Environment: $Environment"
Write-Host "Project ID: $ProjectId"
Write-Host "Service Name: $ServiceName"
Write-Host "Region: $Region"

if ($Environment -eq "staging") {
    # A brand-new project has none of these enabled. compute.googleapis.com
    # is what creates the default compute service account used below.
    Write-Host "Enabling required APIs on $ProjectId..." -ForegroundColor Cyan
    gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com compute.googleapis.com --project $ProjectId --quiet
    if ($LASTEXITCODE -ne 0) { Write-Host "Failed to enable APIs." -ForegroundColor Red; exit 1 }
}

Write-Host "Fixing IAM permissions for Cloud Build..." -ForegroundColor Cyan
# Retrieve project number to construct the default compute service account
$ProjectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
$ServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"

# Grant necessary permissions for building and pushing containers
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/storage.admin" --quiet > $null

gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/artifactregistry.writer" --quiet > $null

gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/logging.logWriter" --quiet > $null

# ── Local secrets, not Secret Manager ───────────────────────────────────
# Secret Manager bills per active secret version/month past the free tier
# of 6, and every deploy used to add one new version per key with nothing
# ever cleaned up — 23 keys × one version per deploy adds up fast. Values
# now live only in the local .env file and are injected straight into the
# Cloud Run revision as plain runtime env vars via --env-vars-file, which
# accepts .env's own KEY="value" syntax directly. Nothing is written to
# Secret Manager anymore.
# Trade-off: unlike Secret Manager, these values sit in plaintext in the
# Cloud Run revision config (visible via `gcloud run services describe` /
# Cloud Console) and in deploy audit logs. Acceptable here since .env was
# already the plaintext source of truth; revisit if that ever changes.
$envFilePath = $target.EnvFile

if (-not (Test-Path $envFilePath)) {
    Write-Host "Error: $envFilePath not found. Nothing to deploy." -ForegroundColor Red
    exit 1
}

# Safety checks: never ship one environment's credentials to the other
# project, and never deploy a file that still has unfilled placeholders.
$declaredProject = ((Get-Content $envFilePath | Where-Object { $_ -match '^FIREBASE_PROJECT_ID=' } | Select-Object -First 1) -replace '^FIREBASE_PROJECT_ID=', '') -replace '["'']', ''
if ($declaredProject.Trim() -ne $ProjectId) {
    Write-Host "Error: $envFilePath has FIREBASE_PROJECT_ID='$declaredProject' but the target is '$ProjectId'. Refusing to deploy." -ForegroundColor Red
    exit 1
}
$unfilled = Get-Content $envFilePath | Where-Object { -not $_.TrimStart().StartsWith("#") -and $_ -match '<[A-Z_]+>' }
if ($unfilled) {
    Write-Host "Error: $envFilePath still contains <PLACEHOLDER> values. Fill them in first." -ForegroundColor Red
    exit 1
}

# ── Build-time public config ────────────────────────────────────────────
# NEXT_PUBLIC_* variables are inlined into the client-side JS bundle at
# BUILD time — Cloud Run's runtime secrets/env vars can't reach code that
# already shipped to the browser. These values aren't secrets (Firebase's
# client config is designed to be public; access control lives in the
# Firestore/Storage security rules, not in hiding this key), so it's safe
# to put just this subset in the build context. Regenerated fresh every
# run and deleted immediately after, success or failure.
# Windows PowerShell 5.1's `-Encoding utf8` always prepends a UTF-8 BOM.
# gcloud's --env-vars-file parser chokes on a BOM before the first key
# ("Invalid YAML/JSON data... expected map-like data"), so both files
# below are written via .NET with an explicit BOM-less UTF-8 encoding.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false

$buildEnvFile = ".env.production"
Write-Host "Writing build-time public config to $buildEnvFile..." -ForegroundColor Cyan
$buildLines = Get-Content $envFilePath | Where-Object { $_ -match '^NEXT_PUBLIC_' }
[System.IO.File]::WriteAllLines((Join-Path (Get-Location) $buildEnvFile), $buildLines, $utf8NoBom)

# ── Runtime environment variables ───────────────────────────────────────
# Everything else in .env (excluding NEXT_PUBLIC_*, comments, and blank
# lines) is passed to Cloud Run as plain runtime env vars via
# --env-vars-file. Written to the OS temp dir, never the repo, and removed
# whether the deploy succeeds or fails.
# The filename MUST end in ".env" — gcloud's --env-vars-file picks its
# parser purely from the file extension (googlecloudsdk/command_lib/util/
# args/map_util.py: ArgDictWithYAMLOrEnv), and anything else falls through
# to the YAML parser, which rejects KEY="value" lines as "expected
# map-like data".
$runtimeEnvFile = Join-Path $env:TEMP "clinic-app-runtime.env"
Write-Host "Preparing runtime environment variables from $envFilePath..." -ForegroundColor Cyan
$runtimeLines = Get-Content $envFilePath | Where-Object {
    $line = $_.Trim()
    $line -and -not $line.StartsWith("#") -and $line -notmatch '^NEXT_PUBLIC_'
}
[System.IO.File]::WriteAllLines($runtimeEnvFile, $runtimeLines, $utf8NoBom)

try {
    # --clear-secrets is a cheap no-op safety net: nothing in Secret
    # Manager backs any env var anymore (all 23 clinic-app-* secrets were
    # deleted once every key here became a plain literal), so there's no
    # secret-vs-literal type conflict left for gcloud to trip over. A
    # one-time `services update --clear-secrets` pre-step used to be
    # needed here to work around exactly that conflict (gcloud applies
    # env-var-literal changes before secret changes within a single
    # `deploy` call, so converting a key from secret-backed to literal in
    # one shot used to fail) — it's gone now that there's nothing left to
    # convert. If a secret ever gets bound again (e.g. manually, outside
    # this script) to a key that's also in .env, this exact deploy would
    # fail with "Cannot update environment variable [X] to string literal
    # because it has already been set with a different type" and the
    # services-update pre-step would need to come back for that one run.
    gcloud run deploy $ServiceName `
        --source . `
        --project $ProjectId `
        --region $Region `
        --allow-unauthenticated `
        --quiet `
        --clear-secrets `
        --env-vars-file="$runtimeEnvFile"

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Deployment successful!" -ForegroundColor Green
    } else {
        Write-Host "Deployment failed. Ensure you have run 'gcloud auth login' and 'gcloud config set project $ProjectId'." -ForegroundColor Red
    }
} finally {
    Remove-Item -Path $buildEnvFile -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $runtimeEnvFile -Force -ErrorAction SilentlyContinue
}
