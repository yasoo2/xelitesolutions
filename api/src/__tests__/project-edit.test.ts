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
import { parseEditBlocks, applyEditBlock, syntaxOk, diffSummary, parseLiteralTextReplacement, parsePresentationEdits, parseServicesSectionEdit, boundedChangeValue, pickPhotoRow, requestsVisibleBrowserAudit, ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';
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
    it('changes an explicitly quoted button label without a model call but blocks delivery when requested browser QA is unavailable', async () => {
        fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'src', 'content.js'), "export const content = { cta: 'احجز جلسة' };\n");
        const res: any = await new ProjectEditTool().execute(
            { request: 'غيّر نص زر «احجز جلسة» إلى «احجز موعدك»، ثم اختبر التعديل في المتصفح.', dir: tmp },
            { sessionId: 'pedit-literal' },
        );
        expect(res.ok).toBe(false);
        expect(res.output.visualVerificationBlocked).toBe(true);
        expect(String(res.output.message)).toContain('التسليم متوقف');
        expect(res.output.touched).toEqual(['src/content.js']);
        expect(fs.readFileSync(path.join(tmp, 'src', 'content.js'), 'utf-8')).toContain("cta: 'احجز موعدك'");
        delete (global as any).joeProjects?.['pedit-literal'];
    });
});

describe('short quoted wording follow-ups', () => {
    it('treats an explicitly requested visual browser check as a delivery gate', () => {
        expect(requestsVisibleBrowserAudit('عدّل الزر ثم اختبر التغييرات في المتصفح')).toBe(true);
        expect(requestsVisibleBrowserAudit('Change the button and verify it visually in the browser')).toBe(true);
        expect(requestsVisibleBrowserAudit('غيّر نص الزر فقط')).toBe(false);
    });

    it('parses an Arabic button-label replacement without swallowing the QA clause', () => {
        expect(parseLiteralTextReplacement('غيّر نص زر «احجز جلسة» إلى «احجز موعدك»، ثم اختبر التعديل في المتصفح.')).toEqual({
            from: 'احجز جلسة',
            to: 'احجز موعدك',
        });
    });

    it('requires two explicit quoted values', () => {
        expect(parseLiteralTextReplacement('غيّر نص الزر إلى شيء أجمل')).toBeNull();
    });

    it('reads a multi-action presentation request as three bounded operations', () => {
        const request = 'غيّر نص زر البطل «احجز الآن» إلى «ابدأ مشروعك»، وأضف شعارًا نصيًا صغيرًا «M» بجانب اسم «مدار» في الشريط العلوي، وأضف تحت عنوان الخدمات سطرًا «حلول مصممة حول أهداف عملك».';
        expect(parsePresentationEdits(request)).toEqual([
            { kind: 'literal', from: 'احجز الآن', to: 'ابدأ مشروعك' },
            { kind: 'brand_mark', value: 'M', beside: 'مدار' },
            { kind: 'section_subtitle', section: 'الخدمات', value: 'حلول مصممة حول أهداف عملك' },
        ]);
        expect(boundedChangeValue(`${request} ثم ابنِ المشروع واختبره.`)).toBe('ابدأ مشروعك');
    });

    it('reads a services-section addition and its Arabic count from a compound follow-up', () => {
        expect(parseServicesSectionEdit('أضف رابط «الخدمات» في القائمة وقسم خدمات بثلاث خدمات قبل التواصل')).toEqual({
            label: 'الخدمات',
            count: 3,
            beforeContact: true,
        });
        expect(parseServicesSectionEdit('غيّر لون الأزرار إلى أخضر')).toBeNull();
    });

    it('matches row names as Arabic words, never as fragments of another clause', () => {
        const rows = [{ name: 'حلو البيت' }, { name: 'الخدمة الأساسية' }];
        expect(pickPhotoRow(rows, 'أضف سطرًا «حلول مصممة حول أهداف عملك»')).toBeNull();
        expect(pickPhotoRow(rows, 'غيّر اسم حلو البيت إلى حلو الدار')).toEqual(rows[0]);
    });

    it('uses the restricted-Windows-safe Vite wrapper for every edit build path', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectEditTool.ts'), 'utf-8');
        expect((source.match(/withoutViteConfigForBuild\(dir/g) || []).length).toBe(3);
    });

    it('runs measured repair rounds after a project-edit browser finding', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectEditTool.ts'), 'utf-8');
        expect(source).toContain('worthRepairing(audit?.findings || [])');
        expect(source).toContain('improveUntilItStops(firstMeasurement');
        expect(source).toContain('repairRound(dir, round, { isArabic: isAr, findings })');
        expect(source.indexOf('Per-file history is written after QA')).toBeGreaterThan(source.indexOf('SELF-QA AFTER THE EDIT'));
        expect(source).toContain('ok: !deliveryBlocked');
        expect(source).toContain("? 'browser_qa_required: requested visible browser verification did not complete'");
        expect(source).toContain("'edit_acceptance_unmet: one or more requested changes were not proven'");
    });
});

