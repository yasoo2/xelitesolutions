/**
 * A VAGUE REQUEST GETS A QUESTION, NOT A LECTURE.
 *
 * Measured live on the owner's machine. He wrote, in full:
 *
 *     «بدي شي أتابع فيه ديوني»
 *
 * That is a request to build, with nothing to build from. The right answer is
 * one question — «ماذا تريد أن تسجّل لكلّ دين؟». What he got was a financial
 * adviser:
 *
 *     «لبدء العمل، أحتاج إلى بعض المعلومات الإضافية:
 *      إجمالي مبلغ الديون … معدلات الفائدة … المدفوعات الشهرية الدنيا …
 *      الدخل الشهري … يمكننا استخدام استراتيجيات مثل طريقة التلال
 *      (تسديد الديون ذات أعلى معدلات فائدة أولاً) أو طريقة الثلج»
 *
 * Nothing was built and nothing was asked that would let anything be built.
 *
 * The clarify gate exists precisely for this and did not fire, because it
 * required a noun from its OWN private list — «موقع», «تطبيق», «متجر» — and
 * he had written «شي». A sixth vocabulary answering a question that already
 * had a shared answer.
 *
 * The repair is a shape, not a list: a tracking verb with an object is a
 * build-shaped request whatever the object is called. The VERB is the closed
 * class; the object never is. And «enough detail» for such a request means
 * one thing only — that he said what it will HOLD.
 *
 * ⛔ 2026-11-03 — the owner: «اريد جو مستقل … بدون تدخل بشري». A thin request is
 * no longer stopped on a question: it is built with Joe's own choices, and the
 * gate says up front what he did not say and what Joe is choosing. The reading
 * below — what counts as thin, and what his thing is — is unchanged; the
 * sentence it produces is the decision instead of the question.
 */

import { isVagueBuildRequest, decisionNote, clarifyGate } from '../core/orchestrator/clarify';

