# إقرار 028 — إصلاح 048a: provenance وإيصالات المهام وسبب rerun

**الحالة:** التنفيذ المحلي مكتمل، focused أخضر، والبوابات الكاملة والدفع والجولة الحية ما زالت لاحقة.

## نطاق التعديل العام

أصلحتُ حدّ ضغط إيصالات المراحل في `AgentLoopService` ليحافظ على `projectRoot` المثبت، وإيصالات المهام المحدودة بالشكل `{ tool, ok, error }`، و`selfFixFailureReason` المأخوذ من السبب أو الخطأ الحرفي لإعادة التشغيل. لم أغيّر قرار التنفيذ أو ترتيب الأدوات أو مسار الإصلاح الذاتي.

عدّلتُ `ProjectPipelineTool.buildDeliveryReport` ليقرأ ملفات المصدر من القرص الفعلي تحت جذر artifact المثبت، مع تجاهل مجلدات الاعتماديات والمجلدات المخفية وحدّ عمق محدود. عند غياب الجذر، يبقى fallback من الخطة لكن مع وسم `unverified`. كما يعرض التقرير سبب فشل rerun الحرفي عندما يكون موجوداً في receipt، مع الإبقاء على النص السابق كـfallback.

ثبتُّ عند مصدر القبول في `ReactProjectTool` أن حكم الوفاء مستقل عن حضور `appBp`: يُعاد اشتقاق blueprint من الطلب عند الحاجة، ويُسجّل سطر `acceptance fidelity verdict` دائماً، بما في ذلك حالة `appBp=null`. لا يوجد حكم موازٍ في AgentLoop؛ الطبقة العليا تنقل الحكم الموجود عند المصدر.

## اختبارات regression الدائمة

أضيفت اختبارات تثبت حفظ `projectRoot` وإيصالات المهام وسبب rerun في receipt، وتثبت أن التقرير يعدد ملفات القرص الفعلية ولا يطبع ملفاً موجوداً في الخطة فقط، ويعرض سبب الفشل الحرفي. كما أضيف اختبار الحالة الحرجة: جذر كتيّبي + طلب WeatherGo + `appBp=null` + دليل قصير ينتج `engine=weather` و`fidelity_unverifiable` وتشخيصاً مرئياً.

## البوابات المحلية حتى الآن

| البوابة | النتيجة |
|---|---:|
| TypeScript بعد الإصلاح الأول | `TSC:0` |
| focused Jest قبل تصحيح verdict | `8 suites / 127 tests / 0` |
| TypeScript بعد تصحيح verdict | `TSC:0` |
| focused Jest بعد تصحيح verdict | `8 suites / 128 tests / 0` |
| Jest الكاملة | لم تُشغّل بعد؛ ستُشغّل قبل الدفع |
| الدفع إلى `main` | لم يُنفّذ بعد |
| الجولة الحية WeatherGo | لم تُنفّذ بعد |

## الملفات المفتوحة في هذه الدفعة

- `api/src/modules/services/AgentLoopService.ts`
- `api/src/modules/tools/definitions/ProjectPipelineTool.ts`
- `api/src/modules/tools/definitions/ReactProjectTool.ts`
- `api/src/__tests__/delivery-details.test.ts`
- `docs/agent-mail/MANUS-TASKS.md`
- هذا الإقرار

لا توجد تعديلات يدوية على ملفات WeatherGo الناتجة، ولا تُضاف `package.json` أو `package-lock.json` إلى هذه الدفعة، ولا توجد مسبارات `zz-*.test.ts` ضمنها.
