/**
 * THE MENU THAT ONLY EXISTS ON A PHONE.
 *
 * «ولا القوائم جميعها ولا ولا ولا» — his list of what the browser QA did not
 * check, and this is the item on it that nothing could have caught.
 *
 * ⛔ EVERY PRESS HAPPENED AT ONE WIDTH. `probeControls` runs at lines 639 and
 * 658 of `app-audit.ts`, before `inspectUi` at 677 ever changes a viewport, so
 * the whole walk is measured at 1280x900. And `findControls` catalogues what a
 * visitor could press by reading `getBoundingClientRect()` and the computed
 * style:
 *
 *     const vis = (el) => r.width > 4 && r.height > 4
 *         && cs.visibility !== 'hidden' && cs.display !== 'none'
 *         && Number(cs.opacity) > 0.05;
 *
 * A hamburger button is `display: none` at 1280. **It is not skipped as dead;
 * it is never seen at all.** So is the mobile drawer, the phone-only call
 * button, the bottom bar. On most sites the hamburger is the only way to reach
 * any other page from a phone — and a build where it does not open was
 * delivered with «0 dead controls», because the audit was looking at a screen
 * where the button does not exist.
 *
 * ⛔ AND THE FIX NEARLY CARRIED THE DEFECT IT WAS FIXING. The phone pass
 * decorates its labels — «الجوّال Add serving» — exactly as the route walk
 * decorates its own with «/menu ». The repair road looks the label up in the
 * component sources, so a decorated name finds nothing, which is the defect
 * closed one commit ago in a new costume.
 *
 * Rather than teach every reader to undo every prefix that will ever be
 * invented — a catalogue, and so the same defect one iteration later — the
 * control now carries its own undecorated name in `bare`, both writers set it,
 * and the evidence reads THAT.
 */

import fs from 'fs';
import path from 'path';
import { fileForBehaviour } from '../core/quality/model-round';

const q = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', ...p), 'utf-8');
const APP = q('app-audit.ts');
const BEHAVIOUR = q('behaviour-audit.ts');

describe('a control that only exists on a phone is pressed too', () => {
    it('⛔ POSITIVE — there is a pass at 390px, after the desktop walk', () => {
        //  After, not instead: the desktop walk is the main measurement and
        //  this pass exists for what desktop CANNOT show.
        expect(APP).toContain("await page.setViewportSize({ width: 390, height: 844 });");
        const walkAt = APP.indexOf("mergeProbe(await probeControls(page, probeOpts()), '/')");
        const phoneAt = APP.indexOf("await page.setViewportSize({ width: 390, height: 844 });");
        expect(walkAt).toBeGreaterThan(0);
        expect(phoneAt).toBeGreaterThan(walkAt);
    });

    it('⛔ POSITIVE — only controls the desktop walk never saw', () => {
        //  Re-pressing forty controls at a second width would spend the whole
        //  budget to learn what was already known, and the budget is shared.
        expect(APP).toContain('const seenLabels = new Set(allControls.map((c: any) => String(c.label || \'\')));');
        expect(APP).toContain('const fresh = (phone.controls || []).filter((c: any) => !seenLabels.has(String(c.label || \'\')));');
    });

    it('⛔ NEGATIVE — and the width is put back afterwards', () => {
        //  Everything measured after this runs at the size the caller set. A
        //  pass that leaves the page 390px wide would make the design audit
        //  judge a phone layout as a desktop one.
        expect(APP).toContain('const back = page.viewportSize?.() || { width: 1280, height: 900 };');
        expect(APP).toContain('await page.setViewportSize(back);');
    });

    it('⛔ NEGATIVE — a failure there must not cost the desktop walk', () => {
        //  The phone pass is additive. If setting a viewport throws, the forty
        //  controls already pressed are still the measurement.
        const at = APP.indexOf("await page.setViewportSize({ width: 390, height: 844 });");
        const tail = APP.slice(at, at + 1800);
        expect(tail).toContain('catch { /* one width failing must not lose the desktop walk */ }');
    });
});

describe('the decorated name and the real name are both kept', () => {
    it('⛔ POSITIVE — every writer sets `bare`, and there are two of them', () => {
        //  The class that has cost the most this week: two places writing the
        //  same thing, one taught the rule and the other not. Both are asserted
        //  here because fixing either alone looks exactly like fixing both.
        expect(APP).toContain('allControls.push({ ...c, bare: c.label, label: route === \'/\' ? c.label : `${route} ${c.label}` })');
        expect(APP).toContain('allControls.push({ ...c, bare: c.label, label: `الجوّال ${c.label}` })');
        //  …and nothing pushes a control without it.
        const pushes = APP.match(/allControls\.push\(\{[^}]*\}/g) || [];
        expect(pushes.length).toBe(2);
        for (const p of pushes) expect(p).toContain('bare: c.label');
    });

    it('⛔ POSITIVE — the evidence carries the undecorated name', () => {
        //  Two findings emit it, and both must read `bare`.
        const uses = BEHAVIOUR.match(/evidence: dead\.slice\(0, 8\)\.map\(d => \(\{ label: [^)]+\)/g) || [];
        expect(uses.length).toBe(2);
        for (const u of uses) expect(u).toContain('d.bare || d.label');
    });

    it('⛔ POSITIVE — so a phone-only control is found in its component', () => {
        //  The end of the chain: what the audit saw at 390px reaches the
        //  repairer as a name that exists in the source.
        const sources = {
            'src/components/Navbar.jsx':
                'export default function Navbar(){ return <nav><button aria-label="Menu">Menu</button></nav>; }',
            'src/components/Footer.jsx': 'export default function Footer(){ return <footer/>; }',
        };
        expect(fileForBehaviour([{ evidence: [{ label: 'Menu' }] }], sources).file)
            .toBe('src/components/Navbar.jsx');
    });

    it('⛔ NEGATIVE — `bare` is optional, so an older control still reads', () => {
        //  `d.bare || d.label` and not `d.bare` alone: a control from a caller
        //  that has not been taught yet must still name itself, rather than
        //  arriving as `undefined` and matching every file or none.
        expect(BEHAVIOUR).toContain('bare?: string;');
        expect(BEHAVIOUR).not.toContain('evidence: dead.slice(0, 8).map(d => ({ label: d.bare,');
    });
});
