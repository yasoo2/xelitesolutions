param(
    [switch]$Watch, [switch]$LibraryOnly,
    [string]$CoordinationRoot = 'D:\Joe\coordination',
    [int]$PollSeconds = 60,
    [int]$QuietLimitSeconds = 1800,
    [string]$MuseSessionsRoot = "$env:USERPROFILE\.local\share\muse\sessions"
)
$ErrorActionPreference = 'Stop'
if ($PollSeconds -lt 15 -or $QuietLimitSeconds -lt 60) { throw 'Invalid monitoring interval.' }
. (Join-Path $PSScriptRoot 'Worker-LifecyclePolicy.ps1')
function Invoke-TeamWorkerObservation {
    param([string]$CoordinationRoot, [string]$MuseSessionsRoot, [int]$QuietLimitSeconds = 1800,
        [Nullable[DateTime]]$NowUtc = $null, [scriptblock]$ProcessProbe = { Get-CimInstance Win32_Process -ErrorAction Stop },
        [scriptblock]$LogProbe, [scriptblock]$SessionProbe)
        $outputRoot = Join-Path $CoordinationRoot 'team\worker-lifecycle'
        [IO.Directory]::CreateDirectory($outputRoot) | Out-Null
        $now = if ($NowUtc) { ConvertTo-WorkerUtc $NowUtc } else { [DateTime]::UtcNow }
        $previous = $null
        $statePath = Join-Path $outputRoot 'current.json'
        $stateReadError = $false
        if (Test-Path -LiteralPath $statePath) {
            try { $previous = Get-Content -LiteralPath $statePath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop }
            catch {
                $stateReadError = $true
                Copy-Item -LiteralPath $statePath -Destination (Join-Path $outputRoot ('corrupt-state-' + [Guid]::NewGuid().ToString('N') + '.json')) -ErrorAction Stop
            }
        }
        $processes = @()
        $probeSucceeded = $true
        try { $processes = @(& $ProcessProbe) }
        catch { $probeSucceeded = $false }
        $records = @()
        foreach ($agent in @('MUSE', 'NVIDIA')) {
            $workerId = 0
            $identity = ''
            $old = @($previous.workers | Where-Object { $_.Agent -eq $agent }) | Select-Object -First 1
            try {
            $lockPath = Join-Path $CoordinationRoot ($agent.ToLowerInvariant() + '-worker.lock')
            $workerId = 0
            if (Test-Path -LiteralPath $lockPath) {
                [int]::TryParse((Get-Content -LiteralPath $lockPath -Raw).Trim(), [ref]$workerId) | Out-Null
            }
            $scriptPath = Join-Path $CoordinationRoot ($agent.ToLowerInvariant() + '-worker.ps1')
            # Inspect command line locally for identity only; never store or print it.
            $parent = @($processes | Where-Object { $_.ProcessId -eq $workerId -and
                $_.Name -match '^(powershell|pwsh)\.exe$' -and $_.CommandLine -like "*$scriptPath*" }) | Select-Object -First 1
            $child = @($processes | Where-Object { $parent -and $_.ParentProcessId -eq $workerId -and
                $(if ($agent -eq 'NVIDIA') { $_.Name -eq 'opencode.exe' } else { $_.Name -eq 'cmd.exe' }) } |
                Sort-Object CreationDate -Descending) | Select-Object -First 1
            $identity = if ($child) { '{0}:{1}' -f $child.ProcessId, $child.CreationDate.ToUniversalTime().ToString('o') } else { '' }
            $old = @($previous.workers | Where-Object { $_.Agent -eq $agent }) | Select-Object -First 1
            $sameCycle = $old -and $old.CycleIdentity -ceq $identity -and $identity
            $outputs = @()
            if ($child) {
                $prefix = $agent.ToLowerInvariant() + '-'
                if ($LogProbe) { $outputs = @(& $LogProbe $CoordinationRoot $agent $child) }
                else {
                # Missing evidence must fail only this worker, not the whole monitor.
                $outputs = @(Get-ChildItem -LiteralPath (Join-Path $CoordinationRoot 'logs') -File -ErrorAction Stop |
                    Where-Object { $_.Name.StartsWith($prefix) -and
                        ($agent -ne 'MUSE' -or $_.Name -match '\.(stdout|stderr)\.log$') -and
                        $_.CreationTimeUtc -ge $child.CreationDate.ToUniversalTime().AddMinutes(-1) } |
                    ForEach-Object { [pscustomobject]@{ Path=$_.FullName; Bytes=$_.Length; UpdatedUtc=$_.LastWriteTimeUtc.ToString('o') } })
                }
                if ($agent -eq 'MUSE' -and $SessionProbe) { $outputs += @(& $SessionProbe $MuseSessionsRoot $child) }
                elseif ($agent -eq 'MUSE' -and (Test-Path -LiteralPath $MuseSessionsRoot)) {
                    # Two date buckets, one directory level, at most128 sessions per bucket.
                    # Never recursively scan the full historical store.
                    $buckets = @($child.CreationDate.ToLocalTime().ToString('yyyy/MM/dd', [Globalization.CultureInfo]::InvariantCulture), $now.ToLocalTime().ToString('yyyy/MM/dd', [Globalization.CultureInfo]::InvariantCulture)) | Select-Object -Unique
                    $sessionCandidates = @()
                    foreach ($bucket in $buckets) {
                        $dayRoot = Join-Path $MuseSessionsRoot $bucket
                        if (!(Test-Path -LiteralPath $dayRoot)) { continue }
                        $directories = @(Get-ChildItem -LiteralPath $dayRoot -Directory -ErrorAction Stop | Select-Object -First 129)
                        if ($directories.Count -gt 128) { throw 'Session metadata budget exceeded.' }
                        foreach ($directory in $directories) {
                            $path = Join-Path $directory.FullName 'session.jsonl'
                            if (!(Test-Path -LiteralPath $path)) { continue }
                            $file = Get-Item -LiteralPath $path -ErrorAction Stop
                            $sessionCandidates += [pscustomobject]@{Path=$file.FullName;Bytes=$file.Length;CreatedUtc=$file.CreationTimeUtc.ToString('o');UpdatedUtc=$file.LastWriteTimeUtc.ToString('o')}
                        }
                    }
                    $session = Select-WorkerSessionEvidence -Sessions $sessionCandidates -CycleStartedUtc $child.CreationDate.ToUniversalTime()
                    if ($session) { $outputs += $session }
                }
            }
            # Live collection can take seconds while files continue growing.
            # Compute freshness after collection, not against a pre-probe clock.
            if (!$NowUtc) { $now = [DateTime]::UtcNow }
            $delta = Get-WorkerOutputDelta -Current $outputs -Previous $(if ($sameCycle) { @($old.Outputs) } else { @() })
            $lastOutput = if ($sameCycle) { ConvertTo-WorkerUtc $old.LastOutputUtc }
                elseif ($child) { $child.CreationDate.ToUniversalTime() } else { $now }
            if ($delta.Changed -and !$delta.Regressed) {
                if ($sameCycle) { $lastOutput = $now }
                else {
                    # Restarting the monitor must not make an old log look freshly active.
                    foreach ($output in $outputs) {
                        if ($output.Bytes -gt 0) {
                            $written = ConvertTo-WorkerUtc $output.UpdatedUtc
                            if ($written -gt $lastOutput -and $written -le $now) { $lastOutput = $written }
                        }
                    }
                }
            }
            # Count the entire live descendant tree, not merely one child shell.
            $descendantIds = @()
            if ($child) {
                $frontier = @($child.ProcessId)
                $visited = @($child.ProcessId)
                while ($frontier.Count) {
                    $next = @($processes | Where-Object { $_.ParentProcessId -in $frontier -and $_.ProcessId -notin $visited } | ForEach-Object { $_.ProcessId })
                    $descendantIds += $next
                    $visited += $next
                    $frontier = $next
                }
            }
            $runtime = if ($child) { [Math]::Max(0, ($now - $child.CreationDate.ToUniversalTime()).TotalSeconds) } else { 0 }
            $quiet = [Math]::Max(0, ($now - $lastOutput).TotalSeconds)
            $quietZeroPolls = 0
            if ($child -and $quiet -ge $QuietLimitSeconds -and !$descendantIds.Count -and !$delta.Changed -and !$delta.Regressed) {
                $quietZeroPolls = 1
                if ($sameCycle) { $quietZeroPolls += [int]$old.QuietZeroPolls }
            }
            $decision = Get-WorkerLifecycleState -ParentAlive ([bool]$parent) -CycleAlive ([bool]$child) -ProbeSucceeded $probeSucceeded `
                -OutputChanged ([bool]($sameCycle -and $delta.Changed)) -OutputRegressed $delta.Regressed -HasOutput ([bool]@($outputs | Where-Object { $_.Bytes -gt 0 }).Count) `
                -Descendants $descendantIds.Count -QuietSeconds ([Math]::Max(0, ($now - $lastOutput).TotalSeconds)) `
                -RuntimeSeconds $runtime -QuietLimitSeconds $QuietLimitSeconds -QuietZeroPolls $quietZeroPolls
            $record = [pscustomobject]@{ Agent=$agent; ParentId=$workerId; CycleIdentity=$identity;
                LastOutputUtc=$lastOutput.ToString('o'); Outputs=$outputs; Descendants=$descendantIds.Count;
                RuntimeSeconds=[int]$runtime; QuietSeconds=[int][Math]::Max(0, ($now - $lastOutput).TotalSeconds);
                State=$decision.State; NeedsAttention=$decision.NeedsAttention; QuietZeroPolls=$quietZeroPolls;
                EngineeringVerified=$false; AutomaticTerminationAllowed=$false }
            } catch {
                $record = [pscustomobject]@{Agent=$agent;ParentId=$workerId;CycleIdentity=$identity;State='OBSERVATION_FAILED';
                    NeedsAttention=$true;EngineeringVerified=$false;AutomaticTerminationAllowed=$false;QuietZeroPolls=0;
                    LastOutputUtc=$now.ToString('o');Outputs=@();ProbeError=$_.Exception.GetType().FullName}
            }
            $records += $record
            $sameAlertCycle = $old -and $old.CycleIdentity -ceq $record.CycleIdentity
            $lastAlert = if ($sameAlertCycle) { $old.LastAlertUtc } else { $null }
            $record | Add-Member -NotePropertyName LastAlertUtc -NotePropertyValue $lastAlert
            if (Test-WorkerAlertDue -NeedsAttention $record.NeedsAttention -SameCycle ([bool]$sameAlertCycle) -LastAlertUtc $lastAlert -NowUtc $now) {
                $record.LastAlertUtc = $now.ToString('o')
                $alertPath = Join-Path $outputRoot ('alert-' + $agent + '-' + $now.ToString('yyyyMMddTHHmmssfff') + '-' + [Guid]::NewGuid().ToString('N') + '.json')
                # Immutable alert; contains metadata only. Source files/logs remain untouched.
                $stream = [IO.File]::Open($alertPath, 'CreateNew', 'Write', 'None')
                try {
                    $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Depth 5))
                    $stream.Write($bytes, 0, $bytes.Length)
                } finally { $stream.Dispose() }
            }
        }
        $receipt = [pscustomobject]@{ ObservedUtc=$now.ToString('o'); MonitorId=$PID; ReadOnlyProcesses=$true; StateReadError=$stateReadError; Workers=$records }
        $temporary = Join-Path $outputRoot ('current-' + $PID + '.tmp')
        $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding utf8
        Move-Item -LiteralPath $temporary -Destination $statePath -Force
        return $receipt
}

function Invoke-TeamWorkerMonitor {
    param([string]$CoordinationRoot, [string]$MuseSessionsRoot, [int]$QuietLimitSeconds = 1800,
        [switch]$Watch, [int]$PollSeconds = 60, [scriptblock]$ProcessProbe = { Get-CimInstance Win32_Process -ErrorAction Stop },
        [scriptblock]$LogProbe, [scriptblock]$SessionProbe, [Nullable[DateTime]]$NowUtc = $null)
    $outputRoot = Join-Path $CoordinationRoot 'team\worker-lifecycle'
    [IO.Directory]::CreateDirectory($outputRoot) | Out-Null
    $lease = [IO.File]::Open((Join-Path $outputRoot 'monitor.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    try {
        do {
            $observed = $NowUtc
            try {
                $receipt = Invoke-TeamWorkerObservation -CoordinationRoot $CoordinationRoot -MuseSessionsRoot $MuseSessionsRoot -QuietLimitSeconds $QuietLimitSeconds `
                    -NowUtc $observed -ProcessProbe $ProcessProbe -LogProbe $LogProbe -SessionProbe $SessionProbe
                if (!$Watch) { return $receipt }
            } catch {
                if (!$Watch) { throw }
                # Persistence faults remain visible without killing the watch loop.
                Write-Warning ('MONITOR_PERSISTENCE_FAILED ' + $_.Exception.GetType().FullName)
            }
            Start-Sleep -Seconds $PollSeconds
        } while ($Watch)
    } finally { $lease.Dispose() }
}

if (!$LibraryOnly) {
    $result = Invoke-TeamWorkerMonitor -CoordinationRoot $CoordinationRoot -MuseSessionsRoot $MuseSessionsRoot -QuietLimitSeconds $QuietLimitSeconds -Watch:$Watch -PollSeconds $PollSeconds
    if (!$Watch) { $result | ConvertTo-Json -Depth 6 }
}
