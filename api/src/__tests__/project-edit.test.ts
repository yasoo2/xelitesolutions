/**
 * STAGE 3 — surgical, diff-based project editing, locked.
 *
 * The contract: edits touch LINES, not files; a block whose SEARCH text is
 * not in the file is refused; an edit that breaks the syntax is refused; a
 * colour change never needs a model at all; and the whole flow survives a
 * restart because joeProjects persists.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { parseEditBlocks, applyEditBlock, syntaxOk, diffSummary, ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';

describe('parseEditBlocks — the Aider-style format, strictly', () => {
    const reply = `Sure. Here is the change:

FILE: src/components/Hero.jsx
<<<<<<< SEARCH
        <h1>{content.heroTitle}</h1>
=======
        <h1 className="big">{content.heroTitle}</h1>
>>>>>>> REPLACE

FILE: src/content.js
<<<<<<< SEARCH
  cta: 'ابدأ الآن',
=======
  cta: 'اطلب الآن',
>>>>>>> REPLACE`;

    it('parses multiple blocks with files, search and replace', () => {
        const blocks = parseEditBlocks(reply);
        expect(blocks.length).toBe(2);
        expect(blocks[0].file).toBe('src/components/Hero.jsx');
        expect(blocks[1].replace).toContain('اطلب الآن');
    });
    it('refuses path escapes', () => {
        expect(parseEditBlocks('FILE: ../../etc/passwd\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE')).toEqual([]);
    });
    it('garbage parses to nothing, never throws', () => {
        expect(parseEditBlocks('no blocks here')).toEqual([]);
        expect(parseEditBlocks('')).toEqual([]);
    });
});

describe('applyEditBlock — exact first, whitespace-tolerant second, refusal third', () => {
    const file = `function a() {\n  return 1;\n}\nfunction b() {\n  return 2;\n}`;
    it('applies an exact match', () => {
        const out = applyEditBlock(file, { file: 'x.js', search: '  return 1;', replace: '  return 10;' });
        expect(out).toContain('return 10;');
        expect(out).toContain('return 2;');
    });
    it('applies a re-indented quote (models re-indent what they copy)', () => {
        const out = applyEditBlock(file, { file: 'x.js', search: 'function b() {\n    return 2;\n}', replace: 'function b() {\n  return 20;\n}' });
        expect(out).toContain('return 20;');
    });
    it('REFUSES a quote that is not in the file', () => {
        expect(applyEditBlock(file, { file: 'x.js', search: 'return 99;', replace: 'return 1;' })).toBeNull();
    });
});

describe('the esbuild syntax gate', () => {
    it('valid JSX passes, broken JSX is caught', () => {
        expect(syntaxOk('a.jsx', 'export default function A(){return <div>hi</div>}').ok).toBe(true);
        expect(syntaxOk('a.jsx', 'export default function A(){return <div>hi</div>').ok).toBe(false);
    });
    it('JSON and CSS get structural checks', () => {
        expect(syntaxOk('p.json', '{"a":1}').ok).toBe(true);
        expect(syntaxOk('p.json', '{a:1').ok).toBe(false);
        expect(syntaxOk('s.css', 'a{color:red}').ok).toBe(true);
        expect(syntaxOk('s.css', 'a{color:red').ok).toBe(false);
    });
});

describe('diffSummary counts what changed', () => {
    it('one line swapped = +1 −1', () => {
        expect(diffSummary('a\nb\nc', 'a\nB\nc')).toEqual({ added: 1, removed: 1 });
    });
});

describe('the tool: colour changes are deterministic; honest without a project', () => {
    let tmp: string;
    beforeAll(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pedit-'));
        fs.mkdirSync(path.join(tmp, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"t"}');
        fs.writeFileSync(path.join(tmp, 'src', 'styles', 'tokens.css'), ':root{--brand:#ce4b27}');
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('«غيّر الألوان إلى أزرق» rewrites tokens.css with NO model call', async () => {
        const tool = new ProjectEditTool();
        const res: any = await tool.execute({ request: 'غيّر ألوان الموقع إلى أزرق', dir: tmp }, { sessionId: 'pedit-t' });
        expect(res.ok).toBe(true);
        const css = fs.readFileSync(path.join(tmp, 'src', 'styles', 'tokens.css'), 'utf-8');
        expect(css).not.toContain('#ce4b27');
        expect(css).toContain('data-theme="dark"');
        expect(res.output.touched).toEqual(['src/styles/tokens.css']);
        delete (global as any).joeProjects?.['pedit-t'];
    });
    it('no active project → an honest answer, not a crash', async () => {
        const tool = new ProjectEditTool();
        const res: any = await tool.execute({ request: 'عدل الهيدر' }, { sessionId: 'pedit-none' });
        expect(res.ok).toBe(true);
        expect(String(res.output.message)).toContain('لا يوجد مشروع');
    });
});

describe('routing: an edit goes to the surgical editor when the project is the active artifact', () => {
    const KEY = 'pedit-route';
    const FALLTHROUGH = 'llm-fallthrough';
    const route = async (goal: string): Promise<string> => {
        const p = PlanningEngine.generatePlan(
            { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
            undefined, { sessionId: KEY },
        ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
        return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
    };
    afterEach(() => {
        delete (global as any).joeProjects?.[KEY];
        delete (global as any).joePages?.[KEY];
    });

    it('project newer than page → project_edit', async () => {
        (global as any).joeProjects = { ...(global as any).joeProjects, [KEY]: { dir: '/x', updatedAt: 2000 } };
        (global as any).joePages = { ...(global as any).joePages, [KEY]: { filename: 'x.html', html: '<html>x</html>', updatedAt: 1000 } };
        expect(await route('غيّر لون الزر إلى أحمر')).toBe('project_edit');
    });
    it('page newer than project → the page editor keeps it', async () => {
        (global as any).joeProjects = { ...(global as any).joeProjects, [KEY]: { dir: '/x', updatedAt: 1000 } };
        (global as any).joePages = { ...(global as any).joePages, [KEY]: { filename: 'x.html', html: '<html>x</html>', updatedAt: 2000 } };
        expect(await route('غيّر لون الزر إلى أحمر')).toBe('web_page_builder');
    });
    it('a NEW build request is never hijacked by the project editor', async () => {
        (global as any).joeProjects = { ...(global as any).joeProjects, [KEY]: { dir: '/x', updatedAt: 2000 } };
        expect(await route('ابن لي موقعاً جديداً لمطعم بيتزا')).toBe('web_page_builder');
    });
});

describe('the project memory survives restarts', () => {
    it('flush → wipe → load restores joeProjects', () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-projstore-'));
        process.env.JOE_CHAT_STORE_DIR = tmp;
        const { flushJoeProjects, loadJoeProjects } = require('../api/page-store');
        const g: any = global as any;
        g.joeProjects = { s1: { dir: '/p/react-app', type: 'react', updatedAt: Date.now() } };
        flushJoeProjects();
        g.joeProjects = {};
        loadJoeProjects();
        expect(g.joeProjects.s1?.dir).toBe('/p/react-app');
        g.joeProjects = {};
        delete process.env.JOE_CHAT_STORE_DIR;
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});
