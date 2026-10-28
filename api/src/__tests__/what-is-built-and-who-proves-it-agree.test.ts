import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { requestedArtifact } from '../core/design/requested-artifact';
import { isCliRequest } from '../core/design/app-blueprints';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isBuildRequest } from '../core/intelligence/intent-classifier';
import {
    deterministicPhasesFor,
    interactiveAppNeedsReactBuilder,
    pythonTestCommand,
    requestedDeliveryRoles,
    routesToCliScaffold,
} from '../modules/tools/definitions/ProjectPipelineTool';
import { ProjectPlannerTool } from '../modules/tools/definitions/ProjectPlannerTool';

/**
 * Eval round 19 (adversarial review of the merged verdict and artifact
 * reader): what the router builds and what the delivery gate demands as proof
 * were decided by different readers, so a request could be built as one thing
 * and judged as another — a tool with buttons built and «proven» as a CLI, a
 * CLI that reads invoices judged as a server it can never be, an API «for a
 * news website» given an unrequested React interface, P301's output file
 * errors.csv made into the program. One reader answers each fact; the router
 * and the roles ask the same predicate.
 */
/** The exam prompts this file measures, verbatim (D:\Joe\eval\prompts500.json, round 19). */
const EXAM: Record<string, string> = {
    'P001-landing-ar': 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.',
    'P002-landing-en': 'Build a professional landing website for a private school with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.',
    'P058-admin-ar': 'ابني لوحة تحكم لإدارة صيدلية: إضافة وتعديل وحذف وبحث في الأدوية والوصفات والموردين، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.',
    'P068-admin-ar': 'ابني لوحة تحكم لإدارة شركة تنظيم مناسبات: إضافة وتعديل وحذف وبحث في المناسبات والموردين والضيوف، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.',
    'P080-admin-ar': 'ابني لوحة تحكم لإدارة مصمم مستقل: إضافة وتعديل وحذف وبحث في الأعمال والعملاء والفواتير، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.',
    'P147-api-ar': 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـموقع أخبار فيها نقاط وصول لـالمقالات والأقسام والتعليقات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.',
    'P201-store-ar': 'ابني متجر إلكتروني لـعيادة أسنان: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.',
    'P202-store-en': 'Build an online store for a private school: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation.',
    'P251-booking-en': 'Build a booking web app for a dental clinic where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.',
    'P252-booking-ar': 'ابني تطبيق حجز لـمدرسة خاصة: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.',
    'P301-cli-ar': 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
    'P302-cli-en': 'Write a Python command-line tool that reads a CSV file of students for a private school, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.',
    'P347-cli-ar': 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المقالات لـموقع أخبار، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
};
const exam = (id: string) => EXAM[id];
/** The exam's CLI template in both languages (gen-prompts.mjs), over several domains. */
const CLI_DOMAINS: Array<{ en: string; ar: string; record: string; arRecord: string }> = [
    { en: 'dental clinic', ar: 'عيادة أسنان', record: 'patients', arRecord: 'المرضى' },
    { en: 'restaurant', ar: 'مطعم', record: 'menu items', arRecord: 'الأصناف' },
    { en: 'car rental company', ar: 'شركة تأجير سيارات', record: 'cars', arRecord: 'السيارات' },
    { en: 'pharmacy', ar: 'صيدلية', record: 'medicines', arRecord: 'الأدوية' },
    { en: 'freelance designer', ar: 'مصمم مستقل', record: 'portfolio projects', arRecord: 'الأعمال' },
    { en: 'news site', ar: 'موقع أخبار', record: 'articles', arRecord: 'المقالات' },
];
const cliPrompts = CLI_DOMAINS.flatMap(d => [
    `Write a Python command-line tool that reads a CSV file of ${d.record} for a ${d.en}, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.`,
    `اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه ${d.arRecord} لـ${d.ar}، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.`,
]);
const tools = (request: string) => (deterministicPhasesFor(request)?.phases || []).flatMap(phase => phase.tasks.map((task: any) => task.tool));
const roles = (request: string) => {
    const r = requestedDeliveryRoles(request);
    return `${r.service ? 'S' : '-'}${r.interface ? 'I' : '-'}${r.program ? 'P' : '-'}`;
};

