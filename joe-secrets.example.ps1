# ============================================================
# joe-secrets.example.ps1 — قالب أسرار جو
# ------------------------------------------------------------
# انسخ هذا الملف وسمِّه:  joe-secrets.ps1  (بجانب start-joe.ps1)
# ثم ضع مفاتيحك الحقيقية بالأسفل. ملف joe-secrets.ps1 مُتجاهَل في .gitignore،
# فلا يُرفع إلى GitHub ولا يُمسح عند git pull / git checkout — يبقى للأبد.
#
# بعد إنشائه، شغّل .\start-joe.ps1 كالمعتاد؛ سيُحمّل تلقائياً.
# ============================================================

# --- Google (البريد / التقويم / Drive) ---
$env:GOOGLE_CLIENT_ID = "ضع_الClient_ID_هنا.apps.googleusercontent.com"
$env:GOOGLE_CLIENT_SECRET = "ضع_الClient_Secret_هنا"

# --- أضف أي أسرار أخرى هنا لاحقاً (Microsoft، مزوّدات LLM، إلخ) ---
# $env:OPENAI_API_KEY = "..."
# $env:GROQ_API_KEY = "..."
