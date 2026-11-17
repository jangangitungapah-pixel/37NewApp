<#
.SYNOPSIS
    Local verification harness for Phase 11 booking/session integration and Firestore Rules.

.DESCRIPTION
    Executes PowerShell syntax parsing, branch verification, runtime checks, ESLint,
    targeted booking/session and UI Vitest unit tests, Firestore Rules emulator tests, Vite production build,
    and final local Git state inspection. Captures child-process exit codes directly
    via System.Diagnostics.Process so non-zero failures always fail the run reliably
    under Windows PowerShell 5.1 and PowerShell 7 without treating normal native stderr
    warnings as false errors. LOCAL ONLY: never pushes, merges, or deploys.
#>
[CmdletBinding()]
param(
    [string]$ExpectedBranch = 'feature/phase-10-booking-session-lifecycle',
    [string[]]$UnitTestFiles = @(
        'tests/unit/bookingSessionLifecycle.test.js',
        'tests/unit/bookingSlotAndValidator.test.js',
        'tests/unit/bookingSessionUseCases.test.js',
        'tests/unit/BookingDetailModal.test.jsx'
    ),
    [string[]]$ExtraRulesArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$RepoRoot = (Resolve-Path -Path $PSScriptRoot).Path
$Timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$LogDirectory = Join-Path -Path $RepoRoot -ChildPath 'logs'
if (-not (Test-Path -LiteralPath $LogDirectory)) {
    New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
}
$LogPath = Join-Path -Path $LogDirectory -ChildPath ("phase11-verification-{0}.txt" -f $Timestamp)
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$LogWriter = New-Object System.IO.StreamWriter($LogPath, $false, $Utf8NoBom)
$LogWriter.AutoFlush = $true

$StageResults = New-Object System.Collections.Generic.List[object]

function Write-Log {
    param(
        [AllowEmptyString()]
        [string]$Message = ''
    )
    $LogWriter.WriteLine($Message)
    [Console]::Out.WriteLine($Message)
}

function Format-CommandArgument {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Value
    )
    if ($Value -eq '') {
        return '""'
    }
    if ($Value -match '[\s"&|<>^()]') {
        $escaped = $Value.Replace('"', '\"')
        return '"' + $escaped + '"'
    }
    return $Value
}

function Resolve-NativeApplication {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommandName
    )
    $app = Get-Command -Name $CommandName -CommandType Application -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($null -eq $app) {
        throw "Required native application '$CommandName' was not found on PATH."
    }
    return $app.Source
}

function Invoke-NativeProcess {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [string[]]$Arguments = @(),
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory
    )

    $resolvedExe = Resolve-NativeApplication -CommandName $Executable
    $ext = [System.IO.Path]::GetExtension($resolvedExe).ToLowerInvariant()
    $quotedArgs = @($Arguments | ForEach-Object { Format-CommandArgument -Value $_ }) -join ' '

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.WorkingDirectory = $WorkingDirectory
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
    $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
    $psi.EnvironmentVariables['NO_COLOR'] = '1'
    $psi.EnvironmentVariables['FORCE_COLOR'] = '0'

    if ($ext -eq '.cmd' -or $ext -eq '.bat') {
        $psi.FileName = $env:ComSpec
        if ([string]::IsNullOrWhiteSpace($quotedArgs)) {
            $psi.Arguments = '/d /s /c ""' + $resolvedExe + '""'
        }
        else {
            $psi.Arguments = '/d /s /c ""' + $resolvedExe + '" ' + $quotedArgs + '"'
        }
    }
    else {
        $psi.FileName = $resolvedExe
        $psi.Arguments = $quotedArgs
    }

    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $psi

    try {
        if (-not $process.Start()) {
            throw "Failed to start process '$resolvedExe'."
        }

        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()

        $process.WaitForExit()
        [System.Threading.Tasks.Task]::WaitAll(@(
                [System.Threading.Tasks.Task]$stdoutTask,
                [System.Threading.Tasks.Task]$stderrTask
            ))

        return [PSCustomObject]@{
            ExecutablePath = $resolvedExe
            ExitCode       = [int]$process.ExitCode
            StdOut         = $stdoutTask.Result
            StdErr         = $stderrTask.Result
        }
    }
    finally {
        $process.Dispose()
    }
}

