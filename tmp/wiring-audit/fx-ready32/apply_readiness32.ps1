# apply_readiness32.ps1 — checkpoint 32 staging edit (mechanical, verified).
# Inserts one READINESS + READINESS_EVIDENCE pair after the DEPENDENCIES=
# line of each WIRING-P2-001..052 block. Skips blocks that already have
# a READINESS line. Fails loudly on any batch with no DEPENDENCIES line.
param([string]$Backlog = '..\staging\JOE-WIRING-REPAIR-BACKLOG.md')

$ErrorActionPreference = 'Stop'

$verdicts = [ordered]@{
  '001' = @('COORDINATION_BLOCKED (checkpoint 32)', 'inline recall_memory ToolService.ts:571 both trees; ToolService shared + memory overlaps NVIDIA-claimed files; owner decision first')
  '002' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'web_search anchor ToolService.ts:247 both trees; needs single-winner gate design + image_generate creative decision first')
  '003' = @('READY_FOR_OWNER (checkpoint 32)', 'empty-permissions declaration ContentTools.ts:129 both trees; declaration-only, no behavior change')
  '004' = @('READY_FOR_OWNER (checkpoint 32)', "action-default TaskLifecycleTool.ts:27 both trees; tool-local schema/execute alignment")
  '005' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'generic wrapper text ToolService.ts:946 both trees; wrapper-vs-tool-site scope + engine exitCode root need design first')
  '006' = @('READY_FOR_OWNER (checkpoint 32)', 'default-root workDir DeadCodeTool.ts:50 both trees; tool-local containment + dead-input fix')
  '007' = @('COORDINATION_BLOCKED (checkpoint 32)', 'classifyToolRisk ToolService.ts:142 both trees; shared classifier; owner decision first')
  '008' = @('COORDINATION_BLOCKED (checkpoint 32)', 'sessionId_required guard BrowserRunTool.ts:248 both trees; ToolService injection block shared; owner decision first')
  '009' = @('READY_FOR_OWNER (checkpoint 32)', '|| true ArchiveFilesTool.ts:92 both trees; tool-local backend honesty')
  '010' = @('READY_FOR_OWNER (checkpoint 32)', 'mislabel text QualityTools.ts:102 both trees; tool-local error-text fix')
  '011' = @('READY_FOR_OWNER (checkpoint 32)', 'empty sideEffects BrowserSmartTools.ts:174 both trees; declaration-only (+P2-020 same gate)')
  '012' = @('READY_FOR_OWNER (checkpoint 32)', 'pageUrl-only output BrowserRunTool.ts:149 both trees; tool-local output addition, backward-compatible keys')
  '013' = @('READY_FOR_OWNER (checkpoint 32)', 'normalizeUrl BrowserSmartTools.ts:30 both trees; tool-local vocabulary decision + contract')
  '014' = @('READY_FOR_OWNER (checkpoint 32)', 'byte-compare ScreenshotTool.ts:244 both trees; tool-local fidelity/containment')
  '015' = @('COORDINATION_BLOCKED (checkpoint 32)', "match-or-''{}'' EliteTools.ts:66 both trees; router + ToolService shared + NVIDIA provider-adjacent verification needed")
  '016' = @('READY_FOR_OWNER (checkpoint 32)', 'hasViewportMeta detection BrowserSmartTools.ts:1271 both trees; one-line mapper addition')
  '017' = @('READY_FOR_OWNER (checkpoint 32)', 'global baseline store BrowserSmartTools.ts:726 both trees; tool-local scoping + test')
  '018' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'scopeRoot PhaseExecutorTool.ts:1570/1568 (Muse +2 drift from verification edits); PhaseExecutor shared + NVIDIA-adjacent; resolution design first')
  '019' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'receipt reader PhaseExecutorTool.ts:1330/1328 (Muse +2 drift); evidence-meaning decision + P2-018 first')
  '020' = @('READY_FOR_OWNER (checkpoint 32)', 'empty sideEffects AutoTesterTool.ts:58/57 (Muse +1 drift); declaration-only, share P2-011 gate')
  '021' = @('READY_FOR_OWNER (checkpoint 32)', 'discoverSourceFiles SecurityScannerTool.ts:108 both trees; tool-local resolver + vocabulary')
  '022' = @('READY_FOR_OWNER (checkpoint 32)', 'unguarded config write WebDevelopmentTools.ts:529 both trees; tool-local guard')
  '023' = @('READY_FOR_OWNER (checkpoint 32)', 'zip -r DeployProjectTool.ts:251/225 (Muse +26 drift from 990cf029 port-guard slice); tool-local quoting')
  '024' = @('READY_FOR_OWNER (checkpoint 32)', 'exit collapse SystemTools.ts:1084 both trees; P1-010 dependency is live-proof-only, not a fix blocker')
  '025' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'JsonQueryTool ContentTools.ts:122 both trees; found-shape + verdict-mapping design (+#14 sibling) first')
  '026' = @('READY_FOR_OWNER (checkpoint 32)', 'EXPLAIN ANALYZE text DatabaseEnterpriseTools.ts:183 both trees; description + input guard')
  '027' = @('READY_FOR_OWNER (checkpoint 32)', 'Math.max(1 clamp DatabaseEnterpriseTools.ts:258 both trees; tool-local input contract')
  '028' = @('READY_FOR_OWNER (checkpoint 32)', 'plaintext http://ip-api.com DatasourceTool.ts:116 both trees (scheme read from matched text); transport bounds + scheme')
  '029' = @('READY_FOR_OWNER (checkpoint 32)', 'silent-continue PerformanceAnalyzerTool.ts:66 both trees; receipt honesty + input guard (may share P1-011 owner)')
  '030' = @('READY_FOR_OWNER (checkpoint 32)', 'tracked:true MonitoringTool.ts:150 both trees; tool-local honesty')
  '031' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'private static stores AlertManagerTool.ts:72 both trees; session-scope/persist design + cross-session probing needs ownership decision')
  '032' = @('READY_FOR_OWNER (checkpoint 32)', 'data-shape receipt TodoWriteTool.ts:17 both trees; tool-local output shape + input guard')
  '033' = @('READY_FOR_OWNER (checkpoint 32)', 'clearProfile business-profile.ts:74 both trees; fixture-level isolation harness, synthetic only')
  '034' = @('READY_FOR_OWNER (checkpoint 32)', '|| true FormInboxTool.ts:26 both trees; one-line i18n fix, smallest batch')
  '035' = @('READY_FOR_OWNER (checkpoint 32)', 'errorless failure legs InfrastructureTools.ts:125 both trees; tool-local error channel (do not touch generic synthesis)')
  '036' = @('SPLIT (checkpoint 32)', 'lying counter AdvancedTools.ts:823 both trees; counts fix READY now, outside-write half rides P2-037 rule')
  '037' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'strict-vs-shared split InfrastructureTools.ts:29 both trees; ONE-rule decision + owner-binding input first')
  '038' = @('READY_FOR_OWNER (checkpoint 32)', 'workflows write QualityTools.ts:371 both trees; tool-local path/kind guards')
  '039' = @('READY_FOR_OWNER (checkpoint 32)', 'canned build text GoBuilderTool.ts:520 both trees; shape fix independent; P1-010 dep only if effect implemented')
  '040' = @('READY_FOR_OWNER (checkpoint 32)', 'README template crash PythonBuilderTool.ts:107 both trees; contract fix; P2-037 only if materialize chosen')
  '041' = @('SPLIT (checkpoint 32)', 'os.tmpdir staging PythonExecutionTool.ts:66 both trees; description+staging READY now, wd-containment rides P2-037')
  '042' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'workflow vocabulary verification-ledger.ts:663 both trees; #13-class mapping design first')
  '043' = @('READY_FOR_OWNER (checkpoint 32)', 'unguarded ep.method SwaggerDocsTool.ts:154 both trees; P1-015 paths land first or with')
  '044' = @('READY_FOR_OWNER (checkpoint 32)', 'raw header interpolation GoogleAccountTool.ts:105 both trees; fixture-level validation, never live sends')
  '045' = @('SPLIT (checkpoint 32)', 'Unknown-action default VideoActionTool.ts:57 both trees; validation+savedPath READY now, containment/argv ride P2-037/P1-012')
  '046' = @('READY_FOR_OWNER (checkpoint 32)', 'catch-rendered domain sentence ImageStudioTool.ts:146 both trees; receipt honesty; coordinate P1-010 prefix rule')
  '047' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'evidenceLocation ABSENT QualityTools.ts both trees (absence anchor = defect confirmed); pointer decision, same as P2-019')
  '048' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'narrowed-reuse-disabled verification-ledger.ts:528 both trees; DECISION batch, no code until decided')
  '049' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'CortexState.ts present both trees (file exists, zero references); retire-vs-wire decision first')
  '050' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'AlertService import DeployManager.ts:9 both trees, never invoked; wire-vs-remove decision first')
  '051' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'stale useTaskQueue comment queue.ts:5 both trees, callerless; out-of-repo caller sweep + disposition decision first')
  '052' = @('READY_FOR_PROPOSAL (checkpoint 32)', 'TaskTracker.tsx present both trees, unrendered; retire-vs-render decision first')
}

