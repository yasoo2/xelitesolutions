/**
 * WHERE THE ENGINE MAY TOUCH THE DISK.
 *
 * The model names paths; it never names the root. Every engine file and
 * shell tool resolves the model's path against the run's project folder, which
 * Joe allocated and which the tool reads from its ToolService context. The
 * resolved path must stay inside that folder for what it MEANS, not for how
 * it is spelled:
 *
 *  - `..` that climbs out is refused after resolving, never before. A path
 *    may wander inside the folder (`src/../index.html` is fine).
 *  - A symlink or junction anywhere on the way is refused. A link is how a
 *    path that is spelled inside points outside, and on Windows a junction is
 *    how one folder silently becomes another.
 *  - Secret-bearing names are refused for reading and writing: `.env` files
 *    (not their `.example`), private keys, credential stores. A project Joe
 *    is asked to change may hold the owner's real secrets. A model must never
 *    read them, and on a server they would leave the machine with the prompt.
 *  - Writes never enter `.git`, `node_modules` (npm owns it) or `.joe` (the
 *    engine's own record of the run).
 *
 * Everything here is asynchronous: these checks run on request paths, and on
 * a server with thousands of users a synchronous filesystem call blocks every
 * one of them.
 */
import { promises as fsp } from 'fs';
import path from 'path';
import { isWithinRoot } from '../../modules/tools/path-containment';

export type PathMode = 'read' | 'write' | 'list';

export type PathCheck =
    | { ok: true; abs: string; rel: string; exists: boolean; isDir: boolean; size: number }
    | { ok: false; error: string };

const RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const SECRET_NAME = /^(?:\.env(?:\.(?!example$|sample$|template$)[^/\\]+)?|id_(?:rsa|ed25519|ecdsa|dsa)|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials\.json|secrets?\.json)$/i;
const SECRET_EXT = /\.(?:pem|key|pfx|p12|kdbx|keystore|jks)$/i;
const NO_WRITE_DIR = /^(?:\.git|node_modules|\.joe)$/i;

/** A name that holds secrets: never read or written by the engine. */
export function isSecretName(name: string): boolean {
    return SECRET_NAME.test(name) || SECRET_EXT.test(name);
}

function posix(rel: string): string {
    return rel.split(path.sep).join('/');
}

/** Resolve a model-given path inside the project folder, or say why not. */
export async function resolveInProject(root: string, raw: unknown, mode: PathMode): Promise<PathCheck> {
    if (typeof root !== 'string' || !path.isAbsolute(root)) return { ok: false, error: 'The project folder is not set for this run.' };
    let realRoot: string;
    try { realRoot = await fsp.realpath(root); } catch { return { ok: false, error: 'The project folder does not exist.' }; }

    const given = typeof raw === 'string' ? raw.trim() : '';
    const spelled = given === '' ? '.' : given;
    if (/[\u0000-\u001f\u007f]/u.test(spelled)) return { ok: false, error: 'The path contains control characters.' };
    if (/^[\\/]{2}/u.test(spelled)) return { ok: false, error: 'Network paths are not allowed; use a path inside the project folder.' };

    const target = path.isAbsolute(spelled) ? path.resolve(spelled) : path.resolve(realRoot, spelled);
    if (!isWithinRoot(target, realRoot)) {
        return { ok: false, error: `"${given}" is outside the project folder. Use a path relative to the project folder.` };
    }
    const rel = path.relative(realRoot, target);
    const segments = rel ? rel.split(path.sep) : [];
    for (const s of segments) {
        if (process.platform === 'win32' && (s.includes(':') || /[. ]$/u.test(s) || RESERVED.test(s))) {
            return { ok: false, error: `"${s}" is not a valid file name on Windows.` };
        }
        if (mode !== 'list' && isSecretName(s)) {
            return { ok: false, error: `"${posix(rel)}" holds secrets; the engine never reads or writes it. Use a .env.example with placeholder values instead.` };
        }
        if (mode === 'write' && NO_WRITE_DIR.test(s)) {
            return { ok: false, error: `Writing inside "${s}" is not allowed${s.toLowerCase() === 'node_modules' ? ' (npm installs packages there; add them to package.json instead)' : ''}.` };
        }
    }

    //  Walk from the root to the target: every existing step must be a real
    //  directory (the last may be a file), and none may be a link.
    let cursor = realRoot;
    let exists = true;
    let isDir = true;
    let size = 0;
    for (let i = 0; i < segments.length; i++) {
        cursor = path.join(cursor, segments[i]);
        let stat;
        try { stat = await fsp.lstat(cursor); }
        catch (e: any) {
            if (e?.code === 'ENOENT' || e?.code === 'ENOTDIR') { exists = false; isDir = false; break; }
            return { ok: false, error: `Cannot read "${posix(path.relative(realRoot, cursor))}": ${e?.code || 'access failed'}.` };
        }
        if (stat.isSymbolicLink()) return { ok: false, error: `"${posix(path.relative(realRoot, cursor))}" is a link; the engine does not follow links.` };
        const last = i === segments.length - 1;
        if (!last && !stat.isDirectory()) return { ok: false, error: `"${posix(path.relative(realRoot, cursor))}" is a file, not a folder.` };
        if (last) { isDir = stat.isDirectory(); size = stat.size; }
    }
    return { ok: true, abs: target, rel: posix(rel) || '.', exists, isDir, size };
}

/**
 * The run's project folder must sit inside the workspace root Joe resolved
 * for this request (AGENTS.md: workspaceService.getActiveRoot). Returns the
 * reason when it does not.
 */
export function projectRootProblem(projectRoot: unknown, activeRoot: string): string | null {
    if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) return 'No project folder is bound to this run.';
    if (!isWithinRoot(projectRoot, activeRoot) || path.resolve(projectRoot) === path.resolve(activeRoot)) {
        return 'The project folder is not inside this workspace.';
    }
    return null;
}
