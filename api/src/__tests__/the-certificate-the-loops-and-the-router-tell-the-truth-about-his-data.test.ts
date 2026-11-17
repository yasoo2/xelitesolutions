/**
 * THE CERTIFICATE, THE OTHER LOOPS AND THE ROUTER TELL THE TRUTH ABOUT HIS DATA (review 7, H1, H2, M1, M4).
 *
 *   H1  the delivery certificate is given the way his data was treated (AgentEngineTool passes `qaPath`), and on the
 *       no-write walk it never says «its buttons and forms were used»; what changed and was put back is named.
 *   H2  the pipeline, project_repair and react_project get the verification's net (owner-data-span.ts): the verify
 *       lock, a snapshot before their first check, the recovery copy and the put-back — and project_repair never
 *       walks the owner's already-running live server with writes on.
 *   M1  2T is refused when a store is not one the snapshot keeps (lowdb's orders.json at the root, a file name built
 *       from constants), so «data files were put back» is never said about a file not kept.
 *   M4  an app delivered before the delivery marker existed (no record, but the run changes a folder that holds
 *       records) is a change run, not a new build.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deliveryCertificate, qaCertificateLine } from '../core/engine/certificate';
import { openOwnerDataSpan } from '../core/quality/owner-data-span';
import { chooseQaPath, hasDeliveryRecord, hasOwnerData, type QaPin } from '../core/quality/qa-target';
import { listRecoveryVersions } from '../core/engine/verify';
import { acquireVerifyLock } from '../core/quality/qa-leaves-no-trace';

jest.setTimeout(120_000);

const base = fs.mkdtempSync(path.join(process.env.JOE_TEST_TMP_ROOT || os.tmpdir(), 'joe-r7-truth-'));
const env = { JOE_DATA_DIR: path.join(base, 'joe-data') };
const savedDataDir = process.env.JOE_DATA_DIR;
beforeAll(() => { process.env.JOE_DATA_DIR = env.JOE_DATA_DIR; });
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

function folder(name: string, files: Record<string, string>): string {
    const root = path.join(base, name);
    fs.rmSync(root, { recursive: true, force: true });
    for (const [rel, text] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        fs.writeFileSync(path.join(root, rel), text);
    }
    return root;
}
const SRC = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

describe('H1 — the certificate on the no-write walk', () => {
    const cert = (qaPath?: any, language = 'en') => deliveryCertificate({ request: 'Add a notes page', summary: 'Added notes.', language, passed: ['live', 'browser'], ...(qaPath ? { qaPath } : {}) });

    it('never says its buttons and forms were used, names what was not tried, and what changed and was put back', () => {
        const en = cert({ path: 'no-write', notTried: ['link: Mark done'], putBack: ['data/tasks.json'] });
        expect(en).not.toMatch(/buttons and forms were used/u);
        expect(en).toMatch(/its pages and links were read, and nothing that saves data was pressed/u);
        expect(en).toMatch(/not tried: link: Mark done/u);
        expect(en).toMatch(/put back as they were before them: data\/tasks\.json/u);
        expect(en).not.toMatch(/without saving anything in it/u);
        const ar = cert({ path: 'no-write', notTried: [] }, 'ar');
        expect(ar).not.toMatch(/وجُرّبت أزراره ونماذجه/u);
        expect(ar).toMatch(/دون الضغط على ما يحفظ بيانات/u);
        //  A new build and 2T keep today's line.
        expect(cert(undefined)).toMatch(/buttons and forms were used/u);
        expect(qaCertificateLine({ path: 'no-write', notTried: ['a'] }, 'en')).toMatch(/without saving anything in it; 1 things/u);
    });

    it('the engine hands the certificate the verification\'s qaPath (the one writer of it)', () => {
        const engine = SRC('modules/tools/definitions/AgentEngineTool.ts');
        const call = engine.slice(engine.indexOf('writeDeliveryCertificate(folder.dir, {'));
        expect(call.slice(0, call.indexOf('});'))).toMatch(/qaPath: \(result\.verification as DeliveryVerification \| undefined\)\?\.delivery\?\.qaPath/u);
        const writers = ['core', 'modules', 'api'].flatMap(d => {
            const out: string[] = [];
            const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.ts$/u.test(e.name) && /writeDeliveryCertificate\(/u.test(fs.readFileSync(p, 'utf8'))) out.push(path.relative(path.join(__dirname, '..'), p).split(path.sep).join('/')); } };
            walk(path.join(__dirname, '..', d));
            return out;
        });
        expect(writers.sort()).toEqual(['core/engine/certificate.ts', 'modules/tools/definitions/AgentEngineTool.ts']);
    });
});

describe('H2 — the other loops get the verification\'s net', () => {
    it('a change run: snapshot before the checks, the recovery copy, the put-back with the server stopped and started again, and the line told', async () => {
        const root = folder('loop-app', { 'data/orders.json': JSON.stringify([{ id: 1 }]), '.joe/history.json': JSON.stringify([{ status: 'delivered' }]) });
        const pin: QaPin = { record: 'history', path: '2t' };
        const span = await openOwnerDataSpan({ projectRoot: root, pin, runId: 'loop-1', workspaceId: 'ws-loop' });
        expect(span.active).toBe(true);
        const calls: string[] = [];
        await span.around('walk', async () => { fs.writeFileSync(path.join(root, 'data', 'orders.json'), JSON.stringify([{ id: 1 }, { id: 2, by: 'the walk' }])); });
        const r = await span.settle({ stop: async () => { calls.push('stop'); return true; }, start: async () => { calls.push('start'); } });
        expect(calls).toEqual(['stop', 'start']);
        expect(r.putBack).toEqual(['data/orders.json']);
        expect(JSON.parse(fs.readFileSync(path.join(root, 'data', 'orders.json'), 'utf8'))).toEqual([{ id: 1 }]);
        expect(span.lines('en').join('\n')).toMatch(/these data files of your app changed: «data\/orders\.json»; they were put back/u);
        expect(span.lines('ar').join('\n')).toMatch(/وأُعيدت كما كانت قبل الفحوص/u);
        await span.close();
        const runs = await listRecoveryVersions('ws-loop', root);
        expect(runs.flatMap(x => x.versions).length).toBeGreaterThan(0);
    });

    it('another check holds the lock: 2T runs as path 3, nothing is put back, and that is told; a new build gets nothing', async () => {
        const root = folder('loop-busy', { 'data/orders.json': '[1]' });
        const held = await acquireVerifyLock('ws-loop', root, 'someone-else', { waitMs: 0 });
        const pin: QaPin = { record: 'history', path: '2t' };
        const span = await openOwnerDataSpan({ projectRoot: root, pin, runId: 'loop-2', workspaceId: 'ws-loop', lockWaitMs: 0 });
        expect(span.lockBusy).toBe(true);
        expect(pin.path).toBe('no-write');
        fs.writeFileSync(path.join(root, 'data', 'orders.json'), '[1,2]');
        const r = await span.settle({ stop: async () => true });
        expect(r.left).toBe('lockBusy');
        expect(fs.readFileSync(path.join(root, 'data', 'orders.json'), 'utf8')).toBe('[1,2]');
        expect(span.lines('en').join('\n')).toMatch(/were not put back, because another check of this app was running/u);
        await span.close();
        await held!.release();
        const fresh = await openOwnerDataSpan({ projectRoot: root, pin: { record: '', path: 'as-today' }, runId: 'loop-3' });
        expect(fresh.active).toBe(false);
        await fresh.close();
    });

    it('the pipeline, project_repair and react_project open it; project_repair walks his own live server on path 3; a pipeline\'s repair is covered by the pipeline', () => {
        const pipeline = SRC('modules/tools/definitions/ProjectPipelineTool.ts');
        expect(pipeline).toMatch(/held\.dataSpan = await openOwnerDataSpan\(/u);
        expect(pipeline).toMatch(/await held\.dataSpan\.settle\(\{/u);
        expect(pipeline).toMatch(/joeOwnerDataSpan: true/u);
        expect(pipeline).toMatch(/startQaFence\(\{ allow: \[\], hold: qaPin\.path === 'no-write' \}\)/u);
        const repair = SRC('modules/tools/definitions/ProjectRepairTool.ts');
        expect(repair).toMatch(/openOwnerDataSpan\(/u);
        expect(repair).toMatch(/walksOwnersLiveServer = !!serveUrl && !reviving && projectEntry\?\.live\?\.url === serveUrl && !givenServerRoot/u);
        expect(repair).toMatch(/qaPin\.path = strictest\(qaPin\.path, 'no-write'\)/u);
        expect(repair).toMatch(/!context\?\.joeOwnerDataSpan/u);
        const react = SRC('modules/tools/definitions/ReactProjectTool.ts');
        expect(react).toMatch(/openOwnerDataSpan\(/u);
        expect(react).toMatch(/await dataSpan\.settle\(/u);
    });
});

describe('M1 — 2T only when the snapshot keeps the store', () => {
    it('lowdb\'s orders.json at the root and a file name built from constants go to path 3, with the file named', async () => {
        const lowdb = folder('m1-lowdb', {
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4', lowdb: '^7' } }),
            'server.js': "import express from 'express';\nimport { Low } from 'lowdb';\nimport { JSONFile } from 'lowdb/node';\nconst db = new Low(new JSONFile('orders.json'), { orders: [] });\nawait db.read();\nconst app = express(); app.use(express.json());\napp.post('/api/orders', async (q, r) => { db.data.orders.push(q.body); await db.write(); r.json({ ok: true }); });\napp.listen(process.env.PORT || 3000);\n",
            'orders.json': JSON.stringify({ orders: [] }),
        });
        const concat = folder('m1-concat', {
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }),
            'server.js': "const express = require('express'); const fs = require('fs'); const path = require('path');\nconst DIR = path.join(__dirname, 'store');\nconst FILE = DIR + '/orders.json';\nconst app = express(); app.use(express.json());\napp.post('/api/orders', (q, r) => { const a = JSON.parse(fs.readFileSync(FILE, 'utf8')); a.push(q.body); fs.writeFileSync(FILE, JSON.stringify(a)); r.json({ ok: true }); });\napp.listen(process.env.PORT || 3000);\n",
            'store/orders.json': '[]',
        });
        const param = folder('m1-param', {
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }),
            'server.js': "const express = require('express'); const fs = require('fs');\nfunction save(file, rows) { fs.writeFileSync(file, JSON.stringify(rows)); }\nconst app = express();\napp.post('/x', (q, r) => { save(q.query.f, []); r.end(); });\napp.listen(process.env.PORT || 3000);\n",
        });
        for (const [dir, file] of [[lowdb, 'orders.json'], [concat, 'store/orders.json'], [param, 'file']] as const) {
            const choice = await chooseQaPath(dir, { kind: 'npm-start', hasServeUrl: true, record: 'history' });
            expect([dir, choice.path]).toEqual([dir, 'no-write']);
            expect(choice.reasons.some(r => r.key === 'notCovered' && r.detail.includes(file))).toBe(true);
        }
        //  The store the snapshot keeps, named through constants, still takes 2T.
        const kept = folder('m1-kept', {
            'package.json': JSON.stringify({ scripts: { start: 'node server.js' }, dependencies: { express: '^4' } }),
            'server.js': "const express = require('express'); const fs = require('fs'); const path = require('path');\nconst FILE = path.join(__dirname, 'data', 'orders.json');\nconst app = express(); app.use(express.json());\napp.post('/api/orders', (q, r) => { fs.writeFileSync(FILE, JSON.stringify([q.body])); r.json({ ok: true }); });\napp.listen(process.env.PORT || 3000);\n",
            'data/orders.json': '[]',
        });
        expect((await chooseQaPath(kept, { kind: 'npm-start', hasServeUrl: true, record: 'history' })).path).toBe('2t');
    });
});

describe('M4 — an app delivered before the marker is a change run', () => {
    it('a folder the run changes that holds records is «data»; an empty one, or one this run made, is a new build', () => {
        const old = folder('m4-old', { 'data/customers.json': JSON.stringify([{ id: 1, name: 'Huda' }]), 'index.html': '<h1>x</h1>' });
        expect(hasDeliveryRecord(old)).toBe('');
        expect(hasDeliveryRecord(old, { resumed: true })).toBe('data');
        expect(hasOwnerData(old)).toBe(true);
        const empty = folder('m4-empty', { 'data/customers.json': '[]', 'index.html': '<h1>x</h1>' });
        expect(hasDeliveryRecord(empty, { resumed: true })).toBe('');
        const db = folder('m4-db', { 'app.db': 'SQLite format 3\u0000' });
        expect(hasDeliveryRecord(db, { resumed: true })).toBe('data');
        const verify = SRC('core/engine/verify.ts');
        expect(verify).toMatch(/pin\.record = hasDeliveryRecord\(root, \{ origin, resumed: !!ctx\.change \}\)/u);
    });
});