describe('a tool with buttons is an application, not a command-line program', () => {
    it.each([
        'Make a Pomodoro timer utility with start, pause and reset buttons.',
        'Build an inventory management tool for a small shop to add, edit, delete and search products.',
        'Build a unit converter tool.',
        'Create a budgeting tool that tracks expenses by category and shows monthly charts.',
        'اعمل أداة مؤقت بومودورو فيها أزرار بدء وإيقاف وإعادة',
    ])('%s', request => {
        expect(isCliRequest(request)).toBe(false);
        expect(routesToCliScaffold(request)).toBe(false);
        expect(tools(request)).not.toContain('scaffold_project');
        expect(roles(request)).toMatch(/^.I-$/);
    });
    it('a request that says command line, a script, stdin or CSV input still is one', () => {
        for (const request of [
            'Make a small utility I can run from the command line to rename photos by date.',
            'Write a Python script that renames photos by date.',
            'Build a tool that reads stdin and prints the word count to stdout.',
        ]) {
            expect({ request, cli: isCliRequest(request) }).toEqual({ request, cli: true });
        }
    });
});

describe('the router and the delivery gate ask one question: is this a command-line program?', () => {
    it.each([
        ['P347-cli-ar (a CLI for a news site)', exam('P347-cli-ar')],
        ['a backup script for a database', 'Write a bash script that backs up my PostgreSQL database every night.'],
        ['a CLI over invoices', 'Write a Python CLI that reads invoices from a folder and prints the total.'],
        ['a CLI over a CSV of invoices', 'Write a Python command-line tool that reads a CSV of invoices and prints totals per customer.'],
        ['an Arabic CLI over suppliers', 'اكتب سكربت بايثون يقرأ ملف CSV فيه الموردين ويطبع المجاميع.'],
        ['a scraper CLI', 'Write a Python command-line tool that scrapes product pages from a website and saves them to CSV.'],
    ])('%s is built as a CLI and proven as a program', (_label, request) => {
        expect(isBuildRequest(request).isBuild).toBe(true);
        expect(routesToCliScaffold(request)).toBe(true);
        expect(tools(request)[0]).toBe('scaffold_project');
        expect(roles(request)).toBe('--P');
    });
    it('the exam CLI prompt, in both languages and six domains, is routed and judged alike', () => {
        for (const text of cliPrompts) {
            expect({ text: text.slice(0, 60), routed: routesToCliScaffold(text), roles: roles(text) }).toEqual({ text: text.slice(0, 60), routed: true, roles: '--P' });
        }
    });
    it('a CLI that also names an interface beside it must prove that interface too', () => {
        expect(roles('Write a Python CLI that imports orders, plus a web dashboard to browse them.')).toBe('-IP');
    });
});

describe('P301: the file the program writes is never the program', () => {
    const scaffold = (request: string) => {
        const plan = deterministicPhasesFor(request)!;
        const structure = plan.phases[0].tasks[0].args.structure as Record<string, string>;
        return { plan, structure, pkg: JSON.parse(structure['package.json']) };
    };
    it('P301 and its English twin both put the program in main.py, and no .csv file in the structure', () => {
        for (const id of ['P301-cli-ar', 'P302-cli-en']) {
            const { plan, structure, pkg } = scaffold(exam(id));
            expect({ id, keys: Object.keys(structure).filter(k => /\.csv$/i.test(k)) }).toEqual({ id, keys: [] });
            expect({ id, start: pkg.scripts.start, main: pkg.main }).toEqual({ id, start: 'python main.py', main: 'main.py' });
            expect(plan.phases[0].tasks.map((t: any) => t.args.path).filter(Boolean)).toEqual(['main.py', 'test_main.py']);
        }
    });
    it('a named SOURCE file is still the entry, and its test is named after it', () => {
        const { structure, pkg } = scaffold('Write a Python script wordcount.py that counts the words in a file and writes the result to report.txt.');
        expect(pkg.scripts.start).toBe('python wordcount.py');
        expect(pkg.scripts.test).toBe(pythonTestCommand(['test_wordcount.py'], true));
        expect(Object.keys(structure)).toEqual(expect.arrayContaining(['wordcount.py']));
        expect(Object.keys(structure)).not.toContain('report.txt');
    });
});

