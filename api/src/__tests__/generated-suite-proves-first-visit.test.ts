import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

import { buildAppFiles, fileAppSmokeTest } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
import { countHeAskedFor } from '../core/design/authored-catalogue';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

/**
 * THE GENERATED SUITE MUST PROVE DELIVERY, NOT DESCRIBE IT.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 runs 23/24): Joe shipped apps
 * whose content.js held valid seed rows and whose generated npm test passed —
 * while the real browser preview showed 0 records. The de1b4d28 repair made
 * the controller hand its seeds to the store and pinned the call site with a
 * source-text assertion, but an independent mutation (Codex review of run 24)
 * replaced the generated App.jsx with a component returning null and the
 * suite still passed 3/3: nothing in the generated suite executes the
 * delivery path or touches the view at all.
 *
 * This file pins the general contract, for every records app with seeds:
 *
 *   1. EXECUTED DELIVERY — the generated suite imports the REAL store.js,
 *      opens the rows store exactly as the controller does under a fresh
 *      in-memory browser, and asserts the first-visit read returns the
 *      requested rows with the requested columns. A store that ignores its
 *      seed, or content that drops rows/keys, fails the app's own npm test.
 *   2. RENDER CHAIN — the suite asserts the shell imports and renders the
 *      records view and the view consumes the records controller. A null
 *      App, or a view that drops the controller, fails the app's own test.
 *
 * The source-text pin of the controller call site stays: it catches the
 * run-24 cut (controller opens the store key-only) which the executed test
 * cannot see, because the executed test replicates the call rather than
 * observing it. Each layer below is killed by its own mutation, so a future
 * refactor that deletes one pin thinking another covers it breaks red here.
 *
 * What this still does NOT prove: pixels. Whether rows are VISIBLE on screen
 * remains Browser QA's job; these tests prove the data the shell renders
 * from, the executed first-visit delivery, and the shell→view→controller
 * chain that carries it.
 */

// Scratch lives inside the repo (untracked api/.tmp/) because the sandbox
// denies the system temp directory.
const scratchRoot = () => {
    const base = path.join(__dirname, '..', '.tmp', 'generated-first-visit');
    fs.mkdirSync(base, { recursive: true });
    return fs.mkdtempSync(path.join(base, 'app-'));
};

const writeApp = (files: Record<string, string>) => {
    const dir = scratchRoot();
    for (const [rel, body] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, body, 'utf8');
    }
    return dir;
};

const runSmoke = (dir: string) => spawnSync('node', ['--test', 'scripts/smoke-test.test.mjs'], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60000,
});

// Fresh domains, never used to build the delivery repair: a clinic, a
// warehouse, a roster. Counts 4/5/6 exercise the exact-count path, and the
// third request's columns arrive without a stated table word.
const REQUESTS = [
    'Build a veterinary clinic tracker: a table of appointments with pet, owner and date columns. Seed it with 4 example appointments.',
    'Build a warehouse pallet map: a table of pallets with sku, aisle and quantity columns. Seed it with 5 example pallets.',
    'Build a night-shift roster: a table of guards with name, post and hours columns. Seed it with 6 example guards.',
];

const filesForRequest = (request: string) => {
    const bp: any = blueprintFor('generic', request, false);
    const fields = (bp.fields || []).filter((f: any) => f && (f.label || f.key));
    expect(fields.length).toBeGreaterThanOrEqual(2);
    const wanted = countHeAskedFor(request, String(bp.entityOne || ''));
    expect(wanted).toBeGreaterThan(0);
    const seedRows: Array<Record<string, any>> = Array.from({ length: wanted! }, (_, i) => {
        const row: Record<string, any> = { id: `seed-${i + 1}` };
        for (const f of fields) row[f.key] = `example ${i + 1} ${f.key}`;
        return row;
    });
    const files = buildAppFiles({ ...bp, engine: 'records' }, {
        brand: 'first-visit probe',
        isArabic: false,
        storeKey: 'first-visit-probe-generic',
        seedRows,
        wantedSeedCount: wanted,
        sourceRequest: request,
    }, 'first-visit-probe');
    return { bp, fields, wanted: wanted!, seedRows, files };
};

const EXECUTED_TEST = 'requested seed rows load on a first visit';
const SHELL_TEST = 'the app shell renders the records view it was built with';

