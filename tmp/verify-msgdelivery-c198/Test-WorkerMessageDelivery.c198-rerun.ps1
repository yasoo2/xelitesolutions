param([string[]]$WorkerPaths=@('D:\Joe\coordination\muse-worker.ps1','D:\Joe\coordination\nvidia-worker.ps1'))
$ErrorActionPreference='Stop'
$root=Join-Path 'D:\Joe\muse-worktree\tmp\verify-msgdelivery-c198\receipts' ('worker-message-delivery-'+(Get-Date -Format 'yyyyMMddTHHmmssfff'))
New-Item -ItemType Directory -Path $root | Out-Null
$results=@()
foreach($workerPath in $WorkerPaths) {
    $agent=if([IO.Path]::GetFileName($workerPath).StartsWith('muse')){'MUSE'}else{'NVIDIA'}
    $tokens=$null; $errors=$null
    $ast=[System.Management.Automation.Language.Parser]::ParseFile($workerPath,[ref]$tokens,[ref]$errors)
    if($errors.Count){throw 'Worker parser errors'}
    $fixture=Join-Path $root $agent
    $consultations=Join-Path $fixture 'consultations'; $messages=Join-Path $fixture 'messages'
    New-Item -ItemType Directory -Path $consultations,$messages | Out-Null
    foreach($name in @('Get-PendingTeamConsultation','Build-CyclePrompt')) {
        $fn=$ast.Find({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name},$true)
        if(!$fn){throw 'Missing worker function'}
        $definition=$fn.Extent.Text.Replace('D:\Joe\coordination\team\consultations',$consultations).Replace('D:\Joe\coordination\team\messages',$messages)
        . ([scriptblock]::Create($definition))
    }
    foreach($case in 1..4) {
        $critical=if($case -in @(2,4)){@(@{Path='CRITICAL-FIXTURE';Id='CRITICAL-MARKER'})}else{$null}
        $consult=if($case -in @(3,4)){@{Path='CONSULTATION-FIXTURE';Text='STATUS=PENDING_REVIEW'}}else{$null}
        $prompt=Build-CyclePrompt -BasePrompt 'BASE-MARKER' -Agent $agent -CriticalCommands $critical -PendingConsultation $consult
        $ok=($prompt -match 'BASE-MARKER') -and (($prompt -match 'CRITICAL-MARKER') -eq ($case -in @(2,4))) -and (($prompt -match 'CONSULTATION-FIXTURE') -eq ($case -in @(3,4)))
        $results+=@{agent=$agent;case="composition-$case";passed=$ok}
    }
    $none=Get-PendingTeamConsultation -Agent $agent
    $results+=@{agent=$agent;case='no-review-no-message';passed=($null -eq $none)}
    Set-Content -LiteralPath (Join-Path $messages "CODEX-TO-$agent-FIXTURE.md") -Value 'CURRENT-MESSAGE-MARKER'
    $messageOnly=Get-PendingTeamConsultation -Agent $agent
    $messagePrompt=Build-CyclePrompt -BasePrompt 'BASE-MARKER' -Agent $agent -PendingConsultation $messageOnly -CriticalCommands @(@{Path='CRITICAL-FIXTURE';Id='CRITICAL-MARKER'})
    $results+=@{agent=$agent;case='message-without-pending';passed=($messageOnly.MessagesOnly -eq $true -and $messageOnly.Messages -match 'CURRENT-MESSAGE-MARKER' -and $messagePrompt -match 'TEAM CHECKPOINT MESSAGES' -and $messagePrompt -notmatch 'STATUS=REVIEWED_BY_' -and $messagePrompt -match 'CRITICAL-MARKER')}
    Set-Content -LiteralPath (Join-Path $consultations "FIXTURE-$agent.md") -Value "STATUS=PENDING_REVIEW`nPRIORITY=CRITICAL`nTASK_KIND=OWNED_REWORK_CHECKPOINT"
    $owned=Get-PendingTeamConsultation -Agent $agent
    $ownedPrompt=Build-CyclePrompt -BasePrompt 'BASE-MARKER' -Agent $agent -PendingConsultation $owned
    $results+=@{agent=$agent;case='owned-rework-is-implementation';passed=($ownedPrompt -match 'ASSIGNED IMPLEMENTATION CHECKPOINT' -and $ownedPrompt -match 'IMPLEMENTATION_STATUS=' -and $owned.Messages -match 'CURRENT-MESSAGE-MARKER')}
    Set-Content -LiteralPath (Join-Path $consultations "FIXTURE-$agent.md") -Value "STATUS=REVIEWED_BY_$agent"
    $done=Get-PendingTeamConsultation -Agent $agent
    $results+=@{agent=$agent;case='completed-review-keeps-messages';passed=($done.MessagesOnly -eq $true)}
}
$results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $root 'results.json') -Encoding utf8
$failed=@($results | Where-Object {!$_.passed})
@{passed=@($results).Count-$failed.Count;failed=$failed.Count;receipt=$root} | ConvertTo-Json -Compress
if($failed.Count){throw 'Worker message-delivery regression checks failed'}
