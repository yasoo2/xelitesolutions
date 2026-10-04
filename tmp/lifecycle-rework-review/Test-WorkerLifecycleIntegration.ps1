$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Watch-TeamWorkerLifecycle.ps1') -LibraryOnly
$checks = 0
function Assert($condition, $label) {
    if (!$condition) { throw "FAIL $label" }
    $script:checks++
}
# Opaque unique fixtures are retained, never delete existing work/evidence.
$root = Join-Path ([IO.Path]::GetTempPath()) ('joe-lifecycle-integration-' + [Guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($root) | Out-Null
$now = [DateTime]::SpecifyKind([DateTime]'2026-10-04T12:00:00', [DateTimeKind]::Utc)
$empty = Invoke-TeamWorkerMonitor -CoordinationRoot $root -ProcessProbe { @() } -NowUtc $now
Assert ($empty.Workers.Count -eq 2) 'Empty root observes both workers'
Assert (@($empty.Workers | Where-Object State -eq PARENT_MISSING).Count -eq 2) 'Empty root does not invent live workers'
Assert (Test-Path (Join-Path $root 'team\worker-lifecycle\current.json')) 'Real atomic receipt written'
Assert (@(Get-ChildItem (Join-Path $root 'team\worker-lifecycle') -Filter 'alert-*.json').Count -eq 2) 'Real alerts emitted'
$lease = [IO.File]::Open((Join-Path $root 'team\worker-lifecycle\monitor.lock'),'Open','ReadWrite','None')
$before = (Get-FileHash (Join-Path $root 'team\worker-lifecycle\current.json')).Hash
$denied = $false
try { Invoke-TeamWorkerMonitor -CoordinationRoot $root -ProcessProbe { @() } -NowUtc $now | Out-Null }
catch { $denied = $true }
finally { $lease.Dispose() }
Assert $denied 'Contending monitor rejected'
Assert ((Get-FileHash (Join-Path $root 'team\worker-lifecycle\current.json')).Hash -eq $before) 'Rejected monitor cannot replace receipt'

Set-Content (Join-Path $root 'muse-worker.lock') 100
Set-Content (Join-Path $root 'nvidia-worker.lock') 200
$started = $now.AddHours(-2)
$script:fixtureProcesses = @(
    [pscustomobject]@{ProcessId=100;ParentProcessId=1;Name='powershell.exe';CommandLine=(Join-Path $root 'muse-worker.ps1');CreationDate=$started},
    [pscustomobject]@{ProcessId=200;ParentProcessId=1;Name='powershell.exe';CommandLine=(Join-Path $root 'nvidia-worker.ps1');CreationDate=$started},
    [pscustomobject]@{ProcessId=101;ParentProcessId=100;Name='cmd.exe';CommandLine='not persisted';CreationDate=$started},
    [pscustomobject]@{ProcessId=201;ParentProcessId=200;Name='opencode.exe';CommandLine='not persisted';CreationDate=$started})
$processProbe = { $script:fixtureProcesses }
$logProbe = { param($coord,$agent,$cycle) [pscustomobject]@{Path=(Join-Path $coord ($agent + '.log'));Bytes=100;UpdatedUtc='2026-10-04T10:00:00Z'} }
$common = @{CoordinationRoot=$root;ProcessProbe=$processProbe;LogProbe=$logProbe;SessionProbe={ @() };NowUtc=$now}
$first = Invoke-TeamWorkerMonitor @common
Assert ($first.Workers[1].QuietSeconds -eq 7200) 'First observation retains actual old output freshness'
Assert ($first.Workers[1].State -eq 'QUIET_AWAITING_CONFIRMATION') 'First sight is not instant stall'
$second = Invoke-TeamWorkerMonitor @common
Assert ($second.Workers[1].LastOutputUtc -eq $first.Workers[1].LastOutputUtc) 'Restart cannot refresh unchanged output'
$third = Invoke-TeamWorkerMonitor @common
$fourth = Invoke-TeamWorkerMonitor @common
Assert ($fourth.Workers[1].State -eq 'STALL_SUSPECTED_REQUIRES_SAFE_RECOVERY') 'Sustained zero-descendant quiet reaches stall'
$alertsBefore = @(Get-ChildItem (Join-Path $root 'team\worker-lifecycle') -Filter 'alert-*.json').Count
$script:fixtureProcesses += [pscustomobject]@{ProcessId=202;ParentProcessId=201;Name='git.exe';CreationDate=$now;CommandLine='not persisted'}
$flap = Invoke-TeamWorkerMonitor @common
Assert ($flap.Workers[1].State -eq 'QUIET_WITH_ACTIVE_DESCENDANTS_DO_NOT_INTERRUPT') 'Transient child protects atomic work'
Assert ($flap.Workers[1].QuietZeroPolls -eq 0) 'Transient child resets stall confirmation'
$script:fixtureProcesses = @($script:fixtureProcesses | Where-Object ProcessId -ne 202)
Invoke-TeamWorkerMonitor @common | Out-Null
Invoke-TeamWorkerMonitor @common | Out-Null
Invoke-TeamWorkerMonitor @common | Out-Null
Assert (@(Get-ChildItem (Join-Path $root 'team\worker-lifecycle') -Filter 'alert-*.json').Count -eq $alertsBefore) 'Flapping cannot spam alerts in same cooldown window'

$fault = $common.Clone()
$fault.LogProbe = { param($coord,$agent,$cycle) if ($agent -eq 'MUSE') { throw 'Injected log IO failure' }; [pscustomobject]@{Path=(Join-Path $coord ($agent + '.log'));Bytes=100;UpdatedUtc='2026-10-04T10:00:00Z'} }
$failed = Invoke-TeamWorkerMonitor @fault
Assert ($failed.Workers[0].State -eq 'OBSERVATION_FAILED') 'Per-worker log failure observable'
Assert ($failed.Workers[1].State -ne 'OBSERVATION_FAILED') 'Other worker survives failed log probe'
$sessionFault = $common.Clone()
$sessionFault.SessionProbe = { throw 'Injected session IO failure' }
$failed = Invoke-TeamWorkerMonitor @sessionFault
Assert ($failed.Workers[0].State -eq 'OBSERVATION_FAILED') 'Failed session scan isolated'
Assert ($failed.Workers[1].State -ne 'OBSERVATION_FAILED') 'NVIDIA survives Muse session failure'
$missingLogs = $common.Clone()
$missingLogs.Remove('LogProbe')
$failed = Invoke-TeamWorkerMonitor @missingLogs
Assert (@($failed.Workers | Where-Object State -eq OBSERVATION_FAILED).Count -eq 2) 'Actual missing logs directory cannot crash whole observation'

$statePath = Join-Path $root 'team\worker-lifecycle\current.json'
Set-Content $statePath '{broken JSON'
$recovered = Invoke-TeamWorkerMonitor @common
Assert $recovered.StateReadError 'Corrupt JSON state reported'
Assert (@(Get-ChildItem (Join-Path $root 'team\worker-lifecycle') -Filter 'corrupt-state-*.json').Count -eq 1) 'Corrupt evidence preserved'
$corrupt = Get-Content $statePath -Raw | ConvertFrom-Json
$corrupt.Workers[0].LastOutputUtc = 'invalid-timestamp'
$corrupt.Workers[0].LastAlertUtc = 'invalid-timestamp'
$corrupt | ConvertTo-Json -Depth 6 | Set-Content $statePath
$failed = Invoke-TeamWorkerMonitor @common
Assert ($failed.Workers[0].State -eq 'OBSERVATION_FAILED') 'Invalid timestamp isolated'
Assert ($failed.Workers[1].State -ne 'OBSERVATION_FAILED') 'Healthy worker survives invalid timestamp'
$probeFailure = Invoke-TeamWorkerMonitor -CoordinationRoot $root -ProcessProbe { throw 'Access denied fixture' } -NowUtc $now
Assert (@($probeFailure.Workers | Where-Object State -eq OBSERVATION_FAILED).Count -eq 2) 'CIM failure fails closed'
Assert (@($probeFailure.Workers | Where-Object { $_.EngineeringVerified -or $_.AutomaticTerminationAllowed }).Count -eq 0) 'No fake success or termination'
$sessionsRoot = Join-Path $root 'sessions'
$bucket = $started.ToLocalTime().ToString('yyyy/MM/dd', [Globalization.CultureInfo]::InvariantCulture)
$day = Join-Path $sessionsRoot $bucket
$firstDir = Join-Path $day 'one'
[IO.Directory]::CreateDirectory($firstDir) | Out-Null
Set-Content (Join-Path $firstDir 'session.jsonl') 'Opaque fixture; never parsed by monitor'
$realSession = $common.Clone()
$realSession.Remove('SessionProbe')
$realSession.MuseSessionsRoot = $sessionsRoot
$wired = Invoke-TeamWorkerMonitor @realSession
Assert (@($wired.Workers[0].Outputs | Where-Object Path -like '*session.jsonl').Count -eq 1) 'Real bounded session scan wired to worker output'
[IO.Directory]::CreateDirectory((Join-Path $day 'two')) | Out-Null
Set-Content (Join-Path $day 'two\session.jsonl') 'Second opaque session'
$ambiguous = Invoke-TeamWorkerMonitor @realSession
Assert (@($ambiguous.Workers[0].Outputs | Where-Object Path -like '*session.jsonl').Count -eq 0) 'Ambiguous session wiring rejects false freshness'
foreach ($index in 1..127) { [IO.Directory]::CreateDirectory((Join-Path $day ('budget-' + $index))) | Out-Null }
$bounded = Invoke-TeamWorkerMonitor @realSession
Assert ($bounded.Workers[0].State -eq 'OBSERVATION_FAILED') 'Session directory budget fails visibly'
Assert ($bounded.Workers[1].State -ne 'OBSERVATION_FAILED') 'Session budget cannot stop healthy NVIDIA observation'
$oldIdentity = $bounded.Workers[1].CycleIdentity
($script:fixtureProcesses | Where-Object ProcessId -eq 201).CreationDate = $now.AddMinutes(-5)
$reused = Invoke-TeamWorkerMonitor @common
Assert ($reused.Workers[1].CycleIdentity -cne $oldIdentity) 'Same PID with different birth is a new cycle'
Assert ($reused.Workers[1].QuietZeroPolls -eq 0) 'PID reuse cannot inherit stall confirmation'
"PASS $checks/$checks watcher integration checks; fixture=$root; no live worker or provider invoked."
