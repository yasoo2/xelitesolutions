/**
 *  WHAT JOE DECIDED, KEPT AFTER THE RUN THAT DECIDED IT.
 *
 *  ⛔ MEASURED ON THE OWNER'S MACHINE, AND IT IS WHY THIS FILE EXISTS.
 *
 *      the panel during the build : Logs 99+   — dozens of decisions
 *      what survived the build    : 2 events   — user_input, text
 *
 *  Every line `term()` writes goes to a live panel over a WebSocket and is
 *  then gone. The moment a run ends nobody can say WHY Joe did what he did —
 *  not the owner, not me, and not Joe on the next round.
 *
 *  It is not an inconvenience. It is the reason a diagnosis stops being a
 *  measurement: his build produced `Hero · Features · Faq · Cta` for a request
 *  that named a counter and three buttons, the reader had named all four and
 *  turned them into components, and **the line that would say which gate threw
 *  them away had already scrolled into nothing.** Anything said after that is
 *  a guess, and this repository's first rule is that a number without its
 *  input is not a measurement.
 *
 *  ⛔ AND IT IS DELIBERATELY A FILE, NOT A DATABASE. The store is optional in
 *  this deployment — `PERSISTENCE_MODE=JSON`, and the runs collection answers
 *  «Cannot call runs.find() before initial connection is complete». A journal
 *  that needs a service to be up cannot record the run where that service was
 *  the problem.
 *
 *  Nothing here is allowed to fail a build. A journal that can break the thing
 *  it observes is worse than no journal: every write is wrapped, and a failure
 *  costs the line, never the run.
 */

import fs from 'fs';
import path from 'path';

/** Where a run's journal lives. One file per run, named by its session. */
export function journalPath(sessionId: string, root?: string): string {
    const dir = path.join(root || process.cwd(), 'data', 'runs');
    const safe = String(sessionId || 'anonymous').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
    return path.join(dir, `${safe || 'anonymous'}.log`);
}

/**
 *  Append one decision. Never throws, never blocks, never grows without bound.
 *
 *  The cap is on the FILE, not on the process: a build that loops is exactly
 *  the build whose journal matters, and losing it to a memory limit would be
 *  the same silence in a new place.
 */
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;

export function journal(sessionId: string, line: string, root?: string): void {
    try {
        //  `root` exists so a test can write somewhere of its own. Without it a
        //  guard writes into `api/data/runs` — the directory the feature uses
        //  in production — and leaves files behind in the working tree, which
        //  is what happened the first time this was measured.
        const p = journalPath(sessionId, root);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        //  Past the cap the file is rotated rather than truncated: the START of
        //  a run holds the decisions — which engine, which sections, what was
        //  refused — and a naive truncation keeps the noisy end and throws the
        //  answer away.
        try {
            if (fs.statSync(p).size > MAX_JOURNAL_BYTES) fs.renameSync(p, `${p}.1`);
        } catch { /* no file yet, or a rename race: append anyway */ }
        const stamp = new Date().toISOString().slice(11, 23);
        fs.appendFileSync(p, `[${stamp}] ${String(line ?? '')}\n`, 'utf-8');
    } catch { /* a journal must never be the reason a build fails */ }
}

/** Read a run's journal back — the whole point of writing it. */
export function readJournal(sessionId: string, root?: string): string {
    try { return fs.readFileSync(journalPath(sessionId, root), 'utf-8'); } catch { return ''; }
}
