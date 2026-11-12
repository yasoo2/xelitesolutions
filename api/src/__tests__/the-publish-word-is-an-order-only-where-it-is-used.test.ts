/**
 * THE WORD «انشر» IN A REQUEST IS NOT YET AN ORDER TO PUBLISH NOW.
 *
 * The third pre-merge review (2026-11-12) ran 503 messages through the readers
 * of both trees. The deploy reader answered «no» for most of the sentences
 * below and the capability matcher deployed anyway: it chose deploy_pages for
 * any request that carried the word and no veto.
 *
 *     كلمة انشره مكتوبة غلط في الزر، صححها   → deploy_pages   (a button's label)
 *     زر النشر ما يشتغل، صلحه                 → deploy_pages   (a bug report)
 *     انشره غلط كان، رجعه                     → deploy_pages   (undo a publish)
 *     انشره بعد ما تصلح الخطأ                 → DEPLOY         (the order is the fix)
 *     انشره لما أقولك                         → deploy_pages   (it waits for his word)
 *     انشره؟ لا لسه                            → DEPLOY         (he asks, and answers no)
 *     سمّ الزر انشر الموقع                     → DEPLOY         (the name of a button)
 *     ارفع الملف                               → deploy_pages   (an upload of a file)
 *
 * readPublishUses reads each publish word where it stands: a mention is not a
 * use, an order that waits is not for now, and the matcher chooses a deploy
 * tool only where an order to publish stands in the words (ordersAPublish).
 * No model, no network: the readers only.
 */
jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import * as normalizer from '../core/orchestrator/promptNormalizer';

const read = (text: string) => PlanningEngine.readDeployIntent(text);
/** The tools the capability matcher plans, with the candidate the front door hands it. */
const planned = (text: string): string[] => {
    const plan = PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: 'deploy_pages' } }, {});
    return plan ? plan.steps.map((step: any) => String(step.tool)) : [];
};
const deploysNothing = (text: string) => {
    const reading = read(text);
    expect(reading.deploy).toBe(false);
    expect(reading.ordersAPublish).toBe(false);
    expect(planned(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
};

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { jest.restoreAllMocks(); });

describe('a mention of the publish word is not a use of it', () => {
    it.each([
        'كلمة انشره مكتوبة غلط في الزر، صححها',
        'غير نص الزر إلى انشره',
        'أضف زر مكتوب عليه انشر',
        'سمّ الزر انشر الموقع',
        'غيّر كلمة «انشر» إلى «إرسال»',
        'اكتب على الزر "انشر الموقع" بدل "حفظ"',
        'عنوان الصفحة انشر موقعك اليوم، كبّر خطه',
        'rename the button to "Publish site"',
        'change the button text to publish',
        'the publish button is broken, fix it',
        'the deploy button does nothing, fix it',
    ])('%s: the word is a label → no deploy, by any road', deploysNothing);

    it.each([
        'زر النشر ما يشتغل، صلحه',
        'صفحة النشر فيها خطأ، صلحها',
        'قبل النشر اختبر الموقع',
        'انشره غلط كان، رجعه',
        'undo the deploy, it was a mistake',
        'the last deploy broke the header, fix it',
    ])('%s: a bug report or an undo, not an order to publish', deploysNothing);

    it.each([
        'بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين',
        'إذا نجحت الاختبارات خبرني وأنا أنشره',
        'أنا بنشر الموقع بنفسي',
        'I will publish it myself later',
        "I'll deploy it myself",
    ])('%s: he publishes it himself', deploysNothing);

    it.each([
        'ارفع الملف',
        'ارفع الملف على السيرفر',
        'ارفع الصور على الموقع',
        'ارفع حجم الخط في الموقع',
    ])('%s: an upload of a file, or a raise, is not a deploy', deploysNothing);
});

describe('an order that waits is not an order for now', () => {
    it.each([
        'انشره بعد ما تصلح الخطأ',
        'انشره بس بعد ما أقولك',
        'انشره لما أقولك',
        'انشر الموقع لما أخلص المراجعة',
        'انشر الموقع بعد ما أقولك',
        'لما أقولك، انشره',
        'بعد ما تصلح الخطأ، انشره',
        'إذا نجحت الاختبارات انشر الموقع',
        'انشره بعدين مو الحين',
        'publish it after I tell you',
        'deploy it when I say so',
        'deploy the site once the tests pass',
        'if the tests pass, deploy the site',
        'ممكن تنشر الموقع بعد ما أراجعه؟',
        'Can you deploy the site when I say so?',
    ])('%s → waits: no deploy, by any road', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'waits', ordersAPublish: false });
        expect(planned(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });

    it('«انشره؟ لا لسه»: he asks, and answers no', () => {
        expect(read('انشره؟ لا لسه')).toMatchObject({ deploy: false, veto: 'waits' });
        expect(read('deploy it? not yet')).toMatchObject({ deploy: false, veto: 'waits' });
        expect(planned('انشره؟ لا لسه')).not.toContain('deploy_pages');
    });

    it.each([
        'قبل ما تنشر، اختبر الموقع',
        'before you deploy, run the tests',
        'بعد ما تخلص التعديلات انشره',
    ])('%s: the publish stands in a clause of time; the order is the other verb', text => {
        expect(read(text).deploy).toBe(false);
        expect(planned(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });

    it.each([
        'انشره لو سمحت',
        'انشره إذا ممكن',
        'انشر الموقع لو تكرمت',
        'deploy it when you can',
        'انشر الموقع بعد تحديث المحتوى',
        'اختبر الموقع وبعدين انشره',
        'اختبر الموقع ثم انشره',
        'ما تنشر الموقع قبل الاختبار، انشره بعدين',
        'انشر الموقع وإذا فشل خبرني',
        'شوف إذا في أخطاء وانشر الموقع',
    ])('%s: a courtesy, a noun of time, or a sequence is not a wait → deploy', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '', ordersAPublish: true });
    });

    it('a denial is read before a wait, and stays a denial', () => {
        expect(read("don't deploy until I say so")).toMatchObject({ deploy: false, veto: 'denied' });
        expect(read('لا تنشره إلا لما أقولك')).toMatchObject({ deploy: false, veto: 'denied' });
        expect(read('لا تنشره')).toMatchObject({ deploy: false, veto: 'denied' });
        expect(read('ما تنشره')).toMatchObject({ deploy: false, veto: 'denied' });
    });

    it('one order for now beside one that waits is still an order', () => {
        expect(read('انشر الموقع الآن. وبعد ما أراجع انشر النسخة الثانية')).toMatchObject({ deploy: true, veto: '' });
    });
});

