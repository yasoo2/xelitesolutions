# إقرار 037 — إصلاح 054: حارس provenance ومنع self-fix التخميني

**التاريخ:** 2026-08-21
**المستودع:** `yasoo2/xelitesolutions`
**الفرع:** `main` فقط
**السياق:** الجولة 16 بعد إصلاح 053

## إقرار تعليمات Claude

1. **تثبيت المرجع قبل الإصلاح:** ألتزم بأن اسم الملف الوارد في رسالة الخطأ أو prose لا يُعد دليلاً على أن الملف كان هدفاً حقيقياً للخطة. مصدر الثقة هو `failedTasks.file` أو `repairFile` المحفوظ، أو مسار مثبت في evidence/artifact على القرص.
2. **منع الكتابة التخمينية:** ألتزم بمنع `ai_write_file`/`write_file` لمسار `File not found` غير المثبت، مع إبقاء إصلاح الملف المثبت مسموحاً ومحدوداً بالهدف المحفوظ.
3. **الحارس المشترك:** ألتزم بإضافة الحارس في طبقة `sanitisePlanPhases` لتغطية مراجع `path` و`filePath` و`file` و`filename` و`files`، وربط `verificationTask` بالبوابة نفسها بدلاً من حارس خاص بأداة أو مجال.
4. **الحفاظ على الإصلاحات الصحيحة:** ألتزم بعدم كسر provenance السابق أو المراجع التي أنتجتها مرحلة سابقة أو اكتشفتها أدلة حقيقية؛ التحويل أو الحجب يطبق فقط على المرجع غير المثبت.
5. **القياس قبل التنفيذ وبعده:** ألتزم بدبابيس Claude في receipt الجولة 16، وبـregressions عامة تثبت الفرق بين prose-only والهدف المحفوظ، ثم تشغيل focused وTSC وJest الكاملة قبل الدفع.

## الدليل المقاس للجولة 16

أظهر receipt أن مهمة `Testing` استدعت `test_generator` على `Search.tsx` و`WeatherDisplay.tsx`، وأن سجل الخطة أضاف `Search.tsx` من دون provenance مثبت في artifact أو evidence. انتهت الجولة بـ`runtime_contract_mismatch` عند إعادة الاختبار، مع غياب `Search.tsx` من الناتج الفعلي. لم تُلمس ملفات WeatherGo الناتجة، ولم يُستخدم artifact كموضع إصلاح يدوي.

## التغيير العام المنفذ

تم تعديل `api/src/modules/services/SelfFixService.ts` ليقبل هدف `missing_file_fix` من الحقول المحفوظة `file` أو `repairFile` فقط، ويحجب الحالة عندما يظهر اسم الملف من النص وحده.

تم تعديل `api/src/core/orchestrator/plan-tools.ts` لإضافة بوابة provenance مشتركة لمراجع المسارات في أدوات الخطة (`path` و`filePath` و`file` و`filename` و`files`) ولـ`verificationTask`. المراجع المثبتة تبقى قابلة للتنفيذ؛ المراجع غير المثبتة تتحول إلى ملاحظة/فحص صادق بدلاً من إنشاء ملف تخميني.

تمت إضافة regressions إلى:

- `api/src/__tests__/file-edit-recovery.test.ts`: prose-only أو `ENOENT` لا ينشئ ملفاً، بينما `failedTasks.file`/`repairFile` المثبت يسمح بإصلاح محدود.
- `api/src/__tests__/a-plan-states-its-dependencies.test.ts`: `filePath` و`files` غير المثبتين يُرفضان، مع بقاء المخرج المثبت والمراجع المكتشفة مسموحين.

## بوابات الجودة

| البوابة | النتيجة |
|---|---|
| focused 054 | 3 suites / 120 tests / `EXIT 0` |
| TypeScript | `npx tsc --noEmit` — `TSC:0` |
| Jest الكاملة | 22/22 دفعة، كل دفعة `EXIT 0`، `FULL_JEST_054:0` |
| الملفات الممنوعة | لا `package.json` أو `package-lock.json` أو `zz-*.test.ts` ضمن الدفعة؛ لا تعديل يدوي على WeatherGo |

## الحالة قبل الدفع

إصلاح 054 جاهز للتوثيق والدفع بعد استكمال staging الانتقائي و`git diff --cached --check`. الجولة 16 نفسها فاشلة ومغلقة بدليل خام ثم تشخيص منفصل؛ الجولة 17 ستعاد فقط بعد تشغيل Joe من SHA الجديد، مع عدم تعديل artifact يدوياً.

## الملفات المفتوحة غير المدفوعة

- `api/src/core/orchestrator/plan-tools.ts`
- `api/src/modules/services/SelfFixService.ts`
- `api/src/__tests__/a-plan-states-its-dependencies.test.ts`
- `api/src/__tests__/file-edit-recovery.test.ts`
- `docs/agent-mail/MANUS-TASKS.md`
- هذا الإقرار

**الخلاصة:** 054 إصلاح عام قائم على provenance، لا منطق خاص بـWeatherGo ولا علاجاً لمسار `Search.tsx` بعينه، ويمنع Joe من أكل السمكة التخمينية عندما لا يملك دليلاً على أن الهدف جزء من الناتج.
