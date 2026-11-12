/**
 * A PUBLISH AFTER JOE'S OWN WORK IS AN ORDER, A REFUSAL IS NOT — AND A FAULT IS
 * THE REQUEST ONLY WHERE IT IS THE REQUEST.
 *
 * The fourth pre-merge review (2026-11-12) ran the readers of the request over
 * twelve batches of messages and found, in the tree before this one:
 *
 *   R6  the fault veto fired on any definite noun followed by a negator, and
 *       took the tool from real orders:
 *           ابحث عن الدول التي لم توقع على اتفاقية باريس        → no browser, no web order
 *           افتح example.com وخذ سكرين شوت، الموقع مش شغال عندي  → no browser
 *           Run the tests, the last run did not finish            → no tool
 *   R5  a publish after a step of Joe's own waited like one after HIS step:
 *           انشر الموقع بعد ما تختبره · once you finish the fixes, deploy → veto 'waits'
 *   R7  a retry of a failed publish, and the Maghreb's imperative, ordered nothing:
 *           The deploy failed, try again · نشرو دغيا             → no deploy tool
 *   and, in both trees:
 *           مش عايز انشره · I do not want to deploy it now        → deploy_pages (a refusal published)
 *           inventory app: sku, name, publish date                → DEPLOY (a field name published)
 *           غير العنوان ولا تلمس ملف config.json                   → ai_write_file path=config.json
 *           انشره على الفيسبوك                                     → deploy_pages
 *
 * No model, no network: the readers only.
 */
jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { IntentParser } from '../core/intelligence/IntentParser';
import { isBrowserRequest, isWebOrder, reportsAFaultOrOrdersAFix } from '../core/intelligence/intent-classifier';
import { namedTargetFile } from '../core/orchestrator/file-intent';

const read = (text: string) => PlanningEngine.readDeployIntent(text);
/** The tools the capability matcher plans, with the candidate the front door hands it. */
const planned = (text: string, candidate = 'deploy_pages'): string[] => {
    const plan = PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: candidate } }, {});
    return plan ? plan.steps.map((step: any) => String(step.tool)) : [];
};
const deployTools = (text: string) => planned(text).filter(tool => PlanningEngine.isSiteDeployTool(tool));
const toolsOf = async (text: string) => (await IntentParser.parse(text, {} as any)).requiredTools || [];
const cpuMs = (fn: () => unknown): number => {
    const t0 = process.cpuUsage();
    fn();
    const spent = process.cpuUsage(t0);
    return (spent.user + spent.system) / 1000;
};

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { jest.restoreAllMocks(); });

