/**
 * A FAULT WITH THE STEPS TO REPRODUCE IT IS STILL A FAULT — and four more readings
 * the fifth pre-merge review (2026-11-12) found wrong in the request readers.
 *
 *  3. «افتح الصفحة تلاقي الزر ما يشتغل», "Go to the settings page, the save button
 *     doesn't work", "Search by name is not working", "Deploy preview is not working"
 *     went to the browser or the deploy tool: a message that opens with a deed word
 *     kept that deed's route, whatever the word was doing there.
 *  6. «لا تسوي شي في الهيدر الحين», "Don't do anything, just wait" were no refusal:
 *     a time word after the scope hid it, and to wait was read as a deed.
 *  7. "Move the button to the left without touching anything" was answered with
 *     words: «without changing X» beside an order to change is an exclusion.
 *  8. "If it does not exist, create config.json" lost its file: any «not» earlier in
 *     the sentence protected the name after it.
 *  T. The capability chain was quadratic on a run of spaces (5–7 s at 20 KB). The
 *     bound here is on processor time, never on the wall clock.
 */
import { hasRequestedAction, fileDenialBesideItsOrder, deniesEveryFileChange } from '../core/intelligence/requested-action';
import { isBrowserRequest, isBuildRequest, isWebOrder, reportsAFaultOrOrdersAFix } from '../core/intelligence/intent-classifier';
import { IntentParser } from '../core/intelligence/IntentParser';
import { namedTargetFile } from '../core/orchestrator/file-intent';
import { capabilityChain, capableTools } from '../core/orchestrator/capability-match';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); });
afterAll(() => { jest.restoreAllMocks(); });

describe('3 — a fault is still a fault when a deed word opens it', () => {
    it.each([
        // the third person of a feminine thing, not a polite order
        'تفتح الصفحة لكن الزر ما يشتغل',
        'تحمل الصفحة بس الصور ما تظهر',
        'ترسل الرسالة لكن الاشعار ما يوصل',
        // the steps to reproduce it
        'افتح الصفحة تلاقي الزر ما يشتغل',
        'ادخل على صفحة الدفع، الزر ما يشتغل',
        "Go to the settings page, the save button doesn't work",
        'Open the dashboard and the chart does not render',
        // the deed word names the feature that is at fault
        'Search by name is not working',
        'Deploy preview is not working',
        "Email notifications don't arrive",
        'Upload validation fails',
        'Push notifications stopped working',
        'Search results are not showing',
        // the relative clause is the subject of the fault
        "The thing that isn't working is the search",
        'اللي مش شغال هو البحث',
        'الشي اللي ما يشتغل هو البحث',
        // to download is no deed with a route of its own
        'نزل الصورة، الزر لا يعمل',
    ])('%s → a fault: no browser, no web order', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(true);
        expect(isBrowserRequest(text).isBrowser).toBe(false);
        expect(isWebOrder(text)).toBe(false);
    });

    it.each([
        'ابحث في الويب عن الأفلام التي لم تعرض بعد',
        'ابحث عن الدول التي لم توقع على اتفاقية باريس',
        'ابحث عن المطاعم اللي مش غالية في عمان',
        'Search the web for phones that are not working with 5G',
        'search online for the bug that was never fixed in Windows',
    ])('%s: the relative clause describes what to look for → still a web search', text => {
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
        'ممكن تشغل المشروع، السيرفر القديم مش شغال',
        'Deploy the site, the old link stopped working',
        'Take a screenshot of the page, the footer is not showing',
        'Run the tests and do not deploy',
    ])('%s: an order with its object; the fault is a remark beside it', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(false);
    });

    it('an address he names is still the browser\'s', () => {
        expect(isBrowserRequest('افتح example.com وخذ سكرين شوت، الموقع مش شغال عندي').isBrowser).toBe(true);
        expect(isBrowserRequest('الموقع مش شغال، افتح example.com وشوف').isBrowser).toBe(true);
    });

    it.each([
        'الصورة ما تظهر، صلحها',
        'زر النشر ما يشتغل، صلحه',
        "the button doesn't work, fix it",
        'الزر اللي في الهيدر مش شغال',
        "the upload button doesn't work",
        'Download link is broken',
    ])('%s: the faults that were read stay read', text => {
        expect(reportsAFaultOrOrdersAFix(text)).toBe(true);
    });
});

