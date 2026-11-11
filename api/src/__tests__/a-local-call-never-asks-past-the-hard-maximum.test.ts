/**
 * ⛔ A RUN'S DEADLINE IS NOT ONE CALL'S TIMEOUT.
 *
 * The 500-prompt exam, 2026-11-02 (JOE_RUN_DEADLINE_MS = 12 h): the engine
 * gave each local call the whole time left in the run, managedOllamaChat
 * refuses anything past its per-call hard maximum (6 h) before it starts, and
 * 337 of 338 prompts failed in 18 s with «Local inference timeout must be
 * between 1 ms and the local inference hard maximum».
 */
import { localCallTimeout } from '../core/engine/model';
import { LOCAL_INFERENCE_HARD_MAX_MS } from '../core/llm/local-throughput';

describe('how long one local call of the engine may wait', () => {
    const now = 1_000_000;

    it('a twelve-hour run asks each call for the hard maximum, never more', () => {
        expect(localCallTimeout(now + 12 * 60 * 60_000, now)).toBe(LOCAL_INFERENCE_HARD_MAX_MS);
    });

    it('a shorter run asks for the time it has left, as a whole number of ms', () => {
        expect(localCallTimeout(now + 40 * 60_000 + 0.7, now)).toBe(40 * 60_000);
    });

    it('a deadline already near or past still gives the call a minute', () => {
        expect(localCallTimeout(now + 5_000, now)).toBe(60_000);
        expect(localCallTimeout(now - 5_000, now)).toBe(60_000);
    });
});
