import { spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import path from 'path';

import { buildAppFiles, fileAppSmokeTest } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
import { countHeAskedFor } from '../core/design/authored-catalogue';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';
import { requireChromiumOrThrow } from './helpers/require-chromium';

/**
 * THE DELIVERED ARTIFACT MUST CARRY THE VALIDATED SEEDS — NOT JUST THE SOURCE.
 *
 * Real-UI evidence (run-1790693627506): Joe authored 5 valid first-aid rows,
 * npm failed, and Joe delivered its dependency-free static records fallback.
 * The generated React `src/content.js` held all 5 rows and `npm test` passed
 * 3/3 — while the delivered `dist/index.html` contained none of them and both
 * the embedded and fresh-origin previews showed 0 records. Final status:
 * failed.
 *
 * Root boundary: `writeDependencyFreeRecordsBundle` serializes the field
 * schema but accepts no seed rows, and its inline browser script initializes
 * rows only from localStorage. The validated `seedRows` never leave the
 * `execute` branch that authored them.
 *
 * This file pins the general contract, for every records app with seeds:
 *
 *   1. WRITER — the fallback bundle embeds the validated seeds in its
 *      `#joe-config` through script-safe serialization.
 *   2. FIRST VISIT — a fresh browser initializes from the embedded seeds
 *      and persists them; a stored value (rows OR intentional `'[]'`)
 *      always wins — no reseed over user edits or deletions.
 *   3. SUITE — the generated `npm test` inspects the DELIVERED static
 *      artifact when one exists: requested seeds missing from `dist`
 *      fails the app's own suite. No static artifact means the React
 *      path, where the other blocks already apply.
 *
 * The REAL BROWSER block below fails closed: no launchable Chromium means
 * the suite FAILS. Set JOE_ALLOW_NO_BROWSER=1 for an explicit loud skip in
 * browserless environments.
 */

// Scratch lives inside the repo (untracked api/.tmp/) because the sandbox
// denies the system temp directory.
const scratchRoot = () => {
    const base = path.join(__dirname, '..', '.tmp', 'static-seed-delivery');
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

// A fresh domain, never used to build the seed-delivery repairs: a tool
// library with 5 stated rows. The contract must hold for any records
// request, not for the first-aid prompt that exposed it.
const REQUEST = 'Build a community tool library: a table of tools with name, borrower and due columns. Seed it with 5 example tools.';

const STATIC_TEST = 'requested seed rows reach the delivered static records artifact';

const filesForRequest = (request: string) => {
    const bp: any = blueprintFor('generic', request, false);
    const fields = (bp.fields || []).filter((f: any) => f && (f.label || f.key));
    expect(fields.length).toBeGreaterThanOrEqual(2);
    const wanted = countHeAskedFor(request, String(bp.entityOne || ''));
    expect(wanted).toBeGreaterThan(0);
    // Validated-catalogue shape: stable seed-N ids, known field keys only.
    const seedRows: Array<Record<string, any>> = Array.from({ length: wanted! }, (_, i) => {
        const row: Record<string, any> = { id: `seed-${i + 1}` };
        for (const f of fields) row[f.key] = `example ${i + 1} ${f.key}`;
        return row;
    });
    const recordsBp = { ...bp, engine: 'records' };
    const files = buildAppFiles(recordsBp, {
        brand: 'static seed probe',
        isArabic: false,
        storeKey: 'static-seed-probe-generic',
        seedRows,
        wantedSeedCount: wanted,
        sourceRequest: request,
    }, 'static-seed-probe');
    return { bp: recordsBp, fields, wanted: wanted!, seedRows, files };
};

const distConfigOf = (distEntry: string) => {
    const document = fs.readFileSync(distEntry, 'utf8');
    const m = document.match(/<script id="joe-config" type="application\/json">([\s\S]*?)<\/script>/);
    expect(m && m[1]).toBeTruthy();
    return { document, config: JSON.parse(m![1]) };
};

describe('the static fallback embeds the validated seeds', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeDependencyFreeRecordsBundle } = require('../modules/tools/definitions/ReactProjectTool');

    it('POSITIVE — embedded config carries every validated row', () => {
        const { bp, fields, wanted, seedRows } = filesForRequest(REQUEST);
        const dir = scratchRoot();
        const entry = writeDependencyFreeRecordsBundle(dir, bp, false, seedRows);
        expect(entry).toBe(path.join(dir, 'dist', 'index.html'));
        const { document, config } = distConfigOf(entry);
        expect(document).toContain('name="joe-artifact-mode" content="static-records"');
        expect(Array.isArray(config.seedRows)).toBe(true);
        expect(config.seedRows.length).toBe(wanted);
        for (const row of config.seedRows) {
            expect(row.id).toMatch(/^seed-\d+$/);
            for (const f of fields) expect(row).toHaveProperty(f.key);
        }
    });

    it('NEGATIVE — no seeds means an honestly empty bundle, still marked', () => {
        const { bp } = filesForRequest(REQUEST);
        const dir = scratchRoot();
        const entry = writeDependencyFreeRecordsBundle(dir, bp, false);
        const { document, config } = distConfigOf(entry);
        expect(document).toContain('name="joe-artifact-mode" content="static-records"');
        expect(Array.isArray(config.seedRows) ? config.seedRows.length : 0).toBe(0);
    });

    it('NEGATIVE — hostile row text cannot break out of the embedded config', () => {
        const { bp, fields } = filesForRequest(REQUEST);
        const hostile = '</script><script>alert(1)</script>';
        const rows = [{ id: 'seed-1', [fields[0].key]: hostile, [fields[1].key]: 'plain "quoted" \\ value' }];
        const dir = scratchRoot();
        const entry = writeDependencyFreeRecordsBundle(dir, bp, false, rows);
        const { document, config } = distConfigOf(entry);
        // The row text round-trips exactly through the safe serializer …
        expect(config.seedRows[0][fields[0].key]).toBe(hostile);
        // … while the raw breakout never appears in the delivered document.
        expect(document).not.toContain(hostile);
        expect(document.match(/<script/g)!.length).toBe(document.match(/<\/script>/g)!.length);
    });

    it('the execute fallback call carries the authored seeds to the writer', () => {
        // The run-25 cut: seeds were authored in-branch and never reached
        // the fallback writer. This pin fails if the call drops its seeds.
        const toolPath = path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts');
        const src = fs.readFileSync(toolPath, 'utf8');
        expect(src).toMatch(/writeDependencyFreeRecordsBundle\(proj, runBp, artifactIsAr, [A-Za-z_][A-Za-z0-9_]*\)/);
    });
});

