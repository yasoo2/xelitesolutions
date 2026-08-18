import path from 'path';
import fs from 'fs';
import { workspaceService } from '../services/WorkspaceService';

export interface ResolvePathOptions {
    sandbox?: boolean; // If true, forces path into buildsDir/workspace-default if no active workspace
    workspaceId?: string;
    /** A runtime-bound project/artifact root, when the caller has verified it. */
    projectRoot?: string;
}

/**
 * Is `child` the same directory as `parent`, or inside it?
 *
 * Exported so the rule can be tested directly on both platforms. Two things it
 * must get right, and each was wrong at some point:
 *
 *   - The comparison happens on a path BOUNDARY. Plain `startsWith` admits a
 *     sibling that merely shares a prefix — a parent of "/srv/joe" accepting
 *     "/srv/joe-backup/anything".
 *   - On Windows it ignores case, because the filesystem does. `path.resolve`
 *     preserves whatever case it was handed, so "C:\Users\home\..." and
 *     "c:\users\home\..." are one directory that a case-sensitive compare calls
 *     an escape — a false refusal of a legitimate write, and on Windows that is
 *     the common case rather than the edge one. Linux keeps the exact compare:
 *     there, two paths differing in case really are two different files.
 */
export function isWithinRoot(child: string, parent: string): boolean {
    const fold = (s: string) => (process.platform === 'win32' ? s.toLowerCase() : s);
    const c = fold(child);
    const p = fold(parent);
    return c === p || c.startsWith(p.endsWith(path.sep) ? p : p + path.sep);
}

/**
 * Standard tool path resolver that anchors all relative paths to the project root
 * or a sandboxed build directory. Handles /api/ subdirectory execution gracefully.
 */
export function resolveToolPath(p: string, options: ResolvePathOptions = {}) {
    const val = String(p ?? '').trim();
    // An absolute path used to be returned UNCHECKED, which meant the containment
    // test at the bottom of this function — the one every tool relies on — was
    // skipped entirely whenever a path happened to start with a slash. A relative
    // "../../../../etc/passwd" was refused while an absolute "/etc/passwd" was
    // handed straight back and written to. Proven, not theorised: ai_write_file
    // created /etc/joe-owned.txt during testing.
    //
    // Absolute paths now go through exactly the same containment rule as
    // relative ones — inside the workspace, the project, the builds directory or
    // the external root is allowed; anything else throws.

    // Use active workspace root if available
    const activeRoot = workspaceService.getActiveRoot(options.workspaceId);

    // [Wakil 6.8] Standardized Robust Project Root Detection
    let projectRoot = process.cwd();
    const parts = projectRoot.split(path.sep);
    const apiIndex = parts.indexOf('api');
    if (apiIndex !== -1) {
        projectRoot = parts.slice(0, apiIndex).join(path.sep) || path.sep;
    }

    // Ensure projectRoot is absolute and has leading slash if on Unix
    if (!projectRoot.startsWith(path.sep) && process.platform !== 'win32') {
        projectRoot = path.sep + projectRoot;
    }

    const buildsDir = path.resolve(projectRoot, 'data/builds');

    // Determine the anchor root. A runtime-bound artifact is a stronger,
    // evidence-backed anchor than the workspace root, but only accept it when
    // it is already inside the active workspace (or the configured external
    // workspace root). Callers still pass logical relative paths; this option
    // prevents a generated file from silently landing beside the artifact.
    let root = activeRoot;
    const requestedProjectRoot = String(options.projectRoot || '').trim();
    if (requestedProjectRoot && path.isAbsolute(requestedProjectRoot)) {
        const candidateProjectRoot = path.resolve(requestedProjectRoot);
        const allowedProjectRoot = isWithinRoot(candidateProjectRoot, path.resolve(activeRoot))
            || isWithinRoot(candidateProjectRoot, path.resolve(workspaceService.externalRoot));
        if (allowedProjectRoot) root = candidateProjectRoot;
    }

    // [Wakil 6.8] Hardened Sandboxing
    if (options.sandbox) {
        const buildsDirAbs = path.resolve(projectRoot, 'data/builds');
        const workspaceDefault = path.join(buildsDirAbs, 'workspace-default');

        // If we are currently pointing to project root, or no root, or outside builds, FORCE to builds
        const isProjectRoot = path.resolve(root) === path.resolve(projectRoot);
        const isOutsideBuilds = !path.resolve(root).startsWith(buildsDirAbs);

        if (isProjectRoot || isOutsideBuilds || !root) {
            root = workspaceDefault;
            console.log(`[resolveToolPath] Sandboxing forced: ${root}`);
        }
    }

    // Ensure the root directory exists
    try { fs.mkdirSync(root, { recursive: true }); } catch { }

    const abs = path.resolve(root, val);
    const resolvedRoot = path.resolve(root);
    const resolvedAbs = path.resolve(abs);

    const resolvedBuildsDir = path.resolve(buildsDir);
    const resolvedProjectRoot = path.resolve(projectRoot);
    const resolvedExternalRoot = path.resolve(workspaceService.externalRoot);

    // startsWith on its own lets a SIBLING through: a root of "/srv/joe" would
    // accept "/srv/joe-backup/anything" because the string matches. Compare on a
    // path boundary instead.
    //
    // On Windows the comparison must also ignore case, because the filesystem
    // does. path.resolve preserves whatever case it was handed — so a workspace
    // at "C:\Users\home\..." and a model-written "c:\users\home\..." are the
    // SAME directory that a case-sensitive compare calls an escape. That is a
    // false refusal of a legitimate write, and on a Windows machine it is the
    // common case, not the edge one. Linux keeps the exact comparison: there,
    // two paths differing in case really are two different files.
    if (isWithinRoot(resolvedAbs, resolvedRoot) ||
        isWithinRoot(resolvedAbs, resolvedBuildsDir) ||
        isWithinRoot(resolvedAbs, resolvedProjectRoot) ||
        isWithinRoot(resolvedAbs, resolvedExternalRoot)) {
        return resolvedAbs;
    }

    throw new Error('path_outside_workspace: ' + resolvedAbs + ' (Root: ' + resolvedRoot + ')');
}