describe('the generated suite executes the first-visit delivery', () => {
    const seeded = () => fileAppSmokeTest({
        fields: [{ key: 'text1', label: 'pet' }],
        seedCount: 4,
        wantedSeedCount: 4,
        engine: 'records',
    });

    it('POSITIVE — a records app with wanted seeds carries the executed test', () => {
        const smoke = seeded();
        expect(smoke).toContain(EXECUTED_TEST);
        // It runs the real store under a fresh browser, not a text search.
        expect(smoke).toContain('../src/app/store.js');
        expect(smoke).toContain('localStorage');
        expect(smoke).toContain('createStore');
    });

    it('POSITIVE — a records app with wanted seeds carries the shell test', () => {
        const smoke = seeded();
        expect(smoke).toContain(SHELL_TEST);
        expect(smoke).toContain('RecordsApp.jsx');
        expect(smoke).toContain('useRecordsController');
    });

    it('NEGATIVE — other engines get neither records assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'name', label: 'name' }],
            seedCount: 4,
            wantedSeedCount: 4,
            engine: 'shop',
        });
        expect(smoke).not.toContain(EXECUTED_TEST);
        expect(smoke).not.toContain(SHELL_TEST);
        expect(smoke).not.toContain('records-controller.js');
    });

    it('NEGATIVE — no seeds means neither delivery assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'text1', label: 'pet' }],
            seedCount: 0,
            engine: 'records',
        });
        expect(smoke).not.toContain(EXECUTED_TEST);
        expect(smoke).not.toContain(SHELL_TEST);
    });

    it('the generated test parses', () => {
        const { files } = filesForRequest(REQUESTS[0]);
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain(EXECUTED_TEST);
        expect(smoke).toContain(SHELL_TEST);
        const gate = syntaxOk('scripts/smoke-test.test.mjs', smoke);
        expect(`${gate.ok ? 'ok' : gate.error}`).toBe('ok');
    });
});

describe.each(REQUESTS)('END TO END — the suite passes wired (%s)', (request) => {
    it('green on the generated app, with both new tests executed', () => {
        const { files } = filesForRequest(request);
        const dir = writeApp(files);
        const pass = runSmoke(dir);
        const out = `${pass.stdout}\n${pass.stderr}`;
        expect(out).toContain(EXECUTED_TEST);
        expect(out).toContain(SHELL_TEST);
        expect(pass.status).toBe(0);
    }, 120000);
});

describe('MUTATION — each layer fails on its own break', () => {
    it('a null App fails the shell test (the run-24 review mutation)', () => {
        const { files } = filesForRequest(REQUESTS[0]);
        const broken = { ...files, 'src/App.jsx': 'export default function App() { return null; }\n' };
        const fail = runSmoke(writeApp(broken));
        expect(fail.status).not.toBe(0);
        expect(`${fail.stdout}\n${fail.stderr}`).toContain(SHELL_TEST);
    }, 120000);

    it('a view that drops the controller fails the shell test', () => {
        const { files } = filesForRequest(REQUESTS[1]);
        const broken = {
            ...files,
            'src/components/RecordsApp.jsx': 'export default function RecordsApp() { return null; }\n',
        };
        const fail = runSmoke(writeApp(broken));
        expect(fail.status).not.toBe(0);
        expect(`${fail.stdout}\n${fail.stderr}`).toContain(SHELL_TEST);
    }, 120000);

    it('a store that ignores its seed fails the executed test', () => {
        const { files } = filesForRequest(REQUESTS[1]);
        const broken = {
            ...files,
            'src/app/store.js': 'export function createStore() { return { read: () => [], write: () => {} }; }\n',
        };
        const fail = runSmoke(writeApp(broken));
        expect(fail.status).not.toBe(0);
        expect(`${fail.stdout}\n${fail.stderr}`).toContain(EXECUTED_TEST);
    }, 120000);

    it('a cut controller call still fails the call-site pin, not the executed test', () => {
        const { files } = filesForRequest(REQUESTS[2]);
        const controller = String(files['src/app/records-controller.js'] || '');
        expect(controller).toContain('content.seedRows');
        const broken = {
            ...files,
            'src/app/records-controller.js': controller.replace(
                "createStore(content.storeKey + ':rows', content.seedRows)",
                "createStore(content.storeKey + ':rows')"),
        };
        const fail = runSmoke(writeApp(broken));
        // The executed test replicates the call, so it stays green; the
        // source-text pin is the layer that sees this cut. If a future
        // refactor deletes that pin, this mutation goes green and lies.
        expect(fail.status).not.toBe(0);
        expect(`${fail.stdout}\n${fail.stderr}`).toContain('reach the records store');
    }, 120000);
});

