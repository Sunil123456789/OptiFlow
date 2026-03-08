param(
    [string]$ApiBaseUrl = "http://localhost:8000",
    [string]$FrontendUrl = "http://localhost:5173",
    [string]$Email = "admin@optiflow.local",
    [string]$Password = "changeme"
)

$ErrorActionPreference = "Stop"

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers = @{}
    )

    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -TimeoutSec 15
        Write-Host "[PASS] $Name -> HTTP $($res.StatusCode)"
        return $true
    } catch {
        Write-Host "[FAIL] $Name -> $($_.Exception.Message)"
        return $false
    }
}

$allPass = $true

if (-not (Test-Endpoint -Name "Backend Health" -Url "$ApiBaseUrl/health")) { $allPass = $false }
if (-not (Test-Endpoint -Name "Backend Ready" -Url "$ApiBaseUrl/ready")) { $allPass = $false }
if (-not (Test-Endpoint -Name "Frontend" -Url $FrontendUrl)) { $allPass = $false }

$authHeaders = @{}
try {
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json
    $loginRes = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/api/v1/auth/login" -ContentType "application/json" -Body $body -TimeoutSec 15
    $token = $loginRes.access_token
    if ([string]::IsNullOrWhiteSpace($token)) {
        throw "Empty access token"
    }
    $authHeaders = @{ Authorization = "Bearer $token" }
    Write-Host "[PASS] Auth Login ($Email)"
} catch {
    Write-Host "[FAIL] Auth Login -> $($_.Exception.Message)"
    $allPass = $false
}

if ($authHeaders.Count -gt 0) {
    if (-not (Test-Endpoint -Name "Users List" -Url "$ApiBaseUrl/api/v1/users" -Headers $authHeaders)) { $allPass = $false }
    if (-not (Test-Endpoint -Name "Failure Logs" -Url "$ApiBaseUrl/api/v1/failure-logs" -Headers $authHeaders)) { $allPass = $false }
    if (-not (Test-Endpoint -Name "Import History" -Url "$ApiBaseUrl/api/v1/master-data/import-history" -Headers $authHeaders)) { $allPass = $false }
    if (-not (Test-Endpoint -Name "Integrity Checks" -Url "$ApiBaseUrl/api/v1/plant-mapping/integrity-checks" -Headers $authHeaders)) { $allPass = $false }
    if (-not (Test-Endpoint -Name "Spare Parts" -Url "$ApiBaseUrl/api/v1/spare-parts?page=1&page_size=5" -Headers $authHeaders)) { $allPass = $false }
    if (-not (Test-Endpoint -Name "Alerts" -Url "$ApiBaseUrl/api/v1/alerts?status_filter=open" -Headers $authHeaders)) { $allPass = $false }

    try {
        $partsRes = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/api/v1/spare-parts?page=1&page_size=1" -Headers $authHeaders -TimeoutSec 15
        $part = $partsRes.items | Select-Object -First 1
        if ($null -eq $part) {
            throw "No spare part found to validate consumption flow"
        }

        $machineCode = "MCH-SMOKE-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
        $workOrderCode = "WO-SMOKE-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

        $machinePayload = @{
            machine_code = $machineCode
            name = "Smoke Test Machine"
            criticality = "low"
            status = "active"
        } | ConvertTo-Json
        $machine = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/api/v1/machines" -Headers $authHeaders -ContentType "application/json" -Body $machinePayload -TimeoutSec 15

        $workOrderPayload = @{
            work_order_code = $workOrderCode
            machine_id = [int]$machine.id
            status = "in_progress"
            priority = "low"
        } | ConvertTo-Json
        $workOrder = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/api/v1/work-orders" -Headers $authHeaders -ContentType "application/json" -Body $workOrderPayload -TimeoutSec 15

        $consumePayload = @{
            part_id = [int]$part.id
            quantity = 1
            notes = "smoke-test"
        } | ConvertTo-Json
        $consumption = Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/api/v1/work-orders/$($workOrder.id)/parts/consume" -Headers $authHeaders -ContentType "application/json" -Body $consumePayload -TimeoutSec 15
        Write-Host "[PASS] Work Order Part Consume -> created consumption $($consumption.id)"

        $history = Invoke-RestMethod -Method Get -Uri "$ApiBaseUrl/api/v1/work-orders/$($workOrder.id)/parts" -Headers $authHeaders -TimeoutSec 15
        if (($history | Measure-Object).Count -lt 1) {
            throw "No consumption history row found after consume"
        }
        Write-Host "[PASS] Work Order Part History -> count $(($history | Measure-Object).Count)"

        Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$ApiBaseUrl/api/v1/work-orders/$($workOrder.id)/parts/$($consumption.id)" -Headers $authHeaders -TimeoutSec 15 | Out-Null
        Write-Host "[PASS] Work Order Part Reverse -> HTTP 204"

        Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$ApiBaseUrl/api/v1/work-orders/$($workOrder.id)" -Headers $authHeaders -TimeoutSec 15 | Out-Null
        Invoke-WebRequest -UseBasicParsing -Method Delete -Uri "$ApiBaseUrl/api/v1/machines/$($machine.id)" -Headers $authHeaders -TimeoutSec 15 | Out-Null
        Write-Host "[PASS] Smoke Cleanup -> Temporary work order and machine deleted"
    } catch {
        Write-Host "[FAIL] Phase-5 Consumption Flow -> $($_.Exception.Message)"
        $allPass = $false
    }
}

if ($allPass) {
    Write-Host "Production smoke verification passed."
    exit 0
}

Write-Host "Production smoke verification failed."
exit 1