describe('R6 — a fault is the request only where it is the request', () => {
    it.each([
        'الصورة ما تظهر، صلحها',
        'زر النشر ما يشتغل، صلحه',
        'التقرير ما يطلع PDF، صلحه',
        'تسجيل الدخول ما يشتغل، صلحه',
        'the button doesn\'t work, fix it',
        'The image does not show, fix it',
        'البحث لا يعمل',
        'الزر مش شغال',
        // the negation is the sentence's own, after the relative clause
        'الزر اللي في الهيدر مش شغال',
        // a repair ordered of the thing a relative clause describes
        'the button that doesn\'t work, fix it',
        'الزر اللي ما يشتغل صلحه',
        // a topic, then its fault: no deed opens it
        'صفحة الدخول، الزر ما يشتغل',
        'صور المنتجات ما تظهر',
        // a making verb with a thing that is already there is a repair of it
        'سوي الزر يشتغل، مش شغال',
        'the upload button doesn\'t work',
        'Download link is broken',
    ])('%s: a fault or a fix → the veto holds, no browser, no web order', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(true);
        expect(isBrowserRequest(text).isBrowser).toBe(false);
        expect(isWebOrder(text)).toBe(false);
    });

    it.each([
        'الصورة ما تظهر، صلحها',
        'زر النشر ما يشتغل، صلحه',
        'التقرير ما يطلع PDF، صلحه',
        'the button doesn\'t work, fix it',
    ])('%s: no tool is named by a noun in it', async text => {
        expect(await toolsOf(text)).toEqual([]);
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'ابحث في الويب عن الأفلام التي لم تعرض بعد',
        'ابحث عن الدول التي لم توقع على اتفاقية باريس',
        'ابحث عن المطاعم اللي مش غالية في عمان',
        'Search the web for phones that are not working with 5G',
        'search online for the bug that was never fixed in Windows',
    ])('%s: the negation describes what to look for → the browser, a web order', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
        expect(isBrowserRequest(text).isBrowser).toBe(true);
        expect(isWebOrder(text)).toBe(true);
    });

    it.each([
        'افتح example.com وخذ سكرين شوت، الموقع مش شغال عندي',
        'ممكن تفتح example.com وتاخذ سكرين شوت، الموقع مش شغال',
        'اعمل لي صورة شعار للمطعم، الشعار القديم مش حلو',
        'Run the tests, the last run did not finish',
        'انشر الموقع، الرابط القديم لا يعمل',
        'شغل المشروع، السيرفر القديم مش شغال',
        'Deploy the site, the old link stopped working',
        'Take a screenshot of the page, the footer is not showing',
    ])('%s: an order with a deed of its own; the fault is its reason', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
    });

    it('the orders keep their routes', async () => {
        expect(isBrowserRequest('افتح example.com وخذ سكرين شوت، الموقع مش شغال عندي').isBrowser).toBe(true);
        expect(await toolsOf('اعمل لي صورة شعار للمطعم، الشعار القديم مش حلو')).toEqual(['generate_image']);
        expect(read('انشر الموقع، الرابط القديم لا يعمل')).toMatchObject({ deploy: true, veto: '' });
        expect(read('Deploy the site, the old link stopped working')).toMatchObject({ deploy: true, veto: '' });
    });

    it('a fault said of an address he sends Joe to is still the browser\'s; a repair of it is not', () => {
        expect(isBrowserRequest('الموقع مش شغال، افتح example.com وشوف').isBrowser).toBe(true);
        expect(isBrowserRequest('موقعي mysite.com ما يفتح، صلحه').isBrowser).toBe(false);
    });
});

describe('R5 — a publish after his own work is an order, and it does not skip the work', () => {
    it.each([
        'once you finish the fixes, deploy',
        'Publish it after you add the contact page',
        'publish the site after you fix the header',
        'once you have fixed the header, publish the site',
        'when you are done with the header, deploy it',
        'انشر الموقع بعد ما تختبره',
        'انشره بعد ما تصلح الخطأ',
        'بعد ما تصلح الخطأ، انشره',
        'بعد ما تخلص التعديلات انشر الموقع',
        'لما تخلص من التعديلات انشره',
        'انشر الموقع بعد ما تضيف صفحة التواصل',
        'ممكن تنشر الموقع بعد ما تختبره؟',
    ])('%s → follows: not a wait, and never a deploy alone', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'follows' });
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'انشر بعد ما تخلص',
        'لما تخلص انشره',
        'انشره لما تخلص يا جو',
        'انشره اول ما تخلص',
    ])('%s: no work is named, only that he is finished → the order, for now', text => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
        expect(deployTools(text)).toEqual(['deploy_pages']);
    });

    //  The reading only: the matcher that makes a plan of it reads "when" as a question's word.
    it.each([
        'publish when you\'re done',
        'publish it when you\'re ready',
        'publish as soon as you finish',
        'publish when you have a moment',
        'deploy it once you finish',
    ])('%s: the same in English → an order for now', text => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
    });

    it.each([
        'انشره لما أقولك',
        'انشره بس بعد ما أقولك',
        'لما اخلص المراجعة انشره',
        'عقب ما اشيك عليه انشره',
        'اول ما اوافق انشر',
        'انشره لما يخلص المدير المراجعة',
        'انشره بعد ما توافق الادارة',
        'انشره بعد ما تجي الموافقة',
        'When I approve, publish it',
        'publish once I give the go-ahead',
        'publish as soon as I confirm',
        'deploy once you get my approval',
        'when I say so, deploy',
        'deploy when I say so',
        'publish it before you add the page',
        'deploy it once the tests pass',
        'ممكن تنشر الموقع بعد ما أراجعه؟',
    ])('%s → waits: his own act, his word, or a condition', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'waits', ordersAPublish: false });
        expect(deployTools(text)).toEqual([]);
    });

    it('«بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين»: he publishes it himself', () => {
        const text = 'بعد ما أراجع التصميم بنشره أنا، لا تسوي شي الحين';
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(deployTools(text)).toEqual([]);
    });

    it('a sequence and a noun of time still deploy', () => {
        expect(read('Deploy after the tests pass')).toMatchObject({ deploy: true, veto: '' });
        expect(read('انشر الموقع بعد تحديث المحتوى')).toMatchObject({ deploy: true, veto: '' });
        expect(planned('اختبر الموقع ثم انشره')).toEqual(['api_tester', 'deploy_pages']);
    });
});

