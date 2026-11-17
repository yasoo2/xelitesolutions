/**
 * THE WAY JOE'S CHECKS TREAT THE OWNER'S DATA IS CHOSEN ONCE, AT THE DOOR OF THE WALK (design v13.3 §2, §12.1; agent H).
 *
 * `auditBuiltApp` is called from 15 places. Each of them reaches the same door (`openQaDoor`), which reads the folder the
 * walked server runs from and chooses:
 *   - a folder Joe never delivered (no delivery record: §2.1) is a new build — walked exactly as today, the panel borrowed;
 *   - a delivered folder is the owner's live app — a private walk behind the fence: path 1 when the walked origin holds none
 *     of his data (no serveUrl, a static preview, a dev server proven a front), 2T for a Node server today's put-back covers,
 *     and path 3 (nothing written) for everything not proven;
 *   - one loop keeps one way of checking (the pin, §2.3): a round that needs a stricter path runs it, is told incomparable,
 *     and is rolled back.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { openQaDoor } from '../core/quality/app-audit';
import { improveUntilItStops, auditNotComparable, notComparableLine } from '../core/quality/improve-loop';
import type { QaPin } from '../core/quality/qa-target';
import { attackShape, attackShapeNames, labShape, serve, DELIVERED_HISTORY, type Served } from './fixtures/live-app/live-app';

jest.setTimeout(600_000);

const tmp = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-door-h-'));
afterAll(() => { jest.restoreAllMocks(); fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

const SRC = path.join(__dirname, '..');
const SID = 'joe-door-h-panel';
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/** A folder with a page to walk (`dist/index.html`), so the door has something to open. */
function withPage(dir: string): string {
    fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title></head><body><main><h1>Shop</h1><p>Welcome.</p></main></body></html>');
    return dir;
}

interface Site {
    n: number;
    /** The file and the text of the call, as it stands in the tree. */
    file: string;
    anchor: string;
    /** The site gives the walk a live address. */
    serveUrl: boolean;
    /** The options object the site passes, for a project folder `root` (its app), a live `url` and the loop's `pin`. */
    options(root: string, url: string, pin: QaPin, shared: string): Record<string, any>;
}

/*
 * The 15 call sites (§2's table, re-taken at r40-acc): what each passes to auditBuiltApp. The source check below pins
 * that each call in the tree still carries its door options; the options here are the same objects, built for a test folder.
 */
