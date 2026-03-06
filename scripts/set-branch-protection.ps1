param(
    [Parameter(Mandatory = $true)]
    [string]$Owner,
    [Parameter(Mandatory = $true)]
    [string]$Repo,
    [string]$Branch = "main",
    [string]$GithubToken = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($GithubToken)) {
    $GithubToken = $env:GITHUB_TOKEN
}

if ([string]::IsNullOrWhiteSpace($GithubToken)) {
    Write-Host "[FAIL] GitHub token not provided. Pass -GithubToken or set GITHUB_TOKEN."
    exit 1
}

$uri = "https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection"
$headers = @{
    Authorization = "Bearer $GithubToken"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

$payload = @{
    required_status_checks = @{
        strict = $true
        contexts = @("build-and-smoke")
    }
    enforce_admins = $true
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 1
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -ContentType "application/json" -Body $payload | Out-Null
Write-Host "[PASS] Branch protection applied for ${Owner}/${Repo}:${Branch}"
