/**
 * STAGE 2 — real Vite + React projects, locked.
 *
 * The philosophy under test: the PROJECT SHAPE is deterministic (templates
 * that compile by construction — no model is ever asked to write JSX), the
 * design comes from Joe's own palette engine, and explicit React requests
 * route to the scaffolder while plain site requests keep the page builder.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { ReactProjectTool } from '../modules/tools/definitions/ReactProjectTool';

const FALLTHROUGH = 'llm-fallthrough';
const route = async (goal: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
};

describe('routing: explicit framework requests reach the scaffolder', () => {
    for (const t of ['ابن لي مشروع React لمقهى', 'اعمل تطبيق Vite للمخبز', 'build me a react app for a gym', 'انشئ SPA لشركة شحن']) {
        it(`«${t}» → react_project`, async () => expect(await route(t)).toBe('react_project'));
    }
    it('a plain site request keeps the page builder', async () => {
        expect(await route('ابن لي موقعاً لمطعم بيتزا مع قائمة طعام')).toBe('web_page_builder');
    });
    it('the orchestrator runs react_project deterministically', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(src).toMatch(/DETERMINISTIC_TOOLS = \[[\s\S]*?'react_project'/);
    });
});

describe('the scaffold: complete, RTL, tokenized, honest', () => {
    let tmp: string;
    let out: any;
    beforeAll(async () => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-react-t-'));
        const tool = new ReactProjectTool();
        out = await tool.execute({ request: 'ابن لي مشروع React لمقهى «بُن»', root: tmp, skipInstall: true }, { sessionId: 'jest-react' });
    });
    afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('reports ok with the full file list', () => {
        expect(out.ok).toBe(true);
        expect(out.output.files.length).toBeGreaterThanOrEqual(14);
    });
    it('package.json is valid and pins the build scripts', () => {
        const pkg = JSON.parse(fs.readFileSync(path.join(out.output.path, 'package.json'), 'utf-8'));
        expect(pkg.scripts.dev).toBe('vite');
        expect(pkg.scripts.build).toBe('vite build');
        expect(pkg.dependencies.react).toBeTruthy();
        expect(pkg.devDependencies['@vitejs/plugin-react']).toBeTruthy();
    });
    it('index.html is Arabic RTL and vite.config uses base ./ (publishable)', () => {
        expect(fs.readFileSync(path.join(out.output.path, 'index.html'), 'utf-8')).toContain('dir="rtl"');
        expect(fs.readFileSync(path.join(out.output.path, 'vite.config.js'), 'utf-8')).toContain("base: './'");
    });
    it('the tokens come from Joe\'s real palette engine (light AND dark blocks)', () => {
        const tokens = fs.readFileSync(path.join(out.output.path, 'src', 'styles', 'tokens.css'), 'utf-8');
        expect(tokens).toContain('--brand:');
        expect(tokens).toMatch(/data-theme="dark"/);
    });
    it('every component parses as balanced JSX (no stray braces, export default present)', () => {
        const compDir = path.join(out.output.path, 'src', 'components');
        for (const f of fs.readdirSync(compDir)) {
            const src = fs.readFileSync(path.join(compDir, f), 'utf-8');
            expect(src).toContain('export default function');
            expect((src.match(/\{/g) || []).length).toBe((src.match(/\}/g) || []).length);
            expect((src.match(/</g) || []).length).toBeGreaterThan(2);
        }
    });
    it('the audit lessons are baked in: h2 before the cards, labelled fields, 44px targets', () => {
        const features = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Features.jsx'), 'utf-8');
        expect(features).toContain('<h2>');
        const contact = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Contact.jsx'), 'utf-8');
        expect((contact.match(/aria-label=/g) || []).length).toBeGreaterThanOrEqual(3);
        const css = fs.readFileSync(path.join(out.output.path, 'src', 'styles', 'base.css'), 'utf-8');
        expect(css).toContain('min-height:44px');
    });
    it('the honest form: no fake delivery claim in the template', () => {
        const contact = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Contact.jsx'), 'utf-8');
        expect(contact).not.toMatch(/تم الإرسال|sent successfully/i);
    });
    it('skipInstall means exactly that — no node_modules were created', () => {
        expect(fs.existsSync(path.join(out.output.path, 'node_modules'))).toBe(false);
        expect(out.output.installed).toBe(false);
    });
});
