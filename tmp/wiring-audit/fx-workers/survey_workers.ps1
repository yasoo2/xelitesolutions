# fx-workers: read-only static wiring survey of workers/jobs/queues/background (checkpoint 30)
# No source edits, no runtime, no network. Output: fx_workers.json
$ErrorActionPreference = 'Stop'
$ws = 'D:\Joe\muse-worktree'
$api = Join-Path $ws 'api\src'
$web = Join-Path $ws 'web\src'
$outDir = Join-Path $ws 'tmp\wiring-audit\fx-workers'

function Get-ProductionFiles {
  param([string]$dir)
  @(Get-ChildItem $dir -Recurse -File -Include '*.ts', '*.tsx' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '__tests__|tests\\manual|\.tmp|jest-cache|dist\\' } |
    Sort-Object FullName)
}
$apiFiles = Get-ProductionFiles $api
$webFiles = Get-ProductionFiles $web

# ---- 1. explicit trees ----
$servicesTree = @(Get-ChildItem (Join-Path $ws 'services') -Recurse -File |
  Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{ path = $_.FullName.Substring($ws.Length + 1); bytes = $_.Length }
  })
$extensionTree = @(Get-ChildItem (Join-Path $ws 'extension') -Recurse -File |
  Sort-Object FullName | ForEach-Object {
    [pscustomobject]@{ path = $_.FullName.Substring($ws.Length + 1); bytes = $_.Length }
  })
$composeFiles = @('infra\docker-compose.production.yml', 'infra\docker-compose.server.yml')
$composeServices = @()
foreach ($cf in $composeFiles) {
  $txt = Get-Content (Join-Path $ws $cf) -Raw
  $inServices = $false
  $names = @()
  foreach ($line in ($txt -split "`n")) {
    if ($line -match '^services:\s*$') { $inServices = $true; continue }
    if ($inServices -and $line -match '^  ([a-z][a-z0-9_-]*):\s*$') { $names += $Matches[1] }
    if ($inServices -and $line -match '^[a-z]+:\s*$' -and $line -notmatch '^services:') { $inServices = $false }
  }
  $composeServices += [pscustomobject]@{ file = $cf; services = $names }
}
# routes inventory + mount check (alias-aware: import/require alias -> use('<path>', alias))
$appText = Get-Content (Join-Path $api 'api\app.ts') -Raw
$routes = @()
foreach ($rf in @(Get-ChildItem (Join-Path $api 'api\routes') -File -Filter '*.ts' | Sort-Object Name)) {
  $base = [IO.Path]::GetFileNameWithoutExtension($rf.Name)
  $mountPath = $null
  $alias = $null
  $m1 = [regex]::Match($appText, "(?m)^\s*import\s+(\w+)\s+from\s+['""]\./routes/" + [regex]::Escape($base) + "['""]")
  $m2 = [regex]::Match($appText, "require\(['""]\./routes/" + [regex]::Escape($base) + "['""]\)")
  if ($m1.Success) { $alias = $m1.Groups[1].Value }
  elseif ($m2.Success) {
    $m3 = [regex]::Match($appText, "(?m)^\s*const\s+(\w+)\s*=\s*require\(['""]\./routes/" + [regex]::Escape($base) + "['""]\)")
    if ($m3.Success) { $alias = $m3.Groups[1].Value }
  }
  if ($alias) {
    $mu = [regex]::Match($appText, "\.use\(\s*['""]([^'""]+)['""],\s*(authenticate,\s*)?" + [regex]::Escape($alias) + "\s*\)")
    if ($mu.Success) { $mountPath = $mu.Groups[1].Value }
  }
  $routes += [pscustomobject]@{ route = $rf.Name; alias = $alias; mountPath = $mountPath; mountedInApp = ([bool]$mountPath) }
}