describe('a Python program is proven without packages the machine may not have', () => {
    it('the CLI scaffold runs standard-library unittest, declares no npm dependency, and asks for unittest tests', () => {
        const plan = deterministicPhasesFor(exam('P302-cli-en'))!;
        const pkg = JSON.parse(plan.phases[0].tasks[0].args.structure['package.json']);
        expect(pkg.scripts.test).toBe(pythonTestCommand(['test_main.py'], true));
        expect(pkg.scripts.test).not.toMatch(/pytest/);
        expect(pkg.dependencies || {}).toEqual({});
        const brief = plan.phases[0].tasks.find((t: any) => t.args.path === 'test_main.py').args.description;
        expect(brief).toMatch(/unittest\.TestCase/);
        expect(brief.replace('(no pytest)', '')).not.toMatch(/pytest/);
    });
    it('tests Joe authors run on the standard library; tests a plan wrote prefer pytest only where it is installed', () => {
        const own = pythonTestCommand(['test_main.py'], true);
        expect(own).toMatch(/^python -c ".*unittest.*" test_main\.py$/);
        expect(own).not.toMatch(/pytest/);
        const planned = pythonTestCommand(['tests/test_x.py'], false);
        expect(planned).toMatch(/find_spec\('pytest'\)/);
        // The fallback collects what pytest would: bare test functions too (round 21).
        expect(planned).toMatch(/FunctionTestCase/);
    });
    const python = (() => { try { execSync('python --version', { stdio: 'ignore' }); return true; } catch { return false; } })();
    (python ? it : it.skip)('the stock CSV program passes its own test when it really runs, and an empty suite fails', () => {
        const plan = deterministicPhasesFor('Write a Python command-line tool that converts a CSV file to JSON.')!;
        const structure = plan.phases[0].tasks[0].args.structure as Record<string, string>;
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-py-cli-'));
        try {
            for (const [name, body] of Object.entries(structure)) fs.writeFileSync(path.join(dir, name), body);
            const test = JSON.parse(structure['package.json']).scripts.test;
            expect(() => execSync(test, { cwd: dir, stdio: 'pipe' })).not.toThrow();
            fs.writeFileSync(path.join(dir, 'test_empty.py'), '# nothing\n');
            let status = 0;
            try { execSync(pythonTestCommand(['test_empty.py'], true), { cwd: dir, stdio: 'pipe' }); } catch (e: any) { status = e.status; }
            expect(status).not.toBe(0);
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }, 60_000);
});

describe('a server named in English is claimed as in Arabic', () => {
    it.each([
        ['Build a todo app with a Node.js server and SQLite storage.', 'ابني تطبيق مهام مع خادم Node.js وتخزين SQLite'],
        ['Build a React app with an Express server that stores notes.', 'ابني تطبيق ملاحظات مع خادم Express يحفظ الملاحظات'],
    ])('%s', (en, ar) => {
        expect(requestedArtifact(en).needsServer).toBe(true);
        expect(requestedArtifact(ar).needsServer).toBe(true);
        expect(tools(en)).toEqual(tools(ar));
        expect(tools(en)).toEqual(['api_project', 'react_project']);
    });
    it('a negated server is not a claim, and «don\'t forget to add login» still is', () => {
        expect(requestedArtifact('Build a todo app without a server.').needsServer).toBe(false);
        expect(requestedArtifact('Build a notes app and don\'t forget to add login.').needsServer).toBe(true);
    });
});

describe('a domain noun never decides the server', () => {
    it.each(['P058-admin-ar', 'P068-admin-ar', 'P080-admin-ar'])('%s, a single-operator dashboard with suppliers or invoices, is an app', id => {
        expect(requestedArtifact(exam(id)).needsServer).toBe(false);
        expect(PlanningEngine.classifyBuildScope(exam(id))).toBe('app');
        expect(tools(exam(id))).toEqual(['react_project']);
    });
    it('suppliers and invoices in English are records too; a point of sale as the deliverable is a server', () => {
        expect(PlanningEngine.classifyBuildScope('Build an inventory app for my small shop to track products and suppliers.')).toBe('app');
        expect(PlanningEngine.classifyBuildScope('اعمل صفحة فاتورة بسيطة تطبع الفاتورة')).toBe('page');
        expect(requestedArtifact('Build a POS system for my cafe').needsServer).toBe(true);
        expect(requestedArtifact('Build an inventory system with suppliers, orders and reports stored in a database.').needsServer).toBe(true);
    });
    it('what IS operational stays a claim: a multi-vendor marketplace, taking payments', () => {
        expect(requestedArtifact('Build a multi-vendor marketplace where sellers list products and buyers order them.').needsServer).toBe(true);
        expect(requestedArtifact('ابني سوق إلكتروني متعدد البائعين').needsServer).toBe(true);
        expect(requestedArtifact('Build an online store that accepts payments with Stripe.').needsServer).toBe(true);
        expect(requestedArtifact('ابني متجر إلكتروني مع بوابة دفع').needsServer).toBe(true);
        expect(requestedArtifact('Build an app to track my bill payments each month.').needsServer).toBe(false);
    });
});

describe('an interface word in a subject phrase is the subject, not a deliverable', () => {
    it('P147 «… لـموقع أخبار» and its English twin are API-only', () => {
        for (const request of [exam('P147-api-ar'), 'Create a REST API with Express for a news website with endpoints for articles and comments.']) {
            expect({ request: request.slice(0, 40), tools: tools(request), roles: roles(request) }).toEqual({ request: request.slice(0, 40), tools: ['api_project'], roles: 'S--' });
        }
    });
    it('a framework service, an app that exposes an API, and a resource named «pages» are APIs', () => {
        for (const request of [
            'Create a FastAPI service for a library with endpoints for books and members.',
            'Build a Flask app that exposes a REST API for todos.',
            'Create a REST API for a blog with endpoints for posts, pages and comments.',
        ]) {
            expect({ request, kind: requestedArtifact(request).kind, roles: roles(request) }).toEqual({ request, kind: 'api', roles: 'S--' });
        }
    });
    it('an interface named beside the API is required, in both languages', () => {
        expect(roles('Create a REST API with Node.js and Express for a library, plus a React dashboard to manage it.')).toBe('SI-');
        expect(roles('أنشئ واجهة برمجية REST لعيادة مع لوحة تحكم React لإدارتها')).toBe('SI-');
        expect(tools('أنشئ واجهة برمجية REST لعيادة مع لوحة تحكم React لإدارتها')).toEqual(['api_project', 'react_project']);
    });
    it('a thing ABOUT an API is an application', () => {
        expect(requestedArtifact('Build a GitHub API dashboard that shows my repositories.').kind).toBe('app');
    });
});

describe('one request, one path, in both languages', () => {
    const planner = new ProjectPlannerTool() as any;
    const firstTools = (plan: any) => plan ? plan.phases.flatMap((p: any) => p.tasks.map((t: any) => t.tool)).filter((t: string) => t !== 'decide_capability_route' && t !== 'search_public_apis') : null;
    it('P201 and P202 take the same instant plan, and the UI-builder rescue sees both', () => {
        expect(firstTools(planner.constrainedFrontendPlan(exam('P201-store-ar')))).toEqual(['react_project']);
        expect(firstTools(planner.constrainedFrontendPlan(exam('P202-store-en')))).toEqual(['react_project']);
        expect(interactiveAppNeedsReactBuilder(exam('P201-store-ar'))).toBe(interactiveAppNeedsReactBuilder(exam('P202-store-en')));
        expect(interactiveAppNeedsReactBuilder(exam('P201-store-ar'))).toBe(true);
    });
    it('P001 and P002 — one document each — take the page builder in both languages', () => {
        expect(firstTools(planner.constrainedFrontendPlan(exam('P001-landing-ar')))).toEqual(['web_page_builder']);
        expect(firstTools(planner.constrainedFrontendPlan(exam('P002-landing-en')))).toEqual(['web_page_builder']);
    });
    it('a booking app whose owner sees every booking gets no browser-only plan (P251)', () => {
        expect(requestedArtifact(exam('P251-booking-en')).needsServer).toBe(true);
        expect(planner.constrainedFrontendPlan(exam('P251-booking-en'))).toBeNull();
        expect(planner.constrainedFrontendPlan(exam('P252-booking-ar'))).toBeNull();
    });
    it('an unknown object keeps its instant React plan (currency converter, weather dashboard)', () => {
        expect(firstTools(planner.constrainedFrontendPlan('Build me a currency converter.'))).toEqual(['react_project']);
        expect(firstTools(planner.constrainedFrontendPlan('Build a simple weather dashboard using a free public API.'))).toEqual(['react_project']);
    });
});

describe('the build gate reads Gulf and Levantine Arabic questions as questions', () => {
    it.each([
        'أبي تشرح لي كود الموقع', 'ابي تشرح لي كيف يشتغل التطبيق', 'بدي تفهمني شو بيعمل هالموقع',
        'اريد تشرح لي هذا النظام', 'ودي تقول لي وش رايك بالموقع', 'ابغى توضح لي كيف اربط التطبيق',
    ])('%s is not a build', request => {
        expect(isBuildRequest(request).isBuild).toBe(false);
    });
    it.each(['أبي تعدّل صفحة النادي', 'سوّي لي متجر قهوة', 'بدي موقع لمطعمي'])('%s is still an order', request => {
        expect(isBuildRequest(request).isBuild).toBe(true);
    });
    it.each([
        'كيف حالك؟ ابني لي موقع لمطعمي', 'كم سعر الاستضافة؟ أنشئ لي متجر إلكتروني للعطور', 'هل انت جاهز؟ اكتب لي سكربت بايثون يحسب المتوسط',
    ])('a question then an order builds, like its English twin: %s', request => {
        expect(isBuildRequest(request).isBuild).toBe(true);
        expect(isBuildRequest('How are you? Build me a website for my restaurant.').isBuild).toBe(true);
    });
    it('a verbal noun after a question is still a topic', () => {
        expect(isBuildRequest('هل تصميم موقع جديد مكلف؟').isBuild).toBe(false);
    });
});

describe('excluding one part is not refusing the build', () => {
    it.each([
        ['Build a REST API for todos. Do not create a frontend.', ['api_project']],
        ['Write a Python CLI that converts CSV to JSON. Do not create a web app.', ['scaffold_project']],
        ['Create a simple Node.js command-line tool that counts words. Do not create a web app or React frontend.', ['scaffold_project', 'ai_write_file', 'ai_write_file']],
        ["Don't build a website. Write a Python script that converts CSV to JSON.", ['scaffold_project']],
        ['ابني واجهة برمجية للمهام ولا تنشئ واجهة مستخدم', ['api_project']],
    ])('%s', (request, expected) => {
        expect(isBuildRequest(request).isBuild).toBe(true);
        expect(tools(request as string)).toEqual(expected);
    });
    it('a denial with no part, or of everything, still refuses', () => {
        expect(isBuildRequest('Do not build anything, just explain how a REST API works.').isBuild).toBe(false);
        expect(isBuildRequest("Don't build it yet.").isBuild).toBe(false);
    });
    it('a contraction negates what it governs: «I don\'t want a web app, I need a CLI»', () => {
        expect(requestedArtifact("I don't want a web app, I need a command-line tool that converts CSV to JSON.").kind).toBe('cli');
        expect(requestedArtifact('I want a CLI instead of a website.').kind).toBe('cli');
    });
});
