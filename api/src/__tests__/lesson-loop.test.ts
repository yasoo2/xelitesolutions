import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { RepairMemory, type RepairRecord } from '../core/memory/repair-memory';
import {
    appendLessons,
    buildLessonContext,
    findSimilarCures,
    rankCures,
} from '../core/memory/lesson-loop';

function record(overrides: Partial<RepairRecord> = {}): RepairRecord {
    return {
        signature: 'cannot find module <path>',
        errorSample: "Cannot find module 'sharp'",
        repair: 'npm install sharp, then rerun',
        wins: 1,
        lastAt: new Date().toISOString(),
        ...overrides,
    };
}

describe('cross-run lesson loop', () => {
    let directory = '';
    let store: RepairMemory;

    beforeEach(() => {
        directory = path.join(os.tmpdir(), `joe-lesson-loop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        store = new RepairMemory(directory);
    });

    afterEach(async () => {
        await fs.rm(directory, { recursive: true, force: true });
    });

    describe('fuzzy cure retrieval', () => {
        it('finds the cure for a reworded error that exact recall misses', async () => {
            await store.recordRepair("Cannot find module 'sharp' required by image pipeline", 'npm install --save sharp, then rerun the phase');
            await store.recordRepair('EACCES permission denied while writing cache directory', 'clear the cache directory and retry');

            const paraphrase = 'the image pipeline cannot locate the sharp package dependency';
            expect(store.recallRepair(paraphrase)).toBeNull(); // exact signature: no match
            const similar = findSimilarCures(store, paraphrase);
            expect(similar[0]?.record.repair).toContain('npm install --save sharp');
            expect(similar[0]?.matched).toBeGreaterThan(0);
        });

        it('returns nothing when no cure matches', async () => {
            await store.recordRepair("Cannot find module 'sharp'", 'npm install sharp');
            expect(findSimilarCures(store, 'how do I bake sourdough')).toEqual([]);
            expect(buildLessonContext(store, 'how do I bake sourdough')).toBe('');
        });

        it('prefers proven cures over one-shot cures on equal matches', () => {
            const oneShot = record({ repair: 'one-shot fix', wins: 1 });
            const proven = record({ repair: 'proven fix', wins: 5 });
            const ranked = rankCures([oneShot, proven], 'cannot find module sharp');
            expect(ranked[0]?.record.repair).toBe('proven fix');
        });

        it('excludes cures untouched for over 90 days', () => {
            const stale = record({ lastAt: new Date(Date.now() - 100 * 86400000).toISOString() });
            const fresh = record({ repair: 'fresh fix' });
            const ranked = rankCures([stale, fresh], 'cannot find module sharp');
            expect(ranked.map(entry => entry.record.repair)).toEqual(['fresh fix']);
        });
    });

    describe('lesson context block', () => {
        it('formats cures as labeled planner context, capped at three', async () => {
            await store.recordRepair("Cannot find module 'aaa'", 'install aaa');
            await store.recordRepair("Cannot find module 'bbb'", 'install bbb');
            await store.recordRepair("Cannot find module 'ccc'", 'install ccc');
            await store.recordRepair("Cannot find module 'ddd'", 'install ddd');
            const block = buildLessonContext(store, 'cannot find module');
            expect(block).toContain('LESSONS FROM PREVIOUS RUNS');
            expect(block).toContain('proven 1x');
            expect(block.split('\n').filter(line => line.startsWith('- '))).toHaveLength(3);
        });

        it('appendLessons extends context or returns input unchanged', async () => {
            await store.recordRepair("Cannot find module 'sharp'", 'npm install sharp');
            const extended = appendLessons('memory text', store, 'cannot find module sharp');
            expect(extended).toContain('memory text');
            expect(extended).toContain('LESSONS FROM PREVIOUS RUNS');
            expect(appendLessons('memory text', store, 'unrelated sourdough query')).toBe('memory text');
            expect(appendLessons('', store, 'cannot find module sharp')).toContain('LESSONS FROM PREVIOUS RUNS');
            expect(appendLessons('memory text', null as any, 'cannot find module')).toBe('memory text');
        });
    });

    describe('cross-run persistence', () => {
        it('a cure recorded in one run is retrievable from a fresh instance', async () => {
            await store.recordRepair("Cannot find module 'sharp' required by image pipeline", 'npm install --save sharp');
            const freshInstance = new RepairMemory(directory); // a later run / process
            expect(freshInstance.all()).toHaveLength(1);
            const similar = findSimilarCures(freshInstance, 'image pipeline cannot locate sharp package');
            expect(similar[0]?.record.repair).toContain('npm install --save sharp');
            const block = buildLessonContext(freshInstance, 'image pipeline cannot locate sharp package');
            expect(block).toContain('npm install --save sharp');
        });

        it('additive failures never break the caller', () => {
            expect(findSimilarCures(null as any, 'anything')).toEqual([]);
            expect(buildLessonContext(undefined as any, 'anything')).toBe('');
            expect(rankCures([], '')).toEqual([]);
        });
    });
});
