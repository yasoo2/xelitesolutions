import { RequestResourceManager, ResourceEvent } from '../core/resources/RequestResourceManager';

/**
 * Eval run500 P001, 2026-10-23: a page build stopped with
 * «generation_failed: RESOURCE_CONTEXT_OVERFLOW» and the event said nothing
 * else — no prompt size, no window — so the cause could only be guessed.
 * A refusal now carries the numbers it was decided on.
 */
const GiB = 1024 ** 3;
const reading = (available: number) => ({ totalBytes: 16 * GiB, freeBytes: available, availableBytes: available, rssBytes: 1 });

describe('a resource refusal says its numbers', () => {
    it('a context overflow reports the prompt, the output and the window', async () => {
        const events: ResourceEvent[] = [];
        const manager = new RequestResourceManager({ sampleMemory: () => reading(GiB), sampleResidentInference: async () => 0 });
        await expect(manager.run({ requestId: 'r1', notify: (e: ResourceEvent) => events.push(e) } as any,
            () => manager.withInference(async () => 'x', { promptEstimatedTokens: 1800, requestedOutputTokens: 512 })))
            .rejects.toMatchObject({ code: 'RESOURCE_CONTEXT_OVERFLOW' });
        const failed = events.find(e => e.state === 'failed' && e.code === 'RESOURCE_CONTEXT_OVERFLOW');
        expect(failed?.details).toMatchObject({ promptEstimatedTokens: 1800, requestedOutputTokens: 512, contextTokens: 2048 });
    });

    it('a low-memory refusal reports what was available and reclaimable', async () => {
        const events: ResourceEvent[] = [];
        const manager = new RequestResourceManager({ sampleMemory: () => reading(512 * 1024 ** 2), sampleResidentInference: async () => 0 });
        await expect(manager.run({ requestId: 'r2', notify: (e: ResourceEvent) => events.push(e) } as any,
            () => manager.withHeavy(async () => 'x'))).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        const failed = events.find(e => e.state === 'failed' && e.code === 'RESOURCE_LOW_MEMORY');
        expect(failed?.details).toMatchObject({ availableBytes: 512 * 1024 ** 2, reclaimableBytes: 0 });
    });
});
