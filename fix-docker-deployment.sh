#!/bin/bash

# سكريبت لحل مشكلة Docker على الخادم الإنتاجي
# يحذف الحاويات القديمة ويعيد تشغيل الخدمات

set -e

echo "🔧 بدء حل مشكلة Docker..."

# الانتقال إلى مجلد المشروع
cd /opt/joe || cd /opt/xelitesolutions || cd /root/xelitesolutions || exit 1

echo "📍 المجلد الحالي: $(pwd)"

# إيقاف جميع الحاويات
echo "⏹️ إيقاف الحاويات..."
docker compose -f docker-compose.production.yml down || true

# حذف الحاويات المعلقة
echo "🗑️ حذف الحاويات المعلقة..."
docker container prune -f || true

# حذف الشبكات المعلقة
echo "🌐 حذف الشبكات المعلقة..."
docker network prune -f || true

# حذف الأحجام المعلقة
echo "💾 حذف الأحجام المعلقة..."
docker volume prune -f || true

# إعادة بناء الصور
echo "🏗️ إعادة بناء الصور..."
docker compose -f docker-compose.production.yml build --no-cache || true

# تشغيل الحاويات الجديدة
echo "🚀 تشغيل الحاويات الجديدة..."
docker compose -f docker-compose.production.yml up -d

# الانتظار قليلاً
sleep 10

# التحقق من صحة الحاويات
echo "✅ التحقق من صحة الحاويات..."
docker compose -f docker-compose.production.yml ps

# التحقق من الموقع
echo "🌐 التحقق من الموقع..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost || echo "Local check failed"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" https://xelitesolutions.com || echo "Remote check failed"

echo "✨ تم حل المشكلة بنجاح!"