function Invoke-VerificationStage {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name,
        [Parameter(Mandatory = $true)]
        [scriptblock]$Action
    )

    $startedAt = Get-Date
    Write-Log ('=' * 72)
    Write-Log ("STAGE: {0}" -f $Name)
    Write-Log ("STARTED_AT: {0}" -f $startedAt.ToString('yyyy-MM-dd HH:mm:ss zzz'))

    $exitCode = 1
    $passed = $false

    try {
        $resultCode = & $Action
        if ($null -eq $resultCode) {
            $exitCode = 1
        }
        elseif ($resultCode -is [int]) {
            $exitCode = $resultCode
        }
        else {
            $exitCode = [int](@($resultCode)[-1])
        }
        $passed = ($exitCode -eq 0)
    }
    catch {
        $exitCode = 1
        $passed = $false
        Write-Log ("EXCEPTION: {0}" -f $_.Exception.ToString())
    }

    $finishedAt = Get-Date
    $durationSec = [Math]::Round(($finishedAt - $startedAt).TotalSeconds, 2)
    $statusText = if ($passed) { 'PASS' } else { 'FAIL' }

    Write-Log ("STAGE_RESULT: {0}" -f $statusText)
    Write-Log ("EXIT_CODE: {0}" -f $exitCode)
    Write-Log ("DURATION_SECONDS: {0}" -f $durationSec)

    $StageResults.Add([PSCustomObject]@{
            Name            = $Name
            Status          = $statusText
            ExitCode        = $exitCode
            DurationSeconds = $durationSec
            Passed          = $passed
        })
}

function Invoke-LoggedNativeStep {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Executable,
        [string[]]$Arguments = @()
    )

    $displayCmd = if ($Arguments.Count -gt 0) {
        "{0} {1}" -f $Executable, ($Arguments -join ' ')
    }
    else {
        $Executable
    }
    Write-Log ("COMMAND: {0}" -f $displayCmd)

    $res = Invoke-NativeProcess -Executable $Executable -Arguments $Arguments -WorkingDirectory $RepoRoot
    Write-Log ("RESOLVED_EXECUTABLE: {0}" -f $res.ExecutablePath)

    if (-not [string]::IsNullOrWhiteSpace($res.StdOut)) {
        Write-Log '--- STDOUT ---'
        Write-Log $res.StdOut.TrimEnd("`r", "`n")
    }
    if (-not [string]::IsNullOrWhiteSpace($res.StdErr)) {
        Write-Log '--- STDERR ---'
        Write-Log $res.StdErr.TrimEnd("`r", "`n")
    }
    Write-Log ("PROCESS_EXIT_CODE: {0}" -f $res.ExitCode)
    return $res
}

$OverallPassed = $false

