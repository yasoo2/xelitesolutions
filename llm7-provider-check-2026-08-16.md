# LLM7 provider check — 2026-08-16

مصدر الفحص: https://api.llm7.io/v1/models و https://api.llm7.io/v1/chat/completions

النتيجة: `/v1/models` أعاد HTTP 200 وقائمة نماذج chat. أول نموذج chat مجاني ظاهر كان `DeepSeek-V4-Flash-0731`، مع `usage_based_only=false` و`tools_calling=true` و`json_mode=true`. النموذج `gpt-4.1-mini` أعاد HTTP 400 برسالة `Model 'gpt-4.1-mini' is currently unavailable.` عند طلب صغير.

اختبار completion مباشر: طلب `Reply with OK` إلى `DeepSeek-V4-Flash-0731` أعاد HTTP 200 واستجابة OpenAI-compatible تحتوي `choices[0].message.content = OK`.

الاستنتاج التشغيلي: LLM7 نفسه كان متاحاً وقت الفحص، لكن fallback السابق بدأ أحياناً بنموذج forced غير موجود أو انتهى بمهلة قبل الوصول إلى نموذج مجاني فعلي. يلزم regression لاختيار نموذج متاح من discovery قبل إعادة اختبار NEXUS. لا توجد مفاتيح سرية محفوظة في هذه المذكرة.

فحص بديل: Ollama المحلي على `127.0.0.1:11434` غير متاح.

فحص proxy OpenAI: أعاد HTTP 403 HTML في ذلك الوقت.

فحص الجولة: آخر NEXUS انتهت honest blocker عند التخطيط دون ملفات؛ الذاكرة بقيت مستقرة ولم يظهر OOM.
