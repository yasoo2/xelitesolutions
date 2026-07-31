import path from 'path';
import fs from 'fs';
import { workspaceService } from '../services/WorkspaceService';

export interface ResolvePathOptions {
    sandbox?: boolean; // If true, forces path into buildsDir/workspace-default if no active workspace
    workspaceId?: string;
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

    // Determine the anchor root
    let root = activeRoot;

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
    const within = (child: string, parent: string) =>
        child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

    if (within(resolvedAbs, resolvedRoot) ||
        within(resolvedAbs, resolvedBuildsDir) ||
        within(resolvedAbs, resolvedProjectRoot) ||
        within(resolvedAbs, resolvedExternalRoot)) {
        return resolvedAbs;
    }

    throw new Error('path_outside_workspace: ' + resolvedAbs + ' (Root: ' + resolvedRoot + ')');
}
