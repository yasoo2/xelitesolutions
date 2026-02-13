# InfinityX Deployment Architecture

## 🏗️ البنية الحالية (Self-Hosted Server)

### نوع الاستضافة
**Self-Hosted على سيرفر خاص بعيد**

❌ **ليس** Cloudflare Workers  
❌ **ليس** Render  
❌ **ليس** Vercel  
❌ **ليس** Netlify  

✅ **نعم** سيرفر خاص عبر SSH  
✅ **نعم** Docker Compose  
✅ **نعم** Self-hosted runner support  

---

## 📡 آلية النشر الحالية

### الطريقة الأساسية: SSH Deployment
**الملف:** `.github/workflows/deploy.yml`

```yaml
# النشر يتم عبر SSH إلى السيرفر الخاص
deploy_ssh:
  runs-on: ubuntu-latest
  steps:
    - name: Setup SSH agent
      uses: webfactory/ssh-agent@v0.9.0
      with:
        ssh-private-key: ${{ secrets.SSH_PRIVATE_KEY }}
    
    - name: Deploy to Server
      run: |
        ssh user@host "bash deployment script"
```

### الطريقة البديلة: Self-Hosted Runner
```yaml
# إذا كان الـ runner موجود على نفس السيرفر
deploy_self_hosted:
  runs-on: self-hosted
  steps:
    - run: ./scripts/deploy.sh
```

---

## 🐳 البنية على السيرفر

### Docker Compose Stack

```
السيرفر الخاص (xelitesolutions.com)
│
├── Docker Containers
│   ├── joe_nginx      (Reverse Proxy + SSL)
│   ├── joe_web        (Frontend - React)
│   ├── joe_api        (Backend - Node.js)
│   ├── joe_mongo      (Database)
│   └── joe_certbot    (SSL Certificates)
│
├── Let's Encrypt      (SSL/TLS)
├── Port 80 + 443
└── Git Repository     (/opt/joe/xelitesolutions)
```

**الملف:** `docker-compose.production.yml`

---

## 🔑 المتطلبات للنشر

### GitHub Secrets المطلوبة

```bash
# معلومات السيرفر
SSH_HOST=your-server-ip-or-domain
SSH_PORT=22  # أو 2222 أو 443 (يتم اكتشافه تلقائياً)
SSH_PRIVATE_KEY=<private-key-content>
SSH_KNOWN_HOSTS=<known-hosts-entry>  # اختياري
USERNAME=root  # أو المستخدم المناسب

# مسار النشر (اختياري - يتم اكتشافه تلقائياً)
DEPLOY_PATH=/opt/joe/xelitesolutions

# بيانات OAuth
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_API_KEY=xxx
```

---

## 🚀 عملية النشر خطوة بخطوة

### 1. GitHub Actions (Trigger)
```
Push to main
  ↓
GitHub Actions starts
  ↓
Checkout code
```

### 2. SSH Connection
```
Setup SSH agent
  ↓
Add private key
  ↓
Connect to server
  ↓
Auto-detect correct port (22/2222/443)
```

### 3. على السيرفر
```bash
# 1. تنظيف Docker
docker system prune -a --volumes -f

# 2. Git pull
git fetch origin main
git reset --hard origin/main

# 3. Update .env
# إدخال GOOGLE_CLIENT_ID, etc.

# 4. Docker Compose
docker compose -f docker-compose.production.yml build
docker compose -f docker-compose.production.yml down
docker compose -f docker-compose.production.yml up -d

# 5. SSL (Let's Encrypt)
# إذا لم يكن موجوداً، يتم إنشاؤه

# 6. Verify
curl http://localhost/
curl https://localhost/
```

### 4. Verification
```
Health check → https://xelitesolutions.com/
  ↓
Status 200 = Success ✅
  ↓
Deployment complete
```

---

## 📂 هيكل الملفات على السيرفر

```
/opt/joe/xelitesolutions/  (أو مسار آخر)
│
├── .git/
├── .env                    (أسرار محلية)
├── api/
│   ├── src/
│   └── Dockerfile
├── web/
│   ├── src/
│   └── Dockerfile
├── nginx/
│   └── nginx.conf
├── docker-compose.production.yml
├── scripts/
│   ├── deploy.sh
│   └── init-letsencrypt.sh
└── certbot/
    └── conf/
```

---

## 🔒 الأمان على السيرفر الخاص

