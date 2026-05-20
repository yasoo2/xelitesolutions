#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Joe Enterprise - Emergency Deployment Fix
# إصلاح طوارئ لنظام الدبلوي - يعمل مباشرة على السيرفر
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_PATH="/root/xelitesolutions"
API_PATH="$PROJECT_PATH/api"
WEB_PATH="$PROJECT_PATH/web"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}

log_step() {
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

# ═══════════════════════════════════════════════════════════════════
log_step "🚨 إصلاح طوارئ نظام الدبلوي"
# ═══════════════════════════════════════════════════════════════════

log_info "المسار: $PROJECT_PATH"
log_info "API: $API_PATH"
log_info "Web: $WEB_PATH"

# ═══════════════════════════════════════════════════════════════════
log_step "📥 خطوة 1: سحب آخر كود من GitHub"
# ═══════════════════════════════════════════════════════════════════

cd "$PROJECT_PATH" || {
    log_error "لا يمكن الوصول إلى $PROJECT_PATH"
    exit 1
}

# Configure git
git config --global --add safe.directory "$PROJECT_PATH" 2>/dev/null || true

# Get current commits
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
log_info "الإصدار المحلي الحالي: ${LOCAL_COMMIT:0:7}"

# Fetch and reset
git fetch origin main --force
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
log_info "إصدار GitHub: ${REMOTE_COMMIT:0:7}"

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log_success "الكود محدث، لكن سنعيد البناء للتأكد"
fi

# Hard reset to latest
git reset --hard origin/main
log_success "تم تحديث الكود إلى: ${REMOTE_COMMIT:0:7}"

# ═══════════════════════════════════════════════════════════════════
log_step "📁 خطوة 2: التحقق من وجود الملفات المُصلحة"
# ═══════════════════════════════════════════════════════════════════

if [ -f "$API_PATH/src/services/DeployManager.ts" ]; then
    # Check if it uses spawn
    if grep -q "spawn('bash'" "$API_PATH/src/services/DeployManager.ts" 2>/dev/null; then
        log_success "DeployManager.ts يستخدم spawn() - مُصلح"
    elif grep -q "exec(" "$API_PATH/src/services/DeployManager.ts" 2>/dev/null; then
        log_error "DeployManager.ts لا يزال يستخدم exec() - قديم!"
        log_info "سنقوم بتحديثه يدوياً..."
    else
        log_warn "لا يمكن التحقق من طريقة التنفيذ"
    fi
else
    log_error "DeployManager.ts غير موجود!"
fi

# ═══════════════════════════════════════════════════════════════════
log_step "🔧 خطوة 3: بناء API"
# ═══════════════════════════════════════════════════════════════════

cd "$API_PATH" || exit 1

log_info "حذف node_modules القديمة..."
rm -rf node_modules package-lock.json

log_info "تثبيت الاعتماديات..."
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/root/.nvm/versions/node/v20/bin:$PATH"

if npm install --legacy-peer-deps --no-audit --no-fund; then
    log_success "تم تثبيت الاعتماديات"
else
    log_error "فشل تثبيت الاعتماديات"
    exit 1
fi

log_info "بناء API..."
if npm run build; then
    log_success "تم بناء API بنجاح"
else
    log_warn "فشل npm run build، محاولة بـ tsc..."
    if npx tsc; then
        log_success "تم بناء API بـ tsc"
    else
        log_error "فشل البناء بالكامل"
        exit 1
    fi
fi

# ═══════════════════════════════════════════════════════════════════
log_step "🌐 خطوة 4: بناء Web Frontend (اختياري)"
# ═══════════════════════════════════════════════════════════════════

cd "$WEB_PATH" || {
    log_warn "لا يمكن الوصول إلى Web، سيتم تخطيها"
}

if [ -d "$WEB_PATH" ]; then
    log_info "تثبيت اعتماديات Web..."
    npm install --legacy-peer-deps --no-audit --no-fund 2>/dev/null || {
        log_warn "فشل تثبيت Web dependencies"
    }

    log_info "بناء Web..."
    npm run build 2>/dev/null || {
        log_warn "فشل بناء Web، لكن API يعمل"
    }
fi

# ═══════════════════════════════════════════════════════════════════
log_step "🔄 خطوة 5: إعادة تشغيل السيرفر"
# ═══════════════════════════════════════════════════════════════════

log_info "إعادة تشغيل السيرفر عبر systemctl..."
sudo systemctl restart joe-api.service

log_success "تم إرسال أمر إعادة التشغيل لنظام systemd"
sleep 5

# ═══════════════════════════════════════════════════════════════════
log_step "🔍 خطوة 6: التحقق من الصحة"
# ═══════════════════════════════════════════════════════════════════

HEALTH_URL="http://localhost:8080/api/health"
RETRIES=10
INTERVAL=2

log_info "فحص الصحة على $HEALTH_URL..."

for i in $(seq 1 $RETRIES); do
    if curl -s -f "$HEALTH_URL" >/dev/null 2>&1; then
        log_success "✅ السيرفر يعمل بشكل صحيح!"

        # Show version info if available
        VERSION_INFO=$(curl -s "$HEALTH_URL" 2>/dev/null || echo "")
        if [ -n "$VERSION_INFO" ]; then
            log_info "معلومات الإصدار: $VERSION_INFO"
        fi

        # Save stable commit
        echo "$REMOTE_COMMIT" > "$PROJECT_PATH/last_stable_commit"

        # ═══════════════════════════════════════════════════════════
        log_step "🎉 تم الإصلاح بنجاح!"
        # ═══════════════════════════════════════════════════════════

        echo ""
        echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║         ✅ تم إصلاح نظام الدبلوي بنجاح!                   ║${NC}"
        echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        log_info "الإصدار الجديد: ${REMOTE_COMMIT:0:7}"
        log_info "تم تشغيل نظام systemd بنجاح"
        log_info "اللوجز: sudo journalctl -u joe-api.service -n 100 -f"
        log_info ""
        log_info "الآن عند دفع أي تحديث جديد، سيتم نشره تلقائياً (عبر systemd)!"

        exit 0
    fi

    log_warn "محاولة $i/$RETRIES... انتظار ${INTERVAL}s"
    sleep $INTERVAL
done

log_error "❌ فشل فحص الصحة بعد $RETRIES محاولات"
log_info "اللوجز: sudo journalctl -u joe-api.service -n 200 --no-pager"
exit 1
