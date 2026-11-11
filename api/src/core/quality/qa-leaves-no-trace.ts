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

function isData(rel: string): boolean {
    const parts = rel.split(/[\\/]/u);
    const name = parts[parts.length - 1];
    if (DATABASE_FILE.test(name)) return true;
    if (parts.slice(0, -1).some(p => DATA_DIR.test(p))) return !CODE_FILE.test(name);
    return RECORDS_FILE.test(name);
}

/** The data files under `root` now, relative to it. Links are never followed. */
async function dataFiles(root: string): Promise<string[]> {
    const found: string[] = [];
    const walk = async (dir: string, depth: number): Promise<void> => {
        if (depth > MAX_DEPTH || found.length >= MAX_FILES) return;
        let entries: fs.Dirent[];
        try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (found.length >= MAX_FILES) return;
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
    return found;
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
    const found = await dataFiles(root);
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
    return { root, dir, files, tooLarge };
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
    const now = new Set((await dataFiles(s.root)).map(f => path.resolve(f)));
    for (const file of now) {
        if (kept.has(file.toLowerCase()) || untouched.has(familyOf(file))) continue;
        const before = s.files.get(file);
        if (!before) { changed.push(file); continue; }
        try { if (!(await unchanged(file, before))) changed.push(file); } catch { changed.push(file); }
    }
    for (const file of s.files.keys()) if (!now.has(file) && !kept.has(file.toLowerCase())) changed.push(file);
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
    for (const file of await appDataChanges(s, keep)) {
        const rel = path.relative(s.root, file);
        const before = s.files.get(file);
        try {
            if (before) {
                await retry(async () => {
                    await fs.promises.mkdir(path.dirname(file), { recursive: true });
                    await fs.promises.copyFile(before.copy, file);
                    //  Its own times back too: what fingerprints the code reads them, and a walk's carried parts with it.
                    await fs.promises.utimes(file, before.atime, before.mtime).catch(() => { });
                });
                result.restored.push(rel);
            } else {
                await retry(() => fs.promises.rm(file, { force: true }));
                result.removed.push(rel);
            }
        } catch (e: any) {
            result.failed.push(`${rel} (${String(e?.code || e?.message || e).slice(0, 80)})`);
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
    let host = '127.0.0.1';
    let port = 0;
    try {
        const u = new URL(url);
        host = u.hostname === 'localhost' ? '127.0.0.1' : u.hostname.replace(/^\[|\]$/gu, '');
        port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
    } catch { return true; }
    const until = Date.now() + waitMs;
    for (;;) {
        //  Refused: nothing listens. Accepted, or no answer at all in a second: something still holds it.
        const held = await new Promise<boolean>(resolve => {
            const socket = net.connect({ host, port });
            const done = (value: boolean) => { socket.destroy(); resolve(value); };
            socket.setTimeout(1000, () => done(true));
            socket.once('connect', () => done(true));
            socket.once('error', () => done(false));
        });
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
