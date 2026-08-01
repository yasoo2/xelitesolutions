# ============================================================
# test-launcher.ps1 — اختبارات سلوكية لسكربتات التشغيل (start-joe / update-joe)
#
# وُلد هذا الاختبار من عطل حقيقي: تحديثٌ أضاف تبعية adm-zip إلى package.json،
# لكن start-joe.ps1 تخطّى npm install لأن node_modules موجود — فدخل جو في
# حلقة انهيار لا نهائية (23 محاولة). هذه الاختبارات تضمن ألا يعود ذلك العطل.
#
# التشغيل (ويندوز أو لينكس مع pwsh):
#   pwsh -NoProfile -File scripts/test-launcher.ps1
# ============================================================
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$fails = 0
function Assert($cond, $name) {
    if ($cond) { Write-Host "  PASS $name" -ForegroundColor Green }
    else { Write-Host "  FAIL $name" -ForegroundColor Red; $script:fails++ }
}

# --- نستخرج Sync-Dependencies من السكربت الحقيقي عبر الـ AST — لا نسخة منفصلة
# --- قد تنحرف عن الأصل: الاختبار يختبر الدالة التي تعمل عند المستخدم حرفياً.
$startPath = Join-Path $repoRoot 'start-joe.ps1'
$toks = $null; $errs = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($startPath, [ref]$toks, [ref]$errs)
Assert ($errs.Count -eq 0) 'start-joe.ps1 parses with zero syntax errors'
$updatePath = Join-Path $repoRoot 'update-joe.ps1'
[System.Management.Automation.Language.Parser]::ParseFile($updatePath, [ref]$toks, [ref]$errs) | Out-Null
Assert ($errs.Count -eq 0) 'update-joe.ps1 parses with zero syntax errors'

$fnAst = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Sync-Dependencies' }, $true) | Select-Object -First 1
Assert ($null -ne $fnAst) 'Sync-Dependencies exists in start-joe.ps1'
Invoke-Expression $fnAst.Extent.Text

# --- npm مُقلَّد: يسجّل الاستدعاءات، ورمز الخروج يتحكم فيه الاختبار ---
$script:npmCalls = 0
$script:npmExit = 0
function npm { $script:npmCalls++; $global:LASTEXITCODE = $script:npmExit }

$dir = Join-Path ([System.IO.Path]::GetTempPath()) ("dep-test-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $dir | Out-Null
Set-Content (Join-Path $dir 'package.json') '{"dependencies":{"a":"1.0.0"}}'

Write-Host "`n[1] أول تشغيل: لا node_modules -> يثبّت ويختم"
$r = Sync-Dependencies -dir $dir -label 'T'
Assert ($r -eq $true) 'returns true'
Assert ($script:npmCalls -eq 1) 'npm install ran'
Assert (Test-Path (Join-Path $dir '.dep-stamp')) 'stamp written'

Write-Host "`n[2] package.json لم يتغيّر و node_modules موجود -> يتخطى التثبيت"
New-Item -ItemType Directory -Path (Join-Path $dir 'node_modules') | Out-Null
$r = Sync-Dependencies -dir $dir -label 'T'
Assert ($r -eq $true) 'returns true'
Assert ($script:npmCalls -eq 1) 'npm NOT re-run'

Write-Host "`n[3] سيناريو العطل الحقيقي: node_modules موجود لكن git pull أضاف تبعية -> يجب التثبيت"
Set-Content (Join-Path $dir 'package.json') '{"dependencies":{"a":"1.0.0","adm-zip":"0.5.16"}}'
$r = Sync-Dependencies -dir $dir -label 'T'
Assert ($r -eq $true) 'returns true'
Assert ($script:npmCalls -eq 2) 'npm install ran despite node_modules existing'

Write-Host "`n[4] فشل npm -> يرجع false ولا يُحدَّث الختم (فيُعاد التثبيت في التشغيل القادم)"
Set-Content (Join-Path $dir 'package.json') '{"dependencies":{"a":"2.0.0"}}'
$script:npmExit = 1
$r = Sync-Dependencies -dir $dir -label 'T'
Assert ($r -eq $false) 'returns false on npm failure'
$stamp = (Get-Content (Join-Path $dir '.dep-stamp') -Raw).Trim()
$freshHash = (Get-FileHash (Join-Path $dir 'package.json') -Algorithm SHA256).Hash
Assert ($stamp -ne $freshHash) 'stamp still old -> next run retries'
$script:npmExit = 0

Write-Host "`n[5] تمييز انقطاع الشبكة عن تعارض التاريخ (منطق update-joe.ps1)"
$netRegex = 'Could not resolve host|unable to access|Connection timed out|Could not read from remote|Failed to connect|Network is unreachable|SSL_ERROR|Recv failure'
$dnsFail = "fatal: unable to access 'https://github.com/yasoo2/xelitesolutions.git/': Could not resolve host: github.com"
$conflict = "error: Your local changes to the following files would be overwritten by merge:`n  api/src/index.ts`nAborting"
$diverged = "fatal: Need to specify how to reconcile divergent branches."
Assert ($dnsFail -match $netRegex) 'DNS failure detected as network error'
Assert (-not ($conflict -match $netRegex)) 'merge conflict is NOT a network error'
Assert (-not ($diverged -match $netRegex)) 'divergent history is NOT a network error'
$updateSrc = Get-Content $updatePath -Raw
Assert ($updateSrc.Contains($netRegex)) 'regex here matches the real script (no drift)'
Assert ($updateSrc.Contains('$isNetworkFailure')) 'update-joe branches on network failure'

Write-Host "`n[6] حارس حلقة الانهيار: 3 انهيارات سريعة توقف، تشغيل طويل يصفّر العداد"
$fastCrashes = 0
foreach ($alive in @(2, 3, 200, 1, 2, 4)) {
    if ($alive -lt 15) { $fastCrashes++ } else { $fastCrashes = 0 }
}
Assert ($fastCrashes -eq 3) 'long uptime resets the counter; 3 fast crashes reach the guard'
$startSrc = Get-Content $startPath -Raw
Assert ($startSrc.Contains('if ($fastCrashes -ge 3)')) 'guard threshold present'
Assert ($startSrc.Contains('if ($fastCrashes -eq 1)')) 'self-heal (npm install) on first fast crash present'
Assert ($startSrc.Contains('Sync-Dependencies -dir $webDir')) 'web dependencies use the same freshness check'

Remove-Item -Recurse -Force $dir
Write-Host ""
if ($fails -gt 0) { Write-Host "$fails FAILURES" -ForegroundColor Red; exit 1 }
Write-Host "ALL TESTS PASSED" -ForegroundColor Green
