$ErrorActionPreference='Stop'
# Independent edge probes for worker message-delivery (Muse review).
# Extracts live functions from CURRENT muse-worker.ps1 (not fixtures of fixtures).
$workerPath='D:\Joe\coordination\muse-worker.ps1'
$base='D:\Joe\muse-worktree\tmp\verify-msgdelivery\edge'
if(Test-Path $base){Remove-Item $base -Recurse -Force}
New-Item -ItemType Directory -Path $base | Out-Null
$tokens=$null;$errors=$null
$ast=[System.Management.Automation.Language.Parser]::ParseFile($workerPath,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'parser errors in current worker'}
function Load-Fns($consultations,$messages){
  foreach($name in @('Get-PendingTeamConsultation','Build-CyclePrompt')){
    $fn=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
    $definition=$fn.Extent.Text.Replace('D:\Joe\coordination\team\consultations',$consultations).Replace('D:\Joe\coordination\team\messages',$messages)
    . ([scriptblock]::Create($definition))
  }
}
$out=@()
# E1: consultations dir MISSING, one matching message -> MessagesOnly
$e1=Join-Path $base 'e1'; $e1m=Join-Path $e1 'messages'; New-Item -ItemType Directory -Path $e1m | Out-Null
Set-Content -LiteralPath (Join-Path $e1m 'CODEX-TO-MUSE-E1.md') -Value 'E1-MARKER'
. Load-Fns (Join-Path $e1 'consultations-MISSING') $e1m
$r1=Get-PendingTeamConsultation -Agent 'MUSE'
$out+="E1_missing_consult_dir_with_message: MessagesOnly=$($r1.MessagesOnly) hasMarker=$($r1.Messages -match 'E1-MARKER')"
# E2: messages dir MISSING, no pending -> null
$e2=Join-Path $base 'e2'; $e2c=Join-Path $e2 'consultations'; New-Item -ItemType Directory -Path $e2c | Out-Null
. Load-Fns $e2c (Join-Path $e2 'messages-MISSING')
$r2=Get-PendingTeamConsultation -Agent 'MUSE'
$out+="E2_missing_messages_dir_no_pending: isNull=$($null -eq $r2)"
# E3: only non-matching message files, no pending -> null
$e3=Join-Path $base 'e3'; $e3c=Join-Path $e3 'consultations'; $e3m=Join-Path $e3 'messages'; New-Item -ItemType Directory -Path $e3c,$e3m | Out-Null
Set-Content -LiteralPath (Join-Path $e3m 'CODEX-TO-NVIDIA-E3.md') -Value 'WRONG-AGENT'
Set-Content -LiteralPath (Join-Path $e3m 'CODEX-TO-TEAM-E3.md') -Value 'TEAM-WIDE'
. Load-Fns $e3c $e3m
$r3=Get-PendingTeamConsultation -Agent 'MUSE'
$out+="E3_only_foreign_messages_no_pending: isNull=$($null -eq $r3)"
# E4: TEAM-wide message + pending review -> team msg NOT in Messages (filter scope note)
Set-Content -LiteralPath (Join-Path $e3c 'OWNED-REWORK-CHECKPOINT-20261003-MUSE.md') -Value "STATUS=PENDING_REVIEW`nTASK_KIND=OWNED_REWORK_CHECKPOINT"
$r4=Get-PendingTeamConsultation -Agent 'MUSE'
$p4=Build-CyclePrompt -BasePrompt 'B' -Agent 'MUSE' -PendingConsultation $r4
$out+="E4_pending_owned_nomatch_messages: isImpl=$($p4 -match 'ASSIGNED IMPLEMENTATION CHECKPOINT') teamMsgInPayload=$($r4.Messages -match 'TEAM-WIDE')"
# E5: empty message file (0 bytes) matching name, no pending -> null (no phantom delivery)
$e5=Join-Path $base 'e5'; $e5c=Join-Path $e5 'consultations'; $e5m=Join-Path $e5 'messages'; New-Item -ItemType Directory -Path $e5c,$e5m | Out-Null
New-Item -ItemType File -Path (Join-Path $e5m 'CODEX-TO-MUSE-EMPTY.md') | Out-Null
. Load-Fns $e5c $e5m
$r5=Get-PendingTeamConsultation -Agent 'MUSE'
$out+="E5_empty_message_file_no_pending: isNull=$($null -eq $r5)"
$out | ForEach-Object { $_ }
$out | Set-Content -LiteralPath (Join-Path $base 'edge-results.txt')
