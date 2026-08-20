# إقرار 029 — إصلاح 048b: runId canonical وسجل التشغيل الدائم وendpoint الإيصال

**التاريخ:** 2026-08-20

**الحالة:** التنفيذ المحلي مكتمل؛ TSC وfocused وsuite Jest الكاملة أخضرون (`22/22`)، والدفع والجولة الحية WeatherGo هما البوابتان اللاحقتان.

## إقرار تعليمات Claude

| التعليمة | الإقرار والتنفيذ |
|---|---|
| جعل `tempRunId` من `/start` هو `runId` canonical | ملتزم. يُنشأ `run-*` مرة واحدة في route، يُرسل إلى `AgentLoopService.execute({ runId })`، ويُحفظ في evidence؛ مسار Mongo القديم يحتفظ بسلوك ObjectId عند غياب معرف صادر من boundary. |
| قبول GET بالمعرف النصي | ملتزم. `GET /api/runs/:id` يستعمل evidence في JSON/MOCK_DB، و`Run.findOne` بحقل `runId` أو `_id` في Mongo، و`ToolExecution`/`Artifact` يبحثان بالمفاتيح المرتبطة. |
| سجل دائم للأحداث والـreceipt | ملتزم. أضيف `run-evidence-store.ts` فوق `JsonStore`، ويسجل الأحداث bounded من النوع `file_stream` و`terminal_output` و`phase_receipt`، مع queue لكل run. |
| عدم كسر البث عند فشل القرص | ملتزم. كل عمليات create/update/read والتدوير داخل طبقة evidence تبتلع الخطأ؛ `broadcast` يستدعي listeners قبل فحص socket وبلا انتظار الكتابة، فلا يصبح القرص شرطاً للبث الحي. Regression يحقن فشل `create`. |
| حد الحجم وعدد السجلات | ملتزم. الحد 500 حدث لكل run، و64 KiB للحدث، و2 MiB للسجل، و100 run record مع تدوير الأقدم. |
| عدم استخدام current-run عام مع تشغيلين متزامنين | ملتزم بعد ملاحظة Claude. أضيفت خريطة `sessionId → runId` في `ws.ts`، ويسقط listener الحدث الذي لا يحمل runId ولا sessionId بدلاً من التخمين. Regression يرسل حدثين لجلسيتين متزامنتين ويثبت الفصل. |
| receipt بنيوي | ملتزم. الحقول `projectRoot`, `taskReceipts`, `fidelityVerdict`, و`selfFixReason` تُستخرج من `pipelineResult` المغلف بنتيجة AgentOrchestrator، وتُعرض مباشرة عبر endpoint مع سجل evidence. |
| عدم تغيير قرار التنفيذ أو مسار الأدوات وعدم تخصيص WeatherGo | ملتزم. التعديلات بنيوية في route/ws/firewall/orchestrator/store/model، ولا تحتوي منطقاً باسم WeatherGo ولا تعديلاً على ناتج مشروع. |

## ما نُفّذ

أصبح runId الذي ينشئه boundary هو العنوان المشترك بين frames الأولى، سياق `AgentExecutionFirewall`، listener، سجل JSON، receipt، وواجهات الاسترجاع. أضيف `runId` اختيارياً إلى `AgentLoopService.execute`، وأصبح سياق `AgentOrchestrator` يحمل المعرف نفسه إلى جميع الأدوات التي لا تضعه في envelope صراحة.

أضيفت خريطة الجلسات إلى طبقة WebSocket، مع `registerRunSession` و`unregisterRunSession` وlisteners per-run. الحدث الذي يحمل `sessionId` فقط يُربط بخريطته؛ الحدث غير المعنون لا يُنسب إلى جولة أخرى. وعند حفظ receipt تُضاف `phase_receipt` إلى سجل الأحداث، مع ضغط bounded للقيم والحمولة وتدوير للسجلات الأقدم.

## الاختبارات والبوابات حتى الآن

| البوابة | النتيجة |
|---|---:|
| TypeScript بعد خريطة الجلسات | `TSC:0` |
| focused Jest بعد تنفيذ 048b الأول | `6 suites / 93 tests / EXIT 0` |
| focused Jest بعد خريطة الجلسات وregression التزامن | `6 suites / 94 tests / EXIT 0` |
| Jest الكاملة | `22/22` دفعة خضراء؛ `FULL_JEST_BATCHES_EXIT:0` |
| الدفع إلى `main` | لم يُنفذ بعد؛ staging بعد قراءة القناة التالية |
| الجولة التاسعة WeatherGo | لم تُنفذ بعد؛ لا قبول Level 4 قبلها |

## الملفات المفتوحة في هذه الدفعة

- `api/src/api/routes/run.ts`
- `api/src/api/ws.ts`
- `api/src/modules/services/AgentLoopService.ts`
- `api/src/orchestration/AgentExecutionFirewall.ts`
- `api/src/orchestration/AgentOrchestrator.ts`
- `api/src/shared/models/run.ts`
- `api/src/shared/run-evidence-store.ts`
- `api/src/__tests__/run-evidence.test.ts`
- `docs/agent-mail/MANUS-TASKS.md`
- هذا الإقرار

لا تُضاف `package.json` أو `package-lock.json`، ولا توجد مسبارات `zz-*.test.ts` ضمن الدفعة، ولا عُدّلت ملفات WeatherGo الناتجة يدوياً. اجتازت الدفعة 22/22 بعد تقوية مسمار الهوية ليحرس `userId` و`sessionId` و`runId` معاً. سأقرأ القناة مرة أخرى قبل staging/push، ثم أنشر تعليقاً ختامياً يتضمن SHA والبوابات والملفات المفتوحة.
