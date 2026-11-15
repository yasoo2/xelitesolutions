/**
 * THE NO-WRITE WALK WRITES NOTHING INTO THE OWNER'S LIVE APP (design v13.3 §5, §12.3; agent H).
 *
 * The lab's real shapes (`fixtures/live-app`), each the owner's delivered app, started for real by Joe's own
 * `project_run` and holding his records. Each one can send (it depends on `nodemailer`), so the door's router sends
 * it to path 3. Then the real `auditBuiltApp` walks it with the door options a change run passes, and the test reads
 * what really reached his server (`<project>.req.log`) and compares his store byte for byte.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { hasDeliveryRecord, type QaPin } from '../core/quality/qa-target';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';
import { labShape, OWNER_ACCOUNT, requestsOf, clearLog, writesOf, sleep, type LiveShape } from './fixtures/live-app/live-app';

jest.setTimeout(900_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-nowrite-h-'));
const workspace = path.join(tmp, 'projects');
fs.mkdirSync(workspace, { recursive: true });
const TOOL_CONTEXT = { sessionId: 'joe-nowrite-h-session', workspaceId: 'joe-nowrite-h', userId: 'joe-nowrite-h-user', runId: 'joe-nowrite-h-run' };
const SENDS = { nodemailer: '6.9.0' };

beforeEach(() => { jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace); });
afterEach(async () => {
    await executionFirewall.runInContext('joe-nowrite-h-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    jest.restoreAllMocks();
});
afterAll(() => { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

interface Walked { audit: any; writes: string[]; requests: string[]; storeSame: boolean; before: Buffer; after: Buffer }

/** Starts the shape with Joe's project_run, walks it as a change run, stops it, and reads what reached it. */
async function walkLive(shape: LiveShape, opts: { request: string; credentials?: Record<string, string>; apiOnNextPort?: boolean; streamTo?: string } = { request: '' }): Promise<Walked> {
    const run: any = await executionFirewall.runInContext('joe-nowrite-h-run', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, TOOL_CONTEXT));
    expect({ ok: run?.ok, error: run?.error }).toEqual({ ok: true, error: undefined });
    const url = String(run.output.url);
    await sleep(400);
    const before = fs.existsSync(shape.store) ? fs.readFileSync(shape.store) : Buffer.alloc(0);
    clearLog(shape);
    const pub = `${shape.dir}-pub`;
    fs.mkdirSync(pub, { recursive: true });
    fs.writeFileSync(path.join(pub, 'index.html'), '<!doctype html><main><h1>app</h1></main>');
    const origin = new URL(url).origin;
    const walkedOrigins = [origin, ...(opts.apiOnNextPort ? [`${new URL(url).protocol}//${new URL(url).hostname}:${Number(new URL(url).port) + 1}`] : [])];
    const pin: QaPin = { record: hasDeliveryRecord(shape.dir) };
    const { auditBuiltApp } = require('../core/quality/app-audit');
    const audit = await auditBuiltApp(pub, {
        serveUrl: url, request: opts.request, timeoutMs: 60_000, requireAuthenticatedCoverage: true,
        ...(opts.credentials ? { credentials: opts.credentials } : {}),
        projectRoot: shape.dir, serverRoot: String(run.output.cwd || shape.dir), startKind: String(run.output.kind || ''), qaPin: pin, walkedOrigins,
        ...(opts.streamTo ? { streamTo: opts.streamTo, requireVisibleBrowser: true } : {}),
    });
    await sleep(600);
    const after = fs.existsSync(shape.store) ? fs.readFileSync(shape.store) : Buffer.alloc(0);
    const writes = writesOf(shape);
    const requests = requestsOf(shape);
    await executionFirewall.runInContext('joe-nowrite-h-stop', () => new ProjectStopTool().execute({}, TOOL_CONTEXT)).catch(() => undefined);
    return { audit, writes, requests, storeSame: before.equals(after), before, after };
}

const ids = (a: any): string[] => (a.findings || []).map((f: any) => f.id);
const CUSTOMERS = 'Build a customer management system: add, edit and delete customers';

