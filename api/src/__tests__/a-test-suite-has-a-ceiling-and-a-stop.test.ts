import fs from 'fs';
import os from 'os';
import path from 'path';
import { noteTestQuietGap, resetTestQuietForTests, run, testCeilingMs, testQuietBoundMs } from '../core/quality/terminal-audit';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Round 15 review, findings 31, 40 and 45: with the silence bound, a suite
 * that never exits but keeps printing (a retry loop that logs every second, a
 * server it started and never closed) held react_project forever, and the
 * owner's stop could not end it. And the learned silence was one
 * process-wide number: one tenant's slow passing suite raised every other
 * tenant's hang bound on a shared server.
 */
jest.setTimeout(60_000);
const node = process.execPath;
const inCtx = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('terminal-audit-ceiling', fn);
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });
const aDir = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-quiet-')); dirs.push(d); return d; };
const CHATTY_FOREVER = 'setInterval(()=>console.log("waiting for server…"),200);';

describe('a test suite has a ceiling and a stop', () => {
    beforeEach(() => resetTestQuietForTests());

    it('a suite that logs forever is stopped at the ceiling, though it is never silent', async () => {
        const started = Date.now();
        // Silence bound 5 s (node's own start-up counts as silence on a loaded machine), ceiling 8 s.
        const r = await inCtx(() => run(node, ['-e', CHATTY_FOREVER], process.cwd(), 5000, undefined, true, { ceilingMs: 8000 }));
        expect(r.ok).toBe(false);
        expect(r.out).toMatch(/waiting for server/);
        expect(r.out).toMatch(/still running after 8 s — stopped at the ceiling/);
        expect(Date.now() - started).toBeLessThan(20_000);
    });

    it('the owner\'s stop ends a running suite', async () => {
        const cancel = new Promise<void>(resolve => setTimeout(resolve, 3000));
        const r = await inCtx(() => run(node, ['-e', CHATTY_FOREVER], process.cwd(), 10_000, undefined, true, { ceilingMs: 30_000, cancel }));
        expect(r.ok).toBe(false);
        expect(r.out).toMatch(/stopped: the run was cancelled/);
    });

    it('a passing suite still runs to its end inside the ceiling', async () => {
        const script = 'let n=0;const t=setInterval(()=>{console.log("step "+(++n));if(n>=6){clearInterval(t);}},200);';
        const r = await inCtx(() => run(node, ['-e', script], process.cwd(), 5000, undefined, true, { ceilingMs: 20_000 }));
        expect(r.ok).toBe(true);
        expect(r.out).toMatch(/step 6/);
    });

    it('start-up is not a hang: the silence before the first line gets a bounded grace, and only that one', async () => {
        const lateStart = 'setTimeout(()=>{console.log("ready");},1800);';
        const late = await inCtx(() => run(node, ['-e', lateStart], process.cwd(), 1000, undefined, true));
        expect(late.ok).toBe(true);
        const thenSilent = 'console.log("start");setTimeout(()=>{console.log("late");},2600);';
        const silent = await inCtx(() => run(node, ['-e', thenSilent], process.cwd(), 1000, undefined, true));
        expect(silent.ok).toBe(false);
        expect(silent.out).toMatch(/no output for 1 s — stopped as hung/);
    });

    it('the learned silence belongs to one project, and is capped', () => {
        const a = aDir(), b = aDir();
        noteTestQuietGap(20_000, a);
        expect(testQuietBoundMs(45_000, a)).toBe(60_000);
        expect(testQuietBoundMs(45_000, b)).toBe(45_000);
        expect(testQuietBoundMs(45_000)).toBe(45_000);
        noteTestQuietGap(5_000, a);
        expect(testQuietBoundMs(45_000, a)).toBe(60_000);
        noteTestQuietGap(10 * 60_000, a);
        expect(testQuietBoundMs(45_000, a)).toBe(5 * 60_000);
        noteTestQuietGap(20_000);
        expect(testQuietBoundMs(45_000, b)).toBe(45_000);
    });

    it('the ceiling is ten silences, or the operator\'s setting', () => {
        const saved = process.env.JOE_APP_TEST_MAX_MS;
        try {
            delete process.env.JOE_APP_TEST_MAX_MS;
            expect(testCeilingMs(45_000)).toBe(450_000);
            process.env.JOE_APP_TEST_MAX_MS = '900000';
            expect(testCeilingMs(45_000)).toBe(900_000);
        } finally {
            if (saved === undefined) delete process.env.JOE_APP_TEST_MAX_MS; else process.env.JOE_APP_TEST_MAX_MS = saved;
        }
    });

    it('the wiring: app_tests passes its project, ceiling and the run\'s cancellation; react_project hands it over', () => {
        const audit = fs.readFileSync(path.join(__dirname, '..', 'core', 'quality', 'terminal-audit.ts'), 'utf8');
        expect(audit).toMatch(/run\(npm, \['test'\], appDir, testQuietBoundMs\(floor, appDir\), say, true, \{ ceilingMs: testCeilingMs\(floor\), cancel: opts\.cancel \}\);/);
        expect(audit).toMatch(/if \(r\.ok\) noteTestQuietGap\(r\.longestQuietMs, appDir\);/);
        expect(audit).not.toMatch(/let longestPassingQuietMs = 0/);
        const react = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf8');
        expect(react).toMatch(/appDir: proj,[\s\S]{0,120}cancel: cancellation,/);
    });
});
