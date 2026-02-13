#!/bin/bash
# Deployment Verification Script
# تحقق من نشر التحديثات على الدومين الرئيسي

echo "================================================"
echo "🔍 التحقق من حالة النشر"
echo "🔍 Deployment Verification"
echo "================================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if domain is provided
DOMAIN=${1:-"localhost:3000"}

echo "📍 الدومين / Domain: $DOMAIN"
echo ""

# 1. Check Health Endpoint
echo "1️⃣ فحص صحة النظام / Checking System Health..."
HEALTH_RESPONSE=$(curl -s "http://${DOMAIN}/api/health" 2>/dev/null)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ النظام يعمل / System is running${NC}"
    echo "   Response: $HEALTH_RESPONSE"
else
    echo -e "${RED}❌ النظام لا يستجيب / System not responding${NC}"
fi
echo ""

# 2. Check if version endpoint exists (if added)
echo "2️⃣ فحص الإصدار / Checking Version..."
VERSION_RESPONSE=$(curl -s "http://${DOMAIN}/api/version" 2>/dev/null)

if [ $? -eq 0 ] && [ ! -z "$VERSION_RESPONSE" ]; then
    echo -e "${GREEN}✅ الإصدار: $VERSION_RESPONSE${NC}"
else
    echo -e "${YELLOW}⚠️  نقطة الإصدار غير متاحة (متوقع في v1.0.0)${NC}"
    echo -e "${YELLOW}⚠️  Version endpoint not available (expected in v1.0.0)${NC}"
fi
echo ""

# 3. Check Git Status on Server (if accessible)
echo "3️⃣ فحص حالة Git / Checking Git Status..."
if [ "$DOMAIN" = "localhost:3000" ] || [ "$DOMAIN" = "127.0.0.1:3000" ]; then
    if [ -d ".git" ]; then
        CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
        LATEST_COMMIT=$(git log -1 --oneline 2>/dev/null)
        
        echo -e "${GREEN}✅ الفرع الحالي / Current Branch: $CURRENT_BRANCH${NC}"
        echo "   آخر Commit: $LATEST_COMMIT"
        
        # Check if v1.0.1 changes are present
        if git log --oneline | grep -q "live system indicators"; then
            echo -e "${GREEN}✅ تحديثات v1.0.1 موجودة / v1.0.1 updates present${NC}"
        else
            echo -e "${RED}❌ تحديثات v1.0.1 غير موجودة / v1.0.1 updates not present${NC}"
        fi
    else
        echo -e "${YELLOW}⚠️  ليس في مجلد Git / Not in a Git directory${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  فحص Git متاح فقط محلياً / Git check available only locally${NC}"
fi
echo ""

# 4. Summary
echo "================================================"
echo "📊 الملخص / Summary"
echo "================================================"
echo ""
echo "للتحقق من التحديثات في المتصفح:"
echo "To verify updates in browser:"
echo ""
echo "1. افتح http://${DOMAIN}"
echo "2. تحقق من شريط الحالة في الأسفل"
echo "3. ابحث عن:"
echo "   - ⏰ ساعة حية (تتحدث كل ثانية)"
echo "   - 📊 v1.0.1"
echo ""
echo "If you see these, the updates are deployed ✅"
echo ""