describe('R7 — a retry of the publish and the imperative without its alif are orders', () => {
    it.each([
        'The deploy failed, try again',
        'retry the deploy',
        'النشر فشل، جرب مرة ثانية',
        'فشل النشر، حاول مرة ثانية',
        'النشر ما زبط، عيد المحاولة',
        'اعد النشر',
        'جرب النشر مرة ثانية',
        'نشرو دغيا',
        'نشرو',
        'نشروه دابا',
        'يا جو نشرو دابا',
    ])('%s → deploy_pages', text => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
        expect(deployTools(text)).toEqual(['deploy_pages']);
    });

    it.each([
        'the deploy failed',
        'The deploy failed again',
        'The deploy failed, don\'t try again',
        'The build failed, try again',
        'النشر فشل',
        'النشر فشل، لا تحاول مرة ثانية',
        'زر النشر ما يشتغل، جرب مرة ثانية',
        'نشرت الموقع امس وطلع خطأ 404',
        'النشر يكون بعد موافقة المدير',
        'الغِ النشر',
        'تم نشره',
        'نشره امس',
        'نشرو الموقع امس',
    ])('%s: a report, a denial, a cancel or a past → no deploy', text => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(deployTools(text)).toEqual([]);
    });

    it('"the publish", "the deployment" are read the same (the matcher ranks no tool for these words)', () => {
        expect(read('the publish failed, retry')).toMatchObject({ veto: '', ordersAPublish: true });
        expect(read('the deployment failed, try it again')).toMatchObject({ veto: '', ordersAPublish: true });
    });

    it('a retry that waits for him waits', () => {
        expect(read('The deploy failed, try again after I fix the config')).toMatchObject({ deploy: false, veto: 'waits', ordersAPublish: false });
    });
});

describe('a refusal does not publish', () => {
    it.each([
        'مش عايز انشر دلوقتي',
        'مش عايز انشره',
        'مابي انشره الحين',
        'ما ابغى انشره',
        'مو حاب انشره',
        'ما بدي انشر الموقع هلق',
        'لا اريد ان انشر الموقع',
        'مش عاوزك تنشره',
        'I don\'t want to publish yet',
        'I do not want to deploy it now',
        'we don\'t need to deploy yet',
        'I\'m not ready to publish',
    ])('%s → denied', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'denied', ordersAPublish: false, deniesExternalPublish: true });
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'بدي انشر الموقع',
        'لازم تنشره',
        'لا، انشره',
        'I\'d like to publish it',
    ])('%s: the wish itself is still the order', text => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
    });

    it('«مش لازم تنشر الموقع» says only that he need not: no deploy, and no denial either', () => {
        expect(read('مش لازم تنشر الموقع')).toMatchObject({ deploy: false, veto: '' });
    });
});

