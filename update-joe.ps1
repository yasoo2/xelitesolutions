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

# ============================================================
#  لماذا كان git يطبع كتلة خطأ حمراء في كل تحديث؟
#
#  git يكتب تقدّمه («From https://github.com/...») على stderr لا stdout —
#  وهذا طبيعي تماماً وليس خطأ. لكن PowerShell يحوّل أي كتابة على stderr من
#  أمر أصلي إلى ErrorRecord، فيطبع NativeCommandError مع رقم السطر ويبدو
#  كأن التحديث فشل بينما هو ناجح.
#
#  الحل الرسمي من Git for Windows: أخبر git نفسه أن يكتب كل شيء على stdout.
# ============================================================
$env:GIT_REDIRECT_STDERR = '2>&1'

# ============================================================
#  ولماذا كانت العربية والرموز تصل مشوّهة («≡اأ JOE API STARTUP»)؟
#
#  node يكتب بترميز UTF-8، وصفحة ترميز الطرفية على ويندوز افتراضياً ليست
#  UTF-8 — فتُقرأ البايتات على أنها ترميز آخر وتخرج طلاسم. أسطر PowerShell
#  نفسها كانت تظهر سليمة، وهو ما جعل السبب يبدو غامضاً: المشكلة في قراءة
#  مخرجات العمليات الأخرى لا في الكتابة.
# ============================================================
try {
    # chcp أداة طرفية تحتاج نافذة console. حين يشغّلنا جو من الزر لا توجد
    # نافذة أصلاً، فاستدعاؤها في أحسن الأحوال بلا فائدة — والترميز يُضبط
    # من .NET مباشرةً وهو ما يهمّ فعلاً لملف السجل.
    if ($env:JOE_UNATTENDED -ne '1') { $null = chcp 65001 }
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

# ============================================================
#  السطر الذي تراه في زر «تحديث جو» داخل الواجهة.
#
#  Write-Host يكتب إلى «مضيف» PowerShell لا إلى المخرَج القياسي. وحين يشغّل
#  جو نفسه من الزر تكون العملية منفصلة بلا نافذة ولا مضيف، فتذهب كل أسطر
#  التقدّم إلى العدم: السجل يبقى فارغاً والمستخدم يرى نقاطاً فقط. هذا هو
#  سبب «لا يظهر تقدم التحديث» بالحرف.
#
#  فالآن كل سطر يُكتب مرّتين: على الشاشة كما كان، وفي ملف السجل الذي تقرأه
#  الواجهة — بترميز UTF8 صراحةً حتى تصل العربية سليمة.
# ============================================================
function Say {
    param([string]$msg, [string]$color)
    # ============================================================
    #  «نصف ساعه ولم يتم تحديث النظام» — والسجل سطرٌ واحد كتبه جو نفسه.
    #
    #  المحاولة السابقة كانت تفتح ملف السجل بمقبض ثانٍ من داخل PowerShell
    #  بينما المقبض الأول (المفتوح من جو) هو المخرَج القياسي لهذه العملية.
    #  مقبضان على ملف واحد من عمليتين على ويندوز: أيّ تعثّر في المشاركة أو
    #  الصلاحيات يبتلعه catch بصمت، فيبقى السجل فارغاً والشاشة عالقة على
    #  «الخطوة 1 من 4» إلى الأبد. الاعتماد على قناة يمكن أن تفشل بصمت هو
    #  الخطأ نفسه مهما تكرّرت محاولات إصلاحه.
    #
    #  المخرَج القياسي ليس قناة ثانية: جو وجّهه أصلاً إلى ملف السجل، وهو
    #  يعمل بلا نافذة ولا مضيف ولا مشاركة ملفات. Write-Host وحده كان يذهب
    #  إلى العدم لأنه يكتب إلى «المضيف» — والعملية المنفصلة بلا مضيف.
    #
    #  فحين يشغّلنا جو: سطرٌ على المخرَج القياسي، مطرودٌ فوراً.
    #  وحين تشغّلنا أنت: نفس الأسطر ملوّنة كما كانت.
    # ============================================================
    if ($env:JOE_UNATTENDED -eq '1') {
        # القناة الأولى: المخرَج القياسي — وجّهه جو إلى ملفٍ يخصّه وحده.
        $wrote = $false
        try {
            [Console]::Out.WriteLine($msg)
            [Console]::Out.Flush()
            $wrote = $true
        } catch { }
        # القناة الثانية: ملفُّنا نحن، وحدنا نكتب فيه — تُستعمل فقط إن تعطّلت
        # الأولى. قناتان في ملفين مختلفين: لا مقبضان على ملفٍ واحد أبداً، ولا
        # صمتٌ إن سقطت إحداهما.
        if (-not $wrote -and $env:JOE_UPDATE_LOG) {
            try {
                $fs = [System.IO.File]::Open($env:JOE_UPDATE_LOG, [System.IO.FileMode]::Append,
                    [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg + "`r`n")
                $fs.Write($bytes, 0, $bytes.Length)
                $fs.Flush(); $fs.Close()
            } catch { }
        }
    } elseif ($color) {
        Write-Host $msg -ForegroundColor $color
    } else {
        Write-Host $msg
    }
}

# لا تسأل أحداً حين لا يوجد أحد: حين يشغّل جو نفسه من زر «تحديث جو» داخل
# الواجهة تكون العملية منفصلة بلا نافذة، وأي Read-Host هناك يعلّق التحديث
# للأبد بانتظار ضغطة لا يستطيع أحد إعطاءها.
function Wait-ForUser($msg) {
    if ($env:JOE_UNATTENDED -eq '1') { Say $msg DarkGray }
    else { Read-Host $msg | Out-Null }
}

Say "============================================" Cyan
Say "  تحديث جو وتشغيله" Cyan
Say "============================================" Cyan

# --- [0/4] حماية ملفاتك -----------------------------------------------------
# كنتَ تُطالَب بنسخ مجلد uploads يدوياً قبل كل تحديث وإرجاعه بعده. خطوة أمان
# يجب أن يتذكّرها الإنسان ليست خطوة أمان. صارت آلية: السكربت يسأل git عن
# ملفاتك التي يمسكها فيحفظها وحدها (وغالباً لا يمسك أياً منها، فلا تكلفة)،
# ثم يعيد بعد السحب كل ملف اختفى. لا شيء عليك أن تكتبه.
$guard = Join-Path $PSScriptRoot "scripts\joe-data-guard.js"
if (Test-Path $guard) { node $guard snapshot }

# --- [1/4] سحب آخر تحديث ---------------------------------------------------
Say "[STAGE] pulling"
Say "`n[1/4] سحب آخر تحديث من GitHub..." Yellow

$before = (git rev-parse --short HEAD 2>$null)
# نلتقط مخرجات السحب لنميّز بين نوعي الفشل — درس من عطل حقيقي: انقطاع
# الإنترنت (Could not resolve host) عولج خطأً كتعارض تاريخ، فجرى stash
# و reset --hard بلا داعٍ. الشبكة المقطوعة ليست تعارضاً.
$pullOutput = (git pull origin main 2>&1 | Out-String)
Say $pullOutput
$pullFailed = ($LASTEXITCODE -ne 0)
$isNetworkFailure = $pullFailed -and ($pullOutput -match 'Could not resolve host|unable to access|Connection timed out|Could not read from remote|Failed to connect|Network is unreachable|SSL_ERROR|Recv failure')

if ($isNetworkFailure) {
    Say "`n[!] لا يوجد اتصال بالإنترنت (أو GitHub غير متاح الآن)." Yellow
    Say "    لن أغيّر شيئاً في نسختك — سأشغّل النسخة الحالية كما هي." Yellow
    Say "    أعد تشغيل update-joe.ps1 حين يعود الاتصال لتحصل على آخر تحديث." DarkGray
} elseif ($pullFailed) {
    Say "`n[!] فشل السحب العادي (غالباً بسبب تعارض في التاريخ)." Red
    Say "    سأجعل نسختك مطابقة تماماً لما على GitHub." Yellow

    # حماية: إن كان لديك تعديلات محلية غير محفوظة، نحفظها جانباً بدل إتلافها
    $dirty = (git status --porcelain)
    if ($dirty) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        Say "    لديك تعديلات محلية — سأحفظها في stash باسم joe-backup-$stamp" Yellow
        git stash push -u -m "joe-backup-$stamp" | Out-Null
        Say "    (لاستعادتها لاحقاً: git stash list  ثم  git stash pop)" DarkGray
    }

    git fetch origin
    git reset --hard origin/main
    if ($LASTEXITCODE -ne 0) {
        Say "[X] تعذّر التحديث. تحقّق من اتصال الإنترنت ثم أعد المحاولة." Red
        Wait-ForUser "اضغط Enter للخروج"
        exit 1
    }
}

# إرجاع أي ملف من ملفاتك حذفه السحب — قبل أي شيء آخر، حتى لو فشل الباقي.
if (Test-Path $guard) { node $guard restore }

# --- [2/4] التحقق من نجاح السحب --------------------------------------------
$after = (git rev-parse --short HEAD 2>$null)
Say "`n[2/4] آخر تحديث لديك الآن:" Yellow
# --no-pager: بدونها يفتح git قارئ صفحات (END) ويعلّق السكربت حتى يضغط
# المستخدم q — حدث فعلاً وتوقف التحديث في منتصفه.
git --no-pager log --oneline -1

if ($before -eq $after) {
    Say "    (لا جديد — نسختك محدّثة أصلاً)" DarkGray
} else {
    Say "    تم التحديث: $before -> $after" Green
}

# --- [3/4] إيقاف نسخة جو القديمة -------------------------------------------
# بدون هذه الخطوة يبقى الخادم القديم محمّلاً في الذاكرة، فتظن أن التحديث لم يعمل.
Say "[STAGE] stopping"
Say "`n[3/4] إيقاف نسخة جو القديمة (المنفذ 5002)..." Yellow

$stopped = 0
try {
    $conns = Get-NetTCPConnection -LocalPort 5002 -State Listen -ErrorAction Stop
    foreach ($c in $conns) {
        try {
            Stop-Process -Id $c.OwningProcess -Force -ErrorAction Stop
            $stopped++
        } catch {
            Say "    تعذّر إيقاف العملية $($c.OwningProcess): $($_.Exception.Message)" DarkYellow
        }
    }
} catch {
    # ويندوز قديم أو الأمر غير متاح — نرجع إلى netstat بهدوء (بلا رسائل خطأ مزعجة)
    try {
        $lines = @(netstat -ano 2>$null | Select-String ":5002\s.*LISTENING")
    } catch {
        $lines = @()
    }
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
    Say "    تم إيقاف $stopped نسخة قديمة." Green
    Start-Sleep -Seconds 2   # مهلة ليتحرّر المنفذ
} else {
    Say "    لا توجد نسخة عاملة (جو متوقّف أصلاً)." DarkGray
}

# --- [4/4] البناء والتشغيل --------------------------------------------------
# start-joe.ps1 يتكفّل ببناء الخادم والواجهة معاً ثم تشغيل جو.
# ============================================================
#  لا تُعِد بناء ما لم يتغيّر.
#
#  «بطيء جدا» — وكان محقاً: كل ضغطة على الزر تعيد بناء الخادم والواجهة
#  حتى حين لا يجلب السحب أي جديد، أي دقيقتان مقابل لا شيء. حين يكون
#  الهاش كما هو والبناء السابق موجوداً، نتخطّى البناء ونشغّل مباشرة.
# ============================================================
$skipBuild = ($before -eq $after) -and
             (Test-Path (Join-Path $PSScriptRoot "api\dist\index.js")) -and
             (Test-Path (Join-Path $PSScriptRoot "web\dist\index.html"))
if ($skipBuild) {
    $env:JOE_SKIP_BUILD = "1"
    Say "[STAGE] building"
    Say "`n[4/4] لا جديد — أتخطّى البناء وأشغّل جو مباشرة." Green
} else {
    Remove-Item Env:\JOE_SKIP_BUILD -ErrorAction SilentlyContinue
    Say "[STAGE] building"
    Say "`n[4/4] بناء جو وتشغيله..." Yellow
}
Say "      بعد ظهور رابط التشغيل، افتح المتصفح واضغط Ctrl+Shift+R" DarkGray
Say "      (تحديث قوي حتى لا يعرض المتصفح واجهة قديمة من ذاكرته)`n" DarkGray

# Join-Path بدل الشرطة المائلة اليدوية: يعمل على أي نظام، ويسمح باختبار السكربت.
$startScript = Join-Path $PSScriptRoot "start-joe.ps1"
if (-not (Test-Path $startScript)) {
    # بلا هذا الفحص تظهر رسالة غامضة عن "module could not be loaded" لا تدل على السبب.
    Say "[X] لم أجد start-joe.ps1 بجوار هذا السكربت." Red
    Say "    تأكّد أنك تشغّل update-joe.ps1 من داخل مجلد المشروع." Yellow
    Wait-ForUser "اضغط Enter للخروج"
    exit 1
}

& $startScript
