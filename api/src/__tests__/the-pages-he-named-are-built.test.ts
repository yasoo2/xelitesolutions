/**
 * HE NAMED THREE PAGES, JOE JUDGED THEM HONESTLY, AND BUILT NONE OF THEM.
 *
 * The last unmet part of his long request, measured on his own machine:
 *
 *     acceptance_criteria_unmet: page:page-a, page:page-b, page:page-c
 *     صفحة «المخزون» طلبتها ولم تُبنَ
 *     صفحة «الموردين» طلبتها ولم تُبنَ
 *     صفحة «التقارير» طلبتها ولم تُبنَ
 *     met=8  unmet=3
 *
 * Every layer behaved: the reader found the three pages, the judge weighed
 * them against what was actually on disk, and the delivery blocked itself
 * rather than claim a build it had not made. The gap was capability — the
 * React generator writes ONE screen, whatever he names, and had no route in
 * it anywhere. Not a lie; an inability, declared.
 *
 * So each page he named gets a route and a section. The second rule is the
 * one that matters: a page he named and said nothing about renders a panel
 * that SAYS SO and asks. It does not invent a suppliers table because the
 * word «الموردين» sounds like one — that is the catalogue overruling the
 * request, which is exactly what the fourth law forbids, wearing a helpful
 * face.
 *
 * The route is written as `path: '/slug'` because that is the string the
 * acceptance judge reads (acceptance.ts, the expectedPage branch). It is
 * there because the app navigates to it — the guard below proves the app
 * really uses it, so the criterion cannot be satisfied by the literal alone.
 */

import { fileAppContentJs, fileAppShellJsx } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
import { acceptanceFor, judgeAcceptance } from '../core/quality/acceptance';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const HIS = 'ابنِ لي نظاماً اسمه «مخزن الورشة» فيه ثلاث صفحات: صفحة المخزون وصفحة الموردين وصفحة التقارير. في صفحة المخزون اعمل جدول فيه اسم القطعة والكمية وسعر الشراء. لا تقبل كمية بالسالب.';
const NO_PAGES = 'اعمل جدول مبيعات فيه اسم الصنف والكمية والسعر';

const contentFor = (request: string) => fileAppContentJs(
    blueprintFor('generic' as any, request, true) as any,
    { brand: 'مخزن الورشة', isArabic: true, storeKey: 'k', sourceRequest: request } as any,
);

describe('the pages he named reach the generated app', () => {
    it('content.js carries one route per page, in his words', () => {
        const c = contentFor(HIS);
        expect(c).toContain("title: 'المخزون'");
        expect(c).toContain("title: 'الموردين'");
        expect(c).toContain("title: 'التقارير'");
        expect(c).toMatch(/path: '\/page-a'/);
        expect(c).toMatch(/path: '\/page-b'/);
        expect(c).toMatch(/path: '\/page-c'/);
    });

    it('and a request naming no page carries no routes', () => {
        //  The negative case. A nav with one tab is noise, and a page list
        //  invented for a request that named none is the same defect as the
        //  invented column.
        const c = contentFor(NO_PAGES);
        expect(c).toMatch(/pages: \[\s*\]/);
    });

    it('the shell really navigates — the route is used, not merely present', () => {
        //  A literal that satisfies the judge and drives nothing would be
        //  gaming the criterion, which is worse than failing it.
        const shell = fileAppShellJsx(blueprintFor('generic' as any, HIS, true) as any, true);
        expect(shell).toContain('content.pages');
        expect(shell).toContain('hashchange');
        expect(shell).toContain('app-nav-tab');
        expect(shell).toContain('goPage(');
    });

    it('a page he said nothing about asks him, and invents nothing', () => {
        const shell = fileAppShellJsx(blueprintFor('generic' as any, HIS, true) as any, true);
        expect(shell).toContain('page-blank');
        expect(shell).toContain('سمّيتَ هذه الصفحة ولم تقل ما فيها بعد');
        //  Named by absence: no table, no form, no fabricated columns on a
        //  page whose contents he never described.
        const blank = shell.slice(shell.indexOf('page-blank'), shell.indexOf('</section>'));
        expect(blank).not.toContain('<table');
        expect(blank).not.toContain('<form');
    });
});

describe('and the judge now finds them', () => {
    it('the three page criteria are met against a built project', () => {
        //  The end-to-end proof: write the content the generator would write,
        //  then ask the same judge that blocked his delivery.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-pages-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'content.js'), contentFor(HIS), 'utf-8');
        const judged = judgeAcceptance(acceptanceFor(HIS), { dir } as any);
        fs.rmSync(dir, { recursive: true, force: true });
        const pages = judged.criteria.filter(c => c.id.startsWith('page:'));
        expect(pages).toHaveLength(3);
        expect(pages.map(p => `${p.id}=${p.verdict}`)).toEqual(['page:page-a=met', 'page:page-b=met', 'page:page-c=met']);
    });

    it('and a project without them is still judged unmet', () => {
        //  Non-emptiness: the criterion must still be able to fail, or the
        //  fix has replaced a real block with a rubber stamp.
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-nopages-'));
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'content.js'), 'export const content = { fields: [] };', 'utf-8');
        const judged = judgeAcceptance(acceptanceFor(HIS), { dir } as any);
        fs.rmSync(dir, { recursive: true, force: true });
        expect(judged.criteria.filter(c => c.id.startsWith('page:')).every(c => c.verdict === 'unmet')).toBe(true);
    });
});
