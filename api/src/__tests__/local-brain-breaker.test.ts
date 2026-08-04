/**
 * THE LOCAL BRAIN CIRCUIT BREAKER — the latency tax the field log measured.
 *
 * One ordinary question on the user's machine sent SEVEN calls to the local
 * brain (intent, plan, two internal reasonings, three narrations). Every one
 * of them printed «Local (Auto) failed or timed out: TIMEOUT» and then fell
 * to Groq. Shortening the wait was not enough: a dead engine kept being
 * asked, ~20 seconds a turn, so two minutes of a three-minute answer were
 * spent waiting for a brain that never replies.
 *
 * The contract locked here: two consecutive timeouts PAUSE the local brain,
 * the pause is skipped instantly (not waited through), one short probe
 * re-tests it afterwards, a success resets everything, and a second failure
 * doubles the window. It is a pause, never a ban.
 */
import {
    isLocalBrainOpen, isLocalBrainProbing, localBrainState,
    noteLocalBrainTimeout, noteLocalBrainOk, resetLocalBrainBreaker,
} from '../core/llm/intelligent-router';

describe('the local brain is paused, not hammered', () => {
    beforeEach(() => resetLocalBrainBreaker());
    afterAll(() => resetLocalBrainBreaker());

    it('one timeout is forgiven — a cold model load is not a failure', () => {
        noteLocalBrainTimeout();
        expect(isLocalBrainOpen()).toBe(false);
        expect(localBrainState().consecutiveTimeouts).toBe(1);
    });

    it('two consecutive timeouts open the circuit for a real window', () => {
        noteLocalBrainTimeout();
        noteLocalBrainTimeout();
        expect(isLocalBrainOpen()).toBe(true);
        // Ten minutes by default — long enough to stop the bleeding, short
        // enough that a recovered engine comes back on its own.
        expect(localBrainState().untilMs).toBeGreaterThan(8 * 60_000);
        expect(localBrainState().untilMs).toBeLessThanOrEqual(10 * 60_000);
    });

    it('a success at ANY point resets it completely — this is a pause, not a ban', () => {
        noteLocalBrainTimeout();
        noteLocalBrainTimeout();
        expect(isLocalBrainOpen()).toBe(true);
        noteLocalBrainOk();
        expect(isLocalBrainOpen()).toBe(false);
        expect(isLocalBrainProbing()).toBe(false);
        expect(localBrainState().consecutiveTimeouts).toBe(0);
    });

    it('when the window passes the next call is a PROBE, not another long wait', () => {
        const now = Date.now;
        try {
            noteLocalBrainTimeout();
            noteLocalBrainTimeout();
            const opened = Date.now();
            (Date as any).now = () => opened + 11 * 60_000;   // the window has passed
            expect(isLocalBrainOpen()).toBe(false);
            expect(isLocalBrainProbing()).toBe(true);          // → an 8s probe, not 180s
        } finally { (Date as any).now = now; }
    });

    it('a failed probe doubles the window, capped at half an hour', () => {
        const now = Date.now;
        try {
            let t = Date.now();
            (Date as any).now = () => t;
            noteLocalBrainTimeout(); noteLocalBrainTimeout();
            const first = localBrainState().untilMs;
            t += 11 * 60_000;                                   // window over
            noteLocalBrainTimeout();                            // the probe failed too
            expect(localBrainState().untilMs).toBeGreaterThan(first);
            for (let i = 0; i < 8; i++) { t += 31 * 60_000; noteLocalBrainTimeout(); }
            expect(localBrainState().untilMs).toBeLessThanOrEqual(30 * 60_000);
        } finally { (Date as any).now = now; }
    });

    it('the router SKIPS the paused brain instead of waiting on it', () => {
        const fs = require('fs'), path = require('path');
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf-8');
        // The skip happens BEFORE the attempt log — no timeout is paid at all.
        const at = src.indexOf("p.name === 'Local (Auto)' && isLocalBrainOpen()");
        expect(at).toBeGreaterThan(0);
        expect(src.slice(at, at + 400)).toContain('continue;');
        expect(src).toContain('if (isLocalBrainProbing()) timeoutValue = Math.min(timeoutValue, LOCAL_PROBE_TIMEOUT_MS);');
    });

    it('decorative narration stops buying lines from the metered provider while it is paused', () => {
        const { narrationEnabled } = require('../core/agents/narrator');
        expect(narrationEnabled()).toBe(true);
        noteLocalBrainTimeout(); noteLocalBrainTimeout();
        expect(narrationEnabled()).toBe(false);
        noteLocalBrainOk();
        expect(narrationEnabled()).toBe(true);
    });
});