describe('a field, a protected file and a social network are not a deploy', () => {
    it.each([
        'inventory app with fields: sku, name, qty, publish date, image',
        'inventory app: sku, name, publish date',
        'blog app with fields: title, body, publish date',
        'server config: host, port, user',
        'columns: id, host',
        'add a publish date field',
    ])('%s: the publish word names a field', text => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
    });

    it('"host" with what it hosts is still the verb', () => {
        expect(read('host the site on github pages')).toMatchObject({ deploy: true, veto: '' });
        expect(read('Host it').ordersAPublish).toBe(true);
    });

    it.each([
        'انشره على الفيسبوك',
        'انشره على تويتر',
        'انشره على انستغرام',
        'انشره على وسائل التواصل',
        'انشر الموقع على فيسبوك',
        'ممكن تنشره على فيسبوك؟',
        'publish it on facebook',
    ])('%s: a post on a social network → no deploy tool', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'content', ordersAPublish: false });
        expect(deployTools(text)).toEqual([]);
    });

    it('a site is still deployed where no network is its place', () => {
        expect(read('انشر صفحة تواصل معنا').veto).toBe('');
        expect(read('انشر الموقع على جيت هاب')).toMatchObject({ deploy: true, veto: '' });
        expect(read('Deploy the site and share it on twitter')).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        'غير العنوان ولا تلمس ملف config.json',
        'عدل الهيدر ولا تعدل ملف settings.json',
        'غير العنوان ما عدا ملف config.json',
        'update the title without touching the file named config.json',
    ])('%s: the file he protects is never the file to write', text => {
        expect(namedTargetFile(text)).toBeNull();
        const plan = PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: 'ai_write_file' } }, {});
        for (const step of plan?.steps || []) expect(JSON.stringify(step.input?.path || '')).not.toMatch(/config\.json|settings\.json/);
    });

    it('the file an order names is still its target', () => {
        expect(namedTargetFile('Create a file named hello.py that prints 1 to 5')).toBe('hello.py');
        expect(namedTargetFile('أنشئ ملف notes.md فيه عنوان')).toBe('notes.md');
        expect(namedTargetFile('Create a file named a.txt. Do not change other files.')).toBe('a.txt');
        expect(namedTargetFile('do not create notes.md, write a file named out.md')).toBe('out.md');
        expect(namedTargetFile('don\'t worry, create a file named a.txt')).toBe('a.txt');
        expect(namedTargetFile('لا تنشئ مشروع جديد، انشئ ملف notes.md')).toBe('notes.md');
        expect(namedTargetFile('عدل ملف a.js ولا تلمس ملف b.js')).toBe('a.js');
    });
});

describe('what the review verified stays as it was', () => {
    it.each([
        'زر "نشر" لونه باهت',
        'غير كلمة نشر إلى إرسال',
        'غير نص الزر إلى انشره',
        'سمّ الزر انشر الموقع',
        'أضف زر مكتوب عليه انشر',
        'كلمة انشره مكتوبة غلط في الزر، صححها',
        'الغِ النشر',
        'انشره غلط كان، رجعه',
    ])('%s: a mention plans no deploy', text => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'ما تنشرش دابا',
        'ماتنشروش دلوقتي',
        'متنشرش',
        'بلاش تنشر',
        'can you not deploy yet',
    ])('%s → denied', text => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'denied' });
    });

    it.each([
        'ممكن تنشره لي؟',
        'واش تقدر تنشر الموقع؟',
        'ممكن ترفع الموقع عالنت؟',
        'can you deploy this to production?',
        'خلاص انشره يا جو',
        'انشره لو سمحت',
        'انشره هلأ',
        'اُنشُر الموقع',
    ])('%s → deploy', text => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '', ordersAPublish: true });
    });
});

describe('the readers stay linear', () => {
    const rep = (unit: string, chars: number) => unit.repeat(Math.ceil(chars / unit.length));
    let nonce = 0;
    it.each([
        ['waits and follows', 'انشره بعد ما تختبره، وبعد ما اراجع انشره. '],
        ['refusals', 'مش عايز انشره الحين ولا بدي انشر الموقع، '],
        ['retries', 'النشر فشل، جرب مرة ثانية. the deploy failed, try again. '],
        ['social and fields', 'fields: host, publish date. انشره على الفيسبوك، '],
        ['relative negations', 'ابحث عن الدول التي لم توقع والافلام اللي مش معروضة that are not working '],
        ['protected files', 'غير العنوان ولا تلمس ملف config.json، do not touch the file named a.json, '],
    ])('20 KB of %s is read in well under a second and a half', (_name, unit) => {
        const text = () => `${rep(unit, 20000)} ${nonce++}`;
        expect(cpuMs(() => PlanningEngine.readDeployIntent(text()))).toBeLessThan(1500);
        expect(cpuMs(() => reportsAFaultOrOrdersAFix(text()))).toBeLessThan(1500);
        expect(cpuMs(() => namedTargetFile(text()))).toBeLessThan(1500);
    });
});
