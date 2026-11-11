import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { executeTool } from '../modules/services/ToolService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { requestResourceManager, RequestResourceManager } from '../core/resources/RequestResourceManager';
import { releaseResidentInference, residentInferenceBytes, resetResidentInferenceForTests } from '../core/resources/resident-inference';
import { describeResourceRefusal } from '../shared/resource-refusal';

/**
 * Second review of round 21: heavy work beside an idle model has the model
 * unloaded when that would clear the memory floor. On a machine where the
 * memory does not come back where it is read — Linux maps the weights from the
 * file, so they were already counted as available; a container's limit does
 * not see a host server — the heavy lane was held ~10.4 s, then the refusal
 * said reclaimableBytes 0 and «No other application was stopped». The model
 * HAD been unloaded, and he was not told.
 *
 * A real loopback server answers /api/ps and the unload as Ollama does (a model
 * leaves the listing once unloaded). The memory reading below does not rise
 * when it leaves: the machine where the weights were already counted.
 */
const GiB = 1024 ** 3;
const MODEL = { name: 'qwen3.5:9b', size: Math.round(5.7 * GiB), size_vram: 0 };
let models: Array<{ name: string; size: number; size_vram?: number }> = [];
let unloads: string[] = [];
/** When false, the server takes the unload and keeps listing the model (it is busy for another client). */
let dropsOnUnload = true;
let server: http.Server;
const saved = process.env.LOCAL_LLM_BASE_URL;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method === 'GET' && req.url === '/api/ps') return res.end(JSON.stringify({ models }));
        if (req.method === 'POST' && req.url === '/api/generate') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
                const { model, keep_alive } = JSON.parse(body);
                if (keep_alive === 0) {
                    unloads.push(model);
                    if (dropsOnUnload) models = models.filter(m => m.name !== model);
                }
                res.end(JSON.stringify({ model, done: true, done_reason: 'unload' }));
            });
            return;
        }
        res.statusCode = 404;
        res.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
    if (saved === undefined) delete process.env.LOCAL_LLM_BASE_URL; else process.env.LOCAL_LLM_BASE_URL = saved;
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { models = [{ ...MODEL }]; unloads = []; dropsOnUnload = true; resetResidentInferenceForTests(); });
afterEach(() => jest.restoreAllMocks());

/** 0.9 GiB free whatever the server holds: unloading gives nothing back here. */
const machineThatKeepsTheCache = () => new RequestResourceManager({
    sampleMemory: () => ({ totalBytes: 16 * GiB, freeBytes: 0.9 * GiB, availableBytes: 0.9 * GiB }),
    sampleResidentInference: residentInferenceBytes,
    releaseResidentInference: () => releaseResidentInference(),
});

describe('an unload that gave nothing back says so', () => {
    it('refuses right after the server confirms, carrying what was unloaded and what came back', async () => {
        const started = Date.now();
        const error: any = await machineThatKeepsTheCache().withHeavy(async () => 'npm install', { kind: 'tool:shell_execute' }).catch(e => e);
        const heldMs = Date.now() - started;
        expect(unloads).toEqual(['qwen3.5:9b']);
        expect(error.code).toBe('RESOURCE_LOW_MEMORY');
        expect(error.details).toMatchObject({ unloadedModels: 1, releasedBytes: MODEL.size, recoveredBytes: 0, unloadConfirmed: 1,
            availableBytes: 0.9 * GiB });
        // The base code held the heavy lane ~10.4 s for memory that never came back.
        expect(heldMs).toBeLessThan(5000);
    }, 30_000); // room for the old ten-second wait to be measured, not cut by the runner

    it('his sentence says the model was asked to unload, in both languages', async () => {
        const error: any = await machineThatKeepsTheCache().withHeavy(async () => 'npm install').catch(e => e);
        const en = describeResourceRefusal(error, false)!;
        expect(en).toMatch(/^RESOURCE_LOW_MEMORY: The heavy step could not start because available memory is insufficient\. The local model server was asked to unload its idle model/);
        expect(en).toContain(`releasedBytes=${MODEL.size}`);
        expect(en).toContain('unloadedModels=1');
        const ar = describeResourceRefusal(error, true)!;
        expect(ar).toContain('إفراغ نموذجه الخامل');
    });

    it('reaches him through the tool gateway with that sentence and its numbers', async () => {
        const savedBypass = process.env.ENABLE_AUTH_BYPASS;
        process.env.ENABLE_AUTH_BYPASS = 'true';
        try {
            const guard = machineThatKeepsTheCache();
            jest.spyOn(requestResourceManager, 'withHeavy').mockImplementation((work: any, options: any) => guard.withHeavy(work, options));
            const r: any = await executionFirewall.runInContext(`unload-${Date.now()}`,
                () => executeTool('shell_execute', { command: 'npm install' }, { sessionId: 'unload-nothing-back', language: 'en' }));
            expect(r.ok).toBe(false);
            expect(r.error).toMatch(/^RESOURCE_LOW_MEMORY: .*asked to unload its idle model/);
            expect(r.error).toContain('unloadConfirmed=1');
            expect(r.error).not.toMatch(/internal_exception/);
        } finally {
            if (savedBypass === undefined) delete process.env.ENABLE_AUTH_BYPASS; else process.env.ENABLE_AUTH_BYPASS = savedBypass;
        }
    });

    it('a server that never drops the model is waited for a bounded time and said as unconfirmed', async () => {
        dropsOnUnload = false;
        const error: any = await machineThatKeepsTheCache().withHeavy(async () => 'npm install').catch(e => e);
        expect(unloads).toEqual(['qwen3.5:9b']);
        expect(error.code).toBe('RESOURCE_LOW_MEMORY');
        expect(error.details).toMatchObject({ unloadedModels: 1, releasedBytes: MODEL.size, unloadConfirmed: 0 });
        expect(describeResourceRefusal(error, false)).toContain('was asked to unload');
    }, 30_000);

    it('a plain refusal, with nothing unloaded, keeps its own sentence', async () => {
        models = [];
        const error: any = await machineThatKeepsTheCache().withHeavy(async () => 'npm install').catch(e => e);
        expect(unloads).toEqual([]);
        expect(error.details.releasedBytes).toBeUndefined();
        expect(describeResourceRefusal(error, false)).toMatch(/^RESOURCE_LOW_MEMORY: The heavy step could not start because available memory is insufficient or could not be measured\. No other application was stopped\./);
    });
});
