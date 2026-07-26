param (
    [string]$Region = "us-central1",
    [string]$ServiceName = "vaidhconnect"
)

Write-Host "Deploying to Google Cloud Run..." -ForegroundColor Cyan

# The user already created the project
$ProjectId = "vaidhconnect-app"

Write-Host "Project ID: $ProjectId"
Write-Host "Service Name: $ServiceName"
Write-Host "Region: $Region"

# Run the gcloud command to deploy from source
# --source . uses Cloud Build to build the Dockerfile and deploy
gcloud run deploy $ServiceName `
    --source . `
    --project $ProjectId `
    --region $Region `
    --allow-unauthenticated

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
    Write-Host "IMPORTANT: Make sure your environment variables (DATABASE_URL, NEXTAUTH_SECRET) are set in the Cloud Run console under Revisions -> Variables & Secrets." -ForegroundColor Yellow
} else {
    Write-Host "Deployment failed. Ensure you have run 'gcloud auth login' and 'gcloud config set project $ProjectId'." -ForegroundColor Red
}
