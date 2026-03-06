$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$backendEnv = Join-Path $root "backend\.env"
$frontendEnv = Join-Path $root "frontend\.env.production"

if (!(Test-Path $backendEnv)) {
    Write-Host "[FAIL] Missing backend/.env"
    exit 1
}
if (!(Test-Path $frontendEnv)) {
    Write-Host "[FAIL] Missing frontend/.env.production"
    exit 1
}

$backendText = Get-Content -Raw $backendEnv
$frontendText = Get-Content -Raw $frontendEnv

$requiredBackendKeys = @("DATABASE_URL", "REDIS_URL", "JWT_SECRET_KEY", "CORS_ALLOW_ORIGINS")
$allOk = $true

foreach ($key in $requiredBackendKeys) {
    if ($backendText -notmatch "(?m)^$key=") {
        Write-Host "[FAIL] backend/.env missing key: $key"
        $allOk = $false
    }
}

if ($backendText -match "replace-with-long-random-secret|replace-postgres-password") {
    Write-Host "[FAIL] backend/.env contains placeholder secrets/passwords"
    $allOk = $false
}

if ($frontendText -notmatch "(?m)^VITE_API_BASE_URL=") {
    Write-Host "[FAIL] frontend/.env.production missing VITE_API_BASE_URL"
    $allOk = $false
}

if ($allOk) {
    Write-Host "[PASS] Production env files look good."
    exit 0
}

Write-Host "Production env validation failed."
exit 1
