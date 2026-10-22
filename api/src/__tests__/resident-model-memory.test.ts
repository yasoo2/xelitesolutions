import { RequestResourceManager } from '../core/resources/RequestResourceManager';

/**
 * Measured 2026-10-22 on the owner's 16 GB laptop: with qwen3.5:9b resident in
 * Ollama (5.7 GiB) free RAM read ~0.9 GB and every build stopped with
 * RESOURCE_LOW_MEMORY before planning. The memory the floor "protected" was the
 * model that would serve the call. A resident model is reused or evicted for
 * the next inference, so its bytes count toward what the inference can use.
 */
const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const reading = (available: number) => ({ totalBytes: 16 * GiB, freeBytes: available, availableBytes: available, rssBytes: 100 * MiB });
const owner = () => reading(900 * MiB);
const resident = async () => 5.7 * GiB;

describe('a resident local model is not memory taken from its own inference', () => {
    it('the floor still refuses 900 MiB when nothing is resident', async () => {
        const manager = new RequestResourceManager({ sampleMemory: owner, sampleResidentInference: async () => 0 });
        await expect(manager.withHeavy(async () => 'ran')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
    });

    it('the owner\'s measured state is admitted once the resident model is counted', async () => {
        const manager = new RequestResourceManager({ sampleMemory: owner, sampleResidentInference: resident });
        await expect(manager.withHeavy(async () => 'ran')).resolves.toBe('ran');
    });

    it('the context tier is chosen from the same usable memory, not the 2048 floor', async () => {
        // 0.9 GiB free + 5.7 GiB resident = 6.6 GiB usable -> the 8192 tier.
        const manager = new RequestResourceManager({ sampleMemory: owner, sampleResidentInference: resident });
        await manager.withInference(async budget => { expect(budget.contextTokens).toBe(8192); },
            { promptEstimatedTokens: 3000, requestedOutputTokens: 512 });
    });

    it('a probe that fails or lies reads as nothing reclaimable', async () => {
        for (const probe of [async () => { throw new Error('ollama down'); }, async () => -5, async () => NaN]) {
            const manager = new RequestResourceManager({ sampleMemory: owner, sampleResidentInference: probe as any });
            await expect(manager.withHeavy(async () => 'ran')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        }
    });

    it('an injected memory reading never asks a live server', async () => {
        const manager = new RequestResourceManager({ sampleMemory: owner });
        await expect(manager.withHeavy(async () => 'ran')).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
    });
});
