$ErrorActionPreference = "Stop"

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Url,
        [hashtable]$Headers = @{}
    )

    try {
        $res = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -TimeoutSec 10
        Write-Host "[PASS] $Name -> HTTP $($res.StatusCode)"
        return $true
    } catch {
        Write-Host "[FAIL] $Name -> $($_.Exception.Message)"
        return $false
    }
}

$checks = @(
    @{ name = "Backend Health"; url = "http://localhost:8000/health"; headers = @{} },
    @{ name = "Backend Ready"; url = "http://localhost:8000/ready"; headers = @{} },
    @{ name = "Frontend"; url = "http://localhost:5173"; headers = @{} }
)

$authHeaders = @{}
$loginSucceeded = $false
try {
    $adminEmails = @("admin@optiflow.local", "admin@fixbeforefail.local")
    foreach ($adminEmail in $adminEmails) {
        try {
            $loginBody = @{ email = $adminEmail; password = "changeme" } | ConvertTo-Json
            $loginRes = Invoke-WebRequest -UseBasicParsing -Method Post -Uri "http://localhost:8000/api/v1/auth/login" -ContentType "application/json" -Body $loginBody -TimeoutSec 10
            $token = ($loginRes.Content | ConvertFrom-Json).access_token
            $authHeaders = @{ Authorization = "Bearer $token" }
            Write-Host "[PASS] Auth Login ($adminEmail) -> HTTP $($loginRes.StatusCode)"
            $loginSucceeded = $true
            break
        } catch {
            Write-Host "[INFO] Auth attempt failed for $adminEmail"
        }
    }

    if ($loginSucceeded) {
        $checks += @{ name = "Dashboard Summary"; url = "http://localhost:8000/api/v1/dashboard/summary"; headers = $authHeaders }
        $checks += @{ name = "Users List (Admin)"; url = "http://localhost:8000/api/v1/users"; headers = $authHeaders }
        $checks += @{ name = "Roles List (Admin)"; url = "http://localhost:8000/api/v1/roles"; headers = $authHeaders }
        $checks += @{ name = "Audit Logs (Admin)"; url = "http://localhost:8000/api/v1/audit-logs?page=1&page_size=5&sort_by=event_at&sort_dir=desc"; headers = $authHeaders }
        $checks += @{ name = "Departments (Plant Map)"; url = "http://localhost:8000/api/v1/departments"; headers = $authHeaders }
        $checks += @{ name = "Failure Logs"; url = "http://localhost:8000/api/v1/failure-logs"; headers = $authHeaders }
        $checks += @{ name = "Filtered Machines List"; url = "http://localhost:8000/api/v1/machines?page=1&page_size=5&q=cnc&sort_by=name&sort_dir=asc"; headers = $authHeaders }
        $checks += @{ name = "Machines Export"; url = "http://localhost:8000/api/v1/machines/export?q=cnc&sort_by=name&sort_dir=asc"; headers = $authHeaders }
    }
} catch {
    Write-Host "[FAIL] Auth Login -> $($_.Exception.Message)"
}

$allPass = $true
if (-not $loginSucceeded) {
    $allPass = $false
    Write-Host "[FAIL] Auth Login -> Could not authenticate with known admin defaults."
}
foreach ($check in $checks) {
    $ok = Test-Endpoint -Name $check.name -Url $check.url -Headers $check.headers
    if (-not $ok) { $allPass = $false }
}

if ($allPass) {
    Write-Host "E2E verification passed."
    exit 0
}

Write-Host "E2E verification failed."
exit 1

