/**
 * THE EDIT-AFTER-BUILD FLOW — «عدل على كذا وكذا لكن جو لا يفهم ويصير يتهبل»
 * (field report, verbatim). Three holes, each locked here:
 *
 * (1) global.joePages was RAM-only. The user runs update-joe.ps1 constantly;
 *     every restart erased the built-page memory, so the FIRST edit after an
 *     update found no active page — the planner handed it to the generic DAG
 *     (a tool circus about nothing) or the builder re-rolled a brand-new
 *     page. page-store makes it survive like chat-store does.
 * (2) The dialect edit verbs the user actually types — ضيف/حط/خلي/شيل/سوي —
 *     were not edit verbs, and قسم/صورة/فوتر/هيدر were not page parts.
 * (3) «موقع جديد»/«تصميم جديد» with an active page was treated as an EDIT of
 *     the old page, keeping the palette the user asked to leave behind.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

const FALLTHROUGH = 'llm-fallthrough';
const tool = async (goal: string, sessionId?: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
        undefined,
        sessionId ? { sessionId } : undefined,
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
};

describe('(1) the built-page memory survives the restart', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'page-store-'));
    beforeAll(() => { process.env.JOE_CHAT_STORE_DIR = tmp; });
    afterAll(() => { delete process.env.JOE_CHAT_STORE_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

    it('flush → wipe → load restores the page entry', () => {
        const { flushJoePages, loadJoePages } = require('../api/page-store');
        const g: any = global as any;
        g.joePages = { 'sess-1': { filename: 'joe-sess-1.html', html: '<html>صفحة</html>', kind: 'landing', updatedAt: Date.now() } };
        flushJoePages();
        g.joePages = {};                       // ← the update-joe restart
        loadJoePages();
        expect(g.joePages['sess-1']?.filename).toBe('joe-sess-1.html');
        expect(g.joePages['sess-1']?.html).toContain('صفحة');
        g.joePages = {};
    });

    it('the persisted store stays bounded — the newest pages survive', () => {
        const { flushJoePages, loadJoePages } = require('../api/page-store');
        const g: any = global as any;
        g.joePages = Object.fromEntries(Array.from({ length: 20 }, (_, i) =>
            [`s${i}`, { filename: `f${i}`, html: 'x', updatedAt: i }]));
        flushJoePages();
        g.joePages = {};
        loadJoePages();
        const keys = Object.keys(g.joePages);
        expect(keys.length).toBe(12);
        expect(keys).toContain('s19');       // newest kept
        expect(keys).not.toContain('s0');    // oldest dropped
        g.joePages = {};
    });

    it('a live process never has its pages clobbered by load', () => {
        const { loadJoePages } = require('../api/page-store');
        const g: any = global as any;
        g.joePages = { live: { filename: 'live.html', html: 'x' } };
        loadJoePages();
        expect(g.joePages.live.filename).toBe('live.html');
        g.joePages = {};
    });

    it('the app restores pages at construction, and the builder persists after storing', () => {
        const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
        expect(read('api', 'app.ts')).toContain('loadJoePages()');
        const builder = read('modules', 'tools', 'definitions', 'WebPageBuilderTool.ts');
        expect((builder.match(/persistJoePages\(\)/g) || []).length).toBeGreaterThanOrEqual(4);
    });
});

describe('(2) dialect edits route to the builder when a page is open', () => {
    const KEY = 'edit-flow-test';
    beforeAll(() => {
        (global as any).joePages = { ...(global as any).joePages, [KEY]: { filename: 'x.html', html: '<html>x</html>' } };
    });
    afterAll(() => { delete (global as any).joePages?.[KEY]; });

    const edits = [
        'ضيف زر واتساب',
        'حط صورة في الاعلى',
        'خلي الخلفية غامقة',
        'شيل القسم الاخير',
        'سوي الخط اكبر',
        'عدل على الهيدر',
        'ظبط الفوتر',
    ];
    for (const t of edits) {
        it(`«${t}» → web_page_builder`, async () => {
            expect(await tool(t, KEY)).toBe('web_page_builder');
        });
    }

    it('the same words with NO active page do not hijack routing to the builder', async () => {
        expect(await tool('خلي الخلفية غامقة', 'no-such-session')).not.toBe('web_page_builder');
    });
    it('an ordinary question is untouched even with a page open', async () => {
        expect(await tool('ما هي عاصمة فرنسا؟', KEY)).not.toBe('web_page_builder');
    });
});

describe('(3) «موقع جديد» starts over instead of editing the old page', () => {
    it('the builder treats new-site phrasing as wantsNew', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
        const m = src.match(/const wantsNew = (\/.*\/i)\.test\(request\);/);
        expect(m).toBeTruthy();
        // eslint-disable-next-line no-eval
        const re: RegExp = eval(m![1]);
        for (const t of ['اريد موقع جديد', 'صفحة جديدة من فضلك', 'تصميم مختلف تماماً', 'ابدأ من الصفر', 'start over please']) {
            expect(re.test(t)).toBe(true);
        }
        for (const t of ['عدل الموقع', 'حسّن التصميم الحالي', 'أضف قسم جديد']) {
            expect(re.test(t)).toBe(false);
        }
    });
});

describe('the vague edit gets a section resolver before the whole-page fallback', () => {
    it('the builder consults pickSectionsWithModel when regexes find nothing', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
        expect(src).toContain('pickSectionsWithModel(request, existing, context, sessionId, isAr)');
        // …and the resolver spends LOCAL tokens, not the daily quota.
        const method = src.slice(src.indexOf('private async pickSectionsWithModel'));
        expect(method.slice(0, 2500)).toContain("purpose: 'internal'");
    });
});
