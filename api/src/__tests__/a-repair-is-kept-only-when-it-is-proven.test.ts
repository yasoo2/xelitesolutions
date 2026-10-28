import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { AddressInfo } from 'net';
import {
    coverageRepairTargets,
    editInPlaceRepairInput,
    passingMeasurementKeys,
    pipelineExecutedTasks,
    pipelinePhaseIds,
    postRepairRunOutcome,
    regressedMeasurementKeys,
    runCoverageRepairPass,
    sessionPartsKeyOf,
    type CoverageRepairPass,
} from '../modules/tools/definitions/ProjectPipelineTool';
import { applyLiveRunOutcome } from '../modules/tools/definitions/ProjectPipelineTool';
import {
    builderClaimsRemeasured,
    markUnremeasuredBuilderClaims,
    measureBuilderProofs,
    regressedBuilderProofs,
    servedByStaticFallback,
} from '../core/quality/builder-proofs';
import { clearDeliveryParts, deliveryPartRunsForTests, deliveryPartsForRun, recordDeliveryPart } from '../core/quality/delivery-parts';

/**
 * Round 15 adversarial review, findings 15, 16, 27, 28, 30, 42, 46: a
 * request-coverage repair rewrites a whole server file. A rewrite that throws
 * at startup was hidden by project_run's static fallback (ok:true) and kept;
 * a rewrite that dropped the auth middleware still started and was kept,
 * while the report reprinted «writes without a login are refused with 401».
 */
const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r20-')); roots.push(d); return d; };

const realServer = { ok: true, output: { url: 'http://127.0.0.1:4868/', cwd: '/w/api', kind: 'npm-start' } };
const staticBuild = { ok: true, output: { url: 'http://127.0.0.1:4869/', cwd: '/w/api/dist', kind: 'static-build-fallback', devServerConfirmed: false } };
const staticSite = { ok: true, output: { url: 'http://127.0.0.1:4870/', cwd: '/w/site/src', kind: 'static-site', devServerConfirmed: false, fallbackFrom: 'launchability: runtime target is missing' } };

describe('static files standing in for a server are not a live system', () => {
    it('after a repair, a static fallback where a real server ran before is a live failure', () => {
        expect(servedByStaticFallback(staticBuild)).toBe(true);
        expect(servedByStaticFallback(staticSite)).toBe(true);
        expect(servedByStaticFallback(realServer)).toBe(false);
        const out = postRepairRunOutcome(staticBuild, realServer);
        expect(out.ok).toBe(false);
        expect(String(out.error)).toMatch(/no longer starts; only static files were served/);
        expect(postRepairRunOutcome(staticSite, realServer).ok).toBe(false);
    });
    it('a site that was static before stays static (the P001 shape), and a fresh real server passes', () => {
        expect(postRepairRunOutcome(staticSite, staticSite)).toBe(staticSite);
        expect(postRepairRunOutcome(realServer, realServer)).toBe(realServer);
        expect(postRepairRunOutcome(staticSite)).toBe(staticSite);
    });
    it('adoption is still refused', () => {
        expect(postRepairRunOutcome({ ok: true, output: { url: 'x', adopted: true, kind: 'already-running' } }).ok).toBe(false);
    });
});