describe('the generated suite inspects the delivered static artifact', () => {
    it('POSITIVE — a records suite with wanted seeds carries the static test', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'name', label: 'name' }],
            seedCount: 5,
            wantedSeedCount: 5,
            engine: 'records',
        });
        expect(smoke).toContain(STATIC_TEST);
        expect(smoke).toContain('dist');
        expect(smoke).toContain('joe-artifact-mode');
    });

    it('NEGATIVE — other engines get no static records assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'name', label: 'name' }],
            seedCount: 5,
            wantedSeedCount: 5,
            engine: 'shop',
        });
        expect(smoke).not.toContain(STATIC_TEST);
    });

    it('NEGATIVE — no seeds means no static seed assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'name', label: 'name' }],
            seedCount: 0,
            engine: 'records',
        });
        expect(smoke).not.toContain(STATIC_TEST);
    });

    it('the generated test parses', () => {
        const { files } = filesForRequest(REQUEST);
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain(STATIC_TEST);
        const gate = syntaxOk('scripts/smoke-test.test.mjs', smoke);
        expect(`${gate.ok ? 'ok' : gate.error}`).toBe('ok');
    });

    it('END TO END — green when the delivered static bundle carries the seeds', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { writeDependencyFreeRecordsBundle } = require('../modules/tools/definitions/ReactProjectTool');
        const { bp, seedRows, files } = filesForRequest(REQUEST);
        const dir = writeApp(files);
        // Deliver exactly what the fallback path delivers: the real writer.
        writeDependencyFreeRecordsBundle(dir, bp, false, seedRows);
        const pass = runSmoke(dir);
        const out = `${pass.stdout}\n${pass.stderr}`;
        expect(out).toContain(STATIC_TEST);
        expect(pass.status).toBe(0);
    }, 120000);

    it('MUTATION — seeds dropped from dist fail the static test (the run-25 shape)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { writeDependencyFreeRecordsBundle } = require('../modules/tools/definitions/ReactProjectTool');
        const { bp, seedRows, files } = filesForRequest(REQUEST);
        const dir = writeApp(files);
        const entry = writeDependencyFreeRecordsBundle(dir, bp, false, seedRows);
        // React source still holds all 5 rows; only the DELIVERED artifact
        // loses them. A source-only suite would stay green here.
        const { config } = distConfigOf(entry);
        expect(config.seedRows.length).toBe(5);
        const dropped = fs.readFileSync(entry, 'utf8').replace(
            /<script id="joe-config" type="application\/json">[\s\S]*?<\/script>/,
            () => `<script id="joe-config" type="application/json">${JSON.stringify({ ...config, seedRows: [] })}</script>`,
        );
        fs.writeFileSync(entry, dropped, 'utf8');
        const fail = runSmoke(dir);
        const out = `${fail.stdout}\n${fail.stderr}`;
        expect(out).toContain(STATIC_TEST);
        expect(fail.status).not.toBe(0);
    }, 120000);

    it('VACUOUS — no static artifact means the React path, suite stays green', () => {
        const { files } = filesForRequest(REQUEST);
        const dir = writeApp(files);
        expect(fs.existsSync(path.join(dir, 'dist', 'index.html'))).toBe(false);
        const pass = runSmoke(dir);
        expect(pass.status).toBe(0);
    }, 120000);
});

