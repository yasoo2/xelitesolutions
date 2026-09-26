import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LongTermMemory } from '../core/memory/long-term-memory';
import {
    clearRecallCache,
    hybridScore,
    rankMemoriesHybrid,
    recallRankedAsync,
    recallTerms,
    termWeights,
} from '../core/memory/recall-rank';

const NOW = 1789900000000;

function entry(content: string, overrides: Partial<{ timestamp: number; importance: number; accessCount: number }> = {}) {
    return {
        content,
        timestamp: overrides.timestamp ?? NOW,
        importance: overrides.importance ?? 0.5,
        accessCount: overrides.accessCount ?? 0,
    };
}

function countingFake(responses: Array<string | Error>): { call: (prompt: string) => Promise<string>; calls: string[] } {
    const calls: string[] = [];
    let index = 0;
    const call = async (prompt: string): Promise<string> => {
        calls.push(prompt);
        const response = responses[Math.min(index++, responses.length - 1)];
        if (response instanceof Error) throw response;
        return response;
    };
    return { call, calls };
}

/** A fake that reads the prompt and ranks the memory containing the marker first. */
function markerFake(marker: string, confidence = 0.9): (prompt: string) => Promise<string> {
    return async (prompt: string): Promise<string> => {
        const match = prompt.match(new RegExp(`(m\\d+)\\. [^\\n]*${marker}`));
        const first = match?.[1] ?? 'm1';
        const ids = Array.from(prompt.matchAll(/^(m\d+)\./gm)).map(hit => hit[1]);
        const ranking = [first, ...ids.filter(id => id !== first)];
        return JSON.stringify({ ranking, confidence });
    };
}

