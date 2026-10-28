import http from 'http';
import type { AddressInfo } from 'net';
import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { requestResourceManager, RequestResourceManager } from '../core/resources/RequestResourceManager';
import { managedOllamaChat } from '../core/llm/providers/managed-ollama-chat';

/**
 * Review r21 (578e2dbe): ToolService turned EVERY RESOURCE_* code into «the
 * step did not start: the resource guard refused it». Only an admission
 * refusal means that. RESOURCE_CLEANUP_FAILED is thrown after the work ran;
 * RESOURCE_TIMEOUT when a local model call ran past its deadline; REENTRANT,
 * SCOPE_*, HEAVY_DEPTH_LIMIT guard against a fault in Joe's own call order.
 * Each error below is thrown by the real guard (or the real managed model
 * call against a real loopback server) and reaches him through the real
 * executeTool.
 */
const GiB = 1024 ** 3;
const roomy = () => new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 8 * GiB, availableBytes: 8 * GiB }), sampleResidentInference: async () => 0 });
const DID_NOT_START = /did not start|لم تبدأ|refused it/;

let hanging: http.Server;
let hangingPort = 0;
let chatRequests = 0;

describe('a resource fault is not called a refusal', () => {
    const saved = process.env.ENABLE_AUTH_BYPASS;
    beforeAll(async () => {
        process.env.ENABLE_AUTH_BYPASS = 'true';
        // A local model server that takes the request and never answers in time.
        hanging = http.createServer(req => { if (req.url === '/api/chat') chatRequests++; });
        await new Promise<void>(resolve => hanging.listen(0, '127.0.0.1', resolve));
        hangingPort = (hanging.address() as AddressInfo).port;
    });
    afterAll(async () => {
        if (saved === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = saved;
        hanging.closeAllConnections?.();
        await new Promise<void>(resolve => hanging.close(() => resolve()));
    });
    afterEach(() => jest.restoreAllMocks());

    const throughTheTool = (work: () => Promise<unknown>, context: any = { sessionId: `fault-${Date.now()}`, language: 'en' }) => {
        jest.spyOn(requestResourceManager, 'withHeavy').mockImplementation((async () => work()) as any);
        return executionFirewall.runInContext(`fault-${Date.now()}`,
            () => executeTool('shell_execute', { command: 'npm install' }, context)) as Promise<any>;
    };

    it('cleanup that failed after the work ran stays internal_exception and says the work ran', async () => {
        const guard = roomy();
        let ran = false;
        const r = await throughTheTool(() => guard.run({ requestId: 'cleanup' }, async () => {
            guard.registerCleanup(() => { throw new Error('handle already closed'); });
            ran = true;
            return 'done';
        }));
        expect(ran).toBe(true);
        expect(r.ok).toBe(false);
        expect(r.error).toMatch(/^internal_exception: RESOURCE_CLEANUP_FAILED: The step ran, but releasing/);
        expect(r.error).toContain('count=1');
        expect(r.error).not.toMatch(DID_NOT_START);
    });

    it('a local model call that ran past its deadline is a timeout, not a refusal', async () => {
        const guard = roomy();
        // The managed call's own request, sent over real HTTP to the server above.
        const send = (_url: unknown, init: any) => new Promise<never>((_resolve, reject) => {
            const req = http.request(`http://127.0.0.1:${hangingPort}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' } });
            req.on('error', reject);
            req.end(init.body);
            init.signal.addEventListener('abort', () => { req.destroy(); reject(new Error('aborted')); }, { once: true });
        });
        const r = await throughTheTool(() => managedOllamaChat({
            baseURL: 'http://127.0.0.1:11434', model: 'qwen3.5:9b', messages: [{ role: 'user', content: 'hi' }], timeoutMs: 1500,
        }, { resourceManager: guard, fetch: send as any }));
        expect(chatRequests).toBe(1); // the call was admitted and sent: inference ran
        expect(r.error).toMatch(/^internal_exception: RESOURCE_TIMEOUT: The local model call ran past its deadline/);
        expect(r.error).not.toMatch(DID_NOT_START);
    });

    it('guards against Joe\'s own call order are faults, in his language', async () => {
        const guard = roomy();
        const reentrant = await throughTheTool(() => guard.withInference(
            () => guard.withInference(async () => 'inner', { promptEstimatedTokens: 10, requestedOutputTokens: 10 }),
            { promptEstimatedTokens: 10, requestedOutputTokens: 10 }));
        expect(reentrant.error).toMatch(/^internal_exception: RESOURCE_INFERENCE_REENTRANT: An internal resource-guard check failed/);

        const unscoped = await throughTheTool(async () => guard.registerCleanup(() => undefined),
            { sessionId: 'fault-ar', language: 'ar' });
        expect(unscoped.error).toMatch(/^internal_exception: RESOURCE_SCOPE_REQUIRED: فشل فحصٌ داخليّ في حارس الموارد/);

        const nest = (n: number): Promise<string> => guard.withHeavy(() => n ? nest(n - 1) : Promise.resolve('deep'));
        const deep = await throughTheTool(() => nest(20));
        expect(deep.error).toMatch(/^internal_exception: RESOURCE_HEAVY_DEPTH_LIMIT: .*\(maximumDepth=16\)$/);
        for (const r of [reentrant, unscoped, deep]) expect(r.error).not.toMatch(DID_NOT_START);
    });

    it('a real admission refusal is still a refusal, with no internal_exception', async () => {
        const full = new RequestResourceManager({ maxQueued: 0, sampleMemory: () => ({ freeBytes: 8 * GiB, availableBytes: 8 * GiB }), sampleResidentInference: async () => 0 });
        let release!: () => void;
        const holder = full.withHeavy(() => new Promise<void>(resolve => { release = resolve; }));
        await new Promise(resolve => setImmediate(resolve));
        const queueFull = await throughTheTool(() => full.withHeavy(async () => 'second'));
        release();
        await holder;
        expect(queueFull.error).toMatch(/^RESOURCE_QUEUE_FULL: The step could not start within the bounded resource queue/);

        const overflow = await throughTheTool(() => roomy().withInference(async () => 'x', { promptEstimatedTokens: 10_000_000, requestedOutputTokens: 10 }));
        expect(overflow.error).toMatch(/^RESOURCE_CONTEXT_OVERFLOW: /);
        for (const r of [queueFull, overflow]) expect(r.error).not.toMatch(/internal_exception/);
    });
});
