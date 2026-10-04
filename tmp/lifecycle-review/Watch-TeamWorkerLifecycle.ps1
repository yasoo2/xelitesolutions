param(
    [switch]$Watch,
    [string]$CoordinationRoot = 'D:\Joe\coordination',
    [int]$PollSeconds = 60,
    [int]$QuietLimitSeconds = 1800,
    [string]$MuseSessionsRoot = "$env:USERPROFILE\.local\share\muse\sessions"
)
$ErrorActionPreference = 'Stop'
if ($PollSeconds -lt 15 -or $QuietLimitSeconds -lt 60) { throw 'Invalid monitoring interval.' }
. (Join-Path $PSScriptRoot 'Worker-LifecyclePolicy.ps1')
$outputRoot = Join-Path $CoordinationRoot 'team\worker-lifecycle'
[IO.Directory]::CreateDirectory($outputRoot) | Out-Null
# Shared lease also excludes concurrent one-shot writers.
$lease = [IO.File]::Open((Join-Path $outputRoot 'monitor.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
try {
    do {
        $now = [DateTime]::UtcNow
        $previous = $null
        $statePath = Join-Path $outputRoot 'current.json'
        if (Test-Path -LiteralPath $statePath) { $previous = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json }
        $processes = @()
        $probeSucceeded = $true
        try { $processes = @(Get-CimInstance Win32_Process -ErrorAction Stop) }
        catch { $probeSucceeded = $false }
        $records = @()
        foreach ($agent in @('MUSE', 'NVIDIA')) {
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
                $outputs = @(Get-ChildItem -LiteralPath (Join-Path $CoordinationRoot 'logs') -File -ErrorAction Stop |
                    Where-Object { $_.Name.StartsWith($prefix) -and
                        ($agent -ne 'MUSE' -or $_.Name -match '\.(stdout|stderr)\.log$') -and
                        $_.CreationTimeUtc -ge $child.CreationDate.ToUniversalTime().AddMinutes(-1) } |
                    ForEach-Object { [pscustomobject]@{ Path=$_.FullName; Bytes=$_.Length; UpdatedUtc=$_.LastWriteTimeUtc.ToString('o') } })
                if ($agent -eq 'MUSE' -and (Test-Path -LiteralPath $MuseSessionsRoot)) {
                    $sessionCandidates = @(Get-ChildItem -LiteralPath $MuseSessionsRoot -Recurse -File -Filter session.jsonl -ErrorAction Stop |
                        Where-Object { $_.CreationTimeUtc -ge $child.CreationDate.ToUniversalTime() } |
                        ForEach-Object { [pscustomobject]@{ Path=$_.FullName; Bytes=$_.Length;
                            CreatedUtc=$_.CreationTimeUtc.ToString('o'); UpdatedUtc=$_.LastWriteTimeUtc.ToString('o') } })
                    $session = Select-WorkerSessionEvidence -Sessions $sessionCandidates -CycleStartedUtc $child.CreationDate.ToUniversalTime()
                    if ($session) { $outputs += $session }
                }
            }
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
                while ($frontier.Count) {
                    $next = @($processes | Where-Object { $_.ParentProcessId -in $frontier -and $_.ProcessId -notin $descendantIds } | ForEach-Object { $_.ProcessId })
                    $descendantIds += $next
                    $frontier = $next
                }
            }
            $runtime = if ($child) { [Math]::Max(0, ($now - $child.CreationDate.ToUniversalTime()).TotalSeconds) } else { 0 }
            $decision = Get-WorkerLifecycleState -ParentAlive ([bool]$parent) -CycleAlive ([bool]$child) -ProbeSucceeded $probeSucceeded `
                -OutputChanged ([bool]($sameCycle -and $delta.Changed)) -OutputRegressed $delta.Regressed -HasOutput ([bool]@($outputs | Where-Object { $_.Bytes -gt 0 }).Count) `
                -Descendants $descendantIds.Count -QuietSeconds ([Math]::Max(0, ($now - $lastOutput).TotalSeconds)) `
                -RuntimeSeconds $runtime -QuietLimitSeconds $QuietLimitSeconds
            $record = [pscustomobject]@{ Agent=$agent; ParentId=$workerId; CycleIdentity=$identity;
                LastOutputUtc=$lastOutput.ToString('o'); Outputs=$outputs; Descendants=$descendantIds.Count;
                RuntimeSeconds=[int]$runtime; QuietSeconds=[int][Math]::Max(0, ($now - $lastOutput).TotalSeconds);
                State=$decision.State; NeedsAttention=$decision.NeedsAttention;
                EngineeringVerified=$false; AutomaticTerminationAllowed=$false }
            $records += $record
            if ($record.NeedsAttention -and (!$old -or $old.State -ne $record.State -or $old.CycleIdentity -cne $identity)) {
                $alertPath = Join-Path $outputRoot ('alert-' + $agent + '-' + $now.ToString('yyyyMMddTHHmmssfff') + '.json')
                # Immutable alert; contains metadata only. Source files/logs remain untouched.
                $stream = [IO.File]::Open($alertPath, 'CreateNew', 'Write', 'None')
                try {
                    $bytes = [Text.Encoding]::UTF8.GetBytes(($record | ConvertTo-Json -Depth 5))
                    $stream.Write($bytes, 0, $bytes.Length)
                } finally { $stream.Dispose() }
            }
        }
        $receipt = [pscustomobject]@{ ObservedUtc=$now.ToString('o'); MonitorId=$PID; ReadOnlyProcesses=$true; Workers=$records }
        $temporary = Join-Path $outputRoot ('current-' + $PID + '.tmp')
        $receipt | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $temporary -Encoding utf8
        Move-Item -LiteralPath $temporary -Destination $statePath -Force
        if (!$Watch) { $receipt | ConvertTo-Json -Depth 6 }
        else { Start-Sleep -Seconds $PollSeconds }
    } while ($Watch)
} finally { $lease.Dispose() }
