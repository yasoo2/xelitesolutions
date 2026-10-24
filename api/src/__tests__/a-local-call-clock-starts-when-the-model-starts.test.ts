import fs from 'fs';
import path from 'path';
import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';

/**
 * Eval round 14, 2026-10-24 (P051): a React build queued seven local calls at
 * once on the single inference lane. Each router deadline was sized for its
 * own work (57 min for a 41k-character prompt) but counted from the moment it
 * entered the queue, so the later calls expired while still waiting
 * (RESOURCE_CANCELLED after 3 424 s queued). The sized deadline now starts
 * when the lane admits the call; the transport says when that is.
 */
const base = { baseURL: 'http://127.0.0.1:11434/v1', model: 'qwen3.5:9b-joe-q4_K_M', messages: [{ role: 'user' as const, content: 'hi' }], timeoutMs: 60_000 };
const answer = () => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 3, eval_count: 1 }));

describe('a local call\'s clock starts when the model starts on it', () => {
    it('the transport reports admission once, after the lane admits and before the request is sent', async () => {
        const order: string[] = [];
        let admit!: () => void;
        const admitted = new Promise<void>(resolve => { admit = resolve; });
        const gate = jest.fn(async (work: any, admission: any) => {
            order.push('queued');
            await admitted;
            order.push('lane-admits');
            return work({ contextTokens: 4096, outputTokens: Math.min(admission.requestedOutputTokens, 4096 - admission.promptEstimatedTokens - 1), signal: admission.signal });
        });
        const fetch = jest.fn(async () => { order.push('request-sent'); return answer(); });
        const onAdmitted = jest.fn(() => order.push('onAdmitted'));
        const pending = managedOllamaChat({ ...base, onAdmitted }, { fetch, resourceManager: { withInference: gate } } as any);
        await new Promise(r => setTimeout(r, 20));
        expect(onAdmitted).not.toHaveBeenCalled();   // still queued: no clock yet
        admit();
        await expect(pending).resolves.toHaveProperty('content', 'ok');
        expect(onAdmitted).toHaveBeenCalledTimes(1);
        expect(order).toEqual(['queued', 'lane-admits', 'onAdmitted', 'request-sent']);
    });

    it('the router starts a local deadline from admission, other providers at once', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'intelligent-router.ts'), 'utf8');
        expect(src).toContain("const deferUntilAdmitted = p.name === 'Local (Auto)';");
        expect(src).toContain('if (!deferUntilAdmitted) startDeadline();');
        expect(src).toContain('p.run(providerAbort.signal, { onAdmitted: startDeadline })');
        expect(src).toContain('onAdmitted: hooks?.onAdmitted,');
        const local = fs.readFileSync(path.join(__dirname, '..', 'core', 'llm', 'providers', 'local.ts'), 'utf8');
        expect(local).toContain('onAdmitted: options?.onAdmitted,');
    });
});
