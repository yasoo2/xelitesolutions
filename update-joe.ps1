# ============================================================
# update-joe.ps1 — تحديث جو وتشغيله بأمر واحد (ويندوز)
#
#   1) يسحب آخر تحديث من GitHub
#   2) يعرض لك رقم آخر تحديث للتأكد أن السحب نجح
#   3) يوقف نسخة جو القديمة العاملة على المنفذ 5002
#      (هذه هي الخطوة التي بدونها يبقى الكود القديم يعمل رغم التحديث)
#   4) يشغّل start-joe.ps1 الذي يبني الخادم والواجهة ثم يشغّل جو
#
# التشغيل:  ./update-joe.ps1
#           أو: انقر بزر الفأرة الأيمن -> "Run with PowerShell"
# ============================================================

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  تحديث جو وتشغيله" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

# --- [1/4] سحب آخر تحديث ---------------------------------------------------
Write-Host "`n[1/4] سحب آخر تحديث من GitHub..." -ForegroundColor Yellow

$before = (git rev-parse --short HEAD 2>$null)
git pull origin main

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[!] فشل السحب العادي (غالباً بسبب تعارض في التاريخ)." -ForegroundColor Red
    Write-Host "    سأجعل نسختك مطابقة تماماً لما على GitHub." -ForegroundColor Yellow

    # حماية: إن كان لديك تعديلات محلية غير محفوظة، نحفظها جانباً بدل إتلافها
    $dirty = (git status --porcelain)
    if ($dirty) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Write-Host "    لديك تعديلات محلية — سأحفظها في stash باسم joe-backup-$stamp" -ForegroundColor Yellow
        git stash push -u -m "joe-backup-$stamp" | Out-Null
        Write-Host "    (لاستعادتها لاحقاً: git stash list  ثم  git stash pop)" -ForegroundColor DarkGray
    }

    git fetch origin
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[X] تعذّر التحديث. تحقّق من اتصال الإنترنت ثم أعد المحاولة." -ForegroundColor Red
        Read-Host "اضغط Enter للخروج"
        exit 1
    }
}

# --- [2/4] التحقق من نجاح السحب --------------------------------------------
$after = (git rev-parse --short HEAD 2>$null)
Write-Host "`n[2/4] آخر تحديث لديك الآن:" -ForegroundColor Yellow
git log --oneline -1

if ($before -eq $after) {
    Write-Host "    (لا جديد — نسختك محدّثة أصلاً)" -ForegroundColor DarkGray
} else {
    Write-Host "    تم التحديث: $before -> $after" -ForegroundColor Green
}

# --- [3/4] إيقاف نسخة جو القديمة -------------------------------------------
# بدون هذه الخطوة يبقى الخادم القديم محمّلاً في الذاكرة، فتظن أن التحديث لم يعمل.
Write-Host "`n[3/4] إيقاف نسخة جو القديمة (المنفذ 5002)..." -ForegroundColor Yellow

$stopped = 0
try {
    $conns = Get-NetTCPConnection -LocalPort 5002 -State Listen -ErrorAction Stop
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            $stopped++
        } catch {
            Write-Host "    تعذّر إيقاف العملية $($c.OwningProcess): $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
} catch {
    # ويندوز قديم أو الأمر غير متاح — نرجع إلى netstat
    $lines = netstat -ano | Select-String ":5002\s.*LISTENING"
    foreach ($line in $lines) {
        $procId = ($line.ToString().Trim() -split '\s+')[-1]
        if ($procId -match '^\d+$' -and $procId -ne '0') {
            try {
                Stop-Process -Id ([int]$procId) -Force -ErrorAction Stop
                $stopped++
            } catch { }
        }
    }
}

if ($stopped -gt 0) {
    Write-Host "    تم إيقاف $stopped نسخة قديمة." -ForegroundColor Green
    Start-Sleep -Seconds 2   # مهلة ليتحرّر المنفذ
} else {
    Write-Host "    لا توجد نسخة عاملة (جو متوقّف أصلاً)." -ForegroundColor DarkGray
}

# --- [4/4] البناء والتشغيل --------------------------------------------------
# start-joe.ps1 يتكفّل ببناء الخادم والواجهة معاً ثم تشغيل جو.
Write-Host "`n[4/4] بناء جو وتشغيله..." -ForegroundColor Yellow
Write-Host "      بعد ظهور رابط التشغيل، افتح المتصفح واضغط Ctrl+Shift+R" -ForegroundColor DarkGray
Write-Host "      (تحديث قوي حتى لا يعرض المتصفح واجهة قديمة من ذاكرته)`n" -ForegroundColor DarkGray

& "$PSScriptRoot\start-joe.ps1"
