import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { buildAppFiles, fileAppSmokeTest, fileAppStoreJs } from '../modules/tools/definitions/react-app-templates';
import { blueprintFor } from '../core/design/app-blueprints';
import { syntaxOk } from '../modules/tools/definitions/ProjectEditTool';

/**
 * THE RECORDS SHELF MUST BE FILLED, NOT ONLY DESCRIBED.
 *
 * Real-UI evidence (CRITICAL-REAL-JOE-UI-001 run 24): Joe built a first-aid
 * kit tracker whose content.js held 5 valid seed rows and whose generated
 * npm test passed 2/2 — while the real browser preview showed 0 records.
 * The records controller opened its store with a key and no seeds:
 *
 *     createStore(content.storeKey + ':rows')   // seeds left in content.js
 *
 * The store contract seeds a first visit only when handed a non-empty seed
 * array, so every generated records app rendered an empty shelf on first
 * visit no matter what the author wrote. The shop engine already passed its
 * seeds (':products', content.seedRows); the records engine — the generic
 * one-table path — never did. Seed authoring existed; seed DELIVERY existed
 * in exactly one of the template's store call sites.
 *
 * These tests pin the delivery link three ways: the wiring itself, the real
 * store contract executed with a stubbed browser, and the generated suite's
 * own assertion that the wiring is present — so a future template edit that
 * drops the seeds breaks the app's own `npm test`, not just a reader.
 */
const readTpl = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules/tools/definitions/react-app-templates.ts'), 'utf-8');

describe('the records controller hands its seeds to the store', () => {
    it('POSITIVE — the :rows store opens with content.seedRows', () => {
        // Run 24 verbatim: this call carried the key and nothing else, so a
        // first visit read [] while 5 rows sat in content.js.
        expect(readTpl()).toContain("createStore(content.storeKey + ':rows', content.seedRows)");
    });

    it('CONTROL — the shop wiring that already worked is untouched', () => {
        expect(readTpl()).toContain("createStore(content.storeKey + ':products', content.seedRows)");
    });
});

describe('the real store contract, executed', () => {
    const stubStorage = () => {
        const mem = new Map<string, string>();
        return {
            getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
            setItem: (k: string, v: string) => { mem.set(k, String(v)); },
            removeItem: (k: string) => { mem.delete(k); },
        };
    };
    // The generated store source, exactly as shipped — no reimplementation.
    // fileAppStoreJs emits the whole store module; slice the real createStore
    // out at its export boundaries and execute that.
    const loadCreateStore = (localStorage: unknown) => {
        const src = fileAppStoreJs();
        const start = src.indexOf('export function createStore');
        const end = src.indexOf('\nexport ', start + 1);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const fn = src.slice(start, end).replace('export function createStore', 'function createStore');
        return new Function('localStorage', `${fn}\nreturn createStore;`)(localStorage);
    };
    const seeds = [{ id: 'seed-1', text1: 'Band-Aids' }, { id: 'seed-2', text1: 'Gauze' }];

    it('POSITIVE — a first visit returns the handed seeds', () => {
        const createStore = loadCreateStore(stubStorage());
        expect(createStore('t:rows', seeds).read()).toEqual(seeds);
    });

    it('NEGATIVE — a shelf the owner emptied himself stays empty', () => {
        const ls = stubStorage();
        const createStore = loadCreateStore(ls);
        const store = createStore('t:rows', seeds);
        expect(store.read().length).toBe(2);
        store.write([]);
        expect(createStore('t:rows', seeds).read()).toEqual([]);
    });

    it('NEGATIVE — no seed means an honest bare shelf, not a crash', () => {
        const createStore = loadCreateStore(stubStorage());
        expect(createStore('t:rows').read()).toEqual([]);
        expect(createStore('t:rows', []).read()).toEqual([]);
    });
});

// Scratch lives inside the repo (untracked api/.tmp/) because the sandbox
// denies the system temp directory.
const scratchRoot = () => {
    const base = path.join(__dirname, '..', '.tmp', 'records-seed-delivery');
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

const REQUEST = 'Build a small seed library web app: a table of packets with '
    + 'variety, sown and notes columns. Seed it with 3 example packets.';

const filesForRequest = () => {
    const bp = blueprintFor('generic', REQUEST, false);
    const fields = (bp.fields || []).filter(f => f && (f.label || f.key));
    expect(fields.length).toBeGreaterThanOrEqual(2);
    // Rows carry the derived keys, like the real author writes them.
    const seedRows: Array<Record<string, any>> = [1, 2, 3].map(n => {
        const row: Record<string, any> = { id: `seed-${n}` };
        for (const f of fields) row[f.key] = `packet ${n} ${f.key}`;
        return row;
    });
    const files = buildAppFiles({ ...bp, engine: 'records' }, {
        brand: 'seed library',
        isArabic: false,
        storeKey: 'seed-library-generic',
        seedRows,
        wantedSeedCount: 3,
        sourceRequest: REQUEST,
    }, 'seed-library');
    return { bp, fields, seedRows, files };
};

describe('the generated suite pins the delivery wiring', () => {
    it('POSITIVE — a records app with wanted seeds asserts the wiring', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'text1', label: 'variety' }],
            seedCount: 3,
            wantedSeedCount: 3,
            engine: 'records',
        });
        expect(smoke).toContain('reach the records store');
        expect(smoke).toContain('records-controller.js');
    });

    it('NEGATIVE — other engines get no records wiring assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'name', label: 'name' }],
            seedCount: 3,
            wantedSeedCount: 3,
            engine: 'shop',
        });
        expect(smoke).not.toContain('records-controller.js');
    });

    it('NEGATIVE — no seeds means no wiring assertion', () => {
        const smoke = fileAppSmokeTest({
            fields: [{ key: 'text1', label: 'variety' }],
            seedCount: 0,
            engine: 'records',
        });
        expect(smoke).not.toContain('records-controller.js');
    });

    it('the generated test parses', () => {
        const { files } = filesForRequest();
        const smoke = String(files['scripts/smoke-test.test.mjs'] || '');
        expect(smoke).toContain('reach the records store');
        const gate = syntaxOk('scripts/smoke-test.test.mjs', smoke);
        expect(`${gate.ok ? 'ok' : gate.error}`).toBe('ok');
    });

    it('END TO END — the suite passes wired and fails when the wiring is cut', () => {
        const { files } = filesForRequest();
        const dir = writeApp(files);
        const pass = runSmoke(dir);
        expect(`${pass.stdout}\n${pass.stderr}`).toContain('reach the records store');
        expect(pass.status).toBe(0);
        // Cut exactly the run-24 link: the controller opens the store key-only.
        const broken = { ...files };
        const controller = String(broken['src/app/records-controller.js'] || '');
        expect(controller).toContain("content.seedRows");
        broken['src/app/records-controller.js'] = controller.replace(
            "createStore(content.storeKey + ':rows', content.seedRows)",
            "createStore(content.storeKey + ':rows')");
        const brokenDir = writeApp(broken);
        const fail = runSmoke(brokenDir);
        expect(fail.status).not.toBe(0);
        expect(`${fail.stdout}\n${fail.stderr}`).toMatch(/records store/i);
    }, 120000);
});