# ---- 2. candidates: name-based ----
$namePat = 'worker|queue|schedul|cron|job|background|timer'
$candSet = @{}
foreach ($f in ($apiFiles + $webFiles)) {
  if ([IO.Path]::GetFileNameWithoutExtension($f.Name) -match $namePat) { $candSet[$f.FullName] = 'name' }
}
# ---- 3. candidates: marker-based (single read per file) ----
$markers = @(
  @{ label = 'worker_threads'; rx = 'worker_threads|new\s+Worker\s*\(' },
  @{ label = 'child_process'; rx = "child_process" },
  @{ label = 'setInterval'; rx = '\bsetInterval\s*\(' },
  @{ label = 'setTimeout'; rx = '\bsetTimeout\s*\(' },
  @{ label = 'joblib'; rx = 'BullMQ|bullmq|BeeQueue|p-queue|pQueue|node-cron|cron\.schedule|Agenda' },
  @{ label = 'browser_worker_consumer'; rx = 'BROWSER_WS_ENDPOINT|WORKER_API_KEY' },
  @{ label = 'browser_server'; rx = 'launchServer\s*\(|launchPersistentContext|chromium\.launch|connectOverCDP' },
  @{ label = 'process_local_state'; rx = 'global\.joe\w*|joeQueues' }
)
$fileMarkers = @{}
foreach ($f in ($apiFiles + $webFiles)) {
  $text = Get-Content $f.FullName -Raw
  $hits = @()
  foreach ($mk in $markers) {
    $n = ([regex]::Matches($text, $mk.rx)).Count
    if ($n -gt 0) { $hits += [pscustomobject]@{ marker = $mk.label; count = $n } }
  }
  if ($hits.Count -gt 0) {
    $fileMarkers[$f.FullName] = $hits
    if (-not $candSet.ContainsKey($f.FullName)) { $candSet[$f.FullName] = 'marker' }
  }
}
# ---- 4. per-candidate wiring rows ----
$canon = @(
  'modules\services\ToolService.ts',
  'modules\services\AgentLoopService.ts',
  'modules\tools\definitions\PhaseExecutorTool.ts',
  'modules\tools\registry.ts',
  'api\app.ts'
)
# single-pass import index: file -> module-specifier tails (import/require)
$allPaths = @(($apiFiles + $webFiles) | ForEach-Object { $_.FullName })
$importIndex = @{}
foreach ($hit in @(Select-String -Path $allPaths -Pattern '(from\s+[''"]([^''"]+)[''"]|require\(\s*[''"]([^''"]+)[''"]\s*\)|import\(\s*[''"]([^''"]+)[''"]\s*\))' -ErrorAction SilentlyContinue)) {
  $g = $hit.Matches[0].Groups
  $spec = if ($g[2].Success -and $g[2].Value -ne '') { $g[2].Value } elseif ($g[3].Success -and $g[3].Value -ne '') { $g[3].Value } else { $g[4].Value }
  $tail = $spec.Split('/')[-1]
  if (-not $importIndex.ContainsKey($hit.Path)) { $importIndex[$hit.Path] = @{} }
  $importIndex[$hit.Path][$tail] = $true
}
$rows = New-Object System.Collections.Generic.List[object]
foreach ($full in ($candSet.Keys | Sort-Object)) {
  $text = Get-Content $full -Raw
  $base = [IO.Path]::GetFileNameWithoutExtension($full)
  $exports = @()
  foreach ($m in [regex]::Matches($text, '(?m)^export\s+(default\s+)?(async\s+)?(class|function|const|interface|type|enum|abstract\s+class)\s+([A-Za-z0-9_]+)')) {
    $exports += $m.Groups[4].Value
  }
  $hitSet = @{}
  foreach ($k in $importIndex.Keys) {
    if ($k -ne $full -and $importIndex[$k].ContainsKey($base)) { $hitSet[$k] = $true }
  }
  $isApi = $full.StartsWith($api)
  if ($isApi) { $rootLen = $api.Length + 1; $prefix = 'api/src/' } else { $rootLen = $web.Length + 1; $prefix = 'web/src/' }
  $rel = @($hitSet.Keys | Sort-Object | ForEach-Object {
    if ($_.StartsWith($api)) { 'api/src/' + $_.Substring($api.Length + 1) }
    elseif ($_.StartsWith($web)) { 'web/src/' + $_.Substring($web.Length + 1) }
    else { $_ }
  })
  $nonTest = @($rel | Where-Object { $_ -notmatch '__tests__|tests/|test\.|spec\.' })
  $canonHits = @($canon | Where-Object { $rel -contains ('api/src/' + $_) -or $rel -contains $_ })
  $routeHits = @($rel | Where-Object { $_ -like 'api/src/api/routes*' })
  $rows.Add([pscustomobject]@{
    file          = $prefix + $full.Substring($rootLen)
    foundBy       = $candSet[$full]
    bytes         = (Get-Item $full).Length
    markers       = @($fileMarkers[$full] | ForEach-Object { $_.marker + 'x' + $_.count })
    exports       = $exports
    importerCount = $rel.Count
    nonTestCount  = $nonTest.Count
    canonicalHits = $canonHits
    apiRouteHits  = $routeHits
    importers     = $rel
  })
}
$doc = [pscustomobject]@{
  generatedBy  = 'survey_workers.ps1 (checkpoint 30, read-only)'
  servicesTree = $servicesTree
  extensionTree = $extensionTree
  composeServices = $composeServices
  routes = $routes
  candidates = $rows
}
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$out = Join-Path $outDir 'fx_workers.json'
$doc | ConvertTo-Json -Depth 7 | Set-Content -NoNewline -Encoding utf8 $out
'services={0} extension={1} routes={2} candidates={3}' -f $servicesTree.Count, $extensionTree.Count, $routes.Count, $rows.Count
foreach ($r in $rows) {
  '{0} by={1} mk=[{2}] imp={3} nontest={4} canon=[{5}]' -f @(
    $r.file, $r.foundBy, ($r.markers -join ','), $r.importerCount, $r.nonTestCount, ($r.canonicalHits -join ','))
}
