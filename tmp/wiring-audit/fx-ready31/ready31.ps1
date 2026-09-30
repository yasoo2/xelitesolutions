# ready31.ps1 — checkpoint 31 repair-readiness re-verification (READ-ONLY).
# For each P0/P1 backlog batch: confirm cited defect pattern still present at
# Muse HEAD + main-parity (inherited vs Muse-made). No source edits, no probes
# with side effects, no network. Output JSON is deterministic (sorted keys).
# Usage: powershell -File ready31.ps1 -OutJson <path> -OutLog <path>

param(
  [string]$OutJson = 'ready31.json',
  [string]$OutLog = 'ready31.log'
)

$ErrorActionPreference = 'Stop'
$MuseRoot = 'D:\Joe\muse-worktree'
$MainRoot = 'D:\Joe\xelitesolutions'

$log = @()
function Note([string]$s) { $script:log += $s }

# Each check: Batch, Rel (path under api/ or repo), Pattern (regex, single line), MainRel (same unless noted)
$checks = @(
  @{ Batch='P0-001'; Rel='api\src\api\routes\tools.ts'; Pattern='runAsSystem' },
  @{ Batch='P1-001a'; Rel='api\src\modules\tools\definitions\BulkFileGeneratorTool.ts'; Pattern='BulkFileGeneratorTool: ToolDefinition' },
  @{ Batch='P1-001b'; Rel='api\src\modules\tools\registry.ts'; Pattern='BulkFileGeneratorTool \} from' },
  @{ Batch='P1-001b2'; Rel='api\src\modules\tools\registry.ts'; Pattern='bulk_file_generator' },
  @{ Batch='P1-001c'; Rel='api\src\core\quality\verification-ledger.ts'; Pattern='visual_qa' },
  @{ Batch='P1-002a'; Rel='api\src\core\quality\image-semantic-qa.ts'; Pattern='.' },
  @{ Batch='P1-002b'; Rel='api\src\core\quality\live-data-qa.ts'; Pattern='.' },
  @{ Batch='P1-002c'; Rel='api\src\core\quality\shop-qa.ts'; Pattern='.' },
  @{ Batch='P1-002d'; Rel='api\src\core\llm\providers\nvidia.ts'; Pattern='.' },
  @{ Batch='P1-003'; Rel='api\src\modules\tools\definitions\DeployPagesTool.ts'; Pattern='getAllWorkspacesForLookup' },
  @{ Batch='P1-004'; Rel='api\src\modules\tools\definitions\PageFixTool.ts'; Pattern='PANEL_BROWSER_SID' },
  @{ Batch='P1-005a'; Rel='api\src\modules\tools\definitions\RepoSelfCodingTools.ts'; Pattern='blockedFragments' },
  @{ Batch='P1-005b'; Rel='api\src\kernel\ExecutionEngine.ts'; Pattern='shell: true' },
  @{ Batch='P1-006a'; Rel='api\src\modules\tools\definitions\GitHubActionsTool.ts'; Pattern="'.github', 'workflows'" },
  @{ Batch='P1-006b'; Rel='api\src\modules\tools\definitions\GitHubActionsTool.ts'; Pattern='node-ci' },
  @{ Batch='P1-007a'; Rel='api\src\modules\tools\utils.ts'; Pattern='function resolveToolPath' },
  @{ Batch='P1-007b'; Rel='api\src\modules\tools\definitions\ApiProjectTool.ts'; Pattern='input\?\.root' },
  @{ Batch='P1-008a'; Rel='api\src\modules\tools\definitions\ProjectRunTool.ts'; Pattern='killTree' },
  @{ Batch='P1-008b'; Rel='api\src\modules\tools\definitions\ProjectRunTool.ts'; Pattern='stopServer' },
  @{ Batch='P1-009a'; Rel='api\src\modules\tools\definitions\DeployProjectTool.ts'; Pattern='resolvePort' },
  @{ Batch='P1-009b'; Rel='api\src\modules\tools\definitions\DeployProjectTool.ts'; Pattern='which lt' },
  @{ Batch='P1-010a'; Rel='api\src\modules\tools\path-containment.ts'; Pattern='function isWithinRoot' },
  @{ Batch='P1-010b'; Rel='api\src\modules\services\WorkspaceService.ts'; Pattern='getActiveRoot' },
  @{ Batch='P1-011'; Rel='api\src\modules\tools\definitions\PerformanceAnalyzerTool.ts'; Pattern='path\.isAbsolute\(file\)' },
  @{ Batch='P1-012a'; Rel='api\src\kernel\ExecutionEngine.ts'; Pattern='ok: result\.success' },
  @{ Batch='P1-012b'; Rel='api\src\modules\tools\definitions\DockerManagerTool.ts'; Pattern='success:\s*true' },
  @{ Batch='P1-013'; Rel='api\src\modules\tools\definitions\I18nTranslatorTool.ts'; Pattern='require\(.\.\./\.\./llm.\)' },
  @{ Batch='P1-014a'; Rel='api\src\modules\tools\definitions\GoBuilderTool.ts'; Pattern='path\.join\(process\.cwd\(\)' },
  @{ Batch='P1-014b'; Rel='api\src\modules\tools\definitions\JavaBuilderTool.ts'; Pattern='path\.join\(process\.cwd\(\)' },
  @{ Batch='P1-015a'; Rel='api\src\modules\tools\definitions\SwaggerDocsTool.ts'; Pattern='\./src' },
  @{ Batch='P1-015b'; Rel='api\src\modules\tools\definitions\SwaggerDocsTool.ts'; Pattern='resolveToolPath' },
  @{ Batch='P1-016a'; Rel='api\src\modules\tools\definitions\ContentTools.ts'; Pattern='fetch\(' },
  @{ Batch='P1-016b'; Rel='api\src\modules\tools\definitions\ApiTesterTool.ts'; Pattern='https\?:' },
  @{ Batch='P1-016c'; Rel='api\src\core\api-discovery\network-policy.ts'; Pattern='assertSafePublicUrl' }
)