describe('12.3 rows 1, 8 — a customer list with add, edit and delete links, streamed to his panel', () => {
    it('his store is byte-identical, no write reached his server, the «Remove …» links and the add form are listed not tried, and he watched it', async () => {
        const hub = require('../modules/browser/wsHub');
        const manager = require('../modules/browser/manager');
        const SID = 'joe-nowrite-h-panel';
        const frames: any[] = [];
        const watchers = jest.spyOn(hub, 'panelWatcherCount').mockImplementation((...args: unknown[]) => (args[0] === SID ? 1 : 0));
        const sent = jest.spyOn(hub, 'broadcastBrowserEvent').mockImplementation((...args: unknown[]) => { if (args[0] === SID && (args[1] as any)?.type === 'stream_frame') frames.push(args[1]); });
        let paused = 0; let resumed = 0;
        const realPause = manager.pauseStreaming;
        const pause = jest.spyOn(manager, 'pauseStreaming').mockImplementation((...args: unknown[]) => { paused++; const r = realPause(args[0] as string); return () => { resumed++; r(); }; });
        const shape = labShape(workspace, 'customers-getdel', 'app9', 'getdel', { dependencies: SENDS });
        const w = await walkLive(shape, { request: CUSTOMERS, streamTo: SID });
        expect(w.audit.skipped).toBeUndefined();
        expect(w.audit.qaPath).toMatchObject({ path: 'no-write', comparable: true });
        expect(w.audit.qaPath.reasons[0].key).toBe('sender');
        expect(w.storeSame).toBe(true);
        expect(w.writes).toEqual([]);
        //  Not even a read that writes: no GET to /remove reached him.
        expect(w.requests.filter(l => /remove|delete/i.test(l))).toEqual([]);
        expect(w.requests.some(l => /^GET \//.test(l))).toBe(true);
        expect(w.audit.qaPath.notTried).toEqual(expect.arrayContaining(['link: Remove Huda Salem', 'link: Remove Omar Nasser', 'link: Remove Lina Faris', 'form: Add customer']));
        //  Row 8: the private walk reached his panel as frames; the panel's own loop was paused for it, then resumed.
        expect(paused).toBeGreaterThanOrEqual(1);
        expect(resumed).toBe(paused);
        expect(manager.isStreamingPaused(SID)).toBe(false);
        expect(frames.length).toBeGreaterThan(0);
        expect(frames[0]).toEqual(expect.objectContaining({ type: 'stream_frame', jpegBase64: expect.any(String) }));
        expect(w.audit.qaPath.streamed).toBe(true);
        watchers.mockRestore(); sent.mockRestore(); pause.mockRestore();
    });
});

describe('12.3 row 2 — reads that write (GET deletes, a GET form, both)', () => {
    for (const [name, flags] of [['getdelx', 'getdelx'], ['getform', 'getform'], ['getget', 'getform,getdelx']] as const) {
        it(`${name}: byte-identical, no write and no GET that writes reached his server`, async () => {
            const shape = labShape(workspace, name, 'app11', flags, { dependencies: SENDS });
            const w = await walkLive(shape, { request: CUSTOMERS });
            expect(w.audit.qaPath?.path).toBe('no-write');
            expect(w.storeSame).toBe(true);
            expect(w.writes).toEqual([]);
            expect(w.requests.filter(l => /^GET \/(?:remove|add|customers\/\d+\/d)/i.test(l))).toEqual([]);
            expect(w.requests.filter(l => /joe\.qa|QA%20Tester|QA\+Tester|qa\.tester|__joeQaXss/i.test(l))).toEqual([]);
            expect(w.audit.qaPath.notTried).toContain('form: Add customer');
        });
    }
});

describe('12.3 rows 3–4 — signing in is the one write, and only with the account he gave', () => {
    it('staff (change-password and staff-account forms): the only write his server sees is one POST /login, and his password goes nowhere else', async () => {
        const shape = labShape(workspace, 'staff', 'app11', 'wall,staff', { dependencies: SENDS });
        const w = await walkLive(shape, { request: 'Build a customer system with a staff sign-in', credentials: { ...OWNER_ACCOUNT } });
        expect(w.audit.qaPath?.path).toBe('no-write');
        expect(w.audit.qaPath.signedIn).toBe(true);
        expect(w.writes.map(l => l.replace(/ {2}BODY.*$/, ''))).toEqual(['POST /login']);
        expect(w.requests.filter(l => l.includes(OWNER_ACCOUNT.password)).map(l => l.split(' ').slice(0, 2).join(' '))).toEqual(['POST /login']);
        expect(w.storeSame).toBe(true);
        expect(w.audit.qaPath.notTried).toEqual(expect.arrayContaining(['form: Add customer']));
        expect(w.audit.qaPath.notTried.some((l: string) => /staff/i.test(l))).toBe(true);
    });

    it('an account with no identity is no allowance: no write passes at all', async () => {
        const shape = labShape(workspace, 'wall-empty-id', 'app9', 'wall', { dependencies: SENDS });
        const w = await walkLive(shape, { request: CUSTOMERS, credentials: { identity: '', email: '', password: OWNER_ACCOUNT.password } });
        expect(w.audit.qaPath?.path).toBe('no-write');
        expect(w.writes).toEqual([]);
        expect(w.storeSame).toBe(true);
    });
});

describe('12.3 row 5 — a dead submit is not tried, told; a dead button stays charged', () => {
    for (const [name, app, flags] of [['dead', 'app9', 'dead'], ['trackdead', 'app11', 'track,dead']] as const) {
        it(`${name}: the submit is not pressed, listed, and not judged dead`, async () => {
            const shape = labShape(workspace, name, app, flags, { dependencies: SENDS });
            const w = await walkLive(shape, { request: CUSTOMERS });
            expect(w.audit.qaPath?.path).toBe('no-write');
            expect(w.storeSame).toBe(true);
            expect(w.writes).toEqual([]);
            expect(ids(w.audit)).not.toContain('form_dead_submit');
            expect(w.audit.qaPath.notTried).toContain('form: Add customer');
        });
    }
    it('beat (a button that does nothing): some_dead_controls is still charged on path 3', async () => {
        const shape = labShape(workspace, 'beat', 'app9', 'beat,pageerr,dead', { dependencies: SENDS });
        const w = await walkLive(shape, { request: CUSTOMERS });
        expect(w.audit.qaPath?.path).toBe('no-write');
        expect(w.storeSame).toBe(true);
        //  Its heartbeat POST every second is the page's own write: aborted, so none reached him.
        expect(w.writes).toEqual([]);
        expect(ids(w.audit)).toContain('some_dead_controls');
    });
});

describe('12.3 rows 6, 6b — nothing a blocked request caused is charged', () => {
    it('refresh: its session upkeep was refused, so session_lost_on_reload is «not tried», not charged; it signed in, nothing else', async () => {
        const shape = labShape(workspace, 'refresh', 'app12', '-', { dependencies: SENDS });
        const w = await walkLive(shape, { request: 'Build a notes app with a sign-in', credentials: { ...OWNER_ACCOUNT } });
        expect(w.audit.qaPath?.path).toBe('no-write');
        expect(w.storeSame).toBe(true);
        expect(w.writes.every(l => /^POST \/api\/auth\/login\b/.test(l))).toBe(true);
        expect(ids(w.audit)).not.toContain('session_lost_on_reload');
        expect(ids(w.audit)).not.toContain('auth_failed');
    });

    for (const [name, flags] of [['wshello', 'wshello'], ['rpc', 'rpc']] as const) {
        it(`${name}: byte-identical, and no console error or failed request caused by a block is charged`, async () => {
            const shape = labShape(workspace, name, 'app11', flags, { dependencies: SENDS });
            const w = await walkLive(shape, { request: CUSTOMERS });
            expect(w.audit.qaPath?.path).toBe('no-write');
            expect(w.storeSame).toBe(true);
            expect(w.writes).toEqual([]);
            expect(ids(w.audit)).not.toContain('failed_requests');
            expect(ids(w.audit)).not.toContain('console_errors');
            expect(ids(w.audit)).not.toContain('page_errors');
        });
    }

    it('xapi (a front and its own API on the next port, the API origin walked): signs in, reads, writes nothing else', async () => {
        const shape = labShape(workspace, 'xapi', 'app10', '-', { dependencies: SENDS });
        const w = await walkLive(shape, { request: 'Build a customer list with a sign-in', credentials: { ...OWNER_ACCOUNT }, apiOnNextPort: true });
        expect(w.audit.qaPath?.path).toBe('no-write');
        expect(w.storeSame).toBe(true);
        expect(w.audit.qaPath.signedIn).toBe(true);
        expect(ids(w.audit)).not.toContain('auth_failed');
        expect(w.writes).toEqual(['POST /login']);
        expect(w.requests.some(l => /^API-GET \/customers/.test(l))).toBe(true);
        expect(w.audit.qaPath.blocked).toBe(0);
    });
});

describe('12.3 row 7 — the interaction probe on path 3', () => {
    it('on his live search page it types but sends nothing: the page\'s own search POST, an Enter and an apply never reach him; without the options they do', async () => {
        const shape = labShape(workspace, 'search', 'app9', 'search', { dependencies: SENDS });
        const run: any = await executionFirewall.runInContext('joe-nowrite-h-run7', () => new ProjectRunTool().execute({ cwd: shape.dir, restart: true }, TOOL_CONTEXT));
        expect({ ok: run?.ok, error: run?.error }).toEqual({ ok: true, error: undefined });
        const url = String(run.output.url);
        await sleep(400);
        const before = fs.readFileSync(shape.store);
        const { measureInteractions } = require('../core/quality/interaction-probe');
        const { startQaFence } = require('../core/quality/qa-fence');
        //  As the verification runs it on path 3 (delivery-run.ts: qaPath and browserProxy from its pin and probe fence).
        clearLog(shape);
        const fence = await startQaFence({ allow: [new URL(url).origin] });
        let guarded: any;
        try {
            guarded = await measureInteractions(url, ['search'], { timeoutMs: 60_000, qaPath: 'no-write', browserProxy: fence.proxy });
        } finally { await fence.close(); }
        await sleep(400);
        const guardedRequests = requestsOf(shape);
        expect(writesOf(shape)).toEqual([]);
        expect(guardedRequests.filter(l => /[?&]q=/.test(l))).toEqual([]);
        expect(guardedRequests.some(l => /^GET \//.test(l))).toBe(true);
        expect(fs.readFileSync(shape.store).equals(before)).toBe(true);
        expect(guarded.results.find((r: any) => r.capability === 'search')).toBeDefined();
        //  The same probe as today (no option): the page's search POST reaches his server — the test sees writes when they happen.
        clearLog(shape);
        await measureInteractions(url, ['search'], { timeoutMs: 60_000 });
        await sleep(400);
        expect(writesOf(shape).some(l => /^POST \/api\/search/.test(l))).toBe(true);
    });
});
