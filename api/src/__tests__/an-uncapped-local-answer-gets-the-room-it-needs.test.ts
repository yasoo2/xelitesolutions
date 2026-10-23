import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';
import { uncappedLocalOutputTokens } from '../core/llm/intelligent-router';

/**
 * Eval round 7, 2026-10-23: every page section called the local model with no
 * output cap; the managed transport defaulted to 512 tokens, and the section
 * ended after 21 minutes as LOCAL_COMPLETION_LIMIT. One HTML section is longer
 * than 512 tokens on any machine. An answer with no cap gets the room the
 * window leaves its prompt, and its deadline is sized for that room.
 */
const base = { baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M', messages: [{ role: 'user' as const, content: 'Write the services section.' }], timeoutMs: 5000 };

describe('an uncapped local answer gets the room it needs', () => {
    it('no cap asks for the window\'s room, not 512 tokens', async () => {
        const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: '<section></section>' }, prompt_eval_count: 10, eval_count: 5 })));
        const gate = jest.fn(async (work: any, admission: any) => work({ contextTokens: 8192, outputTokens: Math.min(admission.requestedOutputTokens, 8192 - admission.promptEstimatedTokens - 1), signal: admission.signal }));
        await managedOllamaChat({ ...base, maxContextTokens: 8192 }, { fetch, resourceManager: { withInference: gate } } as any);
        const asked = gate.mock.calls[0][1];
        expect(asked.requestedOutputTokens).toBe(8192 - asked.promptEstimatedTokens - 1);
        expect(JSON.parse(fetch.mock.calls[0][1].body).options.num_predict).toBe(8192 - asked.promptEstimatedTokens - 1);
    });

    it('a caller\'s own cap is still honoured', async () => {
        const fetch = jest.fn().mockResolvedValue(new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: 'x' }, prompt_eval_count: 10, eval_count: 1 })));
        const gate = jest.fn(async (work: any, admission: any) => work({ contextTokens: 8192, outputTokens: admission.requestedOutputTokens, signal: admission.signal }));
        await managedOllamaChat({ ...base, maxCompletionTokens: 120 }, { fetch, resourceManager: { withInference: gate } } as any);
        expect(gate.mock.calls[0][1].requestedOutputTokens).toBe(120);
    });

    it('the deadline of an uncapped call is sized for the room, not for 1024 tokens', () => {
        expect(uncappedLocalOutputTokens([{ role: 'system', content: 'x'.repeat(3 * 3600) }])).toBeGreaterThan(10_000);
        expect(uncappedLocalOutputTokens([{ role: 'system', content: 'x'.repeat(3 * 16000) }])).toBe(1024);
    });
});