function Find-First([string]$file, [string]$pattern) {
  if (-not (Test-Path -LiteralPath $file)) { return @{ found = $false; line = 0; text = 'FILE_MISSING' } }
  $n = 0
  foreach ($ln in [System.IO.File]::ReadLines($file)) {
    $n++
    if ($ln -match $pattern) { return @{ found = $true; line = $n; text = $ln.Trim() } }
  }
  return @{ found = $false; line = 0; text = 'PATTERN_ABSENT' }
}

$rows = @()
foreach ($c in $checks) {
  $mf = Join-Path $MuseRoot $c.Rel
  $nf = Join-Path $MainRoot $c.Rel
  $m = Find-First $mf $c.Pattern
  $n = Find-First $nf $c.Pattern
  $parity = 'UNKNOWN'
  if ($m.found -and $n.found) { $parity = 'BOTH_PRESENT' }
  elseif ($m.found -and -not $n.found) { $parity = 'MUSE_ONLY' }
  elseif ((-not $m.found) -and $n.found) { $parity = 'MAIN_ONLY' }
  else { $parity = 'BOTH_ABSENT' }
  $rows += [ordered]@{
    batch = $c.Batch
    rel = $c.Rel
    muse_found = $m.found
    muse_line = $m.line
    muse_text = $m.text
    main_found = $n.found
    main_line = $n.line
    parity = $parity
  }
  Note(('{0} {1} muse={2}@{3} main={4}@{5} {6}' -f $c.Batch, $c.Rel, $m.found, $m.line, $n.found, $n.line, $parity))
}

# Extra existence checks (no pattern semantics)
$extras = [ordered]@{
  modules_llm_dir_missing_muse = -not (Test-Path -LiteralPath (Join-Path $MuseRoot 'api\src\modules\llm'))
  modules_llm_dir_missing_main = -not (Test-Path -LiteralPath (Join-Path $MainRoot 'api\src\modules\llm'))
}

$doc = [ordered]@{
  generated_by = 'ready31.ps1 (checkpoint 31, read-only)'
  muse_root = $MuseRoot
  main_root = $MainRoot
  check_count = $rows.Count
  extras = $extras
  rows = $rows
}

$json = $doc | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutJson, $json)
[System.IO.File]::WriteAllText($OutLog, ($log -join "`r`n") + "`r`n")
Write-Output ('wrote ' + $OutJson + ' + ' + $OutLog + ' rows=' + $rows.Count)
