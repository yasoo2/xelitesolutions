import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';
import { residentInferenceBytes, resetResidentInferenceForTests } from '../core/resources/resident-inference';

/**
 * Review r21 (14726945 and the line before it): withHeavy credited the
 * resident model's memory as reclaimable to EVERY heavy tool, so `npm install`
 * was admitted with 0.9 GB really free because a 5.7 GB model was loaded —
 * memory only the next model call can ever get back. And the credit was the
 * model's whole `size`, so on a GPU server, whose model sits in VRAM, the RAM
 * floor was skipped by memory that is not RAM at all.
 *
 * A real loopback /api/ps answers below, as Ollama does (size, size_vram).
 */
const GiB = 1024 ** 3;
let models: Array<{ name: string; size: number; size_vram?: number }> = [];
let server: http.Server;
const saved = process.env.LOCAL_LLM_BASE_URL;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.url !== '/api/ps') { res.statusCode = 404; return res.end(); }
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ models }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
    if (saved === undefined) delete process.env.LOCAL_LLM_BASE_URL; else process.env.LOCAL_LLM_BASE_URL = saved;
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { models = []; resetResidentInferenceForTests(); });

const manager = (availableGiB: number) => new RequestResourceManager({
    sampleMemory: () => ({ totalBytes: 16 * GiB, freeBytes: availableGiB * GiB, availableBytes: availableGiB * GiB }),
    sampleResidentInference: residentInferenceBytes,
});
const call = { promptEstimatedTokens: 200, requestedOutputTokens: 200 };

describe('a resident model is memory only for its own calls', () => {
    it('CPU laptop: an install at 0.9 GB free is refused while the model call beside it is admitted', async () => {
        models = [{ name: 'qwen3.5:9b', size: Math.round(5.7 * GiB), size_vram: 0 }];
        const guard = manager(0.9);
        await expect(guard.withHeavy(async () => 'npm install', { kind: 'tool:shell_execute' }))
            .rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY', details: expect.objectContaining({ reclaimableBytes: 0 }) });
        await expect(guard.withInference(async () => 'answer', call)).resolves.toBe('answer');
    });

    it('a heavy tool that makes a model call inside: the call is credited, the tool\'s own admission is not', async () => {
        models = [{ name: 'qwen3.5:9b', size: Math.round(5.7 * GiB), size_vram: 0 }];
        const guard = manager(0.9);
        // A tool already admitted (it was, at 2 GiB free); memory then drops while it works.
        let available = 2;
        const inside = new RequestResourceManager({
            sampleMemory: () => ({ freeBytes: available * GiB, availableBytes: available * GiB }), sampleResidentInference: residentInferenceBytes,
        });
        await expect(inside.withHeavy(async () => {
            available = 0.9;
            return inside.withInference(async () => 'page section', call);
        }, { kind: 'tool:react_project' })).resolves.toBe('page section');
        await expect(guard.withHeavy(async () => 'npm run build')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
    });

    it('GPU server: a model held in VRAM does not lift the RAM floor', async () => {
        models = [{ name: 'qwen3.5:27b', size: Math.round(18 * GiB), size_vram: Math.round(17.9 * GiB) }];
        await expect(manager(0.5).withInference(async () => 'answer', call)).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        // The RAM part it does hold (0.1 GiB) is still credited to its call.
        resetResidentInferenceForTests();
        expect(await residentInferenceBytes()).toBe(Math.round(18 * GiB) - Math.round(17.9 * GiB));
    });

    it('a reply without size_vram (an older server) is read as all RAM, as before', async () => {
        models = [{ name: 'qwen3.5:9b', size: Math.round(5.7 * GiB) }];
        expect(await residentInferenceBytes()).toBe(Math.round(5.7 * GiB));
    });

    it('many users at once: every install is judged on free memory, every model call on its own credit', async () => {
        models = [{ name: 'qwen3.5:9b', size: Math.round(5.7 * GiB), size_vram: 0 }];
        const guard = manager(0.9);
        // Interleaved, inside the bounded queue (32): no call teaches the guard anything about the next.
        const work = Array.from({ length: 24 }, (_, i) => i % 3 === 0
            ? { kind: 'call', done: guard.withInference(async () => `call-${i}`, call) }
            : { kind: 'install', done: guard.withHeavy(async () => `install-${i}`) });
        const settled = await Promise.allSettled(work.map(w => w.done));
        const outcome = settled.map(r => r.status === 'fulfilled' ? 'ran' : (r.reason as any).code);
        expect(outcome.filter((_, i) => work[i].kind === 'install')).toEqual(Array(16).fill('RESOURCE_LOW_MEMORY'));
        expect(outcome.filter((_, i) => work[i].kind === 'call')).toEqual(Array(8).fill('ran'));
    });
});
