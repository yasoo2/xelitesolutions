/**
 * THE SEAMS — three defects that no single-layer test could have found.
 *
 * Each layer of the last two days was proved on its own and passed. Driving
 * them together, in one session on one browser panel, produced three failures
 * that only exist BETWEEN the pieces:
 *
 *   1. LISTENERS ON A BORROWED PAGE. The audit hooks console/pageerror/response
 *      and — since it started pressing buttons — dialog. On a private browser
 *      that is free; on the panel page, which lives for the whole session, an
 *      audit that threw left its listeners counting somebody else's page, and
 *      the next audit inherited them.
 *
 *   2. A DEAD LINK BECOMING A DEAD BUTTON. Converting every href="#" to a
 *      <button> is the standard advice, and it was wrong here: the audit that
 *      now presses controls measured the trade at 92 → 84. A finding had been
 *      swapped for a worse one and the swap was reported as a repair.
 *
 *   3. A REBUILD SILENTLY SKIPPED. The repair cycle returned «built: true»
 *      without building whenever node_modules was absent — so a repair that
 *      broke the project would be written, reported as verified, and never
 *      caught. The doctor exists precisely to install what is missing.
 *
 * A fourth came out of chasing #2: a «إلى الأعلى» button pressed while the page
 * is already at the top does nothing, and was called dead. A fair test puts the
 * system in a state where the behaviour can show.
 */
import fs from 'fs';
import path from 'path';
import { repairDeadLinks } from '../core/quality/ui-repair';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('a borrowed panel page is handed back clean', () => {
    const A = () => read('core', 'quality', 'app-audit.ts');

    it('every listener the audit adds is named, so it can be taken off', () => {
        const a = A();
        // Named, not anonymous — on a BORROWED panel page an anonymous listener
        // can never be taken off. (It answers «yes» now rather than dismissing:
        // a tester who cancels every confirm calls «حذف» broken.)
        expect(a).toMatch(/const onDialog = \(d: any\) => \{/);
        expect(a).toMatch(/page\.off\('dialog', onDialog\)/);
        for (const ev of ['pageerror', 'console', 'response']) {
            expect(a).toMatch(new RegExp(`page\\.off\\('${ev}'`));
        }
    });

    it('and they come off even when the audit throws', () => {
        const a = A();
        const finallyBlock = a.slice(a.lastIndexOf('} finally {'));
        expect(finallyBlock).toMatch(/detach\(\)/);
        // …before the browser question, which only applies to one we launched.
        expect(finallyBlock.indexOf('detach()')).toBeLessThan(finallyBlock.indexOf('if (!borrowed)'));
    });
});

describe('a dead link never becomes a dead button', () => {
    it('an anchor carrying a handler is a button wearing the wrong tag', () => {
        const r = repairDeadLinks('<a href="#" className="btn" onClick={go}>اضغط</a>');
        expect(r.text).toBe('<button type="button" className="btn" onClick={go}>اضغط</button>');
    });

    it('and the tag is read brace-aware — a handler may contain ">"', () => {
        // `[^>]*?` stopped at the `>` inside `=>`, so the ONE link that
        // qualified was the one the old pattern could not see.
        const r = repairDeadLinks('<a href="#" onClick={(e) => { e.currentTarget.textContent = "x"; }}>ب</a>');
        expect(r.text).toMatch(/^<button type="button" onClick=/);
        expect(r.repairs[0]).toMatchObject({ id: 'dead_links', count: 1 });
        const gt = repairDeadLinks('<a href="" onClick={e => e.x > 1 ? f() : g()}>ج</a>');
        expect(gt.text).toMatch(/^<button type="button"/);
    });

    it('a placeholder with no handler is left exactly as it is, and not claimed', () => {
        const src = '<a href="#" className="btn">بلا وجهة</a>';
        const r = repairDeadLinks(src);
        expect(r.text).toBe(src);
        expect(r.repairs).toEqual([]);
    });

    it('real links and prose inside comments are never touched', () => {
        const src = '{/* <a href="#"> in prose */}\n<a href="/real" onClick={go}>حقيقي</a>';
        expect(repairDeadLinks(src).text).toBe(src);
    });
});

describe('a rebuild is never skipped and still reported as verified', () => {
    const S = () => read('core', 'quality', 'self-repair.ts');

    it('a missing node_modules goes to the doctor, not to an early return', () => {
        const s = S();
        expect(s).not.toMatch(/if \(!fs\.existsSync\(path\.join\(dir, 'node_modules'\)\)\) \{[\s\S]{0,200}built: true/);
        expect(s).toMatch(/hasBuildScript/);
        expect(s).toMatch(/const \{ runDoctored \} = require\('\.\/log-doctor'\)/);
    });

    it('and the only honest skip left is a project with no build script', () => {
        expect(S()).toMatch(/skipped: 'no_build_script'/);
    });
});

describe('a control is judged in a state where its effect could show', () => {
    it('the probe nudges the scroll before pressing', () => {
        const B = read('core', 'quality', 'behaviour-audit.ts');
        expect(B).toMatch(/window\.scrollBy\(0, 120\)/);
        // …and only when there is somewhere to scroll to.
        expect(B).toMatch(/scrollHeight > window\.innerHeight \+ 160/);
        // The nudge happens BEFORE the baseline snapshot, or it would itself
        // look like the click's effect.
        const probe = B.slice(B.indexOf('export async function probeControls'));
        expect(probe.indexOf('scrollBy(0, 120)')).toBeLessThan(probe.indexOf('const before = await page.evaluate(snapshot)'));
    });
});
