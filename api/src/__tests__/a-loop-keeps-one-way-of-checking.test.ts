/**
 * ⛔ A LOOP COMPARES LIKE WITH LIKE, AND THE OWNER'S FOLDER IS MARKED WHEN HE HAS IT (design v13.3, step 1, agent F).
 *
 * Design: D:\Joe\eval\egm\designs\2026-11-15-user-lifecycle-v13.md §2, §2.1, §2.3, §2.5, §6, §8, §12.1 row 10.
 *
 *   §2.1  `.joe/delivered` is written only at the outermost delivery (the engine's delivered run, the
 *         pipeline's final report); a folder that has it is a change run for every later check.
 *   §2.3  One pin per loop. An audit that ran a stricter path than the loop's pin is not comparable: in
 *         `improveUntilItStops` the round is rolled back through `skipped: true`, the first measurement
 *         stands, and `notComparable` is told.
 *   §2.5  The loop owner reads the delivery record ONCE and chooses the path before its live start, on the
 *         folder the walked server runs from.
 *   §6    The builder's proofs ask only GET /api/health on the no-write path.
 *   §8    The stream target is the owner's own panel id, never the shared constant; a new build's panel
 *         borrow stays exactly today's.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    anchorPinOnFirstAudit, auditNotComparable, improveSummary, improveUntilItStops, normaliseImproveResult,
    notComparableLine, NOT_COMPARABLE_LINES, repinAfterLiveStart, seedLoopQaPin,
} from '../core/quality/improve-loop';
import { hasDeliveryRecord } from '../core/quality/qa-target';
import { markFolderDelivered } from '../modules/tools/definitions/AgentEngineTool';
import { markPipelineDelivered, runCoverageRepairPass, builderProofsWay } from '../modules/tools/definitions/ProjectPipelineTool';
import { ProjectRepairTool } from '../modules/tools/definitions/ProjectRepairTool';
import { UiFixTool } from '../modules/tools/definitions/UiFixTool';

jest.setTimeout(120_000);

const code = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const tmp = (name: string) => fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), `joe-one-way-${name}-`));
const small = { id: 'small_targets', severity: 'medium', detail: '2 أزرار صغيرة', detailEn: '2 tap target(s) under 40px', evidence: [{ sel: 'button.go', w: 30, h: 30 }] };

/** A Node server whose JSON store sits under data/ and which can send nothing: §3b's router passes it (2t). */
function nodeStoreApp(dir: string, extraDeps: Record<string, string> = {}) {
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'store', scripts: { start: 'node server.js' }, dependencies: { ...extraDeps } }));
    fs.writeFileSync(path.join(dir, 'server.js'), [
        "const http = require('http');",
        "const fs = require('fs');",
        "const path = require('path');",
        "const FILE = path.join(__dirname, 'data', 'db.json');",
        "http.createServer((req, res) => { fs.writeFileSync(FILE, '[]'); res.end('ok'); }).listen(process.env.PORT || 3000);",
    ].join('\n'));
    fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'data', 'db.json'), '[]');
}
const deliver = (dir: string) => { fs.mkdirSync(path.join(dir, '.joe'), { recursive: true }); fs.writeFileSync(path.join(dir, '.joe', 'delivered'), ''); };

