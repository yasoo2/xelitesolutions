import fs from 'fs';
import os from 'os';
import path from 'path';
import {
    detectStart, launchabilityError, launchPrerequisiteError, missingLocalRuntimeImports, missingRuntimeDependencies,
    reconcileMissingRuntimeImports, reconcileMissingRuntimeTarget, resolveRunnableProject,
} from '../modules/tools/definitions/ProjectRunTool';

/**
 * Second review of round 21 (S7): project_run's preflight walked the project
 * synchronously — serverEntrypointCandidates read every source file to depth 3,
 * the import walks read the whole reachable graph, the workspace scan probed
 * every child folder — and while it read, nothing else in the process ran: no
 * other user's request, no stream, no timer. On a server with thousands of
 * users, one large project held them all.
 *
 * Each walk below runs on a real project on disk while the event loop is
 * watched: a check-phase tick re-arms itself for as long as the walk is in
 * progress, and the longest stretch between two ticks is the longest the loop
 * was held. A walk that never yields lets no tick run before it returns; on a
 * large tree, its stretch is the whole walk. The yardstick is the same tree
 * read synchronously, measured here on this machine.
 */
jest.setTimeout(60_000);
const roots: string[] = [];
afterAll(() => { for (const root of roots) fs.rmSync(root, { recursive: true, force: true }); });

function tree(files: Record<string, string>, folders: string[] = []): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-r22-server-walk-'));
    roots.push(root);
    for (const folder of folders) fs.mkdirSync(path.join(root, folder), { recursive: true });
    for (const [relative, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
        fs.writeFileSync(path.join(root, relative), content);
    }
    return root;
}

/** Run `work`, counting the event-loop turns during it and the longest stretch the loop was held. */
async function watched<T>(work: () => Promise<T> | T): Promise<{ result: T; turns: number; longestMs: number }> {
    let turns = 0;
    let done = false;
    let last = process.hrtime.bigint();
    let longest = 0n;
    const mark = () => { const now = process.hrtime.bigint(); if (now - last > longest) longest = now - last; last = now; };
    const tick = () => { mark(); if (!done) { turns++; setImmediate(tick); } };
    setImmediate(tick);
    const result = await work();
    done = true;
    mark();
    return { result, turns, longestMs: Number(longest) / 1e6 };
}

function syncMs(work: () => void): number {
    const started = process.hrtime.bigint();
    work();
    return Number(process.hrtime.bigint() - started) / 1e6;
}

/** A frontend start script beside one backend entry, among many components. */
function largeFrontend(components: number): string {
    const files: Record<string, string> = {
        'package.json': JSON.stringify({ name: 'shop', scripts: { start: 'vite' } }),
        'server/index.js': "const http = require('http');\nhttp.createServer(() => {}).listen(process.env.PORT);\n",
    };
    for (let i = 0; i < components; i++) files[`src/components/part${i % 20}/Widget${i}.jsx`] = `export const Widget${i} = () => null; // ${'x'.repeat(200)}\n`;
    return tree(files);
}

/** Read every file below `root` synchronously: the cost a synchronous search pays on this machine. */
function readEverything(root: string): void {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
        const at = path.join(root, entry.name);
        if (entry.isDirectory()) readEverything(at); else fs.readFileSync(at, 'utf-8');
    }
}

/** An import chain `server.js -> m1 -> … -> m<n>`; the last module imports `tail`. */
function chain(n: number, tail: string, manifest: Record<string, unknown> = {}): string {
    const files: Record<string, string> = {
        'package.json': JSON.stringify({ name: 'deep', scripts: { start: 'node server.js' }, ...manifest }),
        'server.js': "const http = require('http');\nrequire('./lib/m1');\nhttp.createServer(() => {}).listen(process.env.PORT);\n",
    };
    for (let i = 1; i <= n; i++) files[`lib/m${i}.js`] = i < n ? `require('./m${i + 1}');\n` : `require('${tail}');\n`;
    return tree(files);
}

const npmStart = { command: 'npm start', kind: 'npm-start' };

