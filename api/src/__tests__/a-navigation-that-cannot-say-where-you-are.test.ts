/**
 * FOUR GREY BOXES IN A CORNER, AND NONE OF THEM SAID WHICH PAGE YOU WERE ON.
 *
 * The owner circled the page tabs of a generated store in red: «very ugly, the
 * design must change». Then, before anything shipped: «not only in this store
 * — in ANY interface».
 *
 * Measured across the generator at that moment:
 *
 *     app nav      .app-nav / .app-nav-tab / .on   ZERO rules anywhere in the
 *                  generator. The markup renders a <nav> of <button>s
 *                  (react-app-templates.ts:445-450) and the stylesheet had
 *                  nothing to say about any of them, so they fell back to the
 *                  browser's default button: bordered grey boxes, jammed into
 *                  the corner — and the ACTIVE tab looked exactly like the
 *                  other three.
 *
 *     website nav  .nav-links styled, and `aria-current` present in the
 *                  markup with NO visual rule attached to it. The same defect
 *                  wearing better clothes: a navigation that cannot say where
 *                  you are.
 *
 * ⛔ THE CLASS: markup that carries the state and a stylesheet that never reads
 * it. `aria-current` was written correctly and styled by nobody — the same
 * shape as every «a layer exists and a second reader never asks» defect in
 * this repository, this time between the JSX and the CSS.
 *
 * Both generators now speak one navigation language. The negatives below are
 * what stop it becoming boxes again.
 */

import fs from 'fs';
import path from 'path';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const APP = SRC('modules/tools/definitions/react-app-templates.ts');
const SITE = SRC('modules/tools/definitions/ReactProjectTool.ts');

describe('every navigation Joe writes is designed, in both generators', () => {
    it('⛔ POSITIVE — the app tabs have rules at all', () => {
        //  The defect was their complete absence, so their presence is the
        //  first thing to pin.
        expect(APP).toMatch(/\.app-nav\{[^}]*display:flex/);
        expect(APP).toMatch(/\.app-nav-tab\{/);
    });

    it('⛔ POSITIVE — and the CURRENT app tab is visually distinct', () => {
        //  «Four identical boxes» was the complaint. A nav whose active item
        //  reads the same as the rest is not a nav.
        expect(APP).toMatch(/\.app-nav-tab\.on\{[^}]*var\(--brand/);
        expect(APP).toMatch(/\.app-nav-tab\.on::after\{/);
    });

    it('⛔ POSITIVE — the website nav finally styles the state its markup carries', () => {
        //  `aria-current` was in the JSX for a long time with no rule behind it.
        expect(SITE).toMatch(/\.nav-links a\[aria-current\]\{[^}]*var\(--brand/);
        expect(SITE).toMatch(/\.nav-links a\[aria-current\]::after\{/);
    });

    it('⛔ NEGATIVE — neither nav puts a BORDER around a tab', () => {
        //  A border is what made them four grey rectangles. The active state
        //  is a rail under the item, never a box around it — otherwise the
        //  repair recreates exactly what he circled.
        const appTab = APP.slice(APP.indexOf('.app-nav-tab{'), APP.indexOf('.app-nav-tab.on::after'));
        expect(appTab).toMatch(/border:0/);
        expect(appTab).not.toMatch(/border:\s*1px/);
    });

    it('NEGATIVE — both use the brand token, not a literal colour', () => {
        //  A hardcoded hex here would mean a warm brief still gets a blue nav —
        //  the defect that painted a honey shop teal, one layer down.
        const appNav = APP.slice(APP.indexOf('.app-nav{'), APP.indexOf('.app-nav-tab.on::after') + 200);
        expect(appNav).not.toMatch(/#[0-9a-fA-F]{6}/);
        const siteNav = SITE.slice(SITE.indexOf('.nav-links a[aria-current]'), SITE.indexOf('.nav-links a[aria-current]') + 320);
        expect(siteNav).not.toMatch(/#[0-9a-fA-F]{6}/);
    });

    it('NEGATIVE — the tabs stay reachable by keyboard', () => {
        //  Removing the default border removes the default focus ring with it.
        //  A nav nobody can tab through is worse than an ugly one.
        expect(APP).toMatch(/\.app-nav-tab:focus-visible\{[^}]*outline/);
        expect(SITE).toMatch(/\.nav-links a:focus-visible\{[^}]*outline/);
    });

    it('NEGATIVE — and they do not overflow the bar on a narrow screen', () => {
        //  Four tabs in a corner became four WRAPPED tabs on his phone. A
        //  horizontal scroll keeps the bar one line high.
        expect(APP).toMatch(/\.app-nav\{[^}]*overflow-x:auto/);
        expect(APP).toMatch(/\.app-nav-tab\{[^}]*white-space:nowrap/);
    });
});
