import fs from 'fs';
import os from 'os';
import path from 'path';
import { AR_START_NOUN, wordsRegex } from '../shared/arabic-word-boundary';
import { analyzeContextualIntent, extractEntities } from '../core/llm/context-engine';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { isCliRequest } from '../core/design/app-blueprints';
import { readsCsvInput as isCsvInputRequest } from '../core/design/requested-artifact';
import { hasRequestedAction } from '../core/intelligence/requested-action';
import { classifyIntent } from '../core/intelligence/intent-classifier';
import { isBoundedTerminalDiagnosticRequest } from '../core/orchestrator/buildIntent';
import { reviewHtml } from '../core/quality/html-qa';
import { parseProfileText } from '../core/profile/business-profile';
import { wantsMobileApp } from '../core/design/pwa';
import { boundedChangeValue } from '../modules/tools/definitions/ProjectEditTool';
import { EngineeringDiscoveryTool } from '../modules/tools/definitions/EngineeringDiscoveryTool';

/**
 * Eval round 15, 2026-10-24: JavaScript's `\b` is defined over `\w` =
 * [A-Za-z0-9_] — even with /u — so every Arabic alternative written
 * `\b(…|تحقق|…)\b` never matched. 37 such sites silently disabled Arabic
 * intent, build-scope, edit and browser routing while their English twins
 * worked. Each fixed site is proven here through its public function, with
 * the Arabic input that failed before and its English twin unchanged.
 */
jest.setTimeout(120_000);

describe('the shared boundary', () => {
    it('bounds Arabic words, accepts a glued «و/ف» or article without consuming it, and leaves English on ASCII \\b', () => {
        const click = wordsRegex(['click'], ['انقر', 'اضغط']);
        expect('اضغط على الزر'.match(click)?.[0]).toBe('اضغط');
        expect('واضغط الزر'.match(click)?.[0]).toBe('اضغط');
        expect(click.test('اضغطوا')).toBe(false);
        expect(click.test('باضغط')).toBe(false);          // a preposition changes the word; it is not accepted
        expect(click.test('click it')).toBe(true);
        expect(click.test('clicking')).toBe(false);
        const site = wordsRegex(['website'], ['موقع'], 'i', AR_START_NOUN);
        expect('ادخل الموقع'.match(site)?.[0]).toBe('موقع');
        expect(site.test('موقعي')).toBe(false);
    });
});

describe('context-engine reads Arabic', () => {
    const ctx = (over: Record<string, unknown> = {}) => ({
        userId: 'u', sessionId: 's', history: [] as any[], entities: new Map(), intent: null,
        lastToolUsed: null as string | null, browserSessionActive: false, projectContext: {}, ...over,
    }) as any;

    it('entities: a name stops at «ثم», a library after «مكتبة», a language, the project type', () => {
        expect(extractEntities('اسمي أحمد ثم ساعدني').userName).toBe('أحمد');
        expect(extractEntities('تثبيت مكتبة axios').dependencies).toEqual(['axios']);
        expect(extractEntities('install express please').dependencies).toEqual(['express']);
        expect(extractEntities('اكتب سكربت بلغة بايثون').programmingLanguages).toEqual(['بايثون']);
        expect(extractEntities('اعمل موقع لعيادة').projectType).toBe('web');
        expect(extractEntities('Build a website for a clinic').projectType).toBe('web');
        expect(extractEntities('أنشئ واجهة برمجية للعيادة').projectType).toBe('api');
        expect(extractEntities('اعمل تطبيق جوال للعيادة').projectType).toBe('mobile');
    });

    it('intent: correction, browser actions, continuation, reference, steps, capability, preference', () => {
        expect(analyzeContextualIntent('أقصد الصفحة الثانية', ctx()).primary).toBe('correction');
        const browsing = ctx({ browserSessionActive: true });
        expect(analyzeContextualIntent('ثم اضغط على الزر', browsing).secondary).toBe('browser_click');
        expect(analyzeContextualIntent('then click the button', browsing).secondary).toBe('browser_click');
        expect(analyzeContextualIntent('ثم اكتب اسمي', browsing).secondary).toBe('browser_type');
        expect(analyzeContextualIntent('ثم انزل للأسفل', browsing).secondary).toBe('browser_scroll');
        expect(analyzeContextualIntent('ثم انسخ العنوان', browsing).secondary).toBe('browser_extract');
        expect(analyzeContextualIntent('اضف زر حفظ', ctx({ lastToolUsed: 'file_write' })).primary).toBe('code_continuation');
        expect(analyzeContextualIntent('غيّر هذا اللون', ctx({ history: [{ role: 'user', content: 'اعمل لي صفحة', timestamp: 1 }] })).primary).toBe('reference_previous');
        expect(analyzeContextualIntent('افتح الموقع ثم سجل الدخول ثم اعرض الطلبات', ctx()).primary).toBe('multi_step');
        expect(analyzeContextualIntent('هل تستطيع بناء متجر', ctx()).primary).toBe('capability_question');
        expect(analyzeContextualIntent('أي إطار أفضل للمتجر', ctx()).primary).toBe('preference_question');
    });
});

