/**
 * «حتى يخرج بنتيجه مبهره»
 *
 * Every check the audit had until now answers «does it WORK»: contrast, tap
 * targets, dead controls, overflow. All of them can be perfect on a page
 * nobody would call good — and a build that scores 96/100 while looking like a
 * form from 2004 has passed every test that was asked and failed the only one
 * he cares about.
 *
 * These five ask «is there a SYSTEM here», and each is a COUNT taken from
 * computed styles in a real browser — never an opinion, because an opinion
 * cannot be measured twice and cannot tell the loop whether a round paid.
 *
 * The thresholds are deliberately generous. This suite pins both halves of
 * that: a page WITH a system must pass (a false alarm sends the loop chasing
 * a defect that is not there), and a page with none must be caught.
 */
import fs from 'fs';
import path from 'path';
import { judgeDesign, measureDesign } from '../core/quality/design-audit';
import { repairMeasure, repairTypeScale } from '../core/quality/ui-repair';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
const APP_AUDIT = read('core', 'quality', 'app-audit.ts');
const UI_REPAIR = read('core', 'quality', 'ui-repair.ts');
const DESIGN = read('core', 'quality', 'design-audit.ts');

/** A page that HAS a system: 4 sizes, tidy spacing, 3 colours, real hierarchy. */
const disciplined = {
    sizes: 4, straySizes: [], gaps: 6, longLines: [], colours: 3,
    headingPx: 36, bodyPx: 16, ratio: 2.25, textNodes: 40,
};

describe('a page with a design system is left alone', () => {
    it('raises nothing at all', () => {
        expect(judgeDesign(disciplined).findings).toHaveLength(0);
    });

    it('and the generous thresholds are really generous', () => {
        // Nine sizes, sixteen spacings and eight colours are still a system.
        expect(judgeDesign({ ...disciplined, sizes: 9 }).findings).toHaveLength(0);
        expect(judgeDesign({ ...disciplined, gaps: 16 }).findings).toHaveLength(0);
        expect(judgeDesign({ ...disciplined, colours: 8 }).findings).toHaveLength(0);
        // 1.5 is the floor, not a failure.
        expect(judgeDesign({ ...disciplined, headingPx: 24, bodyPx: 16, ratio: 1.5 }).findings)
            .toHaveLength(0);
    });

    /**
     * A page the browser could not read is not a page with a bad design. An
     * empty measurement must produce silence, never five findings the loop
     * would then spend rounds trying to repair.
     */
    it('an empty or failed measurement accuses nothing', () => {
        expect(judgeDesign(null as any).findings).toHaveLength(0);
        expect(judgeDesign({}).findings).toHaveLength(0);
        expect(judgeDesign({ textNodes: 0 }).findings).toHaveLength(0);
    });
});

describe('a page with no system is caught, and says what it saw', () => {
    it('a pile of font sizes is drift, and the strays are named', () => {
        const strays = [{ sel: '.price', px: 13, uses: 1 }, { sel: '.note', px: 19, uses: 2 }];
        const f = judgeDesign({ ...disciplined, sizes: 14, straySizes: strays })
            .findings.find(x => x.code === 'type_scale_drift');
        expect(f).toBeTruthy();
        expect(f!.en).toContain('14');
        // The evidence travels — without it the loop can only guess.
        expect(f!.data).toEqual(strays);
    });

    it('twenty-six spacings are noise', () => {
        const f = judgeDesign({ ...disciplined, gaps: 26 }).findings.find(x => x.code === 'spacing_drift');
        expect(f).toBeTruthy();
        expect(f!.en).toContain('26');
    });

    it('lines past 95 characters are reported with their width', () => {
        const longLines = [{ sel: 'p.intro', chars: 132, px: 16 }];
        const f = judgeDesign({ ...disciplined, longLines }).findings.find(x => x.code === 'line_too_long');
        expect(f).toBeTruthy();
        expect(f!.en).toContain('132');
        expect(f!.data).toEqual(longLines);
    });

    it('eleven text colours are an accident', () => {
        expect(judgeDesign({ ...disciplined, colours: 11 }).findings.map(x => x.code))
            .toContain('colour_drift');
    });

    it('a heading barely larger than its body is no hierarchy', () => {
        const f = judgeDesign({ ...disciplined, headingPx: 17, bodyPx: 14, ratio: 1.21 })
            .findings.find(x => x.code === 'flat_hierarchy');
        expect(f).toBeTruthy();
        expect(f!.en).toContain('17px');
        expect(f!.en).toContain('14px');
    });

    it('every finding speaks both languages', () => {
        const all = judgeDesign({ sizes: 14, straySizes: [], gaps: 26, colours: 11, ratio: 1.1, headingPx: 17, bodyPx: 15, longLines: [{ sel: 'p', chars: 120, px: 16 }], textNodes: 30 }).findings;
        expect(all.length).toBe(5);
        for (const f of all) {
            expect(f.ar.trim().length).toBeGreaterThan(10);
            expect(f.en.trim().length).toBeGreaterThan(10);
            expect(/[؀-ۿ]/.test(f.ar)).toBe(true);
            expect(/[؀-ۿ]/.test(f.en)).toBe(false);
        }
    });
});

