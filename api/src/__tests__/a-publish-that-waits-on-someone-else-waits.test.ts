/**
 * A PUBLISH THAT WAITS ON SOMEONE ELSE WAITS — AND A REFUSED DEPLOY IS NOT A REQUEST
 * FOR THE NEXT TOOL ON THE LIST.
 *
 * The fifth pre-merge review (2026-11-12) read the deploy readers against the two
 * trees before them and found:
 *
 *   1  a publish conditioned on another party deployed at once:
 *          Publish it after the client approves · …after the client pays
 *          Publish it after management signs off · …after the tests pass   → DEPLOY
 *      and a wait for another party was read as a step of Joe's own:
 *          انشره بعد ما تدفع الشركة · انشره بعد ما تشوف رد العميل
 *          Publish it after you receive the logo from the client           → 'follows'
 *   2  a social network named anywhere after the verb cancelled a real deploy:
 *          Deploy my twitter clone · انشر موقع يشبه فيسبوك
 *          Deploy the app with the WhatsApp button                         → veto 'content'
 *   4  a refused deploy fell through to the runner-up tool:
 *          columns: id, deploy target, delete flag, run count, send date   → delete_file
 *          مش عايز انشر الصور · انشره على الفيسبوك مع صورة للشعار          → generate_image
 *   5  a retry re-deployed when something else had failed:
 *          The deploy worked. The login failed, try again                  → deploy_pages
 *   9  an order glued to a field list was swallowed by the list:
 *          الحقول: الاسم والايميل وانشره · fields: name, email and deploy it → no plan
 *
 * No model, no network: the readers only.
 */
jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const read = (text: string) => PlanningEngine.readDeployIntent(text);
const planned = (text: string, candidate = 'deploy_pages'): string[] => {
    const plan = PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: candidate } }, {});
    return plan ? plan.steps.map((step: any) => String(step.tool)) : [];
};
const deployTools = (text: string) => planned(text).filter(tool => PlanningEngine.isSiteDeployTool(tool));
const cpuMs = (fn: () => unknown): number => {
    const t0 = process.cpuUsage();
    fn();
    const spent = process.cpuUsage(t0);
    return (spent.user + spent.system) / 1000;
};

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { jest.restoreAllMocks(); });

describe('1 — a publish that waits on someone else waits', () => {
    it.each([
        'Publish it after the client approves',
        'Publish it after the client pays',
        'Publish it after management signs off',
        'Publish it after the tests pass',
        'Deploy after the tests pass',
        'Deploy it once the tests pass',
        'Publish the site after legal reviews it',
        'Deploy the app when QA approves',
        'Publish it after approval',
        'Publish it after the payment',
        'Deploy it after the client\'s approval',
        'Publish it after my manager has checked it',
        'After the client approves, publish it',
        'When the client pays, deploy the site',
        'انشره بعد ما يدفع العميل',
        'انشره بعد ما توافق الإدارة',
        'انشره بعد ما يرد العميل',
        'انشره لما يجي رد الزبون',
        'انشره بعد موافقة العميل',
        'انشر الموقع بعد الدفع',
        'انشر الموقع بعد ما تنجح الاختبارات',
    ])('another party\'s act, an approval, a payment, a result: %s', (text) => {
        const reading = read(text);
        expect({ deploy: reading.deploy, veto: reading.veto }).toEqual({ deploy: false, veto: 'waits' });
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'انشره بعد ما تدفع الشركة',
        'انشره بعد ما تشوف رد العميل',
        'انشره بعد ما تستلم الشعار من العميل',
        'انشره لما توصلك الصور من المصمم',
        'انشره لما تجهز الصور',
        'Publish it after you receive the logo from the client',
        'Deploy it once you hear back from the client',
        'Deploy it after you see the client\'s reply',
    ])('a verb that addresses Joe, and a thing he can only wait for: %s', (text) => {
        expect(read(text).veto).toBe('waits');
        expect(planned(text)).toEqual([]);
    });

    it.each([
        'انشره بعد ما تصلح الخطأ',
        'انشر الموقع بعد ما تختبره',
        'انشره بعد ما تضيف صفحة العميل',
        'Publish it after you fix the header',
        'Publish it after you add the contact page',
        'once you finish the fixes, deploy',
    ])('a step of his own is still followed by it: %s', (text) => {
        expect(read(text).veto).toBe('follows');
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'Run the tests and deploy if they pass',
        'شغل الاختبارات وانشره لو نجحت',
    ])('the result of a deed the same words order is that deed\'s: %s', (text) => {
        expect(read(text).veto).toBe('follows');
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'Publish the site after the content update',
        'Deploy the site after the latest changes',
        'Deploy after the migration',
        'Deploy the site after the bug fixes',
        'انشر الموقع بعد تحديث المحتوى',
        'Deploy it when you can',
        'Deploy it when ready',
        'Deploy it when you\'re done',
        'انشره بعد ما تخلص',
    ])('a noun of his own work, a courtesy and "when you are done" hold nothing back: %s', (text) => {
        const reading = read(text);
        expect({ deploy: reading.deploy, veto: reading.veto }).toEqual({ deploy: true, veto: '' });
    });
});

