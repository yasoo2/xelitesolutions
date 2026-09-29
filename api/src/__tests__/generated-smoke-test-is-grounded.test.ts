import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { buildAppFiles, fileAppSmokeTest } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
import { countHeAskedFor } from '../core/design/authored-catalogue';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

/**
 * THE SMOKE TEST MUST PROVE THE REQUEST, NOT ONLY THE SCAFFOLD.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 19): Joe built a branches
 * directory web app with name / sort code / address columns and 3 seed rows
 * for a prompt that explicitly asked for `npm test` verifying "the three
 * columns render and the seed data loads". The generated test asserted only
 * scaffold completeness (files exist, package scripts match, createRoot
 * present) — it would pass identically for any other schema, and would stay
 * green if every requested column were dropped.
 *
 * A generated test that cannot fail when the request's own acceptance is
 * unmet is intermediate evidence at best. The smoke test must additionally
 * assert the request-derived schema (columns) and seed rows it was built
 * with, so reader/seed regressions break the app's own suite.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 23): the request stated
 * "Seed it with 6 example donations", the build shipped `seedRows: []`, and
 * the generated suite still passed a test NAMED "requested columns and seed
 * rows reach the generated app" — because the seed expectation was read from
 * the artifact's own row count (0, so no seed assertion was emitted) instead
 * of from his sentence. The acceptance judge caught the missing seeds; the
 * app's own suite blessed them. A test that derives its expectation from the
 * artifact can never catch the artifact's absence: the requested count must
 * drive the assertion, and the test name must not claim seeds it never checks.
 */
const REQUEST = 'Build a small buoy readings web app: a table of buoy readings '
    + 'with buoy, height and period columns. Seed it with 2 example readings.';

