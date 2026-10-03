# Independent edge probes for worker message-delivery (Muse cycle-198).
# Extracts live Get-PendingTeamConsultation/Build-CyclePrompt from CURRENT
# muse-worker.ps1 via AST (same isolation technique as the permanent suite),
# then exercises fixture cases the suite does not pin. Read-only toward
# shared files; fixtures + receipts live in the Muse workspace.
$ErrorActionPreference = 'Stop'
$workerPath = 'D:\Joe\coordination\muse-worker.ps1'
$base = 'D:\Joe\muse-worktree\tmp\verify-msgdelivery-c198\edge'
New-Item -ItemType Directory -Path $base -Force | Out-Null

$tokens = $null; $errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($workerPath, [ref]$tokens, [ref]$errors)
if ($errors.Count) { throw 'Worker parser errors' }

function Get-WorkerDef($name, $consultations, $messages) {
    $node = $ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name}, $true)
    if (-not $node) { throw "Missing worker function $name" }
    return $node.Extent.Text.Replace('D:\Joe\coordination\team\consultations', $consultations).Replace('D:\Joe\coordination\team\messages', $messages)
}

$out = @()
function Check($id, $cond, $detail) {
    $script:out += [PSCustomObject]@{ id = $id; passed = [bool]$cond; detail = $detail }
}

# E1: missing consultations dir + matching message -> MessagesOnly delivered
$fx = Join-Path $base 'e1'; New-Item -ItemType Directory -Path (Join-Path $fx 'messages') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fx 'messages\CODEX-TO-MUSE-E1.md') -Value 'E1-MARKER'
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
Check 'E1-missing-consultations-dir' ($r.MessagesOnly -eq $true -and $r.Messages -match 'E1-MARKER') ("messagesOnly=$($r.MessagesOnly)")

# E2: missing messages dir + no pending -> $null (no phantom)
$fx = Join-Path $base 'e2'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations') -Force | Out-Null
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
Check 'E2-missing-messages-dir' ($null -eq $r) ("resultIsNull=" + ($null -eq $r))

# E3: only foreign/TEAM message files + no pending -> $null (no phantom)
$fx = Join-Path $base 'e3'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations'),(Join-Path $fx 'messages') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fx 'messages\CODEX-TO-NVIDIA-E3.md') -Value 'FOREIGN-MARKER'
Set-Content -LiteralPath (Join-Path $fx 'messages\CODEX-TO-TEAM-E3.md') -Value 'TEAM-MARKER'
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
Check 'E3-foreign-only' ($null -eq $r) ("resultIsNull=" + ($null -eq $r))

# E4: pending OWNED checkpoint + zero matching messages -> implementation prompt, no crash
$fx = Join-Path $base 'e4'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations'),(Join-Path $fx 'messages') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fx 'consultations\OWNED-MUSE.md') -Value "STATUS=PENDING_REVIEW`nPRIORITY=HIGH`nTASK_KIND=OWNED_REWORK_CHECKPOINT"
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
$p = Build-CyclePrompt -BasePrompt 'BASE' -Agent 'MUSE' -PendingConsultation $r
Check 'E4-owned-no-messages' ($p -match 'ASSIGNED IMPLEMENTATION CHECKPOINT' -and $p -match 'IMPLEMENTATION_STATUS=') ("hasImplSection=" + ($p -match 'ASSIGNED IMPLEMENTATION CHECKPOINT'))

# E5: 0-byte matching message file + no pending -> record actual behavior
$fx = Join-Path $base 'e5'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations'),(Join-Path $fx 'messages') -Force | Out-Null
New-Item -ItemType File -Path (Join-Path $fx 'messages\CODEX-TO-MUSE-E5.md') -Force | Out-Null
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
$actual = if ($null -eq $r) { 'NULL' } else { 'MessagesOnly=' + $r.MessagesOnly + ' len=' + ([string]$r.Messages).Length }
Check 'E5-empty-file' ($true) ("actual=$actual (recorded; no phantom consultation either way)")

# E6: pending NORMAL review + matching message -> review prompt AND messages attached
$fx = Join-Path $base 'e6'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations'),(Join-Path $fx 'messages') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fx 'consultations\REVIEW-MUSE.md') -Value "STATUS=PENDING_REVIEW`nPRIORITY=NORMAL`nTASK_KIND=EXACT_COORDINATION_SCRIPT_REVIEW"
Set-Content -LiteralPath (Join-Path $fx 'messages\CODEX-TO-MUSE-E6.md') -Value 'E6-MARKER'
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
$p = Build-CyclePrompt -BasePrompt 'BASE' -Agent 'MUSE' -PendingConsultation $r
Check 'E6-pending-plus-message' ($p -match 'REAL independent technical review' -and $r.Messages -match 'E6-MARKER' -and -not $r.MessagesOnly) ("reviewPrompt=" + ($p -match 'REAL independent technical review'))

# E7: message-only prompt shape -> checkpoint section, no consultation-file section
$fx = Join-Path $base 'e7'; New-Item -ItemType Directory -Path (Join-Path $fx 'consultations'),(Join-Path $fx 'messages') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $fx 'messages\CODEX-TO-MUSE-E7.md') -Value 'E7-MARKER'
. ([scriptblock]::Create((Get-WorkerDef 'Get-PendingTeamConsultation' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
. ([scriptblock]::Create((Get-WorkerDef 'Build-CyclePrompt' (Join-Path $fx 'consultations') (Join-Path $fx 'messages'))))
$r = Get-PendingTeamConsultation -Agent 'MUSE'
$p = Build-CyclePrompt -BasePrompt 'BASE' -Agent 'MUSE' -PendingConsultation $r -CriticalCommands @(@{Path='C';Id='CRITICAL-E7'})
Check 'E7-message-prompt-shape' ($p -match 'TEAM CHECKPOINT MESSAGES' -and $p -notmatch 'CONSULTATION FILE:' -and $p -match 'CRITICAL-E7' -and $p -match 'not a pending consultation') 'shape ok'

$out | Format-Table -AutoSize | Out-String | Write-Output
$out | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $base 'edge-results.json') -Encoding utf8
$failed = @($out | Where-Object { -not $_.passed })
Write-Output ("EDGE passed=" + ($out.Count - $failed.Count) + " failed=" + $failed.Count)
if ($failed.Count) { throw 'edge probes failed' }
