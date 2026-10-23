import { LocalProvider } from '../core/llm/providers/local';

/**
 * Eval round 6, 2026-10-23: the router armed a compact local plan for 30 min
 * ([LocalDeadline] timeoutMs 1799979) and the call still ended at exactly
 * 300 031 ms with aborted: false — the local transport clamped
 * LOCAL_LLM_TIMEOUT=1800000 to 300 000. The backstop may not undercut the
 * call's own deadline.
 */
const ENV = ['LOCAL_LLM_TIMEOUT', 'LOCAL_BRAIN_LEASH_MAX'] as const;
const saved: Record<string, string | undefined> = {};
beforeEach(() => { for (const k of ENV) { saved[k] = process.env[k]; delete process.env[k]; } });
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const backstop = () => (new LocalProvider() as any).timeoutMs();

describe('the transport backstop is never shorter than the call', () => {
    it('a configured 30-minute timeout is honoured, not clamped to 5', () => {
        process.env.LOCAL_LLM_TIMEOUT = String(30 * 60_000);
        expect(backstop()).toBe(30 * 60_000);
    });
    it('it stays within the managed transport limit', () => {
        process.env.LOCAL_LLM_TIMEOUT = String(5 * 60 * 60_000);
        expect(backstop()).toBe(30 * 60_000);
    });
    it('unset, it is at least the operator\'s local ceiling', () => {
        process.env.LOCAL_BRAIN_LEASH_MAX = String(20 * 60_000);
        expect(backstop()).toBe(20 * 60_000);
        delete process.env.LOCAL_BRAIN_LEASH_MAX;
        expect(backstop()).toBe(300_000);
    });
});