describe('one phase identity per pipeline run', () => {
    it('ids come from the context, or are minted once', () => {
        expect(pipelinePhaseIds({ sessionId: 's1', runId: 'r1' })).toEqual({ sessionId: 's1', runId: 'r1' });
        expect(pipelinePhaseIds({}, 42)).toEqual({ sessionId: 'pipeline-42', runId: 'run-42' });
        expect(sessionPartsKeyOf('chat:42/a')).toBe('chat_42_a');
        expect(sessionPartsKeyOf('')).toBe('default');
    });
    it('two runs in one session keep separate parts, and clearing frees them', () => {
        const before = deliveryPartRunsForTests();
        recordDeliveryPart('s-same', 'run-A', { root: '/w/api-a', tool: 'api_project' });
        recordDeliveryPart('s-same', 'run-B', { root: '/w/react-b', tool: 'react_project' });
        recordDeliveryPart('s-same', 'run-A', { root: '/w/react-a', tool: 'react_project' });
        expect(deliveryPartsForRun('s-same', 'run-A').map(p => path.basename(p.root))).toEqual(['api-a', 'react-a']);
        expect(deliveryPartsForRun('s-same', 'run-B').map(p => path.basename(p.root))).toEqual(['react-b']);
        clearDeliveryParts('s-same', 'run-A');
        clearDeliveryParts('s-same', 'run-B');
        expect(deliveryPartsForRun('s-same', 'run-A')).toEqual([]);
        expect(deliveryPartRunsForTests()).toBe(before);
    });
    it('phases that ran tasks edited the tree; a plan that ran nothing did not', () => {
        expect(pipelineExecutedTasks({ results: [{ executedTasks: 0 }, { executedTasks: 2 }] })).toBe(true);
        expect(pipelineExecutedTasks({ results: [{ executedTasks: 0 }] })).toBe(false);
        expect(pipelineExecutedTasks(null)).toBe(false);
    });
});

describe('what a repair must not break', () => {
    it('targets split the way the repair task splits them', () => {
        const report: any = { missing: [
            { key: 'patients', served: false, tested: false, present: null },
            { key: 'treatments', served: true, tested: false, present: null },
        ] };
        expect(coverageRepairTargets(report, 'served')).toEqual(['patients']);
        expect(coverageRepairTargets(report, 'tested')).toEqual(['treatments']);
    });
    it('a check that passed before and fails after is a regression; coverage is never one', () => {
        const before = passingMeasurementKeys([
            { instrument: 'live', ok: true }, { instrument: 'quality', ok: true, target: '/w/api' },
            { instrument: 'scope', ok: true }, { instrument: 'coverage', ok: false },
        ]);
        expect(before).toEqual(['live', 'quality:api', 'scope']);
        expect(regressedMeasurementKeys(before, [
            { instrument: 'live', ok: true }, { instrument: 'quality', ok: false, target: '/w/api' }, { instrument: 'scope', ok: true },
        ])).toEqual(['quality:api']);
    });
    it('the author sees the file it repairs', () => {
        const input = editInPlaceRepairInput('ai_write_file', { path: '/w/api/server.js', description: 'serve patients' }, '/w/api/server.js', Buffer.from('app.use(requireAuth);'));
        expect(input.description).toMatch(/EDIT THIS EXISTING FILE IN PLACE/);
        expect(input.description).toContain('app.use(requireAuth);');
        expect(input.description).toMatch(/authentication included/);
        expect(editInPlaceRepairInput('ai_write_file', { description: 'x' }, '/w/new.js', null).description).toBe('x');
        expect(editInPlaceRepairInput('npm_manager', { command: 'install' }, '/w/p.json', Buffer.from('{}'))).toEqual({ command: 'install' });
    });
});

/** A ledger the fake recordRun writes to, the way recordLiveAcceptance does. */
function harness(file: string, over: Partial<CoverageRepairPass> & { runs: any[]; repair: (current: Buffer | null) => any; targetsAfter?: string[] }) {
    let measurements: any[] = [{ instrument: 'live', ok: true }, { instrument: 'quality', ok: true }, { instrument: 'coverage', ok: false }];
    let targets = ['patients'];
    const restarts: any[] = [];
    const pass: CoverageRepairPass = {
        file,
        targeted: ['patients'],
        runBefore: realServer,
        runRepairTool: async (current) => over.repair(current),
        restartServer: async () => { const run = over.runs[restarts.length] ?? realServer; restarts.push(run); return run; },
        recordRun: async (run, before) => {
            const live = applyLiveRunOutcome(true, postRepairRunOutcome(run, before));
            measurements = [{ instrument: 'live', ok: live.verified, error: live.error }];
            if (live.verified) {
                measurements.push({ instrument: 'quality', ok: true });
                targets = over.targetsAfter ?? [];
                measurements.push({ instrument: 'coverage', ok: targets.length === 0 });
            }
        },
        measurements: () => measurements,
        currentTargets: () => targets,
        measureProofs: async () => null,
        ...over,
    };
    return { pass, restarts };
}