const SITES: Site[] = [
    { n: 1, file: 'core/engine/verify.ts', anchor: 'audit: (dir, auditOpts) => auditBuiltApp(dir, auditOpts)', serveUrl: true,
        options: (root, url, pin) => ({ request: 'x', watchSessionId: SID, serveUrl: url, artifactRootDir: root, requireVisibleBrowser: true, timeoutMs: 45_000, requireAuthenticatedCoverage: true, projectRoot: root, qaPin: pin, streamTo: SID, serverRoot: root, startKind: 'npm-start', walkedOrigins: [new URL(url).origin] }) },
    ...[['browserQa = await auditBuiltApp(auditDir, {', 2], ['const coverageRetry = await auditBuiltApp(auditDir, {', 3], ['const infrastructureRetry = await auditBuiltApp(auditDir, {', 4]].map(([anchor, n]) => ({
        n: n as number, file: 'modules/tools/definitions/ProjectPipelineTool.ts', anchor: anchor as string, serveUrl: true,
        options: (root: string, url: string, pin: QaPin) => ({ request: 'x', watchSessionId: SID, serveUrl: url, artifactRootDir: root, requireVisibleBrowser: true, timeoutMs: 45_000, projectRoot: root, serverRoot: root, startKind: 'npm-start', qaPin: pin, streamTo: SID }),
    })),
    { n: 5, file: 'modules/tools/definitions/ProjectPipelineTool.ts', anchor: 'const recheck = await auditBuiltApp(auditDir, {', serveUrl: true,
        options: (root, url, pin) => ({ request: 'x', watchSessionId: SID, serveUrl: url, artifactRootDir: root, timeoutMs: 45_000, qaPin: pin, streamTo: SID, projectRoot: root }) },
    ...[['const before = await auditBuiltApp(auditDir, {', 6], ['const measured = await auditBuiltApp(auditDir, {', 7]].map(([anchor, n]) => ({
        n: n as number, file: 'modules/tools/definitions/ProjectRepairTool.ts', anchor: anchor as string, serveUrl: true,
        //  The repair tool's artifactRootDir is the SHARED root (never delivered here): the door must not read it.
        options: (root: string, url: string, pin: QaPin, shared: string) => ({ request: 'x', timeoutMs: 30_000, watchSessionId: SID, requireVisibleBrowser: true, requireAuthenticatedCoverage: true, serveUrl: url, artifactRootDir: shared, projectRoot: root, serverRoot: root, qaPin: pin, streamTo: SID }),
    })),
    { n: 8, file: 'modules/tools/definitions/ProjectEditTool.ts', anchor: "const a = await auditBuiltApp(path.join(dir, 'dist'), { projectRoot: dir });", serveUrl: false,
        options: root => ({ projectRoot: root }) },
    ...[["audit = await auditBuiltApp(path.join(dir, 'dist'), {", 9], ["const measured = await auditBuiltApp(path.join(dir, 'dist'), {", 10]].map(([anchor, n]) => ({
        n: n as number, file: 'modules/tools/definitions/ProjectEditTool.ts', anchor: anchor as string, serveUrl: false,
        options: (root: string, _url: string, pin: QaPin) => ({ timeoutMs: 180_000, watchSessionId: SID, requireVisibleBrowser: true, projectRoot: root, qaPin: pin, streamTo: SID }),
    })),
    ...[["audit = await auditBuiltApp(path.join(proj, 'dist'), {\n                request,\n                // His", 11], ["audit = await auditBuiltApp(path.join(proj, 'dist'), {\n                        request,\n                        offline: noInstall,", 12], ["const a = await auditBuiltApp(path.join(proj, 'dist'), {", 13]].map(([anchor, n]) => ({
        n: n as number, file: 'modules/tools/definitions/ReactProjectTool.ts', anchor: anchor as string, serveUrl: true,
        options: (root: string, url: string, pin: QaPin) => ({ request: 'x', timeoutMs: 180_000, watchSessionId: SID, requireVisibleBrowser: true, serveUrl: url, projectRoot: root, qaPin: pin, serverRoot: root, startKind: 'node-entry', streamTo: SID }),
    })),
    ...[['const before = await auditBuiltApp(distDir, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID, ...qaOptions });', 14], ['const after = await auditBuiltApp(distDir, { timeoutMs: 30_000, watchSessionId: PANEL_BROWSER_SID, ...qaOptions })', 15]].map(([anchor, n]) => ({
        n: n as number, file: 'modules/tools/definitions/UiFixTool.ts', anchor: anchor as string, serveUrl: false,
        options: (root: string, _url: string, pin: QaPin) => ({ timeoutMs: 30_000, watchSessionId: 'panel-browser', projectRoot: root, qaPin: pin, streamTo: SID }),
    })),
];

/** The call's own text: from its anchor to the end of its options object. */
function callText(file: string, anchor: string): string {
    const src = read(file).replace(/\r\n/g, '\n');
    const at = src.indexOf(anchor);
    if (at < 0) return '';
    const open = src.indexOf('{', at + anchor.lastIndexOf('(') );
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
    }
    return src.slice(at);
}