describe('§2.3 — improveUntilItStops rolls an incomparable round back through skipped (12.1 row 10)', () => {
    it('⛔ POSITIVE — the round is rolled back, the first measurement stands, and notComparable is told', async () => {
        const lines: string[] = [];
        const rollback = jest.fn(async () => true);
        const first = { score: 70, findingIds: ['small_targets'], findings: [{ id: 'small_targets' }] };
        const r = await improveUntilItStops(first, {
            measure: async () => ({ score: 0, findingIds: [], skipped: true, notComparable: { from: '2t', to: 'no-write' } }),
            repair: async () => ['styles.css'],
            rebuild: async () => true,
            rollback,
            snapshot: () => 'snap-1',
            say: l => lines.push(l),
            language: 'ar',
        });
        expect(rollback).toHaveBeenCalledWith('snap-1');
        expect(r.final).toBe(first);
        expect(r.rounds).toHaveLength(1);
        expect(r.rounds[0]).toMatchObject({ verdict: 'no_measured_gain', rolledBack: true, rollback: 'done', notComparable: { from: '2t', to: 'no-write' } });
        expect(r.rounds[0].after).toBeUndefined();
        expect(lines.join('\n')).toContain(notComparableLine('ar', '2t', 'no-write'));
        expect(improveSummary(r, false)).toContain(notComparableLine('en', '2t', 'no-write'));
        expect(improveSummary(r, true)).toContain(notComparableLine('ar', '2t', 'no-write'));
        //  a persisted result keeps it
        expect(normaliseImproveResult(JSON.parse(JSON.stringify(r)), first).rounds[0].notComparable).toEqual({ from: '2t', to: 'no-write' });
    });

    it('⛔ NEGATIVE — a plain skipped measurement says what it always said, and claims no change of way', async () => {
        const lines: string[] = [];
        const first = { score: 70, findingIds: ['small_targets'] };
        const r = await improveUntilItStops(first, {
            measure: async () => ({ score: 0, findingIds: [], skipped: true }),
            repair: async () => ['styles.css'], rebuild: async () => true, rollback: async () => true, snapshot: () => 'snap-1',
            say: l => lines.push(l),
        });
        expect(r.rounds[0].notComparable).toBeUndefined();
        expect(lines.join('\n')).toMatch(/could not be measured/);
        expect(improveSummary(r, false)).not.toContain(NOT_COMPARABLE_LINES.en.slice(0, 30));
    });

    it('the line exists in the six languages of owner-lines13.json, with English as the fallback', () => {
        expect(Object.keys(NOT_COMPARABLE_LINES).sort()).toEqual(['ar', 'de', 'en', 'es', 'fr', 'ru']);
        expect(notComparableLine('xx', 'a', 'b')).toBe('The way of checking changed between the two measurements (a → b), so the first measurement stands.');
    });
});

describe('§2.3 — reading an audit against the pin', () => {
    it('⛔ an audit that reports comparable:false is not comparable; one with no qaPath (as today) is', () => {
        expect(auditNotComparable({ qaPath: { path: 'no-write', comparable: false } }, { path: '2t' })).toEqual({ from: '2t', to: 'no-write' });
        expect(auditNotComparable({ qaPath: { path: '2t', comparable: true } }, { path: '2t' })).toBeUndefined();
        expect(auditNotComparable({ score: 80 }, { path: '2t' })).toBeUndefined();
    });

    it('⛔ the first audit of a loop has nothing earlier to keep: the pin moves to the path it ran', () => {
        const pin: any = { path: 'private-live', record: 'delivered' };
        expect(anchorPinOnFirstAudit(pin, { qaPath: { path: 'no-write', comparable: false } })).toBe(true);
        expect(pin.path).toBe('no-write');
        expect(anchorPinOnFirstAudit(pin, { qaPath: { path: 'no-write', comparable: true } })).toBe(false);
        expect(anchorPinOnFirstAudit(pin, { score: 1 })).toBe(false);
    });
});

