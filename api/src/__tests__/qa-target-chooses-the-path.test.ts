/**
 * THE QA PATH IS CHOSEN ONCE, FROM WHAT THE FOLDER IS (design v13.3 §2, §3, §3b).
 *
 * A folder the owner has never had walks as today. A change run walks a private live preview only when the walked
 * origin holds none of his server data (a static preview, the audit's own server, a dev server proven a front);
 * today's walk with today's put-back (2T) when the best-effort router finds no clear harm in a Node server; and the
 * no-write walk otherwise. The fixtures are the lab's shapes (`accounts-lab/v13`, the v12 attack's dev servers),
 * written at test time — every `.env` included.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chooseQaPath, hasDeliveryRecord, pinnedPath, strictest, type QaPathChoice, type QaPin } from '../core/quality/qa-target';

let base: string;
beforeAll(async () => { base = await fs.promises.mkdtemp(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-qa-target-')); });
afterAll(async () => { await fs.promises.rm(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

const DELIVERED = JSON.stringify([{ request: 'build a shop', status: 'delivered', summary: '', at: 1 }]);
let n = 0;
async function folder(files: Record<string, string | object>, delivered = true): Promise<string> {
    const root = path.join(base, `p${++n}`);
    const all: Record<string, string | object> = delivered ? { '.joe/history.json': DELIVERED, ...files } : files;
    for (const [rel, body] of Object.entries(all)) {
        const abs = path.join(root, rel);
        await fs.promises.mkdir(path.dirname(abs), { recursive: true });
        await fs.promises.writeFile(abs, typeof body === 'string' ? body : JSON.stringify(body, null, 2));
    }
    await fs.promises.mkdir(root, { recursive: true });
    return root;
}
const keys = (c: QaPathChoice) => c.reasons.map(r => r.key);

describe('the delivery record (§2.1)', () => {
    it('is empty for a folder the owner never had, an interrupted build included', async () => {
        expect(hasDeliveryRecord(await folder({}, false))).toBe('');
        const interrupted = await folder({
            '.joe/result.json': { status: 'failed' }, '.joe/transcript.jsonl': '{}\n', '.joe/delivery/desktop.jpg': 'jpg',
            '.joe-versions/v1/index.html': '<h1>x</h1>', 'JOE-DELIVERY.md': '# x',
        }, false);
        expect(hasDeliveryRecord(interrupted)).toBe('');
        expect((await chooseQaPath(interrupted, { kind: 'npm-start', hasServeUrl: true })).path).toBe('as-today');
        expect(hasDeliveryRecord(await folder({ '.joe/history.json': [{ status: 'failed' }, { status: 'cancelled' }] }, false))).toBe('');
        expect(hasDeliveryRecord(await folder({ '.joe/history.json': '{not json' }, false))).toBe('');
    });

    it('names each record a delivered folder can carry', async () => {
        expect(hasDeliveryRecord(await folder({}))).toBe('history');
        expect(hasDeliveryRecord(await folder({ '.joe/history.json': [{ status: 'undone', undoneFrom: 'delivered' }] }, false))).toBe('history');
        expect(hasDeliveryRecord(await folder({ '.joe/history.json': [{ status: 'undone', undoneFrom: 'failed' }] }, false))).toBe('');
        expect(hasDeliveryRecord(await folder({ '.joe/result.json': { status: 'delivered' } }, false))).toBe('result');
        expect(hasDeliveryRecord(await folder({ '.joe/delivered': '' }, false))).toBe('delivered');
        const imported = await folder({ 'README.md': '# his repo' }, false);
        expect(hasDeliveryRecord(imported)).toBe('');
        expect(hasDeliveryRecord(imported, { origin: 'imported' })).toBe('imported');
        expect(hasDeliveryRecord(imported, { origin: 'built' })).toBe('');
    });

    it('is read once per loop: a record given by the pin is used, not the folder', async () => {
        const root = await folder({});
        expect((await chooseQaPath(root, { kind: 'static', hasServeUrl: true, record: '' })).path).toBe('as-today');
        const fresh = await folder({}, false);
        const c = await chooseQaPath(fresh, { kind: 'static', hasServeUrl: true, record: 'history' });
        expect([c.path, c.record]).toEqual(['private-live', 'history']);
    });
});

describe('the door (§2.2)', () => {
    it('walks as today without a record, and privately without a serveUrl or on a static preview', async () => {
        const fresh = await folder({ 'package.json': { scripts: { start: 'node server.js' } } }, false);
        for (const kind of ['npm-start', 'dev-server', 'static', 'unknown']) expect((await chooseQaPath(fresh, { kind, hasServeUrl: true })).path).toBe('as-today');
        const root = await folder({ 'package.json': { scripts: { start: 'node server.js' }, dependencies: { nodemailer: '6' } } });
        expect((await chooseQaPath(root, { kind: 'npm-start', hasServeUrl: false })).path).toBe('private-live');
        for (const kind of ['static', 'static-site', 'static-records', 'static-build-fallback']) expect((await chooseQaPath(root, { kind, hasServeUrl: true })).path).toBe('private-live');
    });

    it('never calls an unknown served kind static', async () => {
        const root = await folder({ 'index.html': '<h1>x</h1>' });
        for (const kind of ['unknown', 'override', 'already-running', 'expo-web', '']) {
            const c = await chooseQaPath(root, { kind, hasServeUrl: true });
            expect([kind, c.path, keys(c)[0]]).toEqual([kind, 'no-write', 'server']);
        }
    });
});

describe('a dev server takes path 1 only when §3 proves it a front', () => {
    const vite = { scripts: { dev: 'vite', build: 'vite build', test: 'node --test' }, dependencies: { react: '18' }, devDependencies: { vite: '5' } };

    it('a Vite + React front, whose test script and test server never run while it serves', async () => {
        const root = await folder({
            'package.json': vite, 'vite.config.js': "import react from '@vitejs/plugin-react';\nexport default { plugins: [react()] };\n",
            'src/main.jsx': "fetch('/api/x').then(r => r.json());\n", 'tests/server.test.js': "require('http').createServer(() => {}).listen(0);\n",
            'index.html': '<div id=root></div>',
        });
        const c = await chooseQaPath(root, { kind: 'dev-server', hasServeUrl: true });
        expect([c.path, c.reasons]).toEqual(['private-live', []]);
        expect(c.facts.files).toBeGreaterThanOrEqual(5);
    });

    it.each([
        ['dev-is-the-server', 'devScript', { 'package.json': { scripts: { dev: 'node server.js' } }, 'server.js': 'require("http").createServer().listen(1)' }],
        ['dev-nodemon-server', 'devScript', { 'package.json': { scripts: { dev: 'nodemon server.js' } } }],
        ['dev-node-watch', 'devScript', { 'package.json': { scripts: { dev: 'node --watch server/index.js' } } }],
        ['dev-concurrently-json-server', 'devScript', { 'package.json': { scripts: { dev: 'concurrently "vite" "json-server --watch db.json --port 3001"' } } }],
        ['next-dev-api-route', 'devScript', { 'package.json': { scripts: { dev: 'next dev' }, dependencies: { next: '14' } }, 'pages/api/orders.js': 'export default (q, r) => r.json([])' }],
        ['vite-proxy-shorthand', 'devProxy', { 'package.json': vite, 'vite.config.js': "const proxy = { '/api': 'http://127.0.0.1:5055' };\nexport default { server: { proxy } };\n" }],
        ['vite-proxy-quoted-key', 'devProxy', { 'package.json': vite, 'vite.config.js': "export default { server: { 'proxy': { '/api': 'http://127.0.0.1:5055' } } };\n" }],
        ['vite-proxy-in-other-file', 'devProxy', { 'package.json': vite, 'vite.config.js': "import dev from './dev.server.config.js';\nexport default { server: dev };\n", 'dev.server.config.js': "export default { proxy: { '/api': 'http://127.0.0.1:5055' } };\n" }],
        ['vite-middleware-writes', 'devProxy', { 'package.json': vite, 'vite.config.js': "export default { plugins: [{ name: 'x', configureServer(server) { server.middlewares.use((q, r, n) => n()); } }] };\n" }],
        ['vite-api-in-config-module', 'absWrite', { 'package.json': vite, 'src/config.js': "export const API_BASE = 'https://api.shop.example';\n" }],
        ['vite-axios-create', 'browserStore', { 'package.json': vite, 'src/api.js': "import axios from 'axios';\nexport const api = axios.create({ baseURL: 'https://api.shop.example' });\n" }],
    ])('%s → no-write (%s)', async (_name, key, files) => {
        const c = await chooseQaPath(await folder(files as Record<string, string | object>), { kind: 'dev-server', hasServeUrl: true });
        expect([c.path, keys(c)[0]]).toEqual(['no-write', key]);
    });

    it('a code file over 2 MB is unread, and a read past the budget is not proven', async () => {
        const big = await folder({ 'package.json': vite, 'src/big.js': `// ${'x'.repeat(2 * 1024 * 1024 + 10)}` });
        expect(keys(await chooseQaPath(big, { kind: 'dev-server', hasServeUrl: true }))).toContain('unread');
        const over = await folder({ 'package.json': vite, 'src/a.js': 'x'.repeat(5000), 'src/b/c.js': 'x'.repeat(5000) });
        expect(keys(await chooseQaPath(over, { kind: 'dev-server', hasServeUrl: true, budgetBytes: 100 }))).toContain('budget');
    });
});

describe('a Node server takes 2T only when the router sees no clear harm (§3b)', () => {
    const SERVER = [
        "const express = require('express');",
        "const fs = require('fs');",
        "const path = require('path');",
        "const FILE = path.join(__dirname, 'data', 'store.json');",
        'const app = express();',
        "app.get('/data/list', (q, r) => r.json(JSON.parse(fs.readFileSync(FILE, 'utf8'))));",
        "app.post('/api/customers', (q, r) => { fs.writeFileSync(FILE, '[]'); r.end(); });",
        'app.listen(process.env.PORT || 3000);',
    ].join('\n');
    const pkg = (deps: Record<string, string> = {}, scripts: Record<string, string> = { start: 'node server.js' }) => ({ scripts, dependencies: { express: '4', ...deps } });
    const app = (extra: Record<string, string | object> = {}, deps?: Record<string, string>) => folder({ 'package.json': pkg(deps), 'server.js': SERVER, 'data/store.json': '[]', 'public/index.html': '<form></form>', ...extra });

    it('a JSON store under data/ that the snapshot keeps → 2t', async () => {
        const c = await chooseQaPath(await app(), { kind: 'npm-start', hasServeUrl: true });
        expect([c.path, c.reasons]).toEqual(['2t', []]);
        for (const kind of ['node-entry', 'tsx-entry']) expect((await chooseQaPath(await app(), { kind, hasServeUrl: true })).path).toBe('2t');
    });

    it.each([
        ['a mail sender in the dependencies', {}, { nodemailer: '6' }, 'sender'],
        ['an outbound fetch in server code', { 'server.js': `${SERVER}\nfetch('https://hooks.example/notify');` }, undefined, 'sender'],
        ['a network core module', { 'server.js': `${SERVER}\nconst net = require('net');` }, undefined, 'sender'],
        ['an external database client', {}, { pg: '8' }, 'externalStore'],
        ['a key-shaped value in .env', { '.env': 'PORT=3000\nSMTP_PASS=x\n' }, undefined, 'envName'],
        ['a data path in the home folder', { 'server.js': `${SERVER}\nconst home = require('os').homedir();\nconst os = require('os'); os.homedir();` }, undefined, 'outsidePath'],
        ['a store file the snapshot does not keep', { 'server.js': `${SERVER}\nconst USERS = path.join(__dirname, 'users.json');\napp.post('/u', (q, r) => { fs.writeFileSync(USERS, '[]'); r.end(); });` }, undefined, 'notCovered'],
    ])('%s → no-write', async (_name, extra, deps, key) => {
        const c = await chooseQaPath(await app(extra as Record<string, string>, deps as Record<string, string> | undefined), { kind: 'npm-start', hasServeUrl: true });
        expect(c.path).toBe('no-write');
        expect(keys(c)).toContain(key);
    });

    it('a link out of the folder, a start that sets NODE_OPTIONS, and no readable Node entry → no-write', async () => {
        const linked = await app();
        const outside = await folder({ 'shared.json': '[]' }, false);
        fs.symlinkSync(outside, path.join(linked, 'shared'), 'junction');
        expect(keys(await chooseQaPath(linked, { kind: 'npm-start', hasServeUrl: true }))).toContain('link');
        const opts = await folder({ 'package.json': pkg({}, { start: 'NODE_OPTIONS=--require=./x.js node server.js' }), 'server.js': SERVER });
        expect(keys(await chooseQaPath(opts, { kind: 'npm-start', hasServeUrl: true }))).toContain('notProven');
        const python = await folder({ 'package.json': { scripts: { start: 'python -m http.server 8000' } }, 'index.html': '<h1>x</h1>' });
        const c = await chooseQaPath(python, { kind: 'npm-start', hasServeUrl: true });
        expect([c.path, keys(c)[0]]).toEqual(['no-write', 'notProven']);
    });

    it('is best-effort: an aliased fetch slips past it and is walked as today (t3-fetch-alias)', async () => {
        const c = await chooseQaPath(await app({ 'server.js': `${SERVER}\nconst send = fetch;\nsend('https://hooks.example/notify');` }), { kind: 'npm-start', hasServeUrl: true });
        expect(c.path).toBe('2t');
    });
});

describe('the path is pinned per loop (§2.3)', () => {
    const choice = (path: QaPathChoice['path']): QaPathChoice => ({ path, reasons: [], record: 'history', facts: { files: 0, read: 0, ms: 0 } });

    it('runs the stricter of the pin and the round\'s own choice, and says when they are not comparable', () => {
        const pin: QaPin = {};
        expect(pinnedPath(pin, choice('2t'))).toEqual({ path: '2t', comparable: true });
        expect(pin.path).toBe('2t');
        expect(pin.first?.path).toBe('2t');
        //  The round added nodemailer: its own choice is no-write — it runs no-write, and is not compared with 2T.
        expect(pinnedPath(pin, choice('no-write'))).toEqual({ path: 'no-write', comparable: false });
        expect(pin.path).toBe('2t');
        //  A looser round under a strict pin runs the pin's path: like with like.
        expect(pinnedPath({ path: 'no-write' }, choice('2t'))).toEqual({ path: 'no-write', comparable: true });
        expect(pinnedPath({ path: 'as-today' }, choice('private-live'))).toEqual({ path: 'private-live', comparable: false });
        expect(pinnedPath(undefined, choice('private-live'))).toEqual({ path: 'private-live', comparable: true });
    });

    it('orders the paths no-write > 2t > private-live > as-today', () => {
        expect(strictest('as-today', 'private-live')).toBe('private-live');
        expect(strictest('2t', 'private-live')).toBe('2t');
        expect(strictest('2t', 'no-write')).toBe('no-write');
        expect(strictest(undefined, 'as-today')).toBe('as-today');
    });
});
