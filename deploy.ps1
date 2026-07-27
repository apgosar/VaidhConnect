param (
    [string]$Region = "asia-south1",
    [string]$ServiceName = "vaidhconnect"
)

Write-Host "Deploying to Google Cloud Run..." -ForegroundColor Cyan

# The user already created the project
$ProjectId = "vaidhconnect-app"

Write-Host "Project ID: $ProjectId"
Write-Host "Service Name: $ServiceName"
Write-Host "Region: $Region"

Write-Host "Fixing IAM permissions for Cloud Build..." -ForegroundColor Cyan
# Retrieve project number to construct the default compute service account
$ProjectNumber = gcloud projects describe $ProjectId --format="value(projectNumber)"
$ServiceAccount = "$ProjectNumber-compute@developer.gserviceaccount.com"

# Grant necessary permissions for building and pushing containers
gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/storage.admin" > $null

gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/artifactregistry.writer" > $null

gcloud projects add-iam-policy-binding $ProjectId `
    --member="serviceAccount:$ServiceAccount" `
    --role="roles/logging.logWriter" > $null

# Parse .env file
$envFilePath = ".env"
$envVars = @()

if (Test-Path $envFilePath) {
    Write-Host "Reading environment variables from $envFilePath..." -ForegroundColor Cyan
    Get-Content $envFilePath | ForEach-Object {
        $line = $_.Trim()
        if ($line -and !$line.StartsWith("#")) {
            $parts = $line -split '=', 2
            if ($parts.Length -eq 2) {
                $key = $parts[0].Trim()
                $value = $parts[1].Trim().Trim('"', "'")
                
                # Exclude development specific vars if needed, but for now we push all
                $envVars += "$key=$value"
            }
        }
    }
} else {
    Write-Host "Warning: $envFilePath not found." -ForegroundColor Yellow
}

$envString = $envVars -join ","

# Run the gcloud command to deploy from source
gcloud run deploy $ServiceName `
    --source . `
    --project $ProjectId `
    --region $Region `
    --allow-unauthenticated `
    --set-env-vars="$envString"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment successful!" -ForegroundColor Green
} else {
    Write-Host "Deployment failed. Ensure you have run 'gcloud auth login' and 'gcloud config set project $ProjectId'." -ForegroundColor Red
}