$lines = [System.IO.File]::ReadAllLines((Resolve-Path $Backlog))
$out = New-Object System.Collections.Generic.List[string]
$current = ''
$haveReadiness = $false
$inserted = @()
foreach ($ln in $lines) {
  if ($ln -match '^BATCH_ID=WIRING-P2-(\d+)$') { $current = $Matches[1]; $haveReadiness = $false }
  elseif ($ln -match '^BATCH_ID=') { $current = ''; $haveReadiness = $false }
  if ($ln -match '^READINESS=') { $haveReadiness = $true }
  $out.Add($ln)
  if ($current -ne '' -and $ln -match '^DEPENDENCIES=' -and -not $haveReadiness) {
    if (-not $verdicts.Contains($current)) { throw "no verdict for P2-$current" }
    $out.Add('READINESS=' + $verdicts[$current][0])
    $out.Add('READINESS_EVIDENCE=' + $verdicts[$current][1])
    $inserted += $current
    $haveReadiness = $true
  }
}
$missing = $verdicts.Keys | Where-Object { $inserted -notcontains $_ }
if ($missing.Count -gt 0) { throw ("missing inserts: " + ($missing -join ',')) }
[System.IO.File]::WriteAllLines((Resolve-Path $Backlog), $out)
Write-Output ("inserted=" + $inserted.Count)
