/**
 * A PROJECT'S FILES ARE THE FILES SOMEONE WROTE, NOT THE MACHINE'S STATE.
 *
 * P101 (run500, 2026-10-26): a Node API asked for a test script. Its repair
 * wrote package.json through ai_write_file, whose prompt carries the project's
 * file layout as import evidence. The layout walk skipped node_modules but not
 * the npm cache the API builder keeps inside the project (.npm-cache), so its
 * 180-entry cap was filled with `.npm-cache/_cacache/content-v2/sha512/…` hash
 * paths: 28.9k chars of hex, no server.js, no db.js. The prompt no longer fit
 * the 16k window and every attempt ended «Local inference returned HTTP 400»
 * (context) — the build stopped with the real files never shown to the model.
 *
 * Any walk that reads a project tree as evidence of what was built (layout,
 * sources to parse) skips the directories that tools and Joe itself create
 * there: package/tool caches, virtualenvs, Joe's checkpoints and state. Build
 * outputs (dist, build) are a separate, per-walker decision and are not here.
 *
 * Joe's own state folders are named where Joe writes them, and every one is
 * here (round 21 review: two were missing): `.joe-versions` holds the ten undo
 * snapshots of the whole project (core/project/versions.ts VERSIONS_DIR) — ten
 * copies of every file, sorted before `server.js`, enough to fill a layout list
 * with yesterday's App.jsx; `.checkpoints` holds the resumable build state
 * (core/resume/checkpoint.ts), JSON a literal text edit would otherwise rewrite.
 *
 * ⛔ HIS SOURCE IS DECIDED BY KIND, NOT BY A LIST OF FOLDER NAMES (round 22).
 *
 * The list above is right for the names a tool always uses. It was wrong in
 * both directions for the rest, and once project_edit walked the whole project
 * the gaps stopped being hidden by a cap. Measured (round 21 second review):
 * «Change the text "Save changes" to "Save"» rewrote src/content.js — and
 * vendor/acme/…/form.js (Composer's), env/lib/python3.11/site-packages/django/…
 * (a virtualenv named env), client/package-lock.json and data.json (the JSON
 * store of an api project: his users' records). And the other way: `coverage`
 * as a bare name at any depth dropped src/coverage/Plans.jsx from an export and
 * from every edit. So:
 *  - a name an installer or tool always uses is state wherever it stands
 *    (node_modules, __pycache__, site-packages …);
 *  - a folder a tool writes where it runs is state at the project root, and
 *    deeper only when it carries that tool's own output (coverage: lcov.info …);
 *  - a folder whose name the user chose is recognised by what its installer
 *    always writes into it: a virtualenv by pyvenv.cfg, a conda env by
 *    conda-meta, Composer's vendor dir by composer/installed.json, Go's by
 *    modules.txt beside a go.mod — whatever the folder is called;
 *  - and the project says the rest itself: its own .gitignore files, at every
 *    depth, are honoured (ApiProjectTool's lists data.json).
 * Lockfiles (any depth) are the package manager's, not his. A walk that cannot
 * say where a folder stands keeps the cautious answer of the old list.
 */
import fs from 'fs';
import path from 'path';
import { Minimatch } from 'minimatch';

/** Names an installer, a cache or Joe always uses: machine state wherever they stand. */
const STATE_ANYWHERE: ReadonlySet<string> = new Set([
    '.git', 'node_modules', '.npm-cache', '.pnpm-store', '.yarn', '.cache', '.turbo', '.next',
    '.engineering-checkpoints', '.joe', '.joe-versions', '.checkpoints', '__pycache__', '.pytest_cache', '.venv', 'venv',
    'site-packages', 'dist-packages', 'bower_components',
]);

/**
 * Folders a tool writes where it runs (the package root), and the files that
 * tool always leaves in them. At the root the name decides; deeper, only the
 * tool's own output does — src/coverage/Plans.jsx is a page about coverage.
 */
const TOOL_OUTPUT_MARKERS: Readonly<Record<string, readonly string[]>> = {
    coverage: ['lcov.info', 'coverage-final.json', 'coverage-summary.json', 'clover.xml', 'cobertura-coverage.xml', 'lcov-report'],
};

/**
 * Every name a walk that cannot say where a folder stands must skip: the names
 * that are state anywhere, and the tool-output names (the cautious answer).
 */
