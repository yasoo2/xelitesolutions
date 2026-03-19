#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
# Joe Enterprise - Auto-Deploy Setup
# إعداد الدبلوي التلقائي - يعمل مرة واحدة فقط
# ═══════════════════════════════════════════════════════════════════

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

PROJECT_PATH="/root/xelitesolutions"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_error() {
    echo -e "${RED}[✗]${NC} $1"
}

log_step() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════════${NC}"
}

log_step "🚀 إعداد الدبلوي التلقائي لـ Joe Enterprise"

# ═══════════════════════════════════════════════════════════════════
log_step "📥 تحميل سكربت الإصلاح الطارئ"
# ═══════════════════════════════════════════════════════════════════

cd /tmp
curl -fsSL https://raw.githubusercontent.com/yasoo2/xelitesolutions/main/emergency-fix.sh -o joe-emergency-fix.sh
chmod +x joe-emergency-fix.sh
log_success "تم تحميل سكربت الإصلاح"

# ═══════════════════════════════════════════════════════════════════
log_step "🔧 تشغيل الإصلاح الأولي"
# ═══════════════════════════════════════════════════════════════════

/tmp/joe-emergency-fix.sh || {
    log_error "فشل الإصلاح الأولي"
    exit 1
}

# ═══════════════════════════════════════════════════════════════════
log_step "⏰ إعداد Cron Job للدبلوي التلقائي"
# ═══════════════════════════════════════════════════════════════════

# Create cron job that checks for updates every 2 minutes
CRON_JOB="*/2 * * * * cd /root/xelitesolutions && curl -fsSL https://raw.githubusercontent.com/yasoo2/xelitesolutions/main/self-heal.sh -o /tmp/self-heal.sh && chmod +x /tmp/self-heal.sh && /tmp/self-heal.sh >> /tmp/joe-cron.log 2>&1"

# Add to crontab if not already exists
(crontab -l 2>/dev/null | grep -v "self-heal.sh"; echo "$CRON_JOB") | crontab -

log_success "تم إعداد Cron Job للدبلوي التلقائي (كل 2 دقيقة)"

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ تم إعداد الدبلوي التلقائي بنجاح!              ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
log_info "الآن النظام سيعمل تلقائياً:"
echo "  • فحص التحديثات: كل 2 دقيقة"
echo "  • الدبلوي التلقائي: عند اكتشاف تحديث جديد"
echo "  • ملاحظة: إعادة التشغيل التلقائي عند التعطل تتم الآن عبر PM2 بدلاً من Cron"
echo ""
log_info "لعرض اللوجز:"
echo "  tail -f /tmp/joe-cron.log"
echo "  npx pm2 logs joe-api"
echo ""
log_info "للتحقق من Cron Jobs:"
echo "  crontab -l"