describe('the stated seed count never fails silently', () => {
    it('POSITIVE — the reader result passes through with no note', () => {
        const { wantedSeedCountFor } = require('../modules/tools/definitions/ReactProjectTool');
        const notes: string[] = [];
        expect(wantedSeedCountFor(REQUESTS[0], 'item', (m: string) => notes.push(m))).toBe(4);
        expect(notes).toEqual([]);
    });

    it('NEGATIVE — a reader that throws is reported, not swallowed', () => {
        // doMock outlives isolateModules: without the finally below, the
        // throwing mock leaks into later tests that build real apps.
        try {
            jest.isolateModules(() => {
                jest.doMock('../core/design/authored-catalogue', () => ({
                    countHeAskedFor: () => { throw new Error('reader bug'); },
                }));
                const { wantedSeedCountFor } = require('../modules/tools/definitions/ReactProjectTool');
                const notes: string[] = [];
                expect(wantedSeedCountFor(REQUESTS[0], 'item', (m: string) => notes.push(m))).toBeUndefined();
                expect(notes.join(' ')).toMatch(/seed-count reader unavailable/);
                expect(notes.join(' ')).toMatch(/shipped rows/);
            });
        } finally {
            jest.dontMock('../core/design/authored-catalogue');
            jest.resetModules();
        }
    });

    it('NEGATIVE — a reader module that cannot load is reported', () => {
        try {
            jest.isolateModules(() => {
                jest.doMock('../core/design/authored-catalogue', () => { throw new Error('module gone'); });
                const { wantedSeedCountFor } = require('../modules/tools/definitions/ReactProjectTool');
                const notes: string[] = [];
                expect(wantedSeedCountFor(REQUESTS[0], 'item', (m: string) => notes.push(m))).toBeUndefined();
                expect(notes.join(' ')).toMatch(/seed-count reader unavailable/);
            });
        } finally {
            jest.dontMock('../core/design/authored-catalogue');
            jest.resetModules();
        }
    });
});

describe('REAL BROWSER — a first visit shows the requested rows', () => {
    let browser: any = null;
    let server: any = null;
    let baseUrl = '';
    let genDir = '';

    beforeAll(async () => {
        const { files } = filesForRequest(REQUESTS[0]);
        genDir = writeApp(files);
        const { findChromiumExecutable, getChromiumLaunchOptions } =
            require('../modules/browser/manager');
        const exe = findChromiumExecutable();
        const { chromium } = require('playwright');
        try {
            browser = await chromium.launch({
                ...getChromiumLaunchOptions(),
                ...(exe ? { executablePath: exe } : {}),
            });
        } catch (e: any) {
            // eslint-disable-next-line no-console
            console.warn(`[first-visit] no browser, real-Chromium assertions skip: ${String(e?.message || e).slice(0, 120)}`);
            browser = null;
        }
        if (!browser) return;
        const HARNESS = `<!doctype html><html><body>
<div id="count">?</div><div id="first">?</div><div id="cols">?</div>
<script type="module">
import { content } from '/gen/src/content.js';
import { createStore } from '/gen/src/app/store.js';
const rows = createStore(content.storeKey + ':rows', content.seedRows).read();
document.getElementById('count').textContent = String(rows.length);
document.getElementById('first').textContent = JSON.stringify(rows[0] || null);
document.getElementById('cols').textContent = (content.fields || []).map((f) => f.key).join(',');
</script></body></html>`;
        server = http.createServer((req: any, res: any) => {
            const url = String(req.url || '');
            if (url === '/harness') {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(HARNESS);
                return;
            }
            if (url.startsWith('/gen/')) {
                const rel = url.slice('/gen/'.length).split('?')[0];
                const abs = path.join(genDir, rel);
                // Contain the static root: the harness only asks for two files.
                if (!abs.startsWith(genDir) || (rel !== 'src/content.js' && rel !== 'src/app/store.js')) {
                    res.writeHead(404); res.end('no'); return;
                }
                res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' });
                res.end(fs.readFileSync(abs, 'utf8'));
                return;
            }
            res.writeHead(404); res.end('no');
        });
        await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
    }, 120000);

    afterAll(async () => {
        await browser?.close().catch(() => { });
        await new Promise<void>((resolve) => { if (server) server.close(() => resolve()); else resolve(); });
    });

    it('the real modules deliver 4 visible rows on a first visit', async () => {
        if (!browser) {
            // eslint-disable-next-line no-console
            console.warn('[first-visit] SKIP: no Chromium available');
            return;
        }
        // A fresh context means fresh storage: this IS a first visit, in a
        // real browser engine, executing the real generated modules. The
        // React compile step is vite's gate and full-app pixels are Browser
        // QA's job; this proves the delivery the screen reads from, visibly.
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/harness`);
        await page.waitForFunction("document.getElementById('count').textContent !== '?'");
        expect(await page.textContent('#count')).toBe('4');
        expect(await page.textContent('#first')).toContain('example 1');
        expect(await page.textContent('#cols')).toContain('text1');
    }, 120000);
});
