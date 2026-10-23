import { RequestResourceManager } from '../core/resources/RequestResourceManager';
import { contextTierForMemory, localContextCeilingTokens, CONTEXT_HARD_MAX_TOKENS } from '../core/resources/context-ceiling';
import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';

/**
 * Owner, 2026-10-23: the laptop is for development; Joe will run on a GPU
 * server with large memory. The window stopped at 16384 tokens in three
 * places. The ceiling is now the operator's (LOCAL_MAX_CONTEXT, default
 * unchanged) and the memory tier continues upward with the same rule.
 */
const GiB = 1024 ** 3;
const reading = (available: number) => ({ totalBytes: 256 * GiB, freeBytes: available, availableBytes: available, rssBytes: 1 });

describe('a server may give the model a larger window', () => {
    const saved = process.env.LOCAL_MAX_CONTEXT;
    afterEach(() => { if (saved === undefined) delete process.env.LOCAL_MAX_CONTEXT; else process.env.LOCAL_MAX_CONTEXT = saved; });

    it('the memory tiers are the old ones below 16 GiB and continue above', () => {
        expect([1, 2, 4, 8, 12].map(g => contextTierForMemory(g * GiB))).toEqual([2048, 4096, 8192, 16384, 16384]);
        expect(contextTierForMemory(0)).toBe(2048);
        expect(contextTierForMemory(16 * GiB)).toBe(32768);
        expect(contextTierForMemory(64 * GiB)).toBe(131072);
        expect(contextTierForMemory(10_000 * GiB)).toBe(CONTEXT_HARD_MAX_TOKENS);
    });

    it('unset, the ceiling stays 16384 — a machine nobody configured behaves as before', async () => {
        delete process.env.LOCAL_MAX_CONTEXT;
        expect(localContextCeilingTokens()).toBe(16384);
        const manager = new RequestResourceManager({ sampleMemory: () => reading(64 * GiB), sampleResidentInference: async () => 0 });
        await manager.withInference(async budget => { expect(budget.contextTokens).toBe(16384); }, { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
    });

    it('a server operator raises it, and memory still decides what is admitted', async () => {
        process.env.LOCAL_MAX_CONTEXT = '65536';
        const big = new RequestResourceManager({ sampleMemory: () => reading(64 * GiB), sampleResidentInference: async () => 0 });
        await big.withInference(async budget => { expect(budget.contextTokens).toBe(65536); }, { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
        const small = new RequestResourceManager({ sampleMemory: () => reading(8 * GiB), sampleResidentInference: async () => 0 });
        await small.withInference(async budget => { expect(budget.contextTokens).toBe(16384); }, { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
    });

    it('the transport asks for the operator ceiling and accepts a window above 16384', async () => {
        process.env.LOCAL_MAX_CONTEXT = '65536';
        const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: 'x' }, prompt_eval_count: 3, eval_count: 1 })));
        const gate = jest.fn(async (work: any, admission: any) => work({ contextTokens: 65536, outputTokens: Math.min(admission.requestedOutputTokens, 65536 - admission.promptEstimatedTokens - 1), signal: admission.signal }));
        await managedOllamaChat({ baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M', messages: [{ role: 'user', content: 'hi' }], timeoutMs: 5000 }, { fetch, resourceManager: { withInference: gate } } as any);
        expect(gate.mock.calls[0][1].requestedContextTokens).toBe(65536);
        expect(JSON.parse(fetch.mock.calls[0][1].body).options.num_ctx).toBe(65536);
    });
});
