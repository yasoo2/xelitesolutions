/**
 * A PAGE HE NEVER CHOSE, DELIVERED AS THOUGH IT WERE A CHOICE.
 *
 * Measured live, three repairs deep, when the output would not change no matter
 * what was fixed:
 *
 *     interface authoring stood down — the model providers are rationing, and
 *     the planner needs that quota more than the page does
 *
 *     what was built:      AdminPanel · OrderButton · Products · Contact
 *     what he asked for:   an ingredients list · a servings counter · a print button
 *
 * ⛔ THE STAND-DOWN IS CORRECT. A page must not eat the quota the planner needs,
 * and falling back to templates is the right call. **What was wrong is that it
 * said so once, in the terminal, and nowhere else.** The delivery message
 * described a finished site. He saw a shop, and had no way to learn that no
 * model had written a line of it.
 *
 * ⛔ AND IT COST THREE REPAIRS THEIR EVIDENCE. Behaviour authoring, section
 * derivation and the named-section filter were each measured on runs where this
 * branch had silently taken the other road — guards green, code correct, path
 * never executed. **That is the same shape as a gate reporting «0 failed» over
 * 0 tests**, and this line is where it hid. It is the last instance of the
 * class this whole session has been closing, and the only one that concealed
 * the repairs for the class itself.
 *
 * «I could not reach a model, so the page is templates» is a sentence he can
 * act on: retry, add a key, choose another provider. A page that merely looks
 * unconsidered is a sentence he cannot.
 */

import fs from 'fs';
import path from 'path';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

describe('a silent fallback is announced where he reads', () => {
    it('⛔ POSITIVE — the stand-down is recorded, not only printed', () => {
        //  `term()` writes to a panel he may never open. A flag outlives the
        //  branch and can reach the message.
        expect(REACT).toContain('let authoringStoodDown = false;');
        expect(REACT).toMatch(/authoringStoodDown = true;/);
    });

    it('⛔ POSITIVE — and it reaches the delivery message itself', () => {
        //  The acceptance block is what he actually reads. A notice anywhere
        //  else is a notice for someone reading logs, which is not him.
        expect(REACT).toContain('const standDownNotice = authoringStoodDown');
        expect(REACT).toMatch(/const acceptBlock = `\$\{standDownNotice\}\$\{acceptanceBlock\(acceptance, isAr\)\}/);
    });

    it('⛔ POSITIVE — in both languages, and it names what to DO', () => {
        //  A notice he cannot act on is decoration. Retry, add a key, choose
        //  another provider — the three things that actually change the
        //  outcome, in the language he set.
        expect(REACT).toContain('assembled from ready-made templates rather than written from your request');
        expect(REACT).toContain('pick another provider from the providers button');
        expect(REACT).toContain('أعد المحاولة'); // «أعد المحاولة»
    });

    it('⛔ NEGATIVE — a normal build carries no notice at all', () => {
        //  A warning printed on every delivery is a warning he learns to skip,
        //  and then the one that matters is invisible too. The empty string is
        //  the default, and it is asserted rather than assumed.
        //  Read the whole ternary and assert its FALSE arm is the empty string,
        //  rather than pinning indentation — a pattern that depends on
        //  whitespace tests the formatter, not the claim.
        const at = REACT.indexOf('const standDownNotice = authoringStoodDown');
        const decl = REACT.slice(at, REACT.indexOf('const acceptBlock', at));
        expect(decl).toContain('?');
        expect(decl.replace(/\s+/g, ' ')).toContain(": '';");
    });

    it('⛔ NEGATIVE — the stand-down itself is untouched', () => {
        //  This repair is about telling him, not about spending the quota
        //  anyway. The branch still stands down, and still says why.
        expect(REACT).toContain('interface authoring stood down — the model providers are rationing');
        expect(REACT).toMatch(/if \(!appBp && sections\.length && providersAreRationing\) \{/);
    });
});
