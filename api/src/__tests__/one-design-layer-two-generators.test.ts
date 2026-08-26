/**
 * JOE ALREADY PAIRS TYPEFACES BY SUBJECT. THE APP GENERATOR NEVER ASKS.
 *
 * The owner showed a coffee storefront using three faces with three jobs —
 * Fraunces for display, Karla for body, IBM Plex Mono for the numbers — and
 * asked why Joe cannot build that. Measured in his own repository before
 * answering:
 *
 *     core/design/layouts.ts:330
 *       [/مطعم|كافيه|قهوة|restaurant|cafe|food|bakery/,
 *        { display: 'Georgia','Playfair Display','Amiri',serif,
 *          body:    'Segoe UI','Noto Sans Arabic',sans-serif,
 *          note:    'warm editorial' }]
 *
 *     modules/tools/definitions/react-app-templates.ts:2679
 *       font-family:'Cairo','Segoe UI',system-ui,…
 *
 * A subject-aware pairing exists, is derived from the request, and is called
 * by exactly one caller — WebPageBuilderTool, the page path. The app path
 * hardcodes one family for a coffee roastery, a dental clinic and a law firm
 * alike.
 *
 * This is the palette defect again, one layer over, and that repetition is
 * the finding: it is not two mistakes, it is ONE STRUCTURE. There are two
 * generators and one design layer, and only one of them is wired to it. So
 * every capability the design layer gains reaches half of Joe's output and
 * nobody notices, because each file is correct on its own.
 *
 * THE CLASS is the night's third: two parties that must agree, maintained
 * separately, with nothing forcing them. This test is the thing that forces
 * them — it reads what BOTH generators emit and fails when one of them stops
 * consulting the layer they share.
 */

import fs from 'fs';
import path from 'path';
import { pickTypePair, typographyCss } from '../core/design/layouts';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const APP = 'modules/tools/definitions/react-app-templates.ts';

describe('both generators are painted by the one design layer', () => {
    it('POSITIVE — the app stylesheet takes its family from the token, not a literal', () => {
        //  The body rule is the one that decides how every screen reads. It
        //  must name the token; a hardcoded family there is the defect.
        const bodyRule = /body\s*\{[^}]*font-family\s*:\s*([^;}]+)/.exec(SRC(APP));
        expect(bodyRule).not.toBeNull();
        expect(bodyRule![1]).toContain('--font-body');
    });

    it('POSITIVE — no generated stylesheet hardcodes a display family', () => {
        //  «Cairo» is a fine face and a bad decision: chosen once, for every
        //  subject Joe will ever be asked to build.
        const literals = [...SRC(APP).matchAll(/font-family\s*:\s*'([A-Za-z][^']*)'/g)]
            .map(m => m[1])
            //  SVG fallbacks inside generated images are not the app's type
            //  system and have no token to read.
            .filter(f => !/^(sans-serif|system-ui|ui-monospace|monospace)$/.test(f));
        expect(literals).toEqual([]);
    });

    it('POSITIVE — two subjects get two different pairings', () => {
        //  The owner's actual question: why does everything look the same?
        const coffee = pickTypePair('اعمل لي متجر قهوة مختصة ومحمصة');
        const clinic = pickTypePair('اعمل لي نظام مواعيد عيادة أسنان');
        expect(coffee.display).not.toBe(clinic.display);
        //  …and the coffee one is the warm editorial serif, not a default.
        expect(coffee.note).toBe('warm editorial');
    });

    it('NEGATIVE — the page path still gets exactly what it had', () => {
        //  Wiring the second generator must not change the first. The page
        //  builder is the caller that already worked, and a fix that moved
        //  its output would be a regression wearing a feature's clothes.
        const css = typographyCss(pickTypePair('اعمل لي صفحة هبوط لمطعم إيطالي'));
        expect(css).toContain('--font-display:');
        expect(css).toContain('--font-body:');
        expect(css).toContain('h1,h2,h3,h4,.display{font-family:var(--font-display)');
    });

    it('NEGATIVE — an unrecognised subject still gets a considered pairing, not a blank', () => {
        //  A brief the sector table does not know must not fall to nothing.
        const odd = pickTypePair('اعمل لي أداة لمتابعة أسراب النحل');
        expect(odd.display.length).toBeGreaterThan(0);
        expect(odd.body.length).toBeGreaterThan(0);
        expect(odd.note.length).toBeGreaterThan(0);
    });

    it('NEGATIVE — the same request still picks the same pairing', () => {
        const a = pickTypePair('اعمل لي متجر قهوة مختصة');
        const b = pickTypePair('اعمل لي متجر قهوة مختصة');
        expect(a.display).toBe(b.display);
    });
});
