/**
 * MUSE wiring discovery checkpoint 061 — registry permission-declaration audit.
 * READ-ONLY: imports the tool registry from the target tree and records each
 * registered tool's DECLARED permissions/sideEffects. The ToolService approval
 * gate reads these declarations for workspace/user gating, so undeclared tools
 * are a P3 dispatch/firewall reachability unknown, not a proven defect.
 * No servers, no network, no provider calls, no tool executions,
 * no writes outside --out.
 * Usage: tsx perm61.mts --tree=muse --out=<abs dir>
 * Env: dummy JWT_SECRET + JOE_TEST_MODE=true + worktree-local TEMP/TMP.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    return m ? [m[1], m[2]] : [a, '1'];
}));
const TREE = args.tree === 'main' ? 'main' : 'muse';
const OUT = String(args.out || '');
if (!OUT) { console.error('missing --out'); process.exit(2); }
const ROOTS: Record<string, string> = {
    muse: 'D:/Joe/muse-worktree/api/src',
    main: 'D:/Joe/xelitesolutions/api/src',
};
const regUrl = pathToFileURL(path.join(ROOTS[TREE], 'modules/tools/registry.ts')).href;
const reg = await import(regUrl);
const tools: any[] = (reg.tools || []).filter((t: any) => t?.name);

const rows = tools.map(t => ({
    name: String(t.name),
    permissions: Array.isArray(t.permissions) ? t.permissions.map(String) : null,
    sideEffects: Array.isArray(t.sideEffects) ? t.sideEffects.map(String) : null,
}));
const noPerms = rows.filter(r => !r.permissions || r.permissions.length === 0).map(r => r.name);
const noFx = rows.filter(r => !r.sideEffects || r.sideEffects.length === 0).map(r => r.name);
fs.mkdirSync(OUT, { recursive: true });
const tag = TREE === 'main' ? 'MAIN' : 'MUSE';
fs.writeFileSync(path.join(OUT, `perm61_${tag}.json`), JSON.stringify({
    probe: 'perm61', tree: TREE, registered: rows.length,
    noPermissionsCount: noPerms.length, noPermissions: noPerms,
    noSideEffectsCount: noFx.length, noSideEffects: noFx,
    rows,
}, null, 1));
console.log(JSON.stringify({ registered: rows.length, noPerms: noPerms.length, noFx: noFx.length }));
console.log('NO_PERMS=' + noPerms.join(','));
