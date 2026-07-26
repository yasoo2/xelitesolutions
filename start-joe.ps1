# ============================================================
# start-joe.ps1 — تشغيل Joe محلياً على المنفذ 5002 (ويندوز)
# بلا مفتاح: يعمل على الذكاء المجاني (LLM7 / Pollinations)
# يعيد التشغيل تلقائياً عند الانهيار
# التشغيل:  انقر بزر الفأرة الأيمن على الملف -> "Run with PowerShell"
#           أو من PowerShell:  ./start-joe.ps1
# ============================================================

# --- الوضع المحلي أحادي المستخدم (بلا قاعدة بيانات وبلا تسجيل دخول) ---
$env:PORT = "5002"
$env:JWT_SECRET = "dev-secret-joe-local"
$env:PERSISTENCE_MODE = "JSON"     # حفظ في ملفات JSON بدل MongoDB
$env:MOCK_DB = "true"              # لا حاجة لقاعدة بيانات
$env:ENABLE_AUTH_BYPASS = "true"   # مستخدم واحد: الأدوات تعمل بلا تسجيل دخول
$env:AUTO_APPROVE_ALL = "1"        # موافقة تلقائية على تنفيذ الأدوات
$env:NODE_ENV = "development"

$apiDir = "$PSScriptRoot\api"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  JOE - Local Free-AI Mode (no API key)" -ForegroundColor Cyan
Write-Host "  http://localhost:5002/joe" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan

# التحقق من وجود Node
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "[X] Node.js غير مثبّت. ثبّته من https://nodejs.org ثم أعد المحاولة." -ForegroundColor Red
    Read-Host "اضغط Enter للخروج"
    exit 1
}

Push-Location $apiDir

# [1/3] تثبيت التبعيات إن لزم
if (-not (Test-Path "$apiDir\node_modules")) {
    Write-Host "`n[1/3] Installing dependencies (first run only, قد يأخذ دقائق)..." -ForegroundColor Yellow
    npm install --no-audit --no-fund --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] فشل تثبيت التبعيات. راجع الأخطاء أعلاه." -ForegroundColor Red
        Pop-Location; Read-Host "اضغط Enter للخروج"; exit 1
    }
} else {
    Write-Host "`n[1/3] Dependencies already installed." -ForegroundColor Green
}

# [2/3] بناء الـ API (تظهر الأخطاء إن وُجدت)
Write-Host "`n[2/3] Building API..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[X] فشل البناء. راجع الأخطاء أعلاه." -ForegroundColor Red
    Pop-Location; Read-Host "اضغط Enter للخروج"; exit 1
}
Write-Host "[2/3] API built OK" -ForegroundColor Green

Pop-Location

# [2b/3] Build the web UI too. This MUST run after every git pull, otherwise the
# frontend stays stale and bugs like "the browser does nothing" or "sessions do
# not show" reappear even though the fixes were pulled.
$webDir = "$PSScriptRoot\web"
if (Test-Path $webDir) {
    Push-Location $webDir
    if (-not (Test-Path "$webDir\node_modules")) {
        Write-Host "`n[2b/3] Installing web dependencies (first run only)..." -ForegroundColor Yellow
        npm install --no-audit --no-fund --legacy-peer-deps
    }
    Write-Host "`n[2b/3] Building Web UI (ensures the latest frontend fixes are live)..." -ForegroundColor Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[!] Web build failed - starting with the last successful build." -ForegroundColor Red
    } else {
        Write-Host "[2b/3] Web UI built OK" -ForegroundColor Green
    }
    Pop-Location
}

# [3/3] التشغيل مع إعادة تشغيل تلقائية
$restartCount = 0
while ($true) {
    $restartCount++
    Write-Host "`n[3/3] Starting Joe (attempt #$restartCount)  ->  http://localhost:5002/joe" -ForegroundColor Yellow
    Push-Location $apiDir
    node dist/index.js
    $exitCode = $LASTEXITCODE
    Pop-Location
    Write-Host "`n[!] Joe stopped (exit code: $exitCode). Restarting in 3 seconds... (اضغط Ctrl+C للإيقاف)" -ForegroundColor Red
    Start-Sleep -Seconds 3
}
