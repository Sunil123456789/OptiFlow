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
}

if ($allPass) {
    Write-Host "Production smoke verification passed."
    exit 0
}

Write-Host "Production smoke verification failed."
exit 1
