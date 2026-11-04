/**
 * ⛔ A MACHINE SHORT OF MEMORY IS WAITED FOR, NOT BLAMED ON THE WORK.
 *
 * The 500-prompt exam, 2026-11-04 (P306): a video render elsewhere on the
 * machine left 0.6 GB of the 1 GB a heavy step needs. The program's own tests
 * were refused within a second, four times, and the run ended with «the
 * program's own tests did not pass» — a sentence about the program, for a fact
 * about the machine. Memory another process holds comes back: the heavy step
 * now waits for it, measuring again, saying so, within a bound.
 */
import fs from 'fs';
import path from 'path';
import { RequestResourceManager, ResourceAdmissionError, ResourceEvent } from '../core/resources/RequestResourceManager';

jest.setTimeout(60_000);

const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const reading = (available: number) => ({ totalBytes: 16 * GiB, freeBytes: available, availableBytes: available, rssBytes: 100 * MiB });

describe('a heavy step on a machine short of memory', () => {
    it('waits for memory to come back, says so, and then runs', async () => {
        let readings = 0;
        //  Two readings short, then the other program lets go.
        const manager = new RequestResourceManager({ memoryWaitMs: 30_000, sampleMemory: () => reading(++readings <= 2 ? 600 * MiB : 4 * GiB) });
        const events: ResourceEvent[] = [];
        let ran = false;
        await manager.run({ requestId: 'wait', notify: e => events.push(e) }, () => manager.withHeavy(async () => { ran = true; }));
        expect(ran).toBe(true);
        expect(events.find(e => e.state === 'queued' && e.details?.waitingFor === 'memory')).toMatchObject({ lane: 'heavy', details: { availableBytes: 600 * MiB } });
        expect(events.some(e => e.lane === 'heavy' && e.state === 'started')).toBe(true);
    });

    it('a wait of 0 refuses at once, as before', async () => {
        const manager = new RequestResourceManager({ sampleMemory: () => reading(600 * MiB) });
        const t0 = Date.now();
        await expect(manager.run({ requestId: 'now' }, () => manager.withHeavy(async () => undefined))).rejects.toMatchObject({ code: 'RESOURCE_LOW_MEMORY' });
        expect(Date.now() - t0).toBeLessThan(2_000);
    });

    it('memory that never comes back is refused when the wait is over, with its numbers', async () => {
        const manager = new RequestResourceManager({ memoryWaitMs: 1_500, sampleMemory: () => reading(600 * MiB) });
        const refused = await manager.run({ requestId: 'never' }, () => manager.withHeavy(async () => undefined)).catch(e => e);
        expect(refused).toBeInstanceOf(ResourceAdmissionError);
        expect(refused).toMatchObject({ code: 'RESOURCE_LOW_MEMORY', details: { availableBytes: 600 * MiB } });
    });

    it('a stop during the wait stops it', async () => {
        const manager = new RequestResourceManager({ memoryWaitMs: 30_000, sampleMemory: () => reading(600 * MiB) });
        const stop = new AbortController();
        setTimeout(() => stop.abort(), 300);
        const t0 = Date.now();
        const refused = await manager.run({ requestId: 'stop', signal: stop.signal }, () => manager.withHeavy(async () => undefined)).catch(e => e);
        expect(refused).toMatchObject({ code: 'RESOURCE_CANCELLED' });
        expect(Date.now() - t0).toBeLessThan(5_000);
    });

    it('Joe\'s own manager waits; and a refusal for memory is said as the machine\'s, not the program\'s', () => {
        const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');
        expect(read('core', 'resources', 'RequestResourceManager.ts')).toMatch(/export const requestResourceManager = new RequestResourceManager\(\{\s*memoryWaitMs:/);
        expect(read('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts')).toContain("the program's own tests could not run — the machine, not the program:");
    });
});
