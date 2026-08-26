/**
 * EVERY APP JOE BUILDS LOOKS THE SAME, WHATEVER IT IS FOR.
 *
 * The owner opened a coffee storefront somebody else had built and asked why
 * Joe cannot produce that. Measured on both sides rather than guessed:
 *
 *   the store         12 colours named out of coffee's own vocabulary —
 *                     paper, kraft, espresso, roast, bark, ember, caramel
 *   Joe               one `--brand`, defaulting to #1a73e8, Google's blue
 *
 * And the reason is not that Joe has no palette. `buildPalette(request)`
 * derives one from the request and `paletteCss` writes it to tokens.css. The
 * reason is that the app generator never reads most of it:
 *
 *     read by the app, written by nobody:
 *        --card    -> #fff        every card white
 *        --chip    -> #f5f5f5     every chip grey
 *        --line    -> #e5e5e5     every rule grey
 *        --muted   -> #667085     every secondary line blue-grey
 *        --panel   -> var(--bg)
 *        --ring          NO FALLBACK AT ALL
 *        --shadow-brand  NO FALLBACK AT ALL
 *        --shadow-xs     NO FALLBACK AT ALL
 *
 * The surfaces carrying the most visual area take hardcoded greys, so the
 * palette reaches the buttons and almost nothing else. The last three are
 * worse than wrong: a `var()` with no fallback and no definition makes the
 * whole declaration invalid, so those focus rings and shadows never render
 * and never error either.
 *
 * THE CLASS is this repository's third: two parties that must agree on a
 * vocabulary, maintained separately, with nothing forcing them. The palette
 * writes 23 names the app never reads and the app reads 8 the palette never
 * writes, and both files are internally consistent and both are wrong
 * together.
 *
 * So the fix cannot be «add the eight», because the ninth arrives with the
 * next component. THIS TEST is the fix: it reads both files and fails when
 * they drift apart again.
 */

import fs from 'fs';
import path from 'path';
import { buildPalette, paletteCss } from '../core/design/design-system';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');

/** Token names a stylesheet DEFINES, e.g. `--card: #fff;` */
function defined(css: string): Set<string> {
    return new Set([...css.matchAll(/(--[a-z][a-z0-9-]*)\s*:/g)].map(m => m[1]));
}

/** Token names a template READS, e.g. `var(--card,#fff)`. */
function read(src: string): Set<string> {
    return new Set([...src.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/g)].map(m => m[1]));
}

/** Reads with NO fallback — an undefined one makes the declaration invalid. */
function readWithoutFallback(src: string): string[] {
    const out: string[] = [];
    for (const m of src.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)\s*([,)])/g)) {
        if (m[2] === ')') out.push(m[1]);
    }
    return [...new Set(out)];
}

describe('the palette the app is painted with is the palette Joe derived', () => {
    const APP = 'modules/tools/definitions/react-app-templates.ts';

    it('POSITIVE — every token the app reads is one the palette defines', () => {
        const css = paletteCss(buildPalette('اعمل لي متجر قهوة مختصة'));
        const missing = [...read(SRC(APP))].filter(t => !defined(css).has(t)).sort();
        //  Named one by one, because «some token is missing» is not something
        //  anyone can act on and this list is exactly the repair.
        expect(missing).toEqual([]);
    });

    it('POSITIVE — a token read with no fallback is one the palette guarantees', () => {
        //  I first wrote this as «no token may be read without a fallback» and
        //  that was a rule I could not justify by measurement. A missing
        //  fallback only harms when the token is ALSO undefined -- then the
        //  whole declaration is invalid and the browser drops it in silence.
        //  Three tokens were in exactly that state; they are defined now.
        //
        //  So the criterion is the one the defect actually had: no bare read
        //  of a token the shipped stylesheet does not define. Demanding a
        //  fallback everywhere would have meant editing sixteen call sites for
        //  a risk I never observed, and a criterion nobody can point at is the
        //  thing this project keeps deleting.
        const css = paletteCss(buildPalette('متجر قهوة'));
        const bare = readWithoutFallback(SRC(APP)).filter(t => !defined(css).has(t));
        expect(bare).toEqual([]);
    });

    it('POSITIVE — the surfaces that carry the most area follow the request', () => {
        //  Two different subjects must not paint their cards the same colour.
        //  This is the owner's actual question: why does every app look alike?
        const coffee = paletteCss(buildPalette('متجر قهوة مختصة محمصة'));
        const clinic = paletteCss(buildPalette('عيادة أسنان ومواعيد المرضى'));
        const valueOf = (css: string, token: string) =>
            (new RegExp(token + '\\s*:\\s*([^;]+);').exec(css) || [])[1]?.trim() || '';
        for (const token of ['--card', '--chip', '--muted', '--line']) {
            expect(valueOf(coffee, token)).not.toBe('');
            expect(valueOf(coffee, token)).not.toBe(valueOf(clinic, token));
        }
    });

    it('NEGATIVE — the palette still answers a named colour exactly', () => {
        //  A colour he NAMED is not a suggestion, and widening the vocabulary
        //  must not loosen that. «أزرق» stays blue.
        const blue = buildPalette('اعمل موقع بلون أزرق');
        expect(blue.hue).toBeGreaterThan(190);
        expect(blue.hue).toBeLessThan(260);
    });

    it('NEGATIVE — the same request rebuilds the same identity', () => {
        //  Stability is the reason the hue is hashed rather than random; a
        //  fix that made cards subject-dependent must not make them unstable.
        const a = paletteCss(buildPalette('متجر قهوة مختصة محمصة'));
        const b = paletteCss(buildPalette('متجر قهوة مختصة محمصة'));
        expect(a).toBe(b);
    });

    it('NEGATIVE — every colour pair the palette ships is still AA-legible', () => {
        const { contrastRatio } = require('../core/design/design-system');
        const p = buildPalette('متجر قهوة مختصة محمصة');
        expect(contrastRatio(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.text, p.surface)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(p.onTint, p.tint)).toBeGreaterThanOrEqual(4.5);
    });
});