### SSH Security
```bash
# تغيير منفذ SSH (اختياري)
Port 2222 أو 443

# Key-based authentication only
PasswordAuthentication no

# Firewall
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

### Docker Security
```yaml
# Restart policies
restart: unless-stopped

# Resource limits
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 4G
```

### SSL/TLS
```bash
# Let's Encrypt auto-renewal
certbot renew --dry-run

# Cron job (automatic)
0 0 * * * certbot renew --quiet
```

---

## 🔄 Auto-Restart & Recovery

### Docker Level
```yaml
# في docker-compose.production.yml
services:
  api:
    restart: unless-stopped
  web:
    restart: unless-stopped
  mongo:
    restart: unless-stopped
```

### System Level (Systemd - اختياري)
```ini
# /etc/systemd/system/joe-docker.service
[Unit]
Description=Joe Docker Compose
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/joe/xelitesolutions
ExecStart=/usr/bin/docker compose -f docker-compose.production.yml up -d
ExecStop=/usr/bin/docker compose -f docker-compose.production.yml down

[Install]
WantedBy=multi-user.target
```

---

## 📊 Monitoring على السيرفر

### Docker Logs
```bash
# عرض logs
docker compose -f docker-compose.production.yml logs -f

# logs لـ container محدد
docker logs -f joe_api
docker logs -f joe_web
```

### System Metrics
```bash
# استخدام الموارد
docker stats

# مساحة القرص
df -h
docker system df

# الذاكرة
free -h

# CPU
top
htop  # إذا كان مثبتاً
```

### Health Checks
```bash
# API health
curl http://localhost:3001/api/health

# Web health
curl http://localhost:80/

# External
curl https://xelitesolutions.com/api/health
```

---

## 🛠️ الصيانة على السيرفر

### تنظيف دوري (Manual)
```bash
# تنظيف Docker
docker system prune -a --volumes -f
docker builder prune -a -f

# تنظيف logs
journalctl --vacuum-time=7d

# تنظيف APT cache
apt-get clean
apt-get autoclean
```

### تنظيف تلقائي (Cron)
```bash
# إضافة إلى crontab
crontab -e

# تنظيف أسبوعي
0 0 * * 0 docker system prune -a --volumes -f
```

### تحديثات النظام
```bash
# تحديث packages
apt update && apt upgrade -y

# تحديث Docker
apt install docker-ce docker-ce-cli containerd.io

# تحديث Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
```

---

## 🔍 Troubleshooting على السيرفر

### الخدمة لا تعمل
```bash
# 1. فحص Docker
systemctl status docker
docker ps -a

# 2. إعادة تشغيل
docker compose -f docker-compose.production.yml restart

# 3. إعادة بناء
docker compose -f docker-compose.production.yml up -d --build
```

### SSL لا يعمل
```bash
# فحص certificates
certbot certificates

# تجديد
certbot renew --force-renewal

# إعادة تشغيل nginx
docker compose -f docker-compose.production.yml restart nginx
```

### مشاكل الأداء
```bash
# فحص الموارد
docker stats
free -h
df -h

# زيادة swap (إذا لزم)
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
```

---

## 📈 التوسع المستقبلي

### خيارات التوسع (على نفس البنية)

1. **Vertical Scaling** (توسع عمودي)
   - زيادة RAM/CPU للسيرفر
   - إضافة SSD أسرع

2. **Load Balancer** (توزيع الحمل)
   - nginx كـ load balancer
   - عدة نسخ من الـ containers

3. **Database Replication**
   - MongoDB replica set
   - Backup server

4. **CDN** (اختياري)
   - Cloudflare للـ static files
   - مع بقاء الـ API على السيرفر

---

## ✅ الخلاصة

### البنية الحالية مناسبة تماماً لـ:
- ✅ تحكم كامل في السيرفر
- ✅ أمان عالي (SSH + Docker + SSL)
- ✅ نشر تلقائي عبر GitHub Actions
- ✅ صيانة سهلة
- ✅ تكلفة ثابتة ومعروفة

### لا حاجة لـ:
- ❌ Cloudflare Workers
- ❌ Render
- ❌ Serverless functions
- ❌ خدمات سحابية أخرى

### البنية الحالية **أفضل** للتطبيقات التي تحتاج:
- تحكم كامل
- أمان عالي
- تكلفة ثابتة
- خصوصية البيانات

---

**النظام الحالي: Self-Hosted على سيرفر خاص** ✅  
**الحالة: مثالي ومناسب تماماً** 🏆  
**التوصية: الاستمرار على نفس البنية** 👍
