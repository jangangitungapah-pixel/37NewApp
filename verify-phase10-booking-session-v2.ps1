[CmdletBinding()]
param(
    [string]$ExpectedBranch = 'feature/phase-10-booking-session-lifecycle',
    [string]$ExpectedCommit = 'c3333c61e087ab6a3e6d6ca48e71e0ce3b4f24d8'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

$repoRoot = (Get-Location).Path
$logDir = Join-Path $repoRoot 'logs'
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $logDir "phase10-verification-$timestamp.txt"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$script:logPath = $logPath
$script:stageResults = [System.Collections.Generic.List[object]]::new()

function Write-LogLine {
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Message)
    $Message | Tee-Object -FilePath $script:logPath -Append
}

function Invoke-LoggedStage {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Command
    )

    Write-LogLine ''
    Write-LogLine ("===== STAGE: {0} =====" -f $Name)
    $global:LASTEXITCODE = 0
    try {
        & $Command 2>&1 |
            ForEach-Object { "$($_)" } |
            Tee-Object -FilePath $script:logPath -Append
        $code = $global:LASTEXITCODE
        if ($null -eq $code) { $code = 0 }
    }
    catch {
        $_ | ForEach-Object { "$($_)" } | Tee-Object -FilePath $script:logPath -Append
        $code = 1
    }

    Write-LogLine ("EXIT_CODE [{0}] = {1}" -f $Name, $code)
    $script:stageResults.Add([pscustomobject]@{
        Stage = $Name
        ExitCode = [int]$code
    }) | Out-Null
    return [int]$code
}

function Get-GitValue {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $value = & git @Arguments 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    return (($value | Out-String).Trim())
}

$branch = Get-GitValue -Arguments @('branch', '--show-current')
$head = Get-GitValue -Arguments @('rev-parse', 'HEAD')

Write-LogLine '37NewApp — Phase 10 Booking & Session Verification (logger fix)'
Write-LogLine ("Timestamp       : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss K'))
Write-LogLine ("Repository root : {0}" -f $repoRoot)
Write-LogLine ("Branch          : {0}" -f $branch)
Write-LogLine ("HEAD            : {0}" -f $head)
Write-LogLine ("Expected commit : {0}" -f $ExpectedCommit)
Write-LogLine 'Safety          : No pull, merge, deploy, Hosting publish, or production data writes.'

if ($branch -ne $ExpectedBranch) {
    Write-LogLine ("FATAL: Expected branch '{0}', found '{1}'. No verification stages were run." -f $ExpectedBranch, $branch)
    Write-LogLine 'EXIT_CODE [PRECHECK] = 2'
    Write-Host "Verification stopped. Review: $logPath" -ForegroundColor Red
    exit 2
}

if ($ExpectedCommit -and $head -ne $ExpectedCommit) {
    Write-LogLine ("FATAL: Expected HEAD '{0}', found '{1}'. Pull the latest branch or reconcile local commits before verification." -f $ExpectedCommit, $head)
    Write-LogLine 'EXIT_CODE [PRECHECK] = 2'
    Write-Host "Verification stopped. Review: $logPath" -ForegroundColor Red
    exit 2
}

Invoke-LoggedStage -Name 'Runtime versions' -Command {
    node --version
    npm --version
} | Out-Null

if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
    Invoke-LoggedStage -Name 'Install locked dependencies (node_modules missing)' -Command {
        npm ci
    } | Out-Null
}
else {
    Write-LogLine ''
    Write-LogLine '===== STAGE: Dependency install ====='
    Write-LogLine 'SKIPPED: node_modules already exists; package-lock.json is left unchanged.'
    Write-LogLine 'EXIT_CODE [Dependency install] = 0'
    $script:stageResults.Add([pscustomobject]@{ Stage = 'Dependency install'; ExitCode = 0 }) | Out-Null
}

Invoke-LoggedStage -Name 'Firebase CLI availability' -Command {
    $firebaseCommand = Get-Command firebase -ErrorAction SilentlyContinue
    if (-not $firebaseCommand) {
        throw 'Firebase CLI tidak ditemukan. Instal Firebase CLI secara global lalu jalankan ulang script.'
    }
    firebase --version
} | Out-Null

Invoke-LoggedStage -Name 'ESLint' -Command {
    npm run lint
} | Out-Null

Invoke-LoggedStage -Name 'Targeted booking/session unit tests' -Command {
    npm run test:unit -- tests/unit/bookingSessionLifecycle.test.js tests/unit/bookingSlotAndValidator.test.js
} | Out-Null

Invoke-LoggedStage -Name 'Firestore Rules emulator tests' -Command {
    npm run test:rules
} | Out-Null

Invoke-LoggedStage -Name 'Production build' -Command {
    npm run build
} | Out-Null

Invoke-LoggedStage -Name 'Final Git status' -Command {
    git status --short --branch
} | Out-Null

Invoke-LoggedStage -Name 'Final commit SHA' -Command {
    git rev-parse HEAD
} | Out-Null

Write-LogLine ''
Write-LogLine '===== SUMMARY ====='
foreach ($result in $script:stageResults) {
    Write-LogLine ("{0}: {1}" -f $result.Stage, $result.ExitCode)
}

$failed = @($script:stageResults | Where-Object { $_.ExitCode -ne 0 })
if ($failed.Count -eq 0) {
    Write-LogLine 'OVERALL_RESULT = PASS'
    Write-Host "Phase 10 verification gates passed. Log: $logPath" -ForegroundColor Green
    exit 0
}

Write-LogLine ("OVERALL_RESULT = FAIL ({0} failed stage(s))" -f $failed.Count)
Write-Host "Phase 10 verification has $($failed.Count) failed stage(s). Review: $logPath" -ForegroundColor Red
exit 1
