/**
 * «4 REAL COMMANDS RAN IN FRONT OF YOU — 4 EXITED CLEAN», AND TWO WERE `node -v`.
 *
 * Measured in a delivery on the owner's screen. The four commands behind that
 * sentence were:
 *
 *     node -v        ← asks the machine what it is
 *     npm -v         ← asks the machine what it is
 *     npm install
 *     vite build
 *
 * Every word of the line was true and the number was not honest. Two of the
 * four prove the shell answers; they prove nothing about his project. The
 * count doubles the apparent evidence, and a count is exactly what he reads as
 * «how much real work happened».
 *
 * The class: EVIDENCE COUNTED BY VOLUME WHERE HE READS IT AS WORK — the same
 * family as a number published without the input that produced it. The cure is
 * not to hide the probes, which really did run and really are shown in his
 * terminal panel; it is to stop calling them work.
 */

import { transcriptLine, type RanCommand } from '../core/quality/terminal-session';

const ok = (command: string, probe = false): RanCommand =>
    ({ command, exitCode: 0, ms: 10, ...(probe ? { probe: true } : {}) });

describe('the number he reads as work is only work', () => {
    it('two version checks are not counted among the commands', () => {
        //  The exact shape that produced the false line.
        const line = transcriptLine({ commands: 2, passed: 2, probes: 2, failed: [] }, false);
        expect(line).toContain('2 real commands');
        expect(line).not.toContain('4 real commands');
        //  And they are still disclosed — hiding them would be a second lie.
        expect(line).toContain('2 version checks');
    });

    it('the Arabic line says the same thing', () => {
        const line = transcriptLine({ commands: 2, passed: 2, probes: 2, failed: [] }, true);
        expect(line).toContain('2');
        expect(line).toContain('فحص');
    });

    it('a run with no probes says nothing about probes', () => {
        //  The negative case: the disclosure must not appear when there is
        //  nothing to disclose, or it becomes noise nobody reads.
        const line = transcriptLine({ commands: 3, passed: 3, probes: 0, failed: [] }, false);
        expect(line).toContain('3 real commands');
        expect(line).not.toMatch(/version check/);
    });

    it('and real work is still counted, including what failed', () => {
        //  A fix that shrinks the count by silencing failures would be worse
        //  than the defect it replaces.
        const failed = [{ command: 'npm ls --depth=0', exitCode: 1, ms: 40 }] as RanCommand[];
        const line = transcriptLine({ commands: 3, passed: 2, probes: 2, failed }, false);
        expect(line).toContain('3 real commands');
        expect(line).toContain('2 exited clean');
        expect(line).toContain('npm ls --depth=0');
    });

    it('a probe carries its own mark, so the counter can tell them apart', () => {
        //  The record itself must distinguish them; a count derived from
        //  guessing at command TEXT would break the first time a build ran
        //  a command containing «-v».
        expect(ok('node -v', true).probe).toBe(true);
        expect(ok('npm install').probe).toBeUndefined();
    });
});
