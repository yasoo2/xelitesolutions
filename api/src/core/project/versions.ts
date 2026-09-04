/**
 * A PROJECT CAN BE PUT BACK.
 *
 * Pages have had version history for a long time: «تراجع» restores the previous
 * one instantly. React projects — the newer and far more capable front — never
 * had it. Joe edits them surgically, repairs their source before delivery, and
 * mends what its own audit finds; every one of those writes was a door with no
 * handle on the inside. The last sweep named this gap out loud rather than
 * quietly not testing it, and this is the answer to it.
 *
 * The design is deliberately small, because a restore that is complicated is a
 * restore nobody trusts at 2am:
 *
 *   • only SOURCE is kept — node_modules and dist are derived, and copying them
 *     would turn a snapshot into a minute of disk churn
 *   • a snapshot is a plain directory of plain files, readable with `ls`; no
 *     archive format stands between him and his own code
 *   • restoring is byte-for-byte, and it takes its OWN snapshot first, so
 *     «تراجع» is itself undoable
 *   • the newest ten are kept; older ones are pruned so a long session cannot
 *     fill his disk
 */
import fs from 'fs';
import path from 'path';

export const VERSIONS_DIR = '.joe-versions';
const MAX_VERSIONS = 10;
const SKIP = new Set(['node_modules', 'dist', '.git', VERSIONS_DIR, '.cache', 'coverage']);
/** A source tree that big is not a source tree; refuse rather than crawl it. */
const MAX_FILES = 800;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

export interface ProjectVersion {
    id: string;
    at: number;
    label: string;
    files: number;
    /**
     * A monotonic counter, and the reason ordering is trustworthy.
     *
     * Sorting by timestamp alone looked obviously right and was not: two
     * snapshots taken in the same millisecond — an edit and the self-repair
     * that follows it — sort arbitrarily. The gate caught both consequences at
     * once: «تراجع» could restore the wrong one, and pruning could delete the
     * NEWEST instead of the oldest. A clock is not an order.
     */
    seq: number;
}

function versionsRoot(dir: string): string { return path.join(dir, VERSIONS_DIR); }

/** Every source file worth keeping, relative to the project. */
export function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    const walk = (abs: string, rel: string, depth: number) => {
        if (depth > 8 || out.length >= MAX_FILES) return;
        let entries: fs.Dirent[] = [];
        try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
            if (out.length >= MAX_FILES) return;
            if (SKIP.has(e.name)) continue;
            const childAbs = path.join(abs, e.name);
            const childRel = rel ? `${rel}/${e.name}` : e.name;
            if (e.isDirectory()) { walk(childAbs, childRel, depth + 1); continue; }
            if (!e.isFile()) continue;
            try { if (fs.statSync(childAbs).size > MAX_FILE_BYTES) continue; } catch { continue; }
            out.push(childRel);
        }
    };
    walk(dir, '', 0);
    return out;
}

export function listVersions(dir: string): ProjectVersion[] {
    const root = versionsRoot(dir);
    let ids: string[] = [];
    try { ids = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name); } catch { return []; }
    const out: ProjectVersion[] = [];
    for (const id of ids) {
        try {
            const meta = JSON.parse(fs.readFileSync(path.join(root, id, 'meta.json'), 'utf-8'));
            out.push({
                id, at: Number(meta.at) || 0, label: String(meta.label || ''),
                files: Number(meta.files) || 0, seq: Number(meta.seq) || 0,
            });
        } catch { /* a snapshot without readable meta is not offered */ }
    }
    return out.sort((a, b) => (b.seq - a.seq) || (b.at - a.at) || b.id.localeCompare(a.id));
}

function prune(dir: string): void {
    const all = listVersions(dir);
    for (const v of all.slice(MAX_VERSIONS)) {
        try { fs.rmSync(path.join(versionsRoot(dir), v.id), { recursive: true, force: true }); } catch { /* best effort */ }
    }
}

/**
 * Copy the source aside under a new id. Returns null when there is nothing to
 * copy — never throws, because a snapshot that breaks the operation it was
 * protecting is worse than no snapshot.
 */
export function snapshotProject(dir: string, label = ''): ProjectVersion | null {
    try {
        if (!fs.existsSync(path.join(dir, 'package.json'))) return null;
        const existing = listVersions(dir);
        const files = sourceFiles(dir);
        if (!files.length) return null;
        const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${Math.random().toString(36).slice(2, 6)}`;
        const dest = path.join(versionsRoot(dir), id);
        for (const rel of files) {
            const to = path.join(dest, 'files', rel);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(path.join(dir, rel), to);
        }
        const seq = existing.reduce((m, v) => Math.max(m, v.seq), 0) + 1;
        const meta: ProjectVersion = { id, at: Date.now(), label: String(label).slice(0, 80), files: files.length, seq };
        fs.writeFileSync(path.join(dest, 'meta.json'), JSON.stringify(meta), 'utf-8');
        prune(dir);
        return meta;
    } catch {
        return null;
    }
}

export interface RestoreResult {
    ok: boolean;
    version?: ProjectVersion;
    /** The snapshot taken of the CURRENT state before restoring over it. */
    undoOf?: ProjectVersion | null;
    restored: string[];
    removed: string[];
    error?: string;
}

/**
 * Put the project back to a snapshot. Files that exist only in the CURRENT
 * tree are removed — a restore that leaves a file Joe added behind is not a
 * restore, it is a merge nobody asked for.
 */
export function restoreVersion(dir: string, id?: string): RestoreResult {
    const all = listVersions(dir);
    if (!all.length) return { ok: false, restored: [], removed: [], error: 'no_versions' };
    const target = id ? all.find(v => v.id === id) : all[0];
    if (!target) return { ok: false, restored: [], removed: [], error: 'unknown_version' };

    // «تراجع» must itself be undoable.
    const undoOf = snapshotProject(dir, `قبل الاسترجاع إلى ${target.id}`);

    const from = path.join(versionsRoot(dir), target.id, 'files');
    const wanted = sourceFiles(from);
    const current = new Set(sourceFiles(dir));
    const restored: string[] = [];
    const removed: string[] = [];
    try {
        for (const rel of wanted) {
            const to = path.join(dir, rel);
            fs.mkdirSync(path.dirname(to), { recursive: true });
            fs.copyFileSync(path.join(from, rel), to);
            restored.push(rel);
            current.delete(rel);
        }
        for (const rel of current) {
            try { fs.rmSync(path.join(dir, rel), { force: true }); removed.push(rel); } catch { /* best effort */ }
        }

        // A successful copy loop is not enough evidence for a rollback. A
        // failed repair must leave the source exactly as it was, including
        // build configuration that the UI repairer never intended to touch.
        // Verify both the restored bytes and that no post-snapshot source file
        // survived before the caller is allowed to call the rollback safe.
        const leftovers = sourceFiles(dir).filter(rel => !wanted.includes(rel));
        const mismatch = wanted.find(rel => {
            const expected = path.join(from, rel);
            const actual = path.join(dir, rel);
            try { return !fs.existsSync(actual) || !fs.readFileSync(expected).equals(fs.readFileSync(actual)); }
            catch { return true; }
        });
        if (mismatch || leftovers.length) {
            return {
                ok: false, version: target, undoOf, restored, removed,
                error: mismatch ? `verification_failed:${mismatch}` : `verification_failed:leftover:${leftovers[0]}`,
            };
        }
    } catch (e: any) {
        return { ok: false, version: target, undoOf, restored, removed, error: String(e?.message || e).slice(0, 160) };
    }
    return { ok: true, version: target, undoOf, restored, removed };
}
