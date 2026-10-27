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
 * recognized». The fingerprint covers the project's node_modules and the
 * --cache npm was given; a change between two idle intervals is progress.
 */
const INSTALL_PROGRESS_WALK_LIMIT = 200_000;

export function installProgressProbe(cwd: string, args: readonly string[]): () => Promise<string> {
    const roots = [path.join(cwd, 'node_modules')];
    args.forEach((arg, i) => {
        const cache = arg === '--cache' ? args[i + 1] : arg.startsWith('--cache=') ? arg.slice('--cache='.length) : '';
        if (cache) roots.push(path.resolve(cwd, cache));
    });
    return async () => {
        let files = 0;
        let bytes = 0;
        let newest = 0;
        const pending = [...roots];
        while (pending.length && files < INSTALL_PROGRESS_WALK_LIMIT) {
            const dir = pending.pop() as string;
            let entries: fs.Dirent[];
            try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { continue; }
            for (const entry of entries) {
                const at = path.join(dir, entry.name);
                // Dirents are lstat-based: a linked package is counted, never followed.
                if (entry.isDirectory()) { pending.push(at); continue; }
                files++;
                try {
                    const stat = await fs.promises.lstat(at);
                    bytes += stat.size;
                    newest = Math.max(newest, stat.mtimeMs);
                } catch { /* removed while npm moved it: the count still changed */ }
            }
        }
        return `${files}:${bytes}:${newest}`;
    };
}