describe('12.1 row 1 — every call site, on a folder without a delivery record, is walked as today', () => {
    it('the 15 calls in the tree each carry the door options (the owner\'s folder and the loop\'s pin)', () => {
        expect(SITES.map(s => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
        for (const s of SITES) {
            const text = callText(s.file, s.anchor);
            expect({ site: s.n, found: text.length > 0 }).toEqual({ site: s.n, found: true });
            if (s.n === 1) {
                //  verify.ts hands its options to the panel's audit; the options builder carries the door's facts.
                expect(read(s.file)).toMatch(/projectRoot: root, qaPin: pin, streamTo: eye\.sessionId/);
                continue;
            }
            expect({ site: s.n, door: /\.\.\.qaOptions|projectRoot:/.test(text) }).toEqual({ site: s.n, door: true });
            if (/\.\.\.qaOptions/.test(text)) expect({ site: s.n, root: /const qaOptions = \{[^}]*projectRoot/s.test(read(s.file)) }).toEqual({ site: s.n, root: true });
        }
    });

    it('as today: the panel is borrowed where the site passes a watchSessionId, and the walk is today\'s', async () => {
        const manager = require('../modules/browser/manager');
        const hub = require('../modules/browser/wsHub');
        const borrowed: string[] = [];
        const borrow = jest.spyOn(manager, 'getBrowserSession').mockImplementation(async (...args: unknown[]) => { borrowed.push(String(args[0])); throw new Error('no panel in this test'); });
        const watchers = jest.spyOn(hub, 'panelWatcherCount').mockImplementation(() => 1);
        const live: Served = await serve((_q, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end('<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Shop</title></head><body><main><h1>Shop</h1></main></body></html>'); });
        const { auditBuiltApp } = require('../core/quality/app-audit');
        try {
            for (const s of SITES) {
                const root = withPage(fs.mkdtempSync(path.join(tmp, `new-${s.n}-`)));
                const shared = fs.mkdtempSync(path.join(tmp, `shared-${s.n}-`));
                const opts: Record<string, any> = { ...s.options(root, live.url, {}, shared), timeoutMs: 8_000, walkMs: 4_000 };
                borrowed.length = 0;
                const a = await auditBuiltApp(path.join(root, 'dist'), opts);
                expect({ site: s.n, path: a.qaPath?.path }).toEqual({ site: s.n, path: 'as-today' });
                expect({ site: s.n, borrowed: borrowed[0] }).toEqual({ site: s.n, borrowed: opts.watchSessionId });
            }
        } finally {
            borrow.mockRestore();
            watchers.mockRestore();
            await live.close();
        }
    });
});

describe('12.1 row 2 — the same 15 sites on a delivered folder', () => {
    it('the 10 sites with a serveUrl choose 2T for a Node server whose JSON store today\'s put-back covers, no-write once it can send; the 5 without one choose path 1', async () => {
        const store = labShape(tmp, 'delivered-store', 'app9', 'dead', { delivered: true });
        withPage(store.dir);
        fs.mkdirSync(path.dirname(store.store), { recursive: true });
        fs.writeFileSync(store.store, JSON.stringify({ seq: 1, customers: [{ id: 1, name: 'Huda Salem' }] }));
        const sender = labShape(tmp, 'delivered-sender', 'app9', 'dead', { delivered: true, dependencies: { nodemailer: '6.9.0' } });
        withPage(sender.dir);
        const shared = withPage(fs.mkdtempSync(path.join(tmp, 'shared-root-')));
        const url = 'http://127.0.0.1:59123/';
        const ran: Array<{ site: number; store: string; sender: string; reason?: string }> = [];
        for (const s of SITES) {
            const a = await openQaDoor(path.join(store.dir, 'dist'), s.options(store.dir, url, {}, shared));
            const b = await openQaDoor(path.join(sender.dir, 'dist'), s.options(sender.dir, url, {}, shared));
            try {
                ran.push({ site: s.n, store: String(a?.path), sender: String(b?.path), ...(b?.choice.reasons[0] ? { reason: b.choice.reasons[0].key } : {}) });
            } finally {
                await a?.close();
                await b?.close();
            }
        }
        const withUrl = ran.filter(r => SITES.find(s => s.n === r.site)!.serveUrl);
        const without = ran.filter(r => !SITES.find(s => s.n === r.site)!.serveUrl);
        expect(withUrl.map(r => r.site)).toEqual([1, 2, 3, 4, 5, 6, 7, 11, 12, 13]);
        for (const r of withUrl) expect(r).toEqual({ site: r.site, store: '2t', sender: 'no-write', reason: 'sender' });
        expect(without.map(r => r.site)).toEqual([8, 9, 10, 14, 15]);
        for (const r of without) expect(r).toMatchObject({ site: r.site, store: 'private-live', sender: 'private-live' });
    });
});

describe('12.1 rows 3–4 — what is a delivery record', () => {
    it('an interrupted new build (a failed result, a transcript, a delivery picture) is as today; a run undone from delivered is not', async () => {
        const interrupted = withPage(fs.mkdtempSync(path.join(tmp, 'interrupted-')));
        fs.mkdirSync(path.join(interrupted, '.joe', 'delivery'), { recursive: true });
        fs.writeFileSync(path.join(interrupted, '.joe', 'result.json'), JSON.stringify({ status: 'failed' }));
        fs.writeFileSync(path.join(interrupted, '.joe', 'transcript.jsonl'), '{"role":"user"}\n');
        fs.writeFileSync(path.join(interrupted, '.joe', 'delivery', 'desktop.jpg'), 'jpg');
        fs.mkdirSync(path.join(interrupted, '.joe-versions', 'v1'), { recursive: true });
        const a = await openQaDoor(path.join(interrupted, 'dist'), { projectRoot: interrupted });
        expect(a?.path).toBe('as-today');
        expect(a?.fence).toBeNull();
        await a?.close();

        const undone = withPage(fs.mkdtempSync(path.join(tmp, 'undone-')));
        fs.mkdirSync(path.join(undone, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(undone, '.joe', 'history.json'), JSON.stringify([{ status: 'undone', undoneFrom: 'delivered', at: 1 }]));
        const b = await openQaDoor(path.join(undone, 'dist'), { projectRoot: undone });
        try {
            expect(b?.path).not.toBe('as-today');
            expect(b?.choice.record).toBe('history');
        } finally { await b?.close(); }
    });
});

describe('12.1 rows 5–6 — path 1', () => {
    it('a change run with no serveUrl is walked privately, and the audit\'s own server is the origin the fence lets through', async () => {
        const root = withPage(fs.mkdtempSync(path.join(tmp, 'own-server-')));
        fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(root, '.joe', 'history.json'), DELIVERED_HISTORY);
        const fenceModule = require('../core/quality/qa-fence');
        const real = fenceModule.startQaFence;
        const allowed: string[] = [];
        const started: Array<{ allow: string[] }> = [];
        const spy = jest.spyOn(fenceModule, 'startQaFence').mockImplementation(async (...args: unknown[]) => {
            const input = args[0] as { allow: string[] };
            started.push({ allow: [...input.allow] });
            const f = await real(input);
            const allow = f.allow.bind(f);
            f.allow = (o: string) => { allowed.push(o); allow(o); };
            return f;
        });
        try {
            const { auditBuiltApp } = require('../core/quality/app-audit');
            const a = await auditBuiltApp(path.join(root, 'dist'), { projectRoot: root, timeoutMs: 15_000, walkMs: 8_000 });
            expect(a.qaPath?.path).toBe('private-live');
            expect(started).toEqual([{ allow: [] }]);
            expect(allowed.length).toBeGreaterThanOrEqual(1);
            expect(allowed[0]).toMatch(/^http:\/\/(?:127\.0\.0\.1|localhost):\d+/);
            expect(a.qaPath?.blocked).toBe(0);
            //  The walk reached its page through the fence (it had something to measure).
            expect(a.skipped).toBeUndefined();
        } finally { spy.mockRestore(); }
    });

    it('a change run of Joe\'s static preview (kind static) is path 1', async () => {
        const root = withPage(fs.mkdtempSync(path.join(tmp, 'static-')));
        fs.mkdirSync(path.join(root, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(root, '.joe', 'delivered'), '');
        for (const kind of ['static', 'static-site', 'static-records', 'static-build-fallback']) {
            const d = await openQaDoor(path.join(root, 'dist'), { projectRoot: root, serveUrl: 'http://127.0.0.1:59124/', startKind: kind });
            try { expect({ kind, path: d?.path }).toEqual({ kind, path: 'private-live' }); } finally { await d?.close(); }
        }
        //  A served kind nobody can name is never taken for static.
        for (const kind of ['unknown', 'override', 'already-running', 'expo-web']) {
            const d = await openQaDoor(path.join(root, 'dist'), { projectRoot: root, serveUrl: 'http://127.0.0.1:59124/', startKind: kind });
            try { expect({ kind, path: d?.path }).toEqual({ kind, path: 'no-write' }); } finally { await d?.close(); }
        }
    });
});

describe('12.1 rows 7–9 — a dev server takes path 1 only when it is proven a front', () => {
    const EXPECTED: Record<string, string> = {
        'dev-is-the-server': 'devScript', 'dev-nodemon-server': 'devScript', 'dev-node-watch': 'devScript',
        'dev-concurrently-json-server': 'devScript', 'next-dev-api-route': 'devScript',
        'vite-proxy-shorthand': 'devProxy', 'vite-proxy-quoted-key': 'devProxy', 'vite-proxy-in-other-file': 'devProxy', 'vite-middleware-writes': 'devProxy',
        'vite-api-in-config-module': 'absWrite', 'vite-axios-create': 'browserStore',
    };

    it('the attack\'s 11 dev-server shapes each take path 3, with the reason §13.2 measured', async () => {
        expect(attackShapeNames()).toEqual(Object.keys(EXPECTED).sort());
        const got: Record<string, string> = {};
        for (const name of attackShapeNames()) {
            const dir = withPage(attackShape(path.join(tmp, 'attack'), name));
            const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, serveUrl: 'http://127.0.0.1:59125/' });
            try {
                expect({ name, path: d?.path }).toEqual({ name, path: 'no-write' });
                got[name] = String(d?.choice.reasons[0]?.key);
            } finally { await d?.close(); }
        }
        expect(got).toEqual(EXPECTED);
    });

    it('"dev": "vite" with react + vite only and "test": "node --test" is path 1 (D2 reads only what runs while it serves)', async () => {
        const dir = withPage(fs.mkdtempSync(path.join(tmp, 'vite-front-')));
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'front', private: true, scripts: { dev: 'vite', build: 'vite build', test: 'node --test' }, dependencies: { react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { vite: '^5.4.0', '@vitejs/plugin-react': '^4.3.0' } }, null, 2));
        fs.writeFileSync(path.join(dir, 'vite.config.js'), "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nexport default defineConfig({ plugins: [react()] });\n");
        fs.writeFileSync(path.join(dir, 'index.html'), '<!doctype html><div id="root"></div><script type="module" src="/src/main.jsx"></script>');
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'src', 'main.jsx'), "import { createRoot } from 'react-dom/client';\ncreateRoot(document.getElementById('root')).render(<h1>Shop</h1>);\n");
        fs.mkdirSync(path.join(dir, 'test'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'test', 'sum.test.js'), "const test = require('node:test');\ntest('sums', () => {});\n");
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.joe', 'delivered'), '');
        const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, serveUrl: 'http://127.0.0.1:59126/' });
        try {
            expect(d?.choice.reasons).toEqual([]);
            expect(d?.path).toBe('private-live');
        } finally { await d?.close(); }
    });

    it('vite.config.js importing ./dev.server.config.js that holds proxy: is path 3, devProxy', async () => {
        const dir = withPage(fs.mkdtempSync(path.join(tmp, 'vite-imported-proxy-')));
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'front', private: true, scripts: { dev: 'vite' }, devDependencies: { vite: '^5.4.0' } }, null, 2));
        fs.writeFileSync(path.join(dir, 'vite.config.js'), "import { defineConfig } from 'vite';\nimport server from './dev.server.config.js';\nexport default defineConfig({ server });\n");
        fs.writeFileSync(path.join(dir, 'dev.server.config.js'), "export default { port: 5173, proxy: { '/api': 'http://127.0.0.1:4000' } };\n");
        fs.mkdirSync(path.join(dir, '.joe'), { recursive: true });
        fs.writeFileSync(path.join(dir, '.joe', 'delivered'), '');
        const d = await openQaDoor(path.join(dir, 'dist'), { projectRoot: dir, serveUrl: 'http://127.0.0.1:59127/' });
        try {
            expect(d?.path).toBe('no-write');
            expect(d?.choice.reasons[0]).toMatchObject({ key: 'devProxy' });
            expect(d?.choice.reasons[0].detail).toContain('dev.server.config.js');
        } finally { await d?.close(); }
    });
});

