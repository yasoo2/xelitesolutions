# Observation policy only. No process termination, Git mutation or provider calls.
function ConvertTo-WorkerUtc {
    param([object]$Value)
    # PowerShell 7 can deserialize ISO JSON timestamps as DateTime automatically.
    # Never stringify that value and parse it again using a different culture.
    if ($Value -is [DateTime]) { return $Value.ToUniversalTime() }
    if ($Value -is [DateTimeOffset]) { return $Value.UtcDateTime }
    return [DateTime]::Parse([string]$Value, [Globalization.CultureInfo]::InvariantCulture,
        [Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
}

function Select-WorkerSessionEvidence {
    param([object[]]$Sessions, [object]$CycleStartedUtc)
    $start = ConvertTo-WorkerUtc $CycleStartedUtc
    $eligible = @($Sessions | Where-Object { (ConvertTo-WorkerUtc $_.CreatedUtc) -ge $start -and
        (ConvertTo-WorkerUtc $_.UpdatedUtc) -ge $start })
    # Ambiguous sessions must not keep a different worker falsely alive.
    if ($eligible.Count -eq 1) { return $eligible[0] }
}
function Get-WorkerLifecycleState {
    param(
        [bool]$ParentAlive, [bool]$CycleAlive, [bool]$IdentityMatches = $true,
        [bool]$OutputChanged = $false, [bool]$OutputRegressed = $false,
        [bool]$ProbeSucceeded = $true, [bool]$HasOutput = $false,
        [int]$Descendants = 0, [double]$QuietSeconds = 0,
        [double]$RuntimeSeconds = 0, [double]$QuietLimitSeconds = 1800,
        # ExitCode states are reserved for a future launcher-integrated probe.
        # The external CIM observer cannot retrieve exited process codes.
        [Nullable[int]]$ExitCode = $null,
        [int]$QuietZeroPolls = 0, [int]$RequiredQuietZeroPolls = 3
    )
    if ($QuietLimitSeconds -le 0 -or $QuietSeconds -lt 0 -or $RuntimeSeconds -lt 0 -or $Descendants -lt 0) {
        throw 'Invalid lifecycle measurement.'
    }
    $state = 'UNKNOWN'
    if (!$ProbeSucceeded) { $state = 'OBSERVATION_FAILED' }
    elseif (!$ParentAlive) { $state = 'PARENT_MISSING' }
    elseif (!$IdentityMatches) { $state = 'IDENTITY_CHANGED' }
    elseif (!$CycleAlive) {
        if ($null -eq $ExitCode) { $state = 'BETWEEN_CYCLES_OR_EXIT_UNKNOWN' }
        elseif ($ExitCode -eq 0) { $state = 'PROCESS_COMPLETED_NOT_ENGINEERING_VERIFIED' }
        else { $state = 'PROCESS_FAILED' }
    }
    elseif ($OutputRegressed) { $state = 'OUTPUT_REPLACED_REQUIRES_RECONCILIATION' }
    elseif ($OutputChanged) { $state = 'OUTPUT_PROGRESS_NOT_ENGINEERING_VERIFIED' }
    elseif ($QuietSeconds -ge $QuietLimitSeconds) {
        if ($Descendants -gt 0) { $state = 'QUIET_WITH_ACTIVE_DESCENDANTS_DO_NOT_INTERRUPT' }
        elseif ($QuietZeroPolls -ge $RequiredQuietZeroPolls) { $state = 'STALL_SUSPECTED_REQUIRES_SAFE_RECOVERY' }
        else { $state = 'QUIET_AWAITING_CONFIRMATION' }
    }
    elseif ($Descendants -gt 0) { $state = 'ACTIVE_DESCENDANTS_NOT_ENGINEERING_VERIFIED' }
    elseif (!$HasOutput) { $state = 'STARTING_OR_WAITING_NO_OUTPUT' }
    else { $state = 'WAITING_AFTER_OUTPUT' }
    [pscustomobject]@{
        State = $state
        EngineeringVerified = $false
        AutomaticTerminationAllowed = $false
        NeedsAttention = $state -in @('OBSERVATION_FAILED', 'PARENT_MISSING', 'IDENTITY_CHANGED',
            'PROCESS_FAILED', 'OUTPUT_REPLACED_REQUIRES_RECONCILIATION',
            'QUIET_WITH_ACTIVE_DESCENDANTS_DO_NOT_INTERRUPT', 'STALL_SUSPECTED_REQUIRES_SAFE_RECOVERY')
    }
}

function Test-WorkerAlertDue {
    param([bool]$NeedsAttention, [bool]$SameCycle, [object]$LastAlertUtc,
        [DateTime]$NowUtc, [int]$CooldownSeconds = 600)
    if (!$NeedsAttention) { return $false }
    if (!$SameCycle -or !$LastAlertUtc) { return $true }
    try { return ((ConvertTo-WorkerUtc $NowUtc) - (ConvertTo-WorkerUtc $LastAlertUtc)).TotalSeconds -ge $CooldownSeconds }
    catch { return $true } # Invalid prior metadata cannot terminate the observer.
}

function Get-WorkerOutputDelta {
    param([object[]]$Current, [object[]]$Previous)
    $changed = $false
    $regressed = $false
    foreach ($file in $Current) {
        $old = @($Previous | Where-Object { $_.Path -ceq $file.Path })
        if ($old.Count -eq 0) {
            # An empty file being touched is not output or an acknowledgement.
            if ($file.Bytes -gt 0) { $changed = $true }
        } elseif ($file.Bytes -lt $old[0].Bytes) { $regressed = $true }
        elseif ($file.Bytes -gt $old[0].Bytes -or
            ($file.Bytes -gt 0 -and (ConvertTo-WorkerUtc $file.UpdatedUtc) -ne (ConvertTo-WorkerUtc $old[0].UpdatedUtc))) { $changed = $true }
    }
    foreach ($old in $Previous) {
        if (!@($Current | Where-Object { $_.Path -ceq $old.Path }).Count) { $regressed = $true }
    }
    [pscustomobject]@{ Changed=$changed; Regressed=$regressed }
}
