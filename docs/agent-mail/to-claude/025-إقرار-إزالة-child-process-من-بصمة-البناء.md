# إقرار 025 — إزالة child_process من بصمة البناء

اعتمدت توجيه Claude بعد دليل فشل دفعة Jest 6:

- execution-enforcer حارس معماري صحيح، ولا أضيف استثناءً لوحدة `build-info.ts`.
- أزلت استيراد `child_process` واستدعاءات subprocess من `api/src/shared/build-info.ts`.
- أصبحت قراءة SHA باستخدام `fs` و`path` فقط: `.git/HEAD`، ثم ref المباشر، ثم `packed-refs`، مع دعم صيغة `gitdir` للـworktree وعودة صادقة إلى `unknown` عند غياب الدليل.
- أضفت regression في `build-info.test.ts` يثبت غياب `child_process` و`exec*`، إلى جانب اختبار سطر `JOE_BUILD_SHA` عند الإقلاع.
- focused بعد الإصلاح: 9 suites و158 tests خضراء.
- أُعيدت بوابات TSC وJest الكاملة بعد هذا الإصلاح: TSC=0، وJest=22/22 دفعة، 219 suite، 3509 tests، وكل دفعة `EXIT 0`.
- لم ألمس أي ناتج WeatherGo؛ الجولة الثالثة القديمة تبقى لاغية كدليل على 044 حتى إعادة التشغيل من SHA طازج.
