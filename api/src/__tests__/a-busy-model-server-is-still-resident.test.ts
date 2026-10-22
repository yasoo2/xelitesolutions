import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { residentInferenceBytes, resetResidentInferenceForTests } from '../core/resources/resident-inference';

/**
 * Eval round 2, 2026-10-22: a repair step right after an aborted generation
 * stopped with RESOURCE_LOW_MEMORY in 8 ms. Ollama, busy on the CPU, missed the
 * 750 ms /api/ps deadline, the probe read 0, and the resident 5.7 GiB model was
 * counted as taken again. A missed probe now reuses the last answer briefly.
 */
const GiB = 1024 ** 3;
let mode: 'answer' | 'busy' = 'answer';
let server: http.Server;
const saved = process.env.LOCAL_LLM_BASE_URL;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.url !== '/api/ps') { res.statusCode = 404; return res.end(); }
        if (mode === 'busy') return; // never answers: the probe times out
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ models: [{ name: 'qwen3.5:9b-joe-q4_K_M', size: Math.round(5.7 * GiB) }] }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
    if (saved === undefined) delete process.env.LOCAL_LLM_BASE_URL; else process.env.LOCAL_LLM_BASE_URL = saved;
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { mode = 'answer'; resetResidentInferenceForTests(); });

const waitPastCache = () => new Promise(resolve => setTimeout(resolve, 2100));

describe('a busy model server is still holding its model', () => {
    it('reads the resident size the server reports', async () => {
        expect(await residentInferenceBytes()).toBe(Math.round(5.7 * GiB));
    });

    it('a probe the busy server misses reuses its last answer', async () => {
        await residentInferenceBytes();
        mode = 'busy';
        await waitPastCache();
        expect(await residentInferenceBytes()).toBe(Math.round(5.7 * GiB));
    }, 10_000);

    it('with no answer ever given, a missed probe is nothing reclaimable', async () => {
        mode = 'busy';
        expect(await residentInferenceBytes()).toBe(0);
    }, 10_000);
});
