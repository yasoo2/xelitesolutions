$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Worker-LifecyclePolicy.ps1')
$checks = 0
function Assert-Equal($actual, $expected, $label) {
    if ($actual -cne $expected) { throw "$label : expected $expected, received $actual" }
    $script:checks++
}
function Check-State($arguments, $expected) {
    $result = Get-WorkerLifecycleState @arguments
    Assert-Equal $result.State $expected 'State'
    Assert-Equal $result.EngineeringVerified $false 'No fabricated engineering result'
    Assert-Equal $result.AutomaticTerminationAllowed $false 'No automatic unsafe stop'
}
Check-State @{ParentAlive=$true;CycleAlive=$false;ExitCode=0} 'PROCESS_COMPLETED_NOT_ENGINEERING_VERIFIED'
Check-State @{ParentAlive=$true;CycleAlive=$false;ExitCode=1} 'PROCESS_FAILED'
Check-State @{ParentAlive=$true;CycleAlive=$false} 'BETWEEN_CYCLES_OR_EXIT_UNKNOWN'
Check-State @{ParentAlive=$false;CycleAlive=$false} 'PARENT_MISSING'
Check-State @{ParentAlive=$true;CycleAlive=$true;ProbeSucceeded=$false} 'OBSERVATION_FAILED'
Check-State @{ParentAlive=$true;CycleAlive=$true;IdentityMatches=$false} 'IDENTITY_CHANGED'
Check-State @{ParentAlive=$true;CycleAlive=$true;QuietSeconds=1800} 'STALL_SUSPECTED_REQUIRES_SAFE_RECOVERY'
Check-State @{ParentAlive=$true;CycleAlive=$true;QuietSeconds=1800;Descendants=2} 'QUIET_WITH_ACTIVE_DESCENDANTS_DO_NOT_INTERRUPT'
Check-State @{ParentAlive=$true;CycleAlive=$true;QuietSeconds=1799} 'STARTING_OR_WAITING_NO_OUTPUT'
Check-State @{ParentAlive=$true;CycleAlive=$true;HasOutput=$true} 'WAITING_AFTER_OUTPUT'
Check-State @{ParentAlive=$true;CycleAlive=$true;OutputChanged=$true;QuietSeconds=4000} 'OUTPUT_PROGRESS_NOT_ENGINEERING_VERIFIED'
Check-State @{ParentAlive=$true;CycleAlive=$true;OutputChanged=$true;OutputRegressed=$true} 'OUTPUT_REPLACED_REQUIRES_RECONCILIATION'
Check-State @{ParentAlive=$true;CycleAlive=$true;Descendants=1} 'ACTIVE_DESCENDANTS_NOT_ENGINEERING_VERIFIED'
$old = @([pscustomobject]@{Path='cycle.log';Bytes=10;UpdatedUtc='2026-10-04T09:00:00Z'})
Assert-Equal (Get-WorkerOutputDelta $old $old).Changed $false 'Unchanged output'
Assert-Equal (Get-WorkerOutputDelta @([pscustomobject]@{Path='cycle.log';Bytes=11;UpdatedUtc='2026-10-04T09:01:00Z'}) $old).Changed $true 'Output growth'
Assert-Equal (Get-WorkerOutputDelta @([pscustomobject]@{Path='cycle.log';Bytes=0;UpdatedUtc='2026-10-04T09:01:00Z'}) $old).Regressed $true 'Truncation'
Assert-Equal (Get-WorkerOutputDelta @() $old).Regressed $true 'Missing log'
Assert-Equal (Get-WorkerOutputDelta @([pscustomobject]@{Path='empty.log';Bytes=0;UpdatedUtc='new'}) @()).Changed $false 'Empty-file touch'
Assert-Equal (Get-WorkerOutputDelta @([pscustomobject]@{Path='cycle.log';Bytes=10;UpdatedUtc='2026-10-04T09:01:00Z'}) $old).Changed $true 'Same-size rewrite'
$parsed = '{"UpdatedUtc":"2026-10-04T09:00:00Z"}' | ConvertFrom-Json
Assert-Equal (ConvertTo-WorkerUtc $parsed.UpdatedUtc).ToString('yyyy-MM-dd') '2026-10-04' 'JSON date retains October 4'
Assert-Equal (Get-WorkerOutputDelta @([pscustomobject]@{Path='cycle.log';Bytes=10;UpdatedUtc=$parsed.UpdatedUtc}) $old).Changed $false 'Typed JSON timestamp is unchanged'
$cultureBefore = [Threading.Thread]::CurrentThread.CurrentCulture
try {
    [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('tr-TR')
    Assert-Equal (ConvertTo-WorkerUtc $parsed.UpdatedUtc).ToString('yyyy-MM-dd') '2026-10-04' 'Turkish culture retains ISO date'
    Assert-Equal (ConvertTo-WorkerUtc '2026-10-04T09:00:00Z').ToString('yyyy-MM-dd') '2026-10-04' 'Invariant ISO string'
} finally { [Threading.Thread]::CurrentThread.CurrentCulture = $cultureBefore }
$session = [pscustomobject]@{Path='this-cycle/session.jsonl';CreatedUtc='2026-10-04T09:25:00Z';UpdatedUtc='2026-10-04T09:57:00Z'}
$historical = [pscustomobject]@{Path='older/session.jsonl';CreatedUtc='2026-10-03T09:00:00Z';UpdatedUtc='2026-10-04T09:58:00Z'}
Assert-Equal (Select-WorkerSessionEvidence @($session,$historical) '2026-10-04T09:23:00Z').Path $session.Path 'Unambiguous current-cycle session'
Assert-Equal (@(Select-WorkerSessionEvidence @($historical) '2026-10-04T09:23:00Z').Count) 0 'Old-session housekeeping is not progress'
Assert-Equal (@(Select-WorkerSessionEvidence @($session,$session) '2026-10-04T09:23:00Z').Count) 0 'Ambiguous sessions rejected'
Assert-Equal (@(Select-WorkerSessionEvidence @() '2026-10-04T09:23:00Z').Count) 0 'Missing session does not fabricate activity'
$rejected = $false
try { Get-WorkerLifecycleState -QuietLimitSeconds 0 | Out-Null } catch { $rejected = $true }
Assert-Equal $rejected $true 'Invalid budget rejected'
"PASS $checks/$checks lifecycle assertions. No real worker or provider invoked."
