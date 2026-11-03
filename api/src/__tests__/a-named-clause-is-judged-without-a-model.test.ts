import fs from 'fs';
import os from 'os';
import path from 'path';
import { requirementsFromRequestClauses, verifyNamed } from '../core/quality/named-requirements';
import { ReactProjectTool, namedClauseCoversRule } from '../modules/tools/definitions/ReactProjectTool';

/**
 * Eval round 15, 2026-10-24 — photography fidelity.
 *
 * Once the Arabic reader worked, a build with no model in the run read the
 * clauses of his request and then never judged them: verifyNamed was skipped,
 * the gate fell back to the catalogue, and a catalogue rule that only
 * restated one of those clauses («rule:1», unprovable) blocked a site that
 * had delivered everything. The honest design: what he named is judged by
 * the deterministic evidence that needs no model; what that evidence cannot
 * prove, or proves absent, still blocks.
 */
const PHOTO = 'أنشئ موقع ويب من صفحة واحدة لاستوديو تصوير باسم «عدسة». يجب أن يحتوي على رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل؛ قسم افتتاحي بصورة واضحة وزر «احجز جلسة»؛ ثلاثة أقسام فعلية؛ ونموذج تواصل بالاسم والبريد والرسالة.';
const noModel = async (): Promise<string> => { throw new Error('no model'); };
const judge = async (text: string, source: string) =>
    (await verifyNamed([{ id: 'c1', text, quote: text }], source, true, noModel))[0];

describe('his feature list keeps its own structure', () => {
    it('«؛» separates the items; the commas inside one belong to it', () => {
        expect(requirementsFromRequestClauses(PHOTO).map(r => r.text)).toEqual([
            'رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل',
            'قسم افتتاحي بصورة واضحة وزر «احجز جلسة»',
            'ثلاثة أقسام فعلية',
            'نموذج تواصل بالاسم والبريد والرسالة',
        ]);
    });
});

describe('page clauses are judged from the source, with no model', () => {
    const NAV = "navLinks: [ { href: '#top', label: 'الرئيسية' }, { href: '#products', label: 'الخدمات' }, { href: '#gallery', label: 'الأعمال' }, { href: '#contact', label: 'تواصل' } ]";
    it('a navigation with every named destination is met; one missing destination is unmet, by name', async () => {
        expect(await judge('رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل', NAV)).toMatchObject({ verdict: 'met' });
        const missing = await judge('رأس تنقل بروابط الرئيسية، المدونة، تواصل', NAV);
        expect(missing).toMatchObject({ verdict: 'unmet' });
        expect(missing.why).toContain('المدونة');
    });
    it('a hero with its image and its quoted button is met; a null hero image is unmet', async () => {
        const hero = '<section className="hero" id="top"></section>';
        const withImage = `${hero} heroImage: { src: 'images/a.png', alt: 'x' }, cta: 'احجز جلسة',`;
        expect(await judge('قسم افتتاحي بصورة واضحة وزر «احجز جلسة»', withImage)).toMatchObject({ verdict: 'met' });
        const noImage = `${hero} heroImage: null, cta: 'احجز جلسة',`;
        expect(await judge('قسم افتتاحي بصورة واضحة وزر «احجز جلسة»', noImage)).toMatchObject({ verdict: 'unmet' });
        expect(await judge('قسم افتتاحي بصورة واضحة وزر «اطلب عرضاً»', withImage)).toMatchObject({ verdict: 'unmet' });
        // A part no reader here can see — a background video — leaves the clause to a judge.
        expect(await judge('قسم افتتاحي بفيديو خلفية وزر «احجز جلسة»', withImage)).toMatchObject({ verdict: 'unprovable' });
    });
    it('«N sections» counts the rendered sections; a form proves the fields it carries', async () => {
        const page = '<section className="section" id="products"></section><section id="story"></section><section id="contact"></section>';
        expect(await judge('ثلاثة أقسام فعلية', page)).toMatchObject({ verdict: 'met' });
        expect(await judge('أربعة أقسام فعلية', page)).toMatchObject({ verdict: 'unprovable' });
        const form = '<form onSubmit={onSubmit}><input value={form.name} /><input type="email" /><textarea /></form>';
        expect(await judge('نموذج تواصل بالاسم والبريد والرسالة', form)).toMatchObject({ verdict: 'met' });
        expect(await judge('a contact form with name, email and message', form)).toMatchObject({ verdict: 'met' });
        expect(await judge('نموذج تواصل بالاسم والهاتف', form)).toMatchObject({ verdict: 'unprovable' });
    });
    it('a catalogue rule that restates a judged named clause gets no second vote', () => {
        const named = { text: 'رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل' };
        expect(namedClauseCoversRule(named, 'يجب أن يحتوي على رأس تنقل بروابط الرئيسية')).toBe(true);
        expect(namedClauseCoversRule(named, 'يجب أن يكون السعر أكبر من صفر')).toBe(false);
    });
});

