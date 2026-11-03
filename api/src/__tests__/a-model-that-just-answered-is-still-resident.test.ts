import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import { RequestResourceManager } from '../core/resources/RequestResourceManager';
import { residentInferenceBytes, resetResidentInferenceForTests } from '../core/resources/resident-inference';

/**
 * P001-landing-ar, run-1793050584667 (2026-10-27): a 37-minute local call
 * finished and the next inference, 768 ms later, was refused RESOURCE_LOW_MEMORY
 * with reclaimableBytes 0; the phase's npm install was refused the same way.
 * Residency had last been read when the long call was admitted, before the
 * model loaded, and the probe after the answer missed its deadline. A running
 * inference now re-reads what the server holds, so the next admission knows.
 */
const GiB = 1024 ** 3;
const MODEL = Math.round(5.7 * GiB);
let models: number[] = [];
let busy = false;
let server: http.Server;
const saved = process.env.LOCAL_LLM_BASE_URL;

beforeAll(async () => {
    server = http.createServer((req, res) => {
        if (req.url !== '/api/ps') { res.statusCode = 404; return res.end(); }
        if (busy) return; // never answers: the probe times out
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ models: models.map(size => ({ name: 'qwen3.5:9b-joe-q4_K_M', size })) }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    process.env.LOCAL_LLM_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(async () => {
    if (saved === undefined) delete process.env.LOCAL_LLM_BASE_URL; else process.env.LOCAL_LLM_BASE_URL = saved;
    server.closeAllConnections?.();
    await new Promise<void>(resolve => server.close(() => resolve()));
});
beforeEach(() => { models = []; busy = false; resetResidentInferenceForTests(); });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('a model that just answered is still resident', () => {
    it('the inference after a call that loaded the model counts the model it left loaded', async () => {
        let available = 5 * GiB;
        const manager = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: available, availableBytes: available }),
            sampleResidentInference: residentInferenceBytes, residencyRefreshMs: 100 });
        await manager.withInference(async () => {
            // The model loads during the call and takes the memory it reads as free.
            models = [MODEL];
            available = Math.round(0.9 * GiB);
            await sleep(2600); // past the 2 s probe cache, as a long call is
            busy = true; // the server misses the probe that follows its answer
        }, { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
        await sleep(2100);
        const budget = await manager.withInference(async b => b, { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
        expect(budget.memory.availableBytes).toBe(Math.round(0.9 * GiB));
    }, 15_000);

    it('memory that is really gone is still refused', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 0.5 * GiB, availableBytes: 0.5 * GiB }),
            sampleResidentInference: residentInferenceBytes, residencyRefreshMs: 100 });
        await expect(manager.withInference(async b => b, { promptEstimatedTokens: 100, requestedOutputTokens: 100 }))
            .rejects.toEqual(expect.objectContaining({ code: 'RESOURCE_LOW_MEMORY' }));
    }, 10_000);

    it('the refresh stops with the call', async () => {
        const reads: number[] = [];
        const manager = new RequestResourceManager({ sampleMemory: () => ({ freeBytes: 5 * GiB, availableBytes: 5 * GiB }),
            sampleResidentInference: async () => { reads.push(Date.now()); return 0; }, residencyRefreshMs: 50 });
        await manager.withInference(async () => sleep(300), { promptEstimatedTokens: 100, requestedOutputTokens: 100 });
        const afterCall = reads.length;
        expect(afterCall).toBeGreaterThan(2);
        await sleep(300);
        expect(reads.length).toBe(afterCall);
    }, 10_000);
});
