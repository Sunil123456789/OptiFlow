$ErrorActionPreference = "Continue"

$root = Split-Path -Parent $PSScriptRoot
$infraPath = Join-Path $root "infra"

Write-Host "Stopping backend/frontend dev processes..."
Get-CimInstance Win32_Process |
    Where-Object {
        ($_.Name -match "python.exe|node.exe|powershell.exe") -and
        ($_.CommandLine -match "OptiFlow") -and
        ($_.CommandLine -match "uvicorn|vite|npm run dev")
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped PID $($_.ProcessId)"
    }

Write-Host "Stopping PostgreSQL + Redis containers..."
Push-Location $infraPath
try {
    docker compose down
} finally {
    Pop-Location
}

Write-Host "Done."

