/**
 * STAGE 2 — real Vite + React projects, locked.
 *
 * The philosophy under test: the PROJECT SHAPE is deterministic (templates
 * that compile by construction — no model is ever asked to write JSX), the
 * design comes from Joe's own palette engine, and explicit React requests
 * enter the evidence-first project pipeline while plain site requests keep the page builder.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { PlanningEngine } from '../core/orchestrator/PlanningEngine';
import { ReactProjectTool, PROJECT_DIR_NAME_MAX_LENGTH, heroSecondaryDestination } from '../modules/tools/definitions/ReactProjectTool';
import { ApiProjectTool } from '../modules/tools/definitions/ApiProjectTool';
import { ScaffoldProjectTool } from '../modules/tools/definitions/SystemTools';
import { workspaceService } from '../modules/services/WorkspaceService';

const FALLTHROUGH = 'llm-fallthrough';
const route = async (goal: string): Promise<string> => {
    const p = PlanningEngine.generatePlan(
        { intent: { goal, complexity: 'medium', riskLevel: 'low', rawIntent: {} } as any },
    ).then(x => x.steps[0].tool).catch(() => FALLTHROUGH);
    return Promise.race([p, new Promise<string>(r => { const t = setTimeout(() => r(FALLTHROUGH), 1500); (t as any).unref?.(); })]);
};

describe('routing: explicit framework requests reach the evidence-first project pipeline', () => {
    for (const t of ['ابن لي مشروع React لمقهى', 'اعمل تطبيق Vite للمخبز', 'build me a react app for a gym', 'انشئ SPA لشركة شحن']) {
        it(`«${t}» → project_pipeline`, async () => expect(await route(t)).toBe('project_pipeline'));
    }
    it('a plain site request gets the deterministic React engine', async () => {
        // The old doctrine («keeps the page builder») shipped the commonest
        // request to an LLM-only writer; measured live, it wrote nothing
        // without a provider. The engine that reads design directives and
        // audits itself owns new sites now.
        expect(await route('ابن لي موقعاً لمطعم بيتزا مع قائمة طعام')).toBe('react_project');
    });
    it('the orchestrator runs react_project deterministically', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'orchestration', 'AgentOrchestrator.ts'), 'utf-8');
        expect(src).toMatch(/DETERMINISTIC_TOOLS = \[[\s\S]*?'react_project'/);
    });
    it('keeps the selected app blueprint in scope through domain authoring', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        const declared = src.indexOf('let runBp: any = appBp;');
        const branch = src.indexOf('if (appBp) {', declared);
        const assigned = src.indexOf('runBp = strippedRelation', branch);
        expect(declared).toBeGreaterThan(-1);
        expect(branch).toBeGreaterThan(declared);
        expect(assigned).toBeGreaterThan(branch);
        expect(src.slice(branch, assigned)).not.toContain('let runBp: any =');
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
    it('resumeExisting preserves a repaired dependency while reusing the session scaffold', async () => {
        const sessionId = 'jest-resume-manifest';
        const tmpResume = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-resume-manifest-'));
        try {
            const tool = new ReactProjectTool();
            const first = await tool.execute({
                request: 'build me a React app for a small business dashboard',
                root: tmpResume,
                skipInstall: true,
            }, { sessionId });
            expect(first.ok).toBe(true);
            const projectPath = first.output.path;
            const manifestPath = path.join(projectPath, 'package.json');
            const repairedManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            repairedManifest.dependencies['react-redux'] = '^9.2.0';
            fs.writeFileSync(manifestPath, JSON.stringify(repairedManifest, null, 2));

            const resumed = await tool.execute({
                request: 'build me a React app for a small business dashboard',
                root: tmpResume,
                skipInstall: true,
                resumeExisting: true,
            }, { sessionId });

            expect(resumed.ok).toBe(true);
            expect(resumed.output.path).toBe(projectPath);
            const preserved = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
            expect(preserved.dependencies['react-redux']).toBe('^9.2.0');
        } finally {
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(tmpResume, { recursive: true, force: true });
        }
    });
    it('index.html is Arabic RTL and vite.config uses base ./ (publishable)', () => {
        expect(fs.readFileSync(path.join(out.output.path, 'index.html'), 'utf-8')).toContain('dir="rtl"');
        expect(fs.readFileSync(path.join(out.output.path, 'vite.config.js'), 'utf-8')).toContain("base: './'");
    });

    it('points the hero CTA at a section selected for the page, not a removed template section', () => {
        expect(heroSecondaryDestination('landing', ['Hero', 'Location', 'Products', 'Contact'], false))
            .toEqual({ label: 'Browse services', href: '#products' });
        expect(heroSecondaryDestination('landing', ['Hero', 'Features', 'Contact'], false))
            .toEqual({ label: 'Explore features', href: '#features' });
        expect(heroSecondaryDestination('landing', ['Hero', 'Location', 'Products', 'Contact'], false, true))
            .toEqual({ label: 'تصفح الخدمات', href: '#products' });
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
        // Measured regressions from the tinted rhythm, now pinned: prices used
        // plain --brand and read 4.43:1 on the tint; the brand link was a
        // 21×33 tap target.
        expect(css).toContain('--price:color-mix(in srgb,var(--brand) 78%,var(--text))');
        expect(css).toContain('.menu-price{color:var(--price)');
        expect(css).toMatch(/\.brand\{[^}]*min-height:44px;min-width:44px\}/);
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
        // A store sells THINGS: product cards with photos and prices, not
        // subscription tiers. Pricing stays for app/dashboard kinds.
        expect(sectionsForKind('store')).toContain('Products');
        expect(sectionsForKind('store')).not.toContain('Pricing');
        expect(sectionsForKind('app')).toContain('Pricing');   // tiers belong to SaaS, not shelves
        // Every kind carries the mid-page CTA band, always before Contact.
        for (const k of ['restaurant', 'store', 'landing', 'portfolio', 'app', 'event', 'generic'] as any[]) {
            const sec = sectionsForKind(k);
            expect(sec).toContain('Cta');
            expect(sec.indexOf('Cta')).toBeLessThan(sec.indexOf('Contact'));
        }
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

    it('the restaurant app carries the menu with prices; the store carries product cards', async () => {
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

/**
 * REAL PHOTOS — the hero photo rides Joe's existing image engine, lands
 * INSIDE the project (public/), credits its licence in the footer, and a
 * no-photo build ships clean (heroImage: null, no broken <img>).
 */