describe('one coverage repair pass: nothing it writes stays unless it is proven', () => {
    it('a server.js that passes node --check but throws at startup, hidden by a static fallback, is restored byte for byte', async () => {
        const dir = tmp();
        const file = path.join(dir, 'server.js');
        const original = Buffer.from('const express=require("express");\r\napp.listen(4868);\r\n');
        fs.writeFileSync(file, original);
        const { pass, restarts } = harness(file, {
            runs: [staticBuild, realServer],
            repair: async () => { fs.writeFileSync(file, 'app.use(undefined); app.listen(4868);'); return { ok: true }; },
        });
        const out = await runCoverageRepairPass(pass);
        expect(out.undoReason).toMatch(/no longer starts/);
        expect(fs.readFileSync(file).equals(original)).toBe(true);
        // Restarted on the edit, then restarted again on the restored file.
        expect(restarts).toHaveLength(2);
    });
    it('a repair that drops the auth middleware still starts — and is undone because anonymous writes are no longer refused', async () => {
        const dir = tmp();
        const file = path.join(dir, 'server.js');
        const original = Buffer.from('app.post("/api/bookings", requireAuth, h);');
        fs.writeFileSync(file, original);
        let protectedWrites = true;
        const { pass } = harness(file, {
            runs: [realServer, realServer],
            repair: async () => { fs.writeFileSync(file, 'app.post("/api/bookings", h); app.get("/api/patients", h);'); protectedWrites = false; return { ok: true }; },
            measureProofs: async () => ({
                health: true, contract: 'api_project', tables: { bookings: 3 },
                anonymousWrite: { resource: 'bookings', status: protectedWrites ? 401 : 201, outcome: protectedWrites ? 'refused' : 'written' },
                badPassword: { status: 401, refused: true },
            }),
        });
        const out = await runCoverageRepairPass(pass);
        expect(out.undoReason).toMatch(/anonymous write to \/api\/bookings was refused before the repair and now answers 201/);
        expect(fs.readFileSync(file).equals(original)).toBe(true);
    });
    it('a repair that keeps every claim, serves the record and starts is kept, and its claims count as measured again', async () => {
        const dir = tmp();
        const file = path.join(dir, 'server.js');
        fs.writeFileSync(file, 'old');
        const proofs = { health: true, contract: 'api_project', tables: { bookings: 3 }, anonymousWrite: { resource: 'bookings', status: 401, outcome: 'refused' as const } };
        const { pass } = harness(file, {
            runs: [realServer],
            repair: async () => { fs.writeFileSync(file, 'new'); return { ok: true }; },
            measureProofs: async () => proofs,
        });
        const out = await runCoverageRepairPass(pass);
        expect(out).toEqual({ undoReason: '', remeasured: true });
        expect(fs.readFileSync(file, 'utf8')).toBe('new');
    });
    it('a targeted record still missing, a tool that fails half-way, or a throw — each puts the file back', async () => {
        for (const variant of ['missing', 'tool', 'throw'] as const) {
            const dir = tmp();
            const file = path.join(dir, 'server.js');
            fs.writeFileSync(file, 'original');
            const { pass, restarts } = harness(file, {
                runs: [realServer, realServer],
                targetsAfter: variant === 'missing' ? ['patients'] : [],
                repair: async () => {
                    fs.writeFileSync(file, 'half-written');
                    if (variant === 'throw') throw new Error('author crashed');
                    return variant === 'tool' ? { ok: false, error: 'validation failed' } : { ok: true };
                },
            });
            const out = await runCoverageRepairPass(pass);
            expect(out.undoReason).not.toBe('');
            expect(fs.readFileSync(file, 'utf8')).toBe('original');
            // A tool that never finished restarted nothing; the old process still matches the restored disk.
            expect(restarts.length).toBe(variant === 'missing' ? 2 : 0);
        }
    });
    it('a file the repair created is removed when it is undone', async () => {
        const dir = tmp();
        const file = path.join(dir, 'tests', 'requested-records.test.js');
        const { pass } = harness(file, {
            runs: [staticBuild, realServer],
            repair: async () => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'test'); return { ok: true }; },
        });
        await runCoverageRepairPass(pass);
        expect(fs.existsSync(file)).toBe(false);
    });
});

