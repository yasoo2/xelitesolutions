#!/usr/bin/env bash
# ============================================================
# update-joe.sh — تحديث جو وتشغيله بأمر واحد (لينكس/ماك)
#
# التوأم اللينكسي لـ update-joe.ps1. يفعل الشيء نفسه بالترتيب نفسه:
#   0) يحمي ملفاتك قبل السحب (نفس السكربت: scripts/joe-data-guard.js)
#   1) يسحب آخر تحديث
#   2) يُرجع أي ملف من ملفاتك حذفه السحب
#   3) يوقف النسخة القديمة على المنفذ
#   4) يبني ويشغّل
#
# يُستدعى أيضاً من زر «تحديث جو» داخل الواجهة، ولذلك لا يسأل أي سؤال:
# لا أحد هناك ليجيب.
# ============================================================
set -uo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-5002}"
GUARD="scripts/joe-data-guard.js"

echo "============================================"
echo "  تحديث جو وتشغيله"
echo "============================================"

# --- [0/4] حماية ملفاتك -----------------------------------------------------
[ -f "$GUARD" ] && node "$GUARD" snapshot

# --- [1/4] سحب آخر تحديث ---------------------------------------------------
echo ""
echo "[1/4] سحب آخر تحديث من GitHub..."
before="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
pull_output="$(git pull origin main 2>&1)"; pull_code=$?
echo "$pull_output"

if [ $pull_code -ne 0 ]; then
    # الشبكة المقطوعة ليست تعارضاً في التاريخ — الدرس نفسه المكتوب في النسخة الويندوزية.
    if echo "$pull_output" | grep -qiE 'could not resolve host|unable to access|connection timed out|could not read from remote|failed to connect|network is unreachable'; then
        echo "[!] لا يوجد اتصال بالإنترنت — سأشغّل النسخة الحالية كما هي."
    else
        echo "[!] فشل السحب — سأجعل نسختك مطابقة لما على GitHub."
        git stash push -u -m "joe-backup-$(date +%Y%m%d-%H%M%S)" >/dev/null 2>&1 || true
        git fetch origin && git reset --hard origin/main
    fi
fi

# --- [2/4] إرجاع ما قد يكون السحب حذفه --------------------------------------
[ -f "$GUARD" ] && node "$GUARD" restore

after="$(git rev-parse --short HEAD 2>/dev/null || echo '?')"
echo ""
echo "[2/4] آخر تحديث لديك الآن:"
git --no-pager log --oneline -1
if [ "$before" = "$after" ]; then echo "    (لا جديد — نسختك محدّثة أصلاً)"; else echo "    تم التحديث: $before -> $after"; fi

# --- [3/4] إيقاف النسخة القديمة --------------------------------------------
echo ""
echo "[3/4] إيقاف نسخة جو القديمة (المنفذ $PORT)..."
# بلا أدوات إضافية: نقرأ أصحاب المنفذ من /proc إن لم يوجد lsof.
pids="$(lsof -t -i:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$pids" ]; then
    echo "$pids" | xargs -r kill -9 2>/dev/null || true
    echo "    تم الإيقاف."
    sleep 1
else
    echo "    لا توجد نسخة عاملة."
fi

# --- [4/4] البناء والتشغيل --------------------------------------------------
echo ""
echo "[4/4] بناء جو وتشغيله..."
( cd api && npm run build ) || { echo "[X] فشل بناء الخادم."; exit 1; }
( cd web && npm run build ) || { echo "[X] فشل بناء الواجهة."; exit 1; }

echo "[OK] التحديث اكتمل — جو يعود الآن (المنفذ $PORT)"
exec node api/dist/index.js
