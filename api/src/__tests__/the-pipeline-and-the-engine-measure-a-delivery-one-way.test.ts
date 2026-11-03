/**
 * ONE IMPLEMENTATION OF EACH GATE, FOR BOTH ENGINES.
 *
 * The pipeline's live acceptance and its requested-records measurement were
 * closures inside ProjectPipelineTool.executeRun, and the request reader and
 * the acceptance blocking rule lived inside ReactProjectTool. The general
 * engine's verifier needs the same gates, so they moved to core/quality and
 * the old callers call them there: a moved gate, not a copy that can drift.
 *
 * Measured here on the moved code itself, with the run results project_run
 * returns, and on the ledger's new instruments (source, build, acceptance).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DeliveryLedger, DELIVERY_PRIORITY, deliveryVerdict, mayRunBrowserQa, type DeliveryInstrument } from '../core/quality/delivery-verdict';
import { deliveryRun } from '../core/quality/delivery-run';
import * as gate from '../core/quality/acceptance-gate';

// The delivery run loads the pipeline (its reducers) the first time it is built: a cold transform takes a while.
jest.setTimeout(240_000);

const roots: string[] = [];
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

function tree(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-eng-verify-run-'));
    roots.push(dir);
    for (const [name, body] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body);
    }
    return dir;
}

function run(request: string, root: string, opts: { service?: boolean; interface?: boolean; runTool?: (tool: string, input: any) => Promise<any> } = {}) {
    const ledger = new DeliveryLedger();
    const required: DeliveryInstrument[] = [];
    const delivery = deliveryRun({
        productRequest: request,
        ledger,
        deliveryRoles: { service: opts.service === true, interface: opts.interface !== false, program: false },
        deliveredRoots: (extra = []) => Array.from(new Set([root, ...extra].filter(r => r && fs.existsSync(r)).map(r => path.resolve(r)))),
        deliveryParts: () => [{ root, tool: 'general_agent' }],
        runTool: opts.runTool || (async () => { throw new Error('no tool expected'); }),
        requireInstrument: instrument => { if (!required.includes(instrument)) required.push(instrument); },
    });
    return { ledger, required, delivery };
}

describe('the live acceptance both engines record', () => {
    it('a static fallback standing in for a requested server is a failed live run, and what only a live system shows is forgotten', async () => {
        const root = tree({ 'index.html': '<h1>Clinic</h1>', 'server.js': "require('http').createServer(() => {}).listen(3000);" });
        const { ledger, delivery } = run('Build a REST API for a dental clinic with patients and appointments.', root, { service: true, interface: false });
        // A manifest contract measured earlier must not survive a dead system.
        ledger.record({ instrument: 'quality', ok: true });
        await delivery.recordLiveAcceptance({
            ok: true,
            output: { url: 'http://127.0.0.1:45871/', cwd: root, kind: 'static-site', fallbackFrom: 'the start command answered on no port' },
        }, root, [root]);
        expect(ledger.all()).toEqual([{
            instrument: 'live', ok: false, url: '', target: '',
            error: 'the server did not start; only static files were served (the start command answered on no port)',
        }]);
        expect(delivery.state).toEqual({ liveUrl: '', scopeAudit: { requested: 0, built: 0, coverage: 0, missing: [] } });
    });

    it('a landing page whose start script fell back to its static site keeps the fallback, and is judged on quality and scope', async () => {
        const root = tree({ 'index.html': '<!doctype html><html lang="en"><title>Maple</title><h1>Maple Coffee House</h1></html>', 'package.json': JSON.stringify({ scripts: { start: 'node missing.js' } }) });
        const { ledger, delivery } = run('Build a one-page website for Maple Coffee House that shows the opening hours.', root);
        await delivery.recordLiveAcceptance({
            ok: true,
            output: { url: 'http://127.0.0.1:45872/', cwd: root, kind: 'static-site', fallbackFrom: 'runtime target is missing (missing.js)' },
        }, root, [root]);
        expect(ledger.all().map(m => [m.instrument, m.ok])).toEqual([['live', true], ['quality', true], ['scope', true]]);
        expect(delivery.state.liveUrl).toBe('http://127.0.0.1:45872/');
        expect(delivery.state.requestCoverage).toBeUndefined();
    });

    it('tests the request asks for become required, and run once per unchanged tree however often it is measured', async () => {
        const root = tree({
            'server.js': "const express = require('express');\nconst app = express();\napp.get('/api/patients', (req, res) => res.json([]));\napp.listen(3000);\n",
            'test/patients.test.js': "test('GET /api/patients', () => {});\n",
            'package.json': JSON.stringify({ scripts: { start: 'node server.js', test: 'node --test' } }),
        });
        const asked: Array<{ tool: string; input: any }> = [];
        const runTool = async (tool: string, input: any) => {
            asked.push({ tool, input });
            return { ok: true, output: { results: [{ task: 'test', ok: true, skipped: false }], status: 'completed' } };
        };
        const { ledger, required, delivery } = run('Build a REST API for a dental clinic with patients, with automated tests for every endpoint.', root, { service: true, interface: false, runTool });
        await delivery.measureRequestedRecords({ ok: true, output: { cwd: root } }, [root]);
        await delivery.measureRequestedRecords({ ok: true, output: { cwd: root } }, [root]);
        expect(required).toEqual(['tests']);
        expect(asked).toEqual([{ tool: 'quality_run', input: { path: root, tasks: ['test'] } }]);
        const tests = ledger.all().find(m => m.instrument === 'tests');
        expect(tests?.ok).toBe(true);
        expect(fs.realpathSync(String(tests?.target))).toBe(fs.realpathSync(root));
        expect(delivery.state.requestCoverage?.testsRequested).toBeTruthy();
    });
});

describe('the ledger\'s instruments for a hand-written project', () => {
    const base = { phaseVerified: true, requestFidelityBlocked: false };
    const live = { instrument: 'live' as const, ok: true, url: 'http://127.0.0.1:4000/' };

    it('a refused acceptance blocks the delivery and is never a partial one, and no Browser QA runs to rescue it', () => {
        const measurements = [live, { instrument: 'acceptance' as const, ok: false, error: 'acceptance_criteria_unmet: req-1' }];
        const v = deliveryVerdict({ ...base, measurements, required: ['acceptance'] });
        expect(v).toMatchObject({ verified: false, partial: false, firstError: 'acceptance_criteria_unmet: req-1' });
        expect(mayRunBrowserQa(measurements)).toBe(false);
        // Unmeasured, it is not a pass either.
        expect(deliveryVerdict({ ...base, measurements: [live], required: ['acceptance'] })).toMatchObject({ verified: false, unmeasured: ['acceptance'] });
    });

    it('the source and the build are named before what depends on them', () => {
        expect(DELIVERY_PRIORITY.indexOf('source')).toBeLessThan(DELIVERY_PRIORITY.indexOf('acceptance'));
        expect(DELIVERY_PRIORITY.indexOf('build')).toBeLessThan(DELIVERY_PRIORITY.indexOf('service'));
        expect(DELIVERY_PRIORITY.indexOf('acceptance')).toBeLessThan(DELIVERY_PRIORITY.indexOf('scope'));
        const v = deliveryVerdict({ ...base, measurements: [live,
            { instrument: 'acceptance', ok: false, error: 'acceptance_criteria_unmet: req-1' },
            { instrument: 'build', ok: false, error: 'the build failed' },
            { instrument: 'source', ok: false, error: 'server.js: SyntaxError' }] });
        expect(v.firstError).toBe('server.js: SyntaxError');
        expect(v.partial).toBe(false);
    });
});

describe('the old callers call the moved gates', () => {
    it('the React builder\'s request reader and blocking rule are the ones in core/quality', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const react = require('../modules/tools/definitions/ReactProjectTool');
        expect(react.readRequestRequirements).toBe(gate.readRequestRequirements);
        expect(react.acceptanceBlocksDelivery).toBe(gate.acceptanceBlocksDelivery);
        expect(react.deliveryErrorForAcceptance).toBe(gate.deliveryErrorForAcceptance);
        expect(react.deliveryErrorForUnreadRequest).toBe(gate.deliveryErrorForUnreadRequest);
    });

    it('the pipeline records its live acceptance through the shared delivery run (the wiring is the point)', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectPipelineTool.ts'), 'utf8');
        expect(src).toMatch(/const delivery = deliveryRun\(\{\s*productRequest,\s*ledger,\s*deliveryRoles,\s*deliveredRoots,/);
        expect(src).toMatch(/const recordLiveAcceptance = async \(runRes: any, qualityRoot: string, auditRoots: string\[\]\) => \{\s*lastAcceptanceRoots = \{ qualityRoot, auditRoots \};\s*try \{\s*await delivery\.recordLiveAcceptance\(runRes, qualityRoot, auditRoots\);/);
        // …and keeps every fact the run established for its report, even when the measurement raised.
        expect(src).toMatch(/\} finally \{[^}]*liveUrl = delivery\.state\.liveUrl;\s*scopeAudit = delivery\.state\.scopeAudit;\s*requestCoverage = delivery\.state\.requestCoverage;\s*\}\s*return syncFromLedger\(\);/);
        // No second copy of the closures is left behind in the pipeline.
        expect(src).not.toMatch(/const measureRequestedRecords = async/);
        expect(src).not.toMatch(/applyLiveRunOutcome\(true, runRes\)/);
    });
});