describe('memory-recall-rank', () => {
    const savedRerank = process.env.JOE_MEMORY_RERANK;
    beforeEach(() => {
        clearRecallCache();
        delete process.env.JOE_MEMORY_RERANK;
    });
    afterAll(() => {
        if (savedRerank === undefined) delete process.env.JOE_MEMORY_RERANK;
        else process.env.JOE_MEMORY_RERANK = savedRerank;
    });

    describe('hybrid scoring', () => {
        it('ranks multi-term coverage above a single-term hit', () => {
            const memories = [entry('alpha only here'), entry('alpha beta together here')];
            const ranked = rankMemoriesHybrid(memories, 'alpha beta gamma');
            expect(ranked[0]?.memory.content).toContain('together');
            expect(ranked[0]?.matched).toBe(2);
            expect(ranked[1]?.matched).toBe(1);
        });

        it('weights rare words above words every memory shares', () => {
            const memories = [
                entry('postgres backup schedule'),
                entry('status dashboard colors'),
                entry('status page copy draft'),
            ];
            const weights = termWeights(memories.map(memory => memory.content), recallTerms('postgres status'));
            expect(weights.get('postgres') ?? 0).toBeGreaterThan(weights.get('status') ?? 1);
            const ranked = rankMemoriesHybrid(memories, 'postgres status');
            expect(ranked[0]?.memory.content).toContain('postgres');
        });

        it('keeps the legacy recency/importance/access bonuses', () => {
            const { score: plain } = hybridScore(entry('alpha here', { importance: 0 }), ['alpha'], new Map([['alpha', 1]]), NOW);
            const { score: important } = hybridScore(entry('alpha here', { importance: 1 }), ['alpha'], new Map([['alpha', 1]]), NOW);
            expect(important).toBeGreaterThan(plain);
            const { score: fresh } = hybridScore(entry('alpha here', { timestamp: NOW }), ['alpha'], new Map([['alpha', 1]]), NOW);
            const { score: stale } = hybridScore(
                entry('alpha here', { timestamp: NOW - 30 * 24 * 3600 * 1000 }),
                ['alpha'], new Map([['alpha', 1]]), NOW,
            );
            expect(fresh).toBeGreaterThan(stale);
        });
    });

    describe('relative relevance floor', () => {
        it('drops zero-match memories when another memory matches', async () => {
            const memories = [entry('alpha beta here'), entry('nothing relevant at all')];
            const result = await recallRankedAsync(memories, 'alpha beta', 5, { cacheEnabled: false });
            expect(result.map(memory => memory.content)).toEqual(['alpha beta here']);
        });

        it('falls back to bonus order when nothing matches (tested legacy contract)', async () => {
            const memories = [entry('first stored words'), entry('second stored words')];
            const result = await recallRankedAsync(memories, 'flibbertigibbet supernova', 5, { cacheEnabled: false });
            expect(result).toHaveLength(2);
        });

        it('keeps recency behavior for an empty query', async () => {
            const memories = [
                entry('older words here', { timestamp: NOW - 1000 }),
                entry('newer words here', { timestamp: NOW }),
            ];
            const result = await recallRankedAsync(memories, '', 5, { cacheEnabled: false });
            expect(result.map(memory => memory.content)).toEqual(['newer words here', 'older words here']);
        });
    });

    describe('LLM rerank', () => {
        it('rescues a paraphrased zero-match memory on confident ranking', async () => {
            const memories = [
                entry('demo video rendering queue paused'),
                entry('seed script wipes plus regenerates sample workspace'),
            ];
            const fake = countingFake(['{"ranking":["m2","m1"],"confidence":0.9}']);
            const result = await recallRankedAsync(memories, 'how do I reset the demo data', 5, { llmCall: fake.call });
            expect(result[0]?.content).toContain('seed script');
            expect(fake.calls).toHaveLength(1);
            expect(fake.calls[0]).toContain('seed script');
        });

        it.each([
            ['throws', new Error('provider down')],
            ['garbage', 'not json at all'],
            ['unknown ids only', '{"ranking":["m9"],"confidence":0.99}'],
            ['low confidence', '{"ranking":["m2","m1"],"confidence":0.2}'],
        ])('keeps the hybrid order when the model %s', async (_label, response) => {
            const memories = [
                entry('demo video rendering queue paused'),
                entry('seed script wipes plus regenerates sample workspace'),
            ];
            const fake = countingFake([response as string | Error]);
            const result = await recallRankedAsync(memories, 'how do I reset the demo data', 5, { llmCall: fake.call });
            // Hybrid floor stands: only the overlapping memory survives.
            expect(result.map(memory => memory.content)).toEqual(['demo video rendering queue paused']);
        });

        it('never calls the model when JOE_MEMORY_RERANK=off', async () => {
            process.env.JOE_MEMORY_RERANK = 'off';
            const memories = [entry('alpha here'), entry('beta here')];
            const fake = countingFake(['{"ranking":["m2","m1"],"confidence":0.99}']);
            const result = await recallRankedAsync(memories, 'alpha', 5, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(0);
            expect(result.map(memory => memory.content)).toEqual(['alpha here']);
        });

        it('caches a successful ranking per query', async () => {
            const memories = [entry('alpha here'), entry('beta here')];
            const fake = countingFake(['{"ranking":["m1","m2"],"confidence":0.9}']);
            await recallRankedAsync(memories, 'alpha beta', 5, { llmCall: fake.call });
            await recallRankedAsync(memories, 'alpha beta', 5, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(1);
            clearRecallCache();
            await recallRankedAsync(memories, 'alpha beta', 5, { llmCall: fake.call });
            expect(fake.calls).toHaveLength(2);
        });
    });

    describe('LongTermMemory integration', () => {
        let directory = '';
        let memory: LongTermMemory;

        beforeEach(() => {
            directory = path.join(os.tmpdir(), `joe-recall-rank-${Date.now()}-${Math.random().toString(36).slice(2)}`);
            memory = new LongTermMemory(directory);
        });

        afterEach(async () => {
            await fs.rm(directory, { recursive: true, force: true });
        });

        it('recallRanked rescues paraphrase end to end through injected rerank', async () => {
            await memory.remember('u1', { type: 'fact', content: 'demo video rendering queue paused', metadata: {}, importance: 0.5 });
            await memory.remember('u1', { type: 'fact', content: 'seed script wipes plus regenerates sample workspace', metadata: {}, importance: 0.5 });
            const result = await memory.recallRanked('u1', 'how do I reset the demo data', 5, {}, { llmCall: markerFake('seed script') });
            expect(result[0]?.content).toContain('seed script');
        });

        it('getContextDetails threads rerank options and stays deterministic without them', async () => {
            await memory.remember('u1', { type: 'fact', content: 'demo video rendering queue paused', metadata: {}, importance: 0.5 });
            await memory.remember('u1', { type: 'fact', content: 'seed script wipes plus regenerates sample workspace', metadata: {}, importance: 0.5 });
            const rescued = await memory.getContextDetails('u1', 'how do I reset the demo data', {}, { llmCall: markerFake('seed script') });
            expect(rescued.text).toContain('seed script');
            // A different caller must not inherit the injected call's cache entry.
            clearRecallCache();
            // Without injection the unit-test guard skips the mesh: pure hybrid.
            const hybrid = await memory.getContextDetails('u1', 'how do I reset the demo data', {});
            expect(hybrid.text).toContain('demo video');
            expect(hybrid.text).not.toContain('seed script');
        });

        it('recallRanked preserves the workspace isolation boundary', async () => {
            await memory.remember('u1', {
                type: 'conversation', content: 'deploy the previous project pages', metadata: { workspaceId: 'ws-a' }, importance: 1,
            });
            const same = await memory.recallRanked('u1', 'deploy the project pages', 5, { workspaceId: 'ws-a' });
            expect(same.map(entry => entry.content)).toEqual(['deploy the previous project pages']);
            const other = await memory.recallRanked('u1', 'deploy the project pages', 5, { workspaceId: 'ws-b' });
            expect(other).toEqual([]);
        });

        it('legacy recall() behavior is preserved untouched', async () => {
            await memory.remember('u1', { type: 'fact', content: 'first stored words', metadata: {}, importance: 0.5 });
            await memory.remember('u1', { type: 'fact', content: 'second stored words', metadata: {}, importance: 0.5 });
            // Zero-match query still returns everything, ordered by bonuses.
            const result = await memory.recall('u1', 'flibbertigibbet supernova', 5, {});
            expect(result).toHaveLength(2);
        });
    });
});