describe('real photos in React apps', () => {
    it('offline scaffolds ship clean without a photo (null, no <img> markup baked)', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-img-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React لمقهى', root: tmp, skipInstall: true }, { sessionId: 'img-off' });
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain('heroImage: null');
        expect(fs.existsSync(path.join(res.output.path, 'public', 'images'))).toBe(false);
        delete (global as any).joeProjects?.['img-off'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });
    it('the Hero renders the photo CONDITIONALLY (eager, high priority) and the Footer credits it', async () => {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-img2-'));
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React لمقهى', root: tmp, skipInstall: true }, { sessionId: 'img-t' });
        const hero = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Hero.jsx'), 'utf-8');
        expect(hero).toContain('content.heroImage ?');
        expect(hero).toContain('fetchpriority="high"');
        expect(syntaxOk('Hero.jsx', hero).ok).toBe(true);
        const footer = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Footer.jsx'), 'utf-8');
        expect(footer).toContain('content.credits');
        expect(footer).toContain('noopener noreferrer nofollow');
        expect(syntaxOk('Footer.jsx', footer).ok).toBe(true);
        delete (global as any).joeProjects?.['img-t'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });
});

/**
 * HERO ARCHETYPES, GALLERY, TRUST STRIP, HONEST NAVIGATION.
 *
 * One hero shape for every business is the loudest reason two builds look
 * alike, so the archetype is picked deterministically — and 'centered' is
 * never WISHED for: it is the honest fallback when no photograph arrived,
 * which is what keeps a downloaded photo from going unrendered.
 *
 * The navigation is locked to the sections the build actually has. A
 * restaurant used to advertise a #features anchor it never rendered.
 */
import { heroLayoutFor } from '../modules/tools/definitions/ReactProjectTool';

describe('the hero archetypes and the sections that came with them', () => {
    it('the archetype is deterministic, kind- and family-aware', () => {
        expect(heroLayoutFor('restaurant', 'warm')).toBe('overlay');
        expect(heroLayoutFor('event', 'bold')).toBe('overlay');
        expect(heroLayoutFor('store', 'elegant')).toBe('overlay');
        expect(heroLayoutFor('store', 'bold')).toBe('split');
        expect(heroLayoutFor('app', 'bold')).toBe('split');
        expect(heroLayoutFor('generic', 'minimal')).toBe('split');
        for (const k of ['restaurant', 'store', 'landing', 'app', 'generic'] as any[]) {
            expect(heroLayoutFor(k, 'warm')).not.toBe('centered');    // never wished for
        }
    });
    it('the photo-carrying kinds gained a gallery, before the social proof', () => {
        for (const k of ['restaurant', 'store', 'portfolio'] as any[]) {
            const sec = sectionsForKind(k);
            expect(sec).toContain('Gallery');
            expect(sec.indexOf('Gallery')).toBeLessThan(sec.indexOf('Cta'));
        }
        expect(sectionsForKind('app')).not.toContain('Gallery');
    });

    describe('a scaffolded restaurant', () => {
        let out: any, root: string;
        beforeAll(async () => {
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-arch-'));
            out = await new ReactProjectTool().execute(
                { request: 'ابن لي مشروع React لمطعم', root, skipInstall: true }, { sessionId: 'arch-t' });
        });
        afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); delete (global as any).joeProjects?.['arch-t']; });

        it('asks for the overlay hero and carries all three branches, each parseable', () => {
            const content = fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8');
            expect(content).toContain("heroLayout: 'overlay'");
            const hero = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Hero.jsx'), 'utf-8');
            for (const cls of ['hero-overlay', 'hero-split-layout', 'hero-centered']) expect(hero).toContain(cls);
            expect(hero).toContain("content.heroImage ? (content.heroLayout || 'split') : 'centered'");
            expect(syntaxOk('Hero.jsx', hero).ok).toBe(true);
        });
        it('the trust strip is three real perks with icons', () => {
            const content = fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8');
            const perks = (content.match(/perks: \[(.*)\]/) || [])[1] || '';
            expect(perks.split("', '").length).toBe(3);
            expect(fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Hero.jsx'), 'utf-8')).toContain('perks-band');
        });
        it('an EMPTY gallery renders nothing at all — never a section made of holes', () => {
            const gal = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Gallery.jsx'), 'utf-8');
            expect(gal).toContain('if (!shots.length) return null;');
            expect(syntaxOk('Gallery.jsx', gal).ok).toBe(true);
            expect(fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8')).toMatch(/gallery: \[\s*\]/);
        });
        it('every navigation link names a section this build REALLY renders', () => {
            const content = fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8');
            const hrefs = [...content.matchAll(/\{ href: '#([a-z]+)', label:/g)].map(m => m[1]);
            expect(hrefs.length).toBeGreaterThanOrEqual(3);
            expect(hrefs).toContain('menu');
            expect(hrefs).not.toContain('features');          // the anchor that never existed
            // This scaffold is OFFLINE: no photographs arrived, so the gallery
            // renders nothing — and a section that renders nothing must never
            // be advertised in the menu.
            expect(hrefs).not.toContain('gallery');
            // Nor is a location advertised without a real saved address.
            expect(hrefs).not.toContain('location');
            const ids = new Set(['menu', 'gallery', 'story', 'steps', 'testimonials', 'contact', 'cta',
                'products', 'features', 'pricing', 'compare', 'team', 'faq', 'stats', 'location']);
            for (const h of hrefs) {
                expect(ids.has(h)).toBe(true);
                const comp = h[0].toUpperCase() + h.slice(1);
                expect(fs.existsSync(path.join(out.output.path, 'src', 'components', `${comp}.jsx`))).toBe(true);
            }
            const nav = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Navbar.jsx'), 'utf-8');
            expect(nav).toContain('content.navLinks');
            expect(nav).not.toContain('#features');
        });
        it('the footer became a real three-column footer', () => {
            const footer = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Footer.jsx'), 'utf-8');
            expect(footer).toContain('footer-cols');
            expect(footer).toContain('footer-links');
            expect(footer).toContain('content.navLinks');
            expect(syntaxOk('Footer.jsx', footer).ok).toBe(true);
        });
    });

    it('a MULTI-PAGE app navigates by ROUTE — «#menu» would drive the router into its own 404', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-arch2-'));
        const out: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React متعدد الصفحات لمطعم', root, skipInstall: true }, { sessionId: 'arch-mp' });
        const content = fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8');
        const hrefs = [...content.matchAll(/\{ href: '(#[^']*)', label:/g)].map(m => m[1]);
        expect(hrefs).toContain('#/');
        expect(hrefs).toContain('#/menu');
        expect(hrefs.every(h => h.startsWith('#/'))).toBe(true);
        fs.rmSync(root, { recursive: true, force: true });
        delete (global as any).joeProjects?.['arch-mp'];
    });
});

/**
 * REAL PRODUCT PAGES, A TEAM, AND THE END OF THE DEP0190 WARNING.
 *
 * A shop whose products have no address of their own cannot be shared, sent
 * in a message, or reloaded. The product view lives at «#product/<slug>» —
 * «#/product/<slug>» when the hash router owns the address bar — so a cold
 * reload lands on the same product and the back button really goes back.
 */
describe('product pages, the team, and the build command', () => {
    let out: any, root: string;
    beforeAll(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-shop-'));
        out = await new ReactProjectTool().execute(
            { request: 'ابن لي متجر React للحقائب', root, skipInstall: true }, { sessionId: 'shop-t' });
    });
    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); delete (global as any).joeProjects?.['shop-t']; });

    it('every product carries a slug, and the cards link to it', () => {
        const content = fs.readFileSync(path.join(out.output.path, 'src', 'content.js'), 'utf-8');
        const slugs = [...content.matchAll(/slug: '([^']+)'/g)].map(m => m[1]);
        expect(slugs.length).toBeGreaterThanOrEqual(3);
        expect(new Set(slugs).size).toBe(slugs.length);            // a url per product, never shared
        const products = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'Products.jsx'), 'utf-8');
        expect(products).toContain("'#' + (content.routeBase || '') + 'product/' + p.slug");
    });
    it('the product view is a PAGE: its own url, a back link, Escape, and a locked page beneath', () => {
        const view = fs.readFileSync(path.join(out.output.path, 'src', 'components', 'ProductView.jsx'), 'utf-8');
        expect(view).toMatch(/\^#\\\/\?product\\\/\(\.\+\)\$/);     // both routing styles
        expect(view).toContain("aria-modal=\"true\"");
        expect(view).toContain("window.addEventListener('hashchange'");
        expect(view).toContain("e.key === 'Escape'");
        expect(view).toContain("document.body.style.overflow");
        expect(view).toContain('product-back');
        expect(syntaxOk('ProductView.jsx', view).ok).toBe(true);
        // Mounted above everything, so a cold load of the url renders it.
        expect(fs.readFileSync(path.join(out.output.path, 'src', 'App.jsx'), 'utf-8')).toContain('<ProductView content={content} />');
    });
    it('a MULTI-PAGE shop routes its products too', async () => {
        const r2 = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-shop2-'));
        const mp: any = await new ReactProjectTool().execute(
            { request: 'ابن لي متجر React متعدد الصفحات للحقائب', root: r2, skipInstall: true }, { sessionId: 'shop-mp' });
        expect(fs.readFileSync(path.join(mp.output.path, 'src', 'content.js'), 'utf-8')).toContain("routeBase: '/'");
        const app = fs.readFileSync(path.join(mp.output.path, 'src', 'App.jsx'), 'utf-8');
        expect(app).toContain('<ProductView content={content} />');
        expect(app).toContain("path.startsWith('/product/')");      // the 404 stays out of its way
        expect(syntaxOk('App.jsx', app).ok).toBe(true);
        fs.rmSync(r2, { recursive: true, force: true });
        delete (global as any).joeProjects?.['shop-mp'];
    });
    it('the team ships three people and never a broken avatar', async () => {
        // The team belongs to the kinds with faces to show — a restaurant, a
        // portfolio, a landing page. A shelf of bags is not one of them.
        expect(sectionsForKind('store')).not.toContain('Team');
        const r3 = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-team-'));
        const rest: any = await new ReactProjectTool().execute(
            { request: 'ابن لي مشروع React لمطعم', root: r3, skipInstall: true }, { sessionId: 'team-t' });
        const team = fs.readFileSync(path.join(rest.output.path, 'src', 'components', 'Team.jsx'), 'utf-8');
        expect(team).toContain('person-monogram');                  // the no-photo shape
        expect(team).toContain('m.img');
        expect(syntaxOk('Team.jsx', team).ok).toBe(true);
        const content = fs.readFileSync(path.join(rest.output.path, 'src', 'content.js'), 'utf-8');
        expect((content.match(/team: \[[\s\S]*?\n {2}\]/) || [''])[0].match(/name: '/g) || []).toHaveLength(3);
        fs.rmSync(r3, { recursive: true, force: true });
        delete (global as any).joeProjects?.['team-t'];
    });
    it('every family names a second accent, and the base sheet defaults one', () => {
        const { familyCss } = require('../core/design/families');
        for (const f of ['minimal', 'elegant', 'bold', 'warm']) expect(familyCss(f)).toContain('--accent:');
        expect(fs.readFileSync(path.join(out.output.path, 'src', 'styles', 'base.css'), 'utf-8')).toContain('--accent:var(--brand-dark)');
    });
    it('npm is spawned DIRECTLY on Windows — no shell, so no DEP0190 warning', () => {
        const engine = fs.readFileSync(path.join(__dirname, '..', 'kernel', 'ExecutionEngine.ts'), 'utf-8');
        expect(engine).toContain("const WIN_CMD_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm'])");
        // The shim must run THROUGH A SHELL on Windows: since the CVE-2024-27980
        // fix, spawning a .cmd without one throws EINVAL — measured on Node 24,
        // where a scaffolded React project died before `npm install` began. The
        // arguments are quoted here instead of being left to the shell.
        expect(engine).toMatch(/const needsShell = isWin && rest\.shell === undefined && isShim/);
        expect(engine).toContain('const quoteForCmd =');
        for (const t of ['ReactProjectTool', 'ApiProjectTool', 'ProjectEditTool', 'ImportProjectTool']) {
            const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', `${t}.ts`), 'utf-8');
            expect(src).not.toContain("shell: process.platform === 'win32'");
        }
    });
});


describe('project identity: React builds reuse only their session-owned scaffold', () => {
    it('reuses a valid React/Vite scaffold registered for the same session', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-reuse-'));
        const sessionId = 'reuse-scaffold-t';
        const scaffoldDir = path.join(root, 'QuickNotes');
        fs.mkdirSync(path.join(scaffoldDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(scaffoldDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(scaffoldDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = { dir: scaffoldDir, type: 'scaffold', brand: 'QuickNotes' };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true, resumeExisting: true },
                { sessionId },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).toBe(path.resolve(scaffoldDir));
            expect(fs.readFileSync(path.join(scaffoldDir, 'src', 'App.jsx'), 'utf8')).toContain('ProductivityApp');
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not reuse a stale React entry during a new greenfield build', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-greenfield-react-'));
        const sessionId = 'greenfield-old-react-t';
        const staleDir = path.join(root, 'OldReact');
        fs.mkdirSync(path.join(staleDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(staleDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(staleDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        fs.writeFileSync(path.join(staleDir, 'src', 'stale-marker.txt'), 'must remain untouched');
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = { dir: staleDir, type: 'react', brand: 'OldReact' };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true, projectName: 'FreshNotes' },
                { sessionId, runId: 'new-greenfield-run' },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).not.toBe(path.resolve(staleDir));
            expect(path.resolve(result.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(fs.readFileSync(path.join(staleDir, 'src', 'stale-marker.txt'), 'utf8')).toBe('must remain untouched');
            expect(result.logs.join('\n')).not.toContain('project identity: reusing');
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('reuses a session-owned scaffold when scaffoldDir is explicit', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-explicit-scaffold-'));
        const sessionId = 'explicit-scaffold-dir-t';
        const scaffoldDir = path.join(root, 'QuickNotes');
        fs.mkdirSync(path.join(scaffoldDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(scaffoldDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(scaffoldDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = { dir: path.join(root, 'api'), type: 'api', scaffoldDir, resource: 'notes' };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true, scaffoldDir },
                { sessionId, runId: 'new-explicit-run' },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).toBe(path.resolve(scaffoldDir));
            expect(result.logs.join('\n')).toContain('project identity: reusing');
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps API identity while refusing its stale scaffold root', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-identity-'));
        const sessionId = 'api-identity-fresh-react-t';
        const staleDir = path.join(root, 'OldApiReact');
        const apiDir = path.join(root, 'ApiProject');
        fs.mkdirSync(path.join(staleDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(staleDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(staleDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const runtimeAuth = { email: 'owner@example.test', password: 'runtime-secret' };
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = {
            dir: apiDir, type: 'api', scaffoldDir: staleDir, resource: 'orders', appKind: 'finance', runtimeAuth,
            pipelineRunId: 'old-api-run',
        };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React app for a customer ledger', root, skipInstall: true, projectName: 'FreshLedger' },
                { sessionId, runId: 'new-react-run' },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).not.toBe(path.resolve(staleDir));
            expect(path.resolve(result.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(result.logs.join('\n')).toContain('app=finance');
            expect(projects[sessionId].linkedApi).toBe('/api/orders');
            expect(projects[sessionId].linkedApiDir).toBe(apiDir);
            expect(projects[sessionId].runtimeAuth).toEqual(runtimeAuth);
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not reuse a registered scaffold during a new greenfield build', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-greenfield-'));
        const sessionId = 'greenfield-old-scaffold-t';
        const staleDir = path.join(root, 'WeatherGo');
        fs.mkdirSync(path.join(staleDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(staleDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(staleDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = { dir: staleDir, type: 'scaffold', brand: 'WeatherGo' };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true },
                { sessionId },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).not.toBe(path.resolve(staleDir));
            expect(path.resolve(result.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(fs.existsSync(path.join(staleDir, 'src', 'App.jsx'))).toBe(false);
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not reuse a stale scaffoldDir carried by an old API registry entry', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-stale-handoff-'));
        const sessionId = 'greenfield-old-api-handoff-t';
        const staleDir = path.join(root, 'react-weathergo-old');
        fs.mkdirSync(path.join(staleDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(staleDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(staleDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = {
            dir: path.join(root, 'old-api'), type: 'api', scaffoldDir: staleDir,
            pipelineRunId: 'old-pipeline-run', brand: 'WeatherGo',
        };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true, projectName: 'FreshNotes' },
                { sessionId, runId: 'new-pipeline-run' },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).not.toBe(path.resolve(staleDir));
            expect(path.resolve(result.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(fs.existsSync(path.join(staleDir, 'src', 'App.jsx'))).toBe(false);
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('keeps a scaffoldDir handoff stamped by the current pipeline run', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-api-current-handoff-'));
        const sessionId = 'current-api-handoff-t';
        const scaffoldDir = path.join(root, 'QuickNotes');
        fs.mkdirSync(path.join(scaffoldDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(scaffoldDir, 'index.html'), '<!doctype html><div id="root"></div>');
        fs.writeFileSync(path.join(scaffoldDir, 'package.json'), JSON.stringify({
            private: true, type: 'module',
            scripts: { dev: 'vite', build: 'vite build' },
            dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
            devDependencies: { vite: '^5.4.11' },
        }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = {
            dir: path.join(root, 'current-api'), type: 'api', scaffoldDir,
            pipelineRunId: 'current-pipeline-run', brand: 'QuickNotes',
        };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React productivity app for notes and tasks', root, skipInstall: true, projectName: 'QuickNotes' },
                { sessionId, runId: 'current-pipeline-run' },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).toBe(path.resolve(scaffoldDir));
            expect(fs.readFileSync(path.join(scaffoldDir, 'src', 'App.jsx'), 'utf8')).toContain('ProductivityApp');
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('preserves a real scaffold → API → React handoff inside one pipeline run', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-same-run-handoff-'));
        const sessionId = 'same-run-api-react-handoff-t';
        const runId = 'same-run-api-react-pipeline';
        const scaffoldDir = path.join(root, 'QuickNotes');
        const activeRootSpy = jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        const structure = {
            'index.html': '<!doctype html><html><body><div id="root"></div></body></html>',
            'package.json': JSON.stringify({
                private: true, type: 'module',
                scripts: { dev: 'vite', build: 'vite build' },
                dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' },
                devDependencies: { vite: '^5.4.11' },
            }),
            'src/App.jsx': 'export default function App() { return <main>QuickNotes</main>; }',
        };
        try {
            const scaffold: any = await new ScaffoldProjectTool().execute(
                { structure, baseDir: scaffoldDir },
                { sessionId, runId, workspaceId: root },
            );
            expect(scaffold.ok).toBe(true);
            expect(scaffold.output.projectDir).toBe(scaffoldDir);

            const api: any = await new ApiProjectTool().execute(
                { request: 'Build an API for a restaurant menu', root, skipInstall: true },
                { sessionId, runId, workspaceId: root },
            );
            expect(api.ok).toBe(true);
            expect((global as any).joeProjects[sessionId].pipelineRunId).toBe(runId);
            expect((global as any).joeProjects[sessionId].scaffoldDir).toBe(scaffoldDir);

            const react: any = await new ReactProjectTool().execute(
                { request: 'Build a React app for a restaurant menu', root, skipInstall: true, projectName: 'QuickNotes' },
                { sessionId, runId, workspaceId: root },
            );
            expect(react.ok).toBe(true);
            expect(path.resolve(react.output.path)).toBe(path.resolve(scaffoldDir));
            expect(react.logs.join('\\n')).toContain('project identity: reusing');
        } finally {
            activeRootSpy.mockRestore();
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('allocates a distinct runtime root for each greenfield request in one session', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-root-'));
        const sessionId = 'run-root-same-session-t';
        fs.mkdirSync(path.join(root, 'react-gate062'), { recursive: true });
        try {
            const first: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId, runId: 'run-root-first-20260822-abcdef0123456789' },
            );
            const second: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId, runId: 'run-root-second-20260822-9876543210fedcba' },
            );
            expect(first.ok).toBe(true);
            expect(second.ok).toBe(true);
            expect(path.resolve(first.output.path)).not.toBe(path.resolve(second.output.path));
            expect(path.resolve(first.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(path.resolve(second.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
            expect(path.basename(first.output.path)).toBe('react-gate062-rootfirs');
            expect(path.basename(second.output.path)).toBe('react-gate062-rootseco');
            expect(path.basename(first.output.path).length).toBeLessThanOrEqual(PROJECT_DIR_NAME_MAX_LENGTH);
            expect(path.basename(second.output.path).length).toBeLessThanOrEqual(PROJECT_DIR_NAME_MAX_LENGTH);
            expect(second.logs.join('\\n')).not.toContain('project identity: reusing');
        } finally {
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('uses a session-plus-unique fallback when runId is absent', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-no-run-root-'));
        const sessionA = 'no-run-session-a';
        const sessionB = 'no-run-session-b';
        try {
            const first: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId: sessionA },
            );
            const secondSameSession: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId: sessionA },
            );
            const secondSession: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId: sessionB },
            );
            expect(first.ok).toBe(true);
            expect(secondSameSession.ok).toBe(true);
            expect(secondSession.ok).toBe(true);
            const outputs = [first.output.path, secondSameSession.output.path, secondSession.output.path];
            expect(new Set(outputs).size).toBe(3);
            for (const outputPath of outputs) {
                expect(path.basename(outputPath).length).toBeLessThanOrEqual(PROJECT_DIR_NAME_MAX_LENGTH);
            }
        } finally {
            delete (global as any).joeProjects?.[sessionA];
            delete (global as any).joeProjects?.[sessionB];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('refuses a collision after all runtime-root disambiguators are occupied', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-root-collision-'));
        const sessionId = 'root-collision-t';
        const runId = 'run-root-collision-20260822-abcdef0123456789';
        const readableSuffix = 'rootcoll';

        try {
            fs.mkdirSync(path.join(root, 'react-gate062'), { recursive: true });
            for (let i = 0; i <= 8; i += 1) {
                const suffix = i === 0 ? readableSuffix : `${readableSuffix}-${i}`;
                fs.mkdirSync(path.join(root, `react-gate062-${suffix}`), { recursive: true });
            }
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a small React app called Gate062', root, projectName: 'Gate062', skipInstall: true },
                { sessionId, runId },
            );
            expect(result.ok).toBe(false);
            expect(result.error).toBe('project_path_collision');
            expect(result.logs.join('\\n')).toContain('refusing occupied greenfield path=');
            expect(fs.existsSync(path.join(root, 'react-gate062', 'src', 'App.jsx'))).toBe(false);
        } finally {
            delete (global as any).joeProjects?.[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
        }
    });

    it('does not reuse a non-React or cross-root artifact', async () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-no-reuse-'));
        const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-outside-'));
        const sessionId = 'no-reuse-scaffold-t';
        fs.mkdirSync(path.join(outside, 'src'), { recursive: true });
        fs.writeFileSync(path.join(outside, 'package.json'), JSON.stringify({ scripts: { build: 'vite build' } }));
        const projects = ((global as any).joeProjects || ((global as any).joeProjects = {}));
        projects[sessionId] = { dir: outside, type: 'scaffold', brand: 'QuickNotes' };
        try {
            const result: any = await new ReactProjectTool().execute(
                { request: 'Build a React app for a cafe', root, skipInstall: true },
                { sessionId },
            );
            expect(result.ok).toBe(true);
            expect(path.resolve(result.output.path)).not.toBe(path.resolve(outside));
            expect(path.resolve(result.output.path).startsWith(path.resolve(root) + path.sep)).toBe(true);
        } finally {
            delete projects[sessionId];
            fs.rmSync(root, { recursive: true, force: true });
            fs.rmSync(outside, { recursive: true, force: true });
        }
    });
});
