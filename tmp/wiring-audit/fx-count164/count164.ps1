# Checkpoint 33: 163-vs-164 registered-tool count reconciliation (read-only).
# Compares tool-definition file inventories + cites the NVIDIA dirty registry hunk.
$m = Get-ChildItem 'D:\Joe\muse-worktree\api\src\modules\tools\definitions\*.ts' | Select-Object -ExpandProperty Name | Sort-Object
$n = Get-ChildItem 'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\*.ts' | Select-Object -ExpandProperty Name | Sort-Object
$delta = Compare-Object $m $n | ForEach-Object { "$($_.SideIndicator) $($_.InputObject)" }
$toolName = (Select-String -Path 'D:\Joe\xelitesolutions\api\src\modules\tools\definitions\SpecificationVerificationTool.ts' -Pattern "name =\s*'([^']+)'" | Select-Object -First 1).Matches.Groups[1].Value
$regDiff = git -c safe.directory=D:/Joe/xelitesolutions -C 'D:\Joe\xelitesolutions' diff --numstat -- api/src/modules/tools/registry.ts 2>$null
[ordered]@{
  museDefinitionFiles = $m.Count
  mainDefinitionFiles = $n.Count
  filenameDelta       = @($delta)
  newToolName         = $toolName
  registryNumstat     = "$regDiff"
  conclusion          = 'main-live 164 = committed 163 + dirty specification_verification; committed trees agree at 163'
} | ConvertTo-Json -Compress | Out-File -Encoding utf8 $args[0]
"wrote $($args[0])"