// Scratch lives inside the repo (untracked api/.tmp/) because the sandbox
// denies the system temp directory.
const scratchRoot = () => {
    const base = path.join(__dirname, '..', '.tmp', 'grounded-smoke');
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

const filesForRequest = (overrides: { seedRows?: Array<Record<string, any>>; wantedSeedCount?: number } = {}) => {
    const bp = blueprintFor('generic', REQUEST, false);
    const fields = (bp.fields || []).filter(f => f && (f.label || f.key));
    // Grounding is asserted on whatever the reader derives, so this suite
    // stays green through future reader-phrasing fixes (e.g. the known
    // trailing-noun infidelity that reads "period columns" for "period").
    expect(fields.length).toBeGreaterThanOrEqual(2);
    // The request states its seed count ("Seed it with 2 example readings");
    // the reader must see it, and the build must carry it into the suite.
    const wanted = countHeAskedFor(REQUEST, String((bp as any).entityOne || ''));
    expect(wanted).toBe(2);
    const seedRows = overrides.seedRows !== undefined ? overrides.seedRows : [1, 2].map(n => {
        const row: Record<string, any> = { id: `seed-${n}` };
        for (const f of fields) row[f.key] = `shift ${n} ${f.key}`;
        return row;
    });
    const files = buildAppFiles(bp, {
        brand: 'shift log',
        isArabic: false,
        storeKey: 'shift-log-generic',
        seedRows,
        wantedSeedCount: overrides.wantedSeedCount !== undefined ? overrides.wantedSeedCount : wanted,
        sourceRequest: REQUEST,
    }, 'shift-log');
    return { bp, fields, seedRows, wanted, files };
};

describe('the generated smoke test proves the request', () => {
    it('keeps the scaffold assertions it already had', () => {
        const { files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain('generated React app scaffold is complete and testable');
        expect(smoke).toContain('src/content.js');
        expect(smoke).toContain('createRoot');
    });

    it('names every requested column in the generated test', () => {
        const { fields, files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        for (const f of fields) {
            expect(smoke).toContain(JSON.stringify(String(f.label)));
        }
    });

    it('asserts the requested seed count in the generated test', () => {
        const { wanted, files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain('seedRows');
        expect(smoke).toContain(`expected ${wanted} seed rows`);
    });

    it('the generated test fails when the requested seeds never reach the app', () => {
        // Run 23 verbatim: the build shipped seedRows: [] for a request that
        // stated a count, and the suite passed. The requested count — not the
        // artifact's own row count — must drive the assertion.
        const { wanted, files } = filesForRequest({ seedRows: [] });
        expect(wanted).toBe(2);
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain('expected 2 seed rows');
        const dir = writeApp(files);
        const run = runSmoke(dir);
        expect(run.status).not.toBe(0);
        expect(`${run.stdout}\n${run.stderr}`).toMatch(/seed rows/i);
    }, 90000);

    it('without requested or present seeds the test names only the columns', () => {
        // An honest bare app (no count stated, no rows shipped) keeps a
        // columns-only test — and the name must not claim seeds it never
        // checks.
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'buoy', label: 'buoy' }],
            seedCount: 0,
        });
        expect(smoke).toContain('requested columns reach the generated app');
        expect(smoke).not.toContain('seed rows reach');
    });

    it('a different requested count drives its own exact assertion', () => {
        // The fix is structural, not the number 2: any stated count pins the
        // generated suite, even when the artifact currently holds no rows.
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'item', label: 'item' }],
            seedCount: 0,
            wantedSeedCount: 5,
        });
        expect(smoke).toContain('expected 5 seed rows');
    });

    it('the generated test parses', () => {
        const { files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        const gate = syntaxOk('scripts/smoke-test.test.mjs', smoke);
        expect(`${gate.ok ? 'ok' : gate.error}`).toBe('ok');
    });

    it('the generated test passes against the truthful app, for real', () => {
        const { files } = filesForRequest();
        const dir = writeApp(files);
        const run = runSmoke(dir);
        expect(`${run.status}\n${run.stdout}\n${run.stderr}`).toContain('\n');
        expect(run.status).toBe(0);
    }, 90000);

    it('the generated test fails when a requested column is dropped', () => {
        const { fields, files } = filesForRequest();
        const victim = String(fields[1].label);
        const broken = { ...files };
        broken['src/content.js'] = String(files['src/content.js']).split(victim).join('column-that-was-never-asked-for');
        const dir = writeApp(broken);
        const run = runSmoke(dir);
        expect(run.status).not.toBe(0);
        expect(`${run.stdout}\n${run.stderr}`).toContain(victim);
    }, 90000);

    it('the generated test fails when a seed row is dropped', () => {
        const { files } = filesForRequest();
        const broken = { ...files };
        broken['src/content.js'] = String(files['src/content.js']).replace('"seed-2"', '"seed-2-renamed-away"');
        // Removing the row outright is the honest break: parse, drop, re-emit.
        const src = String(files['src/content.js']);
        const anchor = src.indexOf('seedRows:');
        expect(anchor).toBeGreaterThanOrEqual(0);
        const open = src.indexOf('[', anchor);
        let depth = 0;
        let end = -1;
        let inStr = false;
        let esc = false;
        for (let i = open; i < src.length; i++) {
            const ch = src[i];
            if (inStr) {
                if (esc) esc = false;
                else if (ch === '\\') esc = true;
                else if (ch === '"') inStr = false;
            } else if (ch === '"') {
                inStr = true;
            } else if (ch === '[' || ch === '{') {
                depth++;
            } else if (ch === ']' || ch === '}') {
                depth--;
                if (depth === 0) { end = i; break; }
            }
        }
        expect(end).toBeGreaterThan(open);
        const seeds = JSON.parse(src.slice(open, end + 1)) as any[];
        expect(seeds.length).toBeGreaterThan(1);
        seeds.pop();
        broken['src/content.js'] = `${src.slice(0, open)}${JSON.stringify(seeds)}${src.slice(end + 1)}`;
        const dir = writeApp(broken);
        const run = runSmoke(dir);
        expect(run.status).not.toBe(0);
    }, 90000);

    it('without a schema the smoke test stays scaffold-only', () => {
        const smoke = fileAppSmokeTest();
        expect(smoke).toContain('generated React app scaffold is complete and testable');
        expect(smoke).not.toContain('seedRows');
    });
});
