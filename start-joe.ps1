# ============================================================
# start-joe.ps1 — تشغيل Joe API على المنفذ 5002 بشكل دائم
# يعيد التشغيل تلقائياً عند الانهيار
# ============================================================

$env:PORT = "5002"
$env:JWT_SECRET = "dev-secret-joe-local"
$env:PERSISTENCE_MODE = "JSON"
$env:MOCK_DB = "true"

$apiDir = "$PSScriptRoot\api"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  JOE API — Auto-Restart Mode" -ForegroundColor Cyan
Write-Host "  http://localhost:5002/joe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan

# بناء API أولاً
Write-Host "`n[1/2] Building API..." -ForegroundColor Yellow
Push-Location $apiDir
npm run build 2>&1 | Out-Null
Pop-Location
Write-Host "[1/2] API built OK" -ForegroundColor Green

# تشغيل مع إعادة تشغيل تلقائية
$restartCount = 0
while ($true) {
    $restartCount++
    Write-Host "`n[2/2] Starting API (attempt #$restartCount)..." -ForegroundColor Yellow
    
    Push-Location $apiDir
    node dist/index.js
    $exitCode = $LASTEXITCODE
    Pop-Location
    
    Write-Host "`n[!] API stopped (exit code: $exitCode). Restarting in 3 seconds..." -ForegroundColor Red
    Start-Sleep -Seconds 3
}