describe('6 — a scoped do-nothing with a time word is a refusal, and to wait is no deed', () => {
    it.each([
        'لا تسوي شي في الهيدر الحين',
        "Don't do anything to the header for now",
        'Do nothing to the header yet.',
        'لا تعمل شي بالتصميم حاليا',
        'لا تسوي شي في المشروع الحين، بس قل لي رايك',
        "don't do anything with the styles right now, just tell me what you think",
        'لا تسوي شي بس استنى',
        "Don't do anything, just wait",
        'لا تسوي شي في الهيدر، بس استنى شوي',
        'Do nothing for now, just hold on',
    ])('%s → words only', text => {
        const read = hasRequestedAction(text);
        expect(read.isAnswerOnly).toBe(true);
        expect(read.hasAffirmativeAction).toBe(false);
    });

    it.each([
        'لا تسوي شي في الهيدر، بس غير لون الفوتر',
        'لا تعمل شي بالتصميم، بس صلح الخطأ',
        "don't do anything to the database, just fix the form",
        'Do nothing to the header; change the footer color to black',
        // the time word does not hide the order after it either
        'لا تسوي شي في الهيدر الحين، بس غير لون الفوتر',
        "Don't do anything to the header for now, just fix the footer",
    ])('%s → still the order beside it', text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(read.isAnswerOnly).toBe(false);
    });
});

describe('7 — «without changing X» beside an order to change is an exclusion', () => {
    it.each([
        'Move the button to the left without touching anything',
        'Move the button to the left without changing anything',
        'Fix the typo without changing the layout',
        'Without changing anything else, fix the header',
        'Can you make the button blue without changing anything else?',
        'Add dark mode without changing any files except style.css',
        'Rename the title without touching the footer',
        'Make the header sticky without breaking the layout',
    ])('%s → an order, no denial', text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(false);
        expect(read.isAnswerOnly).toBe(false);
        expect(read.isNoFileChanges).toBe(false);
        expect(deniesEveryFileChange(text)).toBe(false);
    });

    it.each([
        'بدون تعديل أي ملف، افحص المشروع',
        'Without changing any files, review the project',
        'Review the repo without changing anything',
    ])('%s → the read-only inspection, as it was', text => {
        const read = hasRequestedAction(text);
        expect(read.hasDenial).toBe(true);
        expect(read.isAnswerOnly).toBe(false);
        expect(read.isNoFileChanges).toBe(false);
        expect(read.denialReason).toBe('explicit read-only request');
    });

    it.each([
        // nothing that changes is ordered beside it: it denies, as it did
        'Explain the header without changing anything',
        'Run the tests without changing anything',
        'Analyze the code without modifying it',
        'How can I fix the typo without changing the layout?',
        'Describe the grid without changing the layout',
        // the files themselves are denied, whatever is ordered
        'Move the button without changing any files',
    ])('%s → still a denial', text => {
        expect(hasRequestedAction(text).hasDenial).toBe(true);
    });

    it('the dialects\' file denial is a file denial, and an order to create a page stands beside it', () => {
        expect(deniesEveryFileChange('ما تعدلش أي ملف')).toBe(true);
        expect(deniesEveryFileChange('بدون ما تعدل أي ملف، افحص المشروع')).toBe(true);
        expect(fileDenialBesideItsOrder('ما تعدلش أي ملف، اعملي صفحة جديدة للتواصل')?.order).toBe('create');
        const read = hasRequestedAction('ما تعدلش أي ملف، اعملي صفحة جديدة للتواصل');
        expect(read.hasAffirmativeAction).toBe(true);
        expect(read.hasDenial).toBe(false);
        expect(isBuildRequest('ما تعدلش أي ملف، اعملي صفحة جديدة للتواصل').isBuild).toBe(true);
        // the «ما» that relates is no denial
        expect(deniesEveryFileChange('بعد ما تعدل الملفات شغل المشروع')).toBe(false);
    });

    it('what the exclusion keeps names no tool; the order beside it still does', () => {
        expect(IntentParser.quickIntent('Add dark mode without changing any files except style.css')).toBeNull();
        expect(IntentParser.quickIntent('Refactor utils.js without changing anything about its behavior')?.requiredTools).toEqual(['auto_refactor']);
    });
});