describe('§2.1, §2.5 — the loop owner seeds the pin once, on the folder the server runs from', () => {
    let dir = '';
    beforeEach(() => { dir = tmp('seed'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('⛔ a folder Joe never delivered (an interrupted build: transcript, shots, .joe-versions) is a new build: as-today', async () => {
        nodeStoreApp(dir);
        fs.mkdirSync(path.join(dir, '.joe', 'delivery'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.joe', 'transcript.jsonl'), '{}\n');
        fs.writeFileSync(path.join(dir, '.joe', 'result.json'), JSON.stringify({ status: 'failed' }));
        fs.mkdirSync(path.join(dir, '.joe-versions', 'v1'), { recursive: true });
        const pin = await seedLoopQaPin({ projectRoot: dir, hasServeUrl: true });
        expect(pin).toMatchObject({ record: '', path: 'as-today' });
    });

    it('⛔ a delivered Node store app takes 2T; the same app with nodemailer takes no-write', async () => {
        nodeStoreApp(dir);
        deliver(dir);
        expect(await seedLoopQaPin({ projectRoot: dir, hasServeUrl: true })).toMatchObject({ record: 'delivered', path: '2t' });
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        nodeStoreApp(dir, { nodemailer: '^6.9.0' });
        deliver(dir);
        expect(await seedLoopQaPin({ projectRoot: dir, hasServeUrl: true })).toMatchObject({ record: 'delivered', path: 'no-write' });
    });

    it('⛔ the choice is made on the server folder, and the record is read from the project first', async () => {
        const server = tmp('server');
        try {
            nodeStoreApp(server, { nodemailer: '^6.9.0' });
            deliver(dir);
            fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><title>front</title>');
            const pin = await seedLoopQaPin({ projectRoot: dir, serverRoot: server, hasServeUrl: true, startKind: 'node-entry' });
            expect(pin).toMatchObject({ record: 'delivered', path: 'no-write' });
            //  no serveUrl: the audit serves the build itself
            expect(await seedLoopQaPin({ projectRoot: dir, hasServeUrl: false })).toMatchObject({ record: 'delivered', path: 'private-live' });
        } finally { fs.rmSync(server, { recursive: true, force: true }); }
    });

    it('⛔ after the live start the choice is taken again and the stricter is kept — never a looser one', async () => {
        nodeStoreApp(dir, { nodemailer: '^6.9.0' });
        const pin: any = { record: 'delivered', path: 'private-live' };
        await repinAfterLiveStart(pin, { serverRoot: dir, startKind: 'npm-start', hasServeUrl: true });
        expect(pin.path).toBe('no-write');
        const strict: any = { record: 'delivered', path: 'no-write' };
        await repinAfterLiveStart(strict, { serverRoot: dir, startKind: 'static', hasServeUrl: true });
        expect(strict.path).toBe('no-write');
        const fresh: any = { record: '', path: 'as-today' };
        await repinAfterLiveStart(fresh, { serverRoot: dir, startKind: 'npm-start', hasServeUrl: true });
        expect(fresh.path).toBe('as-today');
    });
});

describe('§2.1 — the delivered marker, only at the outermost delivery', () => {
    let dir = '';
    beforeEach(() => { dir = tmp('mark'); });
    afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    it('⛔ POSITIVE — the marker makes the folder a change run, and is never rewritten', () => {
        expect(hasDeliveryRecord(dir)).toBe('');
        expect(markFolderDelivered(dir)).toBe(true);
        expect(hasDeliveryRecord(dir)).toBe('delivered');
        expect(fs.readFileSync(path.join(dir, '.joe', 'delivered'), 'utf8')).toBe('');
        const at = fs.statSync(path.join(dir, '.joe', 'delivered')).mtimeMs;
        expect(markPipelineDelivered(dir)).toBe(true);
        expect(fs.statSync(path.join(dir, '.joe', 'delivered')).mtimeMs).toBe(at);
        expect(markPipelineDelivered(path.join(dir, 'missing'))).toBe(false);
        expect(fs.existsSync(path.join(dir, 'missing'))).toBe(false);
    });

    it('⛔ the engine writes it only for a delivered run; the pipeline only on a delivered final report it owns', () => {
        const engine = code('modules', 'tools', 'definitions', 'AgentEngineTool.ts');
        expect(engine).toContain('if (delivered) markFolderDelivered(folder.dir);');
        expect(engine).toContain("joeDeliveryOwner: 'agent_engine',");
        const pipeline = code('modules', 'tools', 'definitions', 'ProjectPipelineTool.ts');
        expect(pipeline).toContain("if (finalDeliveryStatus === 'delivered' && !context?.joeDeliveryOwner) {");
        //  never by a phase tool
        for (const phase of ['ReactProjectTool.ts', 'ProjectRepairTool.ts', 'ProjectEditTool.ts', 'UiFixTool.ts']) {
            expect(code('modules', 'tools', 'definitions', phase)).not.toMatch(/markFolderDelivered|markPipelineDelivered|['"]\.joe['"]\s*,\s*['"]delivered['"]/);
        }
    });
});

describe('§2 — every call site of agent F hands the door the owner\'s folder, the pin and his panel id', () => {
    const src = (f: string) => code('modules', 'tools', 'definitions', f);
    it('⛔ the five callers pass the door options at every audit', () => {
        const pipeline = src('ProjectPipelineTool.ts');
        expect((pipeline.match(/\.\.\.qaOptions,/g) || []).length).toBe(4);
        expect(pipeline).toContain('projectRoot: repairProjectRoot,');
        const repair = src('ProjectRepairTool.ts');
        expect((repair.match(/\.\.\.qaOptions,/g) || []).length).toBe(2);
        const react = src('ReactProjectTool.ts');
        expect((react.match(/\.\.\.qaOptions,/g) || []).length).toBe(3);
        const edit = src('ProjectEditTool.ts');
        expect((edit.match(/\.\.\.qaOptions,/g) || []).length).toBe(2);
        expect(edit).toContain("auditBuiltApp(path.join(dir, 'dist'), { projectRoot: dir })");
        const ui = src('UiFixTool.ts');
        expect((ui.match(/\.\.\.qaOptions \}\)/g) || []).length).toBe(2);
    });

    it('⛔ the stream target is the owner\'s own panel id, never the shared constant', () => {
        for (const f of ['ProjectPipelineTool.ts', 'ProjectRepairTool.ts', 'ReactProjectTool.ts', 'ProjectEditTool.ts', 'UiFixTool.ts']) {
            expect(src(f)).toMatch(/String\(context\?\.browserSessionId \|\| ''\)\.trim\(\)/);
            expect(src(f)).not.toMatch(/streamTo:\s*PANEL_BROWSER_SID/);
        }
    });

    it('⛔ the told-only filtering of this round is untouched', () => {
        expect(src('ProjectEditTool.ts')).toContain('const reading = refusingMeasurement(measured);');
        expect(src('ReactProjectTool.ts')).toContain('const reading = reactLoopMeasurement(a, termFails, (n: number) => blend(n, t));');
        expect(src('ProjectRepairTool.ts')).toContain('const kept = all.filter(refuses);');
        expect(src('ProjectPipelineTool.ts')).toContain('let blocking = browserQa.findings.filter(refuses);');
    });
});

describe('§2.3, §2.5 — project_repair: one pin for the whole loop, an incomparable round rolled back', () => {
    const appAudit = require('../core/quality/app-audit');
    const loop = require('../core/quality/improve-loop');
    let dir = '';
    beforeEach(() => {
        dir = tmp('repair');
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Clinic</title><link rel="stylesheet" href="styles.css"></head><body><main><h1>Clinic</h1><button class="go">Book</button></main></body></html>');
        fs.writeFileSync(path.join(dir, 'styles.css'), '.go{height:30px}\n');
        jest.spyOn(require('../modules/browser/manager'), 'warmBrowserSession').mockImplementation(() => undefined);
    });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

    it('⛔ POSITIVE — a delivered folder: every audit gets projectRoot, the same pin read once, his panel id; the stricter round is rolled back', async () => {
        deliver(dir);
        const audits = [
            { score: 69, findings: [small], qaPath: { path: 'private-live', comparable: true } },
            { score: 95, findings: [], qaPath: { path: 'no-write', comparable: false } },
        ];
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => audits.shift() as any);
        jest.spyOn(loop, 'repairRound').mockImplementation(async () => {
            fs.writeFileSync(path.join(dir, 'styles.css'), '.go{height:48px}\n');
            return { changed: ['styles.css'], repairs: [] };
        });
        const r: any = await new ProjectRepairTool().execute({ projectDir: dir, auditDir: dir }, { sessionId: 'one-way-repair', browserSessionId: 'browser:owner-1', language: 'en' });
        expect(audit).toHaveBeenCalledTimes(2);
        const [o1, o2] = audit.mock.calls.map(c => c[1] as any);
        expect(o1.projectRoot).toBe(dir);
        expect(o1.serverRoot).toBe(dir);
        expect(o1.streamTo).toBe('browser:owner-1');
        expect(o1.qaPin).toBe(o2.qaPin);
        expect(o1.qaPin).toMatchObject({ record: 'delivered', path: 'private-live' });
        expect(o1.artifactRootDir).not.toBe(o1.projectRoot);
        //  the earlier measurement stands, the round's write is undone, and he is told why
        expect(r.output.after).toBe(69);
        expect(r.output.rounds[0]).toMatchObject({ verdict: 'no_measured_gain', notComparable: { from: 'private-live', to: 'no-write' } });
        expect(fs.readFileSync(path.join(dir, 'styles.css'), 'utf8')).toBe('.go{height:30px}\n');
        expect(r.output.message).toContain(notComparableLine('en', 'private-live', 'no-write'));
    });

    it('⛔ NEGATIVE — a folder Joe never delivered: the pin says as-today and a better round is kept as before', async () => {
        const audits = [
            { score: 69, findings: [small] },
            { score: 95, findings: [] },
        ];
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => audits.shift() as any);
        jest.spyOn(loop, 'repairRound').mockImplementation(async () => ({ changed: ['styles.css'], repairs: [] }));
        const r: any = await new ProjectRepairTool().execute({ projectDir: dir, auditDir: dir }, { sessionId: 'one-way-repair-new', language: 'en' });
        const o1 = audit.mock.calls[0][1] as any;
        expect(o1.qaPin).toMatchObject({ record: '', path: 'as-today' });
        expect(o1.streamTo).toBeUndefined();
        expect(r.output.after).toBe(95);
        expect(r.output.rounds[0].verdict).toBe('improved');
    });
});

describe('§8 — browser_ui_fix: his panel id is streamed to, the new-build borrow is today\'s', () => {
    const appAudit = require('../core/quality/app-audit');
    const selfRepair = require('../core/quality/self-repair');
    let dir = '';
    beforeEach(() => { dir = tmp('uifix'); fs.mkdirSync(path.join(dir, 'dist'), { recursive: true }); });
    afterEach(() => { jest.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

    it('⛔ POSITIVE — both audits: projectRoot, one pin, streamTo = his panel; an incomparable «after» keeps «before»', async () => {
        const { PANEL_BROWSER_SID } = require('../modules/tools/definitions/BrowserSmartTools');
        const audits = [
            { score: 60, findings: [small] },
            { score: 99, findings: [], qaPath: { path: 'no-write', comparable: false } },
        ];
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => audits.shift() as any);
        jest.spyOn(selfRepair, 'repairAndRebuild').mockImplementation(async () => ({ built: true, changed: ['src/App.css'], refused: [], repairs: [] }));
        const r: any = await new UiFixTool().execute({ projectDir: dir }, { browserSessionId: 'browser:owner-2' });
        const [o1, o2] = audit.mock.calls.map(c => c[1] as any);
        expect(o1).toMatchObject({ projectRoot: dir, streamTo: 'browser:owner-2', watchSessionId: PANEL_BROWSER_SID });
        expect(o1.qaPin).toBe(o2.qaPin);
        expect(r.output.after).toBe(60);
        expect(r.output.message).toMatch(/The way of checking changed|تغيّر طريق الفحص/);
    });

    it('⛔ NEGATIVE — no panel id: nothing is streamed', async () => {
        const audit = jest.spyOn(appAudit, 'auditBuiltApp').mockImplementation(async () => ({ score: 60, findings: [] }) as any);
        jest.spyOn(selfRepair, 'repairAndRebuild').mockImplementation(async () => ({ built: true, changed: [], refused: [], repairs: [] }));
        await new UiFixTool().execute({ projectDir: dir }, {});
        expect((audit.mock.calls[0][1] as any).streamTo).toBeUndefined();
    });
});

describe('§6 — the pipeline\'s coverage repair on the no-write path asks the proofs nothing that writes', () => {
    const proofs = { health: true, contract: '', tables: {}, noWrite: true as const };
    const pass = (noWrite: boolean, file: string) => ({
        file,
        targeted: ['orders'],
        runBefore: { ok: true },
        runRepairTool: async () => ({ ok: true }),
        restartServer: async () => ({ ok: true }),
        recordRun: async () => undefined,
        measurements: () => [{ instrument: 'live', ok: true }],
        currentTargets: () => [],
        measureProofs: async () => proofs,
        noWrite,
    });

    it('⛔ POSITIVE — both healths hold on no-write: the claims count as re-measured («not measured», not failed)', async () => {
        const dir = tmp('proofs');
        try {
            const r = await runCoverageRepairPass(pass(true, path.join(dir, 'server.js')));
            expect(r).toEqual({ undoReason: '', remeasured: true });
            expect(builderProofsWay(true)).toEqual({ noWrite: true });
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });

    it('⛔ NEGATIVE — on any other path the contract must be read again, as today', async () => {
        const dir = tmp('proofs2');
        try {
            const r = await runCoverageRepairPass(pass(false, path.join(dir, 'server.js')));
            expect(r).toEqual({ undoReason: '', remeasured: false });
            expect(builderProofsWay(false)).toEqual({});
        } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
});