export const MACHINE_STATE_DIRECTORIES: ReadonlySet<string> = new Set([...STATE_ANYWHERE, ...Object.keys(TOOL_OUTPUT_MARKERS)]);

/** Where a folder stands: at the project root, and — when known — the names it holds. */
export interface DirectoryPlace { atRoot: boolean; entries?: readonly string[] }

/**
 * True when a directory of this name holds machine-made state, never a project's own files.
 * Without a place, a tool-output name is state at any depth (the old, cautious answer).
 */
export function isMachineStateDirectory(name: string, place?: DirectoryPlace): boolean {
    if (STATE_ANYWHERE.has(name)) return true;
    const markers = TOOL_OUTPUT_MARKERS[name];
    if (!markers) return false;
    if (!place) return true;
    return place.atRoot || !!place.entries?.some(entry => markers.includes(entry));
}

/** The files a tool always leaves in a folder of this name, or undefined when the name is not a tool's. */
export function toolOutputMarkers(name: string): readonly string[] | undefined {
    return TOOL_OUTPUT_MARKERS[name];
}

/**
 * Joe's records that belong to the project and travel with it: `.joe` is
 * Joe's state, but the external-API integration record inside it is read by
 * the preview proxy and the pipeline of the project itself
 * (core/api-discovery/preview-proxy.ts, integration.ts) — without it an
 * imported project's maintained API route answers 404.
 */
export const JOE_PROJECT_RECORDS: readonly string[] = ['.joe/external-api.json'];

/** Lockfiles: what a package manager writes, at any depth — never his wording. */
const LOCKFILES: ReadonlySet<string> = new Set([
    'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lock', 'bun.lockb', 'deno.lock',
    'composer.lock', 'Gemfile.lock', 'Pipfile.lock', 'poetry.lock', 'uv.lock', 'pdm.lock', 'Cargo.lock', 'go.sum',
    'mix.lock', 'pubspec.lock', 'Podfile.lock', 'packages.lock.json', 'flake.lock', 'gradle.lockfile',
]);

export function isLockfile(name: string): boolean {
    return LOCKFILES.has(path.basename(String(name || '')));
}

async function exists(file: string): Promise<boolean> {
    try { await fs.promises.access(file); return true; } catch { return false; }
}

/**
 * The kind of installed environment a folder is, read from what its installer
 * always writes into it — never from what the folder is called — or null.
 */
export async function installedEnvironmentKind(dir: string, entries: readonly string[], parentEntries: readonly string[] = []): Promise<string | null> {
    const kind = environmentKindByEntries(entries, parentEntries);
    if (kind !== COMPOSER_CANDIDATE) return kind;
    return await exists(path.join(dir, 'composer', 'installed.json')) ? 'Composer dependencies' : null;
}

/** The same question, for a walk that is synchronous by contract (the export archive). */
export function installedEnvironmentKindSync(dir: string, entries: readonly string[], parentEntries: readonly string[] = []): string | null {
    const kind = environmentKindByEntries(entries, parentEntries);
    if (kind !== COMPOSER_CANDIDATE) return kind;
    return fs.existsSync(path.join(dir, 'composer', 'installed.json')) ? 'Composer dependencies' : null;
}

const COMPOSER_CANDIDATE = 'composer?';
function environmentKindByEntries(entries: readonly string[], parentEntries: readonly string[]): string | null {
    if (entries.includes('pyvenv.cfg')) return 'a Python virtual environment';
    if (entries.includes('conda-meta')) return 'a conda environment';
    if (entries.includes('modules.txt') && parentEntries.includes('go.mod')) return 'vendored Go modules';
    if (entries.includes('composer')) return COMPOSER_CANDIDATE;
    return null;
}

/** One rule of a .gitignore, scoped to the folder that file stands in. */
export interface IgnoreRule { base: string; negate: boolean; dirOnly: boolean; matcher: Minimatch }

const GLOB_OPTIONS = { dot: true, nobrace: true, noext: true, nocomment: true, nonegate: true, platform: 'linux' as const };

/**
 * The rules of one .gitignore, as git reads them: `#` comments, `!` negation,
 * a trailing `/` for folders only, a slash at the start or in the middle
 * anchoring the pattern to this file's folder, and none matching at any depth
 * below it. The glob itself is minimatch's (a declared dependency), whose `*`,
 * `?`, `[…]` and `**` are git's.
 */
