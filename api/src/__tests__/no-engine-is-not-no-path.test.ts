/**
 * «I HAVE NO ENGINE FOR THIS» IS NOT «I HAVE NO PATH FOR THIS».
 *
 * The owner watched this on his own screen, as the FIRST thing Joe said, before
 * a single file was written:
 *
 *     ANALYSIS: I did not recognise the kind of thing you asked for, and I have
 *     no ready engine for it. I am going to build a generic structure instead —
 *     a presentation page, not a working program. This is what I could not turn
 *     into a deterministic path from your words: «a servings counter with plus ·
 *     a print button». I am saying this before I start, not after — if a generic
 *     structure is not what you want, stop me now.
 *
 * ⛔ AND IT WAS FALSE. Both of those phrases become components: the builder
 * derives `ServingsCounterPlus` and `PrintButton` from those exact words and
 * writes them. There was no ENGINE — no map, no shop, no weather — and there
 * was a perfectly good PATH.
 *
 * The declaration exists for a real reason and it is kept: a silent
 * substitution is worse than an announced one. But a notice that fires when Joe
 * CAN build what was asked is worse than either — it is the first thing he
 * reads, it tells him to stop, and it is wrong about his own request.
 *
 * ⛔ AND IT WAS MY OWN REPAIRS THAT MADE IT FIRE. Closing `navigation` and
 * `\bmenu\b` was right — neither should conjure a map or a restaurant — but
 * with those two gone this request has no archetype at all, so it falls
 * straight to «no engine». Removing a false answer without checking what the
 * fallback then says is how one repair becomes the next defect.
 *
 * The rule the builder uses now lives in one file and the declaration imports
 * it. Two readers of one question, maintained apart, is the class this
 * repository has paid for more than any other.
 */

import { scaffoldSubstitutionFor, scaffoldSubstitutionNotice } from '../core/design/scaffold-substitution';
import { sectionNameFor, buildableFromWords } from '../core/design/section-name';

/** His request, as he typed it into Joe. */
const HIS = 'Build a one-page site called PhoneMenuCheck with a navigation menu that collapses '
    + 'into a hamburger button on a phone, a servings counter with plus and minus buttons that '
    + 'changes a visible number, and a print button.';

describe('the words it said it could not build', () => {
    it('⛔ POSITIVE — every one of them becomes a component', () => {
        //  Quoted from the notice he was shown, verbatim.
        expect(sectionNameFor('a servings counter with plus')).toBe('ServingsCounterPlus');
        expect(sectionNameFor('a print button')).toBe('PrintButton');
        //  Measured, not guessed: «that» is a stop word, so the third content
        //  word is «collapses». My first expectation here was wrong and the
        //  code was right — written out rather than quietly corrected, because
        //  a guard loosened until it passes stops being evidence.
        expect(sectionNameFor('a navigation menu that collapses')).toBe('NavigationMenuCollapses');
    });

    it('⛔ NEGATIVE — and a phrase that yields nothing is still nothing', () => {
        //  The notice must keep firing where it is right. Arabic yields no
        //  ASCII identifier, and neither does a fragment with no content word.
        expect(buildableFromWords(['سلة مشتريات', '', '123 456', 'a'])).toEqual([]);
    });
});

describe('the declaration before the build', () => {
    /**
     *  ⛔ MY FIRST REPAIR WAS WIDER THAN THE DEFECT, AND AN EXISTING GUARD
     *  CAUGHT ME BEFORE THIS FILE DID.
     *
     *  I suppressed the whole declaration whenever any of his words yielded a
     *  component name. `a-substitution-is-declared-not-silent` went red on
     *  «metre of Arabic poetry» — which becomes `MetreArabicPoetry` and is
     *  still something Joe has no idea how to build. **A name is not a
     *  capability.** A warning suppressed by the wrong test is a silence with
     *  extra steps, and silence is the thing that declaration exists to end.
     *
     *  So the warning stays and the FALSE HALF of it goes. «I have no engine»
     *  is true. «I could not turn your words into a path» was not — and it is
     *  replaced by the sections it is about to write from those same words.
     */
    it('⛔ POSITIVE — the notice no longer claims it has no path for buildable words', () => {
        //  It still declares, because there really is no engine …
        expect(scaffoldSubstitutionFor(HIS, true).substituted).toBe(true);
        const en = scaffoldSubstitutionNotice(HIS, { building: true, isArabic: false })!;
        expect(en).toContain('no ready engine');
        //  … and the sentence that told him to stop over things it can build
        //  is gone.
        expect(en).not.toContain('could not turn into a deterministic path');
        //  … replaced by what it will actually write, from his own words.
        expect(en).toContain('I will write these sections from those same words');
        expect(en).toContain('ServingsCounterPlus');
        expect(en).toContain('PrintButton');

        const ar = scaffoldSubstitutionNotice(HIS, { building: true, isArabic: true })!;
        expect(ar).toContain('سأكتب هذه الأقسام من كلماتك نفسها');
        expect(ar).toContain('ServingsCounterPlus');
    });

    it('⛔ NEGATIVE — and a request with nothing writable promises nothing', () => {
        //  The other half: when none of his words yields a section, the notice
        //  must NOT invent a promise. An empty list adds no sentence at all.
        const poetry = 'اكتب لي شيئا عن metre of Arabic poetry';
        const n = scaffoldSubstitutionNotice(poetry, { building: true, isArabic: false });
        if (n) expect(n.includes('I will write these sections')).toBe(
            buildableFromWords(scaffoldSubstitutionFor(poetry, true).notUnderstood).length > 0,
        );
    });

    it('⛔ NEGATIVE — a request with genuinely nothing to build still declares', () => {
        //  The notice is not being disabled. A sentence Joe cannot turn into a
        //  single component must still say so BEFORE the work, which is the
        //  whole reason it was moved out of the log.
        const nothing = 'اعمل لي شيئا جميلا';
        const v = scaffoldSubstitutionFor(nothing, true);
        if (v.substituted) {
            expect(scaffoldSubstitutionNotice(nothing, { building: true, isArabic: true })).toContain('لم أتعرّف');
        }
        //  Whatever the verdict, it must be the SAME verdict the words support:
        //  substituted exactly when nothing in them is buildable.
        expect(v.substituted).toBe(
            !v.appKind && (v.pageKind === '' || v.pageKind === 'generic')
            && buildableFromWords(v.notUnderstood.length ? v.notUnderstood : ['']).length === 0,
        );
    });

    it('⛔ NEGATIVE — nothing is declared when no build is happening', () => {
        //  A notice on a question rather than a build would fire on every
        //  conversation, and a notice that fires always is read never.
        expect(scaffoldSubstitutionFor(HIS, false).substituted).toBe(false);
        expect(scaffoldSubstitutionNotice(HIS, { building: false, isArabic: false })).toBeNull();
    });

    it('⛔ the builder and the declaration read ONE rule', () => {
        //  Not two copies that agree today. The tool re-exports the shared
        //  function rather than owning a second definition of it.
        const react = require('fs').readFileSync(
            require('path').join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
            'utf-8',
        );
        expect(react).toContain("import { sectionNameFor } from '../../../core/design/section-name';");
        expect(react).not.toContain('export function sectionNameFor(requirementText: string): string {');
    });
});