describe('REAL BROWSER — the delivered bundle seeds a first visit, then respects storage', () => {
    let browser: any = null;
    let server: any = null;
    let baseUrl = '';
    let distDir = '';
    let storeKey = '';
    let fieldKeys: string[] = [];

    beforeAll(async () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { writeDependencyFreeRecordsBundle } = require('../modules/tools/definitions/ReactProjectTool');
        const { bp, seedRows, fields } = filesForRequest(REQUEST);
        fieldKeys = fields.map((f: any) => String(f.key));
        const dir = scratchRoot();
        const entry = writeDependencyFreeRecordsBundle(dir, bp, false, seedRows);
        distDir = path.dirname(entry);
        storeKey = `joe-static-records:${distConfigOf(entry).config.title}`;
        browser = await requireChromiumOrThrow('static-seed-delivery');
        // Null only under explicit JOE_ALLOW_NO_BROWSER=1 (the helper throws
        // otherwise); the loud skip was already logged there.
        if (!browser) return;
        server = http.createServer((req: any, res: any) => {
            const url = String(req.url || '').split('?')[0];
            // This server exists only to give the delivered file a real
            // origin with real localStorage; it serves one file.
            if (url === '/' || url === '/index.html') {
                res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
                res.end(fs.readFileSync(entry, 'utf8'));
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

    const rowCount = (page: any) => page.locator('tbody tr').count();

    it('a first visit renders the 5 embedded seeds, and a reload keeps 5', async () => {
        // Reachable only under explicit JOE_ALLOW_NO_BROWSER=1: without the
        // opt-out the beforeAll above already failed the suite.
        if (!browser) return;
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/`);
        await page.waitForSelector('tbody tr');
        expect(await rowCount(page)).toBe(5);
        expect(await page.textContent('#records')).toContain('example 1');
        await page.reload();
        await page.waitForSelector('tbody tr');
        // Persisted once — a reload must not duplicate the seeds.
        expect(await rowCount(page)).toBe(5);
        await page.close();
    }, 120000);

    it('an emptied store is respected: no resurrection after reload', async () => {
        if (!browser) return;
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/`);
        await page.waitForSelector('tbody tr');
        expect(await rowCount(page)).toBe(5);
        // The user deletes everything: the store now holds an intentional [].
        await page.evaluate((key: string) => { window.localStorage.setItem(key, '[]'); }, storeKey);
        await page.reload();
        await page.waitForSelector('.empty');
        expect(await rowCount(page)).toBe(0);
        await page.close();
    }, 120000);

    it('pre-existing user rows are kept verbatim, never reseeded', async () => {
        if (!browser) return;
        const context = await browser.newContext();
        const userRow: Record<string, string> = { id: 'user-1' };
        fieldKeys.forEach((k, i) => { userRow[k] = ['Patio heater', 'Mona', '2026-10-02'][i % 3]; });
        await context.addInitScript(({ key, row }: { key: string; row: Record<string, string> }) => {
            window.localStorage.setItem(key, JSON.stringify([row]));
        }, { key: storeKey, row: userRow });
        const page = await context.newPage();
        await page.goto(`${baseUrl}/`);
        await page.waitForSelector('tbody tr');
        expect(await rowCount(page)).toBe(1);
        expect(await page.textContent('#records')).toContain('Patio heater');
        await context.close();
    }, 120000);
});
