import fs from 'fs';
import path from 'path';
import { isMachineStateDirectory } from '../../shared/utils/project-tree';

/**
 *  ⛔ A SCRIPT RUNS A PROGRAM THE MANIFEST NEVER DECLARED.
 *
 *  P001-landing-ar (run500, run-1793027826564). The plan scaffolded
 *
 *      "scripts": { "dev": "vite", "build": "vite build" },
 *      "dependencies": { "vue": "^3.4.0" }
 *
 *  and a vite.config.js that begins `import { defineConfig } from 'vite'`.
 *  `npm install` installed what the manifest named, `vite` was still not in
 *  node_modules/.bin, and both readers stopped: the npm preflight with «npm
 *  preflight completed but local binary is still missing: vite», project_run
 *  with «I will not install or invent an undeclared package». Self-fix had no
 *  file to repair; the build ended 0/5.
 *
 *  The manifest is not the only evidence. A project file importing the
 *  package by that exact name is the project's own statement of which package
 *  it means, and the registry says whether that package ships the executable
 *  (npm_manager `providesBin`). Both are required: the program name alone is
 *  not enough — `tsc` on the registry is not TypeScript, and nobody imports it.
 */

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte|astro)$/iu;
const BUILD_OUTPUT_DIRECTORIES = new Set(['dist', 'build', 'out']);
const VALID_UNSCOPED_PACKAGE = /^[a-z0-9][a-z0-9._~-]*$/u;
// A source file this large is generated or bundled output, not a statement
// of what the project imports.
const MAX_FILE_BYTES = 512 * 1024;

export interface ScriptBinaryProvider {
    packageName: string;
    /** Imported only from tool configuration, so it belongs in devDependencies. */
    dev: boolean;
    /** Project-relative files that import the package. */
    importedBy: string[];
}

function importedPackageNames(source: string): Set<string> {
    const names = new Set<string>();
    const patterns = [
        /\bfrom\s*['"]([^'"\n]+)['"]/gu,
        /\bimport\s*['"]([^'"\n]+)['"]/gu,
        /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/gu,
        /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/gu,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) {
            const specifier = match[1].trim();
            if (!specifier || /^[./#]/u.test(specifier) || specifier.includes(':')) continue;
            names.add(specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]);
        }
    }
    return names;
}

const TOOL_CONFIG_FILE = /^[\w.-]+\.config\.[cm]?[jt]s$/iu;

function isToolConfigFile(relative: string): boolean {
    return !relative.includes('/') && TOOL_CONFIG_FILE.test(path.basename(relative));
}

/**
 * ONE SEARCH, READ BY TWO DRIVERS.
 *
 * Review r21 (855fd3f8): the first walk went depth-first with a 400-file and
 * depth-4 cap and synchronous reads. A project whose components/ folder held
 * 400 files never reached the root vite.config.js that imports vite — the
 * only importing file — and answered «nothing imports it», silently; and
 * every read blocked the event loop the other users share.
 *
 * Now the project root's own tool configuration (*.config.*, where a build
 * tool is imported) is read first, then every other source file breadth-first,
 * with no file count or depth cap: what is skipped is skipped by kind
 * (machine state, build output, dot-folders, a generated file over
 * MAX_FILE_BYTES), never by position. The search is written once as a
 * generator of filesystem requests; the async driver serves project_run and
 * the sync driver serves the one caller that has not moved yet.
 */
type SearchRequest = { op: 'readdir'; at: string } | { op: 'read'; at: string } | { op: 'manifest'; at: string };

