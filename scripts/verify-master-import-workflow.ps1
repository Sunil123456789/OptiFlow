$ErrorActionPreference = "Stop"

function Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message"
    exit 1
}

function Pass {
    param([string]$Message)
    Write-Host "[PASS] $Message"
}

try {
    $adminEmails = @("admin@optiflow.local", "admin@fixbeforefail.local")
    $authHeaders = $null

    foreach ($adminEmail in $adminEmails) {
        try {
            $loginBody = @{ email = $adminEmail; password = "changeme" } | ConvertTo-Json
            $loginRes = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 10
            $token = $loginRes.access_token
            if ([string]::IsNullOrWhiteSpace($token)) {
                continue
            }
            $authHeaders = @{ Authorization = "Bearer $token" }
            Pass "Auth Login ($adminEmail)"
            break
        } catch {
            Write-Host "[INFO] Auth attempt failed for $adminEmail"
        }
    }

    if ($null -eq $authHeaders) {
        Fail "Could not authenticate with known admin defaults."
    }

    $stamp = Get-Date -Format "MMddHHmmss"
    $depCode = "D$stamp"
    $lineCode = "L$stamp"
    $stationCode = "S$stamp"

    $csvText = @(
        "entity_type,code,name,parent_code,is_active"
        "department,$depCode,Auto Department $stamp,,true"
        "line,$lineCode,Auto Line $stamp,$depCode,true"
        "station,$stationCode,Auto Station $stamp,$lineCode,true"
    ) -join "`n"

    $dryRunPayload = @{
        csv_text = $csvText
        dry_run = $true
        source_file_name = "phase2-dryrun-$stamp.csv"
    } | ConvertTo-Json -Depth 5

    $dryRun = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/master-data/import-csv" -Headers $authHeaders -ContentType "application/json" -Body $dryRunPayload -TimeoutSec 20
    if (-not $dryRun.dry_run) {
        Fail "Dry-run response did not return dry_run=true."
    }
    Pass "Dry-run import completed (batch: $($dryRun.batch_id))"

    $applyPayload = @{
        csv_text = $csvText
        dry_run = $false
        source_file_name = "phase2-apply-$stamp.csv"
    } | ConvertTo-Json -Depth 5

    $applied = Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/master-data/import-csv" -Headers $authHeaders -ContentType "application/json" -Body $applyPayload -TimeoutSec 20
    if ($applied.dry_run) {
        Fail "Apply response incorrectly returned dry_run=true."
    }
    $batchId = [string]$applied.batch_id
    if ([string]::IsNullOrWhiteSpace($batchId)) {
        Fail "Apply response missing batch_id."
    }
    Pass "Applied import completed (batch: $batchId)"

    $departments = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/departments" -Headers $authHeaders -TimeoutSec 10
    $lines = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/lines" -Headers $authHeaders -TimeoutSec 10
    $stations = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/stations" -Headers $authHeaders -TimeoutSec 10

    if (-not ($departments | Where-Object { $_.code -eq $depCode })) { Fail "Department from applied batch not found before rollback." }
    if (-not ($lines | Where-Object { $_.code -eq $lineCode })) { Fail "Line from applied batch not found before rollback." }
    if (-not ($stations | Where-Object { $_.code -eq $stationCode })) { Fail "Station from applied batch not found before rollback." }
    Pass "Applied records are present before rollback"

    $history = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/master-data/import-history" -Headers $authHeaders -TimeoutSec 10
    if (-not ($history | Where-Object { $_.batch_id -eq $batchId })) {
        Fail "Applied batch not found in import history."
    }
    Pass "Import history includes applied batch"

    $rollback = Invoke-RestMethod -Method Post -Uri ("http://localhost:8000/api/v1/master-data/import-history/{0}/rollback" -f $batchId) -Headers $authHeaders -TimeoutSec 20
    if ([int]$rollback.rolled_back_changes -lt 1) {
        Fail "Rollback reported zero changes."
    }
    Pass "Rollback completed (changes: $($rollback.rolled_back_changes))"

    $departmentsAfter = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/departments" -Headers $authHeaders -TimeoutSec 10
    $linesAfter = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/lines" -Headers $authHeaders -TimeoutSec 10
    $stationsAfter = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/stations" -Headers $authHeaders -TimeoutSec 10

    if ($departmentsAfter | Where-Object { $_.code -eq $depCode }) { Fail "Department still exists after rollback." }
    if ($linesAfter | Where-Object { $_.code -eq $lineCode }) { Fail "Line still exists after rollback." }
    if ($stationsAfter | Where-Object { $_.code -eq $stationCode }) { Fail "Station still exists after rollback." }
    Pass "Rollback cleanup verified"

    $integrity = Invoke-RestMethod -Method Get -Uri "http://localhost:8000/api/v1/plant-mapping/integrity-checks" -Headers $authHeaders -TimeoutSec 10
    if ($null -eq $integrity) {
        Fail "Integrity endpoint returned null response."
    }
    Pass "Integrity check endpoint reachable"

    Write-Host "Phase-2 import workflow verification passed."
    exit 0
} catch {
    $detail = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) {
        $detail = "{0} | {1}" -f $detail, $_.ErrorDetails.Message
    }
    Fail $detail
}
