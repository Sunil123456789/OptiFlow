param(
    [string]$OutputDir = "",
    [int]$KeepLast = 20
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $root "backend\data"
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $root "backups"
}

if (!(Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

if (!(Test-Path $dataDir)) {
    Write-Host "[FAIL] Data directory not found: $dataDir"
    exit 1
}

$archivePath = Join-Path $OutputDir "optiflow_data_backup_$timestamp.zip"
Compress-Archive -Path (Join-Path $dataDir "*.json") -DestinationPath $archivePath -Force

Write-Host "[PASS] Backup created: $archivePath"

if ($KeepLast -gt 0) {
    $allBackups = Get-ChildItem -Path $OutputDir -Filter "optiflow_data_backup_*.zip" |
        Sort-Object LastWriteTime -Descending

    if ($allBackups.Count -gt $KeepLast) {
        $toRemove = $allBackups | Select-Object -Skip $KeepLast
        foreach ($item in $toRemove) {
            Remove-Item -Path $item.FullName -Force
        }
        Write-Host "[INFO] Retention applied: kept latest $KeepLast backup(s), removed $($toRemove.Count)."
    }
}
