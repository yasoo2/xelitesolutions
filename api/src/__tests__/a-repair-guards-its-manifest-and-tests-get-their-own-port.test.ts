import fs from 'fs';
import os from 'os';
import path from 'path';
import { applyLiveRunOutcome, postRepairRunOutcome, runCoverageRepairPass, type CoverageRepairPass } from '../modules/tools/definitions/ProjectPipelineTool';
import { QualityRunTool } from '../modules/tools/definitions/QualityTools';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Two follow-ups of the round 15 review's repair work:
 *
 *  1. A tests repair in a Node project with no test script writes the tests
 *     AND adds the script (coverage fork's manifestPatch). package.json is
 *     then part of the repair: snapshotted with the repair file, and restored
 *     with it when the pass is undone.
 *  2. Tests run at delivery while the live server holds the project's default
 *     port; a suite that starts the app there failed with EADDRINUSE and read
 *     as failing tests. quality_run hands the suite a PORT of its own.
 */
jest.setTimeout(120_000);
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); jest.restoreAllMocks(); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r20-manifest-')); roots.push(d); return d; };
const realServer = { ok: true, output: { url: 'http://127.0.0.1:4868/', cwd: '/w/api', kind: 'npm-start' } };
const staticBuild = { ok: true, output: { url: 'http://127.0.0.1:4869/', cwd: '/w/api/dist', kind: 'static-build-fallback', devServerConfirmed: false } };

function aPass(dir: string, runs: any[], over: Partial<CoverageRepairPass> = {}) {
    const file = path.join(dir, 'tests', 'requested-records.test.js');
    const manifest = path.join(dir, 'package.json');
    let measurements: any[] = [{ instrument: 'live', ok: true }, { instrument: 'coverage', ok: false }];
    let restarts = 0;
    const pass: CoverageRepairPass = {
        file,
        guardedFiles: [manifest],
        targeted: ['patients'],
        runBefore: realServer,
        runRepairTool: async () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'test("patients", () => {});'); return { ok: true }; },
        afterRepair: () => {
            const m = JSON.parse(fs.readFileSync(manifest, 'utf8'));
            m.scripts = { ...(m.scripts || {}), test: 'node --test tests/' };
            fs.writeFileSync(manifest, JSON.stringify(m, null, 2));
        },
        restartServer: async () => runs[restarts++] ?? realServer,
        recordRun: async (run, before) => {
            const live = applyLiveRunOutcome(true, postRepairRunOutcome(run, before));
            measurements = [{ instrument: 'live', ok: live.verified }];
            if (live.verified) measurements.push({ instrument: 'coverage', ok: true });
        },
        measurements: () => measurements,
        currentTargets: () => (measurements.some(m => m.instrument === 'coverage' && m.ok) ? [] : ['patients']),
        measureProofs: async () => null,
        ...over,
    };
    return { pass, file, manifest, restarts: () => restarts };
}