describe('the builder\'s own live claims, measured on a real server', () => {
    let server: http.Server;
    let base = '';
    let mode: 'protected' | 'open' | 'lost' = 'protected';
    const writes: string[] = [];
    beforeAll(async () => {
        server = http.createServer((req, res) => {
            const json = (status: number, body: any) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
            let body = '';
            req.on('data', c => { body += c; });
            req.on('end', () => {
                if (req.url === '/api/health') return json(200, { ok: true, joe: 'api_project', resource: 'bookings', tables: { bookings: mode === 'lost' ? 0 : 3, patients: 1 } });
                if (req.url === '/api/bookings' && req.method === 'POST') {
                    if (mode !== 'open') return json(401, { ok: false });
                    writes.push(body);
                    return json(201, { ok: true, id: 7 });
                }
                if (req.url === '/api/bookings/7' && req.method === 'DELETE') { writes.push('deleted 7'); return json(200, { ok: true }); }
                if (req.url === '/api/auth/login') return json(mode === 'open' ? 200 : 401, { ok: mode === 'open' });
                json(404, {});
            });
        });
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    });
    afterAll(() => new Promise<void>(r => server.close(() => r())));

    it('before: writes refused, wrong password refused, rows counted — and nothing was written', async () => {
        mode = 'protected';
        const before = await measureBuilderProofs(base, { timeoutMs: 3000 });
        expect(before).toMatchObject({ health: true, contract: 'api_project', tables: { bookings: 3, patients: 1 } });
        expect(before.anonymousWrite).toMatchObject({ resource: 'bookings', status: 401, outcome: 'refused' });
        expect(before.badPassword).toMatchObject({ status: 401, refused: true });
        expect(writes).toEqual([]);
    });
    it('after a rewrite that opened the writes and the login: both regressions are named, and the stray row is deleted', async () => {
        mode = 'protected';
        const before = await measureBuilderProofs(base, { timeoutMs: 3000 });
        mode = 'open';
        const after = await measureBuilderProofs(base, { timeoutMs: 3000 });
        const lost = regressedBuilderProofs(before, after);
        expect(lost.join(' | ')).toMatch(/anonymous write to \/api\/bookings was refused before the repair and now answers 201/);
        expect(lost.join(' | ')).toMatch(/wrong password was refused before the repair and now answers 200/);
        expect(writes).toContain('deleted 7');
        expect(builderClaimsRemeasured(before, after)).toBe(true);
    });
    it('rows that did not survive the restart are named', async () => {
        mode = 'protected';
        const before = await measureBuilderProofs(base, { timeoutMs: 3000 });
        mode = 'lost';
        const after = await measureBuilderProofs(base, { timeoutMs: 3000 });
        expect(regressedBuilderProofs(before, after)).toEqual(['table «bookings» had 3 row(s) and now has 0 after the restart']);
    });
    it('only loopback is ever probed', async () => {
        expect((await measureBuilderProofs('http://example.com:80/', { timeoutMs: 500 })).health).toBe(false);
        expect((await measureBuilderProofs('file:///etc/passwd', { timeoutMs: 500 })).health).toBe(false);
    });
});

