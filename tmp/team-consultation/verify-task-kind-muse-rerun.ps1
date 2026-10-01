$ErrorActionPreference='Stop'
$records=@()
foreach($worker in @('MUSE','NVIDIA')){
 $path=if($worker -eq 'MUSE'){'D:\Joe\coordination\muse-worker.ps1'}else{'D:\Joe\coordination\nvidia-worker.ps1'}
 $tokens=$null;$errors=$null
 $ast=[System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors)
 if($errors.Count){throw "$worker parser errors=$($errors.Count)"}
 foreach($name in @('Build-CyclePrompt','Get-PendingTeamConsultation','Get-CriticalHumanCommands')){
  $function=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true)
  if(!$function){throw "Missing $name"}
  Invoke-Expression $function.Extent.Text
 }
 $cases=@()
 foreach($hasCritical in @($false,$true)){
  foreach($hasConsult in @($false,$true)){
   $critical=if($hasCritical){@{Path='synthetic-critical.md';Id='CRITICAL-SYNTHETIC'}}else{$null}
   $consult=if($hasConsult){@{Path='synthetic-consult.md';Text='STATUS=PENDING_REVIEW'}}else{$null}
   $prompt=Build-CyclePrompt -BasePrompt 'BASE-SYNTHETIC' -Agent $worker -CriticalCommands $critical -PendingConsultation $consult
   $pass=$prompt.Contains("BASE $worker CYCLE INSTRUCTIONS") -and $prompt.Contains('BASE-SYNTHETIC') -and ($prompt.Contains('CRITICAL HUMAN COMMANDS') -eq $hasCritical) -and ($prompt.Contains('THREE-AGENT TEAM CONSULTATION') -eq $hasConsult)
   if($hasConsult){$pass=$pass -and $prompt.Contains("STATUS=REVIEWED_BY_$worker") -and !$prompt.Contains('IMPLEMENTATION_STATUS=')}
   if(!$pass){throw "$worker composition failed critical=$hasCritical consult=$hasConsult"}
   $cases+=@{Critical=$hasCritical;Consultation=$hasConsult;Pass=$pass}
  }
 }
 $owned=@{Path='synthetic-owned.md';Text='TASK_KIND=IMPLEMENTATION_CHECKPOINT_WITHIN_ACCEPTED_OWNERSHIP'}
 $ownedPrompt=Build-CyclePrompt -BasePrompt 'BASE-SYNTHETIC' -Agent $worker -CriticalCommands @{Path='synthetic-critical.md';Id='CRITICAL-SYNTHETIC'} -PendingConsultation $owned -TeamContext 'SHARED-SYNTHETIC'
 $ownedPass=$ownedPrompt.Contains('ASSIGNED IMPLEMENTATION CHECKPOINT') -and $ownedPrompt.Contains('IMPLEMENTATION_STATUS=') -and !$ownedPrompt.Contains("STATUS=REVIEWED_BY_$worker") -and !$ownedPrompt.Contains('Perform your REAL independent technical review.') -and $ownedPrompt.Contains('CRITICAL HUMAN COMMANDS') -and $ownedPrompt.Contains('THREE-AGENT TEAM CONSULTATION') -and $ownedPrompt.Contains("BASE $worker CYCLE INSTRUCTIONS") -and $ownedPrompt.Contains('SHARED-SYNTHETIC')
 if(!$ownedPass){throw "$worker assigned ownership composition failed"}
 $pending=Get-PendingTeamConsultation -Agent $worker
 $criticalFiles=@(Get-CriticalHumanCommands)
 if(!$pending){throw "$worker real pending consultation not detected"}
 $realCritical=@($criticalFiles | Where-Object {$_.Id -eq 'CRITICAL-REAL-JOE-UI-001' -or $_.Path -match 'CRITICAL-REAL-JOE-UI-001'})
 if(!$realCritical.Count){throw "$worker real critical command not detected"}
 $records+=@{Worker=$worker;ParserErrors=$errors.Count;CompositionCases=$cases;OwnedCheckpointPass=$ownedPass;PendingPath=$pending.Path;CriticalRealJoeDetected=$true;SourceHash=(Get-FileHash $path -Algorithm SHA256).Hash}
}
$result=@{Records=$records;Pass=$true;Scope='Extracted prompt/lookup functions only; no worker script execution/restart or runtime acceptance.'}
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "D:\Joe\muse-worktree\tmp\team-consultation\task-kind-muse-rerun.json" -Encoding utf8
$result | ConvertTo-Json -Depth 8
