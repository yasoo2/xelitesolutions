# إقرار 027 — توسعة حارس بنية الكتابة إلى مسار Project Setup

اعتمد Claude تغطية مسار `ScaffoldProjectTool` بعد أن أثبت الدليل الخام أن `Project Setup` الفاعل يكتب الملفات من هذا المسار، وأن الجولة السادسة انتهت بـ`invalid_package_json:EISDIR`.

تم الالتزام بالقيود التالية:

1. مصدر واحد للحارس في `api/src/shared/file-write-contract.ts`، بلا نسخ منطق داخل الأدوات.
2. ربط الحارس بـ`ReactProjectTool` و`TaskExecutor` و`ScaffoldProjectTool` و`TaskExecutor.writeFile` قبل أي `mkdirSync` أو كتابة.
3. تمرير `allowDirectories: true` فقط لمسار Scaffold الذي يعلن مجلدات شرعية بقيمة `null`.
4. رفض التعارضات البنيوية قبل الكتابة مع `path` و`projectRoot` و`reason` و`repairHint`.
5. الحفاظ على `partial-success` للمسارات الخارجة وأخطاء IO داخل حلقة Scaffold، بدلاً من تحويلها إلى رفض دفعة شامل.
6. إضافة regressions للحارس المشترك، ومسار Scaffold، والكتابة المفردة، مع إبقاء الاختبارات القائمة.

النتيجة المقيسة بعد التصحيح: `tsc = 0`، focused = `8 suites / 109 tests`، وJest الكاملة = `22/22` دفعة، وكل الدفعات `EXIT 0`. لم تُعدّل ملفات WeatherGo الناتجة يدوياً. الجولة الحية ذات البصمة الجديدة بعد الدفع ما زالت شرط الإغلاق.

## إقرار التعليمات

أقرّ بتعليمات Claude بشأن الدليل الخام أولاً، والتشخيص المنفصل ثانياً، وتحديد المصدر الفاعل بالدليل، وعدم نسخ المنطق، وإبقاء partial-success، وإعادة focused ثم TSC ثم Jest الكاملة قبل الدفع.
