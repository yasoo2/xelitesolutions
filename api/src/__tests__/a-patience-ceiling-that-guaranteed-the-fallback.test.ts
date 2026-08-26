/**
 * A FIXED TWO-MINUTE CEILING GUARANTEED THE LOCAL BRAIN WOULD LOSE.
 *
 * The owner: «the system is connected to Ollama through the provider button in
 * Joe, and I want to rely on Ollama as the primary brain.»
 *
 * Measured on his machine before touching anything:
 *
 *     [LocalBrain] qwen2.5-coder:7b answered a one-token prompt in 12312ms
 *     [IntelligentRouter] ⏭️ skipping the local brain (paused 1194s more)
 *                            — going straight to the mesh
 *     → the planner, now on a keyless provider, read «اعمل لي موقع لمحمصة
 *       قهوة» as «read a file» and returned {"success":false,"data":"File not found"}
 *
 * Twelve seconds for ONE token. A planning call is hundreds of tokens, so it
 * ran past the leash, timed out twice, and the breaker paused the local brain
 * for twenty minutes — after which every request went to something weaker.
 *
 * ⛔ THE CLASS: a limit written for one kind of machine, applied as a constant
 * to all of them. On a fast host two minutes is patience; on his it is a
 * guarantee of falling through. And the fall-through does not announce itself
 * as «your brain was too slow» — it announces itself as a planner that cannot
 * read a sentence, which is a completely different-looking bug.
 *
 * The ceiling is now his to set, and choosing the local brain raises it by
 * default: a preferred brain that gets diverted is not preferred at all.
 */

import fs from 'fs';
import path from 'path';

const SRC = fs.readFileSync(
    path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'),
    'utf-8',
);

describe('the local brain can be made primary, and then it is really primary', () => {
    it('POSITIVE — the patience ceiling is configurable, not a constant', () => {
        expect(SRC).toContain('LOCAL_BRAIN_LEASH_MAX');
        //  and the old hard-coded ceiling is gone as a bare assignment
        expect(SRC).not.toMatch(/const LOCAL_LEASH_MAX_MS = 120_000;/);
    });

    it('POSITIVE — choosing the local brain raises the ceiling by itself', () => {
        //  Requiring him to set two variables to get one behaviour is how a
        //  setting becomes a trap: the visible one looks applied while the
        //  invisible one still diverts him to the mesh.
        expect(SRC).toMatch(/LOCAL_BRAIN_FIRST \? 600_000 : 120_000/);
    });

    it('POSITIVE — and it leads the order rather than sitting before the keyless ones', () => {
        expect(SRC).toMatch(/if \(LOCAL_BRAIN_FIRST\) \{[\s\S]{0,400}meshProviders\.unshift\(local\)/);
    });

    it('NEGATIVE — with the flag unset, nothing about today changes', () => {
        //  The old placement must survive verbatim, or this is not a new
        //  option — it is a silent change of behaviour for everyone else.
        expect(SRC).toMatch(/meshProviders\.splice\(firstKeyless >= 0 \? firstKeyless : meshProviders\.length, 0, local\)/);
        expect(SRC).toContain('is reserved before keyless and Offline fallbacks.');
    });

    it('NEGATIVE — the flag is read strictly, so a stray value cannot enable it', () => {
        //  `LOCAL_BRAIN_FIRST=maybe` must not silently reroute every call on
        //  his machine. Only the explicit affirmatives count.
        const m = SRC.match(/const LOCAL_BRAIN_FIRST = ([^;]+);/);
        expect(m).toBeTruthy();
        const rule = m![1];
        expect(rule).toContain('1|true|yes');
        expect(rule).toContain('trim()');
    });

    it('NEGATIVE — and the change announces itself in the log', () => {
        //  A router that silently reorders providers is impossible to diagnose
        //  from the outside; tonight's whole diagnosis came from that one line
        //  saying it was skipping the local brain.
        expect(SRC).toContain('LOCAL_BRAIN_FIRST');
        expect(SRC).toMatch(/Ollama\/Local \(Auto\) leads/);
    });
});
