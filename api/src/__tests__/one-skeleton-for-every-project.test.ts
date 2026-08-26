/**
 * SEVEN COMPOSITIONS EXIST. EVERY REACT PROJECT GETS THE SAME ONE.
 *
 * The owner, after the colours and the typefaces and the sections had all
 * been taught to follow the subject: «Joe builds bad and repeated designs on
 * every prompt. I want a real, root solution, seen whole.»
 *
 * He is right, and the measurement says why. Every fix so far changed what
 * fills the page. None changed the page.
 *
 *     core/design/layouts.ts:26
 *       Archetype = 'split' | 'centered' | 'bento' | 'editorial'
 *                 | 'showcase' | 'overlap' | 'contrast'
 *     core/design/layouts.ts:91
 *       pickArchetype(kind, request)      <- chosen FROM THE REQUEST
 *
 *     callers:  WebPageBuilderTool          1
 *               react-app-templates.ts      0
 *               ReactProjectTool.ts         0
 *
 * Seven compositions, and the generator that produces most of Joe's output
 * knows none of them. So a coffee roastery, a dental clinic and a law firm
 * receive different colours and different typefaces poured into the SAME
 * stacked skeleton — and to an eye, the skeleton is the design.
 *
 * THE CLASS is the same structure for the fifth time: one design layer, two
 * generators, only one wired to it. Colours, typefaces, sections, motion, and
 * now composition — the largest of them, and the one that made the other four
 * look like they had not worked.
 *
 * The negatives are the boundary: the page builder's own output must not
 * move, a named layout must still win over the default, and the same request
 * must still rebuild the same page — a system, not a shuffle.
 */

import fs from 'fs';
import path from 'path';
import { pickArchetype, layoutCss } from '../core/design/layouts';

const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const PROJECT = 'modules/tools/definitions/ReactProjectTool.ts';

describe('the page itself changes, not only what fills it', () => {
    it('POSITIVE — the project generator consults the composition layer', () => {
        //  ⛔ THE ASSERTION MOVED BECAUSE THE ANSWER DID.
        //  This demanded pickArchetype -- selection from seven. The owner
        //  called that a cage, and he was right: it is a catalogue. The
        //  generator composes now, so the claim is that it consults the
        //  COMPOSER, not that it consults the shelf.
        expect(SRC(PROJECT)).toContain('composeDesign');
    });

    it('POSITIVE — and ships its stylesheet', () => {
        expect(SRC(PROJECT)).toContain('composedCss');
    });

    it('POSITIVE — two subjects get two compositions', () => {
        //  The owner's actual complaint: every prompt, the same design.
        const a = pickArchetype('landing', 'اعمل لي موقع لمحمصة قهوة مختصة اسمها إمبرلاين');
        const b = pickArchetype('landing', 'اعمل لي موقع مكتب محاماة تجاري في الرياض');
        expect({ a, b, differ: a !== b }).toEqual({ a, b, differ: true });
    });

    it('NEGATIVE — a layout he NAMES still wins', () => {
        //  «بسيط» and «bento» are his words, and they outrank any default.
        expect(pickArchetype('landing', 'اعمل موقع بسيط جداً')).toBe('centered');
        expect(pickArchetype('landing', 'اعمل موقع بتصميم bento')).toBe('bento');
    });

    it('NEGATIVE — the same request rebuilds the same page', () => {
        //  Stability is what separates a system from a shuffle: an edit must
        //  not become a redesign.
        const one = pickArchetype('landing', 'اعمل لي موقع لمحمصة قهوة مختصة');
        const two = pickArchetype('landing', 'اعمل لي موقع لمحمصة قهوة مختصة');
        expect(one).toBe(two);
    });

    it('NEGATIVE — every composition still emits the shared skeleton', () => {
        //  A composition that dropped the wrapper or the section rhythm would
        //  produce a page with no layout at all, which is worse than one
        //  layout for everything.
        for (const a of ['split', 'centered', 'bento', 'editorial', 'showcase', 'overlap', 'contrast'] as const) {
            const css = layoutCss(a);
            expect({ a, wrap: css.includes('.wrap{'), section: css.includes('.section{') })
                .toEqual({ a, wrap: true, section: true });
        }
    });
});
