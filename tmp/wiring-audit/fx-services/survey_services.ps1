# fx-services: read-only static wiring survey of api/src/modules/services (checkpoint 29)
# No source edits, no runtime, no network. Output: fx_services.json
$ErrorActionPreference = 'Stop'
$root = 'D:\Joe\muse-worktree\api\src'
$svcDir = Join-Path $root 'modules\services'
$files = Get-ChildItem $svcDir -File -Filter '*.ts' | Sort-Object Name
$canon = @(
  'modules\services\ToolService.ts',
  'modules\services\AgentLoopService.ts',
  'modules\tools\definitions\PhaseExecutorTool.ts',
  'modules\tools\registry.ts',
  'api\app.ts'
)
$rows = @()
foreach ($f in $files) {
  $base = [IO.Path]::GetFileNameWithoutExtension($f.Name)
  $text = Get-Content $f.FullName -Raw
  $exports = @()
  foreach ($m in [regex]::Matches($text, '(?m)^export\s+(default\s+)?(async\s+)?(class|function|const|interface|type|enum|abstract\s+class)\s+([A-Za-z0-9_]+)')) {
    $exports += $m.Groups[4].Value
  }
  $namedExport = @()
  foreach ($m in [regex]::Matches($text, '(?m)^export\s*\{([^}]+)\}')) {
    $namedExport += ($m.Groups[1].Value -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' })
  }
  # importers: any api/src file referencing the service module via
  # services/<base>, ../services/<base> or same-dir ./<base> (import/require),
  # excluding the file itself. NOTE: ./<base> can false-positive on a
  # same-named module in another dir; basenames here are distinctive.
  $allFiles = @(Get-ChildItem $root -Recurse -File -Include '*.ts','*.tsx')
  $hitSet = @{}
  foreach ($pat in @("services/$base", "./$base")) {
    $allFiles | Select-String -SimpleMatch -Pattern $pat |
      Where-Object { $_.Path -ne $f.FullName } |
      ForEach-Object { $hitSet[$_.Path] = $true }
  }
  $hits = @($hitSet.Keys)
  $rel = @($hits | ForEach-Object { $_.Substring($root.Length + 1) } | Sort-Object)
  $nonTest = @($rel | Where-Object { $_ -notmatch '__tests__|tests[/\\]|test\.|spec\.' })
  $canonHits = @($canon | Where-Object { $rel -contains $_ })
  $routeHits = @($rel | Where-Object { $_ -like 'api\routes\*' -or $_ -like 'api\*' })
  $rows += [pscustomobject]@{
    service        = $f.Name
    bytes          = $f.Length
    lines          = ($text -split "`n").Count
    exports        = $exports
    namedExports   = $namedExport
    importerCount  = $rel.Count
    nonTestCount   = $nonTest.Count
    canonicalHits  = $canonHits
    apiRouteHits   = $routeHits
    importers      = $rel
  }
}
$out = Join-Path 'D:\Joe\muse-worktree\tmp\wiring-audit\fx-services' 'fx_services.json'
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
$rows | ConvertTo-Json -Depth 6 | Set-Content -NoNewline -Encoding utf8 $out
# compact console table
foreach ($r in $rows) {
  '{0} importers={1} nontest={2} canon=[{3}] routes={4} exports={5}' -f @(
    $r.service, $r.importerCount, $r.nonTestCount,
    ($r.canonicalHits -join ','), $r.apiRouteHits.Count,
    (($r.exports + $r.namedExports | Select-Object -First 6) -join ','))
}