describe('PlanningEngine routes Arabic like English', () => {
    const plan = (goal: string) => PlanningEngine.generatePlan({ intent: { goal, complexity: 'low', riskLevel: 'low', rawIntent: {} } as any });
    afterEach(() => jest.restoreAllMocks());

    it('«فيت» is a frontend: an API with a Vite interface is not the bare-API path', async () => {
        expect(String((await plan('اعمل واجهة برمجية مع واجهة فيت')).id)).not.toMatch(/^engineering_api_/);
        expect(String((await plan('Build a REST api with a vite frontend')).id)).not.toMatch(/^engineering_api_/);
    });

    it('«ابني تطبيق فيت» is the React project, like «build me a vite app»', async () => {
        expect(String((await plan('ابني لي تطبيق فيت لعيادة أسنان')).id)).toMatch(/^engineering_react_/);
        expect(String((await plan('Build me a vite app for a dental clinic')).id)).toMatch(/^engineering_react_/);
    });

    it('«تصميم واجهة …» is a build verb', async () => {
        expect(String((await plan('تصميم واجهة فيت لعيادة أسنان')).id)).toMatch(/^engineering_react_/);
    });

    it('the search term and the click label stop at «في الصفحة» / «على الصفحة»', async () => {
        jest.spyOn(PlanningEngine, 'classifyBrowserIntent').mockResolvedValue(null);   // the model router is not under test
        const find = await plan('في https://example.com ابحث عن الأسعار في الصفحة');
        expect(find.steps[0]).toMatchObject({ tool: 'browser_find_text', input: { query: 'الأسعار' } });
        expect((await plan('on https://example.com find prices on the page')).steps[0]).toMatchObject({ tool: 'browser_find_text', input: { query: 'prices' } });
        const click = await plan('في https://example.com اضغط على المزيد على الصفحة');
        expect(click.steps[0]).toMatchObject({ tool: 'browser_click', input: { text: 'المزيد' } });
        expect((await plan('on https://example.com click More on the page')).steps[0]).toMatchObject({ tool: 'browser_click', input: { text: 'More' } });
    });

    it('«عاين <url>» navigates and «… على الويب» names the browser', async () => {
        jest.spyOn(PlanningEngine, 'classifyBrowserIntent').mockResolvedValue(null);
        expect((await plan('عاين https://example.com')).steps[0].tool).toBe('browser_launch');
        expect((await plan('browse https://example.com')).steps[0].tool).toBe('browser_launch');
        expect((await plan('example.com على الويب')).steps[0].tool).toBe('browser_launch');
    });
});

