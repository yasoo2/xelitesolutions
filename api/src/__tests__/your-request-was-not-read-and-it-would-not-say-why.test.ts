/**
 * «YOUR REQUEST WAS NOT READ» — AND IT WOULD NOT SAY WHY.
 *
 * Read off the owner's own screen, in his own Joe, in the terminal panel he
 * watches while it works:
 *
 *     acceptance denominator: 5 (known-features list — your request was not read)
 *     acceptance: 2/5 (from the known-features list — your request was not read)
 *       — not proven: counter, rule:1, rule:2
 *     delivery: BLOCKED — acceptance ledger is not accepted
 *
 * Every word of that is true, and he can do nothing with it.
 *
 * ⛔ THREE DIFFERENT FAILURES COLLAPSE INTO THAT ONE SENTENCE, and each has a
 * different thing for him to do:
 *
 *     no model was reachable          → retry, or pick another provider
 *     the model answered and nothing
 *       survived the filters          → his sentence named nothing testable,
 *                                       so he can rephrase it
 *     the reader threw                → a defect in Joe, and he can say so
 *
 * It is the same shape as a page delivered from ready-made templates in
 * silence — the defect this file already carries a repair for, twenty lines
 * away from the one that hid this. **A reason he can act on is the whole
 * difference between a report and a shrug.**
 *
 * And the sentence stays honest in the direction that matters: when the
 * request IS read, nothing is appended, because a reason for a failure that
 * did not happen is noise.
 */

import fs from 'fs';
import path from 'path';
import { readRequestRequirements } from '../modules/tools/definitions/ReactProjectTool';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8',
);

/** Code only — a guard must never match the comment that explains it. */
const CODE = REACT.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/**
 * The model reading lives in one function since eval round 15 (a thrown reader
 * must still fall back to his clauses); the guards below read it there.
 */
const READER = (() => {
    const at = CODE.indexOf('export async function readRequestRequirements(');
    if (at < 0) return '';
    const end = CODE.slice(at).search(/\n\}\r?\n/);
    return end < 0 ? '' : CODE.slice(at, at + end);
})();

describe('the reason travels with the effect', () => {
    it('⛔ POSITIVE — each of the three failures records its own reason', () => {
        //  Each assignment is checked for its OWN phrase rather than for a
        //  whole line: two of the three live inside a ternary, and pinning the
        //  spelling of the statement around them tests the formatter. My first
        //  version did exactly that and went red on correct code.
        const assignments = CODE.split('\n').filter(l => l.includes('whyNotRead ='));
        expect(assignments.length).toBeGreaterThanOrEqual(3);
        expect(READER.length).toBeGreaterThan(0);
        const all = assignments.join('\n') + READER.slice(READER.indexOf('if (!named.length) {'), READER.indexOf('if (!named.length) {') + 400);
        //  …and what the reader decided is what the build reports.
        expect(CODE).toContain('const reading = await readRequestRequirements(request, isAr, askTheModel, term);');
        expect(CODE).toContain('whyNotRead = reading.whyNotRead;');
        expect(READER).toContain("String(read.rejected[0]?.reason || 'the model did not answer')");
        for (const reason of [
            'no model in this environment',
            'the model named nothing in this request',
            'none survived the filters',
            'the reader failed',
        ]) {
            expect({ reason, present: all.includes(reason) }).toEqual({ reason, present: true });
        }
    });

    it('⛔ POSITIVE — and the reason reaches the line he reads', () => {
        //  The denominator line is what appeared on his screen. A reason kept
        //  in a variable nobody prints is the same defect one layer in.
        //  ⛔ Pinned letter for letter, this went red the moment the sentence
        //  learned to name the STAGE that failed — an improvement, called a
        //  failure by my own guard, for the third time tonight. The claim is
        //  «the reason reaches the line he reads», so that is what is checked.
        const at = CODE.indexOf('acceptance denominator:');
        expect(at).toBeGreaterThan(0);
        const sentence = CODE.slice(at, at + 700);
        expect(sentence).toContain('known-features list');
        expect(sentence).toContain('${whyNotRead ? `: ${whyNotRead}` : \'\'}');
    });

    it('⛔ NEGATIVE — a request that WAS read carries no reason at all', () => {
        //  «read from your request: N named» must not grow an explanation for
        //  a failure that did not happen. The branch is asserted whole, so a
        //  future edit cannot append to the success arm by accident.
        expect(CODE).toContain('? ` (${namedJudged.length} read from your request + ${structural.length} structural)`');
    });

    it('⛔ NEGATIVE — the reason is bounded, so a stack trace cannot flood the panel', () => {
        //  A thrown error's message can be thousands of characters. The
        //  terminal he watches is not the place to discover that.
        const at = CODE.indexOf('whyNotRead = `the reader failed:');
        expect(at).toBeGreaterThan(0);
        expect(CODE.slice(at, at + 120)).toContain('.slice(0, 90)');
    });

    it('⛔ NEGATIVE — «nothing survived» is distinguished from «named nothing»', () => {
        //  A model that proposed five requirements and had all five refused by
        //  the filters is a different fact from a model that proposed none:
        //  the first says the filters are too strict or the request is odd,
        //  the second says the sentence has nothing testable in it. Collapsing
        //  them would rebuild the defect this file closes.
        const at = READER.indexOf('if (!named.length) {');
        expect(at).toBeGreaterThan(0);
        const branch = READER.slice(at, at + 400);
        expect(branch).toContain('read.rejected.length');
        expect(branch).toContain('none survived the filters');
        expect(branch).toContain('named nothing in this request');
    });

    it('⛔ POSITIVE — run, not read: each outcome of the reader comes back with its own reason', async () => {
        const say = () => undefined;
        const ask = async () => '';
        const reasonFor = async (reader: any) => (await readRequestRequirements('Build me something nice.', false, ask, say, reader)).whyNotRead;
        expect(await reasonFor(async () => ({ requirements: [], rejected: [{ text: '*', reason: 'the model could not be reached: TIMEOUT' }] })))
            .toBe('the model could not be reached: TIMEOUT');
        expect(await reasonFor(async () => ({ requirements: [], rejected: [{ text: 'a', reason: 'x' }, { text: 'b', reason: 'y' }], passes: 2 })))
            .toBe('the model named 2, and none survived the filters');
        expect(await reasonFor(async () => ({ requirements: [], rejected: [], passes: 2 })))
            .toBe('the model named nothing in this request');
        expect(await reasonFor(async () => { throw new Error('parser exploded'); }))
            .toBe('the reader failed: parser exploded');
    });
});