describe('12.1 row 10 — one loop keeps one way of checking', () => {
    it('a round that added nodemailer runs no-write (the stricter), is not comparable, and the loop rolls it back and keeps the first measurement', async () => {
        const app = labShape(tmp, 'loop-app', 'app9', 'dead', { delivered: true });
        withPage(app.dir);
        fs.mkdirSync(path.dirname(app.store), { recursive: true });
        fs.writeFileSync(app.store, JSON.stringify({ seq: 1, customers: [] }));
        const pin: QaPin = {};
        const url = 'http://127.0.0.1:59128/';
        const first = await openQaDoor(path.join(app.dir, 'dist'), { projectRoot: app.dir, serveUrl: url, qaPin: pin });
        await first?.close();
        expect(first?.path).toBe('2t');
        expect(first?.comparable).toBe(true);
        expect(pin.path).toBe('2t');

        const pkgFile = path.join(app.dir, 'package.json');
        const before = fs.readFileSync(pkgFile, 'utf8');
        const lines: string[] = [];
        const rollback = jest.fn(async () => { fs.writeFileSync(pkgFile, before); return true; });
        const firstMeasurement = { score: 70, findingIds: ['form_dead_submit'] };
        let second: Awaited<ReturnType<typeof openQaDoor>> = null;
        const r = await improveUntilItStops(firstMeasurement, {
            repair: async () => {
                //  The round adds a mail sender to the app.
                const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
                pkg.dependencies = { ...(pkg.dependencies || {}), nodemailer: '6.9.0' };
                fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2));
                return ['package.json'];
            },
            rebuild: async () => true,
            measure: async () => {
                second = await openQaDoor(path.join(app.dir, 'dist'), { projectRoot: app.dir, serveUrl: url, qaPin: pin });
                await second?.close();
                const audit = { score: 100, findings: [], qaPath: { path: second?.path, comparable: second?.comparable } };
                const notComparable = auditNotComparable(audit, pin);
                return notComparable ? { score: 0, findingIds: [], skipped: true, notComparable } : { score: 100, findingIds: [] };
            },
            rollback,
            snapshot: () => 'before-round-1',
            say: l => lines.push(l),
            maxRounds: 1,
        });
        expect(second!.path).toBe('no-write');
        expect(second!.comparable).toBe(false);
        expect(second!.choice.reasons[0].key).toBe('sender');
        expect(rollback).toHaveBeenCalledWith('before-round-1');
        expect(r.final).toBe(firstMeasurement);
        expect(r.rounds[0]).toMatchObject({ rolledBack: true, notComparable: { from: '2t', to: 'no-write' } });
        expect(lines.join('\n')).toContain(notComparableLine('en', '2t', 'no-write'));
        //  Rolled back on disk: the app is the one the first measurement measured.
        expect(fs.readFileSync(pkgFile, 'utf8')).toBe(before);
        //  The pin did not move to the round's path.
        expect(pin.path).toBe('2t');
    });
});