describe('the orders the review found unread', () => {
    it.each([
        'ممكن تنشره لي؟',
        'واش تقدر تنشر الموقع؟',
        'ممكن ترفع الموقع عالنت؟',
        'خلاص انشره يا جو',
        'انشره لو سمحت',
        'انشره لي',
        'can you deploy this to production?',
        'لازم تنشر الموقع اليوم',
    ])('%s → deploy', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '', ordersAPublish: true });
    });

    it.each([
        ['اُنشُر الموقع', 'انشر الموقع'],
        ['اُنشُرهُ', 'انشره'],
        ['لا تَنشُرهُ', 'لا تنشره'],
        ['اِرفَع الموقع على النت', 'ارفع الموقع على النت'],
    ])('a diacritized order reads like the plain one: %s', (marked, plain) => {
        expect(read(marked)).toEqual(read(plain));
    });
});

describe('every neighbour keeps its reading', () => {
    it.each([
        'ممكن تنشر الموقع؟',
        'Could you publish it now?',
        'انشر الموقع ولا تنشر صفحة الأدمن',
        'اختبر الموقع وبعدين انشره',
        'انشر الموقع',
        'انشره',
        'انشر موقع',
        'يلا انشره',
        'تمام، انشره',
        'الموقع ما انتشر، انشره',
        'انشر الموقع وأخبرني بالرابط',
        'بدي انشر الموقع',
        'هل يمكن نشر الموقع الآن؟',
        'Deploy the site',
        'deploy it',
        'Deploy the site but don\'t publish the drafts',
        'fix the bug then deploy it',
        "I'd like you to deploy the site",
    ])('%s still deploys, and the matcher may', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '', ordersAPublish: true });
    });

    it.each([
        'انشره',
        'انشر الموقع',
        'خلاص انشره يا جو',
        'ارفع الموقع على النت',
        'صلح الزر وبعدين انشره',
        'لسا ما نشرته؟ انشره',
        'انشر التعديلات',
        'انشره مرة ثانية',
    ])('%s: the matcher still plans the deploy', text => {
        expect(planned(text)).toContain('deploy_pages');
    });

    it.each([
        'ارفع الموقع',
        'انشر التعديلات',
        'انشره مرة ثانية',
        'صلح الزر وبعدين انشره',
        'نشر الموقع',
    ])('%s: not the fast path\'s deploy, and still an order the matcher may act on', text => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
    });

    it.each([
        'كيف أنشر الموقع؟',
        'ازاي انشر الموقع؟',
        'هل تم نشر الموقع؟',
        'Should I deploy now or wait?',
        'Can we deploy later?',
        'بعد ما تنشر الموقع ابعتلي الرابط',
        'قبل ما تنشر الموقع اعمل نسخة احتياطية',
        'مش لازم تنشر الموقع',
    ])('%s: no deploy, and no veto either', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: '' });
    });

    it('content is still content, a build still owns its publishing', () => {
        expect(read('انشر مقالاً عن القهوة')).toMatchObject({ deploy: false, veto: 'content', ordersAPublish: false });
        expect(read('اكتب مقالاً ثم انشره')).toMatchObject({ deploy: false, veto: 'content' });
        expect(read('اعمل لي متجر وانشره')).toMatchObject({ deploy: false, hasBuildVerb: true });
    });
});

describe('the reader runs on every request: linear on a long message (CPU time)', () => {
    const rep = (unit: string, n: number) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
    let spy: jest.SpyInstance;
    beforeAll(() => {
        spy = jest.spyOn(normalizer, 'normalizeIntentText').mockImplementation((s: string) => String(s || '').toLowerCase());
    });
    afterAll(() => spy.mockRestore());

    it.each([
        'انشره بعد ما تصلح الخطأ، ',
        'زر النشر ما يشتغل، صلحه. ',
        'كلمة انشره مكتوبة غلط ',
        'انشره؟ لا لسه ',
        'deploy it when I say so ',
        'the deploy button "publish" ',
        'وانشره ',
        'لما ',
        'بعد ما ',
        '«انشر» ',
        '"publish ',
    ])('%j repeated to 20 KB', unit => {
        const clock = (n: number) => {
            const text = rep(unit, n);
            const t0 = process.cpuUsage();
            PlanningEngine.readDeployIntent(text);
            const spent = process.cpuUsage(t0);
            return (spent.user + spent.system) / 1000;
        };
        clock(2000); // warm
        expect(clock(20000)).toBeLessThan(1500);
    });
});