describe('something he says he will keep track of is something to be built', () => {
    // POSITIVE — the live request, and the same shape with objects in no list.
    it.each([
        ['الطلب الحيّ', 'بدي شي أتابع فيه ديوني'],
        ['شحنات', 'بدي أتابع شحناتي'],
        ['نوق', 'بدي أسجل نوقي'],
        ['كلمة بلا معنى', 'بدي أتابع الزنابق تبعي'],
        ['English', 'I want to track my shipments'],
        ['English manage', 'I need to manage my clients'],
    ])('%s is recognised as thin, not answered', (_label, ask) => {
        expect(isVagueBuildRequest(ask)).toBe(true);
    });

    // POSITIVE — the gate's original case still works.
    it('a bare build request is still recognised as thin', () => {
        expect(isVagueBuildRequest('ابن لي موقع')).toBe(true);
    });

    // NEGATIVE — a request that says what it holds is complete: build it, do not ask.
    it.each([
        ['العيادة', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'],
        ['English clinic', 'I want a table to record my clients: name, phone and email'],
        ['كشف ديون بالأعمدة', 'بدي أتابع ديوني: اسم المدين والمبلغ وتاريخ الدين'],
    ])('%s is built without questions', (_label, brief) => {
        expect(isVagueBuildRequest(brief)).toBe(false);
    });

    // NEGATIVE — a detailed build request is not interrogated either.
    it('a detailed site request is not asked about', () => {
        expect(isVagueBuildRequest('بدي متجر لبيع القهوة فيه صفحة منتجات وصفحة أسعار وسلة شراء')).toBe(false);
    });

    // NEGATIVE — and things that are not build requests at all stay out.
    it.each([
        ['سؤال', 'ما الفرق بين React وVue؟'],
        ['بحث', 'ابحث لي عن سعر الدولار'],
        ['شكوى', 'الجدول اللي عملته أمس صار بطيء'],
    ])('%s is neither built nor questioned', (_label, ask) => {
        expect(isVagueBuildRequest(ask)).toBe(false);
    });
});

/**
 * …AND WHAT JOE CHOOSES IS ABOUT HIS THING, NOT ABOUT SECTIONS AND COLOURS.
 *
 * Measured live once the gate fired. Joe stopped lecturing him about interest
 * rates — and asked this instead, for a man who wants to track his debts:
 *
 *     What is the site about? (a restaurant? a store? a portfolio?)
 *     Which sections do you want? Any colours? One page or multi-page?
 *
 * Right instinct, wrong questions: the list was a fixed catalogue that knew
 * only one kind of request.
 *
 * There is exactly one thing Joe cannot build without and must never invent —
 * WHAT EACH ROW HOLDS. So that is what Joe says he is choosing, and it names
 * his own word back to him, in the language of the interface he is looking at.
 */
describe('the decision names his own thing', () => {
    const q = (goal: string, lang = 'ar'): string => decisionNote(goal, lang);

    // POSITIVE — his word comes back, in objects that are in no list.
    it.each([
        ['ديون', 'بدي شي أتابع فيه ديوني', 'ar', 'ديوني'],
        ['نوق', 'بدي أسجل نوقي', 'ar', 'نوقي'],
        ['زنابق (بلا معنى)', 'بدي أتابع الزنابق تبعي', 'ar', 'الزنابق'],
        ['shipments', 'I want to track my shipments', 'en', 'shipments'],
        ['clients', 'I need to manage my clients', 'en', 'clients'],
    ])('%s is named in the decision', (_label, goal, lang, word) => {
        expect(q(goal, lang)).toContain(word);
    });

    // POSITIVE — the fields each row holds, not a website's sections.
    it('chooses what each row holds, not what sections a site has', () => {
        const decided = q('بدي شي أتابع فيه ديوني', 'ar');
        expect(decided).toMatch(/يُسجَّل لكل واحد/);
        expect(decided).not.toMatch(/أقسامه|ألوانه|صفحة واحدة/);
    });

    // POSITIVE — the interface owns the wording even when he writes Arabic.
    it('an English interface says it in English about his Arabic word', () => {
        const decided = q('بدي شي أتابع فيه ديوني', 'en');
        expect(decided).toContain('You did not say what each of your');
        expect(decided).toContain('ديوني');
    });

    // NEGATIVE — a bare site request is about the site's subject and sections.
    it('a bare build request is about the site, not about rows', () => {
        const decided = q('ابن لي موقع', 'ar');
        expect(decided).toMatch(/أقسامه/);
        expect(decided).not.toMatch(/يُسجَّل/);
    });

    // NEGATIVE — no language must not silently become Arabic for an English request.
    it('an English request without a language does not default to Arabic', () => {
        //  What this test is for is the LANGUAGE: an English request with
        //  no interface language must not come back in Arabic.
        const decided = decisionNote('I want a table', '');
        expect(decided).toMatch(/You did not say what your table records/);
        expect(decided).not.toMatch(/[؀-ۿ]/);
    });

    it('a thin request is built: the gate decides, and nothing waits for an answer', () => {
        const first = clarifyGate('I want a table', '');
        expect(first).toEqual({ kind: 'decide', note: decisionNote('I want a table', '') });
        //  The next message is a message of its own, never an answer merged
        //  into a remembered brief.
        expect(clarifyGate('blue and green', '')).toEqual({ kind: 'pass' });
    });
});

/**
 * A VERB HE INVENTED IS STILL A VERB.
 *
 * Manus attacked the tracking gate with «بدي أفهرس ديوني» and was right: a
 * closed list of VERBS is the same defect as a closed list of nouns, one coat
 * further in. «أفهرس» is ordinary Arabic; it was simply not on the list.
 *
 * The obvious repair — any word starting أ/ا/ي/ت is a verb — is WORSE than the
 * defect. A word beginning with «ا» is far more often a noun in his sentences,
 * starting with the definite article: «الاسم», «الكمية», «التاريخ» — every
 * column he ever names. That rule would interrogate him about columns for «بدي
 * الاسم والمبلغ».
 *
 * What makes «أفهرس ديوني» a tracking request is not the verb alone: it is a
 * verb followed by something he says is HIS. Arabic marks that with a
 * possessive suffix — «ـي» in ديوني، شحناتي، زنابقي — and that suffix is a
 * closed class. Verb shape AND owned object. Either alone is noise.
 */
describe('an invented verb still gets the right decision', () => {
    // POSITIVE — a real-but-unlisted verb, and a verb that means nothing at all.
    it.each([
        ['أفهرس', 'بدي أفهرس ديوني', 'ديوني'],
        ['أزغرم (بلا معنى)', 'بدي أزغرم زنابقي', 'زنابقي'],
        ['أرشف', 'بدي أرشف فواتيري', 'فواتيري'],
    ])('%s names «%s» in the decision', (_label, goal, word) => {
        expect(isVagueBuildRequest(goal)).toBe(true);
        const decided = decisionNote(goal, 'ar');
        expect(decided).toContain(word);
        expect(decided).toMatch(/يُسجَّل لكل واحد/);
    });

    // NEGATIVE — the trap the obvious repair would have walked into.
    it.each([
        ['أعمدة تبدأ بالألف', 'بدي الاسم والمبلغ والتاريخ'],
        ['سؤال', 'بدي أعرف كم الساعة'],
        ['شكوى', 'الجدول اللي عملته أمس صار بطيء'],
        ['طلب كامل', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'],
    ])('%s is not a tracking request', (_label, goal) => {
        expect(isVagueBuildRequest(goal)).toBe(false);
    });

    // NEGATIVE — a verb with no owned object is not enough on its own.
    it('a verb without something of his is not tracking', () => {
        expect(decisionNote('بدي أفهرس الكتب', 'ar')).not.toMatch(/يُسجَّل لكل واحد/);
    });
    /**
     *  AND THE OBJECT HAS TO FOLLOW THE VERB, NOT MERELY EXIST.
     *
     *  Manus hit this on his side and I had the same hole on mine. «ابنِ
     *  تطبيقاً لإدارة العملاء مع بحث وتصفية وإجمالي» ends in «إجمالي», which
     *  carries the same «ـي» as «ديوني» — and is not a possessive at all, it
     *  is a nisba adjective. Anywhere in the sentence was enough, so a CRM
     *  request was asked what it wanted to record for each «ِ تطبيقاً».
     *
     *  A man who says «أفهرس ديوني» puts the thing right after the verb.
     *  Position is the evidence, and it costs no vocabulary.
     */
    it.each([
        ['CRM', 'ابنِ تطبيقاً لإدارة العملاء مع بحث وتصفية وإجمالي'],
        ['نسبة في آخر الجملة', 'بدي تطبيق فيه بحث وتصفية وإجمالي'],
    ])('%s is not a tracking request', (_label, goal) => {
        expect(decisionNote(goal, 'ar')).not.toMatch(/يُسجَّل لكل واحد/);
    });
});

/**
 * AND «بدي جدول» IS A REQUEST TOO.
 *
 * The emptiest thing a man can type — «بدي جدول» — was not asked a single
 * question. It went straight to the builder with nothing to build from, and
 * the builder invented a stock table for him.
 *
 * The gate carried its OWN list of build verbs — ابنِ, انشئ, اعمل, build,
 * create — and «بدي» was not on it. A seventh private answer to «is this a
 * build?», in the one place whose entire job is to notice a request too thin
 * to build.
 *
 * Two more things fell out of measuring it:
 *
 *   · «أريد» — the correct spelling, with the hamza — was in no desire list at
 *     all. Only «اريد» was. Every request he types the proper way was invisible.
 *   · Two descriptive words was too low a bar. «بدي جدول للمواعيد» names a
 *     subject and not one column, and a table with no columns can only be
 *     invented.
 */
describe('a request too thin to build is recognised', () => {
    // POSITIVE — an artefact named and nothing else, in every phrasing.
    it.each([
        ['جدول', 'بدي جدول'],
        ['جدول بموضوع', 'بدي جدول للمواعيد'],
        ['تطبيق', 'بدي تطبيق'],
        ['أريد بالهمزة', 'أريد صفحة'],
        ['متجر', 'بدي متجر'],
        ['English', 'I want a table'],
        ['أمر', 'ابن لي موقع'],
    ])('%s is recognised as thin', (_label, goal) => {
        expect(isVagueBuildRequest(goal)).toBe(true);
    });

    // NEGATIVE — a request that says enough is built without an interview.
    it.each([
        ['أعمدة صريحة', 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد'],
        ['متجر مفصّل', 'بدي متجر لبيع القهوة فيه صفحة منتجات وصفحة أسعار وسلة شراء'],
        ['CRM بقدرات', 'ابنِ تطبيقاً لإدارة العملاء مع بحث وتصفية وإجمالي'],
    ])('%s is built without questions', (_label, goal) => {
        expect(isVagueBuildRequest(goal)).toBe(false);
    });

    // NEGATIVE — and what is not a build is never interviewed.
    it.each([
        ['بحث', 'ابحث لي عن سعر الدولار'],
        ['سؤال', 'ما الفرق بين React وVue؟'],
        ['شكوى', 'الجدول اللي عملته أمس صار بطيء'],
        ['دخول', 'سجّل دخولي بالإيميل'],
    ])('%s is neither built nor interviewed', (_label, goal) => {
        expect(isVagueBuildRequest(goal)).toBe(false);
    });
});
