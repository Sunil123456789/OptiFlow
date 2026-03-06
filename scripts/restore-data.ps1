param(
    [Parameter(Mandatory = $true)]
    [string]$BackupZip
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "backend\data"

if (!(Test-Path $BackupZip)) {
    Write-Host "[FAIL] Backup zip not found: $BackupZip"
    exit 1
}

if (!(Test-Path $dataDir)) {
    New-Item -ItemType Directory -Path $dataDir | Out-Null
}

Expand-Archive -Path $BackupZip -DestinationPath $dataDir -Force
Write-Host "[PASS] Data restored from: $BackupZip"
