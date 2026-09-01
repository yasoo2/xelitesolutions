/**
 * «بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات»  →  لا شيء.
 *
 * His log: the local brain timed out three times, Groq answered «429 … tokens
 * per day (TPD): Limit 100000, Used 100000», every keyless provider was dead,
 * and the run ended with «تعذّر الوصول إلى محرّك الذكاء». Nothing in that build
 * needed a model — the scaffolder, the database, the CRUD, the screens and the
 * self-QA are all deterministic. Three defects, none about intelligence:
 *
 *   1. «بنِ» — the bare imperative — was missing from the build-verb list, which
 *      carried «ابن» and «ابني». Every noun matched; no verb did;
 *   2. «الموردون» and «الطلبيات» did not read as a DATABASE, so the scope came
 *      back «app» and he would have got a front-end with nowhere to put a
 *      supplier;
  * 3. and when the planner LLM could not be reached, the run DIED instead of
 *      handing the request to the evidence-first engineering pipeline.

 *
 * Proven live with every provider unreachable (verify_build_without_a_brain.ts,
 * 19/19): the plan came back through project_pipeline, which can inspect the
 * workspace before selecting and verifying the required implementation steps.
 */
import fs from 'fs';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const SRC = path.join(__dirname, '..');

describe('«بنِ» is the same verb as «ابنِ»', () => {
    it('his sentence, exactly as he typed it', () => {
        expect(PlanningEngine.looksLikeBuild('بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات')).toBe(true);
    });

    it('and the other imperatives people actually use', () => {
        for (const g of ['بنِ متجراً للعطور', 'بن نظام حجوزات', 'شيّد منصة تعليمية',
            'أقم موقعاً لشركتي', 'اقم تطبيقاً للمهام']) {
            expect(PlanningEngine.looksLikeBuild(g)).toBe(true);
        }
    });

    it('without swallowing a question about coffee beans', () => {
        // «البن» is a noun, not this verb — the gate must not open on it.
        for (const g of ['ما رأيك بالبن البرازيلي؟', 'كم سعر البن؟', 'اشرح لي ما هو النظام']) {
            expect(PlanningEngine.looksLikeBuild(g)).toBe(false);
        }
    });

    it('recognizes asking language plus an unseen records shape', () => {
        expect(PlanningEngine.looksLikeBuild('عندي مزرعة إبل. بدي سجل أسجل فيه: اسم الناقة والعمر والوزن')).toBe(true);
        expect(PlanningEngine.looksLikeBuild('I want a table to record appointments: patient name, phone and amount paid')).toBe(true);
    });

    it('recognizes product nouns that are not named site or app', () => {
        expect(PlanningEngine.looksLikeBuild('Create a media review board with image upload, tags, preview, and delete.')).toBe(true);
        expect(PlanningEngine.looksLikeBuild('Build a research workspace with papers, notes, search, and export.')).toBe(true);
    });

    it('does not turn an information question into a build from a listed noun', () => {
        for (const question of ['بدي أعرف كم الساعة', 'ابحث لي عن سعر الدولار', 'سجّل دخولي']) {
            expect(PlanningEngine.looksLikeBuild(question)).toBe(false);
        }
    });
});

describe('suppliers and orders are a database', () => {
    it('his system needs a server, not a page', () => {
        expect(PlanningEngine.classifyBuildScope('بنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات')).toBe('system');
    });

    it('and the plural forms the list used to miss', () => {
        expect(PlanningEngine.classifyBuildScope('ابنِ نظاماً فيه الموردون والطلبيات')).toBe('system');
        expect(PlanningEngine.classifyBuildScope('build a system with suppliers and vendors')).toBe('system');
    });

    it('while a landing page stays a page', () => {
        expect(PlanningEngine.classifyBuildScope('ابنِ صفحة هبوط لشركتي')).toBe('page');
    });
});

describe('clinic construction is not a web search', () => {
    it('the exact clinic brief reaches the engineering pipeline before browser routes', async () => {
        const request = 'عندي عيادة أسنان. بدي جدول أسجل فيه المواعيد: اسم المريض ورقم تلفونه ووقت الموعد ونوع العلاج والمبلغ المدفوع. وبدي أبحث عن المريض باسمه أو تلفونه، وبدي أعرف كم قبضت الإجمالي.';
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            const plan = await Promise.race([
                PlanningEngine.generatePlan({ intent: { goal: request, complexity: 'high', riskLevel: 'low', rawIntent: {} } as any }),
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error('planner timeout')), 1500);
                }),
            ]);
            const tools = plan.steps.map(step => step.tool);
            expect(tools.some(tool => /^(react_project|project_pipeline)$/.test(tool))).toBe(true);
            expect(tools.filter(tool => tool.startsWith('browser'))).toEqual([]);
            expect(tools).not.toContain('google_account');
        } finally {
            if (timer) clearTimeout(timer);
        }
    });
});

describe('a build does not die because a planner ran out of quota', () => {
    const P = () => fs.readFileSync(path.join(SRC, 'core', 'orchestrator', 'PlanningEngine.ts'), 'utf-8');

    it('an unreachable planner hands a build to the real builders', () => {
        const p = P();
        expect(p).toMatch(/A BUILD MUST NOT DIE BECAUSE A PLANNER RAN OUT OF QUOTA/);
        expect(p).toMatch(/if \(looksLikeBuildRequest\(String\(intent\.goal \|\| ''\)\)\) \{/);
        expect(p).toMatch(/id: `engineering_rescue_\$\{Date\.now\(\)\}`/);
        // The rescue returns the shared evidence-first project pipeline rather
        // than an opaque answer after provider failure.
        expect(p).toMatch(/tool: 'project_pipeline'/);
    });

    it('with the same scope rule as any other build', () => {
        const p = P();
        const at = p.indexOf('A BUILD MUST NOT DIE BECAUSE A PLANNER RAN OUT OF QUOTA');
        const block = p.slice(at, at + 2400);
        expect(block).toMatch(/PlanningEngine\.classifyBuildScope/);
        expect(block).toMatch(/tool: 'project_pipeline'/);
        expect(block).not.toMatch(/central_answer/);
    });
});
