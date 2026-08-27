/**
 * JOE KNEW WHAT FAILED AND NEVER TOLD THE THING THAT WOULD FIX IT.
 *
 * `SelfFixService` computes exactly which acceptance criteria went unmet, and
 * writes them into the plan's `reason` as prose:
 *
 *     The acceptance gate identified unmet criteria (rule:1, column:price).
 *     Re-run the original request-driven phase once so the authoring path can
 *     repair the generated engine…
 *
 * Then `SelfFixExecutionService` re-runs the phase with `{ phase,
 * projectContext }` — and the list is gone. **So attempt two is not a repair.
 * It is the same request handed to the same nondeterministic author, hoping for
 * a different draw.** A sentence a human can read is not a channel.
 *
 * ⛔ THE CLASS IS THIS REPOSITORY'S MOST REPEATED: a value computed in one
 * layer and never carried to the layer that needs it. It is the same shape as
 * the provider the builder never asked for, the palette the app never read, and
 * the acceptance ids the delivery voice had never heard of.
 *
 * And it is the difference the owner asked about when he asked why Joe is not
 * Manus or Cursor: **a system that iterates knows what it is iterating on.**
 * The loop existed here already; what it lacked was the one fact that makes a
 * second attempt worth spending.
 *
 * This guard follows that fact across EVERY boundary between the judge and the
 * author, because a chain repaired in three places out of four still drops it.
 */

import fs from 'fs';
import path from 'path';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf-8');
const PLAN = read('modules/services/SelfFixService.ts');
const EXEC = read('modules/services/SelfFixExecutionService.ts');
const PHASE = read('modules/tools/definitions/PhaseExecutorTool.ts');
const BUILD = read('modules/tools/definitions/ReactProjectTool.ts');
const AUTHOR = read('core/design/authored-ui.ts');

describe('what failed is carried from the judge to the author', () => {
    it('⛔ 1/5 — the plan carries the criteria as DATA, not only as prose', () => {
        //  They were always in `reason`, where nothing downstream can read
        //  them. A sentence is for a person; this is for a program.
        expect(PLAN).toContain('unmetCriteria?: string[];');
        expect(PLAN).toContain('unmetCriteria: acceptanceEvidence.criteria,');
    });

    it('⛔ 2/5 — the executor hands them to the re-run', () => {
        expect(EXEC).toMatch(/repairCriteria: selfFixPlan\.unmetCriteria \|\| \[\]/);
    });

    it('⛔ 3/5 — the phase tool accepts them AND forwards them', () => {
        //  Accepting without forwarding is the defect one step further down,
        //  and it would look identical from either end.
        expect(PHASE).toContain('repairCriteria?: string[]');
        expect(PHASE).toContain('const { phase, projectContext, repairCriteria } = input;');
        expect(PHASE).toMatch(/repairCriteria: repairCriteria && repairCriteria\.length/);
    });

    it('⛔ 4/5 — the builder reads them from its context', () => {
        expect(BUILD).toMatch(/const mustFix: string\[\] = Array\.isArray\(\(context as any\)\?\.repairCriteria\)/);
    });

    it('⛔ 5/5 — and the author is TOLD, in the brief it actually receives', () => {
        //  The last hop is the one that matters: everything above is plumbing
        //  until the words reach the model that writes the component.
        expect(AUTHOR).toContain('mustFix?: string[];');
        expect(AUTHOR).toContain('A PREVIOUS ATTEMPT AT THIS PROJECT FAILED THESE');
        expect(AUTHOR).toContain('Everything else that already worked must keep working.');
    });

    it('⛔ NEGATIVE — a first attempt says nothing about a previous one', () => {
        //  An empty list is «this is attempt one», which is a different fact
        //  from «nothing failed». Announcing it either way would put a repair
        //  banner over a fresh build and teach him to distrust the line.
        expect(BUILD).toMatch(/if \(mustFix\.length\) \{/);
        expect(AUTHOR).toMatch(/\.\.\.\(spec\.mustFix && spec\.mustFix\.length \? \[/);
    });

    it('⛔ NEGATIVE — it is announced in his terminal, not carried silently', () => {
        //  He has spent a day discovering that Joe did things it never
        //  mentioned. A repair that repairs invisibly is the same habit with a
        //  better outcome, and the habit is what he objected to.
        expect(BUILD).toContain('repairing a previous attempt — these were not proven:');
    });

    it('NEGATIVE — the chain has no gap: every hop names the same field', () => {
        //  Measured as a chain rather than as five separate facts, because
        //  three hops out of four still drops it and each hop looks correct in
        //  isolation. This is the assertion that fails when someone renames the
        //  field in one place.
        for (const [name, src] of [['executor', EXEC], ['phase', PHASE], ['builder', BUILD]] as const) {
            expect({ hop: name, carries: /repairCriteria/.test(src) })
                .toEqual({ hop: name, carries: true });
        }
        for (const [name, src] of [['builder', BUILD], ['author', AUTHOR]] as const) {
            expect({ hop: name, carries: /mustFix/.test(src) })
                .toEqual({ hop: name, carries: true });
        }
    });
});
