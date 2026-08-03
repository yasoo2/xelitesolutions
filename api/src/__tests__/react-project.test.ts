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
        // The kind decides WHICH section follows the hero (a coffee shop gets
        // a Menu, not Features) — the lesson holds for whichever shipped.
        const compDir = path.join(out.output.path, 'src', 'components');
        const second = ['Menu.jsx', 'Features.jsx', 'Pricing.jsx'].find(f => fs.existsSync(path.join(compDir, f)))!;
        expect(fs.readFileSync(path.join(compDir, second), 'utf-8')).toContain('<h2>');
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

/**
 * KIND-AWARE APPS — a restaurant carries its menu, a store its pricing.
 * Every kind's full component set must parse (the esbuild gate), because
 * the templates are the ONLY author of this code.
 */
import { sectionsForKind } from '../modules/tools/definitions/ReactProjectTool';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

describe('kind-aware React apps', () => {
    it('the kinds map to the sections a real business needs', () => {
        expect(sectionsForKind('restaurant')).toContain('Menu');
        expect(sectionsForKind('store')).toContain('Pricing');
        expect(sectionsForKind('landing')).toContain('Stats');
        expect(sectionsForKind('generic')).toContain('Faq');
        for (const k of ['restaurant', 'store', 'landing', 'portfolio', 'app', 'event', 'generic'] as any[]) {
            const s = sectionsForKind(k);
            expect(s[0]).toBe('Hero');
            expect(s[s.length - 1]).toBe('Contact');
        }
    });

    it('every kind scaffolds a full component set that PARSES', async () => {
        for (const req of [
            'ابن لي مشروع React لمطعم مأكولات بحرية',
            'ابن لي مشروع React لمتجر عطور',
            'build me a react app landing page for a startup',
        ]) {
            const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-kind-'));
            const res: any = await new ReactProjectTool().execute({ request: req, root: tmp, skipInstall: true }, { sessionId: `kind-${Math.random().toString(36).slice(2, 6)}` });
            expect(res.ok).toBe(true);
            const compDir = path.join(res.output.path, 'src', 'components');
            for (const f of fs.readdirSync(compDir)) {
                const gate = syntaxOk(f, fs.readFileSync(path.join(compDir, f), 'utf-8'));
                expect(`${f}:${gate.ok}`).toBe(`${f}:true`);
            }
            fs.rmSync(tmp, { recursive: true, force: true });
        }
    });

    it('the restaurant app carries the menu with prices; the store carries tiers', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-kind2-'));
        const rest: any = await new ReactProjectTool().execute({ request: 'ابن لي مشروع React لمطعم', root: tmp, skipInstall: true }, { sessionId: 'kind-rest' });
        expect(fs.existsSync(path.join(rest.output.path, 'src', 'components', 'Menu.jsx'))).toBe(true);
        expect(fs.existsSync(path.join(rest.output.path, 'src', 'components', 'Pricing.jsx'))).toBe(false);
        const content = fs.readFileSync(path.join(rest.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain('قائمة الطعام');
        expect(content).toContain('ر.س');
        const app = fs.readFileSync(path.join(rest.output.path, 'src', 'App.jsx'), 'utf-8');
        expect(app).toContain('<Menu content={content} />');
        expect(app).not.toContain('Pricing');
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});

/**
 * MULTI-PAGE APPS — a real router without a dependency: hash navigation
 * (survives refresh on static hosting), pages composed from the SAME
 * section components, aria-current on the active link, honest 404.
 */
import { pagesForKind, wantsMultiPage } from '../modules/tools/definitions/ReactProjectTool';

describe('multi-page React apps', () => {
    it('detection: multi-page is explicit, single-page stays the default', () => {
        expect(wantsMultiPage('ابن لي مشروع React متعدد الصفحات لمطعم')).toBe(true);
        expect(wantsMultiPage('build a multi-page react app')).toBe(true);
        expect(wantsMultiPage('ابن لي مشروع React لمطعم')).toBe(false);
    });
    it('every kind\'s page plan starts at home and ends at contact', () => {
        for (const k of ['restaurant', 'store', 'landing', 'generic'] as any[]) {
            const pages = pagesForKind(k);
            expect(pages[0].path).toBe('/');
            expect(pages[pages.length - 1].path).toBe('/contact');
            expect(pages.length).toBeGreaterThanOrEqual(3);
        }
    });
    it('a multi-page restaurant scaffold: router present, every file parses, menu on its own page', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-mp-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React متعدد الصفحات لمطعم', root: tmp, skipInstall: true }, { sessionId: 'mp-t' });
        expect(res.ok).toBe(true);
        const proj = res.output.path;
        expect(fs.existsSync(path.join(proj, 'src', 'router.jsx'))).toBe(true);
        for (const rel of ['src/router.jsx', 'src/App.jsx', 'src/components/Navbar.jsx']) {
            const gate = syntaxOk(rel, fs.readFileSync(path.join(proj, rel), 'utf-8'));
            expect(`${rel}:${gate.ok}`).toBe(`${rel}:true`);
        }
        const app = fs.readFileSync(path.join(proj, 'src', 'App.jsx'), 'utf-8');
        expect(app).toContain("path: '/menu'");
        expect(app).toContain('404');
        const nav = fs.readFileSync(path.join(proj, 'src', 'components', 'Navbar.jsx'), 'utf-8');
        expect(nav).toContain("from '../router.jsx'");
        delete (global as any).joeProjects?.['mp-t'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });
    it('the single-page scaffold is untouched (no router file, anchor nav)', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-sp-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React لمطعم', root: tmp, skipInstall: true }, { sessionId: 'sp-t' });
        expect(fs.existsSync(path.join(res.output.path, 'src', 'router.jsx'))).toBe(false);
        expect(fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Navbar.jsx'), 'utf-8')).toContain('href="#top"');
        delete (global as any).joeProjects?.['sp-t'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});
