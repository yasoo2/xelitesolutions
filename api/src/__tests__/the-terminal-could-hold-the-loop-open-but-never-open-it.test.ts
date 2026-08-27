/**
 * THE TERMINAL COULD HOLD THE LOOP OPEN AND NEVER OPEN IT.
 *
 * The repair block states its own contract, in its own comment:
 *
 *     BOTH INSTRUMENTS DECIDE THE ROUND — NOT JUST THE BROWSER … the terminal
 *     is a sixth of the verdict, which is enough for a broken table route to
 *     hold the whole loop open.
 *
 * True once a round is running. False at the door — because `runTerminal` was
 * defined INSIDE the block, so nothing terminal-shaped was measured before
 * deciding whether to enter it. The gate was:
 *
 *     if (!audit.skipped && worthRepairing(audit.findings))
 *
 * and `worthRepairing([])` is `.some()` over an empty array. **So a build whose
 * interface is visually clean and whose `tables_answer` route returns 404 never
 * entered a single repair round.** The one shape the terminal audit exists to
 * catch — «a system whose interface is beautiful and whose API refuses to
 * answer» — was the one shape that could not trigger it.
 *
 * ⛔ AND THE FIRST VERSION OF THE REPAIR WAS THE SAME DISEASE. It tested
 * `doorTerminal.failures`, a field that does not exist: the audit returns
 * `{ score, checks, passed, total }`. The condition would have been permanently
 * false, the door would have stayed shut, and every type check and every test
 * would have passed. **A criterion nothing can satisfy, written into the repair
 * for a criterion nothing could satisfy.** It is caught here by asking through
 * `failingIds()` — the reader the block already used ten lines further down.
 */

import fs from 'fs';
import path from 'path';
import { failingIds } from '../core/quality/terminal-audit';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'),
    'utf-8',
);

describe('either instrument can open a repair round', () => {
    it('⛔ POSITIVE — the terminal is measured BEFORE the door, not inside it', () => {
        //  Order is the entire defect. A reading taken after the decision
        //  cannot inform the decision, however carefully it is then used.
        const reader = REACT.indexOf('const terminalVerdict = async () =>');
        const door = REACT.indexOf('worthRepairing(audit.findings)');
        expect({ readerExists: reader > 0, beforeTheDoor: reader > 0 && reader < door })
            .toEqual({ readerExists: true, beforeTheDoor: true });
    });

    it('⛔ POSITIVE — a terminal failure alone opens the round', () => {
        //  With no browser finding at all. This is the shape that could not
        //  trigger a repair before: clean interface, broken API.
        expect(REACT).toMatch(/if \(!audit\.skipped && \(worthRepairing\(audit\.findings\) \|\| terminalFoundSomething\)\) \{/);
    });

    it('⛔ NEGATIVE — the failures are read through failingIds, not an invented field', () => {
        //  The first version of this repair invented `doorTerminal.failures`.
        //  Nothing would have failed: not tsc, not a test, not the build — the
        //  door would simply have stayed shut forever. Asking through the
        //  reader that already answers this question is what makes the
        //  condition capable of being true.
        //  ⛔ AND THIS ASSERTION WAS ITSELF THE DEFECT, for the third time
        //  today. Its first form was `not.toContain('doorTerminal.failures')`
        //  and went red — on the COMMENT above the fix, which quotes the field
        //  it is explaining. A text search that cannot tell code from prose is
        //  the same failure as a condition that cannot tell a real field from
        //  an invented one. So it asks what the DOOR reads, which is the claim.
        expect(REACT).toContain("require('../../../core/quality/terminal-audit').failingIds(doorTerminal)");
        expect(REACT).toMatch(/const terminalFoundSomething = doorTermFails\.length > 0;/);
    });

    it('⛔ NEGATIVE — and failingIds really reads the shape the audit returns', () => {
        //  The guard above is about spelling in one file; this one proves the
        //  reader answers on a real audit object, so the pair cannot both be
        //  wrong in the same direction.
        const audit: any = {
            score: 60, passed: 3, total: 5,
            checks: [
                { id: 'deps_installed', ok: true, detail: '' },
                { id: 'tables_answer', ok: false, detail: '404' },
                { id: 'writes_protected', ok: false, detail: 'accepted without a token' },
                { id: 'health_answers', ok: true, detail: '' },
                { id: 'app_bundle_real', ok: true, skipped: true, detail: '' },
            ],
        };
        expect(failingIds(audit)).toEqual(['tables_answer', 'writes_protected']);
        //  A clean audit opens nothing — the door must stay shut when there is
        //  genuinely nothing to repair.
        expect(failingIds({ ...audit, checks: audit.checks.map((c: any) => ({ ...c, ok: true })) })).toEqual([]);
    });

    it('⛔ NEGATIVE — a skipped audit does not open the door', () => {
        //  «I could not measure» is not «I found something». Treating a skip as
        //  a failure would spend repair rounds on builds nobody inspected —
        //  the same confusion between absence of evidence and evidence of
        //  failure that this repository closed earlier today.
        expect(REACT).toMatch(/const doorTerminal = audit\.skipped \? null : await terminalVerdict\(\)/);
        expect(REACT).toMatch(/doorTerminal && !doorTerminal\.skipped/);
    });

    it('NEGATIVE — the round reuses the door’s reading instead of paying twice', () => {
        //  A terminal audit runs real processes against a live server. Paying
        //  for it twice to learn the same fact makes the loop expensive enough
        //  that someone eventually turns it off.
        expect(REACT).toMatch(/if \(!doorTerminalUsed && doorTerminal\) \{ doorTerminalUsed = true; return doorTerminal; \}/);
    });

    it('⛔ it is announced, so he can see WHICH eye opened the round', () => {
        //  «Repairing what I can fix myself» tells him nothing about why. The
        //  ids are the difference between a loop he trusts and one he watches
        //  with suspicion.
        expect(REACT).toContain('terminal opened the repair round:');
    });
});
