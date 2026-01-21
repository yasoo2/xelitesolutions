# كيف تستخدم النظام - دليل عملي

## 🎯 ما هو النظام؟

**Joe AI** = مساعد ذكاء اصطناعي يفهم أوامرك ويُنفذها. يمكنه:
- كتابة الكود
- البحث في الإنترنت
- أتمتة المتصفح
- إدارة المشاريع
- إصلاح الأخطاء

---

## 🚀 كيف تستخدمه؟

### الطريقة 1: Web Interface (الأسهل)

```bash
# 1. شغّل الـ API
cd api && npm run dev

# 2. شغّل الـ Web Interface (في terminal آخر)
cd web && npm run dev

# 3. افتح المتصفح
open http://localhost:3000
```

الآن اكتب أي طلب في الـ chat box مثل:
- "ابني todo app بـ React"
- "ابحث عن أفضل مكتبات للـ forms"
- "صلح الـ bug في login.ts"

---

### الطريقة 2: API مباشرة

```bash
curl -X POST http://localhost:3001/api/runs \
  -H "Content-Type: application/json" \
  -d '{
    "instruction": "create a React button component",
    "sessionId": "test-session"
  }'
```

---

## 💡 أمثلة حقيقية

### مثال 1: إنشاء Component
```
الطلب: "ابني React component لعرض user profile"

ما يحدث:
1. ينشئ ملف UserProfile.tsx
2. يكتب الكود كامل
3. يضيف styling
4. يكتب tests

النتيجة: Component جاهز للاستخدام
```

### مثال 2: البحث والمقارنة
```
الطلب: "قارن بين Next.js و Remix"

ما يحدث:
1. يبحث عن المعلومات
2. يقرأ documentation
3. يحلل المزايا والعيوب
4. يعطيك مقارنة شاملة

النتيجة: تقرير مفصل جاهز
```

### مثال 3: أتمتة المتصفح
```
الطلب: "افتح GitHub trending وأرني أفضل 5 repos"

ما يحدث:
1. يفتح browser
2. يذهب لـ github.com/trending
3. يستخرج البيانات
4. يرتبها ويعرضها

النتيجة: قائمة بأفضل المشاريع
```

### مثال 4: إصلاح كود
```
الطلب: "اقرأ src/login.ts واصلح أي أخطاء"

ما يحدث:
1. يقرأ الملف
2. يحلل الكود
3. يكتشف المشاكل
4. يصلحها ويحفظ

النتيجة: Bugs مصلّحة
```

---

## 🛠️ الأدوات المتوفرة

النظام عنده **49 أداة**:

### ملفات ومجلدات
- `file_read` - قراءة ملف
- `file_write` - كتابة ملف
- `file_edit` - تعديل ملف
- `ls` - عرض محتويات مجلد

### Shell & Commands
- `shell_execute` - تنفيذ أوامر terminal
- `npm_install` - تنصيب packages
- `quality_run` - تشغيل tests/lint

### متصفح
- `browser_open` - فتح متصفح
- `browser_run` - أتمتة إجراءات
- `screenshot` - capture صورة

### بحث
- `web_search` - بحث في الإنترنت
- `deep_research` - بحث معمق
- `html_extract` - استخراج من صفحات

### Git & GitHub
- `git_ops` - عمليات git
- `github_create_repo` - إنشاء repository

### ذكاء
- `analyze_codebase` - تحليل المشروع
- `scaffold_project` - بناء مشروع جديد
- `knowledge_search` - بحث في قاعدة معرفة

وأكثر...

---

## ⚡ الفائدة العملية

### بدون النظام:
1. تبحث يدوياً في Google
2. تقرأ documentation
3. تكتب الكود بنفسك
4. تختبر وتصلح bugs
5. تكرر العملية...

**الوقت**: ساعات

### مع النظام:
1. تكتب طلبك
2. تنتظر

**الوقت**: دقائق

---

## 🎯 متى تستخدمه؟

✅ **استخدمه عندما:**
- تريد إنشاء component/feature سريع
- تحتاج بحث ومقارنة
- عندك bug وتريد تحليل
- تريد أتمتة مهمة متكررة
- تحتاج أفكار أو suggestions

❌ **لا تستخدمه لـ:**
- مهام بسيطة جداً (أسرع تعملها بنفسك)
- أشياء تحتاج حكم بشري معقد
- قرارات business critical بدون مراجعة

---

## 🔧 إعداد أول مرة

```bash
# 1. تأكد من Environment Variables
cp api/.env.example api/.env
# عدّل وضع OPENAI_API_KEY

# 2. Install dependencies
cd api && npm install
cd ../web && npm install

# 3. Build
cd ../api && npm run build

# 4. Run
npm run dev  # في api/
npm run dev  # في web/ (terminal آخر)

# 5. Test
npx tsx api/src/scripts/test_end_to_end.ts
```

---

## 📊 التحقق من أنه يشتغل

```bash
# Test 1: Context Analyzer
npx tsx api/src/scripts/test_end_to_end.ts
# Expected: 5/5 PASSED ✅

# Test 2: Production Health
npx tsx api/src/scripts/verify_production.ts
# Expected: All ✅

# Test 3: API Check
curl http://localhost:3001/health
# Expected: {"status":"ok"}
```

---

## 💬 أمثلة أوامر جاهزة

### للتجربة الآن:

```
"اعمل لي React component لـ card"
"ابحث عن best practices للـ error handling"
"اقرأ package.json واعرض أهم المكتبات"
"أنشئ ملف README.md للمشروع"
"شغّل npm test واعرض النتائج"
```

---

## 🎉 الخلاصة

**النظام** = AI developer يشتغل 24/7
- يوفر وقتك
- يسرّع التطوير
- يساعد في البحث والتحليل
- يأتمت المهام المملة

**جربه الآن** وسترى الفرق!
