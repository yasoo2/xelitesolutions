/**
 * A POST TO THE NETWORKS IS NOT A DEPLOY — AND A DELETE NEVER WRITES.
 *
 * The sixth pre-merge review (2026-11-12) read the deploy and tool-choice readers against
 * the trees before them and found:
 *
 *   B  a post was deployed as the site when any word stood between the preposition and
 *      the network, and the reading was lost when the preposition was glued or unlisted:
 *          انشره على كل مواقع التواصل · انشره على جميع حساباتنا: فيسبوك وتويتر
 *          Deploy it to all social networks                                → deploy_pages
 *          انشره ففيسبوك · Publish it in our Facebook group · …through Twitter → no veto
 *   1  Joe's own step was read as a third party's:
 *          انشره بعد ما تنتهي من التعديلات · …تجهز لي صفحة الدفع · …تراسل العميل → 'waits'
 *   2  a payment or confirmation noun inside his own work kept the publish waiting:
 *          Deploy after fixing the payment bug · …after the payment integration → 'waits'
 *   3  a condition told as done, with an order for now, waited:
 *          After the client approved it yesterday I want it live: deploy now   → 'waits'
 *   4  a retry after an earlier success repeated nothing:
 *          The deploy was fine yesterday, today it failed, retry               → no plan
 *   P1 a delete, a rename, a move or an emptying of a file planned a WRITE of it:
 *          احذف / امسح / شيل الملف temp.txt · غير اسم الملف… · انقل الملف…    → ai_write_file
 *   P2 a publish noun that names a file was an order to publish:
 *          احذف ملف النشر deploy.sh                                           → deploy_pages
 *   P3 a delete ordered beside a refused publish planned a write:
 *          لا تنشر، بس احذف الملف temp.txt                                    → write_file
 *   P4 a destroying word that names a button, or stands under a denial, deleted:
 *          Add a delete button to the file list · Don't delete the file temp.txt → delete_file
 *   P5 a field named «استضافة» deployed:
 *          الحقول: الاسم، استضافة الموقع، التكلفة                             → deploy_pages
 *
 * No model, no network: the readers only.
 */
jest.mock('../core/llm/intelligent-router', () => ({
    routeToModel: jest.fn(async () => { throw new Error('no model in this test'); }),
    verifyProviderDirect: jest.fn(),
    isProviderFailure: () => false,
}));
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { capableTools } from '../core/orchestrator/capability-match';

const read = (text: string) => PlanningEngine.readDeployIntent(text);
const plannedWith = (text: string, candidate: string): string[] => {
    const plan = PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: candidate } }, {});
    return plan ? plan.steps.map((step: any) => String(step.tool)) : [];
};
/** The plan as the request reaches it: with the candidate the matcher itself names (what IntentParser hands on), and with none. */
const planned = (text: string): string[] => plannedWith(text, capableTools(text, 1)[0]?.name || '');
const everyPlan = (text: string): string[] => [...planned(text), ...plannedWith(text, ''), ...plannedWith(text, 'deploy_pages'), ...plannedWith(text, 'ai_write_file')];
const matched = (text: string): string[] => capableTools(text, 5).map(c => c.name);
const WRITERS = /write|edit|generator/;
const cpuMs = (fn: () => unknown): number => {
    const t0 = process.cpuUsage();
    fn();
    const spent = process.cpuUsage(t0);
    return (spent.user + spent.system) / 1000;
};

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { jest.restoreAllMocks(); });

