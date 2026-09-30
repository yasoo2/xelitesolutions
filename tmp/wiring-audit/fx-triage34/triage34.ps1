# Checkpoint 34: P3/P4 review-batch triage (read-only, deterministic). ASCII-only.
# A: P3-001 15 dormant names -> reference zones + static-candidate leads + verdict.
# B: P3-002 conditional shadows -> scaffold winner matrix + github action matrix + bypass anchors.
# C: P4-001 giant files -> top-10 symbol inventory, both trees.
# Usage: triage34.ps1 <outJson> ; log lines go to stdout.
param([string]$OutJson)
$ErrorActionPreference = 'Stop'
$M = 'D:\Joe\muse-worktree'
$N = 'D:\Joe\xelitesolutions'

function ZoneRefs([string]$root, [string]$name) {
  $zones = [ordered]@{}
  $specs = @(
    @('api-src', 'api\src'),
    @('web-src', 'web\src'),
    @('docs', 'docs'),
    @('tests', 'api\src\__tests__'),
    @('manual', 'api\src\tests\manual')
  )
  foreach ($s in $specs) {
    $p = Join-Path $root $s[1]
    if (-not (Test-Path $p)) { $zones[$s[0]] = @(); continue }
    $hits = @(Get-ChildItem $p -Recurse -File -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '\.tmp|jest-cache|node_modules|\\dist\\|\.map$' } |
      Select-String -Pattern ([regex]::Escape($name)) -CaseSensitive:$false -ErrorAction SilentlyContinue |
      ForEach-Object { $_.Path.Replace($root + '\', '') + ':' + $_.LineNumber } | Sort-Object -Unique)
    $zones[$s[0]] = $hits
  }
  return $zones
}

# ---- A: dormant-15 (names + leads from DISCOVERY-002 F4; leads are NOT verdicts)
$dormant = @(
  @('check_syntax', @()),
  @('generate_tests', @()),
  @('generate_docs', @()),
  @('db_inspect', @()),
  @('command_policy_check', @()),
  @('tool_create_shell', @()),
  @('shell_status', @('shell_check_status')),
  @('product_search', @()),
  @('deep_research', @()),
  @('business_logic', @('business_logic_parser')),
  @('chaos_testing', @('chaos_test_plan')),
  @('cost_estimator', @('cloud_cost_estimator')),
  @('self_confidence', @('self_confidence_evaluator')),
  @('terraform_ops', @('docker_swarm_ops', 'git_ops', 'kubernetes_ops')),
  @('security_scan_repo', @('secrets_scan_repo'))
)
$pickerM = Get-Content (Join-Path $M 'api\src\core\llm\tool-picker.ts') -Raw
$prioBlock = [regex]::Match($pickerM, 'PRIORITY_TOOL_NAMES[^=]*=\s*\[(.*?)\];', 'Singleline').Groups[1].Value
$prioNames = @([regex]::Matches($prioBlock, '"([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
$prioCount = $prioNames.Count
"P-INFO priority-list entries parsed: $prioCount"
function LeadDeclared([string]$root, [string]$lead) {
  $hits = @(Get-ChildItem (Join-Path $root 'api\src\modules\tools\definitions') -Filter *.ts -File -ErrorAction SilentlyContinue |
    Select-String -Pattern ("name = '" + $lead + "'") -SimpleMatch -ErrorAction SilentlyContinue |
    ForEach-Object { $_.Filename + ':' + $_.LineNumber })
  return $hits
}
$rowsA = @()
foreach ($d in $dormant) {
  $nm = $d[0]
  $zm = ZoneRefs $M $nm
  $zn = ZoneRefs $N $nm
  $inPrio = $prioNames -contains $nm
  $leadDecl = @()
  foreach ($ld in $d[1]) { $leadDecl += @(LeadDeclared $M $ld) }
  $liveM = @(@($zm['api-src']) | Where-Object { $_ -notmatch 'tool-picker\.ts' }).Count + @($zm['web-src']).Count
  $liveN = @(@($zn['api-src']) | Where-Object { $_ -notmatch 'tool-picker\.ts' }).Count + @($zn['web-src']).Count
  $verdict = 'PRIORITY_LIST_ONLY_SILENT_DROP'
  if ($liveM -gt 0 -or $liveN -gt 0) { $verdict = 'EXTRA_LIVE_REFS' }
  elseif ((@($zm['docs']).Count + @($zn['docs']).Count) -gt 0) { $verdict = 'PRIORITY_PLUS_DOCS' }
  elseif ((@($zm['tests']).Count + @($zm['manual']).Count + @($zn['tests']).Count + @($zn['manual']).Count) -gt 0) { $verdict = 'PRIORITY_PLUS_TESTS' }
  $rowsA += [ordered]@{
    name = $nm; leads = $d[1]; verdict = $verdict; inPriorityList = [bool]$inPrio; leadDeclarations = $leadDecl
    museApiSrc = @($zm['api-src']); museWebSrc = @($zm['web-src'])
    museDocs = @($zm['docs']); museTests = @(@($zm['tests']) + @($zm['manual']))
    mainApiSrc = @($zn['api-src']); mainWebSrc = @($zn['web-src'])
    mainDocs = @($zn['docs']); mainTests = @(@($zn['tests']) + @($zn['manual']))
  }
  "A $nm verdict=$verdict liveM=$liveM liveN=$liveN prio=$inPrio leads=$($d[1] -join '+') leadDecl=@($($leadDecl -join ','))"
}

# ---- B1: scaffold winner matrix (regexes replicated verbatim from ToolService.ts:392-393;
# Arabic alternatives written as \u escapes: interface, reactx2, db, server, back)
$svcM = Get-Content (Join-Path $M 'api\src\modules\services\ToolService.ts') -Raw
$svcN = Get-Content (Join-Path $N 'api\src\modules\services\ToolService.ts') -Raw
$hasRedirectM = $svcM.Contains("name === 'scaffold_full_stack'")
$hasRedirectN = $svcN.Contains("name === 'scaffold_full_stack'")
$fe = 'react|vite|\bspa\b|frontend|landing|(?i:\u0648\u0627\u062C\u0647\u0629|\u0631\u064A\u0623\u0643\u062A|\u0631\u064A\u0627\u0643\u062A)'
$be = 'back\s*-?end|\bapi\b|server|database|mongo|postgres|express|fastify|auth|(?i:\u0642\u0627\u0639\u062F\u0629|\u062E\u0627\u062F\u0645|\u0628\u0627\u0643)'
# Arabic test input built from code points (avoids non-ASCII bytes in this script)
$arWords = ((0x0627,0x0628,0x0646,0x20,0x0648,0x0627,0x062C,0x0647,0x0629,0x20,0x0645,0x062A,0x062C,0x0631 | ForEach-Object { [char]$_ }) -join '')
$arJson = '{"request":"' + $arWords + '"}'
$matrix = @(
  @('en-frontend-only', '{"name":"my-app","type":"react","features":["landing page"]}'),
  @('ar-frontend-only', $arJson),
  @('backend-only', '{"name":"svc","type":"express api","features":["postgres database"]}'),
  @('both-front-back', '{"request":"react frontend with express backend and auth"}'),
  @('neither-cli', '{"name":"notes","type":"cli"}'),
  @('vite-spa', '{"features":["vite spa"]}'),
  @('api-substring-trap', '{"request":"rapid prototype"}')
)
$rowsB1 = @()
foreach ($row in $matrix) {
  $f = $row[1] -match $fe
  $b = $row[1] -match $be
  $winner = 'scaffold_full_stack'
  if ($f -and (-not $b)) { $winner = 'react_project' }
  $rowsB1 += [ordered]@{ case = $row[0]; frontendish = [bool]$f; backendish = [bool]$b; winner = $winner }
  "B1 $($row[0]) fe=$f be=$b -> $winner"
}
"B1 redirect-present muse=$hasRedirectM main=$hasRedirectN"

# ---- B2: github action matrix (schema enum vs implemented switch cases)
function GhMatrix([string]$root) {
  $p = Join-Path $root 'api\src\modules\tools\definitions\GitHubRepoManagerTool.ts'
  $t = Get-Content $p -Raw
  $enumM = [regex]::Match($t, 'enum:\s*\[([^\]]+)\]')
  $enumVals = @([regex]::Matches($enumM.Groups[1].Value, "'([^']+)'") | ForEach-Object { $_.Groups[1].Value })
  $cases = @([regex]::Matches($t, "case\s+'([^']+)'\s*:") | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
  $pubExempt = $t.Contains("action === 'analyze'") -and $t.Contains('canReadPublicRepo')
  return [ordered]@{ schemaEnum = $enumVals; switchCases = $cases; analyzePublicExempt = $pubExempt }
}
$ghM = GhMatrix $M
$ghN = GhMatrix $N
$ghRows = @()
foreach ($a in $ghM.schemaEnum) {
  $impl = $ghM.switchCases -contains $a
  $implN = $ghN.switchCases -contains $a
  $parity = 'IDENTICAL'
  if (-not ($ghN.schemaEnum -contains $a)) { $parity = 'DIVERGED' }
  if ($impl -ne $implN) { $parity = 'DIVERGED' }
  $ghRows += [ordered]@{ action = $a; inSchemaMuse = $true; implementedMuse = $impl; implementedMain = $implN; parity = $parity }
  "B2 action=$a implM=$impl implN=$implN $parity"
}
"B2 analyze-public-exempt muse=$($ghM.analyzePublicExempt) main=$($ghN.analyzePublicExempt)"

# ---- B3: deterministic-bypass anchors (proposed classification; NVIDIA cross-review required)
function Anchor([string]$root, [string]$rel, [string]$pat) {
  $p = Join-Path $root $rel
  if (-not (Test-Path $p)) { return @() }
  return @(Select-String -Path $p -Pattern $pat | ForEach-Object { $_.LineNumber } | Select-Object -First 5)
}
$bypasses = @(
  @('hisOwnSchema-entry', 'api\src\modules\tools\definitions\ProjectPipelineTool.ts', 'hisOwnSchema'),
  @('deterministic-phases', 'api\src\modules\tools\definitions\ProjectPipelineTool.ts', 'deterministicPhasesFor'),
  @('frontdoor-scaffold-redirect', 'api\src\modules\services\ToolService.ts', "name === 'scaffold_full_stack'"),
  @('terminal-veto', 'api\src\core\design\app-blueprints.ts', 'demandsTerminalRuntime'),
  @('schema-predicate', 'api\src\core\design\app-blueprints.ts', 'hasExplicitRecordSchema')
)
$rowsB3 = @()
foreach ($b in $bypasses) {
  $lm = Anchor $M $b[1] $b[2]
  $ln = Anchor $N $b[1] $b[2]
  $rowsB3 += [ordered]@{ site = $b[0]; file = $b[1]; museLines = $lm; mainLines = $ln }
  "B3 $($b[0]) muse=@($($lm -join ',')) main=@($($ln -join ','))"
}

# ---- C: giant-file inventory (top 10 .ts by bytes under api/src)
function TopFiles([string]$root) {
  $files = Get-ChildItem (Join-Path $root 'api\src') -Recurse -Filter *.ts -File |
    Sort-Object @{E = 'Length'; Descending = $true }, @{E = 'Name' } | Select-Object -First 10
  $out = @()
  foreach ($f in $files) {
    $t = Get-Content $f.FullName -Raw
    $lines = ($t -split "`n").Count
    $exports = ([regex]::Matches($t, '^\s*export\s+(class|function|const|interface|type|enum|async function|default )', 'Multiline')).Count
    $classes = ([regex]::Matches($t, '^\s*(export\s+)?(default\s+)?class\s+\w+', 'Multiline')).Count
    $imports = ([regex]::Matches($t, '^\s*import\s+', 'Multiline')).Count
    $rel = $f.FullName.Replace($root + '\', '')
    $out += [ordered]@{ file = $rel; bytes = $f.Length; lines = $lines; exports = $exports; classes = $classes; imports = $imports }
  }
  return $out
}
$topM = TopFiles $M
'C --- muse top10 ---'
foreach ($r in $topM) { "C muse $($r.file) bytes=$($r.bytes) lines=$($r.lines) exports=$($r.exports) classes=$($r.classes) imports=$($r.imports)" }
$topN = TopFiles $N
'C --- main top10 ---'
foreach ($r in $topN) { "C main $($r.file) bytes=$($r.bytes) lines=$($r.lines) exports=$($r.exports) classes=$($r.classes) imports=$($r.imports)" }

[ordered]@{
  partA_dormant15   = $rowsA
  partB1_scaffold   = [ordered]@{ redirectMuse = $hasRedirectM; redirectMain = $hasRedirectN; matrix = $rowsB1 }
  partB2_github     = [ordered]@{ muse = $ghM; main = $ghN; perAction = $ghRows }
  partB3_bypasses   = $rowsB3
  partC_giantsMuse  = $topM
  partC_giantsMain  = $topN
} | ConvertTo-Json -Depth 8 -Compress | Out-File -Encoding utf8 $OutJson
'wrote ' + $OutJson
