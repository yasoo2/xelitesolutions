# 🚀 Joe System - Server Deployment

## Quick Start (للسيرفر البعيد)

### الإعداد الأولي (مرة واحدة فقط):

```bash
# 1. على السيرفر البعيد
cd /opt
git clone https://github.com/yasoo2/xelitesolutions.git joe
cd joe

# 2. تشغيل الإعداد التلقائي
chmod +x setup-server.sh
./setup-server.sh
```

✅ **هذا كل شيء!** النظام سيعمل تلقائياً مع:
- MongoDB
- API
- Browser Worker
- Web Frontend

---

## التحديثات التلقائية

كل مرة تدفع كود جديد لـ GitHub، السيرفر سيسحبه **تلقائياً** ويطبق التحديثات!

```bash
# على السيرفر (اختياري - يدوي)
cd /opt/joe
git pull origin main
# deploy.sh سيعمل تلقائياً!
```

---

## المراقبة

```bash
# فحص صحة النظام
./health-check.sh

# مشاهدة اللوغات
docker-compose -f docker-compose.server.yml logs -f

# حالة الخدمات
docker ps
```

---

## الوصول

- **Web**: `http://YOUR_SERVER_IP`
- **API**: `http://YOUR_SERVER_IP/api`

---

## استكشاف الأخطاء

```bash
# إعادة تشغيل كل شيء
./deploy.sh

# إعادة تشغيل خدمة واحدة
docker-compose -f docker-compose.server.yml restart [service-name]

# حذف كل شيء وإعادة البناء
docker-compose -f docker-compose.server.yml down -v
./deploy.sh
```

---

## الملفات المهمة

- `deploy.sh` - نشر تلقائي
- `setup-server.sh` - إعداد أولي
- `health-check.sh` - مراقبة
- `docker-compose.server.yml` - تكوين الإنتاج
- `.env` - متغيرات البيئة (يتم توليده تلقائياً)

---

## الأمان

- 🔒 JWT secrets يتم توليدها تلقائياً
- 🔥 Firewall مفعّل تلقائياً
- 🔐 كلمات السر محمية

---

## الدعم

إذا واجهت مشكلة:
1. شغل `./health-check.sh`
2. شوف اللوغات: `docker-compose logs [service]`
3. أعد التشغيل: `./deploy.sh`
