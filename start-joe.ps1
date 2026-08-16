# ============================================================
# start-joe.ps1 — تشغيل Joe محلياً على المنفذ 5002 (ويندوز)
# بلا مفتاح: يستخدم Ollama تلقائياً إن كان مُشغّلاً، وإلا الذكاء المجاني (LLM7 / Pollinations)
# يثبّت متصفح Chromium تلقائياً أول مرّة، ويعيد التشغيل تلقائياً عند الانهيار
# التشغيل:  انقر بزر الفأرة الأيمن على الملف -> "Run with PowerShell"
#           أو من PowerShell:  ./start-joe.ps1
# ============================================================

# --- الوضع المحلي أحادي المستخدم (بلا قاعدة بيانات وبلا تسجيل دخول) ---
# مخرجات node بترميز UTF-8: بدون هذه الأسطر تصل العربية والرموز مشوّهة
# إلى الطرفية («ظأبي╕ JSON Persistence mode»).
try {
    # chcp تحتاج نافذة console — ولا نافذة حين يشغّلنا زر «تحديث جو».
    if ($env:JOE_UNATTENDED -ne '1') { $null = chcp 65001 }
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }
$env:GIT_REDIRECT_STDERR = '2>&1'

$env:PORT = "5002"
$env:JWT_SECRET = "dev-secret-joe-local"
$env:PERSISTENCE_MODE = "JSON"     # حفظ في ملفات JSON بدل MongoDB
$env:MOCK_DB = "true"              # لا حاجة لقاعدة بيانات
$env:ENABLE_AUTH_BYPASS = "true"   # مستخدم واحد: الأدوات تعمل بلا تسجيل دخول
$env:AUTO_APPROVE_ALL = "1"        # موافقة تلقائية على تنفيذ الأدوات
$env:NODE_ENV = "development"

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
    #  المخرَج القياسي هو ملف السجل حين يشغّلنا جو — لا حاجة لمقبض ثانٍ.
    #
    #  المقبض الثاني على ويندوز كان يفشل بصمت داخل catch، فيبقى السجل سطراً
    #  واحداً والشاشة عالقة على «الخطوة 1 من 4» نصف ساعة. القناة التي وجّهها
    #  جو بنفسه لا تحتاج مشاركة ملفات ولا مضيفاً ولا نافذة.
    # ============================================================
    if ($env:JOE_UNATTENDED -eq '1') {
        # ملفُّنا نحن، ونحن وحدنا نكتب فيه — لا يعتمد على مقبضٍ ورثناه من جو
        # ولا على مضيفٍ ولا على نافذة. هذه هي القناة التي تحمل التقدّم.
        if ($env:JOE_UPDATE_LOG) {
            try {
                $fs = [System.IO.File]::Open($env:JOE_UPDATE_LOG, [System.IO.FileMode]::Append,
                    [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite)
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($msg + "`r`n")
                $fs.Write($bytes, 0, $bytes.Length)
                $fs.Flush(); $fs.Close()
                $wrote = $true
            } catch { $wrote = $false }
        } else { $wrote = $false }
        # وإن تعذّر ذلك: المخرَج القياسي، الذي وجّهه جو إلى ملفٍ آخر منفصل.
        # ملفان مختلفان، فلا يلتقي كاتبان على مقبضٍ واحد أبداً.
        if (-not $wrote) {
            try { [Console]::Out.WriteLine($msg); [Console]::Out.Flush() } catch { }
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

# --- متصفح جو ---
# متصفحك الحقيقي هو المسار الافتراضي للوكيل: يفتح جو Chrome/Edge بحساباتك
# وجلساتك، فيمرّ من الصفحات التي تطلب تسجيل دخول بلا أن تسجّل شيئاً.
# كان هذا معطّلاً لأن Chrome يقفل ملفه الشخصي وهو مفتوح؛ صار جو الآن ينسخ ملفات
# تسجيل الدخول وحدها إلى مجلد يملكه ويفتح نسخةً بجانب نافذتك — لا تُغلق شيئاً.
# وإن لم يجد Chrome أصلاً، يعود تلقائياً إلى Chromium المرفق. اجعله "0" إن أردت
# الاعتماد على إضافة Joe Browser Connector وزر «🧩 متصفحي» بدلاً من ذلك.
$env:USE_USER_BROWSER_PROFILE = "1"  # 0 = Chromium المرفق فقط
$env:BROWSER_HEADED = "0"            # بلا نافذة خارجية — كل شيء داخل لوحة جو

# --- الأسرار الخاصة بك (لا تُرفع إلى GitHub، لا تُمسح عند git pull) ---
# ضع مفاتيحك (Google، إلخ) في ملف joe-secrets.ps1 بجانب هذا الملف. إنه مُتجاهَل
# في .gitignore، فيبقى محفوظاً للأبد. انسخ joe-secrets.example.ps1 وسمِّه
# joe-secrets.ps1 واملأه مرّة واحدة. مثال محتواه:
#   $env:GOOGLE_CLIENT_ID = "....apps.googleusercontent.com"
#   $env:GOOGLE_CLIENT_SECRET = "GOCSPX-...."
$secretsFile = "$PSScriptRoot\joe-secrets.ps1"
if (Test-Path $secretsFile) {
    . $secretsFile
    Say "[secrets] تم تحميل joe-secrets.ps1" Green
} else {
    Say "[secrets] لا يوجد joe-secrets.ps1 (انسخ joe-secrets.example.ps1 واملأه لتفعيل Google)." DarkYellow
}

# --- دماغ Groq السحابي (مجاني وسريع، Llama 3.3 70B) ---
# إن وضعت $env:GROQ_API_KEY في joe-secrets.ps1 يصبح Groq الدماغ الأساسي لجو: يُجرَّب
# أولاً (خلال ثوانٍ) قبل أي نموذج محلي، فيعمل الوكيل بذكاء عالٍ رغم ضعف الجهاز. النموذج
# المحلي (إن وُجد) يبقى احتياطاً عند انقطاع الإنترنت. لا نُجبر «المحلي الحصري» حينها.
if ($env:GROQ_API_KEY -and $env:GROQ_API_KEY.Trim().StartsWith("gsk_")) {
    Say "[brain] Groq متصل — الدماغ الأساسي (Llama 3.3 70B، سريع وذكي). المحلي احتياطي." Green
    $env:LOCAL_LLM_STRICT = "0"
} elseif ($env:GROQ_API_KEY) {
    Say "[brain] تحذير: GROQ_API_KEY موجود لكنه لا يبدأ بـ gsk_ — تأكّد أنك نسخت المفتاح كاملاً." DarkYellow
}

# --- دماغ الذكاء المحلي (Ollama) — يُكتشف تلقائياً إن كان يعمل ---
# وكيل المتصفح يحتاج نموذجاً يقرّر خطواته. إن كان Ollama مُشغّلاً على جهازك، يستخدمه
# جو تلقائياً (أسرع وأكثر خصوصية). وإلا يعمل على الذكاء المجاني عبر الإنترنت.
if (-not $env:LOCAL_LLM_BASE_URL) {
    try {
        $tags = Invoke-RestMethod -Uri "http://localhost:11434/api/tags" -TimeoutSec 3 -ErrorAction Stop
        $env:LOCAL_LLM_BASE_URL = "http://localhost:11434"
        # اختيار النموذج الافتراضي (يُستخدم كخيار احتياطي؛ جو يوزّع تلقائياً: نموذج صغير
        # سريع للقرارات والمحادثة، و coder للبرمجة). على معالج لابتوب بلا كرت شاشة يكون
        # نموذج 3B أسرع بمرّتين-ثلاث من 7B ولا يتجمّد — لذلك نفضّله أولاً هنا.
        if (-not $env:LOCAL_LLM_MODEL) {
            $preferred = @("qwen2.5:3b", "llama3.2:3b", "qwen2.5:7b", "qwen2.5-coder:7b", "qwen2.5-coder:latest", "llama3.1", "llama3")
            $available = @($tags.models | ForEach-Object { $_.name })
            $pick = $null
            foreach ($p in $preferred) { if ($available -contains $p) { $pick = $p; break } }
            if (-not $pick -and $available.Count -gt 0) { $pick = $available[0] }
            if ($pick) { $env:LOCAL_LLM_MODEL = $pick }
        }
        # على جهاز ضعيف (بلا GPU) يُفضّل ألا تطول مهلة كل قرار حتى لا يبدو النظام متجمّداً؛
        # نموذج 3B يردّ عادةً خلال ثوانٍ، فمهلة 60 ثانية كافية وتُبقي الوكيل متجاوباً.
        if (-not $env:LOCAL_LLM_TIMEOUT -and ($env:LOCAL_LLM_MODEL -match ':3b|:1\.5b|:0\.5b|llama3\.2:3b')) {
            $env:LOCAL_LLM_TIMEOUT = "60000"
        }
        # نموذج الرؤية (اختياري): إن ثبّت llava / moondream / llama3.2-vision يكتشفه جو
        # تلقائياً ويستخدمه حين لا تُقرأ الصفحة نصياً (canvas/صور). للتثبيت: ollama pull llava
        if (-not $env:LOCAL_VISION_MODEL) {
            $available2 = @($tags.models | ForEach-Object { $_.name })
            $visionPick = $available2 | Where-Object { $_ -match 'llava|moondream|vision|minicpm-v|bakllava' } | Select-Object -First 1
            if ($visionPick) { $env:LOCAL_VISION_MODEL = $visionPick; Say "[vision] نموذج رؤية متصل: $visionPick" Green }
        }
        # استخدم Ollama حصرياً حتى لا يضيّع جو الوقت في مزوّدين مجّانيين فاشلين، مع مهلة
        # كافية لأول طلب (تحميل النموذج) ثم يبقى محمّلاً.
        if (-not $env:LOCAL_LLM_STRICT)  { $env:LOCAL_LLM_STRICT = "1" }
        if (-not $env:LOCAL_LLM_TIMEOUT) { $env:LOCAL_LLM_TIMEOUT = "90000" }
        if ($env:GROQ_API_KEY -and $env:GROQ_API_KEY.Trim().StartsWith("gsk_")) {
            # Groq is the primary brain; Ollama is only the OFFLINE backup. Do NOT
            # claim "exclusive local" here — that misled into thinking Joe runs on
            # the slow local model when Groq (fast) is actually first.
            Say "[brain] Ollama جاهز كاحتياط للطوارئ فقط — Groq هو الأساسي (النموذج المحلي: $($env:LOCAL_LLM_MODEL))" DarkGray
        } else {
            Say "[brain] Ollama متصل — سيستخدمه جو حصرياً (النموذج: $($env:LOCAL_LLM_MODEL))" Green
        }
    } catch {
        Say "[brain] Ollama غير مُشغّل — سيعمل جو على الذكاء المجاني عبر الإنترنت." DarkYellow
        Say "        (لجهاز خفيف بلا كرت شاشة، الأسرع: ollama pull qwen2.5:3b — قرارات أسرع بلا تجمّد)" DarkGray
    }
}

# --- ضمان مسار المتصفح ---
# يُطبَّق بعد تحميل الأسرار ليتجاوز أي إعداد قديم في joe-secrets.ps1.
# متصفحك الحقيقي هو الافتراضي (بنسخة من ملفك الشخصي حين يكون Chrome مفتوحاً)،
# ويسقط تلقائياً إلى Chromium المرفق إن لم يوجد Chrome. غيّر السطر الأخير إلى "0"
# إن أردت Chromium المرفق دائماً.
$env:USE_SYSTEM_CHROME = "0"
$env:BROWSER_PERSISTENT_PROFILE = "0"
$env:USE_USER_BROWSER_PROFILE = "1"

$apiDir = "$PSScriptRoot\api"

Say "============================================" Cyan
Say "  JOE - Local Free-AI Mode (no API key)" Cyan
Say "  http://localhost:5002/joe" Green
Say "============================================" Cyan

# التحقق من وجود Node
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Say "[X] Node.js غير مثبّت. ثبّته من https://nodejs.org ثم أعد المحاولة." Red
    Wait-ForUser "اضغط Enter للخروج"
    exit 1
}

Push-Location $apiDir

# [1/3] تثبيت التبعيات إن لزم
# الدرس المستفاد: فحص "هل node_modules موجود؟" وحده أوقع جو في حلقة انهيار لا
# تنتهي (Cannot find module 'adm-zip') — لأن التحديث أضاف تبعيات جديدة إلى
# package.json بينما node_modules قديم موجود، فتخطّى السكربت التثبيت.
# الحل الصحيح: نُقارن بصمة package.json الحالية ببصمة آخر تثبيت ناجح (ملف
# .dep-stamp). إن تغيّرت التبعيات في أي git pull، يُعاد التثبيت تلقائياً.
function Sync-Dependencies {
    param([string]$dir, [string]$label)
    $pkg = Join-Path $dir "package.json"
    $stampFile = Join-Path $dir ".dep-stamp"
    $currentHash = (Get-FileHash -Path $pkg -Algorithm SHA256).Hash
    $storedHash = if (Test-Path $stampFile) { (Get-Content $stampFile -Raw -ErrorAction SilentlyContinue).Trim() } else { "" }
    $needInstall = (-not (Test-Path (Join-Path $dir "node_modules"))) -or ($storedHash -ne $currentHash)
    if (-not $needInstall) {
        Say "`n[$label] Dependencies up to date." Green
        return $true
    }
    Say "`n[$label] Dependencies changed (or first run) — installing... قد يأخذ دقائق" Yellow
    npm install --no-audit --no-fund --legacy-peer-deps
    if ($LASTEXITCODE -ne 0) {
        Say "[X] فشل تثبيت التبعيات في $dir. راجع الأخطاء أعلاه." Red
        return $false
    }
    Set-Content -Path $stampFile -Value $currentHash -NoNewline
    Say "[$label] Dependencies installed." Green
    return $true
}

if (-not (Sync-Dependencies -dir $apiDir -label "1/3")) {
    Pop-Location; Wait-ForUser "اضغط Enter للخروج"; exit 1
}

# [1b/3] تثبيت محرّك المتصفح (Chromium) الذي يستخدمه جو للتصفّح — مرّة واحدة فقط.
# نعلّم بملف صغير حتى لا يُعاد التثبيت كل تشغيل. بدونه قد تظهر رسالة browser_launch_failed.
$pwMarker = "$apiDir\.playwright-chromium-installed"
if (-not (Test-Path $pwMarker)) {
    Say "`n[1b/3] Installing Joe's browser engine (Chromium) — first run only, قد يأخذ دقيقة..." Yellow
    npx playwright install chromium
    if ($LASTEXITCODE -eq 0) {
        New-Item -ItemType File -Path $pwMarker -Force | Out-Null
        Say "[1b/3] Browser engine ready" Green
    } else {
        Say "[!] تعذّر تثبيت Chromium الآن (قد يكون انقطاع إنترنت). سيُعاد المحاولة في التشغيل القادم." Red
    }
}

# [2/3] بناء الـ API (تظهر الأخطاء إن وُجدت)
if ($env:JOE_SKIP_BUILD -eq "1") {
    Say "[2/3] لا تغييرات — أستخدم البناء الحالي." DarkGray
} else {
Say "`n[2/3] Building API..." Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Say "[X] فشل البناء. راجع الأخطاء أعلاه." Red
    Pop-Location; Wait-ForUser "اضغط Enter للخروج"; exit 1
}
Say "[2/3] API built OK" Green
}

Pop-Location

# [2b/3] Build the web UI too. This MUST run after every git pull, otherwise the
# frontend stays stale and bugs like "the browser does nothing" or "sessions do
# not show" reappear even though the fixes were pulled.
$webDir = "$PSScriptRoot\web"
if (Test-Path $webDir) {
    Push-Location $webDir
    # نفس درس الـ API: تبعيات الواجهة تتغيّر مع التحديثات (مثل xterm-addon-search)
    # وتخطّي التثبيت يُفشل البناء ويُبقي واجهة قديمة تعمل بصمت.
    if (-not (Sync-Dependencies -dir $webDir -label "2b/3")) {
        Say "[!] تعذّر تثبيت تبعيات الواجهة — سيُحاول البناء بما هو موجود." Red
    }
    Say "`n[2b/3] Building Web UI (ensures the latest frontend fixes are live)..." Yellow
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Say "[!] Web build failed - starting with the last successful build." Red
    } else {
        Say "[2b/3] Web UI built OK" Green
    }
    Pop-Location
}

