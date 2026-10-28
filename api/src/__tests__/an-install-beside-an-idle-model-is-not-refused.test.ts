import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';
import { releaseResidentInference, residentInferenceBytes, resetResidentInferenceForTests } from '../core/resources/resident-inference';

/**
 * Round 21 (server fork's hand-back): once a resident model's RAM stopped being
 * credited to installs — rightly, nothing gives it back to npm — the owner's
 * 16 GB laptop with qwen3.5:9b resident (5.7 GiB) refused every `npm install`
 * and build with 0.9 GB free while the model sat idle. Ollama unloads a model
 * on request (`keep_alive: 0`) and loads it again for the next call, so heavy
 * work beside an IDLE model has it unloaded instead of being refused — and
 * only then: a model in VRAM, a model call in flight, or memory that unloading
 * could not free leave the refusal as it was.
 *
 * A real loopback server answers /api/ps and the unload as Ollama does; the
 * memory reading follows what it holds.
 */
const GiB = 1024 ** 3;
const OTHER_USE = 9.4 * GiB; // everything on the machine that is not the model
let models: Array<{ name: string; size: number; size_vram?: number }> = [];
let unloads: string[] = [];
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
                if (keep_alive === 0) { unloads.push(model); models = models.filter(m => m.name !== model); }
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
beforeEach(() => { models = []; unloads = []; resetResidentInferenceForTests(); });

/** A 16 GiB machine whose free memory is what the other work and the loaded models leave. */
const machine = () => new RequestResourceManager({
    sampleMemory: () => {
        const ram = models.reduce((sum, m) => sum + Math.max(0, m.size - (m.size_vram || 0)), 0);
        const available = Math.max(0, 16 * GiB - OTHER_USE - ram);
        return { totalBytes: 16 * GiB, freeBytes: available, availableBytes: available };
    },
    sampleResidentInference: residentInferenceBytes,
    releaseResidentInference: () => releaseResidentInference(),
});
const call = { promptEstimatedTokens: 200, requestedOutputTokens: 200 };
const LAPTOP_MODEL = { name: 'qwen3.5:9b', size: Math.round(5.7 * GiB), size_vram: 0 };

describe('an install beside an idle model is not refused', () => {
    it('CPU laptop: the idle model is unloaded and the install runs; the next model call is admitted', async () => {
        models = [{ ...LAPTOP_MODEL }];
        const guard = machine();
        await expect(guard.withHeavy(async () => 'npm install', { kind: 'tool:shell_execute' })).resolves.toBe('npm install');
        expect(unloads).toEqual(['qwen3.5:9b']);
        // The model call that follows loads it again (Ollama's part); here it is admitted on free memory.
        await expect(guard.withInference(async () => 'answer', call)).resolves.toBe('answer');
    });

    it('a model call is never refused or unloaded for itself: its own model is credited', async () => {
        models = [{ ...LAPTOP_MODEL }];
        await expect(machine().withInference(async () => 'answer', call)).resolves.toBe('answer');
        // A call to a compatible server Joe cannot size is a model call too (providers/local.ts).
        await expect(machine().withLocalModelCall(async () => 'answer', { kind: 'compatible-local-inference' })).resolves.toBe('answer');
        expect(unloads).toEqual([]);
    });

    it('work whose heavy parts are model calls is admitted beside the model, which stays loaded (second review)', async () => {
        // project_edit, react_project, a browser action: unloading the model for them
        // only made their own first model call load it again.
        models = [{ ...LAPTOP_MODEL }];
        const guard = machine();
        await expect(guard.withHeavy(async () => 'edit', { kind: 'tool:project_edit', modelBound: true })).resolves.toBe('edit');
        await expect(guard.withHeavy(async () => 'click', { kind: 'tool:browser_click', modelBound: true })).resolves.toBe('click');
        expect(unloads).toEqual([]);
        // …while the install it starts, admitted on its own, still has it unloaded.
        await expect(guard.withHeavy(async () => 'npm install', { kind: 'tool:npm_manager' })).resolves.toBe('npm install');
        expect(unloads).toEqual(['qwen3.5:9b']);
    });

    it('GPU server: a model held in VRAM is not unloaded for an install, and too little RAM is still refused', async () => {
        models = [{ name: 'qwen3.5:27b', size: Math.round(18 * GiB), size_vram: Math.round(18 * GiB) }];
        const guard = new RequestResourceManager({
            sampleMemory: () => ({ totalBytes: 64 * GiB, freeBytes: 0.5 * GiB, availableBytes: 0.5 * GiB }),
            sampleResidentInference: residentInferenceBytes,
            releaseResidentInference: () => releaseResidentInference(),
        });
        await expect(guard.withHeavy(async () => 'npm install')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(unloads).toEqual([]);
    });

    it('only the model in RAM is unloaded; one held in VRAM stays for its users', async () => {
        models = [{ ...LAPTOP_MODEL }, { name: 'embed-gpu', size: Math.round(2 * GiB), size_vram: Math.round(2 * GiB) }];
        await expect(machine().withHeavy(async () => 'npm run build')).resolves.toBe('npm run build');
        expect(unloads).toEqual(['qwen3.5:9b']);
        expect(models.map(m => m.name)).toEqual(['embed-gpu']);
    });

    it('memory that unloading could not free is refused without unloading anything', async () => {
        models = [{ name: 'tiny', size: Math.round(0.05 * GiB), size_vram: 0 }];
        const guard = new RequestResourceManager({
            sampleMemory: () => ({ totalBytes: 16 * GiB, freeBytes: 0.3 * GiB, availableBytes: 0.3 * GiB }),
            sampleResidentInference: residentInferenceBytes,
            releaseResidentInference: () => releaseResidentInference(),
        });
        await expect(guard.withHeavy(async () => 'npm install')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(unloads).toEqual([]);
    });

    it('with memory free, nothing is unloaded', async () => {
        models = [{ ...LAPTOP_MODEL }];
        const guard = new RequestResourceManager({
            sampleMemory: () => ({ totalBytes: 32 * GiB, freeBytes: 8 * GiB, availableBytes: 8 * GiB }),
            sampleResidentInference: residentInferenceBytes,
            releaseResidentInference: () => releaseResidentInference(),
        });
        await expect(guard.withHeavy(async () => 'npm install')).resolves.toBe('npm install');
        expect(unloads).toEqual([]);
    });
});
