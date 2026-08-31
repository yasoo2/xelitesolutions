/**
 * THE PANEL WAS NOT A RECORD.
 *
 * Measured on the owner's machine while watching a build he had just asked for:
 *
 *     the panel during the build : Logs 99+   — dozens of decisions
 *     what survived it           : 2 events   — user_input, text
 *
 * Every line `term()` writes goes to a live WebSocket panel and is then gone.
 * The moment a run ends nobody can say why Joe did what he did.
 *
 * ⛔ AND THAT IS NOT AN INCONVENIENCE, IT IS THE END OF MEASUREMENT. That run
 * answered a request naming a counter, a plus button, a Reset button and a Copy
 * button with `Hero · Features · Faq · Cta · AdminPanel`. Measured
 * independently, the reader had named all four and turned every one into a
 * component:
 *
 *     read from request: 4
 *       «a counter that starts at 0»        -> CounterStartsAt
 *       «a plus button that increases …»    -> PlusButtonIncreases
 *       «a Reset button that sets it back»  -> ResetButtonSets
 *       «a Copy button that copies …»       -> CopyButtonCopies
 *
 * **The line naming the gate that threw them away had already scrolled into
 * nothing.** I formed a hypothesis about which gate, measured it, found the
 * measurement could not see inside the running process, and withdrew it — with
 * no way to check, anything further would have been a guess. A number without
 * its input is not a measurement, and this is where the input was being lost.
 *
 * ⛔ AND IT IS A FILE ON PURPOSE. The store is optional here
 * (`PERSISTENCE_MODE=JSON`), and the runs collection answers «Cannot call
 * runs.find() before initial connection is complete». A journal that needs a
 * service to be up cannot record the run in which that service was the problem.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { journal, journalPath, readJournal } from '../core/quality/run-journal';

const REACT = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8',
);

describe('a decision is written down as it is broadcast', () => {
    it('⛔ POSITIVE — every terminal line is journalled, at the one place they all pass', () => {
        //  Not at the interesting call sites — at `term` itself, so a decision
        //  added tomorrow is recorded without anyone remembering to.
        const at = REACT.indexOf('const term = (line: string) => {');
        expect(at).toBeGreaterThan(0);
        const body = REACT.slice(at, REACT.indexOf('};', at));
        expect(body).toContain('broadcastTerminalLine(sessionId, line');
        expect(body).toContain('journal(sessionId, line)');
    });

    it('⛔ NEGATIVE — and it can never be the reason a build fails', () => {
        //  A journal that can break the thing it observes is worse than no
        //  journal. Both the call site and the writer swallow everything.
        const at = REACT.indexOf('const term = (line: string) => {');
        const body = REACT.slice(at, REACT.indexOf('};', at));
        expect(body).toContain('try { journal(sessionId, line); } catch');
    });
});

describe('the journal itself', () => {
    let root: string;
    beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-journal-')); });
    afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

    it('⛔ POSITIVE — what was written can be read back, in order', () => {
        journal('sess-1', 'read from your request: 4 named', root);
        journal('sess-1', 'acceptance denominator: 4', root);
        {
            const out = readJournal('sess-1', root);
            expect(out).toContain('read from your request: 4 named');
            expect(out).toContain('acceptance denominator: 4');
            expect(out.indexOf('read from your request')).toBeLessThan(out.indexOf('acceptance denominator'));
        }
    });

    it('⛔ POSITIVE — each line carries when it happened', () => {
        //  «Which gate threw it away» is a question about ORDER, and an order
        //  without times cannot be lined up against anything else.
        journal('sess-2', 'authoring stood down', root);
        expect(readJournal('sess-2', root)).toMatch(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\] authoring stood down/m);
    });

    it('⛔ NEGATIVE — a hostile session id cannot escape the runs directory', () => {
        //  The id reaches this from a request. A path traversal in a debug
        //  facility is still a path traversal.
        const p = journalPath('../../etc/passwd', root);
        expect(path.dirname(p)).toBe(path.join(root, 'data', 'runs'));
        expect(path.basename(p)).not.toContain('/');
        expect(path.basename(p)).not.toContain('\\');
    });

    it('⛔ NEGATIVE — an unwritable path loses the line, not the run', () => {
        //  The whole contract: it throws nothing, ever.
        //  ⛔ Every one of these writes somewhere — so every one names a root.
        //  Without it they landed in the tree's own api/data/runs, which is a
        //  guard changing the thing it guards.
        expect(() => journal('', 'a line with no session', root)).not.toThrow();
        expect(() => journal(null as any, 'a null session', root)).not.toThrow();
        expect(() => journal('sess-3', null as any, root)).not.toThrow();
    });

    it('⛔ NEGATIVE — a missing journal reads as empty, not as an error', () => {
        expect(readJournal('never-ran', root)).toBe('');
    });
});
