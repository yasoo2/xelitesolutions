# التشخيص المنفصل 039 — خيط A: حارس وفاء القصد

## نطاق التشخيص

هذا التشخيص منفصل عن الدليل الخام المحفوظ في `docs/agent-mail/live-evidence-039-raw.md`. لا يعتمد على أسماء مهام غير محفوظة، ولا يغيّر أي ملف داخل artifact WeatherGo.

## المقارنة بين الدليل والشيفرة

1. الطلب الحرفي المختبر هو WeatherGo مع بحث المدن وتنبؤ Open-Meteo. `detectAppKind(request)` يفحص إشارات الصفحة أولاً، ثم يعيد `weather` عندما يمر الطلب عبر كاشف الطقس؛ regression التكامل الحالي يثبت ذلك على الطلب canonical.
2. في `ReactProjectTool`، يُبنى `projectEvidence` بواسطة `readProjectSource([proj])`. وعندما يصل المصدر إلى `requestFidelityMismatch` يكون شرط weather هو وجود واحدة من `open-meteo` أو `forecast` أو `temperature` أو `WeatherApp`، مع تجاوز متعمد للأدلة الأقصر من 50 حرفاً.
3. artifact المرتبط بالجلسة `6a86a6d9ccbf423474737927` يحتوي مصدر brochure عاماً: `WeatherGo` و`TypeScript + application` وعبارات تسويقية، ولا يحتوي دلائل `open-meteo` أو `forecast` أو `temperature` أو `WeatherApp`. لذلك، إذا وصل هذا المصدر فعلاً إلى ReactProjectTool مع `appBp.engine=weather` وevidence بطول صالح، فالقيمة المتوقعة لـ`fidelityMismatch` هي `true`.
4. ترتيب `deliveryBlocked` لا يبتلع mismatch: الكود يضم `acceptanceBlocked` و`fidelityMismatch` كشرطين مستقلين، وترتيب رسالة `error` يضع `request_fidelity_mismatch` قبل `acceptance_criteria_unmet`.
5. سجل الجولة 038 لا يحتوي `request_fidelity_mismatch` أو `fidelityMismatch`، ويحتوي بدلاً منه فشل `Project Setup` عند `0/3` ثم `acceptance_criteria_unmet`. كما لا يظهر في التسلسل المسجل استدعاء ReactProjectTool قبل توقف ProjectPipeline. لذلك لا يثبت الدليل أن حارس 035 صمت بعد أن رأى artifact brochure؛ الأرجح القابل للقياس هو أن الجولة توقفت قبل بلوغ هذا الحارس، أو أن artifact المعروض لا يمثل استدعاء ReactProjectTool الذي فشل في الجولة نفسها.

## النتيجة القابلة للاختبار

لا نعدّل حارس 035 بناءً على هذه الجولة. الاختبار المطلوب أولاً هو إثبات مسار الاستدعاء: عند وصول مصدر brochure إلى ReactProjectTool مع blueprint weather، يجب أن يظهر `request_fidelity_mismatch` و`repairKind=regenerate_engine`؛ وعند توقف Project Setup قبل ReactProjectTool، يجب أن يسجل المسار سبب التوقف ومصدره دون ادعاء أن حارس الوفاء فحص artifact.

بعد تثبيت هذا الفصل، تنتقل الجراحة المعتمدة إلى الموجّه: تصنيف نداءات تأليف المحركات كقدرة عالية، عدم جعل LLM7 الخالي من المفاتيح مؤلفاً صامتاً إلا كخيار أخير معلن، إدخال Gemini وOllama في السلسلة، وتسجيل ledger للمحاولات، ثم تصحيح `Offline` ليعكس النجاح الفعلي بدلاً من اسم البيئة.
