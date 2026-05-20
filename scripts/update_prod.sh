#!/bin/bash
# سكريبت إعادة بناء وتحديث نظام Joe مع فحص الأخطاء

echo "📥 1. جلب التحديثات النهائية..."
git pull origin main

echo "🏗️  2. إعادة بناء حاويات Docker (هذه العملية قد تستغرق دقائق)..."
docker compose -f docker-compose.production.yml build --no-cache web api

if [ $? -eq 0 ]; then
    echo "🚀 3. تشغيل النظام بالنسخة الجديدة..."
    docker compose -f docker-compose.production.yml up -d web api
    echo ""
    echo "=========================================="
    echo "✅ تم التحديث بنجاح تام (SUCCESS)!"
    echo "=========================================="
    echo "✨ يرجى الضغط على Cmd + Shift + R الآن."
else
    echo "❌ فشل عملية البناء (BUILD FAILED)!"
    echo "يرجى نسخ رسائل الخطأ الحمراء وإرسالها لي."
    exit 1
fi