describe('a repair guards the manifest it changes', () => {
    it('undone after a broken restart: the new test file is removed and package.json comes back byte for byte', async () => {
        const dir = tmp();
        const original = Buffer.from('{\r\n  "name": "clinic-api",\r\n  "scripts": { "start": "node server.js" }\r\n}\r\n');
        fs.writeFileSync(path.join(dir, 'package.json'), original);
        const { pass, file, manifest } = aPass(dir, [staticBuild, realServer]);
        const out = await runCoverageRepairPass(pass);
        expect(out.undoReason).toMatch(/no longer starts/);
        expect(fs.existsSync(file)).toBe(false);
        expect(fs.readFileSync(manifest).equals(original)).toBe(true);
    });
    it('a test script that cannot be added undoes the pass before any restart', async () => {
        const dir = tmp();
        const original = Buffer.from('{"name":"clinic-api"}');
        fs.writeFileSync(path.join(dir, 'package.json'), original);
        const { pass, file, manifest, restarts } = aPass(dir, [realServer], { afterRepair: () => { throw new Error('the test script could not be added to package.json'); } });
        const out = await runCoverageRepairPass(pass);
        expect(out.undoReason).toMatch(/the test script could not be added/);
        expect(fs.existsSync(file)).toBe(false);
        expect(fs.readFileSync(manifest).equals(original)).toBe(true);
        expect(restarts()).toBe(0);
    });
    it('kept when proven: the tests and the script they need both stay', async () => {
        const dir = tmp();
        fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"clinic-api","scripts":{"start":"node server.js"}}');
        const { pass, file, manifest } = aPass(dir, [realServer]);
        const out = await runCoverageRepairPass(pass);
        expect(out.undoReason).toBe('');
        expect(fs.existsSync(file)).toBe(true);
        expect(JSON.parse(fs.readFileSync(manifest, 'utf8')).scripts.test).toBe('node --test tests/');
    });
    it('the merge adapter calls applyTestScriptPatch, and refuses honestly when it is absent or fails', () => {
        const patch = { file: '/w/api/package.json', script: 'node --test tests/' };
        jest.isolateModules(() => {
            const calls: any[] = [];
            jest.doMock('../core/quality/request-coverage', () => ({ ...jest.requireActual('../core/quality/request-coverage'), applyTestScriptPatch: (p: any) => { calls.push(p); return Buffer.from('{}'); } }));
            const { applyRepairManifestPatch } = require('../modules/tools/definitions/ProjectPipelineTool');
            applyRepairManifestPatch(patch);
            expect(calls).toEqual([patch]);
        });
        jest.isolateModules(() => {
            jest.doMock('../core/quality/request-coverage', () => ({ ...jest.requireActual('../core/quality/request-coverage'), applyTestScriptPatch: () => null }));
            const { applyRepairManifestPatch } = require('../modules/tools/definitions/ProjectPipelineTool');
            expect(() => applyRepairManifestPatch(patch)).toThrow(/could not be added to package\.json/);
        });
        jest.isolateModules(() => {
            const { applyTestScriptPatch: _absent, ...withoutIt } = jest.requireActual('../core/quality/request-coverage');
            jest.doMock('../core/quality/request-coverage', () => withoutIt);
            const { applyRepairManifestPatch } = require('../modules/tools/definitions/ProjectPipelineTool');
            expect(() => applyRepairManifestPatch(patch)).toThrow(/not available in this build/);
        });
        jest.dontMock('../core/quality/request-coverage');
    });
    it('the wiring: a manifest patch inside the server root is guarded and applied by the pass', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/const manifestFile = manifestPatch\?\.file && isWithinRoot\(manifestPatch\.file, serverRoot\) \? manifestPatch\.file : '';/);
        expect(src).toMatch(/guardedFiles: manifestFile \? \[manifestFile\] : \[\],\s*afterRepair: manifestFile \? \(\) => applyRepairManifestPatch\(manifestPatch!\) : undefined,/);
    });
});

describe('a test run gets a port of its own', () => {
    const inCtx = <T>(fn: () => Promise<T>) => executionFirewall.runInContext('quality-run-port', fn);
    it('quality_run hands the suite PORT when asked, and nothing otherwise', async () => {
        const ws = tmp();
        const dir = path.join(ws, 'clinic-api');
        fs.mkdirSync(dir);
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'clinic-api', scripts: { test: 'node -e "console.log(\'PORT=\'+(process.env.PORT||\'unset\'))"' } }));
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(ws);
        const tool = new QualityRunTool();
        const withPort: any = await inCtx(() => tool.execute({ path: dir, tasks: ['test'], port: 4999 }));
        expect(withPort.ok).toBe(true);
        expect(String(withPort.output.results[0].output)).toMatch(/PORT=4999/);
        const without: any = await inCtx(() => tool.execute({ path: dir, tasks: ['test'] }));
        expect(String(without.output.results[0].output)).not.toMatch(/PORT=4999/);
        const privileged: any = await inCtx(() => tool.execute({ path: dir, tasks: ['test'], port: 80 }));
        expect(String(privileged.output.results[0].output)).not.toMatch(/PORT=80\b/);
    });
});
