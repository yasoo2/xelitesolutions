/**
 * STAGE 1 OF THE WORLD-CLASS ROADMAP — checkpoints & rollback.
 *
 * The signature feature of Bolt/Lovable: every build and edit snapshots the
 * page it replaces; «ارجع للنسخة السابقة» restores it instantly — bytes off
 * the store, zero model calls — and the restore is itself undoable. This
 * locks the store shape, the routing, and the restore path.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { WebPageBuilderTool } from '../modules/tools/definitions/WebPageBuilderTool';

const FALLTHROUGH = 'llm-fallthrough';
const route = async (goal: string, sessionId: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
        undefined, { sessionId },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
};

describe('routing: rollback phrases reach the page tool when a page is open', () => {
    const KEY = 'ver-route';
    beforeAll(() => { (global as any).joePages = { ...(global as any).joePages, [KEY]: { filename: 'x.html', html: '<html>x</html>' } }; });
    afterAll(() => { delete (global as any).joePages?.[KEY]; });

    for (const t of ['ارجع للنسخة السابقة', 'تراجع عن آخر تعديل', 'اعرض النسخ المحفوظة', 'rollback please', 'undo the last change']) {
        it(`«${t}» → web_page_builder`, async () => {
            expect(await route(t, KEY)).toBe('web_page_builder');
        });
    }
});

describe('a long build brief is not hijacked by incidental rollback words', () => {
    const KEY = 'ver-build-brief';
    beforeAll(() => {
        (global as any).joeProjects = {
            ...(global as any).joeProjects,
            [KEY]: { dir: path.join(os.tmpdir(), 'stale-nexus-project') },
        };
    });
    afterAll(() => { delete (global as any).joeProjects?.[KEY]; });

    it('keeps a production build with rollback acceptance language on project_pipeline', async () => {
        const goal = [
            'Build a production-grade autonomous software platform with multi-tenant authentication, organizations, roles, permissions, audit logs, projects, workflows, real backend APIs, real database models, real frontend functionality, and real tests.',
            'The final acceptance test must verify restartability, error handling, and version history; rollback and revert are product requirements, not a request to undo the active workspace.',
            'Create modular architecture and execute the implementation incrementally with terminal evidence and local verification. ',
        ].join(' ').repeat(3);
        expect(goal.length).toBeGreaterThan(1000);
        expect(await route(goal, KEY)).toBe('project_pipeline');
    });
});

describe('the restore path: instant, honest, and itself undoable', () => {
    const KEY = 'ver-restore';
    let tmp: string;
    const tool = new WebPageBuilderTool() as any;
    const V1 = '<!DOCTYPE html><html><head><title>v1</title></head><body><h1>النسخة الأولى</h1></body></html>';
    const V2 = '<!DOCTYPE html><html><head><title>v2</title></head><body><h1>النسخة الثانية</h1></body></html>';

    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-ver-'));
        process.env.JOE_CHAT_STORE_DIR = tmp;
        (global as any).joePages = {
            ...(global as any).joePages,
            [KEY]: {
                filename: `joe-${KEY}.html`, html: V2, updatedAt: Date.now(), lastRequest: 'تعديل الألوان',
                versions: [{ html: V1, filename: `joe-${KEY}.html`, at: Date.now() - 60_000, note: 'البناء الأول' }],
            },
        };
    });
    afterAll(() => {
        delete (global as any).joePages?.[KEY];
        delete process.env.JOE_CHAT_STORE_DIR;
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('«ارجع للنسخة السابقة» writes v1 back to disk and swaps the store', async () => {
        const res = await tool.execute({ request: 'ارجع للنسخة السابقة' }, { sessionId: KEY });
        expect(res.ok).toBe(true);
        expect(String(res.output?.message)).toContain('↩️');
        const entry = (global as any).joePages[KEY];
        expect(entry.html).toBe(V1);
        // …and v2 became the restorable version (undo of the undo).
        expect(entry.versions.some((v: any) => v.html === V2)).toBe(true);
        const onDisk = fs.readFileSync(path.join(process.env.ARTIFACT_DIR || '/tmp/joe-artifacts', `joe-${KEY}.html`), 'utf-8');
        expect(onDisk).toContain('النسخة الأولى');
    });

    it('the restore round trip: rolling back again returns v2', async () => {
        const res = await tool.execute({ request: 'تراجع عن هذا — ارجع للنسخة السابقة' }, { sessionId: KEY });
        expect(res.ok).toBe(true);
        expect((global as any).joePages[KEY].html).toBe(V2);
    });

    it('«اعرض النسخ» lists them with restore instructions', async () => {
        const res = await tool.execute({ request: 'اعرض النسخ المحفوظة' }, { sessionId: KEY });
        expect(res.ok).toBe(true);
        expect(String(res.output?.message)).toContain('🗂️');
        expect(String(res.output?.message)).toContain('ارجع للنسخة');
    });

    it('a session with NO versions is told so honestly', async () => {
        (global as any).joePages['ver-none'] = { filename: 'n.html', html: '<html>x</html>' };
        const res = await tool.execute({ request: 'ارجع للنسخة السابقة' }, { sessionId: 'ver-none' });
        expect(res.ok).toBe(true);
        expect(String(res.output?.message)).toContain('لا توجد');
        delete (global as any).joePages['ver-none'];
    });

    it('the main store write snapshots the replaced page (source lock)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'WebPageBuilderTool.ts'), 'utf-8');
        expect(src).toContain('const versionTrail');
        expect(src).toMatch(/versions: versionTrail, lastRequest: request\.slice\(0, 80\)/);
        expect(src).toContain('.slice(-10)');
    });
});
