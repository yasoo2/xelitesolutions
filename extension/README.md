# Joe Browser Connector — إضافة متصفح جو

تربط متصفح المستخدم الحقيقي بنظام جو، ليتصرّف جو في متصفحه (بحساباته، أي موقع) بعد موافقته — وهي الطريقة الوحيدة الممكنة لعمل ذلك أونلاين لآلاف المستخدمين.

## التثبيت للتطوير (Load unpacked)

1. Chrome: افتح `chrome://extensions` (أو Edge: `edge://extensions`).
2. فعّل **Developer mode**.
3. **Load unpacked** → اختر هذا المجلّد (`extension`).
4. افتح جو وسجّل دخولك → تتصل الإضافة تلقائياً (نقطة خضراء على الأيقونة).

## كيف تعمل

- `content.js` يقرأ رمز جلسة جو من صفحة جو ويسلّمه للخلفية.
- `background.js` يفتح WebSocket إلى `‎<joe>/ws/extension?token=…‎` وينفّذ أوامر جو
  (navigate / read / screenshot / click / type) ويبثّ لقطات حيّة للوحة جو.
- الخادم: `modules/extension/gateway.ts` + المسار `/ws/extension` + `routes/extension.ts`.

## النشر للمستخدمين الحقيقيين (Phase 3)

قبل النشر، عدّل `manifest.json`:

- أضِف نطاق جو الإنتاجي إلى `content_scripts[0].matches`، مثلاً:
  ```json
  "matches": ["https://app.your-joe-domain.com/*"]
  ```
  (هذا يسمح للإضافة بقراءة رمز الجلسة على موقع جو الحقيقي.)

ثم:

1. **Chrome Web Store**: https://chrome.google.com/webstore/devconsole (رسوم تسجيل مطوّر لمرّة واحدة 5$) → ارفع الإضافة مضغوطة (zip) → مراجعة → نشر. بعدها يثبّتها المستخدم **بنقرة واحدة**.
2. **Microsoft Edge Add-ons**: https://partner.microsoft.com/dashboard/microsoftedge (مجاني).
3. **Firefox (AMO)**: https://addons.mozilla.org — يتطلّب نسخة `manifest` متوافقة مع Firefox (MV3 مدعوم؛ `background` يصبح `scripts` بدل `service_worker` أو `background.scripts`).

## الأمان

- لا تُخزَّن أي كلمة مرور. الإضافة تعمل داخل جلسة المستخدم الحقيقية بموافقته.
- الاتصال مؤمَّن برمز جو (JWT) الخاص بالمستخدم.
- يمكن للمستخدم إزالة الإضافة في أي وقت لقطع الوصول فوراً.