describe('2 — a network is a venue only where it is the place', () => {
    it.each([
        'Deploy my twitter clone',
        'انشر موقع يشبه فيسبوك',
        'انشر الموقع اللي فيه زر واتساب',
        'Deploy the app with the WhatsApp button',
        'Deploy my social network app',
        'Publish the site, it has a telegram bot',
        'Deploy the site and share it on twitter',
        'انشر الموقع على جيت هاب',
        'Deploy the site on netlify',
        'Deploy the app to vercel',
        'Publish the site to github pages',
    ])('a site is deployed: %s', (text) => {
        const reading = read(text);
        expect({ deploy: reading.deploy, veto: reading.veto }).toEqual({ deploy: true, veto: '' });
    });

    it.each([
        'انشر تطبيق السوشيال ميديا',
        'انشر تطبيق وسائل التواصل',
    ])('the app he names is an order to publish it: %s', (text) => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
        expect(planned(text)).toEqual(['deploy_pages']);
    });

    it.each([
        'انشره على الفيسبوك',
        'انشره على تويتر',
        'انشره على انستغرام',
        'انشره على وسائل التواصل',
        'انشرها على مواقع التواصل الاجتماعي',
        'انشره عالفيسبوك',
        'انشره في تويتر',
        'انشره بالفيسبوك',
        'انشره على صفحتي في فيسبوك',
        'ممكن تنشره على الفيسبوك؟',
        'Publish it on my facebook page',
        'Publish it on social media',
        'Publish it to LinkedIn',
    ])('a post goes to the network: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'content' });
        expect(deployTools(text)).toEqual([]);
    });
});

describe('4 — a refused deploy is not a request for the next tool', () => {
    it.each([
        'columns: id, deploy target, delete flag, run count, send date',
        'مش عايز انشر الصور',
        'انشره على الفيسبوك مع صورة للشعار',
        'I don\'t want to deploy the images',
        'انشره لما أقولك',
        'fields: sku, name, publish date',
    ])('no tool: %s', (text) => {
        expect(planned(text)).toEqual([]);
        expect(planned(text, '')).toEqual([]);
    });

    it('another deed ordered in a clause of its own keeps its tool', () => {
        expect(planned('Don\'t deploy, just delete the file temp.txt', 'delete_file')).toEqual(['delete_file']);
        expect(read('Don\'t deploy, just delete the file temp.txt').besideThePublish).toMatch(/delete the file temp\.txt/);
        expect(read('انشره على الفيسبوك مع صورة للشعار').besideThePublish).toBe('');
        expect(read('columns: id, deploy target, delete flag, run count, send date').besideThePublish).toBe('');
    });

    it('the work a publish follows keeps its tool', () => {
        expect(planned('Publish it after you fix the header', 'browser_ui_fix')).toContain('browser_ui_fix');
    });
});

describe('5 — a retry repeats the publish only when the publish is what failed', () => {
    it.each([
        'The deploy worked. The login failed, try again',
        'The deploy succeeded but the login failed, try again',
        'The deploy failed and the login failed, try again',
        'النشر اشتغل. جرب تسجيل الدخول مرة ثانية',
        'النشر نجح بس تسجيل الدخول فشل، جرب مرة ثانية',
        'النشر تمام. فشل تسجيل الدخول، حاول مرة ثانية',
        'The deploy worked yesterday. Now add a contact page and run the tests again',
    ])('something else failed: %s', (text) => {
        expect(read(text).ordersAPublish).toBe(false);
        expect(deployTools(text)).toEqual([]);
    });

    it.each([
        'The deploy failed, try again',
        'The deploy failed. Try again.',
        'The deploy didn\'t work, try again',
        'النشر فشل، جرب مرة ثانية',
        'فشل النشر، حاول مرة ثانية',
        'النشر ما اشتغل، جرب مرة ثانية',
        'retry the deploy',
        'أعد النشر',
    ])('the publish failed: %s', (text) => {
        expect(read(text).ordersAPublish).toBe(true);
        expect(deployTools(text)).toContain('deploy_pages');
    });
});

describe('9 — an order glued to a field list is an order', () => {
    it.each([
        'الحقول: الاسم والايميل وانشره',
        'الحقول: الاسم والايميل وانشر الموقع',
        'fields: name, email and deploy it',
    ])('%s', (text) => {
        expect(read(text).ordersAPublish).toBe(true);
        expect(planned(text)).toEqual(['deploy_pages']);
    });

    it.each([
        'fields: name, email and deploy when done',
        'fields: name, email and publish the site',
        'الحقول: الاسم والايميل وانشر الموقع',
    ])('…and it deploys: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: true, veto: '' });
    });

    it.each([
        'fields: sku, name, publish date',
        'fields: name, email and publish date',
        'الحقول: الاسم، تاريخ النشر، الحالة',
        'الحقول: الاسم وتاريخ النشر',
        'columns: host, port, user',
        'inventory app: sku, name, publish date',
    ])('a noun in the list is still a field: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(planned(text)).toEqual([]);
    });
});

describe('the readers stay linear', () => {
    const rep = (unit: string, n: number) => { let s = ''; while (s.length < n) s += unit; return s.slice(0, n); };
    it.each([
        ['after the client', (n: number) => 'Publish it ' + rep('after the client ', n) + 'approves'],
        ['after + a long noun', (n: number) => 'Publish it after ' + rep('the content ', n)],
        ['to a venue', (n: number) => 'انشره ' + rep('على صفحتي في ', n) + 'فيسبوك'],
        ['on my', (n: number) => 'Publish it ' + rep('on my ', n) + 'facebook page'],
        ['failed, try again', (n: number) => rep('The deploy worked. The login failed, try again. ', n)],
        ['a field list', (n: number) => 'fields: ' + rep('name, email and deploy target, ', n) + 'and deploy it'],
        ['clauses beside a refusal', (n: number) => 'مش عايز انشر الصور، ' + rep('واحذف الملف المؤقت، ', n)],
    ])('%s at 20 KB', (_name, make) => {
        const text = (make as (n: number) => string)(20000);
        read('warm up');
        expect(cpuMs(() => read(text))).toBeLessThan(1000);
    });
});