describe('B — a network named in the publish clause is where it goes', () => {
    it.each([
        'انشره على كل مواقع التواصل',
        'انشره على اغلب مواقع التواصل',
        'انشر الموقع على كل مواقع التواصل',
        'Deploy it to all social networks',
        'انشره على جميع وسائل التواصل الاجتماعي',
        'انشره في كل وسائل التواصل',
        'انشره بكل السوشيال ميديا',
        'انشره على كل السوشيال ميديا',
        'انشره على باقي منصات التواصل',
        'انشره على كل من فيسبوك وتويتر',
        'انشره على جميع حساباتنا: فيسبوك وتويتر',
        'انشره على ستوري الانستغرام',
        'انشره ففيسبوك',
        'انشره عتويتر',
        'انشره تويتر',
        'انشره على موقع فيسبوك',
        'انشره في تطبيق انستغرام',
        'ممكن تنشره على كل مواقع التواصل؟',
        'Publish it in our Facebook group',
        'Publish it in the WhatsApp group',
        'Publish it to all social networks',
        'Publish it to both Facebook and Instagram',
        'Publish it through Twitter',
        'Publish it for Instagram',
        'Publish it at LinkedIn',
        'Publish it to the company\'s Facebook',
        'Publish it across all our social channels',
        'Publish it on our main Instagram account',
        // …and the ones the reading already knew
        'انشره على الفيسبوك',
        'انشره على صفحتي في فيسبوك',
        'Publish it on my facebook page',
        'Publish it on social media',
        'Publish it on social',
    ])('a post, never a deploy: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'content', ordersAPublish: false });
        expect(everyPlan(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });

    it.each([
        'Deploy my twitter clone',
        'انشر موقع يشبه فيسبوك',
        'انشر الموقع اللي فيه زر واتساب',
        'Deploy the app with the WhatsApp button',
        'Deploy my social network app',
        'Deploy the reddit bot',
        'Publish the site with the facebook login',
        'Publish the youtube downloader app',
        'Deploy the facebook-like site',
        'Deploy the site with login via facebook',
        'انشر الموقع على جيت هاب',
        'انشر الموقع على netlify',
        'انشر الموقع على vercel',
        'انشر الموقع على github pages',
        'Deploy the site and share it on twitter',
        'Publish the site, it has a telegram bot',
        'Deploy the social proof section',
    ])('a site with a network in its name or beside it is deployed: %s', (text) => {
        const reading = read(text);
        expect({ deploy: reading.deploy, veto: reading.veto }).toEqual({ deploy: true, veto: '' });
    });

    it.each([
        'انشر تطبيق السوشيال ميديا',
        'انشره وحط أيقونات فيسبوك وتويتر في الفوتر',
        'انشر نسخة من تويتر',
        'انشر البوت بتاع تليجرام',
        'انشر موقع لينكدان كلون',
        'انشر المتجر مع تسجيل الدخول بفيسبوك',
    ])('…and the order stays an order to publish: %s', (text) => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
    });
});

describe('1 — his own step before the publish is followed by it', () => {
    it.each([
        'انشره بعد ما تنتهي من التعديلات',
        'انشره بعد ما تنتهي من إصلاح الهيدر',
        'انشره بعد ما تجهز الصفحة الرئيسية',
        'انشره بعد ما تجهز لي صفحة الدفع',
        'انشره لما تجهز الصفحة',
        'انشره بعد ما تكتمل صفحة التواصل',
        'انشره بعد ما تضيف المدير كمستخدم',
        'انشره بعد ما تراسل العميل',
        'انشره بعد ما تدفع التغييرات على جيت هاب',
    ])('follows: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'follows' });
    });

    it.each([
        'انشره بعد ما تدفع الشركة',
        'انشره بعد ما تشوف رد العميل',
        'انشره بعد ما تستلم الشعار من العميل',
        'انشره لما توصلك الصور',
        'انشره لما تجهز الصور',
        'انشره لما يوافق المدير',
        'انشره بعد ما يدفع',
        'انشره بعد ما تدفع',
        'انشره بعد ما تنتهي الاختبارات',
        'انشره بعد ما ترد الشركة',
        'انشره بعد ما توافق الادارة',
    ])('still waits: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'waits' });
        expect(everyPlan(text)).toEqual([]);
    });

    it('«when you are done» names no work: the order is for now', () => {
        for (const text of ['انشره بعد ما تخلص', 'انشره بعد ما تجهز', 'انشره بعد ما تنتهي منه']) {
            expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
        }
    });
});

