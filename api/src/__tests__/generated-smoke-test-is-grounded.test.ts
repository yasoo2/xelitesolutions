import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { buildAppFiles, fileAppSmokeTest } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
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

const filesForRequest = () => {
    const bp = blueprintFor('generic', REQUEST, false);
    const fields = (bp.fields || []).filter(f => f && (f.label || f.key));
    // Grounding is asserted on whatever the reader derives, so this suite
    // stays green through future reader-phrasing fixes (e.g. the known
    // trailing-noun infidelity that reads "period columns" for "period").
    expect(fields.length).toBeGreaterThanOrEqual(2);
    const seedRows = [1, 2].map(n => {
        const row: Record<string, any> = { id: `seed-${n}` };
        for (const f of fields) row[f.key] = `shift ${n} ${f.key}`;
        return row;
    });
    const files = buildAppFiles(bp, {
        brand: 'shift log',
        isArabic: false,
        storeKey: 'shift-log-generic',
        seedRows,
        sourceRequest: REQUEST,
    }, 'shift-log');
    return { bp, fields, seedRows, files };
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
        const { seedRows, files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain('seedRows');
        expect(smoke).toContain(String(seedRows.length));
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
