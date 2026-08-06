# ============================================================
# diagnose-joe.ps1 — لماذا لا يتحرّك متصفّح جو على هذا الجهاز؟
#
#   «لم يتحرك متصفح جو مع انه في اللوجز يقول انه تم تشغيله … كل شي وهمي»
#
#   هذا السكربت يشغّل نفس الكود الذي يشغّله البناء، خطوة خطوة، ويطبع ما فعلته
#   كل خطوة فعلاً: هل أقلع كروميوم؟ هل قامت جلسة لوحة المتصفّح؟ هل استعارها
#   الفحص أم هرب إلى متصفّح خاصّ غير مرئي؟ ولماذا.
#
#   التشغيل:  ./diagnose-joe.ps1
#             أو: انقر بزر الفأرة الأيمن -> "Run with PowerShell"
#
#   ثم أرسل الملف:  joe-browser-diagnosis.txt
# ============================================================

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

# لماذا ظهر التقرير الأول كطلاسم («ظـظـظـ… ╪ز╪┤╪«┘è╪╡»)؟
# node يكتب بترميز UTF-8، وصفحة ترميز الطرفية في ويندوز ليست 65001 افتراضياً،
# فيُقرأ كل حرف عربي بايتاً بايتاً. هذه الأسطر الثلاثة تجعل الشاشة والملف
# يقرآن نفس الترميز الذي يكتب به جو.
try { chcp 65001 > $null } catch { }
try {
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

$report = Join-Path $PSScriptRoot "joe-browser-diagnosis.txt"
if (Test-Path $report) { Remove-Item $report -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "  تشخيص متصفّح جو — قد يستغرق دقيقة، ويفتح كروميوم فعلاً." -ForegroundColor Cyan
Write-Host "  التقرير سيُحفظ في: $report" -ForegroundColor DarkGray
Write-Host ""

Set-Location (Join-Path $PSScriptRoot "api")

# ts-node هو ما تستعمله بقية سكربتات المستودع، فلا حاجة لتنزيل أي شيء جديد.
# النتيجة تُعرض على الشاشة وتُكتب بترميز UTF-8 صريح — لا Tee-Object، لأنه يكتب
# بالترميز الافتراضي للنظام فيخرج الملف طلاسم.
$output = & npx ts-node --transpile-only src/tests/manual/diagnose_browser.ts 2>&1 |
    ForEach-Object { $line = "$_"; Write-Host $line; $line }
$output | Out-File -FilePath $report -Encoding utf8

Set-Location $PSScriptRoot

Write-Host ""
if (Test-Path $report) {
    Write-Host "  ✅ التقرير جاهز: $report" -ForegroundColor Green
    Write-Host "     أرسله كما هو — لا يحتوي مفاتيح ولا كلمات مرور." -ForegroundColor DarkGray
} else {
    Write-Host "  ❌ لم يُكتب التقرير — انسخ ما ظهر أعلاه في الشاشة وأرسله." -ForegroundColor Red
}
Write-Host ""
