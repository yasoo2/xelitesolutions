/**
 * THE WORD «المتصفّح» IS WHAT BROKE THE BROWSER.
 *
 * From the user's own session log, verbatim:
 *
 *   goal:  «قم باستخدام المتصفح وافتح على جوجل وابحث عن دوله فلسطين»
 *   typed: «قم باستخدام المتصفح عن د»      ← the INSTRUCTION, into Google's box
 *   final: «حسناً، عنوان IP: 2a00:… الوقت: …»   ← and it reported success
 *
 * The cause was two lines of code, and neither of them was the model's fault.
 *
 * 1. Arabic has no \b. The «describe» pattern `صِ?ف` was unanchored, and
 *    «المتصفّح» — the word BROWSER — contains the letters «صف». So merely saying
 *    «استخدم المتصفح» read as «describe something».
 * 2. Combined with a known site («جوجل»), that sent the request to the
 *    free-form ReAct agent, which types the goal it was given. The deterministic
 *    search gate — whose own comment says «SEARCH HAS PRIORITY» — was sitting
 *    BELOW the path that swallowed it.
 *
 * Joe's query extractor was never broken: it returns «دوله فلسطين» from that
 * exact sentence. It was simply never asked.
 *
 *   [1] the sentence from the log routes to the search tool, with the clean query
 *   [2] the trap itself: «المتصفح» must not read as «describe»
 *   [3] and the fix must not eat the cases that were working — «ولخّص»,
 *       a login, a real describe request
 *   [4] the query is the topic, never the instruction, and never truncated
 *
 * Run:  JWT_SECRET=x npx tsx src/tests/manual/verify_search_routing.ts
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

const FIELD_GOAL = 'قم باستخدام المتصفح وافتح على جوجل وابحث عن دوله فلسطين';

async function main() {
    const { PlanningEngine } = require('../../core/orchestrator/PlanningEngine');
    const plan = async (goal: string) => {
        const p = await PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } });
        return p.steps[0];
    };

    console.log('\n[1] الجملة من سجلّ المستخدم — حرفياً');
    const s = await plan(FIELD_GOAL);
    check('تذهب إلى أداة البحث لا إلى الوكيل الحرّ', s.tool === 'browser_search', `${s.tool}`);
    check('والكلمة المبحوث عنها هي الموضوع: «دوله فلسطين»',
        String(s.input?.query || '').trim() === 'دوله فلسطين', JSON.stringify(s.input?.query));
    check('وليست تعليمات المستخدم', !/المتصفح|افتح|قم\s/.test(String(s.input?.query || '')), String(s.input?.query));
    check('وليست مبتورة', !/عن\s*د$/.test(String(s.input?.query || '')), String(s.input?.query));

    console.log('\n[2] الفخّ نفسه: كلمة «المتصفّح» لا تعني «صِف»');
    const AR = 'ء-ي';
    const boundary = new RegExp(`(?<![${AR}])(?:و|ف|ول|فل|ال)?(?:صِ?ف|وصف|لخّ?ص)(?![${AR}])`, 'i');
    check('«المتصفح» لا تُطابق فعل الوصف', !boundary.test('استخدم المتصفح'), 'ما زالت تُطابق');
    check('«المتصفّح» بالشدّة كذلك', !boundary.test('استخدم المتصفّح'));
    check('لكن «صف لي» تُطابق فعلاً', boundary.test('صف لي ما ترى'));
    check('و«ولخّص» تُطابق رغم واو العطف', boundary.test('وافتح ولخّص المقال'));

    console.log('\n[3] وما كان يعمل يبقى يعمل');
    const cases: Array<[string, string]> = [
        ['افتح المتصفح وابحث عن أسعار الذهب', 'browser_search'],
        ['ابحث في جوجل عن نابلس', 'browser_search'],
        ['ابحث عن دولة فلسطين', 'browser_search'],
        ['افتح ويكيبيديا ولخّص عن ابن سينا', 'browser_run'],
        ['سجّل الدخول على جيت هاب', 'browser_run'],
        ['افتح المتصفح وصف لي ما تراه في github.com', 'browser_run'],
    ];
    for (const [goal, want] of cases) {
        const st = await plan(goal);
        check(`«${goal.slice(0, 38)}…» → ${want}`, st.tool === want, `${st.tool}`);
    }

    console.log('\n[4] والاستخراج نظيف في صياغات كثيرة');
    for (const [goal, want] of [
        ['قم باستخدام المتصفح وافتح على جوجل وابحث عن دوله فلسطين', 'دوله فلسطين'],
        ['افتح جوجل وابحث عن سعر الدولار اليوم', 'سعر الدولار اليوم'],
        ['ابحث لي عن مطاعم في نابلس', 'مطاعم في نابلس'],
        ['search for climate change effects', 'climate change effects'],
    ] as Array<[string, string]>) {
        const q = PlanningEngine.extractSearchQuery(goal);
        check(`«${goal.slice(0, 34)}…» ⇒ «${want}»`, q === want, JSON.stringify(q));
    }

    console.log(`\n===== ${pass} passed, ${fail} failed =====`);
    process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