describe('the build-scope classifiers read the Arabic twin of every prompt kind', () => {
    // The dental-clinic twins of D:\Joe\eval\prompts500.json (gen-prompts.mjs).
    const TWINS = [
        { kind: 'landing',
          ar: 'اعمل موقع تعريفي احترافي لـعيادة أسنان فيه قسم رئيسي جذاب، والخدمات، وآراء العملاء، ونموذج تواصل يتحقق من البريد الإلكتروني ورقم الهاتف، وقائمة تعمل على الجوال. الموقع بالعربي ومن اليمين لليسار.',
          en: 'Build a professional landing website for a dental clinic with a hero section, services, testimonials, a contact form with validated email and phone fields, and a responsive mobile menu.' },
        { kind: 'admin',
          ar: 'ابني لوحة تحكم لإدارة عيادة أسنان: إضافة وتعديل وحذف وبحث في المرضى والمواعيد والعلاجات، مع صفحة ملخص تعرض الإجماليات ورسماً بيانياً.',
          en: 'Build an admin dashboard for a dental clinic to manage patients, appointments, treatments: add, edit, delete and search each one, with a summary page showing totals and a chart.' },
        { kind: 'api',
          ar: 'أنشئ واجهة برمجية REST باستخدام Node.js و Express لـعيادة أسنان فيها نقاط وصول لـالمرضى والمواعيد والعلاجات، مع التحقق من المدخلات ورموز أخطاء صحيحة واختبارات آلية لكل نقطة.',
          en: 'Create a REST API with Node.js and Express for a dental clinic with endpoints for patients, appointments, treatments, input validation, proper error codes, and automated tests for every endpoint.' },
        { kind: 'fullstack',
          ar: 'ابني نظام متكامل لـعيادة أسنان: واجهة React وخادم Node، تسجيل دخول بصلاحيات (مدير وموظف)، إدارة المرضى والمواعيد والعلاجات، وكل موظف يرى سجلاته فقط.',
          en: 'Build a complete full-stack system for a dental clinic: React frontend, Node backend, user login with roles (admin and staff), management of patients, appointments, treatments, and each staff member only sees their own records.' },
        { kind: 'store',
          ar: 'ابني متجر إلكتروني لـعيادة أسنان: عرض المنتجات بالصور والأسعار، بحث وفلترة حسب التصنيف، سلة تضيف وتحذف وتحدّث المجموع، ونموذج إتمام طلب مع التحقق من البيانات.',
          en: 'Build an online store for a dental clinic: product listing with images and prices, search and category filter, a cart that adds and removes items and updates the total, and a checkout form with validation.' },
        { kind: 'booking',
          ar: 'ابني تطبيق حجز لـعيادة أسنان: الزبون يختار التاريخ والوقت، ويشوف المواعيد المحجوزة، ويحجز باسمه ورقم هاتفه، وصاحب المكان يشوف كل الحجوزات بعرض تقويم.',
          en: 'Build a booking web app for a dental clinic where customers pick a date and time slot, see which slots are already taken, book with their name and phone, and the owner sees all bookings in a calendar view.' },
        { kind: 'cli',
          ar: 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه المرضى لـعيادة أسنان، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.',
          en: 'Write a Python command-line tool that reads a CSV file of patients for a dental clinic, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.' },
        { kind: 'report',
          ar: 'اعمل صفحة تقرير تفاعلية لـعيادة أسنان تحمّل بيانات تجريبية عن المواعيد، وتعرض ثلاث رسوم بيانية (حسب الشهر، حسب التصنيف، أعلى 5)، وتسمح بالفلترة حسب الفترة الزمنية.',
          en: 'Create an interactive single-page report for a dental clinic that loads sample appointments data, shows three charts (by month, by category, top 5), and lets the user filter by date range.' },
        { kind: 'game',
          ar: 'اعمل لعبة أسئلة في المتصفح عن عيادة أسنان فيها 10 أسئلة، ومؤقت لكل سؤال، وحساب النقاط، وشاشة نتيجة نهائية وزر إعادة.',
          en: 'Make a browser quiz game about a dental clinic with 10 questions, a timer per question, score tracking, a final results screen and a restart button.' },
        { kind: 'bot',
          ar: 'ابني صفحة روبوت محادثة لخدمة عملاء عيادة أسنان يجاوب على الأسئلة الشائعة من قائمة مدمجة، ويسمح للمستخدم بحجز أو إلغاء المواعيد من خلال المحادثة، ويحفظ سجل المحادثة.',
          en: 'Build a customer-support chatbot web page for a dental clinic that answers common questions from a built-in FAQ list, lets the user book or cancel appointments through the chat, and keeps the conversation history.' },
    ];

    it.each(TWINS)('$kind: build, CLI and CSV readings agree', ({ ar, en }) => {
        expect(PlanningEngine.looksLikeBuild(ar)).toBe(PlanningEngine.looksLikeBuild(en));
        expect(isCliRequest(ar)).toBe(isCliRequest(en));
        expect(isCsvInputRequest(ar)).toBe(isCsvInputRequest(en));
    });

    it.each(TWINS)('$kind: the build scope agrees', ({ ar, en }) => {
        expect(PlanningEngine.classifyBuildScope(ar)).toBe(PlanningEngine.classifyBuildScope(en));
    });

    it('a CLI whose records are «الطلبات» is a CLI, not a database system — like its English twin', () => {
        const ar = 'اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV فيه الطلبات لـمغسلة ملابس، وتتحقق من كل سطر، وتطبع تقريراً بالأعداد والمجاميع، وتكتب الأسطر الخاطئة في ملف errors.csv.';
        const en = 'Write a Python command-line tool that reads a CSV file of orders for a laundry service, validates every row, prints a summary report with counts and totals, and writes the invalid rows to errors.csv.';
        expect(isCliRequest(ar)).toBe(true);
        expect(PlanningEngine.classifyBuildScope(ar)).toBe(PlanningEngine.classifyBuildScope(en));
        expect(PlanningEngine.classifyBuildScope(ar)).not.toBe('system');
    });

    it('«جافا سكريبت» is a language, not a script request; «سكربت بايثون» is', () => {
        expect(isCliRequest('اعمل موقع لعيادة بجافا سكريبت')).toBe(false);
        expect(isCliRequest('اعمل موقع لعيادة بالجافاسكريبت')).toBe(false);
        expect(isCliRequest('اكتب سكربت بايثون ينظف ملفات السجل')).toBe(true);
        expect(isCliRequest('شغّله من الطرفية')).toBe(true);
    });
});

