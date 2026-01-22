#!/bin/bash
# سكريبت نشر التحديثات البصرية لنظام Joe

echo "🚀 بدء تطبيق التحديثات..."
echo ""

# الانتقال لمجلد المشروع
cd /Users/younissowadi/xelitesolutions-1

# جلب أحدث التحديثات
echo "📥 جلب التحديثات من GitHub..."
git pull origin main

echo ""
echo "✅ تم تحديث الكود بنجاح!"
echo ""
echo "📋 الآن قم بالخطوات التالية:"
echo ""
echo "1️⃣ أعد تشغيل Frontend:"
echo "   cd /Users/younissowadi/xelitesolutions-1/web"
echo "   npm run dev"
echo ""
echo "2️⃣ في نافذة Terminal أخرى، أعد تشغيل Backend:"
echo "   cd /Users/younissowadi/xelitesolutions-1/api"
echo "   npm run dev"
echo ""
echo "3️⃣ افتح المتصفح على: http://localhost:5173"
echo ""
echo "4️⃣ اضغط Cmd + Shift + R لإعادة تحميل الصفحة"
echo ""
echo "✨ ستظهر الأزرار بلون ذهبي لامع!"