/**
 * `measureDesign` is serialised and evaluated INSIDE the page. A closure over
 * anything in this module arrives there as `undefined` and the whole pass dies
 * silently in the catch — which would look exactly like «this page has a
 * perfect design».
 */
describe('the in-page function can survive the trip', () => {
    it('it closes over nothing outside itself', () => {
        const src = measureDesign.toString();
        expect(src).not.toMatch(/\brequire\(/);
        expect(src).not.toMatch(/\bimport\b/);
    });

    it('and the pass can never be the reason a build fails', () => {
        expect(DESIGN).toMatch(/catch \{\s*return \{ findings: \[\], metrics: \{\} \};/);
        expect(APP_AUDIT).toContain('the design pass is additive — never the reason a build fails');
    });
});

describe('THE WIRING: the system reaches the design pass', () => {
    it('app-audit runs it on the live page and merges its findings', () => {
        expect(APP_AUDIT).toMatch(/const \{ auditDesign \} = require\('\.\/design-audit'\);/);
        expect(APP_AUDIT).toMatch(/const design = await auditDesign\(page\);/);
        expect(APP_AUDIT).toMatch(/ui\.findings\.push\(\.\.\.design\.findings\);/);
    });

    it('and keeps the raw numbers, so a later round can compare', () => {
        expect(APP_AUDIT).toMatch(/design: design\.metrics/);
    });

    it('the repair round aims at the two it can honestly fix', () => {
        expect(UI_REPAIR).toMatch(/repairMeasure\(t, evidenceFor\('line_too_long'\)\)/);
        expect(UI_REPAIR).toMatch(/repairTypeScale\(t, evidenceFor\('type_scale_drift'\)\)/);
    });

    /**
     * Spacing, colour and hierarchy are design DECISIONS, not defects — a
     * deterministic guess at them makes the page worse and the score honest
     * about it. They are reported and left to the model round; this pins that
     * restraint so nobody later "completes" the set.
     */
    it('and does not pretend to fix the three that are decisions', () => {
        expect(UI_REPAIR).not.toMatch(/repairSpacing|repairColourSystem|repairHierarchy/);
        expect(UI_REPAIR).toContain('design decisions, not defects');
    });
});

describe('the two design repairs are surgical, not blanket', () => {
    it('a measure is capped in ch, because the defect is measured in characters', () => {
        const r = repairMeasure('.x{color:red}', [{ sel: 'p.intro', chars: 132, px: 16 }]);
        expect(r.text).toContain('p.intro');
        expect(r.text).toContain('max-width: 72ch');
        expect(r.repairs[0].id).toBe('line_too_long');
    });

    it('a stray size is pulled to the NEAREST step of the page\'s own scale', () => {
        const r = repairTypeScale('', [{ sel: '.price', px: 19, uses: 1 }, { sel: '.note', px: 34, uses: 2 }]);
        expect(r.text).toContain('.price { font-size: 18px; }');
        expect(r.text).toContain('.note { font-size: 36px; }');
    });

    it('a size already ON the scale is not rewritten to itself', () => {
        expect(repairTypeScale('', [{ sel: '.ok', px: 16, uses: 1 }]).repairs).toHaveLength(0);
    });

    it('neither writes twice into the same file', () => {
        const once = repairMeasure('', [{ sel: 'p', chars: 120, px: 16 }]).text;
        expect(repairMeasure(once, [{ sel: 'p', chars: 120, px: 16 }]).repairs).toHaveLength(0);
        const t = repairTypeScale('', [{ sel: '.a', px: 19, uses: 1 }]).text;
        expect(repairTypeScale(t, [{ sel: '.a', px: 19, uses: 1 }]).repairs).toHaveLength(0);
    });

    /**
     * The evidence comes out of a browser and goes into a stylesheet. A
     * selector carrying a brace closes the rule early and every byte after it
     * becomes garbage — the round would then measure a page that lost its CSS
     * and roll back, wasting a build to a defect of our own making.
     */
    it('and a poisoned selector never reaches the stylesheet', () => {
        expect(repairMeasure('', [{ sel: '} body { display:none } p', chars: 200, px: 16 }]).repairs)
            .toHaveLength(0);
        expect(repairTypeScale('', [{ sel: 'p { } @import url(x)', px: 19, uses: 1 }]).repairs)
            .toHaveLength(0);
    });

    it('nothing to aim at means nothing written', () => {
        expect(repairMeasure('.a{}', []).text).toBe('.a{}');
        expect(repairTypeScale('.a{}', []).text).toBe('.a{}');
        expect(repairMeasure('.a{}', null as any).repairs).toHaveLength(0);
        expect(repairTypeScale('.a{}', undefined as any).repairs).toHaveLength(0);
    });
});