describe('2 — a payment is the condition only where it is its head', () => {
    it.each([
        'Deploy after the payment integration',
    ])('his own work, not a wait: %s', (text) => {
        expect(read(text).veto).toBe('');
        expect(read(text).ordersAPublish).toBe(true);
    });

    it.each([
        'Deploy after fixing the payment bug',
        'Deploy after adding the payments page',
        'Publish after adding the confirmation email template',
        'Deploy after building the contact page',
    ])('his own deed first, then the publish — never the publish before it: %s', (text) => {
        expect(read(text).veto).toBe('follows');
        expect(everyPlan(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });

    it.each([
        'Deploy after payment',
        'Deploy after the client pays',
        'Deploy after approval',
        'Deploy after payment is confirmed',
        'Deploy after payment confirmation',
        'Deploy after approval from legal',
        'Deploy after getting the client\'s approval',
        'Deploy after receiving payment',
        'Deploy after marketing approves',
        'Publish it after the client\'s approval',
        'انشره بعد الدفع',
    ])('still waits: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'waits' });
    });
});

describe('3 — a condition told as done holds nothing back', () => {
    it.each([
        'After the client approved it yesterday I want it live: deploy now',
        'Once the client approved the design, deploy now',
        'بعد ما وافق العميل امس انشره دلوقتي',
    ])('an order for now: %s', (text) => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
    });

    it.each([
        'After the client approves it, deploy now',
        'After the client approves, deploy',
        'If the client approved it yesterday, deploy now',
        'When the header is approved, deploy now',
        'اذا وافق العميل انشره الحين',
        'بعد ما يوافق العميل انشره الحين',
    ])('still waits: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'waits' });
    });
});

describe('4 — a publish that worked and then failed is what a retry repeats', () => {
    it.each([
        'The deploy was fine yesterday, today it failed, retry',
        'النشر اشتغل امس واليوم فشل، اعد المحاولة',
        'The deploy worked, then it failed, try again',
        'The deploy failed, try again',
    ])('publishes again: %s', (text) => {
        expect(read(text)).toMatchObject({ veto: '', ordersAPublish: true });
        expect(plannedWith(text, 'deploy_pages')).toEqual(['deploy_pages']);
    });

    it.each([
        'The deploy worked. The login failed, try again',
        'The deploy worked yesterday but the login failed, try again',
        'النشر اشتغل. تسجيل الدخول فشل، جرب مرة ثانية',
        'The deploy worked yesterday. Now add a contact page and run the tests again',
    ])('repeats no publish: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(everyPlan(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });
});

describe('P1 — a deed done to a file never plans a write of it', () => {
    it.each([
        'احذف الملف temp.txt',
        'امسح الملف temp.txt',
        'شيل الملف temp.txt',
        'ممكن تحذف الملف temp.txt',
        'اريد حذف الملف temp.txt',
        'Delete temp.txt',
        'Delete the file temp.txt',
        'Remove the file temp.txt',
        'Please delete the old backup file',
    ])('a delete is matched by the delete tool alone: %s', (text) => {
        expect(matched(text)).toEqual(['delete_file']);
        expect(everyPlan(text).filter(tool => tool !== 'delete_file')).toEqual([]);
    });

    it('…and the fast path plans nothing for it, whichever road the request came by: the planner that reads the whole request decides a deletion', () => {
        for (const text of ['احذف الملف temp.txt', 'Delete the file temp.txt', 'Delete scripts/deploy.yml', 'Delete a.txt, b.txt and c.txt', 'Delete ../secrets.env']) {
            for (const candidate of ['delete_file', '', 'ai_write_file']) {
                expect(PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: candidate } }, {})).toBeNull();
            }
        }
    });

    it('…and a clause beside it plans as it always did, with no delete', () => {
        expect(everyPlan('Delete a.txt and write hello to b.txt')).not.toContain('delete_file');
    });

    it.each([
        'احذف الملفات التي لا تستخدم',
        'Please delete the old backup file',
        'مسح الملف القديم',
    ])('…and on nothing when it names no file — which one is for the planner that reads the workspace: %s', (text) => {
        expect(everyPlan(text)).toEqual([]);
    });

    it.each([
        'غير اسم الملف a.txt الى b.txt',
        'انقل الملف a.txt الى مجلد docs',
        'فرغ الملف temp.txt',
        'أعد تسمية الملف a.txt الى b.txt',
        'Rename the file a.txt to b.txt',
        'Move the file a.txt to docs',
        'Empty the file temp.txt',
    ])('no tool renames, moves or empties a file — the matcher names none: %s', (text) => {
        expect(matched(text)).toEqual([]);
        expect(everyPlan(text)).toEqual([]);
    });

    it.each([
        'لا تحذف الملف temp.txt',
        'Don\'t delete the file temp.txt',
        'Never delete the file temp.txt',
        'Do not rename the file a.txt',
    ])('a forbidden deed names no tool: %s', (text) => {
        expect(matched(text)).toEqual([]);
        expect(everyPlan(text)).toEqual([]);
    });

    it('what is ordered beside it is matched as it always was', () => {
        expect(matched('اكتب hello في ملف a.txt')[0]).toMatch(WRITERS);
        expect(matched('Create an empty file named a.txt')[0]).toMatch(WRITERS);
        expect(matched('Delete a.txt and write hello to b.txt')).toEqual(expect.arrayContaining(['delete_file']));
        expect(matched('بدون حذف الملف temp.txt، اكتب hello في ملف a.txt')).not.toContain('delete_file');
        expect(matched('بدون حذف الملف temp.txt، اكتب hello في ملف a.txt')[0]).toMatch(WRITERS);
        expect(matched('Clear the cache')).toContain('cache_manager');
    });
});

