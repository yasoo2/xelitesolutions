#!/bin/bash
# سكريبت إعادة بناء نظام Joe في بيئة الإنتاج
echo "🏗️  بدء إعادة بناء حاويات Docker (Production Mode)..."
git pull origin main
docker compose -f docker-compose.production.yml up -d --build web api
echo "✅ تم إعادة البناء والتشغيل بنجاح!"
echo "✨ يرجى الآن الضغط على Cmd + Shift + R في متصفحك."
