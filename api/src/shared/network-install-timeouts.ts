import fs from 'fs';
import path from 'path';

/**
 * One budget for every `npm install` that downloads packages for a project Joe
 * builds, whichever tool runs it.
 *
 * Measured: a fresh Windows install remained healthy but silent for 124 s, so
 * the idle bound allows one cold registry/package extraction while staying
 * finite. Eval run500 P001, 2026-10-23: the API tool still capped the whole
 * install at 30 s and reported «The API dependencies were not installed» for a
 * healthy cold install on a CPU busy with the local model.
 */
export const NETWORK_INSTALL_TIMEOUTS = Object.freeze({
    absoluteMs: 15 * 60_000,
    idleMs: 5 * 60_000,
});

/**
 * An install's progress is the files it writes, not the lines it prints.
 *
 * npm on a pipe is silent until it finishes, so the idle bound above measured
 * nothing but npm's manners. Eval run500 P001, 2026-10-26: a cold install
 * wrote 2,226 files into node_modules and its --cache in five minutes and was
 * killed as «no progress» mid-write; the build then failed «'vite' is not
 * recognized». The probe covers the project's node_modules and the --cache
 * npm was given; a change between two idle intervals is progress.
 *
 * ⛔ WITHOUT A SUBSET (review r21, d04229f1). The first probe lstat-ed every
 * file and stopped after 200 000 of them, always the same ones in the same
 * order: an install writing past them was killed as idle. Now:
 *
 *   - every directory under the roots is read, uncapped: its mtime and entry
 *     count change whenever anything is created, removed or renamed in it,
 *     so one stat per directory sees every new file without stat-ing files;
 *   - the files are stat-ed only inside the directories that changed — the
 *     ones being written — so a tarball that keeps growing in place, with no
 *     new entry anywhere, is still progress while it grows;
 *   - the mark is a counter of changes seen, so two reads with nothing new
 *     return the same mark and a stalled install still stops.
 *
 * The state lives in this probe, one per install command; nothing is shared
 * between installs or users. All reads are asynchronous.
 */
async function readDirectory(dir: string): Promise<{ signature: string; directories: string[] }> {
    try {
        const [entries, stat] = await Promise.all([fs.promises.readdir(dir, { withFileTypes: true }), fs.promises.stat(dir)]);
        // Dirents are lstat-based: a linked package is counted, never followed.
        const directories = entries.filter(entry => entry.isDirectory()).map(entry => path.join(dir, entry.name));
        return { signature: `${stat.mtimeMs}:${entries.length}`, directories };
    } catch {
        return { signature: 'absent', directories: [] };
    }
}

/** Size and mtime of every file directly in `dir`, as one string. */
async function filesSignature(dir: string): Promise<string> {
    let files: string[] = [];
    try {
        files = (await fs.promises.readdir(dir, { withFileTypes: true }))
            .filter(entry => !entry.isDirectory()).map(entry => path.join(dir, entry.name)).sort();
    } catch { return 'absent'; }
    const marks: string[] = [];
    for (let i = 0; i < files.length; i += 256) {
        marks.push(...await Promise.all(files.slice(i, i + 256).map(async file => {
            try { const stat = await fs.promises.lstat(file); return `${stat.size}:${stat.mtimeMs}`; } catch { return 'gone'; }
        })));
    }
    return marks.join('|');
}

export function installProgressProbe(cwd: string, args: readonly string[]): () => Promise<string> {
    const roots = [path.join(cwd, 'node_modules')];
    args.forEach((arg, i) => {
        const cache = arg === '--cache' ? args[i + 1] : arg.startsWith('--cache=') ? arg.slice('--cache='.length) : '';
        if (cache) roots.push(path.resolve(cwd, cache));
    });
    // Directories touched since the install began count as being written at the first read.
    const startedAt = Date.now() - 2000;
    let known: Map<string, string> | null = null;   // directory → signature at the previous read
    let writing = new Map<string, string>();       // directory being written → its files' signature
    let changes = 0;
    const read = async (): Promise<string> => {
        const seen = new Map<string, string>();
        const pending = [...new Set(roots)];
        while (pending.length) {
            const batch = pending.splice(0, 64);
            const results = await Promise.all(batch.map(dir => readDirectory(dir)));
            batch.forEach((dir, i) => {
                if (seen.has(dir)) return;
                seen.set(dir, results[i].signature);
                pending.push(...results[i].directories);
            });
        }
        const changedNow = new Set<string>();
        if (!known) {
            for (const [dir, signature] of seen) {
                const mtime = Number(signature.split(':')[0]);
                if (Number.isFinite(mtime) && mtime >= startedAt) changedNow.add(dir);
            }
        } else {
            for (const [dir, signature] of seen) if (known.get(dir) !== signature) changedNow.add(dir);
            for (const dir of known.keys()) if (!seen.has(dir)) changedNow.add(dir);
        }
        let progressed = !!known && changedNow.size > 0;
        const nextWriting = new Map<string, string>();
        for (const dir of new Set([...changedNow, ...writing.keys()])) {
            if (!seen.has(dir)) continue; // removed: its parent's signature already changed
            const signature = await filesSignature(dir);
            const before = writing.get(dir);
            if (known && before !== undefined && before !== signature) progressed = true;
            // A directory stays followed while something in it keeps changing.
            if (changedNow.has(dir) || before !== signature) nextWriting.set(dir, signature);
        }
        writing = nextWriting;
        known = seen;
        if (progressed) changes++;
        return String(changes);
    };
    // One read at a time: two overlapping reads would compare against each other's state.
    let queue: Promise<string> = Promise.resolve('');
    return () => (queue = queue.then(read, read));
}
