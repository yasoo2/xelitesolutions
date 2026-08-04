/**
 * THE HOLE THE FIELD BUG CAME THROUGH.
 *
 * Every proof in this folder tested a tool, a route, a wire. Not one of them
 * ever took an ordinary Arabic sentence — the kind actually typed into the chat
 * box — and asked «where does this land». That is exactly how «قم باستخدام
 * المتصفح وافتح على جوجل وابحث عن دوله فلسطين» reached a free-form agent that
 * typed the instruction into Google, and how the word «المتصفّح» came to mean
 * «describe» for months without anyone noticing.
 *
 * So this is a corpus, not a scenario: real phrasings, several ways of saying
 * the same thing, with the conjunctions and the compound sentences people
 * actually use. Each one must land somewhere sensible. It fails on the day a
 * regex reaches one letter too far, not weeks later in a session log.
 *
 * And two answers, checked separately:
 *   - an answer that has nothing to do with the question is DROPPED, not passed
 *     on as a result (the «عنوان IP» from the field log);
 *   - a real answer, and a short confirmation, are never touched.
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_arabic_requests.ts
 */
export {};

process.env.JWT_SECRET = process.env.JWT_SECRET || 'x';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.OFFLINE_MODE = 'true';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, detail = '') => {
    if (ok) { pass++; console.log(`  ✅ ${name}`); }
    else { fail++; console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
};

/** goal → the family of tools that would be a sensible landing. */
const CORPUS: Array<[string, RegExp]> = [
    // The field sentence, and its cousins.
    ['قم باستخدام المتصفح وافتح على جوجل وابحث عن دوله فلسطين', /^browser_search$/],
    ['افتح المتصفح وابحث عن أسعار الذهب اليوم', /^browser_search$/],
    ['ابحث لي في جوجل عن أفضل مطاعم نابلس', /^browser_search$/],
    ['دوّر لي عن طريقة عمل الكنافة', /^browser_search$/],
    ['ابغى ابحث عن سعر الدولار', /^browser_search$/],
    ['search for the population of Palestine', /^browser_search$/],

    // Live-page work: the ReAct agent is right here.
    ['سجّل الدخول على جيت هاب', /^browser_run$/],
    ['ادخل ويكيبيديا ولخّص لي عن ابن سينا', /^browser_run$/],
    ['افتح github.com وصف لي ما تراه', /^browser_run$/],

    // Inspection of a page: the specialists.
    ['افحص الروابط المكسورة في https://example.com', /^browser_check_links$/],
    ['دقّق السيو في https://example.com', /^browser_seo_audit$/],
    ['حوّل https://example.com إلى PDF', /^browser_save_pdf$/],

    // Building and editing — these must never be mistaken for a search.
    ['ابنِ لي موقعاً لمقهى اسمه الرصيف', /^(?:web_page_builder|react_project|project_pipeline)$/],
    ['اعمل لي متجر إلكتروني لبيع العطور', /^(?:web_page_builder|react_project|project_pipeline)$/],
    // From the field log: no build verb matched «قم ببناء», so with the brain
    // unreachable this fell to the failover node — which OPENED A BROWSER.
    ['قم ببناء صفحة جميله لشركةادوية ومعدات طبية', /^(?:web_page_builder|react_project|project_pipeline)$/],
    ['قم بعمل موقع لمطعم', /^(?:web_page_builder|react_project|project_pipeline)$/],
    ['أريد بناء متجر إلكتروني', /^(?:web_page_builder|react_project|project_pipeline)$/],
    ['بناء موقع لشركة محاماة', /^(?:web_page_builder|react_project|project_pipeline)$/],
    ['ما رأيك في بناء المواقع؟', /^central_answer$/],

    // Ordinary questions — answered, never executed.
    ['ما الفرق بين React و Vue؟', /^central_answer$/],
    ['كيف حالك اليوم؟', /^central_answer$/],
    ['شكراً لك يا جو', /^central_answer$/],
];

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const { judgeAnswer, ungroundedMessage } = require('../../modules/browser/grounding');

    console.log('\n[1] جُمل عربية حقيقية — أين تهبط كل واحدة');
    for (const [goal, want] of CORPUS) {
        let tool = '(none)';
        try {
            const p = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } });
            tool = String(p?.steps?.[0]?.tool || '(none)');
        } catch (e: any) { tool = `(threw: ${e?.message})`; }
        check(`«${goal.slice(0, 44)}${goal.length > 44 ? '…' : ''}» → ${tool}`, want.test(tool), `توقّعتُ ${want}`);
    }

    console.log('\n[2] ولا جملة تُكتب في خانة البحث بدل الموضوع');
    for (const [goal] of CORPUS.filter(([, w]) => String(w) === String(/^browser_search$/))) {
        const p = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } });
        const q = String(p?.steps?.[0]?.input?.query || '');
        const clean = q.length >= 2 && q.length < goal.length
            && !/(افتح|ابحث|قم\s|استخدم|المتصفح|من\s*فضلك|\bsearch\s*for\b)/i.test(q);
        check(`«${goal.slice(0, 34)}…» ⇒ «${q}»`, clean, 'ما زالت تحمل تعليمات');
    }

    console.log('\n[3] وجوابٌ لا علاقة له بالسؤال يُسقَط — لا يُنقَل');
    const FIELD_TASK = 'ابحث عن دوله فلسطين';
    const FIELD_ANSWER = 'حسناً، عنوان IP: 2a00:1d34:7472:3300:49f6:fd53:f5d6:e25c الوقت: 2026-08-04T15:38:54Z';
    const bad = judgeAnswer(FIELD_ANSWER, FIELD_TASK, { url: 'https://www.google.com/search?q=%D9%82%D9%85', title: 'Google' });
    check('جواب السجلّ الحقيقي يُحكَم عليه بأنه غير متعلّق', bad.grounded === false, JSON.stringify(bad));
    const msg = ungroundedMessage(FIELD_TASK, { url: 'https://www.google.com/search', title: 'Google' });
    check('والرسالة تقول أين وصل ولماذا لم ينقل شيئاً',
        /لم أستخرج إجابة/.test(msg) && /google/i.test(msg), msg.slice(0, 90));

    console.log('\n[4] وما هو جواب حقيقي لا يُمَسّ');
    const good = judgeAnswer(
        'فلسطين دولة في غرب آسيا، عاصمتها المعلنة القدس، وعدد سكانها نحو خمسة ملايين نسمة.',
        FIELD_TASK, { title: 'دولة فلسطين - ويكيبيديا', snippet: 'فلسطين' });
    check('جواب عن الموضوع يمرّ', good.grounded === true, JSON.stringify(good));
    check('وتأكيد قصير («تم تسجيل الدخول») لا يُحاكَم',
        judgeAnswer('تم تسجيل الدخول', 'سجّل الدخول على جيت هاب', {}).grounded === true);
    check('وجواب عن الصفحة التي يقف عليها يمرّ ولو لم يذكر السؤال',
        judgeAnswer('الصفحة تعرض قائمة المستودعات الخاصة بك مرتّبة حسب آخر تحديث.',
            'افتح جيت هاب', { title: 'GitHub', snippet: 'المستودعات مرتّبة حسب آخر تحديث' }).grounded === true);

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
