# ready32.ps1 — checkpoint 32 P2-batch readiness re-verification (READ-ONLY).
# For each WIRING-P2-001..052 backlog batch: confirm cited defect pattern
# still present at Muse HEAD + main-parity (inherited vs Muse-made).
# No source edits, no probes with side effects, no network. Deterministic JSON.
# Usage: powershell -File ready32.ps1 -OutJson <path> -OutLog <path>

param(
  [string]$OutJson = 'ready32.json',
  [string]$OutLog = 'ready32.log'
)

$ErrorActionPreference = 'Stop'
$MuseRoot = 'D:\Joe\muse-worktree'
$MainRoot = 'D:\Joe\xelitesolutions'

$log = @()
function Note([string]$s) { $script:log += $s }

# Each check: Batch, Rel (path under repo root), Pattern (regex, single line)
$checks = @(
  @{ Batch='P2-001'; Rel='api\src\modules\services\ToolService.ts'; Pattern="name === 'recall_memory'" },
  @{ Batch='P2-002'; Rel='api\src\modules\services\ToolService.ts'; Pattern='web_search' },
  @{ Batch='P2-003'; Rel='api\src\modules\tools\definitions\ContentTools.ts'; Pattern='permissions: ToolPermission\[\] = \[\]' },
  @{ Batch='P2-004'; Rel='api\src\modules\tools\definitions\TaskLifecycleTool.ts'; Pattern="input\.action \|\| 'update'" },
  @{ Batch='P2-005'; Rel='api\src\modules\services\ToolService.ts'; Pattern='Tool reported failure without an error message' },
  @{ Batch='P2-006'; Rel='api\src\modules\tools\definitions\DeadCodeTool.ts'; Pattern='workDir = projectPathInput' },
  @{ Batch='P2-007'; Rel='api\src\modules\services\ToolService.ts'; Pattern='classifyToolRisk' },
  @{ Batch='P2-008'; Rel='api\src\modules\tools\definitions\BrowserRunTool.ts'; Pattern='sessionId_required' },
  @{ Batch='P2-009'; Rel='api\src\modules\tools\definitions\ArchiveFilesTool.ts'; Pattern='\|\| true' },
  @{ Batch='P2-010'; Rel='api\src\modules\tools\definitions\QualityTools.ts'; Pattern='Audit found security vulnerabilities' },
  @{ Batch='P2-011'; Rel='api\src\modules\tools\definitions\BrowserSmartTools.ts'; Pattern='sideEffects: ToolPermission\[\] = \[\]' },
  @{ Batch='P2-012'; Rel='api\src\modules\tools\definitions\BrowserRunTool.ts'; Pattern='pageUrl' },
  @{ Batch='P2-013'; Rel='api\src\modules\tools\definitions\BrowserSmartTools.ts'; Pattern='normalizeUrl' },
  @{ Batch='P2-014'; Rel='api\src\modules\tools\definitions\ScreenshotTool.ts'; Pattern='Simple size comparison' },
  @{ Batch='P2-015'; Rel='api\src\modules\tools\definitions\EliteTools.ts'; Pattern="\|\| '\{\}'" },
  @{ Batch='P2-016'; Rel='api\src\modules\tools\definitions\BrowserSmartTools.ts'; Pattern='hasViewportMeta' },
  @{ Batch='P2-017'; Rel='api\src\modules\tools\definitions\BrowserSmartTools.ts'; Pattern='joeCompareBaselines' },
  @{ Batch='P2-018'; Rel='api\src\modules\tools\definitions\PhaseExecutorTool.ts'; Pattern='scopeRoot' },
  @{ Batch='P2-019'; Rel='api\src\modules\tools\definitions\PhaseExecutorTool.ts'; Pattern='evidenceLocation' },
  @{ Batch='P2-020'; Rel='api\src\modules\tools\definitions\AutoTesterTool.ts'; Pattern='sideEffects: ToolPermission\[\] = \[\]' },
  @{ Batch='P2-021'; Rel='api\src\modules\tools\definitions\SecurityScannerTool.ts'; Pattern='discoverSourceFiles' },
  @{ Batch='P2-022'; Rel='api\src\modules\tools\definitions\WebDevelopmentTools.ts'; Pattern='vite.config.js' },
  @{ Batch='P2-023'; Rel='api\src\modules\tools\definitions\DeployProjectTool.ts'; Pattern='zip -r' },
  @{ Batch='P2-024'; Rel='api\src\modules\tools\definitions\SystemTools.ts'; Pattern='r\.success \? 0 : 1' },
  @{ Batch='P2-025'; Rel='api\src\modules\tools\definitions\ContentTools.ts'; Pattern='class JsonQueryTool' },
  @{ Batch='P2-026'; Rel='api\src\modules\tools\definitions\DatabaseEnterpriseTools.ts'; Pattern='EXPLAIN ANALYZE' },
  @{ Batch='P2-027'; Rel='api\src\modules\tools\definitions\DatabaseEnterpriseTools.ts'; Pattern='Math.max\(1' },
  @{ Batch='P2-028'; Rel='api\src\modules\tools\definitions\DatasourceTool.ts'; Pattern='ip-api\.com' },
  @{ Batch='P2-029'; Rel='api\src\modules\tools\definitions\PerformanceAnalyzerTool.ts'; Pattern='existsSync\(filePath\)\) continue' },
  @{ Batch='P2-030'; Rel='api\src\modules\tools\definitions\MonitoringTool.ts'; Pattern='tracked: true' },
  @{ Batch='P2-031'; Rel='api\src\modules\tools\definitions\AlertManagerTool.ts'; Pattern='private static' },
  @{ Batch='P2-032'; Rel='api\src\modules\tools\definitions\TodoWriteTool.ts'; Pattern='acknowledged' },
  @{ Batch='P2-033'; Rel='api\src\core\profile\business-profile.ts'; Pattern='clearProfile' },
  @{ Batch='P2-034'; Rel='api\src\modules\tools\definitions\FormInboxTool.ts'; Pattern='\|\| true' },
  @{ Batch='P2-035'; Rel='api\src\modules\tools\definitions\InfrastructureTools.ts'; Pattern='code\s*===\s*0' },
  @{ Batch='P2-036'; Rel='api\src\modules\tools\definitions\AdvancedTools.ts'; Pattern='###\\s\+Function' },
  @{ Batch='P2-037'; Rel='api\src\modules\tools\definitions\InfrastructureTools.ts'; Pattern='path_outside_workspace' },
  @{ Batch='P2-038'; Rel='api\src\modules\tools\definitions\QualityTools.ts'; Pattern="'.github', 'workflows'" },
  @{ Batch='P2-039'; Rel='api\src\modules\tools\definitions\GoBuilderTool.ts'; Pattern='to build the project' },
  @{ Batch='P2-040'; Rel='api\src\modules\tools\definitions\PythonBuilderTool.ts'; Pattern='toUpperCase' },
  @{ Batch='P2-041'; Rel='api\src\modules\tools\definitions\PythonExecutionTool.ts'; Pattern='os\.tmpdir' },
  @{ Batch='P2-042'; Rel='api\src\core\quality\verification-ledger.ts'; Pattern='succeeded' },
  @{ Batch='P2-043'; Rel='api\src\modules\tools\definitions\SwaggerDocsTool.ts'; Pattern='ep\.method\.toLowerCase' },
  @{ Batch='P2-044'; Rel='api\src\modules\tools\definitions\GoogleAccountTool.ts'; Pattern='To: \$\{to\}' },
  @{ Batch='P2-045'; Rel='api\src\modules\tools\definitions\VideoActionTool.ts'; Pattern='Unknown action' },
  @{ Batch='P2-046'; Rel='api\src\modules\tools\definitions\ImageStudioTool.ts'; Pattern='No table here has a picture column' },
  @{ Batch='P2-047'; Rel='api\src\modules\tools\definitions\QualityTools.ts'; Pattern='evidenceLocation' },
  @{ Batch='P2-048'; Rel='api\src\core\quality\verification-ledger.ts'; Pattern='narrowed reuse is disabled' },
  @{ Batch='P2-049'; Rel='api\src\modules\services\CortexState.ts'; Pattern='.' },
  @{ Batch='P2-050'; Rel='api\src\modules\services\DeployManager.ts'; Pattern='AlertService' },
  @{ Batch='P2-051'; Rel='api\src\api\routes\queue.ts'; Pattern='useTaskQueue' },
  @{ Batch='P2-052'; Rel='web\src\components\TaskTracker.tsx'; Pattern='.' }
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

$doc = [ordered]@{
  generated_by = 'ready32.ps1 (checkpoint 32, read-only)'
  muse_root = $MuseRoot
  main_root = $MainRoot
  check_count = $rows.Count
  rows = $rows
}

$json = $doc | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText($OutJson, $json)
[System.IO.File]::WriteAllText($OutLog, ($log -join "`r`n") + "`r`n")
Write-Output ('wrote ' + $OutJson + ' + ' + $OutLog + ' rows=' + $rows.Count)
