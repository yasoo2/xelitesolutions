/**
 * THREE THINGS HIS LAST DELIVERY GOT WRONG, IN THE SMALL PRINT.
 *
 *   1. «⛔ Delivered, but it does NOT work properly — 2 blocking finding(s):
 *       • 3 خطأ كونسول: Failed to load resource…» — an English message reading
 *      out Arabic findings. The behaviour audit had carried both languages for
 *      months; the eleven findings in app-audit were Arabic-only.
 *
 *   2. «Owner account: owner@myapp.local — the password is the OLD one. This
 *      project was built over an existing database.» An honest paragraph that
 *      should never have been needed: a fresh build inherited the previous
 *      one's data.db, its rows and an owner whose password he no longer had.
 *
 *   3. «MyApp» — in the title, the header, the folder (`api-myapp`) and the
 *      owner's email. A placeholder that shipped, and the reason two different
 *      builds shared one folder in the first place.
 */
import fs from 'fs';
import path from 'path';
import { findingText, type AppAuditFinding } from '../core/quality/app-audit';
import { brandFallback } from '../core/design/page-head';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('a finding speaks the language of the message it lands in', () => {
    const f: AppAuditFinding = { id: 'console_errors', severity: 'high', detail: '3 خطأ كونسول: x', detailEn: '3 console error(s): x' };

    it('Arabic gets Arabic, English gets English', () => {
        expect(findingText(f, true)).toBe('3 خطأ كونسول: x');
        expect(findingText(f, false)).toBe('3 console error(s): x');
    });

    it('and a finding with no English falls back rather than printing nothing', () => {
        expect(findingText({ id: 'x', severity: 'low', detail: 'عربي فقط' }, false)).toBe('عربي فقط');
    });

    it('every finding the audit raises carries both languages', () => {
        const a = read('core', 'quality', 'app-audit.ts');
        // Every raise site, HOWEVER it wraps — a finding that grew a second
        // line (the offenders it names) is still a finding that must speak
        // both languages, and the assertion must not depend on its formatting.
        const ids = [...a.matchAll(/findings\.push\(\{\s*\n?\s*id: '([a-z0-9_]+)'/g)].map(m => m[1]);
        expect(ids.length).toBeGreaterThanOrEqual(11);
        for (const id of ids) {
            const at = a.search(new RegExp(`findings\\.push\\(\\{\\s*\n?\\s*id: '${id}'`));
            expect(a.slice(at, at + 600)).toMatch(/detailEn:/);
        }
        // …including the ones translated from the behaviour audit.
        expect(a).toMatch(/detail: f\.ar, detailEn: f\.en,/);
        // And the summary prints the reader's language, not the stored one.
        expect(a).toMatch(/a\.findings\.map\(f => `   • \$\{findingText\(f, isAr\)\}`\)/);
    });

    it('and both delivery messages use it instead of the raw Arabic field', () => {
        const r = read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        expect(r).toMatch(/const say = \(f: any\) => require\('\.\.\/\.\.\/\.\.\/core\/quality\/app-audit'\)\.findingText\(f, isAr\);/);
        expect(r).not.toMatch(/lines\.push\(`   • \$\{f\.detail\}`\)/);
        const p = read('modules', 'tools', 'definitions', 'ProjectRepairTool.ts');
        expect(p).toMatch(/const said = \(f: any\) => findingText\(f, isAr\);/);
        expect(p).not.toMatch(/lines\.push\(`   • \$\{f\.detail\}`\)/);
    });
});

describe('a new build does not inherit an old database', () => {
    it('the api builder moves aside when it finds a data.db', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        expect(a).toMatch(/if \(fs\.existsSync\(path\.join\(proj, 'data\.db'\)\)\) \{/);
        expect(a).toMatch(/for \(let n = 2; n < 50; n\+\+\)/);
        expect(a).toMatch(/leaving the old one untouched/);
        // The old project is never deleted — his rows are his.
        expect(a).not.toMatch(/rmSync\(path\.join\(proj, 'data\.db'\)/);
    });

    it('and it happens before the folder is created, not after seeding', () => {
        const a = read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');
        const check = a.indexOf("if (fs.existsSync(path.join(proj, 'data.db')))");
        const mk = a.indexOf('fs.mkdirSync(proj, { recursive: true });');
        expect(check).toBeGreaterThan(0);
        expect(check).toBeLessThan(mk);
    });
});

describe('«MyApp» is not a name', () => {
    it('an English request lends its own subject', () => {
        expect(brandFallback('Build a simple online store for coffee', false, 'store')).toBe('Coffee Store');
        expect(brandFallback('Create a portfolio site for photography', false, 'portfolio')).toBe('Photography Studio');
    });

    it('an Arabic request gets a signboard, with its article', () => {
        expect(brandFallback('ابنِ متجراً للقهوة المختصة', true, 'store')).toBe('متجر القهوة');
        expect(brandFallback('ابن مطعماً للمشاوي', true, 'restaurant')).toBe('مطعم المشاوي');
    });

    it('a marketplace names itself', () => {
        expect(brandFallback('Build a world-class e-commerce platform similar to Shopify', false, 'store')).toBe('Commerce Hub');
        expect(brandFallback('ابنِ منصّة تجارة إلكترونية', true, 'store')).toBe('سوق التجارة');
    });

    it('and a request that truly says nothing still gets the old placeholder', () => {
        expect(brandFallback('build me a website', false, 'generic')).toBe('MyApp');
        expect(brandFallback('ابن لي موقعاً', true, 'generic')).toBe('مشروعي');
    });

    it('grammar is never mistaken for a subject', () => {
        // «for the», «for my», «for a» — the request's scaffolding, not its topic.
        expect(brandFallback('Build a site for my business', false, 'generic')).toBe('MyApp');
        expect(brandFallback('Build a website for the company', false, 'generic')).toBe('MyApp');
    });

    it('and both builders use it', () => {
        for (const tool of ['ReactProjectTool.ts', 'ApiProjectTool.ts']) {
            const t = read('modules', 'tools', 'definitions', tool);
            expect(t).toMatch(/brandFrom\(request, isAr\) \|\| brandFallback\(request, isAr, kind\)/);
            expect(t).not.toMatch(/\|\| \(isAr \? 'مشروعي' : 'MyApp'\)/);
        }
    });
});
