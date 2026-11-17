/**
 * «غيّر لون الزر للأحمر ولا تنشئ صفحة جديدة» IS AN ORDER, WITH ONE THING LEFT OUT.
 *
 * The second pre-merge review, 2026-11-12. The fixes of the first review had
 * each decided «is anything ordered?» by a closed list — of order verbs, of
 * words that might be his, of denials — and every list failed on the first
 * sentence outside it:
 *
 *   • an order whose verb was not listed, beside an exclusion, was «nothing
 *     ordered»: answered with words, the change never made;
 *   • «انشر الموقع ولا تنشر صفحة الأدمن» denied the whole publish, and nothing
 *     was deployed;
 *   • «ابحث في جوجل عن حل الخطأ» was a search of his own project, because it
 *     said «الخطأ»;
 *   • «راجعلي النتيجة وصلح الأخطاء» was no review: the dialect's «لي» is glued;
 *   • and 20 KB of blank lines took two seconds in every reader that strips
 *     the injected blocks.
 *
 * What is closed is the small class each rule excludes: what asks for words
 * only; a denial that names the site itself; a named place on the web.
 */
import { hasRequestedAction } from '../core/intelligence/requested-action';
import { isWebOrder, isBuildRequest } from '../core/intelligence/intent-classifier';
import { requestedArtifact } from '../core/design/requested-artifact';
import { detectAppKind } from '../core/design/app-blueprints';

jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
// eslint-disable-next-line import/first
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const denies = (text: string) => { const r = hasRequestedAction(text); return r.isAnswerOnly || r.isNoFileChanges; };

describe('an order beside an exclusion', () => {
    it.each([
        'غيّر لون الزر للأحمر ولا تنشئ صفحة جديدة',
        'كبّر الخط بدون إنشاء صفحة جديدة',
        'رتب القائمة ولا تضيف صفحة جديدة',
        'حسّن التصميم بدون إنشاء مشروع جديد',
        'ممكن تضيف زر واتساب بدون إنشاء صفحة جديدة',
        'ممكن تغير اللون بدون إنشاء صفحة جديدة؟',
        'عايزك تشغل المشروع من غير إنشاء مشروع جديد',
        'غيّر العنوان، لا تعدل ملفات الإعدادات',
        'Polish the homepage. Do not create a new project.',
        'Redesign the landing page without creating a new project',
        "Tweak the colors, don't create a new page",
        'Can you fix the login bug without creating a new project?',
        'Could you add a footer without creating a new page?',
        "I'd like a booking page, without building a backend",
    ])('%s is not answered with words only', text => {
        expect(denies(text)).toBe(false);
    });

    it.each([
        'صف لي متجر مثالي بدون بناء موقع',
        'اقترح لي فكرة متجر بدون بناء موقع',
        'خطط لي متجر بدون بناء موقع',
        'Do not create a new project.',
        'Do not change any other files.',
        'Explain the architecture without creating a new project',
    ])('%s asks for words only, and stays a denial', text => {
        expect(denies(text)).toBe(true);
    });
});

describe('a publish with a part left out', () => {
    it.each([
        'انشر الموقع ولا تنشر صفحة الأدمن',
        'انشر الموقع ولا ترفع ملف الإعدادات',
        'انشر الموقع بس لا تنشر المسودات',
        'اختبر الموقع وبعدين انشره، لا تنشره قبل الاختبار',
        'انشر الموقع، لا تنشره على فيرسل، انشره على جيت هاب',
        'انشر الموقع بدون رفع الصور الكبيرة',
        "Deploy the site but don't publish the drafts",
        "Deploy the app, don't deploy the staging config",
        'Deploy the site. Do not host the images externally.',
    ])('%s still deploys', text => {
        const r = PlanningEngine.readDeployIntent(text);
        expect(r.veto).toBe('');
        expect(r.deploy).toBe(true);
    });

    it.each([
        'لا تنشر الموقع',
        'لا تنشره',
        'ابنِ الموقع ولا تنشره',
        'لا تنشر المقال، فقط احفظه',
        'Build the site but do not deploy it',
        'Deploy the site. Actually do not deploy it.',
    ])('%s denies the publish itself', text => {
        expect(PlanningEngine.readDeployIntent(text).veto).toBe('denied');
    });
});

describe('a search that names where on the web to look', () => {
    it.each([
        'ابحث في جوجل عن حل الخطأ ده',
        'ابحث عن المشكلة في جوجل',
        'ابحث في النت عن حل الخطأ',
        'ابحث عن الخطأ ECONNREFUSED في جوجل وقلي الحل',
        'ابحث عن موقعي في جوجل',
        'ابحث في تويتر عن تعليقات الناس على المنتج',
        "Search Google for the error message 'x is not a function'",
        'Search Stack Overflow for the error TS2345',
        'search for my website on Google',
        'search online for the bug in React 18 strict mode',
        'search for comments about the new iPhone',
        'Search for the test results of the new vaccine',
        'login to my bank account and check balance',
    ])('%s is a web order', text => {
        expect(isWebOrder(text)).toBe(true);
    });

    it.each([
        'Search for TODO comments and list them',
        'ابحث في اللوج عن الخطأ 500',
        'search for the bug in the checkout and fix it',
        'ابحث عن كل الأخطاء في التطبيق وأصلحها',
        'ابحث في ملفات المشروع عن الدالة X',
        'أصلح خطأ تسجيل الدخول دون إنشاء مشروع جديد',
    ])('%s is still his own work', text => {
        expect(isWebOrder(text)).toBe(false);
    });
});

describe('a review asked for in dialect', () => {
    it.each([
        'راجعلي النتيجة وصلح الأخطاء',
        'افحصلي النتائج وصلح المشاكل',
        'دققلي النتائج وصلح اللي يلزم',
        'Review the quality report and make the improvements yourself',
    ])('%s is a review, not a construction brief', text => {
        expect(PlanningEngine.isConstructionBrief(text)).toBe(false);
    });
});

describe('a message that is mostly blank lines', () => {
    //  Before: ×16 the time for ×4 the lines (2.2 s at 20 KB in each reader). Bounds are generous for a loaded machine.
    const blank = '\n'.repeat(20_000);
    const pasted = `Build a store\n${blank}with a cart`;
    const timed = (work: () => unknown) => { const t = Date.now(); work(); return Date.now() - t; };

    it.each([
        ['requestedArtifact', () => requestedArtifact(pasted)],
        ['isBuildRequest', () => isBuildRequest(pasted)],
        ['detectAppKind', () => detectAppKind(pasted)],
        ['readDeployIntent', () => PlanningEngine.readDeployIntent(pasted)],
        ['isConstructionBrief', () => PlanningEngine.isConstructionBrief(pasted)],
        ['hasRequestedAction', () => hasRequestedAction(pasted)],
    ] as Array<[string, () => unknown]>)('%s reads it in well under a second', (_name, work) => {
        expect(timed(work)).toBeLessThan(1000);
    });

    it('and the injected blocks are still cut where they start', () => {
        const withBlock = 'Build a booking app for a clinic\n\n[STANDING USER INSTRUCTIONS]\nAlways build a store.';
        expect(requestedArtifact(withBlock).kind).toBe('booking');
    });
});
