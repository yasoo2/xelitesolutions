/**
 * HE NAMED TWO PAGES, AND JOE COULD NOT DERIVE A SINGLE CRITERION.
 *
 * Measured live, on a build where both pages were correct on disk:
 *
 *     ⚠️ لم أستخرج معياراً قابلاً للفحص من طلبك، لذلك لم أصدر حكم قبول.
 *
 * thePagesHeNamed() had read «هبوط» and «تواصل» out of that sentence — the
 * whole page plan was built from them. The judge derived nothing because
 * nothing asked that reader: a reader that already knew, never consulted.
 *
 * And pointing the other way, on «اعمل متجر فيه صفحة المنتجات وصفحة الشحن
 * والاسترجاع», the column reader took the pages FOR columns and produced three
 * criteria demanding three TABLE COLUMNS named «صفحة المنتجات», «صفحة الشحن»
 * and «الاسترجاع». A site of pages can never satisfy those, so that request
 * was refused forever — a criterion that cannot be MET, the mirror of one that
 * cannot fail and just as dead.
 *
 * One sentence, two readers, no boundary. The word «صفحة» is the boundary.
 */

import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import { planSite, thePagesHeNamed } from '../core/design/site-plan';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ids = (request: string) => acceptanceFor(request).map(c => c.id);
const fold = (s: string) => s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي');

describe('a page he named becomes a criterion', () => {
    it.each([
        ['اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف', ['page:index', 'page:contact']],
        ['ابني موقع شركة فيه صفحة من نحن وصفحة خدمات وصفحة اتصل بنا', ['page:about', 'page:services', 'page:contact']],
        ['Build a site with a pricing page and a docs page', ['page:pricing', 'page:docs']],
    ])('%s', (request, expected) => {
        const got = ids(request);
        for (const id of expected) expect(got).toContain(id);
    });

    it('the criterion carries HIS words, not a slug', () => {
        const c = acceptanceFor('اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف')
            .find(x => x.id === 'page:contact');
        expect(c).toBeDefined();
        expect(c!.ar).toContain('تواصل');
        expect((c as any).expectedPage.title).toBe('تواصل');
    });

    it('ONE named page is not a criterion — it would be one that cannot fail', () => {
        //  A single-page build writes index.html by definition. «the page
        //  exists» would then be true before anything was built.
        expect(ids('اعمل صفحة سياسة الخصوصية').filter(i => i.startsWith('page:'))).toEqual([]);
    });
});

describe('and a page he named is not a column in a table', () => {
    it('«صفحة المنتجات» produces no column criteria at all', () => {
        const got = ids('اعمل متجر فيه صفحة المنتجات وصفحة الشحن والاسترجاع');
        expect(got.filter(i => i.startsWith('column:'))).toEqual([]);
        expect(got).toContain('page:products');
        expect(got).toContain('page:shipping');
    });

    it('a real column list is untouched — this is a boundary, not a ban on «فيه»', () => {
        const got = ids('جدول فواتير فيه اسم العميل والمبلغ والتاريخ');
        expect(got.filter(i => i.startsWith('column:')).length).toBe(3);
    });

    it('a page AND columns in one sentence keeps the columns', () => {
        //  The page is REMOVED from the list rather than ending it, so what
        //  follows a page mention is still read. Measured: «جدول فواتير فيه
        //  صفحة المنتجات واسم العميل والمبلغ» → «اسم العميل», «المبلغ».
        //
        //  The container is a separate decision: «متجر» with a page mention
        //  declares no table at all, and after the pages are removed nothing
        //  is left above the two-item floor. That is the entity reader's
        //  judgement, not this boundary's, and it is right — a shop with
        //  pages is not a shop with a table.
        const got = ids('جدول فواتير فيه صفحة المنتجات واسم العميل والمبلغ');
        expect(got.filter(i => i.startsWith('column:')).length).toBe(2);
    });
});

describe('one decision about what a page file is called', () => {
    it('the slug the reader returns is the file the plan builds', () => {
        //  These two used to disagree on an unknown name — `page2` from the
        //  reader, `page-b` from the spec builder — and a criterion written
        //  against the reader would have demanded a file nobody writes.
        const request = 'اعمل موقع فيه صفحة سياسة الخصوصية وصفحة الشروط والأحكام';
        const named = thePagesHeNamed(fold(request));
        const plan = planSite('landing', request, true);
        expect(named.length).toBeGreaterThanOrEqual(2);
        for (const n of named) {
            const expectedFile = n.slug === 'index' ? 'index.html' : `${n.slug}.html`;
            expect(plan.pages.map(p => p.file)).toContain(expectedFile);
        }
    });
});

describe('the judge proves a page from what was actually written', () => {
    const criterion = acceptanceFor('اعمل لي صفحة هبوط وصفحة تواصل لشركة تنظيف')
        .filter(c => c.id === 'page:contact');

    it('met when the page is a file on disk', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-page-'));
        fs.writeFileSync(path.join(dir, 'contact.html'), '<h1>تواصل</h1>', 'utf8');
        const a = judgeAcceptance(criterion, { dir } as any, true);
        expect(a.criteria[0].verdict).toBe('met');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('unmet when the page was asked for and never written', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-page-'));
        fs.writeFileSync(path.join(dir, 'index.html'), '<h1>الرئيسية</h1>', 'utf8');
        const a = judgeAcceptance(criterion, { dir } as any, true);
        expect(a.criteria[0].verdict).toBe('unmet');
        //  And it says so in his words, not in a slug.
        expect(a.criteria[0].why).toContain('تواصل');
        fs.rmSync(dir, { recursive: true, force: true });
    });
});