describe('a no-model build: judged, not skipped — and absence still blocks', () => {
    let root: string;
    beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-named-no-model-')); });
    afterAll(() => {
        for (const id of ['works', 'blog', 'hero']) delete (global as any).joeProjects?.[`no-model-${id}`];
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    });
    const build = (id: string, request: string): Promise<any> => new ReactProjectTool().execute(
        { request, root, skipInstall: true, skipImages: true, skipAuthoredCopy: true, skipProfile: true },
        { sessionId: `no-model-${id}`, language: 'en' });
    const AGENCY = 'أنشئ موقع ويب من صفحة واحدة لوكالة تصميم جرافيك باسم «خط». يجب أن يحتوي على ';

    it('a section he named survives with zero photographs, in his order, honestly', async () => {
        const result = await build('works', `${AGENCY}رأس تنقل بروابط الرئيسية، الخدمات، الأعمال، تواصل؛ ثلاثة أقسام فعلية؛ ونموذج تواصل بالاسم والبريد والرسالة.`);
        expect(result.ok).toBe(true);
        const content = fs.readFileSync(path.join(result.output.path, 'src', 'content.js'), 'utf8');
        const nav = content.slice(content.indexOf('navLinks:'), content.indexOf(']', content.indexOf('navLinks:')));
        expect((nav.match(/label: '([^']+)'/g) || []).map(l => l.slice(8, -1))).toEqual(['الرئيسية', 'الخدمات', 'الأعمال', 'تواصل']);
        expect(nav).toContain("{ href: '#gallery', label: 'الأعمال' }");
        expect(content).toMatch(/gallery: \[\s*\]/);
        expect(content).toContain('galleryRequested: true');
        expect(content).toContain("galleryNote: 'صور الأعمال غير متاحة في هذا التشغيل.'");
        expect(fs.readFileSync(path.join(result.output.path, 'src', 'components', 'Gallery.jsx'), 'utf8')).toContain('content.galleryRequested');
        expect((result.logs || []).join('\n')).toMatch(/acceptance: 3\/3 \(from your request\)/);
    }, 120_000);

    it('a named destination with nothing behind it blocks, and says which', async () => {
        const result = await build('blog', `${AGENCY}رأس تنقل بروابط الرئيسية، الخدمات، المدونة، تواصل؛ ونموذج تواصل بالاسم والبريد والرسالة.`);
        expect(result.ok).toBe(false);
        expect(String(result.error)).toMatch(/^acceptance_criteria_unmet/);
        expect((result.logs || []).join('\n')).toMatch(/MISSING رأس تنقل[^\n]*no link for: المدونة/);
    }, 120_000);

    it('a hero image that cannot exist in this run blocks, and says why', async () => {
        const result = await build('hero', `${AGENCY}قسم افتتاحي بصورة واضحة وزر «اطلب عرض سعر»؛ ونموذج تواصل بالاسم والبريد والرسالة.`);
        expect(result.ok).toBe(false);
        expect((result.logs || []).join('\n')).toMatch(/MISSING قسم افتتاحي[^\n]*renders no image/);
    }, 120_000);
});
