/**
 * THE BROWSER QA LEAVES THE APP AS IT FOUND IT.
 *
 * The QA types into every form of the app it measures — a name of digits, a
 * name of spaces, `<b>qa</b><img src=x onerror=…>` — and a working app keeps
 * what it is given. On 2026-11-11 (qa-live15, the electronics store) the
 * delivered store.db held two orders and three warranties named with that
 * markup, and a product «QA123». They were the QA's, not the builder's, and
 * the user would have opened his new app on them.
 *
 * They cost the delivery too. Each measurement saw the rows the one before it
 * left: the look judge was shown a products table with «<b>qa</b>…» in it and
 * answered «does not look clean», twice — two refused deliveries, four minutes
 * of re-measuring, for text the app had escaped correctly.
 *
 * So the files the running app keeps its records in are read before the
 * QA's first press and written back after its last, with the server stopped
 * (a running server holds them open, and keeps its own copy in memory). A
 * file the QA made the app create — an upload, a database that was not there
 * — is removed. Only data is touched: a database file anywhere, and the
 * files under a folder an app keeps records in. Source, builds, Joe's own
 * folder and anything Joe's repair changed on purpose are never touched.
 */
import crypto from 'crypto';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';

/** Folders that are never an app's records: dependencies, builds, caches, Joe's own state. */
const NOT_DATA_DIRS = new Set([
    'node_modules', '.git', '.joe', '.next', '.nuxt', '.svelte-kit', '.output', 'dist', 'build', 'out',
    'coverage', '.cache', '.parcel-cache', '.turbo', '.vite', '__pycache__', '.pytest_cache', '.venv', 'venv',
    '.mypy_cache', '.idea', '.vscode',
]);
/** A database file, wherever it is kept, with the journal files beside it. */
const DATABASE_FILE = /\.(?:db|sqlite|sqlite3|db3)(?:-wal|-shm|-journal)?$/iu;
/** A folder an app keeps its records or uploads in: every file inside but code is data. («store» is not one: it is where a React app keeps its state code.) */
const DATA_DIR = /^(?:data|db|database|databases|storage|uploads?|var|records)$/iu;
/** Code and schema kept beside the records (data/seed.js, db/migrations/001.sql): source, never data. */
const CODE_FILE = /\.(?:[cm]?[jt]sx?|py|rb|go|java|php|sql|css|scss|html?|vue|svelte|md)$/iu;
/** A records file kept outside such a folder: db.json, store.json, data.jsonl… */
const RECORDS_FILE = /^(?:db|database|data|store|storage|records|items|entries)\.json$|\.(?:jsonl|ndjson)$/iu;

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_TOTAL_BYTES = 256 * 1024 * 1024;
const MAX_DEPTH = 6;
/** Where the copies are kept: on disk, never in memory — one server verifies for many users at once. */
const SNAPSHOT_HOME = path.join(os.tmpdir(), 'joe-qa-snapshots');
/** A snapshot a crashed verification never discarded is removed by the next one after this long. */
const STALE_MS = 6 * 60 * 60 * 1000;

export interface KeptFile { copy: string; size: number; hash: string; atime: Date; mtime: Date }

export interface AppDataSnapshot {
    root: string;
    /** The folder the copies are kept in (discardSnapshot removes it). */
    dir: string;
    /** Every data file as it was, by absolute path. */
    files: Map<string, KeptFile>;
    /** Data files not copied (too large, or of a database another of whose files was): never written back, and said so. */
    tooLarge: string[];
    /**
     * Whether the walk saw every data file. When it stopped at MAX_FILES, a file it
     * did not see is not one the app created since: nothing is removed then.
     */
    complete: boolean;
}

/**
 * A database and its journal files are one thing: x.db with x.db-wal, -shm, -journal. The
 * review of 2026-11-11: a 20 MB app.db left as the QA left it while its WAL was put back
 * replays an old log over a newer file. They are kept, and put back, all together or not at all.
 */
const familyOf = (file: string) => file.replace(/-(?:wal|shm|journal)$/iu, '').toLowerCase();
const hashOf = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

export interface AppDataRestore {
    restored: string[];
    removed: string[];
    failed: string[];
    tooLarge: string[];
}

/**
 * Whether a project-relative path is one of the app's data files, as the snapshot keeps them: a database file
 * (`*.db|sqlite|sqlite3|db3` and its `-wal/-shm/-journal`) anywhere, any non-code file under a folder named
 * `data|db|database|databases|storage|uploads?|var|records`, or a records file (`db|database|data|store|storage|
 * records|items|entries .json`, `*.jsonl`, `*.ndjson`). The caller skips `NOT_DATA_DIRS` (the walk does). Exported for
 * the 2T router (`qa-target.ts`, rule T4), which proves an app keeps nothing outside this list.
 */
export function isData(rel: string): boolean {
    const parts = rel.split(/[\\/]/u);
    const name = parts[parts.length - 1];
    if (DATABASE_FILE.test(name)) return true;
    if (parts.slice(0, -1).some(p => DATA_DIR.test(p))) return !CODE_FILE.test(name);
    return RECORDS_FILE.test(name);
}

/**
 * The data files under `root` now, and whether the walk saw them all. Links are never followed.
 *
 * The cap cuts the walk wherever it falls, so two walks of one folder can see
 * different files: the adversarial review of 2026-11-12 had an app with 2,100
 * photos in uploads/, a database whose -wal and -shm files went away when its
 * server closed it cleanly, and the window slid by two — two of the owner's
 * photos, never seen by the snapshot, were removed as «created by the QA».
 * A walk that stopped at the cap says so, and nothing is removed on its word.
 */
async function dataFiles(root: string): Promise<{ files: string[]; complete: boolean }> {
    const found: string[] = [];
    let complete = true;
    const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > MAX_DEPTH) return;
        if (found.length >= MAX_FILES) { complete = false; return; }
        let entries: fs.Dirent[];
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (found.length >= MAX_FILES) { complete = false; return; }
            if (e.isSymbolicLink()) continue;
            const abs = path.join(dir, e.name);
            if (e.isDirectory()) {
                if (!NOT_DATA_DIRS.has(e.name.toLowerCase())) await walk(abs, depth + 1);
            } else if (e.isFile() && isData(path.relative(root, abs))) {
                found.push(abs);
            }
        }
    };
    await walk(root, 0);
    return { files: found, complete };
}