describe('a run preflight never holds the event loop', () => {
    it('the server-entry search over every source file yields while it reads, and still finds the server', async () => {
        const root = largeFrontend(800);
        const reference = syncMs(() => readEverything(root));
        const { result, turns, longestMs } = await watched(() => detectStart(root, 4300));
        expect(result).toMatchObject({ command: 'node server/index.js', kind: 'node-entry' });
        expect(turns).toBeGreaterThan(0);
        expect({ longestMs, under: longestMs < reference / 2, reference }).toMatchObject({ under: true });
    });

    it('the start-target repair searches the same way', async () => {
        const root = largeFrontend(300);
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'shop', scripts: { start: 'node index.js' } }));
        const { result, turns } = await watched(() => reconcileMissingRuntimeTarget(root, 'launchability: runtime target is missing (index.js)'));
        expect(result).toMatchObject({ repaired: true });
        expect(turns).toBeGreaterThan(0);
    });

    it('the workspace scan over many folders yields while it probes them, and still finds the project', async () => {
        // Folders that are not projects cost every marker probe; one is the project he named.
        const folders = Array.from({ length: 500 }, (_, i) => `assets-${i}`);
        const workspace = tree({ 'shop-front/package.json': JSON.stringify({ name: 'shop-front' }) }, folders);
        const markers = ['package.json', 'index.html', 'server.js', 'app.py', 'main.py', 'index.js', 'server/server.js', 'server/index.js',
            'server/app.js', 'src/index.js', 'src/main.js', 'src/server.js', 'src/app.js', 'src/index.mjs', 'src/main.mjs', 'src/server.mjs',
            'src/app.mjs', 'src/index.cjs', 'src/main.cjs', 'src/server.cjs', 'src/app.cjs', 'tsconfig.json'];
        const reference = syncMs(() => { for (const folder of folders) for (const marker of markers) fs.existsSync(path.join(workspace, folder, marker)); });
        const { result, turns, longestMs } = await watched(() => resolveRunnableProject(workspace, '"shop-front"'));
        expect(result).toMatchObject({ cwd: path.join(workspace, 'shop-front'), matched: true });
        expect(turns).toBeGreaterThan(0);
        expect({ longestMs, under: longestMs < reference / 2, reference }).toMatchObject({ under: true });
    });

    it('the import walks yield while they read the graph', async () => {
        const root = chain(30, 'http');
        const local = await watched(() => missingLocalRuntimeImports(root, npmStart));
        expect(local.result).toEqual([]);
        expect(local.turns).toBeGreaterThan(0);
        const gate = await watched(() => launchabilityError(root, npmStart));
        expect(gate.result).toBeNull();
        expect(gate.turns).toBeGreaterThan(0);
        const packages = await watched(() => missingRuntimeDependencies(root, npmStart));
        expect(packages.result).toEqual([]);
        expect(packages.turns).toBeGreaterThan(0);
        const prerequisite = await watched(() => launchPrerequisiteError(root, npmStart));
        expect(prerequisite.result).toBeNull();
        expect(prerequisite.turns).toBeGreaterThan(0);
        const repair = await watched(() => reconcileMissingRuntimeImports(root, npmStart));
        expect(repair.result).toMatchObject({ repaired: false });
        expect(repair.turns).toBeGreaterThan(0);
    });
});

describe('the import walks read the whole reachable graph, not eight levels of it', () => {
    it('a module missing twelve imports deep is a missing module, and the launch gate says so', async () => {
        const root = chain(12, './gone');
        expect(await missingLocalRuntimeImports(root, npmStart)).toEqual(['lib/m12.js -> ./gone']);
        expect(await launchabilityError(root, npmStart)).toContain('lib/m12.js -> ./gone');
    });

    it('an undeclared package twelve imports deep is an undeclared package', async () => {
        const root = chain(12, 'left-pad-joe-fixture');
        expect(await missingRuntimeDependencies(root, npmStart)).toEqual(['left-pad-joe-fixture']);
        expect(await launchPrerequisiteError(root, npmStart)).toBe('runtime dependencies missing or undeclared: left-pad-joe-fixture');
    });
});
