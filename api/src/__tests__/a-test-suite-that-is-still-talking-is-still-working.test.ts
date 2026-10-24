import fs from 'fs';
import path from 'path';
import { noteTestQuietGap, resetTestQuietForTests, run, testQuietBoundMs } from '../core/quality/terminal-audit';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Round 15 review (C8): app_tests ran under a 45 s wall clock, so a real
 * suite on a CPU laptop that kept printing progress was killed while the same
 * suite passed on a GPU server. The bound is now silence, learned from
 * passing runs and never below the old bound.
 */
jest.setTimeout(60_000);
const node = process.execPath;
const inCtx = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('terminal-audit-quiet', fn);

describe('a test suite that is still talking is still working', () => {
    beforeEach(() => resetTestQuietForTests());

    it('a suite that prints steadily runs past the bound, because the bound is silence', async () => {
        const script = 'let n=0;const t=setInterval(()=>{console.log("step "+(++n));if(n>=8){clearInterval(t);}},250);';
        const r = await inCtx(() => run(node, ['-e', script], process.cwd(), 1000, undefined, true));
        expect(r.ok).toBe(true);
        expect(r.out).toMatch(/step 8/);
        expect(r.longestQuietMs).toBeLessThan(1000);
    });

    it('a silent, hung process is stopped and says why', async () => {
        const r = await inCtx(() => run(node, ['-e', 'console.log("start");setTimeout(()=>{},5000);'], process.cwd(), 800, undefined, true));
        expect(r.ok).toBe(false);
        expect(r.out).toMatch(/no output for 1 s — stopped as hung/);
    });

    it('without idle the old wall clock still applies to the other checks', async () => {
        const script = 'let n=0;const t=setInterval(()=>{console.log(++n);if(n>=8)clearInterval(t);},250);';
        const r = await inCtx(() => run(node, ['-e', script], process.cwd(), 1000));
        expect(r.ok).toBe(false);
    });

    it('the allowed silence learns from passing runs and never drops below the old bound', () => {
        expect(testQuietBoundMs(45_000)).toBe(45_000);
        noteTestQuietGap(20_000);
        expect(testQuietBoundMs(45_000)).toBe(60_000);
        noteTestQuietGap(5_000);
        expect(testQuietBoundMs(45_000)).toBe(60_000);
    });

    it('app_tests uses the silence bound and learns from its passing runs', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'terminal-audit.ts'), 'utf8');
        expect(src).toMatch(/run\(npm, \['test'\], appDir, testQuietBoundMs\(Math\.max\(per, 45_000\)\), say, true\);/);
        expect(src).toMatch(/if \(r\.ok\) noteTestQuietGap\(r\.longestQuietMs\);/);
    });
});