/** Removes the copies a verification kept; and those a crashed one left behind, once stale. */
export async function discardSnapshot(s?: AppDataSnapshot): Promise<void> {
    if (s?.dir) await fs.promises.rm(s.dir, { recursive: true, force: true }).catch(() => { });
}

async function pruneStale(): Promise<void> {
    let names: string[] = [];
    try { names = await fs.promises.readdir(SNAPSHOT_HOME); } catch { return; }
    for (const name of names) {
        const dir = path.join(SNAPSHOT_HOME, name);
        try {
            if (Date.now() - (await fs.promises.stat(dir)).mtimeMs > STALE_MS) await fs.promises.rm(dir, { recursive: true, force: true });
        } catch { /* another verification's, or already gone */ }
    }
}

/** The app's data files as they are now: taken before the QA's first press. */
export async function snapshotAppData(root: string): Promise<AppDataSnapshot> {
    await pruneStale();
    await fs.promises.mkdir(SNAPSHOT_HOME, { recursive: true });
    const dir = await fs.promises.mkdtemp(path.join(SNAPSHOT_HOME, 'snap-'));
    const files = new Map<string, KeptFile>();
    const { files: found, complete } = await dataFiles(root);
    //  Sizes first, so a database is kept whole or not at all.
    const sizes = new Map<string, number>();
    for (const file of found) { try { sizes.set(file, (await fs.promises.stat(file)).size); } catch { /* gone: nothing to keep */ } }
    const families = new Map<string, string[]>();
    for (const file of sizes.keys()) families.set(familyOf(file), [...(families.get(familyOf(file)) || []), file]);
    const tooLarge: string[] = [];
    let total = 0;
    let n = 0;
    for (const members of families.values()) {
        const bytes = members.reduce((sum, f) => sum + (sizes.get(f) || 0), 0);
        if (members.some(f => (sizes.get(f) || 0) > MAX_FILE_BYTES) || total + bytes > MAX_TOTAL_BYTES) { tooLarge.push(...members); continue; }
        const kept: Array<[string, KeptFile]> = [];
        try {
            for (const file of members) {
                const st = await fs.promises.stat(file);
                const buf = await fs.promises.readFile(file);
                const copy = path.join(dir, `${++n}.bin`);
                await fs.promises.writeFile(copy, buf);
                kept.push([file, { copy, size: buf.length, hash: hashOf(buf), atime: st.atime, mtime: st.mtime }]);
            }
        } catch {
            tooLarge.push(...members);   // one of its files could not be read: the database is left whole
            continue;
        }
        for (const [file, k] of kept) files.set(file, k);
        total += bytes;
    }
    return { root, dir, files, tooLarge, complete };
}

async function unchanged(file: string, k: KeptFile): Promise<boolean> {
    const st = await fs.promises.stat(file);
    if (st.size !== k.size) return false;
    return hashOf(await fs.promises.readFile(file)) === k.hash;
}

/** The data files the app changed or created since the snapshot (a file kept on purpose excluded). */
export async function appDataChanges(s: AppDataSnapshot, keep: readonly string[] = []): Promise<string[]> {
    const kept = new Set(keep.map(k => path.resolve(s.root, k).toLowerCase()));
    //  A database not copied is not touched at all, journal files it made since included.
    const untouched = new Set(s.tooLarge.map(familyOf));
    const changed: string[] = [];
    const walk = await dataFiles(s.root);
    const now = new Set(walk.files.map(f => path.resolve(f)));
    //  A file is «created since» only when both walks saw every data file.
    const sawAll = s.complete !== false && walk.complete;
    for (const file of now) {
        if (kept.has(file.toLowerCase()) || untouched.has(familyOf(file))) continue;
        const before = s.files.get(file);
        if (!before) { if (sawAll) changed.push(file); continue; }
        try { if (!(await unchanged(file, before))) changed.push(file); } catch { changed.push(file); }
    }
    for (const [file, before] of s.files) {
        if (now.has(file) || kept.has(file.toLowerCase())) continue;
        //  Not seen now: gone, or past the cap of a walk that stopped early.
        if (!walk.complete) { try { if (await unchanged(file, before)) continue; } catch { /* gone */ } }
        changed.push(file);
    }
    return changed;
}

/** A file a server has just let go of can still be held for a moment on Windows. */
async function retry<T>(work: () => Promise<T>): Promise<T> {
    let last: unknown;
    for (let i = 0; i < 8; i++) {
        try { return await work(); } catch (e: any) {
            last = e;
            if (!/EBUSY|EPERM|EACCES|ENOTEMPTY/u.test(String(e?.code || e?.message))) throw e;
            await new Promise(r => setTimeout(r, 150 * (i + 1)));
        }
    }
    throw last;
}

/**
 * Puts every data file back as the snapshot holds it, and removes what the
 * app created since. Call it with the app's server stopped.
 */
