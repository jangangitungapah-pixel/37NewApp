[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$logPath = Join-Path $repoRoot ('verify-phase10-booking-rules-{0}.txt' -f $timestamp)
$script:failedStages = @()

Set-Location -LiteralPath $repoRoot

function Write-VerificationLog {
    param([Parameter(Mandatory = $true)][string]$Message)

    $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Host $line
}

function Invoke-VerificationStage {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-VerificationLog ''
    Write-VerificationLog ('===== STAGE: {0} =====' -f $Name)

    $stageExitCode = 0
    $output = @()
    $LASTEXITCODE = 0

    try {
        $output = @(& $Command 2>&1)

        if ($null -ne $LASTEXITCODE) {
            $stageExitCode = [int]$LASTEXITCODE
        }
    }
    catch {
        $output += $_
        $stageExitCode = 1
    }

    foreach ($item in $output) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            $rendered = $item.ToString()
        }
        else {
            $rendered = [string]$item
        }

        Add-Content -LiteralPath $logPath -Value $rendered -Encoding UTF8
        Write-Host $rendered
    }

    Write-VerificationLog ('EXIT_CODE [{0}] = {1}' -f $Name, $stageExitCode)

    if ($stageExitCode -ne 0) {
        $script:failedStages += $Name
    }
}

Write-VerificationLog '37NewApp - Phase 10 Booking Rules Optimization Verification'
Write-VerificationLog ('Repository root: {0}' -f $repoRoot)
Write-VerificationLog ('Log file: {0}' -f $logPath)
Write-VerificationLog 'Safety: local verification only; no deploy, Hosting publish, merge, or production data writes.'

Invoke-VerificationStage -Name 'PowerShell parser check' -Command {
    $tokens = $null
    $parseErrors = $null

    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $PSCommandPath,
        [ref]$tokens,
        [ref]$parseErrors
    )

    if ($parseErrors.Count -gt 0) {
        $parseErrors | ForEach-Object { Write-Output $_.Message }
        throw 'PowerShell parser reported syntax errors.'
    }

    Write-Output 'PowerShell parser: PASS'
}

Invoke-VerificationStage -Name 'Branch guard' -Command {
    $branch = [string](git branch --show-current)

    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to determine the current Git branch.'
    }

    $branch = $branch.Trim()
    Write-Output ('Branch: {0}' -f $branch)

    if ($branch -ne 'feature/phase-10-booking-session-lifecycle') {
        throw 'Wrong branch. Expected feature/phase-10-booking-session-lifecycle.'
    }
}

Invoke-VerificationStage -Name 'Runtime versions' -Command {
    node --version

    if ($LASTEXITCODE -ne 0) {
        throw 'node --version failed.'
    }

    npm --version

    if ($LASTEXITCODE -ne 0) {
        throw 'npm --version failed.'
    }
}

Invoke-VerificationStage -Name 'ESLint' -Command {
    npm run lint
}

Invoke-VerificationStage -Name 'Targeted booking/session unit tests' -Command {
    npm run test:unit -- tests/unit/bookingSessionLifecycle.test.js tests/unit/bookingSlotAndValidator.test.js
}

Invoke-VerificationStage -Name 'Firestore Rules emulator tests' -Command {
    npm run test:rules
}

Invoke-VerificationStage -Name 'Production build' -Command {
    npm run build
}

Invoke-VerificationStage -Name 'Final Git status and HEAD' -Command {
    git status --short --branch

    if ($LASTEXITCODE -ne 0) {
        throw 'git status failed.'
    }

    git rev-parse HEAD

    if ($LASTEXITCODE -ne 0) {
        throw 'git rev-parse HEAD failed.'
    }
}

Write-VerificationLog ''
Write-VerificationLog '===== SUMMARY ====='

if ($script:failedStages.Count -eq 0) {
    Write-VerificationLog 'OVERALL_RESULT = PASS'
}
else {
    Write-VerificationLog ('OVERALL_RESULT = FAIL ({0} failed stage(s))' -f $script:failedStages.Count)
    Write-VerificationLog ('FAILED_STAGES = {0}' -f ($script:failedStages -join ', '))
}

Write-VerificationLog ('LOG_PATH = {0}' -f $logPath)

if ($script:failedStages.Count -gt 0) {
    exit 1
}

exit 0