export function gitignoreRules(body: string, base = ''): IgnoreRule[] {
    const rules: IgnoreRule[] = [];
    for (const raw of String(body || '').split(/\r?\n/u)) {
        let line = raw.replace(/(?<!\\)\s+$/u, '');
        if (!line || line.startsWith('#')) continue;
        let negate = false;
        if (line.startsWith('!')) { negate = true; line = line.slice(1); }
        else if (line.startsWith('\\!') || line.startsWith('\\#')) line = line.slice(1);
        let dirOnly = false;
        if (line.endsWith('/')) { dirOnly = true; line = line.replace(/\/+$/u, ''); }
        if (!line) continue;
        const anchored = line.includes('/');
        const pattern = anchored ? line.replace(/^\/+/u, '') : `**/${line}`;
        rules.push({ base, negate, dirOnly, matcher: new Minimatch(pattern, GLOB_OPTIONS) });
    }
    return rules;
}

/** Whether these rules ignore this project-relative path (forward slashes). The last matching rule decides. */
export function isIgnored(rules: readonly IgnoreRule[], relative: string, isDirectory: boolean): boolean {
    let ignored = false;
    for (const rule of rules) {
        if (rule.dirOnly && !isDirectory) continue;
        const sub = !rule.base ? relative : relative.startsWith(`${rule.base}/`) ? relative.slice(rule.base.length + 1) : null;
        if (sub === null) continue;
        if (rule.matcher.match(sub)) ignored = !rule.negate;
    }
    return ignored;
}

/** How many folders or files one walk reads side by side (request-coverage's READ_CONCURRENCY). */
export const PROJECT_FS_CONCURRENCY = 32;

