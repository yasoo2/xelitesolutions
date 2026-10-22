import { managedOllamaChat, ManagedOllamaChatOptions, ManagedOllamaDependencies } from '../core/llm/providers/managed-ollama-chat';

/**
 * Eval round 2, 2026-10-22 (L3-cli): ai_write_file asked for 6000 output
 * tokens of a 4096-token context and the call failed before inference with
 * «Output tokens must be positive and below the managed context ceiling» —
 * every non-frontend file Joe authored locally died the same way. The output
 * now gets the room the measured prompt leaves.
 */
const base: ManagedOllamaChatOptions = {
    baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M',
    messages: [{ role: 'user', content: 'Write wordcount.js' }], timeoutMs: 1000,
};
const completed = { done: true, done_reason: 'stop', message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 30, eval_count: 3 };

function harness() {
    const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify(completed)));
    // The gate admits exactly what it is asked for, inside a 4096 context.
    const gate = jest.fn(async (work: any, admission: any) => work({
        contextTokens: 4096, outputTokens: admission.requestedOutputTokens, signal: new AbortController().signal,
    }));
    const dependencies: ManagedOllamaDependencies = { fetch, resourceManager: { withInference: gate } as any };
    return { fetch, gate, dependencies };
}

describe('an output wish larger than the context is fitted, not fatal', () => {
    it('6000 requested in a 4096 context is served with the room the prompt leaves', async () => {
        const { fetch, gate, dependencies } = harness();
        await expect(managedOllamaChat({ ...base, maxContextTokens: 4096, maxCompletionTokens: 6000 }, dependencies)).resolves.toMatchObject({ content: 'ok' });
        const requested = gate.mock.calls[0][1].requestedOutputTokens;
        const prompt = gate.mock.calls[0][1].promptEstimatedTokens;
        expect(requested).toBeLessThan(4096);
        expect(requested + prompt).toBeLessThanOrEqual(4096);
        expect(JSON.parse(fetch.mock.calls[0][1].body).options.num_predict).toBe(requested);
    });

    it('a request that already fits is not changed', async () => {
        const { gate, dependencies } = harness();
        await managedOllamaChat({ ...base, maxCompletionTokens: 1200 }, dependencies);
        expect(gate.mock.calls[0][1].requestedOutputTokens).toBe(1200);
    });

    it('a prompt that leaves no room for an answer is still a real overflow', async () => {
        const { fetch, dependencies } = harness();
        const huge = { ...base, messages: [{ role: 'user', content: 'x '.repeat(6000) }] };
        await expect(managedOllamaChat({ ...huge, maxContextTokens: 4096, maxCompletionTokens: 6000 }, dependencies)).rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('a non-integer or non-positive wish is still rejected', async () => {
        const { dependencies } = harness();
        for (const bad of [0, -5, 12.5]) {
            await expect(managedOllamaChat({ ...base, maxCompletionTokens: bad }, dependencies)).rejects.toMatchObject({ code: 'OLLAMA_OUTPUT_INPUT' });
        }
    });
});

import { RequestResourceManager } from '../core/resources/RequestResourceManager';

describe('the admitted window, not the requested ceiling, decides the room', () => {
    const GiB = 1024 ** 3;
    const reading = (available: number) => ({ totalBytes: 16 * GiB, freeBytes: available, availableBytes: available, rssBytes: 1 });
    it('a 5.5k-token planner prompt gets an answer inside an 8192 window', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading(5 * GiB), sampleResidentInference: async () => 0 });
        await manager.withInference(async budget => {
            expect(budget.contextTokens).toBe(8192);
            expect(budget.outputTokens).toBe(8192 - 5500 - 1);
        }, { promptEstimatedTokens: 5500, requestedOutputTokens: 6000, fitOutputToContext: true });
    });
    it('without the opt-in the manager still refuses rather than shrinking', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading(5 * GiB), sampleResidentInference: async () => 0 });
        await expect(manager.withInference(async () => 'x', { promptEstimatedTokens: 5500, requestedOutputTokens: 6000 }))
            .rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
    });
});