describe('compound generated-project presentation edits', () => {
    let tmp: string;
    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-compound-edit-'));
        fs.mkdirSync(path.join(tmp, 'src', 'components'), { recursive: true });
        fs.mkdirSync(path.join(tmp, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"compound"}');
        fs.writeFileSync(path.join(tmp, 'src', 'content.js'), `export const content = {
  brand: 'مدار',
  heroTitle: 'مدار — تصميم حديث بواجهة عربية وقسم خدمات وزر تواصل واضح',
  cta: 'احجز الآن',
  menu: [
    { name: 'حلو البيت', desc: 'حلوى اليوم', price: '18 ر.س', img: null },
  ],
  productsTitle: 'خدماتنا وأسعارها',
};\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'components', 'Navbar.jsx'), `export default function Navbar({ content }) {
  return <header><a className="brand" href="#top">{content.brand}</a></header>;
}\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'components', 'Products.jsx'), `export default function Products({ content }) {
  return <section><h2>{content.productsTitle}</h2><div>items</div></section>;
}\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'components', 'Hero.jsx'), `export default function Hero({ content }) {
  return <section><h1>{content.heroTitle}</h1><button type="button" onClick={() => document.querySelector('#contact')?.scrollIntoView()}>{content.cta}</button></section>;
}\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'styles', 'base.css'), ':root{--brand:#126;--on-brand:#fff;--muted:#667}\n.brand{display:flex}\n');
    });
    afterEach(() => {
        delete (global as any).joeProjects?.['compound-edit'];
        fs.rmSync(tmp, { recursive: true, force: true });
    });

    it('applies every explicit operation atomically and leaves unrelated rows unchanged', async () => {
        const request = 'عدّل المشروع الحالي فقط: غيّر نص زر البطل «احجز الآن» إلى «ابدأ مشروعك»، وأضف شعارًا نصيًا صغيرًا «M» بجانب اسم «مدار» في الشريط العلوي، وأضف تحت عنوان الخدمات سطرًا «حلول مصممة حول أهداف عملك». حافظ على بقية المحتوى والتصميم.';
        const res: any = await new ProjectEditTool().execute({ request, dir: tmp, skipAudit: true }, { sessionId: 'compound-edit' });
        expect(res.ok).toBe(true);
        expect(res.output.touched.sort()).toEqual([
            'src/components/Navbar.jsx',
            'src/components/Products.jsx',
            'src/content.js',
            'src/styles/base.css',
        ]);
        const content = fs.readFileSync(path.join(tmp, 'src', 'content.js'), 'utf-8');
        expect(content).toContain("cta: 'ابدأ مشروعك'");
        expect(content).toContain("brandMark: 'M'");
        expect(content).toContain("productsSubtitle: 'حلول مصممة حول أهداف عملك'");
        expect(content).toContain("name: 'حلو البيت'");
        expect(content).not.toContain("name: 'ابدأ مشروعك»");
        expect(fs.readFileSync(path.join(tmp, 'src', 'components', 'Navbar.jsx'), 'utf-8')).toContain('content.brandMark');
        expect(fs.readFileSync(path.join(tmp, 'src', 'components', 'Products.jsx'), 'utf-8')).toContain('content.productsSubtitle');
        expect(fs.readFileSync(path.join(tmp, 'src', 'styles', 'base.css'), 'utf-8')).toContain('.brand-text-mark{');
        expect(res.logs).toEqual(expect.arrayContaining([expect.stringContaining('3 operation(s), 4 file(s)')]));
    });
});

