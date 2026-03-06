param(
    [switch]$SkipInfra
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$infraPath = Join-Path $root "infra"
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$seedFile = Join-Path $root "db\seed.sql"
$venvPython = Join-Path $backendPath ".venv\Scripts\python.exe"

$hasDocker = $false
if (-not $SkipInfra) {
    $dockerCmd = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -ne $dockerCmd) {
        $hasDocker = $true
    } else {
        Write-Warning "Docker not found. Continuing without Postgres/Redis infra."
        $SkipInfra = $true
    }
}

if (-not $SkipInfra -and $hasDocker) {
    Write-Host "[1/7] Starting PostgreSQL + Redis..."
    Push-Location $infraPath
    try {
        docker compose up -d
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[1/7] Skipping infra startup."
}

if (!(Test-Path $venvPython)) {
    Write-Host "[2/7] Creating backend virtual environment..."
    Push-Location $backendPath
    try {
        python -m venv .venv
    } finally {
        Pop-Location
    }
} else {
    Write-Host "[2/7] Backend virtual environment already exists."
}

Write-Host "[3/7] Installing backend dependencies..."
& $venvPython -m pip install -r (Join-Path $backendPath "requirements.txt")

$envFile = Join-Path $backendPath ".env"
if (!(Test-Path $envFile)) {
    Write-Host "[4/7] Creating backend .env from template..."
    Copy-Item (Join-Path $backendPath ".env.example") $envFile
} else {
    Write-Host "[4/7] Backend .env already exists."
}

if (-not $SkipInfra -and $hasDocker) {
    Write-Host "[5/7] Applying migrations..."
    Push-Location $backendPath
    try {
        & $venvPython -m alembic upgrade head
    } finally {
        Pop-Location
    }

    Write-Host "[6/7] Seeding sample data..."
    Get-Content $seedFile | docker exec -i optiflow-db psql -U optiflow -d optiflow
} else {
    Write-Host "[5/7] Skipping migrations (no DB infra)."
    Write-Host "[6/7] Skipping seed data (no DB infra)."
}

Write-Host "[7/7] Starting backend and frontend in separate terminals..."
$backendCmd = "Set-Location '$backendPath'; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
$frontendCmd = "Set-Location '$frontendPath'; npm run dev"

Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd | Out-Null
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd | Out-Null

Write-Host "Done. API: http://localhost:8000  UI: http://localhost:5173"
if ($SkipInfra) {
    Write-Host "Note: Running without Postgres/Redis. /ready may show degraded status."
}
Write-Host "Run scripts\\verify-e2e.ps1 after services are up."