export async function restoreAppData(s: AppDataSnapshot, keep: readonly string[] = []): Promise<AppDataRestore> {
    const result: AppDataRestore = { restored: [], removed: [], failed: [], tooLarge: [...s.tooLarge] };
    //  One family at a time: a database and its journal files, or a single file on its own.
    const families = new Map<string, string[]>();
    for (const file of await appDataChanges(s, keep)) families.set(familyOf(file), [...(families.get(familyOf(file)) || []), file]);
    for (const members of families.values()) {
        const staged: Array<{ file: string; tmp: string; k: KeptFile }> = [];
        try {
            //  Every copy is written beside its file first: a family that cannot be staged whole is not touched.
            for (const file of members) {
                const k = s.files.get(file);
                if (!k) continue;
                const tmp = `${file}.joe-restore`;
                await retry(async () => {
                    await fs.promises.mkdir(path.dirname(file), { recursive: true });
                    await fs.promises.copyFile(k.copy, tmp);
                });
                staged.push({ file, tmp, k });
            }
            for (const file of members) if (!s.files.has(file)) { await retry(() => fs.promises.rm(file, { force: true })); result.removed.push(path.relative(s.root, file)); }
            for (const { file, tmp, k } of staged) {
                await retry(() => fs.promises.rename(tmp, file));
                //  Its own times back too: what fingerprints the code reads them, and a walk's carried parts with it.
                await fs.promises.utimes(file, k.atime, k.mtime).catch(() => { });
                result.restored.push(path.relative(s.root, file));
            }
        } catch (e: any) {
            for (const { tmp } of staged) await fs.promises.rm(tmp, { force: true }).catch(() => { });
            const why = String(e?.code || e?.message || e).slice(0, 80);
            result.failed.push(...members.map(f => `${path.relative(s.root, f)} (${why})`));
        }
    }
    return result;
}

/**
 * Whether nothing answers at the address any more, waited for briefly.
 *
 * A stop is not proof. qa-live16 (2026-11-11), the flower shop's chatbot, on a
 * machine at 100%: the stop's check of the recorded process timed out, it
 * said «no longer running; nothing to kill», and the server it had started
 * went on listening. The records file was written back under it — a server
 * that keeps its own copy in memory and writes it out again — and the start
 * that followed died on the taken port, a minute each time. A file is put
 * back only once the port is free.
 */
export async function addressIsFree(url: string, waitMs = 6000): Promise<boolean> {
    let hosts = ['127.0.0.1'];
    let port = 0;
    try {
        const u = new URL(url);
        //  «localhost» is two addresses: a server bound to ::1 alone (a dev server that
        //  ignores HOST, a listen(port, 'localhost') on a machine that resolves it to IPv6)
        //  answers there and nowhere else — the adversarial review of 2026-11-12.
        hosts = u.hostname === 'localhost' ? ['127.0.0.1', '::1'] : [u.hostname.replace(/^\[|\]$/gu, '')];
        port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    } catch { return true; }
    //  Refused: nothing listens. Accepted, or no answer at all in a second: something still holds it.
    const holds = (host: string) => new Promise<boolean>(resolve => {
        const socket = net.connect({ host, port });
        const done = (value: boolean) => { socket.destroy(); resolve(value); };
        socket.setTimeout(1000, () => done(true));
        socket.once('connect', () => done(true));
        socket.once('error', () => done(false));
    });
    const until = Date.now() + waitMs;
    for (;;) {
        const held = (await Promise.all(hosts.map(holds))).some(Boolean);
        if (!held) return true;
        if (Date.now() >= until) return false;
        await new Promise(r => setTimeout(r, 250));
    }
}