# العلامة التي يقرأها زر «تحديث جو» في الواجهة ليعرف أن البناء انتهى وأن
# الخادم على وشك العودة. تُطبع بعد البناء لا قبله، وإلا أعلنّا نجاحاً لم يحدث.
Say "[STAGE] starting"
Say "[OK] التحديث اكتمل — جو يعود الآن."

# [3/3] التشغيل مع إعادة تشغيل تلقائية + حارس حلقة الانهيار
# إن انهار جو فور الإقلاع ثلاث مرات متتالية (أقل من 15 ثانية لكل محاولة) فالعطل
# حتمي — إعادة التشغيل رقم 23 لن تصلح ما لم تصلحه رقم 2. نتوقف برسالة واضحة
# تشرح العلاج بدل حرق المعالج في حلقة لا نهائية.
$restartCount = 0
$fastCrashes = 0
# Long engineering runs retain recent evidence and may legitimately exceed
# Node's small default heap. Override on constrained machines with
# $env:JOE_NODE_MAX_OLD_SPACE_MB before running this script.
$nodeMaxOldSpaceMb = 1536
$parsedHeapSize = 0
if ($env:JOE_NODE_MAX_OLD_SPACE_MB -and [int]::TryParse($env:JOE_NODE_MAX_OLD_SPACE_MB, [ref]$parsedHeapSize) -and $parsedHeapSize -ge 512) {
    $nodeMaxOldSpaceMb = $parsedHeapSize
}
while ($true) {
    $restartCount++
    Say "`n[3/3] Starting Joe (attempt #$restartCount, V8 heap ${nodeMaxOldSpaceMb}MB)  ->  http://localhost:5002/joe" Yellow
    Push-Location $apiDir
    $startedAt = Get-Date
    node "--max-old-space-size=$nodeMaxOldSpaceMb" dist/index.js
    $exitCode = $LASTEXITCODE
    $aliveSeconds = ((Get-Date) - $startedAt).TotalSeconds
    Pop-Location

    if ($aliveSeconds -lt 15) { $fastCrashes++ } else { $fastCrashes = 0 }

    # علاج ذاتي: أول انهيار سريع سببه الأشيع تبعية ناقصة بعد تحديث —
    # نعيد التثبيت مرة واحدة تلقائياً قبل إعادة المحاولة بدل انتظار المستخدم.
    if ($fastCrashes -eq 1) {
        Say "`n[heal] انهيار سريع — أعيد تثبيت التبعيات احتياطاً (العلاج الأشيع)..." Yellow
        Push-Location $apiDir
        npm install --no-audit --no-fund --legacy-peer-deps
        if ($LASTEXITCODE -eq 0) {
            Set-Content -Path (Join-Path $apiDir ".dep-stamp") -Value (Get-FileHash -Path (Join-Path $apiDir "package.json") -Algorithm SHA256).Hash -NoNewline
        }
        Pop-Location
    }

    if ($fastCrashes -ge 3) {
        Say "`n============================================" Red
        Say "[X] جو انهار $fastCrashes مرات متتالية فور الإقلاع — التوقف عن إعادة المحاولة." Red
        Say "    السبب الأرجح: تبعيات ناقصة أو ملف تالف. جرّب بالترتيب:" Yellow
        Say "      1) cd $apiDir ; npm install --no-audit --no-fund --legacy-peer-deps" Yellow
        Say "      2) اقرأ رسالة الخطأ أعلاه (مثل Cannot find module '...' = تبعية ناقصة)" Yellow
        Say "      3) ثم أعد التشغيل: .\update-joe.ps1" Yellow
        Say "============================================" Red
        Wait-ForUser "اضغط Enter للخروج"
        exit 1
    }

    Say "`n[!] Joe stopped (exit code: $exitCode). Restarting in 3 seconds... (اضغط Ctrl+C للإيقاف)" Red

    # لماذا توقّف؟ تسع محاولات مرّت في سجلّ حقيقي دون سطر واحد يقول السبب.
    # جو صار يكتب سبب كل موت في data/crash.log، وهذا يعرضه هنا — حيث ينظر
    # المستخدم فعلاً — بدل أن يضيع مع الشاشة التي محتها المحاولة التالية.
    $crashLog = Join-Path $apiDir "data\crash.log"
    if (Test-Path $crashLog) {
        $stamp = (Get-Item $crashLog).LastWriteTime
        if ($stamp -ge $startedAt) {
            Say "`n--- سبب التوقّف (من $crashLog) ---" Yellow
            Get-Content $crashLog -Tail 20 | ForEach-Object { Say "    $_" Red }
            Say "--- نهاية السبب ---`n" Yellow
        } else {
            Say "    (لا سجلّ انهيار جديد — التوقّف جاء من خارج جو: إغلاق يدوي أو نفاد ذاكرة)" Yellow
        }
    } else {
        Say "    (لا يوجد data\crash.log بعد — إن تكرّر التوقّف فأرسل آخر ٣٠ سطراً من هذه الشاشة)" Yellow
    }

    Start-Sleep -Seconds 3
}