describe('P2 — a publish word that names a file is not a publish order', () => {
    it.each([
        'احذف ملف النشر deploy.sh',
        'Delete scripts/deploy.yml',
        'Fix the deploy.sh script',
        'Delete the deploy script',
    ])('no deploy: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(everyPlan(text).filter(tool => PlanningEngine.isSiteDeployTool(tool) || WRITERS.test(tool))).toEqual([]);
    });

    it('the delete it orders is left to the planner that reads the whole request', () => {
        expect(everyPlan('احذف ملف النشر deploy.sh')).toEqual([]);
    });

    it('a sentence that ends on the publish word is still the order', () => {
        expect(read('Deploy. Then tell me the link')).toMatchObject({ deploy: true, veto: '' });
    });
});

describe('P3 — a delete beside a refused publish is the delete', () => {
    it.each([
        'لا تنشر، بس احذف الملف temp.txt',
        'Don\'t deploy, just delete the file temp.txt',
    ])('%s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, veto: 'denied' });
        //  Neither the refused publish nor a write: the delete is the planner's to decide.
        expect(everyPlan(text)).toEqual([]);
    });
});

describe('the seventh review — no file is ever deleted on the fast path', () => {
    it.each([
        //  A: the file named is not the deed's object
        'remove the files section from index.html',
        'remove the file extension check from upload.js',
        'delete the file upload handler in server.js',
        'remove the file path from config.json',
        'احذف قسم الملفات من index.html',
        'add a menu item "Delete the file" to index.html',
        'create an endpoint to delete the file by id in server.js',
        'remove the file temp.txt from .gitignore',
        'امسح محتوى الملف temp.txt',
        //  B: except X
        'delete every file except temp.txt',
        'delete all files other than main.py',
        'احذف كل الملفات إلا index.html',
        'امسح كل الملفات غير main.py',
        //  C: a negation further back or in other words
        'do not under any circumstances ever delete the file temp.txt',
        'rather than delete the file temp.txt, comment out its contents',
        'اوعى تحذف الملف temp.txt',
        'حذاري تحذف الملف temp.txt',
        'مين قالك تحذف الملف temp.txt',
        //  D: retractions, conditions, deferrals
        'Delete temp.txt? No, keep it',
        'delete the file temp.txt — actually no, don\'t',
        'احذف الملف temp.txt؟ لا، خليه',
        'if the tests pass, delete the file temp.txt',
        'delete the file temp.txt only if I confirm',
        'احذف الملف temp.txt لو ما كان مستخدم',
        'احذف الملف temp.txt بعدين مش هلق',
        //  E: quotes, mentions, features
        'المستخدم كتب: «احذف الملف temp.txt» — رد عليه برسالة مهذبة',
        'explain the command: delete the file temp.txt',
        'the app should delete the file temp.txt on logout',
        'اكتب دالة تحذف الملف temp.txt عند الخروج',
        'حذف الملف temp.txt فشل',
        //  F: a name with spaces or a variable
        'delete the file my notes.txt',
        'delete the file $HOME/x.txt',
    ])('%s', (text) => {
        expect(everyPlan(text)).not.toContain('delete_file');
        expect(plannedWith(text, 'delete_file')).not.toContain('delete_file');
    });

    it.each([
        'delete the file temp.txt then deploy the site',
        'احذف الملف temp.txt ثم انشر الموقع',
        'Delete a.txt and write hello to b.txt',
    ])('a request that orders a deletion is the planner\'s whole — no other deed is planned without it: %s', (text) => {
        expect(everyPlan(text)).toEqual([]);
    });
});