function* searchImporters(projectRoot: string, name: string): Generator<SearchRequest, ScriptBinaryProvider | null, unknown> {
    if (!VALID_UNSCOPED_PACKAGE.test(name)) return null;
    let manifest: any;
    try { manifest = JSON.parse(String((yield { op: 'manifest', at: path.join(projectRoot, 'package.json') }) ?? '')); } catch { return null; }
    if (!manifest || typeof manifest !== 'object') return null;
    const declared = new Set<string>([
        ...Object.keys(manifest?.dependencies || {}),
        ...Object.keys(manifest?.devDependencies || {}),
        ...Object.keys(manifest?.optionalDependencies || {}),
        ...Object.keys(manifest?.peerDependencies || {}),
    ]);
    if (declared.has(name)) return null;

    const importedBy: string[] = [];
    const relative = (file: string) => path.relative(projectRoot, file).replace(/\\/g, '/');
    const rootEntries = ((yield { op: 'readdir', at: projectRoot }) as fs.Dirent[] | null) || [];
    const rootConfigs = rootEntries
        .filter(entry => entry.isFile() && TOOL_CONFIG_FILE.test(entry.name))
        .map(entry => path.join(projectRoot, entry.name))
        .sort();
    for (const file of rootConfigs) {
        const source = yield { op: 'read', at: file };
        if (typeof source === 'string' && importedPackageNames(source).has(name)) importedBy.push(relative(file));
    }
    const queue: Array<{ dir: string; entries?: fs.Dirent[] }> = [{ dir: projectRoot, entries: rootEntries }];
    for (let next = 0; next < queue.length; next++) {
        const { dir } = queue[next];
        const entries = queue[next].entries || ((yield { op: 'readdir', at: dir }) as fs.Dirent[] | null) || [];
        queue[next] = { dir }; // read once; let the listing go
        for (const entry of entries) {
            const at = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (!isMachineStateDirectory(entry.name) && !BUILD_OUTPUT_DIRECTORIES.has(entry.name) && !entry.name.startsWith('.')) queue.push({ dir: at });
                continue;
            }
            if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || rootConfigs.includes(at)) continue;
            const source = yield { op: 'read', at };
            if (typeof source === 'string' && importedPackageNames(source).has(name)) importedBy.push(relative(at));
        }
    }
    if (!importedBy.length) return null;
    return { packageName: name, dev: importedBy.every(isToolConfigFile), importedBy };
}

function answerSync(request: SearchRequest): unknown {
    try {
        if (request.op === 'readdir') return fs.readdirSync(request.at, { withFileTypes: true });
        if (request.op === 'read' && fs.statSync(request.at).size > MAX_FILE_BYTES) return null;
        return fs.readFileSync(request.at, 'utf8');
    } catch { return null; }
}

async function answerAsync(request: SearchRequest): Promise<unknown> {
    try {
        if (request.op === 'readdir') return await fs.promises.readdir(request.at, { withFileTypes: true });
        if (request.op === 'read' && (await fs.promises.stat(request.at)).size > MAX_FILE_BYTES) return null;
        return await fs.promises.readFile(request.at, 'utf8');
    } catch { return null; }
}

/**
 * The package a manifest script's missing program comes from, when a project
 * file imports a package of that exact name and the manifest does not declare
 * it. Null for anything else: a path, a scoped or invalid name, a declared
 * package (that is the install's job), or no import naming it. Asynchronous:
 * the event loop stays free while the project is read.
 */
export async function findImportedPackageForScriptBinary(projectRoot: string, binary: string): Promise<ScriptBinaryProvider | null> {
    const search = searchImporters(projectRoot, String(binary || '').trim());
    let step = search.next();
    while (!step.done) step = search.next(await answerAsync(step.value));
    return step.value;
}

/**
 * The same search with synchronous reads, for PhaseExecutorTool's npm
 * preflight until it awaits findImportedPackageForScriptBinary (owned by
 * another change; reported in review r21). New callers use the async one.
 */
export function importedPackageForScriptBinary(projectRoot: string, binary: string): ScriptBinaryProvider | null {
    const search = searchImporters(projectRoot, String(binary || '').trim());
    let step = search.next();
    while (!step.done) step = search.next(answerSync(step.value));
    return step.value;
}

/** The npm_manager input that installs it from the release that declares the program. */
export function scriptBinaryInstallInput(projectRoot: string, binary: string, provider: ScriptBinaryProvider) {
    return {
        command: 'install',
        packages: [provider.packageName],
        dev: provider.dev,
        cwd: projectRoot,
        projectPath: projectRoot,
        providesBin: binary,
    };
}
