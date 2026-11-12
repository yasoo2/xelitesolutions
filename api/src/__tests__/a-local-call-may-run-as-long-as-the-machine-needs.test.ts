import fs from 'fs';
import path from 'path';
import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';
import { LOCAL_INFERENCE_HARD_MAX_MS } from '../core/llm/local-throughput';
import { localPlannerCeilingMs } from '../core/orchestrator/planner-run-boundary';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';

/**
 * Owner, 2026-10-23: the laptop is for development only; Joe will run on a GPU
 * server for thousands of users. Nothing may be cut to suit the laptop — and
 * nothing may assume it either. Four places capped one local call at 30
 * minutes: a CPU plan still writing was ended, and a GPU never reaches it.
 * One hard maximum (a runaway guard) replaces them; the real deadline is sized
 * from the measured machine or set by the operator.
 */
const base = { baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M', messages: [{ role: 'user' as const, content: 'hi' }] };
const ok = () => {
    const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: 'x' }, prompt_eval_count: 3, eval_count: 1 })));
    const gate = jest.fn(async (work: any, admission: any) => work({ contextTokens: 4096, outputTokens: 512, signal: admission.signal }));
    return { fetch, resourceManager: { withInference: gate } } as any;
};

describe('a local call may run as long as the machine needs', () => {
    const saved = process.env.LOCAL_BRAIN_LEASH_MAX;
    afterEach(() => { if (saved === undefined) delete process.env.LOCAL_BRAIN_LEASH_MAX; else process.env.LOCAL_BRAIN_LEASH_MAX = saved; });

    it('the hard maximum is a runaway guard far above any sized call', () => {
        expect(LOCAL_INFERENCE_HARD_MAX_MS).toBeGreaterThanOrEqual(4 * 60 * 60_000);
    });

    it('the transport accepts a two-hour call and refuses one past the hard maximum', async () => {
        await expect(managedOllamaChat({ ...base, timeoutMs: 2 * 60 * 60_000 }, ok())).resolves.toHaveProperty('content', 'x');
        await expect(managedOllamaChat({ ...base, timeoutMs: LOCAL_INFERENCE_HARD_MAX_MS + 1 }, ok())).rejects.toMatchObject({ code: 'OLLAMA_TIMEOUT_INPUT' });
    });

    it('the operator ceiling may exceed 30 minutes', () => {
        process.env.LOCAL_BRAIN_LEASH_MAX = String(3 * 60 * 60_000);
        expect(localPlannerCeilingMs()).toBe(3 * 60 * 60_000);
    });

    it('no local inference path keeps its own 30-minute cap', () => {
        const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
        const THIRTY_MINUTES = /30 \* 60(?:_000| \* 1000)/;
        for (const file of ['core/llm/providers/managed-ollama-chat.ts', 'core/llm/providers/local.ts',
            'core/orchestrator/planner-run-boundary.ts']) {
            expect(read(file)).not.toMatch(THIRTY_MINUTES);
        }
        //  The resource queue: a local call's own wait reaches the hard maximum,
        //  not 30 minutes — asked of the queue itself, not of its source.
        const manager = new RequestResourceManager({ sampleMemory: () => ({ totalBytes: 16 * 1024 ** 3, availableBytes: 8 * 1024 ** 3 }) });
        expect((manager as any).timeout(2 * 60 * 60_000)).toBe(2 * 60 * 60_000);
        expect((manager as any).timeout(LOCAL_INFERENCE_HARD_MAX_MS + 1)).toBe(LOCAL_INFERENCE_HARD_MAX_MS);
        //  Its one 30-minute bound is memoryWaitMs (617b843e2): how long a HEAVY
        //  step waits for memory another program holds before it is refused —
        //  not how long a local call may run. Any other 30-minute literal there
        //  is the old cut come back.
        const capped = read('core/resources/RequestResourceManager.ts').split(/\r?\n/).filter(line => THIRTY_MINUTES.test(line));
        expect(capped.filter(line => !/\bmemoryWaitMs: boundedInteger\(options\.memoryWaitMs,/.test(line))).toEqual([]);
    });
});