/** `fn` over `items`, at most `limit` running at once, results in input order. */
export async function mapBounded<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const index = next++;
            out[index] = await fn(items[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
    return out;
}

/** Project-relative paths in the order a name-sorted depth-first walk meets them, on every platform. */
export function byNameOrder(a: string, b: string): number {
    const x = a.split('/'), y = b.split('/');
    for (let i = 0; i < Math.min(x.length, y.length); i++) {
        if (x[i] !== y[i]) return x[i].localeCompare(y[i]);
    }
    return x.length - y.length;
}

export interface ProjectWalk {
    /** A folder this walker leaves out besides machine state (its own choice: build output, dot folders …). */
    skipDirectory?: (name: string, relative: string) => boolean;
    /** The files this walker wants; every file is kept when absent. */
    keepFile?: (relative: string, name: string) => boolean;
    /** Honour the project's own .gitignore files (default true). */
    gitignore?: boolean;
}

/** Entries processed between two turns of the event loop: a large folder never holds it. */
const YIELD_EVERY_ENTRIES = 512;
const yieldTurn = () => new Promise<void>(resolve => setImmediate(resolve));

/**
 * EVERY FILE OF THE PROJECT THAT IS HIS SOURCE, AT ANY DEPTH (round 22).
 *
 * One walker for every reader that asks «what did he write?»: complete (no
 * cap that silently cuts a real project), asynchronous, folders read a bounded
 * number at a time (a project of four thousand folders never floods the I/O
 * pool other users share), the event loop handed back as it goes, symbolic
 * links not followed, and paths returned relative, with forward slashes, in
 * name order.
 */
export async function listProjectFiles(root: string, walk: ProjectWalk = {}): Promise<string[]> {
    type Folder = { abs: string; rel: string; rules: readonly IgnoreRule[]; parentEntries: readonly string[] };
    const out: string[] = [];
    let level: Folder[] = [{ abs: path.resolve(root), rel: '', rules: [], parentEntries: [] }];
    let processed = 0;
    while (level.length) {
        const read = await mapBounded(level, PROJECT_FS_CONCURRENCY, async folder => {
            let entries: fs.Dirent[];
            try { entries = await fs.promises.readdir(folder.abs, { withFileTypes: true }); } catch { return null; }
            const names = entries.map(entry => entry.name);
            if (folder.rel) {
                // A tool's output deeper than the root, and an installed
                // environment whatever it is called, are known by what they hold.
                if (isMachineStateDirectory(path.basename(folder.abs), { atRoot: false, entries: names })) return null;
                if (await installedEnvironmentKind(folder.abs, names, folder.parentEntries)) return null;
            }
            let rules = folder.rules;
            if (walk.gitignore !== false && entries.some(entry => entry.name === '.gitignore' && entry.isFile())) {
                try { rules = rules.concat(gitignoreRules(await fs.promises.readFile(path.join(folder.abs, '.gitignore'), 'utf8'), folder.rel)); }
                catch { /* an unreadable .gitignore ignores nothing */ }
            }
            return { folder, entries, names, rules };
        });
        const next: Folder[] = [];
        for (const result of read) {
            if (!result) continue;
            for (const entry of result.entries) {
                if (++processed % YIELD_EVERY_ENTRIES === 0) await yieldTurn();
                const rel = result.folder.rel ? `${result.folder.rel}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    if (isMachineStateDirectory(entry.name, { atRoot: !result.folder.rel })) continue;
                    if (isIgnored(result.rules, rel, true)) continue;
                    if (walk.skipDirectory?.(entry.name, rel)) continue;
                    next.push({ abs: path.join(result.folder.abs, entry.name), rel, rules: result.rules, parentEntries: result.names });
                } else if (entry.isFile()) {
                    if (isIgnored(result.rules, rel, false)) continue;
                    if (walk.keepFile && !walk.keepFile(rel, entry.name)) continue;
                    out.push(rel);
                }
            }
        }
        level = next;
    }
    return out.sort(byNameOrder);
}

/**
 * A JSON STORE IS DATA THE PROGRAM WRITES, NOT WORDING HE WROTE.
 *
 * data.json of an api project holds his users' records; a literal text edit
 * that reaches it rewrites their data. The kind is read from the program
 * itself: a JSON path the project's code hands to a writer — fs.writeFile*,
 * appendFile*, createWriteStream, fs-extra's writeJson/outputJson, lowdb's
 * JSONFile, json-server's router — directly or through the name it was given
 * (`const FILE = path.join(HERE, 'data.json'); … writeFileSync(FILE, …)`), or
 * a json-server script. Returned as path tails (`data.json`, `db/store.json`).
 */
const STORE_WRITER = /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|outputJsonSync|outputJson|writeJsonSync|writeJson|outputFileSync|outputFile|JSONFileSync|JSONFile|FileSync|FileAsync|router)\s*\(\s*([^,)\n]*)/gu;

function jsonTailOf(expression: string): string | null {
    const pieces = [...String(expression || '').matchAll(/(['"`])([^'"`\n]*)\1/gu)].map(m => m[2].replace(/\$\{[^}]*\}/gu, '')).filter(Boolean);
    if (!pieces.length || !/\.json$/iu.test(pieces[pieces.length - 1])) return null;
    const tail = pieces.join('/').replace(/\\/gu, '/').replace(/\/+/gu, '/').replace(/^(?:\.{1,2}\/)+/u, '').replace(/^\/+/u, '');
    return tail || null;
}

export function jsonStoresWrittenBy(source: string): string[] {
    const text = String(source || '');
    // One name can be given in several scopes of one file (ApiProjectTool's
    // db.js and entities.js each say `const FILE = …`): every path it was given counts.
    const named = new Map<string, Set<string>>();
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/gu)) {
        const tail = jsonTailOf(m[2]);
        if (tail) named.set(m[1], (named.get(m[1]) || new Set<string>()).add(tail));
    }
    const out = new Set<string>();
    for (const m of text.matchAll(STORE_WRITER)) {
        const argument = m[1].trim();
        const direct = jsonTailOf(argument);
        const tails = direct ? [direct] : [...(named.get(/^([A-Za-z_$][\w$]*)/u.exec(argument)?.[1] || '') || [])];
        for (const tail of tails) out.add(tail);
    }
    for (const m of text.matchAll(/json-server\b[^"'&|;\n]*?([\w./-]+\.json)/gu)) out.add(m[1].replace(/^(?:\.{1,2}\/)+/u, ''));
    return [...out];
}

/** Whether a project-relative JSON path is one of these store tails. */
export function isJsonStore(relative: string, tails: readonly string[]): boolean {
    const rel = String(relative || '').replace(/\\/gu, '/');
    return /\.json$/iu.test(rel) && tails.some(tail => rel === tail || rel.endsWith(`/${tail}`));
}