describe('8 — only a protection that governs the file protects it', () => {
    it.each([
        ['If it does not exist, create config.json', 'config.json'],
        ['This is not hard: create hello.py that prints hi', 'hello.py'],
        ['It is not there yet. Create a file named setup.py', 'setup.py'],
        ["don't forget to create a file named notes.md", 'notes.md'],
        ['عدل ملف a.js ولا تلمس ملف b.js', 'a.js'],
        ['لا تنشئ مشروعاً جديداً، أنشئ ملف notes.md', 'notes.md'],
        ["don't worry, create a file named a.txt", 'a.txt'],
        ['Create a file named a.txt, not the file named b.txt', 'a.txt'],
    ])('%s → %s', (text, name) => {
        expect(namedTargetFile(text)).toBe(name);
    });

    it.each([
        'غير العنوان ولا تلمس ملف config.json',
        'ما تلمس ملف config.json وغير العنوان',
        'غير العنوان ولا تلمس ملف a.json ولا ملف b.json',
        'do not create a.txt',
        'never create the file named secrets.env',
        'change the title without touching the file named config.json',
        'leave the file named config.json',
    ])('%s → no file to write', text => {
        expect(namedTargetFile(text)).toBeNull();
    });
});

describe('T — the readers stay linear', () => {
    const cpuMs = (run: () => unknown): number => {
        const t0 = process.cpuUsage();
        run();
        const spent = process.cpuUsage(t0);
        return (spent.user + spent.system) / 1000;
    };
    const rep = (unit: string, chars: number) => unit.repeat(Math.ceil(chars / unit.length)).slice(0, chars);
    const plan = (text: string) => PlanningEngine.capabilityPlan({ goal: text, rawIntent: { capabilityCandidate: 'deploy_pages' } }, {});
    let nonce = 0;
    const INPUTS: Array<[string, (n: number) => string]> = [
        ['a run order, spaces, a file denial', n => `شغل المشروع.${rep(' ', n)}ولا تنشئ أي ملفات`],
        ['a scoped do-nothing split by spaces', n => `لا تسوي شي في${rep(' ', n)}الهيدر، بس غير لون الفوتر`],
        ['spaces before «then»', n => `analyze the repo${rep(' ', n)}then fix it`],
        ['commas and spaces', n => `analyze the repo${rep('، ', n)}then fix it`],
        ['do-nothing and time words', n => rep('لا تسوي شي في الهيدر الحين، for now yet ', n)],
        ['«without changing»', n => rep('fix it without changing anything else, without touching the layout ', n)],
        ['«without» and spaces', n => `move it without${rep(' ', n)}changing anything`],
        ['relative clauses', n => rep('the thing that is not working, اللي مش شغال هو البحث، ', n)],
        ['deed words', n => `${rep('search by name deploy preview ', n)}is not working`],
        ['negations before a file', n => `${rep('it does not exist and is not hard, ', n)}create config.json`],
        ['a mixed line', n => rep('لا تسوي شي في الهيدر، بس انشره بعد ما تصلح الأزرار التي لا تعمل ولا تلمس config.json. The deploy failed, try again without changing any files.\n', n)],
    ];
    it.each(INPUTS)('20 KB of %s', (_name, input) => {
        const text = () => `${input(20000)} ${nonce++}`;
        //  Once to warm each reader on a short text, so the bound is on the reading and not on first compilation.
        for (const read of [capabilityChain, hasRequestedAction, reportsAFaultOrOrdersAFix, namedTargetFile, plan]) read(`${input(200)} ${nonce++}`);
        expect(cpuMs(() => capabilityChain(text()))).toBeLessThan(1500);
        expect(cpuMs(() => hasRequestedAction(text()))).toBeLessThan(1500);
        expect(cpuMs(() => reportsAFaultOrOrdersAFix(text()))).toBeLessThan(1500);
        expect(cpuMs(() => namedTargetFile(text()))).toBeLessThan(1500);
        expect(cpuMs(() => plan(text()))).toBeLessThan(1500);
    });

    it('the chain is split as it was, whatever the spaces around its markers', () => {
        expect(capabilityChain('one job only')).toEqual([]);
        const tight = capabilityChain('حلل المستودع، ثم افحص الثغرات الأمنية');
        expect(tight.map(step => step.part)).toEqual(['حلل المستودع', 'افحص الثغرات الأمنية']);
        expect(capabilityChain('حلل المستودع   ،   ثم   افحص الثغرات الأمنية')).toEqual(tight);
        expect(capabilityChain('analyze the codebase    then    scan it for security vulnerabilities').map(step => step.part))
            .toEqual(['analyze the codebase', 'scan it for security vulnerabilities']);
    });
});

describe('a tool that destroys is named by its deed', () => {
    it.each([
        "Don't do anything with the styles, only rename the file to main.css",
        'rename the file to main.css',
        'move the file to src',
    ])('%s → never delete_file', text => {
        expect(capableTools(text, 5).map((tool: { name: string }) => tool.name)).not.toContain('delete_file');
    });
    it('an order to delete still names it', () => {
        expect(capableTools('delete the file main.css', 1)[0]?.name).toBe('delete_file');
    });
});
