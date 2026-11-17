/**
 * THE ROUTER AND THE TOLD LINES SAY ONLY WHAT IS TRUE (review 8: H3, M2, M4, L4, L5).
 *
 *   H3  a store whose folder comes from the start's arguments (`const [port, root] = process.argv.slice(2)`), or whose
 *       name climbs out of the project, is not one the snapshot keeps: never 2T — unless the app's own code sets that
 *       argument to its own folder (`process.argv[3] = __dirname`), which is the project.
 *   M2  on 2T, when the server would not stop, the chat says it in one line and the certificate never says «put back».
 *   M4  project_repair handed a server it did not start walks it on path 3 and writes nothing back under it.
 *   L4  a page opened once more never waits past what is left of the walk's budget.
 *   L5  a retried build of Joe's that never delivered stays a new build, whatever seed records it holds.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { qaCertificateLine, deliveryCertificate } from '../core/engine/certificate';
import { qaPathLines } from '../core/engine/verify';
import { openPatiently } from '../core/quality/app-audit';
import { chooseQaPath, hasDeliveryRecord } from '../core/quality/qa-target';

jest.setTimeout(120_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r8-truth-'));
afterAll(() => fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }));

function folder(name: string, files: Record<string, string>): string {
    const root = path.join(base, name);
    fs.rmSync(root, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
}
const DELIVERED = JSON.stringify({ runs: [{ status: 'delivered' }] });
const shop = (name: string, start: string, server: string[]) => folder(name, {
    '.joe/history.json': DELIVERED,
    'package.json': JSON.stringify({ name: 'shop', scripts: { start } }),
    'server.js': server.join('\n'),
    'data/orders.json': '[{"id":1}]',
});
const POSTS = "http.createServer((q, r) => { if (q.method === 'POST') { const o = JSON.parse(fs.readFileSync(FILE, 'utf8')); o.push({ id: o.length + 1 }); fs.writeFileSync(FILE, JSON.stringify(o)); } r.end('ok'); }).listen(Number(port));";
const HEAD = "const fs = require('fs'); const path = require('path'); const http = require('http');";

describe('H3 — a store outside the project, or named by the start, is never 2T', () => {
    it('a folder from the start\'s arguments (absolute or ../) is not covered', async () => {
        const outside = folder('shop-data', { 'data/orders.json': '[{"id":1,"customer":"real"}]' }).split(path.sep).join('/');
        for (const where of [outside, '../shop-data']) {
            const dir = shop(`argv-${where.length}`, `node server.js 3000 ${where}`, [HEAD, 'const [port, root] = process.argv.slice(2);', "const FILE = path.join(root, 'data', 'orders.json');", POSTS]);
            const c = await chooseQaPath(dir, { kind: 'node-entry', hasServeUrl: true, record: 'history' });
            expect([where, c.path]).toEqual([where, 'no-write']);
            expect(c.reasons.map(r => r.key)).toContain('notCovered');
        }
        const plain = shop('argv-plain', 'node server.js 3000 ../shop-data', [HEAD, 'const port = process.argv[2]; const root = process.argv[3];', "const FILE = path.join(root, 'data', 'orders.json');", POSTS]);
        expect((await chooseQaPath(plain, { kind: 'node-entry', hasServeUrl: true, record: 'history' })).path).toBe('no-write');
    });

    it('a name that climbs above the project from __dirname is outside it', async () => {
        const dir = shop('climbs', 'node server.js', [HEAD, 'const port = 3000;', "const FILE = path.join(__dirname, '..', 'shop-data', 'orders.json');", POSTS]);
        const c = await chooseQaPath(dir, { kind: 'node-entry', hasServeUrl: true, record: 'history' });
        expect(c.path).toBe('no-write');
        expect(c.reasons.map(r => r.key)).toContain('outsidePath');
    });

    it('the app\'s own code setting the argument to its own folder is the project, as before', async () => {
        const dir = shop('own-folder', 'node server.js', ['process.argv[2] = process.env.PORT; process.argv[3] = __dirname;', HEAD, 'const port = Number(process.argv[2]); const root = process.argv[3];', "const FILE = path.join(root, 'data', 'orders.json');", POSTS]);
        expect((await chooseQaPath(dir, { kind: 'node-entry', hasServeUrl: true, record: 'history' })).path).toBe('2t');
        const unpacked = shop('own-folder-unpacked', 'node server.js', ['process.argv[3] = __dirname;', HEAD, 'const [port, root] = process.argv.slice(2);', "const FILE = path.join(root, 'data', 'orders.json');", POSTS]);
        expect((await chooseQaPath(unpacked, { kind: 'node-entry', hasServeUrl: true, record: 'history' })).path).toBe('2t');
    });
});

describe('M2 — 2T with a server that would not stop: one true line, in the chat and the certificate', () => {
    const q = { path: '2t' as const, blocked: 0, notTried: [], skippedProbes: [], walked: true, origin: 'http://127.0.0.1:5055', leftChanged: { files: ['data/orders.json'], why: 'serverRunning' as const } };

    it('the chat never says «put back as before» for a file left changed, and says it once', () => {
        for (const lang of ['en', 'ar']) {
            const lines = qaPathLines(q, lang);
            const all = lines.join('\n');
            expect(all).not.toMatch(lang === 'en' ? /put back as before/u : /أُعيدت ملفات بيانات تطبيقك كما كانت/u);
            expect(lines.filter(l => l.includes('data/orders.json'))).toHaveLength(1);
            expect(all).toMatch(lang === 'en' ? /were not put back, because your app's server did not stop/u : /ولم تُعَد كما كانت، لأن خادم تطبيقك لم يتوقف/u);
        }
        //  A walk that put everything back keeps today's line.
        expect(qaPathLines({ ...q, leftChanged: undefined }, 'en').join('\n')).toMatch(/put back as before/u);
    });

    it('the certificate names the file left changed, and says «put back» only when it was', () => {
        expect(qaCertificateLine(q, 'en')).toMatch(/were not put back, because your app's server did not stop: data\/orders\.json/u);
        expect(qaCertificateLine(q, 'en')).not.toMatch(/put back as before/u);
        expect(qaCertificateLine(q, 'ar')).toMatch(/ولم تُعَد، لأن خادم تطبيقك لم يتوقف: data\/orders\.json/u);
        expect(qaCertificateLine({ path: '2t', putBackFailed: ['data/shop.db (EBUSY)'] }, 'en')).toMatch(/could not be put back: data\/shop\.db/u);
        expect(qaCertificateLine({ path: '2t' }, 'en')).toMatch(/put back as before/u);
        const cert = deliveryCertificate({ request: 'Add a notes page', summary: 'Added notes.', language: 'en', passed: ['live', 'browser'], qaPath: q });
        expect(cert).not.toMatch(/put back as before/u);
    });
});

describe('M4 — a server handed to project_repair is walked on path 3', () => {
    it('outside a pipeline\'s net, a serveUrl it did not start is no-write, nothing is put back under it, and he is told', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ProjectRepairTool.ts'), 'utf8');
        expect(src).toMatch(/const walksHandedServer = !!serveUrl && !reviving && !context\?\.joeOwnerDataSpan;/u);
        expect(src).toMatch(/if \(\(walksOwnersLiveServer \|\| walksHandedServer\) && qaPin\.record\) \{\s*qaPin\.path = strictest\(qaPin\.path, 'no-write'\);/u);
        expect(src).toMatch(/if \(walksOwnersLiveServer \|\| walksHandedServer\) \{\s*held\.hooks = \(\) => \(\{ stop: async \(\) => false \}\);\s*held\.notOurs = true;/u);
        expect(src).toMatch(/هذا الخادم لم يشغّله جو، فلا يستطيع إيقافه ليعيد بياناتك كما كانت/u);
    });

    it('a span settled with a stop that cannot stop writes nothing back, and says so', async () => {
        process.env.JOE_DATA_DIR = path.join(base, 'joe-data');
        const { openOwnerDataSpan } = require('../core/quality/owner-data-span');
        const root = folder('handed', { '.joe/history.json': DELIVERED, 'data/tasks.json': '[{"id":1}]' });
        const span = await openOwnerDataSpan({ projectRoot: root, pin: { path: 'no-write', record: 'history' }, runId: 'repair-m4', workspaceId: 'ws-m4' });
        fs.writeFileSync(path.join(root, 'data', 'tasks.json'), '[{"id":1},{"id":2}]');
        const s = await span.settle({ stop: async () => false });
        expect(s.left).toBe('serverRunning');
        expect(fs.readFileSync(path.join(root, 'data', 'tasks.json'), 'utf8')).toBe('[{"id":1},{"id":2}]');
        expect(span.lines('en').join('\n')).toMatch(/not put back, because your app's server did not stop/u);
        await span.close();
    });
});

describe('L4 — the second wait fits in what is left of the walk', () => {
    function timeoutError(ms: number) { const e = new Error(`page.goto: Timeout ${ms}ms exceeded.`); e.name = 'TimeoutError'; return e; }
    const page = (outcomes: string[]) => {
        const calls: number[] = [];
        return { calls, async goto(_t: string, o: { timeout: number }) { calls.push(o.timeout); if (outcomes.shift() === 'timeout') throw timeoutError(o.timeout); return { ok: true }; } };
    };

    it('waits no longer than the budget left, and not at all when too little is left', async () => {
        const p = page(['timeout', 'ok']);
        await openPatiently(p, 'http://x/', { waitUntil: 'load', timeout: 12_000, remainingMs: 9_000 });
        expect(p.calls[0]).toBe(12_000);
        expect(p.calls[1]).toBeLessThanOrEqual(9_000);
        expect(p.calls[1]).toBeGreaterThan(8_000);
        const q = page(['timeout', 'ok']);
        await expect(openPatiently(q, 'http://x/', { waitUntil: 'load', timeout: 12_000, remainingMs: 1_000 })).rejects.toThrow(/Timeout 12000ms exceeded/u);
        expect(q.calls).toHaveLength(1);
    });
});

describe('L5 — a retried build that never delivered is still a new build', () => {
    it('its seed records do not make it «data»; an app with no record of Joe\'s at all still does', () => {
        const retried = folder('l5-retry', { '.joe/result.json': JSON.stringify({ status: 'failed' }), 'data/products.json': JSON.stringify([{ id: 1, name: 'Seed tea' }]) });
        expect(hasDeliveryRecord(retried, { resumed: true })).toBe('');
        const history = folder('l5-history', { '.joe/history.json': JSON.stringify([{ status: 'failed' }, { status: 'cancelled' }]), 'data/products.json': JSON.stringify([{ id: 1 }]) });
        expect(hasDeliveryRecord(history, { resumed: true })).toBe('');
        const legacy = folder('l5-legacy', { 'data/customers.json': JSON.stringify([{ id: 1, name: 'Huda' }]) });
        expect(hasDeliveryRecord(legacy, { resumed: true })).toBe('data');
    });
});
