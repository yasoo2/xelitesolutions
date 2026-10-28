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
 */

export const MACHINE_STATE_DIRECTORIES: ReadonlySet<string> = new Set([
    '.git', 'node_modules', '.npm-cache', '.pnpm-store', '.yarn', '.cache', '.turbo', '.next', 'coverage',
    '.engineering-checkpoints', '.joe', '.joe-versions', '.checkpoints', '__pycache__', '.pytest_cache', '.venv', 'venv',
]);

/** True when a directory of this name holds machine-made state, never a project's own files. */
export function isMachineStateDirectory(name: string): boolean {
    return MACHINE_STATE_DIRECTORIES.has(name);
}