/** One line for the verification log: what the QA's own records were, and that they are gone. */
export function restoreLine(r: AppDataRestore): string {
    const parts: string[] = [];
    if (r.restored.length) parts.push(`${r.restored.length} data file(s) put back as they were before it (${r.restored.slice(0, 6).join(', ')}${r.restored.length > 6 ? ', …' : ''})`);
    if (r.removed.length) parts.push(`${r.removed.length} file(s) it made the app create removed (${r.removed.slice(0, 6).join(', ')}${r.removed.length > 6 ? ', …' : ''})`);
    if (r.failed.length) parts.push(`could not be put back: ${r.failed.join(', ')}`);
    if (r.tooLarge.length) parts.push(`too large to keep a copy of, so left as the QA left them: ${r.tooLarge.map(f => path.basename(f)).join(', ')}`);
    return `the QA's own records are gone from the app: ${parts.join('; ') || 'nothing had changed'}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RECOVERY COPY (design v13.3 §5b): every version of the owner's data the verification saw, kept outside
// the project.
//
// On path 2T the verification walks the owner's live app as today and puts his data files back as today, whole.
// A record he (or the app itself) wrote during that span is overwritten by the put-back — today's behaviour. So
// from the snapshot to the end of the last put-back, every new version of every data file is copied, BEFORE
// anything is put back, into Joe's own data folder:
//
//     <JOE_DATA_DIR>/qa-recovery/<workspaceId>/<projectKey>/<runId>/<n>/<path in the project>
//
// Never under the project: no git, no Pages copy, no deploy zip, no `express.static` of the project, no export
// can reach it, and it sits beside `projects/`, outside every workspace root the model's file tools are rooted at.
// Folders are made with mode 0700, files 0600. Bringing a version back is a file copy by Joe's code, never a read
// into a prompt.
//
// Only 2T uses any of this (a new build and paths 1 and 3 do not): nothing above this line changed for them.
// ─────────────────────────────────────────────────────────────────────────────

/** The folder name under Joe's data folder. */
export const QA_RECOVERY = 'qa-recovery';

/** How much the recovery copies may hold (§5b step 3). */
export interface RecoveryBudget {
    /** Per project, every run and every flush included (512 MB). Over it, only the newest version of each file is kept. */
    projectBytes: number;
    /** For the whole `qa-recovery` folder of this server (5 GB). Over it, the oldest runs of any project go first. */
    serverBytes: number;
    /** Per project, the newest runs kept (5). */
    keepRuns: number;
    /** Nothing older than this many days is kept (14). */
    keepDays: number;
}

/** The design's numbers: 512 MB a project, 5 GB a server, the newest 5 runs, 14 days. */
export const RECOVERY_BUDGET: RecoveryBudget = Object.freeze({
    projectBytes: 512 * 1024 * 1024,
    serverBytes: 5 * 1024 * 1024 * 1024,
    keepRuns: 5,
    keepDays: 14,
});

/** At most this many watchers poll at their full rate on one server; the next ones poll every second (§5b step 1). */
export const RECOVERY_FULL_RATE_WATCHERS = 8;

/** Joe's own data folder: `JOE_DATA_DIR`, else `<cwd>/data` (as `budget.ts` and `process-ledger.ts` read it). */
export function joeDataDir(env: NodeJS.ProcessEnv = process.env): string {
    return path.resolve(String(env.JOE_DATA_DIR || '').trim() || path.join(process.cwd(), 'data'));
}

/** `<JOE_DATA_DIR>/qa-recovery`: the one place every recovery copy and verify lock of this server lives. */
export function recoveryHome(env: NodeJS.ProcessEnv = process.env): string {
    return path.join(joeDataDir(env), QA_RECOVERY);
}

/** A folder name made safe: no separator, no dot-only name, bounded. */
function segment(s: string): string {
    const clean = String(s ?? '').replace(/[^A-Za-z0-9_.-]/gu, '_').slice(0, 80);
    return !clean || /^\.+$/u.test(clean) ? '_' : clean;
}

/** The real path, its case folded where the filesystem folds it. */
function realOf(dir: string): string {
    let real = path.resolve(dir);
    try { real = fs.realpathSync.native(real); } catch { /* not there yet: its resolved path */ }
    return process.platform === 'win32' ? real.toLowerCase() : real;
}

/** `sha256(realpath(projectRoot)).slice(0, 16)`: the project's folder name in the recovery home. */
export function projectKeyOf(projectRoot: string): string {
    return crypto.createHash('sha256').update(realOf(projectRoot)).digest('hex').slice(0, 16);
}

/** `<home>/<workspaceId>/<projectKey>`: one project's runs and its verify lock. */
export function recoveryProjectDir(workspaceId: string, projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(recoveryHome(env), segment(workspaceId), projectKeyOf(projectRoot));
}

/** `<home>/<workspaceId>/<projectKey>/<runId>`: what `watchAppData`'s `into` is for one verification. */
export function recoveryRunDir(workspaceId: string, projectRoot: string, runId: string, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(recoveryProjectDir(workspaceId, projectRoot, env), segment(runId));
}

/** `<run>/<n>`: one kept version; its files sit at their paths in the project. */
export function recoveryVersionDir(workspaceId: string, projectRoot: string, runId: string, n: number, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(recoveryRunDir(workspaceId, projectRoot, runId, env), String(Math.max(1, Math.floor(n))));
}

/** Whether `child` is `parent` or inside it (resolved, links followed where they exist, case folded on Windows). */
export function isInsideFolder(child: string, parent: string): boolean {
    const rel = path.relative(realOf(parent), realOf(child));
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** The poll interval for a watcher of `files` files (§5b step 1): 50 ms up to 50, 250 ms up to 200, 1 s beyond; 1 s past the eighth watcher. */
export function recoveryIntervalMs(files: number, watcherOrdinal = 1): number {
    if (watcherOrdinal > RECOVERY_FULL_RATE_WATCHERS) return 1000;
    if (files <= 50) return 50;
    if (files <= 200) return 250;
    return 1000;
}

/** The recovery watcher of one verification span (§5b steps 1–2). */
export interface AppDataWatch {
    /** Every change the poll saw, by project-relative path (forward slashes); `at` is the moment the poll saw it. */
    changes(): Array<{ file: string; at: number }>;
    /** Every version kept (still on disk), oldest first: its number, its files (project-relative), when, and its bytes. */
    versions(): Array<{ n: number; files: string[]; at: number; bytes: number }>;
    /**
     * Takes one last version of every file that differs from its last copy. Call it inside `putQaRecordsBack`, after
     * `project_stop` and `addressIsFree`, immediately before `restoreAppData`, so the server's shutdown writes are in it.
     */
    flush(why: string): Promise<void>;
    /** Stops polling (the copies stay; an empty run folder is removed). */
    stop(): Promise<void>;
    /** Whether the per-project cap was hit, so only the newest version of each file is kept (`recoveryOverBudget`). */
    overBudget(): boolean;
}

/** The runs being written now, never pruned under a watcher. */
const activeRuns = new Set<string>();
let activeWatchers = 0;

const RUN_INDEX = 'run.json';
const RECOVERY_DATA_DIRS = ['data', 'db', 'database', 'databases', 'storage', 'uploads', 'upload', 'var', 'records'];

async function mkdirPrivate(dir: string): Promise<void> {
    await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== 'win32') await fs.promises.chmod(dir, 0o700).catch(() => { });
}

async function writePrivate(file: string, data: Buffer | string): Promise<void> {
    await fs.promises.writeFile(file, data, { mode: 0o600 });
    if (process.platform !== 'win32') await fs.promises.chmod(file, 0o600).catch(() => { });
}

/** Bytes under a folder (links not followed). */
async function bytesUnder(dir: string): Promise<number> {
    let total = 0;
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
        const abs = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) total += await bytesUnder(abs);
        else if (e.isFile()) { try { total += (await fs.promises.stat(abs)).size; } catch { /* gone */ } }
    }
    return total;
}

interface RunEntry { dir: string; startedAt: number; bytes: number }

/** The runs of one project folder, newest first. */
async function runsOf(projectDir: string): Promise<RunEntry[]> {
    let entries: fs.Dirent[];
    try { entries = await fs.promises.readdir(projectDir, { withFileTypes: true }); } catch { return []; }
    const runs: RunEntry[] = [];
    for (const e of entries) {
        if (!e.isDirectory() || e.isSymbolicLink()) continue;
        const dir = path.join(projectDir, e.name);
        let startedAt = NaN;
        try { startedAt = Number(JSON.parse(await fs.promises.readFile(path.join(dir, RUN_INDEX), 'utf8'))?.startedAt); } catch { /* no index */ }
        if (!Number.isFinite(startedAt)) { try { startedAt = (await fs.promises.stat(dir)).mtimeMs; } catch { continue; } }
        runs.push({ dir, startedAt, bytes: await bytesUnder(dir) });
    }
    return runs.sort((a, b) => b.startedAt - a.startedAt);
}

/** Every project folder under the recovery home. */
async function projectDirsOf(home: string): Promise<string[]> {
    const out: string[] = [];
    let spaces: fs.Dirent[];
    try { spaces = await fs.promises.readdir(home, { withFileTypes: true }); } catch { return out; }
    for (const ws of spaces) {
        if (!ws.isDirectory() || ws.isSymbolicLink()) continue;
        let keys: fs.Dirent[];
        try { keys = await fs.promises.readdir(path.join(home, ws.name), { withFileTypes: true }); } catch { continue; }
        for (const k of keys) if (k.isDirectory() && !k.isSymbolicLink()) out.push(path.join(home, ws.name, k.name));
    }
    return out;
}

const isActive = (dir: string) => activeRuns.has(path.resolve(dir));

/** What a prune removed. */
export interface RecoveryPrune { removedRuns: string[]; bytesFreed: number }

/**
 * Applies §5b step 3. With `projectDir`: that project's retention (the newest `keepRuns` runs, nothing older than
 * `keepDays`, at most `projectBytes`); without it: every project's. Then the server-wide cap (`serverBytes`, the
 * oldest runs of any project first) over `recoveryHome(env)`. A run a watcher is writing is never removed.
 * Called when `watchAppData` starts, at boot and hourly (`startRecoveryUpkeep`).
 */
export async function pruneRecovery(opts: { env?: NodeJS.ProcessEnv; budget?: RecoveryBudget; projectDir?: string; home?: string; now?: number } = {}): Promise<RecoveryPrune> {
    const budget = opts.budget ?? RECOVERY_BUDGET;
    const now = opts.now ?? Date.now();
    const home = opts.home ?? recoveryHome(opts.env);
    const out: RecoveryPrune = { removedRuns: [], bytesFreed: 0 };
    //  Only ever inside a folder named qa-recovery: a wrong argument never sweeps anything else.
    if (path.basename(path.resolve(home)) !== QA_RECOVERY) return out;
    if (opts.projectDir && !isInsideFolder(opts.projectDir, home)) return out;
    const drop = async (r: RunEntry) => {
        await fs.promises.rm(r.dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => { });
        out.removedRuns.push(r.dir);
        out.bytesFreed += r.bytes;
    };
    const projects = opts.projectDir ? [opts.projectDir] : await projectDirsOf(home);
    for (const projectDir of projects) {
        const runs = await runsOf(projectDir);
        let total = runs.reduce((s, r) => s + r.bytes, 0);
        const kept: RunEntry[] = [];
        for (const r of runs) {
            const tooOld = now - r.startedAt > budget.keepDays * 24 * 60 * 60 * 1000;
            if (!isActive(r.dir) && (tooOld || kept.length >= budget.keepRuns)) { await drop(r); total -= r.bytes; continue; }
            kept.push(r);
        }
        for (let i = kept.length - 1; i >= 0 && total > budget.projectBytes; i--) {
            if (isActive(kept[i].dir)) continue;
            await drop(kept[i]);
            total -= kept[i].bytes;
        }
        //  A project folder with nothing left in it goes too (a held lock keeps it).
        try { if (!(await fs.promises.readdir(projectDir)).length) await fs.promises.rmdir(projectDir); } catch { /* not empty, or gone */ }
    }
    //  The server-wide cap: the oldest runs of any project first.
    const all: RunEntry[] = [];
    for (const projectDir of await projectDirsOf(home)) all.push(...await runsOf(projectDir));
    let serverTotal = all.reduce((s, r) => s + r.bytes, 0);
    for (const r of all.sort((a, b) => a.startedAt - b.startedAt)) {
        if (serverTotal <= budget.serverBytes) break;
        if (isActive(r.dir)) continue;
        await drop(r);
        serverTotal -= r.bytes;
    }
    return out;
}

/**
 * The boot hook's one call (§5b steps 3 and 5): sweeps stale verify locks and prunes the whole recovery home now,
 * then prunes every hour while Joe runs (the timer never holds the process open). `ready` settles after the first pass.
 */
export function startRecoveryUpkeep(opts: { env?: NodeJS.ProcessEnv; budget?: RecoveryBudget; everyMs?: number } = {}): { ready: Promise<void>; stop(): void } {
    const pass = async () => {
        await sweepStaleVerifyLocks(opts.env).catch(() => 0);
        await pruneRecovery({ env: opts.env, budget: opts.budget }).catch(() => undefined);
    };
    const ready = pass();
    const timer = setInterval(() => { void pass(); }, Math.max(1000, opts.everyMs ?? 60 * 60 * 1000));
    timer.unref?.();
    return { ready, stop: () => clearInterval(timer) };
}

/** The content hash of a family as kept: its members' names and hashes, `-shm` aside (SQLite rebuilds it). */
function familyHash(members: Array<[string, string]>): string {
    return members.filter(([f]) => !/-shm$/iu.test(f)).map(([f, h]) => `${path.basename(f).toLowerCase()}=${h}`).sort().join('|');
}

/**
 * Watches the snapshot's data files (and the data folders, for files that appear) from the snapshot to the end of
 * the last put-back, and copies every new version into `into` (§5b steps 1–3). `into` is the run's folder
 * (`recoveryRunDir(workspaceId, projectRoot, runId)`); it must be outside the project — the watch refuses otherwise.
 * It stats with `fs.promises` (the thread pool), on an interval scaled to the number of files watched. A SQLite
 * family is copied consistently: with `node:sqlite`'s `backup()` into one `x.db` when a `-wal` exists, else
 * byte-copied and re-copied until two stats of the family agree. A version identical to the last copy is not copied
 * again. Over `budget.projectBytes`, only the newest version of each file is kept and `overBudget()` says so.
 */
export function watchAppData(s: AppDataSnapshot, opts: { into: string; budget: RecoveryBudget }): AppDataWatch {
    const root = path.resolve(s.root);
    const into = path.resolve(opts.into);
    if (isInsideFolder(into, root)) throw new Error('the recovery copy must be kept outside the project folder');
    if (isInsideFolder(root, into)) throw new Error('the recovery folder must not hold the project folder');
    const budget = opts.budget ?? RECOVERY_BUDGET;
    const projectDir = path.dirname(into);
    const homeGuess = path.dirname(path.dirname(projectDir));
    const home = path.basename(homeGuess) === QA_RECOVERY ? homeGuess : undefined;
    activeRuns.add(into);
    activeWatchers++;
    const ordinal = activeWatchers;
    const startedAt = Date.now();

    const changes: Array<{ file: string; at: number }> = [];
    const versions: Array<{ n: number; files: string[]; at: number; bytes: number; why: string }> = [];
    const seen = new Map<string, string>();          // file → `mtime:size` as last stat
    const content = new Map<string, string>();       // file → content hash as last read ('gone' when gone)
    const lastCopy = new Map<string, string>();      // family → familyHash of the last copy (seeded with the snapshot)
    const untouched = new Set(s.tooLarge.map(familyOf));
    let seq = 0;
    let runBytes = 0;
    let otherBytes = 0;
    let over = false;
    let stopped = false;
    let timer: NodeJS.Timeout | null = null;
    let chain: Promise<void> = Promise.resolve();
    const serial = (work: () => Promise<void>) => { chain = chain.then(work, work).catch(() => { }); return chain; };
    const rel = (abs: string) => path.relative(root, abs).split(path.sep).join('/');
    const stampOf = (st: fs.Stats) => `${Math.floor(st.mtimeMs)}:${st.size}`;

    //  Seeds: the snapshot's own state, so a change made since the snapshot is seen on the first poll.
    const families = new Map<string, Array<[string, string]>>();
    for (const [file, k] of s.files) {
        seen.set(file, `${Math.floor(k.mtime.getTime())}:${k.size}`);
        content.set(file, k.hash);
        families.set(familyOf(file), [...(families.get(familyOf(file)) || []), [file, k.hash]]);
    }
    for (const [fam, members] of families) lastCopy.set(fam, familyHash(members));

    //  The folders listed each poll: the project root (its records files), every data folder a snapshot file sits
    //  in or under, the folder beside each snapshot file (a journal that appears), and the usual data folder names.
    const listed = new Map<string, boolean>();       // folder → recursive
    listed.set(root, false);
    for (const name of RECOVERY_DATA_DIRS) listed.set(path.join(root, name), true);
    for (const file of s.files.keys()) {
        if (!listed.has(path.dirname(file))) listed.set(path.dirname(file), false);
        const parts = path.relative(root, path.dirname(file)).split(path.sep);
        for (let i = 0; i < parts.length; i++) if (DATA_DIR.test(parts[i])) { listed.set(path.join(root, ...parts.slice(0, i + 1)), true); break; }
    }

    const currentFiles = async (): Promise<string[]> => {
        const found = new Set<string>(s.files.keys());
        const walk = async (dir: string, recursive: boolean, depth: number) => {
            if (found.size >= MAX_FILES || depth > MAX_DEPTH) return;
            let entries: fs.Dirent[];
            try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
            for (const e of entries) {
                if (found.size >= MAX_FILES) return;
                if (e.isSymbolicLink()) continue;
                const abs = path.join(dir, e.name);
                if (e.isDirectory()) { if (recursive && !NOT_DATA_DIRS.has(e.name.toLowerCase())) await walk(abs, true, depth + 1); continue; }
                if (e.isFile() && isData(path.relative(root, abs)) && !/-shm$/iu.test(e.name)) found.add(abs);
            }
        };
        for (const [dir, recursive] of listed) {
            const depth = path.relative(root, dir).split(path.sep).filter(Boolean).length;
            await walk(dir, recursive, depth);
        }
        return [...found].filter(f => !untouched.has(familyOf(f)) && !/-shm$/iu.test(f));
    };

    const hashFile = async (file: string) => hashOf(await fs.promises.readFile(file));

    /** Copies a family into `dest`, consistently; returns the files written (project-relative) and their bytes. */
    const copyFamily = async (members: string[], dest: string): Promise<{ files: string[]; bytes: number }> => {
        const exists = async (f: string) => { try { return (await fs.promises.stat(f)).isFile(); } catch { return false; } };
        const present: string[] = [];
        for (const m of members) if (!/-shm$/iu.test(m) && await exists(m)) present.push(m);
        const main = present.find(f => !/-(?:wal|journal)$/iu.test(f));
        const wal = present.find(f => /-wal$/iu.test(f));
        if (main && wal && DATABASE_FILE.test(main)) {
            //  A live WAL database: one consistent x.db, through SQLite's own backup.
            const to = path.join(dest, path.relative(root, main));
            try {
                await mkdirPrivate(path.dirname(to));
                const sqlite = require('node:sqlite') as typeof import('node:sqlite');
                const db = new sqlite.DatabaseSync(main, { readOnly: true });
                try { await sqlite.backup(db, to); } finally { db.close(); }
                //  The copy is one file that opens on its own: out of WAL mode, so no -wal or -shm is ever beside it.
                const check = new sqlite.DatabaseSync(to);
                try { check.exec('PRAGMA journal_mode=DELETE'); check.prepare('SELECT count(*) AS n FROM sqlite_master').get(); } finally { check.close(); }
                for (const extra of ['-wal', '-shm', '-journal']) await fs.promises.rm(to + extra, { force: true }).catch(() => { });
                if (process.platform !== 'win32') await fs.promises.chmod(to, 0o600).catch(() => { });
                return { files: [rel(main)], bytes: (await fs.promises.stat(to)).size };
            } catch {
                await fs.promises.rm(to, { force: true }).catch(() => { });
                //  No node:sqlite, or the backup failed: byte copies below.
            }
        }
        //  Byte copies, again until two stats of the family agree.
        const stats = async () => (await Promise.all(present.map(async f => { try { return stampOf(await fs.promises.stat(f)); } catch { return 'gone'; } }))).join('|');
        let written: { files: string[]; bytes: number } = { files: [], bytes: 0 };
        for (let attempt = 0; attempt < 5; attempt++) {
            const before = await stats();
            written = { files: [], bytes: 0 };
            for (const f of present) {
                let buf: Buffer;
                try { buf = await fs.promises.readFile(f); } catch { continue; }
                const to = path.join(dest, path.relative(root, f));
                await mkdirPrivate(path.dirname(to));
                await writePrivate(to, buf);
                written.files.push(rel(f));
                written.bytes += buf.length;
            }
            if ((await stats()) === before) break;
        }
        return written;
    };

    const writeIndex = async () => {
        const index = { runId: path.basename(into), startedAt, overBudget: over, versions: versions.map(v => ({ n: v.n, at: v.at, why: v.why, files: v.files, bytes: v.bytes })) };
        await writePrivate(path.join(into, RUN_INDEX), JSON.stringify(index, null, 2)).catch(() => { });
    };

    /** Over the cap: keep only the newest version of each file; then older runs of this project make room. */
    const keepNewestOnly = async () => {
        const newest = new Map<string, number>();
        for (const v of versions) for (const f of v.files) newest.set(f, v.n);
        for (const v of versions) {
            const dropped = v.files.filter(f => newest.get(f) !== v.n);
            for (const f of dropped) {
                const abs = path.join(into, String(v.n), ...f.split('/'));
                try { const size = (await fs.promises.stat(abs)).size; v.bytes -= size; runBytes -= size; } catch { /* gone */ }
                await fs.promises.rm(abs, { force: true }).catch(() => { });
            }
            v.files = v.files.filter(f => newest.get(f) === v.n);
        }
        for (let i = versions.length - 1; i >= 0; i--) {
            if (versions[i].files.length) continue;
            await fs.promises.rm(path.join(into, String(versions[i].n)), { recursive: true, force: true }).catch(() => { });
            versions.splice(i, 1);
        }
        if (otherBytes + runBytes > budget.projectBytes) {
            const runs = (await runsOf(projectDir)).filter(r => !isActive(r.dir)).reverse();
            for (const r of runs) {
                if (otherBytes + runBytes <= budget.projectBytes) break;
                await fs.promises.rm(r.dir, { recursive: true, force: true }).catch(() => { });
                otherBytes -= r.bytes;
            }
        }
    };

    /** One version: every family in `fams` whose content differs from its last copy. */
    const takeVersion = async (fams: Map<string, string[]>, why: string, isFlush: boolean) => {
        const todo: Array<{ fam: string; members: string[]; hash: string }> = [];
        for (const [fam, members] of fams) {
            const hash = familyHash(members.map(m => [m, content.get(m) ?? 'gone'] as [string, string]));
            if (lastCopy.get(fam) === hash) continue;
            if (members.every(m => (content.get(m) ?? 'gone') === 'gone')) { lastCopy.set(fam, hash); continue; }   // gone: nothing to copy
            todo.push({ fam, members, hash });
        }
        if (!todo.length) return;
        let estimate = 0;
        for (const t of todo) for (const m of t.members) { try { estimate += (await fs.promises.stat(m)).size; } catch { /* gone */ } }
        if (otherBytes + runBytes + estimate > budget.projectBytes) over = true;
        if (over && !isFlush) return;   // over the cap, only the versions taken before a put-back are kept
        const n = ++seq;
        const dest = path.join(into, String(n));
        const version = { n, files: [] as string[], at: Date.now(), bytes: 0, why };
        for (const t of todo) {
            const got = await copyFamily(t.members, dest).catch(() => ({ files: [] as string[], bytes: 0 }));
            if (!got.files.length) continue;
            version.files.push(...got.files);
            version.bytes += got.bytes;
            lastCopy.set(t.fam, t.hash);
        }
        if (!version.files.length) { await fs.promises.rm(dest, { recursive: true, force: true }).catch(() => { }); return; }
        versions.push(version);
        runBytes += version.bytes;
        if (over) await keepNewestOnly();
        await writeIndex();
    };

    /** One poll: stat, read what changed, copy every family that changed. */
    const poll = async (why: string, isFlush: boolean) => {
        const files = await currentFiles();
        const changed = new Map<string, string[]>();
        const at = Date.now();
        const groupOf = (fam: string) => files.filter(x => familyOf(x) === fam);
        for (const f of files) {
            let stamp = 'gone';
            try { stamp = stampOf(await fs.promises.stat(f)); } catch { /* gone */ }
            if (seen.get(f) === stamp) continue;
            seen.set(f, stamp);
            let hash = 'gone';
            if (stamp !== 'gone') { try { hash = await hashFile(f); } catch { continue; } }
            if (content.get(f) === hash) continue;   // touched, not changed
            content.set(f, hash);
            changes.push({ file: rel(f), at });
            changed.set(familyOf(f), groupOf(familyOf(f)));
        }
        //  A flush copies every family that differs from its last copy, whether or not this poll saw it change.
        if (isFlush) for (const f of files) if (!changed.has(familyOf(f))) changed.set(familyOf(f), groupOf(familyOf(f)));
        if (changed.size) await takeVersion(changed, why, isFlush);
        return files.length;
    };

    const start = (async () => {
        await mkdirPrivate(into);
        if (home && process.platform !== 'win32') {
            for (const d of [home, path.dirname(projectDir), projectDir]) await fs.promises.chmod(d, 0o700).catch(() => { });
        }
        await writeIndex();
        //  Pruning only ever runs inside a real recovery home: a folder given by a test or by mistake is never swept.
        if (home) await pruneRecovery({ budget, projectDir, home }).catch(() => undefined);
        otherBytes = (await runsOf(projectDir)).filter(r => path.resolve(r.dir) !== into).reduce((sum, r) => sum + r.bytes, 0);
        //  Files present now that the snapshot did not keep, when it did not see every data file: the baseline.
        if (!s.complete) {
            for (const f of await currentFiles()) {
                if (s.files.has(f)) continue;
                try { const st = await fs.promises.stat(f); seen.set(f, stampOf(st)); content.set(f, await hashFile(f)); } catch { /* gone */ }
            }
        }
    })().catch(() => undefined);

    const schedule = (files: number) => {
        if (stopped) return;
        timer = setTimeout(() => { void serial(async () => { const n = await poll('poll', false).catch(() => files); schedule(n); }); }, recoveryIntervalMs(files, ordinal));
        timer.unref?.();
    };
    void start.then(() => schedule(s.files.size));

    let stopping: Promise<void> | null = null;
    return {
        changes: () => changes.map(c => ({ ...c })),
        versions: () => versions.map(v => ({ n: v.n, files: [...v.files], at: v.at, bytes: v.bytes })),
        overBudget: () => over,
        async flush(why: string) {
            await start;
            await serial(async () => { await poll(String(why || 'flush'), true).catch(() => 0); });
        },
        stop() {
            if (stopping) return stopping;
            stopped = true;
            if (timer) clearTimeout(timer);
            stopping = (async () => {
                await start;
                await chain;
                activeWatchers = Math.max(0, activeWatchers - 1);
                activeRuns.delete(into);
                if (!versions.length) await fs.promises.rm(into, { recursive: true, force: true }).catch(() => { });
                else await writeIndex();
            })();
            return stopping;
        },
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE 2T VERIFICATION PER PROJECT AT A TIME (§5b step 5)
// ─────────────────────────────────────────────────────────────────────────────

/** A lock older than this is stale whoever holds it: longer than the longest verification. */
export const VERIFY_LOCK_STALE_MS = 20 * 60 * 1000;
/** A second 2T verification waits at most this long (or the run's remaining deadline, if shorter), then runs as path 3. */
export const VERIFY_LOCK_WAIT_MS = 60_000;
/** When this process started, to tell its own locks from a dead process's whose pid was reused. */
const PROCESS_START = Math.round(Date.now() - process.uptime() * 1000);

/** What `verify.lock` holds. */
export interface VerifyLockInfo { pid: number; processStart: number; runId: string; at: number }

/** A held lock; `release()` in a `finally`. */
export interface VerifyLock { file: string; info: VerifyLockInfo; release(): Promise<void> }

/** `<home>/<workspaceId>/<projectKey>/verify.lock`. */
export function verifyLockFile(workspaceId: string, projectRoot: string, env: NodeJS.ProcessEnv = process.env): string {
    return path.join(recoveryProjectDir(workspaceId, projectRoot, env), 'verify.lock');
}

function pidAlive(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch (e: any) { return e?.code === 'EPERM'; }
}

/** Stale: no pid, its pid is dead, it is this pid but another process start, or it is older than 20 minutes. */
export function isVerifyLockStale(info: Partial<VerifyLockInfo> | null | undefined, now = Date.now()): boolean {
    if (!info || !Number.isInteger(info.pid) || (info.pid as number) <= 0) return true;
    if (!Number.isFinite(info.at) || now - (info.at as number) > VERIFY_LOCK_STALE_MS) return true;
    if (info.pid === process.pid) return Math.abs(Number(info.processStart) - PROCESS_START) > 1000;
    return !pidAlive(info.pid as number);
}

/** A lock file that cannot be read as a lock is being written, unless it is older than a few seconds. */
async function lockIsStale(file: string, info: VerifyLockInfo | null): Promise<boolean> {
    if (info) return isVerifyLockStale(info);
    try { return Date.now() - (await fs.promises.stat(file)).mtimeMs > 5000; } catch { return true; }
}

async function readLock(file: string): Promise<{ text: string; info: VerifyLockInfo | null } | null> {
    let text: string;
    try { text = await fs.promises.readFile(file, 'utf8'); } catch { return null; }
    try { return { text, info: JSON.parse(text) }; } catch { return { text, info: null }; }
}

/**
 * Takes the project's verify lock for a 2T verification, waiting at most `waitMs` (pass
 * `min(VERIFY_LOCK_WAIT_MS, the run's remaining deadline)`). A stale lock is taken over. `null`: another live
 * verification held it the whole wait — run this one as path 3 and tell `lockBusy`.
 */
export async function acquireVerifyLock(workspaceId: string, projectRoot: string, runId: string, opts: { waitMs: number; env?: NodeJS.ProcessEnv; pollMs?: number }): Promise<VerifyLock | null> {
    const file = verifyLockFile(workspaceId, projectRoot, opts.env);
    await mkdirPrivate(path.dirname(file));
    const deadline = Date.now() + Math.max(0, opts.waitMs);
    for (;;) {
        const info: VerifyLockInfo = { pid: process.pid, processStart: PROCESS_START, runId: String(runId), at: Date.now() };
        const text = JSON.stringify(info);
        try {
            const fh = await fs.promises.open(file, 'wx', 0o600);
            try { await fh.writeFile(text, 'utf8'); } finally { await fh.close(); }
            let released = false;
            return {
                file, info,
                async release() {
                    if (released) return;
                    released = true;
                    const now = await readLock(file);
                    if (now && now.text === text) await fs.promises.rm(file, { force: true }).catch(() => { });
                },
            };
        } catch (e: any) {
            if (e?.code !== 'EEXIST') throw e;
        }
        const held = await readLock(file);
        if (!held) continue;   // released between the two calls
        const left = deadline - Date.now();
        if (await lockIsStale(file, held.info)) {
            //  Taken over only if it is still the same stale lock (another waiter may have replaced it).
            const again = await readLock(file);
            let removed = false;
            if (again && again.text === held.text) removed = await fs.promises.rm(file, { force: true }).then(() => true, () => false);
            if (removed || !again || again.text !== held.text) continue;
            if (left <= 0) return null;   // a stale lock that cannot be removed: wait like a held one
        }
        if (left <= 0) return null;
        await new Promise(r => setTimeout(r, Math.min(left, opts.pollMs ?? 250)));
    }
}

/** At boot: removes every stale verify lock under the recovery home. Returns how many. */
export async function sweepStaleVerifyLocks(env: NodeJS.ProcessEnv = process.env): Promise<number> {
    let n = 0;
    for (const projectDir of await projectDirsOf(recoveryHome(env))) {
        const file = path.join(projectDir, 'verify.lock');
        const held = await readLock(file);
        if (held && await lockIsStale(file, held.info)) { await fs.promises.rm(file, { force: true }).catch(() => { }); n++; }
    }
    return n;
}