describe('the other Arabic sites', () => {
    it('a build that forbids a database keeps its negative constraint', () => {
        expect(hasRequestedAction('ابني تطبيق آلة حاسبة بدون قاعدة بيانات').reason).toBe('affirmative build with negative constraints');
        expect(hasRequestedAction('Build a calculator app without a database').reason).toBe('affirmative build with negative constraints');
    });

    it('a long Arabic engineering brief is an engineering brief', async () => {
        const brief = 'أريد تطوير نظام حقيقي لإدارة عيادة أسنان من الصفر، فيه سجلات المرضى والمواعيد والعلاجات والفواتير، مع صلاحيات للأطباء وموظفي الاستقبال، وتقارير شهرية عن الإيرادات، ونسخ احتياطي يومي للبيانات، وواجهة واضحة تعمل على الحاسوب والجوال، وكل جزء مختبر قبل التسليم.';
        expect(brief.length).toBeGreaterThanOrEqual(240);
        expect((await classifyIntent(brief)).reason).toBe('engineering brief');
    });

    it('«نفذ فحص … في الطرفية» asks for a bounded terminal diagnostic', () => {
        expect(isBoundedTerminalDiagnosticRequest('نفذ فحص الحالة في الطرفية')).toBe(true);
        expect(isBoundedTerminalDiagnosticRequest('execute a local diagnostic check in the terminal')).toBe(true);
    });

    it('«اكتب هنا» is placeholder text in a page review', () => {
        const page = (text: string) => `<!doctype html><html lang="ar" dir="rtl"><head><title>عيادة</title></head><body><main><h1>عيادة</h1><p>${text}</p></main></body></html>`;
        expect(reviewHtml(page('اكتب هنا'), true).issues.some((i: string) => /placeholder/.test(i))).toBe(true);
        expect(reviewHtml(page('your text here'), false).issues.some((i: string) => /placeholder/.test(i))).toBe(true);
    });

    it('«اكس» labels the X/Twitter handle', () => {
        expect(parseProfileText('بياناتي: اكس @clinic_jo').twitter).toBe('@clinic_jo');
        expect(parseProfileText('details: x @clinic_jo').twitter).toBe('@clinic_jo');
    });

    it('«ابل» is a phone word for a mobile app', () => {
        expect(wantsMobileApp('اعمل تطبيق لأجهزة ابل')).toBe(true);
        expect(wantsMobileApp('make an app for iphone')).toBe(true);
    });

    it('a change value ends at the next Arabic edit clause', () => {
        expect(boundedChangeValue('غيّر السعر إلى 20، احذف القسم الأخير')).toBe('20');
        expect(boundedChangeValue('change the price to 20; remove the last section')).toBe('20');
    });

    it('«… على المشروع» points at an existing project, not a new one', async () => {
        const ws = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-arabic-boundary-'));
        try {
            const res: any = await new EngineeringDiscoveryTool().execute({ request: 'ابنِ صفحة تواصل على المشروع' }, { workspaceRoot: ws });
            const facts = (res?.output?.evidence?.facts || []).map((f: any) => f.id);
            expect(facts).toContain('request.goal');
            expect(facts).not.toContain('request.creates_new_project');
        } finally {
            fs.rmSync(ws, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
        }
    });
});
