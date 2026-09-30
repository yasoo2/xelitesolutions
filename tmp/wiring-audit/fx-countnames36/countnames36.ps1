# Checkpoint 36: distinct tool-NAME count vs definition-FILE count (read-only).
# Tests whether "163 tools" (file agreement) equals distinct declared tool names.
# Multi-tool files (MemoryTool etc.) make files != tools; this quantifies the gap.
function Get-ToolNames($dir) {
  $names = @{}
  $perFile = @{}
  Get-ChildItem "$dir\*.ts" | ForEach-Object {
    $file = $_.Name
    $found = Select-String -Path $_.FullName -Pattern "name\s*[:=]\s*'([a-z0-9_]+)'" -AllMatches |
      ForEach-Object { $_.Matches } | ForEach-Object { $_.Groups[1].Value }
    $uniq = @($found | Sort-Object -Unique)
    if ($uniq.Count -gt 0) { $perFile[$file] = $uniq.Count }
    foreach ($n in $uniq) { $names[$n] = $true }
  }
  $multi = @($perFile.Keys | Where-Object { $perFile[$_] -gt 1 } | Sort-Object)
  return @{ distinct = $names.Keys.Count; files = $perFile.Keys.Count; multi = $multi; multiCount = $multi.Count }
}
$m = Get-ToolNames 'D:\Joe\muse-worktree\api\src\modules\tools\definitions'
$n = Get-ToolNames 'D:\Joe\xelitesolutions\api\src\modules\tools\definitions'
[ordered]@{
  museDistinctNames = $m.distinct
  museFilesWithNames = $m.files
  museMultiNameFiles = $m.multiCount
  museMultiNameList = @($m.multi)
  mainDistinctNames = $n.distinct
  mainFilesWithNames = $n.files
  mainMultiNameFiles = $n.multiCount
  mainMultiNameList = @($n.multi)
  conclusion = 'distinct-name count vs 93/94 file count; multi-name files explain files!=tools'
} | ConvertTo-Json -Compress | Out-File -Encoding utf8 $args[0]
"wrote $($args[0])"