describe('a live claim nobody measured again is not reprinted as proven', () => {
    it('every live-proof line becomes one note; the rest of the message stays', () => {
        const message = [
            '🗄️ بُنيت واجهة خلفية كاملة',
            '✅ الإثبات الحي: الخادم اشتغل فعلاً، وكُتب صف رقم 1 عبر HTTP حقيقي',
            '   تحقّقتُ حيّاً: كتابة بلا تسجيل دخول تُرفض بـ401',
            '🧭 مسارات الحجوزات',
        ].join('\n');
        const out = markUnremeasuredBuilderClaims(message, true, 'server.js');
        expect(out).not.toMatch(/الإثبات الحي:|تحقّقتُ حيّاً/);
        expect(out).toMatch(/عُدّل server\.js بعد إثباته الحي/);
        expect(out).toContain('🧭 مسارات الحجوزات');
        expect(out.match(/⚠️/g)).toHaveLength(1);
        expect(markUnremeasuredBuilderClaims('✅ Live proof: row #1 written over real HTTP and read back.', false, 'server.js')).toMatch(/was rewritten after its live proof/);
        expect(markUnremeasuredBuilderClaims('plain message', false, 'server.js')).toBe('plain message');
    });
});

describe('the wiring', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
    it('a coverage repair targets only the server root', () => {
        expect(src).toMatch(/if \(!serverRoot \|\| !isWithinRoot\(task\.repairFile, serverRoot\)\) \{/);
        expect(src).not.toMatch(/const trustedRoots = Array\.from\(new Set\(\[serverRoot, \.\.\.lastAcceptanceRoots\.auditRoots\]/);
        expect(src).toMatch(/const pass = await runCoverageRepairPass\(\{/);
        expect(src).toMatch(/if \(!remeasured\) staleBuilderProof = \{ file: task\.repairFile, root: serverRoot \};/);
    });
    it('static files are not live when the delivery needs a server', () => {
        expect(src).toMatch(/if \(servedByStaticFallback\(runRes\)\) \{[\s\S]{0,400}deliveryRoles\.service \? 1 : \(await collectServerEvidence\(runRoots, \[\]\)\)\.routes\.length/);
    });
    it('the first delivery run after phases that edited the tree restarts, never adopts', () => {
        expect(src).toMatch(/const phasesEditedTree = pipelineExecutedTasks\(pipeline\);\s*if \(phasesEditedTree\) \(runInput as Record<string, unknown>\)\.restart = true;/);
        expect(src).toMatch(/const runRes = phasesEditedTree \? postRepairRunOutcome\(startedRun\) : startedRun;/);
    });
    it('a scope repair that edited the tree and failed is measured again on a restarted server', () => {
        expect(src).toMatch(/if \(pipelineExecutedTasks\(scopePipeline\)\) \{[\s\S]{0,700}restart: true[\s\S]{0,700}postRepairRunOutcome\(reMeasured, runBeforeScopeEdit\)/);
    });
    it('every phase hand-off and the parts reader share one identity; the run clears its parts', () => {
        expect(src).not.toMatch(/`pipeline-\$\{Date\.now\(\)\}`/);
        expect((src.match(/sessionId: phaseIds\.sessionId,/g) || []).length).toBe(3);
        expect(src).toMatch(/deliveryPartsForRun\(sessionPartsKey, phaseIds\.runId\)/);
        expect(src).toMatch(/clearDeliveryParts\(partsKey, phaseIds\.runId\);\s*try \{\s*return await this\.executeRun\(input, context, phaseIds\);\s*\} finally \{\s*clearDeliveryParts\(partsKey, phaseIds\.runId\);/);
    });
    it('the report marks builder live claims that were not measured again', () => {
        expect(src).toMatch(/markUnremeasuredBuilderClaims\(said, ar, path\.basename\(staleBuilderProof\.file\)\)/);
    });
});
