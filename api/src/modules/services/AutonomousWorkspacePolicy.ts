import fs from 'fs';
import path from 'path';
import { isReadOnlyWorkspaceOverviewRequest } from '../../core/orchestrator/workspace-overview';
import { redactSecretsFromString } from '../../shared/utils/redaction';
import { snapshotRuntimeDiagnosticInput } from './RuntimeDiagnosticsPolicy';

export const AUTONOMOUS_DIRECTORY_ENTRIES = 256;
export function autonomousWorkspaceTool(name: unknown): boolean {
    return name === 'project_pipeline' || name === 'inspect_directory' || name === 'runtime_diagnostics';
}
function deny(reason: string): never { throw new Error(reason); }
function safeSegment(s: string): boolean {
    return s !== '..' && !/[.: ]$/u.test(s) && !s.includes(':') && redactSecretsFromString(s) === s
        && !/\b(?:nvapi-|gsk_|AIza)[A-Za-z0-9_-]{12,}/u.test(s)
        && !/^(?:\.env(?:\..*)?|\.git|\.ssh|\.joe[^/]*|node_modules|credentials?(?:\..*)?|secrets?(?:\..*)?|auth(?:\..*)?|id_(?:rsa|ed25519)|(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?)$/iu.test(s)
        && !/\.(?:pem|key|pfx|p12|kdbx)$/iu.test(s);
}
/** Freeze caller data before asynchronous identity/role checks; getters never run. */
export function snapshotAutonomousWorkspaceInput(name: string, input: unknown): Record<string, any> {
    if (name === 'runtime_diagnostics') return snapshotRuntimeDiagnosticInput(input);
    if (!autonomousWorkspaceTool(name) || !input || typeof input !== 'object' || Array.isArray(input)) deny('invalid_workspace_input');
    const allowed = new Set(name === 'project_pipeline' ? ['request', 'path'] : ['path', 'depth']);
    const copy: Record<string, any> = {};
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of Reflect.ownKeys(descriptors)) {
        if (typeof key !== 'string' || !allowed.has(key)) deny('invalid_workspace_input');
        const d = descriptors[key];
        if (!('value' in d) || !d.enumerable) deny('invalid_workspace_input');
        if (d.value !== undefined) copy[key] = d.value;
    }
    if (copy.path === undefined) copy.path = '.';
    if (typeof copy.path !== 'string' || !copy.path.trim() || copy.path.length > 2048) deny('invalid_workspace_path');
    if (name === 'project_pipeline') {
        if (typeof copy.request !== 'string' || !copy.request.trim() || copy.request.length > 8192) deny('invalid_workspace_request');
        if (redactSecretsFromString(copy.request) !== copy.request
            || /\b(?:nvapi-|gsk_|AIza)[A-Za-z0-9_-]{12,}|-----BEGIN (?:[A-Z ]*PRIVATE KEY|OPENSSH)/u.test(copy.request)) deny('sensitive_workspace_request');
        // Admission reaches only the existing overview branch. A mixed build,
        // shell, discovery or model request cannot borrow this read capability.
        if (!isReadOnlyWorkspaceOverviewRequest(copy.request)) deny('autonomous_engineering_not_supported');
    } else {
        if (copy.depth !== undefined && copy.depth !== 1) deny('directory_depth_limit');
        copy.depth = 1;
    }
    return Object.freeze(copy);
}

/** Physical root and every ancestor must remain an ordinary owned directory. */
export function validateAutonomousWorkspaceDirectory(raw: string, rootValue: string, externalRoot: string): string {
    if (typeof rootValue !== 'string' || !path.isAbsolute(rootValue)) deny('workspace_root_invalid');
    const root = path.resolve(rootValue);
    if (root === path.parse(root).root || root.toLowerCase() === path.resolve(externalRoot).toLowerCase()) deny('workspace_root_invalid');
    if (typeof raw !== 'string' || /[\u0000-\u001f\u007f]/u.test(raw) || /^[\\/]{2}/u.test(raw)) deny('invalid_workspace_path');
    const segments = raw.replace(/\\/g, '/').replace(/^[A-Za-z]:\//u, '').split('/');
    if (segments.some(s => s !== '.' && !safeSegment(s))) deny('sensitive_or_invalid_path');
    const target = path.resolve(root, raw), relative = path.relative(root, target);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) deny('path_outside_workspace');
    let cursor = path.parse(target).root;
    for (const segment of target.slice(cursor.length).split(path.sep)) {
        cursor = path.join(cursor, segment);
        let stat: fs.Stats;
        try { stat = fs.lstatSync(cursor); } catch { deny('directory_not_found'); }
        if (stat.isSymbolicLink()) deny('linked_workspace_path');
        if (!stat.isDirectory()) deny('invalid_workspace_directory');
    }
    return target;
}

/** One synchronous bounded read; never stat or traverse a child link or secret. */
export function inspectAutonomousWorkspaceDirectory(raw: string, root: string, externalRoot: string) {
    const target = validateAutonomousWorkspaceDirectory(raw, root, externalRoot);
    const dir = fs.opendirSync(target), tree: Array<{ name: string; type: string; size: number }> = [];
    let inspected = 0, truncated = false;
    try {
        for (let entry = dir.readSync(); entry; entry = dir.readSync()) {
            if (inspected++ >= AUTONOMOUS_DIRECTORY_ENTRIES) { truncated = true; break; }
            if (!safeSegment(entry.name) || entry.isSymbolicLink()) continue;
            const stat = fs.lstatSync(path.join(target, entry.name));
            if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()) || (stat.isFile() && stat.nlink !== 1)) continue;
            tree.push({ name: entry.name, type: stat.isDirectory() ? 'directory' : 'file', size: stat.isDirectory() ? 0 : stat.size });
        }
    } finally { dir.closeSync(); }
    return { ok: true, output: { tree, truncated, inspectedEntries: Math.min(inspected, AUTONOMOUS_DIRECTORY_ENTRIES) },
        logs: [`listed=${target} depth=1 bounded=1 truncated=${Number(truncated)}`] };
}