try {
    Write-Log 'PHASE 11 BOOKING/SESSION INTEGRATION & FIRESTORE RULES VERIFICATION'
    Write-Log ("REPO_ROOT: {0}" -f $RepoRoot)
    Write-Log ("LOG_FILE: {0}" -f $LogPath)
    Write-Log ("POWERSHELL_VERSION: {0}" -f $PSVersionTable.PSVersion.ToString())

    Invoke-VerificationStage -Name 'PowerShell parser check' -Action {
        $tokens = $null
        $parseErrors = $null
        [void][System.Management.Automation.Language.Parser]::ParseFile(
            $PSCommandPath,
            [ref]$tokens,
            [ref]$parseErrors
        )
        if ($null -ne $parseErrors -and $parseErrors.Count -gt 0) {
            foreach ($err in $parseErrors) {
                Write-Log ("PARSE_ERROR L{0}:{1}: {2}" -f $err.Extent.StartLineNumber, $err.Extent.StartColumnNumber, $err.Message)
            }
            return 1
        }
        Write-Log ("PARSED_OK: {0} (tokens={1}, errors=0)" -f $PSCommandPath, $tokens.Count)
        return 0
    }

    Invoke-VerificationStage -Name 'Branch guard' -Action {
        $res = Invoke-LoggedNativeStep -Executable 'git' -Arguments @('rev-parse', '--abbrev-ref', 'HEAD')
        if ($res.ExitCode -ne 0) {
            return $res.ExitCode
        }
        $currentBranch = $res.StdOut.Trim()
        Write-Log ("EXPECTED_BRANCH: {0}" -f $ExpectedBranch)
        Write-Log ("CURRENT_BRANCH:  {0}" -f $currentBranch)
        if ($currentBranch -ne $ExpectedBranch) {
            Write-Log 'BRANCH_MISMATCH: Current branch does not match expected Phase 11 implementation branch.'
            return 1
        }
        return 0
    }

    Invoke-VerificationStage -Name 'Runtime versions' -Action {
        $nodeRes = Invoke-LoggedNativeStep -Executable 'node' -Arguments @('--version')
        if ($nodeRes.ExitCode -ne 0) {
            return $nodeRes.ExitCode
        }
        $npmRes = Invoke-LoggedNativeStep -Executable 'npm' -Arguments @('--version')
        return $npmRes.ExitCode
    }

    Invoke-VerificationStage -Name 'ESLint' -Action {
        $res = Invoke-LoggedNativeStep -Executable 'npm' -Arguments @('run', 'lint')
        return $res.ExitCode
    }

    Invoke-VerificationStage -Name 'Targeted booking/session unit tests' -Action {
        $unitArgs = @('run', 'test:unit', '--') + $UnitTestFiles
        $res = Invoke-LoggedNativeStep -Executable 'npm' -Arguments $unitArgs
        return $res.ExitCode
    }

    Invoke-VerificationStage -Name 'Firestore Rules emulator tests' -Action {
        $rulesArgs = @('run', 'test:rules')
        if ($ExtraRulesArgs.Count -gt 0) {
            $rulesArgs = $rulesArgs + @('--') + $ExtraRulesArgs
        }
        $res = Invoke-LoggedNativeStep -Executable 'npm' -Arguments $rulesArgs
        return $res.ExitCode
    }

    Invoke-VerificationStage -Name 'Production build' -Action {
        $res = Invoke-LoggedNativeStep -Executable 'npm' -Arguments @('run', 'build')
        return $res.ExitCode
    }

    Invoke-VerificationStage -Name 'Final Git status and HEAD' -Action {
        $statusRes = Invoke-LoggedNativeStep -Executable 'git' -Arguments @('status', '--short', '--branch')
        if ($statusRes.ExitCode -ne 0) {
            return $statusRes.ExitCode
        }
        $headRes = Invoke-LoggedNativeStep -Executable 'git' -Arguments @('rev-parse', 'HEAD')
        return $headRes.ExitCode
    }

    $failedStages = @($StageResults | Where-Object { -not $_.Passed })
    $OverallPassed = ($failedStages.Count -eq 0 -and $StageResults.Count -gt 0)

    Write-Log ('=' * 72)
    Write-Log 'VERIFICATION SUMMARY'
    foreach ($stage in $StageResults) {
        Write-Log ("  - {0}: STATUS={1}, EXIT_CODE={2}, DURATION={3}s" -f $stage.Name, $stage.Status, $stage.ExitCode, $stage.DurationSeconds)
    }
    Write-Log ("LOG_FILE: {0}" -f $LogPath)
    if ($OverallPassed) {
        Write-Log 'OVERALL_RESULT = PASS'
    }
    else {
        Write-Log 'OVERALL_RESULT = FAIL'
    }
}
finally {
    $LogWriter.Flush()
    $LogWriter.Dispose()
}

if ($OverallPassed) {
    exit 0
}
exit 1