describe('compound brand, navigation, section, and palette follow-up', () => {
    let tmp: string;
    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-services-edit-'));
        fs.mkdirSync(path.join(tmp, 'src', 'styles'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"consulting"}');
        fs.writeFileSync(path.join(tmp, 'index.html'), '<html><head><title>مشروعي</title><meta property="og:title" content="مشروعي"></head><body></body></html>');
        fs.writeFileSync(path.join(tmp, 'src', 'content.js'), `export const content = {
  brand: 'مشروعي',
  heroTitle: 'شركة استشارات متكاملة',
  heroLede: 'خبرة استشارية تقود القرار.',
  contactTitle: 'تواصل معنا',
  navLinks: [
    { href: '#contact', label: 'تواصل' },
  ],
  menu: [
    { name: 'طبق اليوم', desc: 'وصف', price: '10', img: null },
  ],
};\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'App.jsx'), `import React from 'react';
const Contact = () => <section id="contact">Contact</section>;
export default function App(){ const content = {}; return <main>
        <a className="btn" href="#contact">ابدأ</a>
        <Contact content={content} />
      </main>; }\n`);
        fs.writeFileSync(path.join(tmp, 'src', 'styles', 'tokens.css'), ':root{--brand:#123456}');
        fs.writeFileSync(path.join(tmp, 'src', 'styles', 'base.css'), '.btn{background:var(--brand)} .grid-3{display:grid} .card{padding:1rem}');
    });
    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('applies every deterministic clause instead of stopping after the colour edit', async () => {
        const request = 'طوّر نفس المشروع الحالي: غيّر اسم العلامة من «مشروعي» إلى «بصيرة»، أضف رابط «الخدمات» في القائمة وقسم خدمات بثلاث خدمات قبل التواصل، وغيّر لون الأزرار الرئيسي إلى أخضر زمردي. لا تنشئ مشروعاً جديداً.';
        const res: any = await new ProjectEditTool().execute({ request, dir: tmp, skipAudit: true }, { sessionId: 'services-compound' });
        expect(res.ok).toBe(true);
        expect(res.output.touched.sort()).toEqual(['index.html', 'src/App.jsx', 'src/content.js', 'src/styles/tokens.css']);
        const content = fs.readFileSync(path.join(tmp, 'src', 'content.js'), 'utf-8');
        const app = fs.readFileSync(path.join(tmp, 'src', 'App.jsx'), 'utf-8');
        const html = fs.readFileSync(path.join(tmp, 'index.html'), 'utf-8');
        expect(content).toContain("brand: 'بصيرة'");
        expect(content).toContain("href: '#services'");
        expect((content.match(/\{ title: '/g) || []).length).toBe(3);
        expect(app).toContain('id="services"');
        expect(app).not.toMatch(/id="services"[^>]*data-reveal/);
        expect(app.indexOf('id="services"')).toBeLessThan(app.indexOf('<Contact'));
        expect(html).toContain('بصيرة');
        expect(html).not.toContain('مشروعي');
        expect(res.output.acceptance.unmet).toBe(0);

        const rerun: any = await new ProjectEditTool().execute(
            { request, dir: tmp, skipAudit: true },
            { sessionId: 'services-compound', language: 'en' },
        );
        expect(rerun.ok).toBe(true);
        expect(rerun.output.touched).toEqual([]);
        expect(rerun.output.message).toContain('No new file changes were needed');
        expect(rerun.output.message).not.toContain('أضفت قسم');
        expect(rerun.output.message).not.toContain('Added "');
        expect(fs.readFileSync(path.join(tmp, 'src', 'content.js'), 'utf-8')).toBe(content);
        expect(fs.readFileSync(path.join(tmp, 'src', 'App.jsx'), 'utf-8')).not.toMatch(/id="services"[^>]*data-reveal/);
        delete (global as any).joeProjects?.['services-compound'];
    });
});

describe('the tool: known records persistence does not wait for a model', () => {
    let tmp: string;
    beforeEach(() => {
        tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-filter-persist-'));
        fs.mkdirSync(path.join(tmp, 'src', 'components'), { recursive: true });
        fs.writeFileSync(path.join(tmp, 'package.json'), '{"name":"ledger"}');
        fs.writeFileSync(path.join(tmp, 'src', 'content.js'), "\n  kind: 'expenses',\n  engine: 'records',\n  storeKey: 'ledger',\n  brand: 'Ledger',\n  title: 'Ledger',\n  entityOne: 'expense',\n  entityMany: 'expenses',\n  api: '',\n  sourceRequest: 'ledger',\n  isArabic: false,\n");
        fs.writeFileSync(path.join(tmp, 'src', 'components', 'RecordsApp.jsx'), "import React, { useEffect, useState } from 'react';\nexport default function RecordsApp({ content }) {\n  const filterKeys = ['category'];\n  const rel = null;\n  const parentStore = {};\n  const [filters, setFilters] = useState({});\n  const [parents] = useState([]);\n  useEffect(() => { if (rel) parentStore.write(parents); }, [parents, parentStore, rel]);\n  return <select value={filters.category || ''} onChange={e => setFilters({ category: e.target.value })} />;\n}");
    });
    afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

    it('patches only the declared filter state without calling a model', async () => {
        const res: any = await new ProjectEditTool().execute({ request: 'احفظ فلتر الفئة بعد إعادة التحميل', dir: tmp }, { sessionId: 'pedit-filter' });
        const source = fs.readFileSync(path.join(tmp, 'src', 'components', 'RecordsApp.jsx'), 'utf-8');
        expect(res.ok).toBe(true);
        expect(res.output.touched).toEqual(['src/components/RecordsApp.jsx']);
        expect(source).toContain("const filterStoreKey = content.storeKey + ':filters';");
        expect(source).toContain('localStorage.setItem(filterStoreKey, JSON.stringify(filters))');
        delete (global as any).joeProjects?.['pedit-filter'];
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
        // The guarantee is «not project_edit». The builder behind it moved to
        // the deterministic React engine when new sites left web_page_builder.
        expect(await route('ابن لي موقعاً جديداً لمطعم بيتزا')).toBe('react_project');
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
