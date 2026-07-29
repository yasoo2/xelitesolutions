# ============================================================
# start-joe.ps1 — تشغيل Joe محلياً على المنفذ 5002 (ويندوز)
# بلا مفتاح: يستخدم Ollama تلقائياً إن كان مُشغّلاً، وإلا الذكاء المجاني (LLM7 / Pollinations)
# يثبّت متصفح Chromium تلقائياً أول مرّة، ويعيد التشغيل تلقائياً عند الانهيار
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

# --- متصفح جو ---
# متصفح جو الداخلي (الذي يبحث ويتصفّح تلقائياً) يستخدم Chromium المرفق — موثوق ولا
# يتعارض مع متصفحك المفتوح. أمّا "متصفحك الشخصي الحقيقي" داخل جو فيأتي عبر إضافة
# Joe Browser Connector وزر «🧩 متصفحي» (لا يحتاج إغلاق Chrome إطلاقاً).
# ملاحظة: USE_USER_BROWSER_PROFILE=1 يفتح Chrome الحقيقي مباشرةً، لكنه يفشل إن كان
# Chrome مفتوحاً (المتصفح يقفل الملف). لذلك نتركه "0" ونعتمد على الإضافة.
$env:USE_USER_BROWSER_PROFILE = "0"  # 1 = يفتح Chrome الحقيقي (يتطلب إغلاق Chrome أولاً)
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
    Write-Host "[secrets] تم تحميل joe-secrets.ps1" -ForegroundColor Green
} else {
    Write-Host "[secrets] لا يوجد joe-secrets.ps1 (انسخ joe-secrets.example.ps1 واملأه لتفعيل Google)." -ForegroundColor DarkYellow
}

# --- دماغ Groq السحابي (مجاني وسريع، Llama 3.3 70B) ---
# إن وضعت $env:GROQ_API_KEY في joe-secrets.ps1 يصبح Groq الدماغ الأساسي لجو: يُجرَّب
# أولاً (خلال ثوانٍ) قبل أي نموذج محلي، فيعمل الوكيل بذكاء عالٍ رغم ضعف الجهاز. النموذج
# المحلي (إن وُجد) يبقى احتياطاً عند انقطاع الإنترنت. لا نُجبر «المحلي الحصري» حينها.
if ($env:GROQ_API_KEY -and $env:GROQ_API_KEY.Trim().StartsWith("gsk_")) {
    Write-Host "[brain] Groq متصل — الدماغ الأساسي (Llama 3.3 70B، سريع وذكي). المحلي احتياطي." -ForegroundColor Green
    $env:LOCAL_LLM_STRICT = "0"
} elseif ($env:GROQ_API_KEY) {
    Write-Host "[brain] تحذير: GROQ_API_KEY موجود لكنه لا يبدأ بـ gsk_ — تأكّد أنك نسخت المفتاح كاملاً." -ForegroundColor DarkYellow
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
            if ($visionPick) { $env:LOCAL_VISION_MODEL = $visionPick; Write-Host "[vision] نموذج رؤية متصل: $visionPick" -ForegroundColor Green }
        }
        # استخدم Ollama حصرياً حتى لا يضيّع جو الوقت في مزوّدين مجّانيين فاشلين، مع مهلة
        # كافية لأول طلب (تحميل النموذج) ثم يبقى محمّلاً.
        if (-not $env:LOCAL_LLM_STRICT)  { $env:LOCAL_LLM_STRICT = "1" }
        if (-not $env:LOCAL_LLM_TIMEOUT) { $env:LOCAL_LLM_TIMEOUT = "90000" }
        Write-Host "[brain] Ollama متصل — سيستخدمه جو حصرياً (النموذج: $($env:LOCAL_LLM_MODEL))" -ForegroundColor Green
    } catch {
        Write-Host "[brain] Ollama غير مُشغّل — سيعمل جو على الذكاء المجاني عبر الإنترنت." -ForegroundColor DarkYellow
        Write-Host "        (لجهاز خفيف بلا كرت شاشة، الأسرع: ollama pull qwen2.5:3b — قرارات أسرع بلا تجمّد)" -ForegroundColor DarkGray
    }
}

# --- ضمان المتصفح السريع ---
# نُجبر إيقاف Chrome النظامي والملف الدائم لأنهما يفتحان Chrome كاملاً (بطيء وقد يتعارض).
# متصفح جو الداخلي (Chromium الخفيف) أسرع وأكثر ثباتاً؛ و«متصفحك الشخصي» يأتي عبر الإضافة.
# (يُطبَّق بعد تحميل الأسرار ليتجاوز أي إعداد بطيء قديم.)
$env:USE_SYSTEM_CHROME = "0"
$env:BROWSER_PERSISTENT_PROFILE = "0"
$env:USE_USER_BROWSER_PROFILE = "0"

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

# [1b/3] تثبيت محرّك المتصفح (Chromium) الذي يستخدمه جو للتصفّح — مرّة واحدة فقط.
# نعلّم بملف صغير حتى لا يُعاد التثبيت كل تشغيل. بدونه قد تظهر رسالة browser_launch_failed.
$pwMarker = "$apiDir\.playwright-chromium-installed"
if (-not (Test-Path $pwMarker)) {
    Write-Host "`n[1b/3] Installing Joe's browser engine (Chromium) — first run only, قد يأخذ دقيقة..." -ForegroundColor Yellow
    npx playwright install chromium
    if ($LASTEXITCODE -eq 0) {
        New-Item -ItemType File -Path $pwMarker -Force | Out-Null
        Write-Host "[1b/3] Browser engine ready" -ForegroundColor Green
    } else {
        Write-Host "[!] تعذّر تثبيت Chromium الآن (قد يكون انقطاع إنترنت). سيُعاد المحاولة في التشغيل القادم." -ForegroundColor Red
    }
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
