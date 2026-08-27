/**
 * THE AUDIT CALLED WORKING BUTTONS DEAD, AND REFUSED TO DELIVER A STORE THAT
 * WORKS.
 *
 * Measured by hand, in a browser, on the owner's own shop:
 *
 *     before the click    «في السلة 0»    «السلة 0»
 *     after  the click    «في السلة 1»    «السلة 1»
 *
 * and the cart drawer then showed «عسل العسل الأسود — 200» with «الإجمالي 200»
 * and a working order form. Joe's own verdict on that same build was:
 *
 *     high_severity_findings_survived: dead_controls
 *       — 8 من 12 أزرار لا تفعل شيئًا عند الضغط: «السلة 0»، «لوحة التاجر»،
 *         «أضف إلى السلة»
 *
 * Two of those three I pressed myself and watched work.
 *
 * ⛔ THE CAUSE: the loop pressed every control in turn and never put the page
 * back. The first click opened the cart drawer, and every control after it was
 * judged from behind that drawer — covered, or acting on a screen whose change
 * the snapshot could no longer see. The FIRST control was measured honestly
 * and the rest inherited its aftermath.
 *
 * ⛔ THE CLASS: A VERDICT THAT DEPENDS ON ITS NEIGHBOURS — the same defect as a
 * test whose colour depends on what ran before it, which this repository has
 * already paid for inside its own suite. Here it made Joe refuse honest work,
 * which is the most expensive false alarm he can raise: it does not merely
 * mis-measure, it withholds a finished thing from the owner.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'quality', 'behaviour-audit.ts'),
    'utf-8',
);

/**
 *  The per-control block: from the click to where THAT loop pushes its verdict.
 *
 *  ⛔ The first version sliced to the first `controls.push({ label: c.label`
 *  in the file — which sits BEFORE the click, in another function — so the
 *  slice ran backwards and came back empty. Six assertions went red at once
 *  and said nothing about the source. A reader that can return an empty string
 *  is a reader that can fail silently, so the non-emptiness is asserted below
 *  rather than assumed.
 */
const CLICK_AT = SRC.indexOf('await el.click(');
const BLOCK = SRC.slice(CLICK_AT, SRC.indexOf('controls.push({ label: c.label', CLICK_AT));

describe('each control is judged on its own, not on what the last click left', () => {
    it('NEGATIVE — the reader really read the loop, not an empty string', () => {
        //  Non-emptiness first: every assertion below is about text found in
        //  BLOCK, and an empty BLOCK would fail them all for the wrong reason.
        expect(CLICK_AT).toBeGreaterThan(0);
        expect(BLOCK.length).toBeGreaterThan(400);
        expect(BLOCK).toContain('const after = await page.evaluate(snapshot)');
    });

    it('⛔ POSITIVE — the page is restored after a control that had an effect', () => {
        expect(BLOCK).toMatch(/if \(effect && effect !== 'navigation'\)/);
    });

    it('POSITIVE — a drawer or modal is dismissed first, because it is the common case', () => {
        expect(BLOCK).toMatch(/keyboard\.press\('Escape'\)/);
    });

    it('POSITIVE — and a page that really changed is reloaded, not merely nudged', () => {
        //  Escape closes a drawer; it does not undo a filter, a tab switch or
        //  an added cart line. Only a reload puts the page back to the state
        //  the NEXT control deserves to be judged from.
        expect(BLOCK).toMatch(/if \(changed\(before, settled\)\)[\s\S]{0,120}page\.reload\(/);
    });

    it('NEGATIVE — a control with NO effect costs nothing extra', () => {
        //  Reloading after every dead control would double the audit for the
        //  case that needs it least, on a page that has not moved.
        const guard = BLOCK.slice(BLOCK.indexOf("if (effect && effect !== 'navigation')"));
        expect(guard.indexOf('page.reload(')).toBeGreaterThan(0);
        expect(BLOCK).not.toMatch(/await page\.reload\([\s\S]{0,80}\n\s*if \(effect/);
    });

    it('NEGATIVE — navigation keeps its own repair and is not reloaded twice', () => {
        //  goBack already restores the page; adding a reload on top would
        //  discard the history the next control may need.
        expect(BLOCK).toMatch(/if \(effect === 'navigation'\)[\s\S]{0,160}goBack/);
        expect(BLOCK).toMatch(/effect !== 'navigation'/);
    });

    it('NEGATIVE — and the restoration cannot itself throw the audit over', () => {
        //  A page that navigated away, or closed, must not turn a measurement
        //  into a crash: every step is caught.
        const restore = BLOCK.slice(BLOCK.indexOf("keyboard.press('Escape')"));
        expect(restore).toMatch(/catch\(\(\) => \{ \}\)/);
        expect(restore).toMatch(/page\.reload\([^)]*\)\.catch\(\(\) => \{ \}\)/);
    });
});
