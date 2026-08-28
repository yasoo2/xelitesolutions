/**
 * A FLAG NOTHING READS IS A FLAG THAT WAS NEVER SET.
 *
 * The router decides Joe's whole economy on one line:
 *
 *     intelligent-router.ts:1268
 *     const internalCall = String((context as any)?.purpose || '') === 'internal';
 *
 * and spends it on another:
 *
 *     intelligent-router.ts:1477
 *     💰 internal reasoning → local brain first
 *       (daily quota reserved for the final answer)
 *
 * ⛔ SEVENTEEN CALL SITES PASS `purpose: 'internal'`. TWO PASSED
 * `internalCall: true` — both of them in `model-round.ts`, both of them repair
 * rounds. The router never reads that key, so for every repair Joe has ever
 * made the flag was simply absent, and the economy never applied. A repair
 * round went to the same paid mesh as the answer, on a machine that has a
 * local brain sitting idle with no quota at all.
 *
 * It cost nothing visible, which is exactly why it survived: **a flag that is
 * ignored produces a working call every time — just an expensive one.** There
 * is no error, no warning, no wrong output. Only the bill.
 *
 * Seventeen right and two wrong is the ordinary shape of it, and it is the
 * third time tonight: four backslash normalisations against seventy-eight
 * correct ones; a bare `navigation` between two anchored alternatives; an
 * English `\bmenu\b` beside an Arabic one that demanded the word for food.
 * **The wrong one is never the only one. It is the one nobody re-read.**
 *
 * And the measurement that sent me here, from his own machine:
 *
 *     READ:   5 named in 2 call(s)
 *     [LLM7] rate-limited (429). Cooling down 59s
 *     VERIFY: 5 verdicts in 33553ms   blind=true
 *
 * Seven calls on a mesh that allows about two — while `qwen2.5-coder:7b` sat
 * ready on his own disk with no limit at all.
 */

import fs from 'fs';
import path from 'path';

const api = (...p: string[]) => path.join(__dirname, '..', ...p);
const ROUTER = fs.readFileSync(api('core', 'llm', 'intelligent-router.ts'), 'utf-8');
const stripComments = (s: string) =>
    s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

/** Every production file, so the sweep cannot miss a caller. */
const SOURCES = (() => {
    const out: Record<string, string> = {};
    const walk = (dir: string) => {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); continue; }
            if (e.name.endsWith('.ts')) out[p] = fs.readFileSync(p, 'utf-8');
        }
    };
    walk(api());
    return out;
})();

describe('the key the router reads is the key every caller writes', () => {
    it('⛔ POSITIVE — the router still decides on `purpose`', () => {
        //  The contract itself. If this moves, every assertion below is about
        //  a rule that no longer exists, and the sweep would pass over a
        //  codebase that had silently changed its mind.
        expect(stripComments(ROUTER)).toContain(
            "const internalCall = String((context as any)?.purpose || '') === 'internal';",
        );
    });

    it('⛔ POSITIVE — and the economy it buys is still there to buy', () => {
        expect(stripComments(ROUTER)).toContain('internalCall && isLocalBrainReady()');
    });

    it('⛔ NEGATIVE — no production file passes a key the router does not read', () => {
        //  Named file:line, because «somewhere in the tree» is not a finding
        //  anyone can act on.
        const offenders: string[] = [];
        for (const [file, src] of Object.entries(SOURCES)) {
            src.split('\n').forEach((line, i) => {
                if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
                //  ⛔ `internalCall: true` — the VALUE, not the name. My first
                //  version matched the name alone and flagged
                //  `intelligent-router.ts:910`, which is the router's own
                //  parameter DECLARATION (`internalCall: boolean`) and is
                //  exactly right. A negative case narrower than the defect
                //  misses it; one broader than the defect cries wolf, and a
                //  guard that cries wolf is one nobody reads twice.
                if (line.includes('internalCall: true')) offenders.push(`${path.basename(file)}:${i + 1}`);
            });
        }
        expect(offenders).toEqual([]);
    });

    it('⛔ NEGATIVE — and the correct key is what the tree is actually built on', () => {
        //  «None wrong» over none at all is the empty-gate shape. This says the
        //  right form is in real use, so the check above is measuring something.
        let good = 0;
        for (const src of Object.values(SOURCES)) {
            good += src.split('\n').filter(l =>
                !/^\s*(\/\/|\*|\/\*)/.test(l) && l.includes("purpose: 'internal'")).length;
        }
        expect(good).toBeGreaterThan(10);
    });

    it('⛔ POSITIVE — both repair rounds are among them', () => {
        //  The two that were wrong, named, so a regression says which.
        const round = fs.readFileSync(api('core', 'quality', 'model-round.ts'), 'utf-8');
        const code = stripComments(round);
        expect(code).toContain("{ purpose: 'internal' },");
        expect(code).toContain("{ ...(opts.context || {}), purpose: 'internal' },");
    });
});
