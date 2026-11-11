import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { requestResourceManager, RequestResourceManager } from '../core/resources/RequestResourceManager';
import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';
import { describeResourceFault, describeResourceRefusal, resourceFaultCode, resourceRefusalCode } from '../shared/resource-refusal';

/**
 * Second review of round 21: a model call whose deadline passed while it WAITED
 * in the resource queue — nothing sent to the server, nothing admitted — was
 * thrown as RESOURCE_TIMEOUT and reached him as «internal_exception: … ran past
 * its deadline (queue wait included) … it was not refused for lack of
 * resources, and part of the work may have run». All three claims were false.
 *
 * The queue below is the real RequestResourceManager, held by a real heavy
 * admission; the call is the real managed transport.
 */
const GiB = 1024 ** 3;
const roomy = () => new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 8 * GiB, availableBytes: 8 * GiB }), sampleResidentInference: async () => 0 });
const completed = () => new Response(JSON.stringify({ done: true, done_reason: 'stop', message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 5, eval_count: 1 }));
const ask = (guard: RequestResourceManager, fetch: any, timeoutMs: number) => managedOllamaChat({
    baseURL: 'http://127.0.0.1:11434', model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'hi' }], timeoutMs,
}, { resourceManager: guard, fetch });
/** A heavy admission that holds the lane until it is released. */
async function holdTheLane(guard: RequestResourceManager): Promise<{ release: () => void; done: Promise<unknown> }> {
    let release!: () => void;
    let entered!: () => void;
    const admitted = new Promise<void>(resolve => { entered = resolve; });
    const done = guard.withHeavy(() => new Promise<void>(resolve => { release = resolve; entered(); }));
    await admitted;
    return { release, done };
}
const hangs = (_url: unknown, init: any) => new Promise<never>((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true });
});

describe('a queue wait is not a run past its deadline', () => {
    it('a call whose deadline passes in the queue is an admission refusal, with the wait it measured', async () => {
        const guard = roomy();
        const lane = await holdTheLane(guard);
        const fetch = jest.fn(completed);
        const error: any = await ask(guard, fetch, 300).catch(e => e);
        lane.release();
        await lane.done;
        expect(fetch).not.toHaveBeenCalled();
        expect(error.code).toBe('RESOURCE_QUEUE_TIMEOUT');
        expect(error.details.deadlineMs).toBe(300);
        expect(error.details.queueWaitMs).toBeGreaterThanOrEqual(250);
        expect(resourceRefusalCode(error)).toBe('RESOURCE_QUEUE_TIMEOUT');
        expect(resourceFaultCode(error)).toBeNull();
        expect(describeResourceRefusal(error, false)).toMatch(/^RESOURCE_QUEUE_TIMEOUT: The step could not start within the bounded resource queue\..* \(queueWaitMs=\d+, deadlineMs=300\)$/);
        expect(describeResourceRefusal(error, true)).toMatch(/^RESOURCE_QUEUE_TIMEOUT: تعذّر بدء الخطوة/);
    });

    it('reaches him through the tool gateway as a refusal, never as internal_exception', async () => {
        const saved = process.env.ENABLE_AUTH_BYPASS;
        process.env.ENABLE_AUTH_BYPASS = 'true';
        const guard = roomy();
        const lane = await holdTheLane(guard);
        try {
            jest.spyOn(requestResourceManager, 'withHeavy').mockImplementation((async () => ask(guard, jest.fn(completed), 300)) as any);
            const r: any = await executionFirewall.runInContext(`queue-wait-${Date.now()}`,
                () => executeTool('shell_execute', { command: 'npm install' }, { sessionId: 'queue-wait', language: 'en' }));
            expect(r.ok).toBe(false);
            expect(r.error).toMatch(/^RESOURCE_QUEUE_TIMEOUT: The step could not start/);
            expect(r.error).toContain('deadlineMs=300');
            expect(r.error).not.toMatch(/internal_exception|ran past its deadline|part of the work may have run/);
        } finally {
            jest.restoreAllMocks();
            lane.release();
            await lane.done;
            if (saved === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved;
        }
    });

    it('a call the server received and that ran too long is still a timeout fault, and says nothing of a queue', async () => {
        const fetch = jest.fn(hangs);
        const error: any = await ask(roomy(), fetch, 300).catch(e => e);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(error.code).toBe('RESOURCE_TIMEOUT');
        expect(error.details).toMatchObject({ deadlineMs: 300 });
        expect(error.details.runMs).toBeGreaterThanOrEqual(200);
        expect(resourceRefusalCode(error)).toBeNull();
        const sentence = describeResourceFault(error, false)!;
        expect(sentence).toMatch(/^RESOURCE_TIMEOUT: The local model call ran past its deadline after it started/);
        expect(sentence).not.toMatch(/queue wait included/);
        expect(describeResourceFault(error, true)).not.toMatch(/الطابور/);
    });

    it('a call that waited and then was sent is judged by the send: it ran, so it is the timeout', async () => {
        const guard = roomy();
        const lane = await holdTheLane(guard);
        const fetch = jest.fn(hangs);
        const call = ask(guard, fetch, 600).catch(e => e);
        await new Promise(resolve => setTimeout(resolve, 200));
        lane.release();
        await lane.done;
        const error: any = await call;
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(error.code).toBe('RESOURCE_TIMEOUT');
        expect(error.details.queueWaitMs).toBeGreaterThanOrEqual(150);
        expect(error.details.runMs).toBeGreaterThan(0);
    });
});
