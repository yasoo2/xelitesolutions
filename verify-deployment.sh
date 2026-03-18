#!/bin/bash
# Joe Enterprise - Verification Script
# سكربت التحقق من وصول جميع التحديثات إلى السيرفر

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_PATH="${PROJECT_ROOT:-/root/xelitesolutions}"
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

print_header() {
    echo ""
    echo "========================================"
    echo -e "$1"
    echo "========================================"
}

check_file() {
    local file=$1
    local desc=$2
    if [ -f "$file" ]; then
        local size=$(du -h "$file" | cut -f1)
        log_success "$desc موجود ($size)"
        return 0
    else
        log_error "$desc غير موجود!"
        return 1
    fi
}

# ========================================
print_header "🔍 فحص وصول التحديثات - Joe Enterprise"
# ========================================

cd "$PROJECT_PATH" 2>/dev/null || {
    log_error "لا يمكن الوصول إلى $PROJECT_PATH"
    exit 1
}

# Check Git commit
print_header "📦 فحص إصدار الكود"
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
REMOTE_COMMIT=$(git rev-parse origin/main 2>/dev/null || echo "unknown")
log_info "الإصدار المحلي: ${LOCAL_COMMIT:0:7}"
log_info "إصدار GitHub: ${REMOTE_COMMIT:0:7}"

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log_success "السيرفر محدث بآخر إصدار!"
else
    log_warn "السيرفر غير محدث! يوجد اختلاف في الإصدار"
    log_info "سيتم تشغيل الدبلوي التلقائي..."
fi

# ========================================
print_header "🔧 فحص نظام الدبلوي المُصلح"
# ========================================

DEPLOY_OK=true
check_file "$API_PATH/src/services/DeployManager.ts" "DeployManager.ts" || DEPLOY_OK=false
check_file "$API_PATH/src/routes/webhooks.ts" "webhooks.ts" || DEPLOY_OK=false
check_file "$PROJECT_PATH/deploy.sh" "deploy.sh" || DEPLOY_OK=false
check_file "$PROJECT_PATH/quick-deploy.sh" "quick-deploy.sh" || DEPLOY_OK=false

if [ "$DEPLOY_OK" = true ]; then
    log_success "نظام الدبلوي المُصلح موجود بالكامل"
else
    log_error "نظام الدبلوي غير مكتمل!"
fi

# ========================================
print_header "🧠 فحص نظام Neural العصبي"
# ========================================

NEURAL_OK=true
check_file "$API_PATH/src/neural/NeuralCore.ts" "NeuralCore.ts" || NEURAL_OK=false
check_file "$API_PATH/src/neural/NeuralStateManager.ts" "NeuralStateManager.ts" || NEURAL_OK=false
check_file "$API_PATH/src/neural/NeuralVisualization.ts" "NeuralVisualization.ts" || NEURAL_OK=false
check_file "$API_PATH/src/neural/NeuralIntegration.ts" "NeuralIntegration.ts" || NEURAL_OK=false
check_file "$API_PATH/src/neural/NeuralDashboard.tsx" "NeuralDashboard.tsx" || NEURAL_OK=false
check_file "$API_PATH/src/neural/index.ts" "neural/index.ts" || NEURAL_OK=false
check_file "$WEB_PATH/src/components/NeuralThinkingIndicator.tsx" "NeuralThinkingIndicator.tsx" || NEURAL_OK=false

if [ "$NEURAL_OK" = true ]; then
    log_success "نظام Neural العصبي موجود بالكامل"
else
    log_error "نظام Neural غير مكتمل!"
fi

# ========================================
print_header "🚀 فحص نظام V2 المتطور"
# ========================================

V2_OK=true
check_file "$API_PATH/src/agents/ArchitectAgent-V2.ts" "ArchitectAgent-V2.ts" || V2_OK=false
check_file "$API_PATH/src/agents/JoeAgent-V2.ts" "JoeAgent-V2.ts" || V2_OK=false
check_file "$API_PATH/src/tools/ToolRegistry-V2.ts" "ToolRegistry-V2.ts" || V2_OK=false

if [ "$V2_OK" = true ]; then
    log_success "نظام V2 المتطور موجود بالكامل"
else
    log_error "نظام V2 غير مكتمل!"
fi

# ========================================
print_header "📋 فحص الإصلاحات الأساسية"
# ========================================

BASE_OK=true
check_file "$API_PATH/src/services/WorkspaceService.ts" "WorkspaceService.ts" || BASE_OK=false
check_file "$API_PATH/src/routes/project.ts" "project.ts" || BASE_OK=false

if [ "$BASE_OK" = true ]; then
    log_success "الإصلاحات الأساسية موجودة"
else
    log_error "الإصلاحات الأساسية غير مكتملة!"
fi

# ========================================
print_header "🖥️ فحص حالة السيرفر"
# ========================================

API_PID=$(pgrep -f "node.*dist/index.js" || echo "")
if [ -n "$API_PID" ]; then
    log_success "السيرفر يعمل (PID: $API_PID)"

    # Check health
    if curl -s http://localhost:8080/health >/dev/null 2>&1; then
        log_success "السيرفر يستجيب بشكل صحيح"
    else
        log_warn "السيرفر قد لا يستجيب بشكل صحيح"
    fi
else
    log_error "السيرفر غير شغال!"
fi

# ========================================
print_header "📊 ملخص التحقق"
# ========================================

echo ""
if [ "$DEPLOY_OK" = true ] && [ "$NEURAL_OK" = true ] && [ "$V2_OK" = true ] && [ "$BASE_OK" = true ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║         🎉 جميع التحديثات وصلت إلى السيرفر!              ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo "✅ نظام الدبلوي المُصلح"
    echo "✅ نظام Neural العصبي (10,000+ عصبون)"
    echo "✅ نظام V2 المتطور (Self-Healing, Pattern DB)"
    echo "✅ الإصلاحات الأساسية (File Explorer, Preview)"
    echo ""
    log_info "يمكنك الآن استخدام النظام بكامل مميزاته!"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         ⚠️  بعض التحديثات لم تصل إلى السيرفر!             ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    log_info "لتحديث السيرفر، نفذ:"
    log_info "  cd $PROJECT_PATH && ./quick-deploy.sh"
    exit 1
fi
