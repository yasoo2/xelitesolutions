/**
 * Round 21, second review — group Q (fixed in round 22), Q2: the stock CLI
 * scaffold shipped a test from another template than its entry. The Go and
 * Rust CSV → JSON entries came with the JSON-filter test (`sample.json
 * city=NYC` against a program that reads CSV): once that test compiled, it
 * failed every time, into the repair loop.
 *
 * Measured on this machine while fixing it, the same class elsewhere:
 *   - the JavaScript filter entry ended in `export { filterJson }` after
 *     `require(...)`: Node read the file as an ES module, `require is not
 *     defined`, and its own test failed every time;
 *   - the TypeScript entries read `err.message` on an `unknown` catch
 *     variable: `tsc` (strict) failed the build check (TS18046);
 *   - the JavaScript skeleton has no CSV body, so «CSV to JSON» received the
 *     JSON filter, and its filter test «passed» the wrong program;
 *   - the Rust CSV entry deserialized each row into a serde_json::Value,
 *     which csv fills from ONE field (read: no cargo here).
 *
 * Each template now says which program its entry is; its test is that
 * program's test, and any other request is authored from the request.
 * Node and tsc (Joe's own) run for real; Go and Rust have no toolchain on
 * this machine and are checked by what their test runs the program on.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { deterministicPhasesFor } from '../modules/tools/definitions/ProjectPipelineTool';

jest.setTimeout(120_000);

const roots: string[] = [];
afterAll(() => { for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); });

const scaffoldOf = (request: string) => {
    const tasks = deterministicPhasesFor(request)!.phases[0].tasks;
    const structure = tasks[0].args.structure as Record<string, string>;
    return { tasks, structure, authored: tasks.filter((task: any) => task.tool === 'ai_write_file').map((task: any) => task.args.path), scripts: JSON.parse(structure['package.json']).scripts };
};
const materialise = (structure: Record<string, string>) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-checks-stock-'));
    roots.push(dir);
    for (const [file, text] of Object.entries(structure)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), text);
    }
    return dir;
};
const NO_UI = 'No website or browser interface.';
const API = path.resolve(__dirname, '..', '..');

describe('the stock program and its test are one variant', () => {
    it('JavaScript: the stock filter runs, and its own test passes (the entry crashed on `require` before)', () => {
        const { structure, authored, scripts } = scaffoldOf(`Build a JavaScript command-line tool that reads a local JSON file and prints matching entries to stdout. ${NO_UI}`);
        expect(authored).toEqual([]);
        expect(structure['index.js']).not.toMatch(/^export /mu);
        const dir = materialise(structure);
        const run = spawnSync(String(scripts.test), { cwd: dir, shell: true, encoding: 'utf-8' });
        expect({ status: run.status, said: `${run.stdout}${run.stderr}` }).toMatchObject({ status: 0, said: expect.stringMatching(/ℹ pass 1/u) });
    });

    it('TypeScript: the stock filter builds under its own strict tsconfig and its test passes', () => {
        const { structure, scripts } = scaffoldOf(`Build a TypeScript command-line tool that reads a local JSON file and prints matching entries to stdout. ${NO_UI}`);
        const dir = materialise(structure);
        // Joe's own TypeScript and Node types stand in for the install (read in place, nothing linked).
        const built = spawnSync(process.execPath, [path.join(API, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json', '--typeRoots', path.join(API, 'node_modules', '@types'), '--types', 'node'], { cwd: dir, encoding: 'utf-8' });
        expect({ status: built.status, said: `${built.stdout}${built.stderr}` }).toEqual({ status: 0, said: '' });
        const run = spawnSync(String(scripts.test), { cwd: dir, shell: true, encoding: 'utf-8' });
        expect(run.status).toBe(0);
        // Both TypeScript bodies read the catch variable as an Error, never `unknown.message`.
        const csv = scaffoldOf(`Build a TypeScript command-line tool that converts a CSV file to JSON. ${NO_UI}`).structure['src/index.ts'];
        expect(`${structure['src/index.ts']}\n${csv}`).not.toMatch(/console\.error\('Error:', err\.message\)/u);
    });

    it('the converter\'s node test converts: it passes a CSV → JSON program and fails the JSON filter', () => {
        const { structure } = scaffoldOf(`Build a TypeScript command-line tool that converts a CSV file to JSON. ${NO_UI}`);
        expect(Object.keys(structure)).toEqual(expect.arrayContaining(['test.js', 'sample.csv']));
        expect(Object.keys(structure)).not.toContain('sample.json');
        expect(structure['test.js']).toMatch(/node dist\/index\.js sample\.csv/u);
        expect(structure['test.js']).not.toMatch(/city=NYC/u);
        // csv-parse is not installed here, so its test is run against a stand-in converter, then the filter.
        const dir = materialise({ 'test.js': structure['test.js'] });
        fs.mkdirSync(path.join(dir, 'dist'));
        fs.writeFileSync(path.join(dir, 'dist', 'index.js'), "const [h, ...rows] = require('fs').readFileSync(process.argv[2], 'utf8').trim().split('\\n').map(l => l.split(','));\nconsole.log(JSON.stringify(rows.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))));\n");
        expect(spawnSync(process.execPath, ['--test', 'test.js'], { cwd: dir, encoding: 'utf-8' }).status).toBe(0);
        fs.writeFileSync(path.join(dir, 'dist', 'index.js'), "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8')).filter(x => x.city === 'NYC')));\n");
        expect(spawnSync(process.execPath, ['--test', 'test.js'], { cwd: dir, encoding: 'utf-8' }).status).not.toBe(0);
    });

    it.each([
        ['Go', 'main_test.go', 'main.go'],
        ['Rust', 'tests/cli.rs', 'src/main.rs'],
    ])('%s: the CSV entry\'s test runs it on a CSV and checks every column — never the filter\'s JSON', (lang, testFile, entry) => {
        const { structure, authored } = scaffoldOf(`Build a ${lang} command-line tool that converts a CSV file to JSON. ${NO_UI}`);
        expect(authored).toEqual([]);
        expect(structure[entry]).toMatch(/csv/u);
        const test = structure[testFile];
        expect(test).toMatch(/name,city\\nAlice,NYC\\nBob,LA\\n/u);
        expect(test).not.toMatch(/city=NYC|Charlie/u);
        expect(test).toMatch(/"city"\]\s*(?:!=|,)\s*"NYC"|\["city"\], "NYC"/u);
        const filter = scaffoldOf(`Build a ${lang} command-line tool that reads a local JSON file and prints matching entries to stdout. ${NO_UI}`).structure[testFile];
        expect(filter).toMatch(/city=NYC/u);
    });

    it('Rust: each CSV row is built from the header and the record, every column — not deserialized into one Value', () => {
        const entry = scaffoldOf(`Build a Rust command-line tool that converts a CSV file to JSON. ${NO_UI}`).structure['src/main.rs'];
        expect(entry).not.toMatch(/deserialize\(\)/u);
        expect(entry).toMatch(/reader\.headers\(\)/u);
        expect(entry).toMatch(/headers\.iter\(\)\.zip\(record\.iter\(\)\)/u);
    });

    it('a request the template is not — JavaScript CSV → JSON, a CSV filter, a TSV — is authored from the request', () => {
        for (const request of [
            `Build a JavaScript command-line tool that converts a CSV file to JSON. ${NO_UI}`,
            `Build a Python command-line tool that filters the rows of a CSV file by property=value. ${NO_UI}`,
            `Build a Python command-line tool that converts a TSV file to JSON. ${NO_UI}`,
        ]) {
            const { authored, structure } = scaffoldOf(request);
            expect({ request, authored: authored.length }).toEqual({ request, authored: 2 });
            expect(Object.keys(structure).filter(file => /sample\./u.test(file))).toEqual([]);
        }
    });

    it('Python: both stock programs pass their own tests, run the way the delivered script runs them', () => {
        if (spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['--version']).status !== 0) return;
        for (const request of [
            `Build a Python command-line tool that converts a CSV file to JSON. ${NO_UI}`,
            `Build a Python command-line tool that reads a local JSON file and prints matching entries to stdout. ${NO_UI}`,
        ]) {
            const { structure, scripts } = scaffoldOf(request);
            const run = spawnSync(String(scripts.test), { cwd: materialise(structure), shell: true, encoding: 'utf-8' });
            expect({ request, status: run.status, said: run.stderr }).toMatchObject({ request, status: 0, said: expect.stringMatching(/Ran 1 test/u) });
        }
    });
});