describe('P4 — a destroying word that names a thing is not the deed', () => {
    it.each([
        'Add a delete button to the file list',
        'أضف زر حذف لقائمة الملفات',
        'أضف زر حذف في ملف index.html',
        'Remove the delete button from the file list',
        'columns: id, deploy target, delete flag, run count, send date',
        'Do not remove any files, just run the tests',
        'Delete the header section',
    ])('no delete tool: %s', (text) => {
        expect(matched(text)).not.toContain('delete_file');
        expect(everyPlan(text)).not.toContain('delete_file');
        expect(plannedWith(text, 'delete_file')).not.toContain('delete_file');
    });
});

describe('P5 — a field named after the publish is a field', () => {
    it.each([
        'الحقول: الاسم، استضافة الموقع، التكلفة',
        'الحقول: الاسم، الاستضافة، التكلفة',
        'fields: name, hosting plan, cost',
    ])('no deploy: %s', (text) => {
        expect(read(text)).toMatchObject({ deploy: false, ordersAPublish: false });
        expect(everyPlan(text).filter(tool => PlanningEngine.isSiteDeployTool(tool))).toEqual([]);
    });

    it('an order outside the list is still the order', () => {
        expect(read('استضف الموقع')).toMatchObject({ deploy: true, veto: '' });
        expect(read('الحقول: الاسم والايميل وانشره')).toMatchObject({ veto: '', ordersAPublish: true });
    });
});

describe('the readers stay fast and linear', () => {
    const rep = (unit: string, n: number) => { let s = ''; while (s.length < n) s += unit; return s.slice(0, n); };
    const INPUTS: Array<[string, (n: number) => string]> = [
        ['networks in a list', (n) => 'انشره على ' + rep('فيسبوك وتويتر و', n)],
        ['networks and icons', (n) => 'Deploy the ' + rep('facebook and twitter and ', n) + 'icons'],
        ['a quantifier before the networks', (n) => rep('انشره على كل مواقع التواصل ', n)],
        ['his own step', (n) => rep('انشره بعد ما تنتهي من التعديلات، ', n)],
        ['a gerund and a payment noun', (n) => rep('Deploy after fixing the payment bug. ', n)],
        ['told as done', (n) => 'After the client approved ' + rep('it yesterday ', n) + 'deploy now'],
        ['worked then failed', (n) => rep('The deploy was fine yesterday, today it failed, retry. ', n)],
        ['deletes', (n) => rep('احذف الملف temp.txt، ', n)],
        ['denied deletes', (n) => rep('Don\'t delete the file temp.txt. ', n)],
        ['delete buttons', (n) => rep('Add a delete button to the file list, ', n)],
        ['file names', (n) => rep('deploy.sh ', n)],
        ['a field list', (n) => 'الحقول: ' + rep('الاسم، استضافة الموقع، التكلفة، ', n)],
    ];
    //  Measured outside jest on a quiet machine, at 20 KB: readDeployIntent 0-125 ms, capableTools 15-78 ms, capabilityPlan 46-438 ms.
    //  The bars here are generous on purpose, as in the-readers-of-every-request-stay-fast: a loaded machine doubles a figure.
    it.each(INPUTS)('%s: fast at 20 KB, and no worse than linear', (_name, make) => {
        //  Each reader on its own, on a text it has not read before (a request read once is remembered), the best of three.
        let nonce = 0;
        const best = (fn: (text: string) => unknown, n: number): number =>
            Math.min(...[0, 1, 2].map(() => { const text = `${make(n)} ${nonce++}`; return cpuMs(() => fn(text)); }));
        const plan = (text: string) => PlanningEngine.capabilityPlan({ goal: text }, {});
        best(read, 2000); best(plan, 2000);                  // warm up on the same shape
        const reads = best(read, 20000), plans = best(plan, 20000);
        expect(reads).toBeLessThan(700);
        expect(plans).toBeLessThan(1500);
        //  Twice the text in about twice the time — never four times (with room for a fixed cost and a noisy machine).
        expect(best(read, 40000)).toBeLessThan(reads * 3 + 300);
        expect(best(plan, 40000)).toBeLessThan(plans * 3 + 300);
    });
});
