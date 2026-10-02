// WIRING-149: registry-count reconciliation probe (Muse independent cross-check).
// Tests NVIDIA wiring-summary headline counts against BOTH trees:
// RAW_TOOL_DEFINITIONS (def files), REGISTERED_TOOLS (live registry),
// catalogue size, alias size, revived count, execute() presence.
// ZERO DISPATCH: imports registry/catalogue/aliases live, never executes a
// tool. Deterministic stdout (canonical JSON); timings to stderr only.
// Usage: TREE=MUSE|NVIDIA ROOTDIR=<abs api dir> tsx probe-regcount149.mts
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const tree = process.env.TREE || 'MUSE';
const rootDir = process.env.ROOTDIR || '';
if (!rootDir) { console.error('ROOTDIR required'); process.exit(2); }
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

// Capture registry's own log line (it prints at import).
let registryLog = '';
const origInfo = console.info;
const origWarn = console.warn;
console.info = ((...a: any[]) => { registryLog += a.map(String).join(' ') + '\n'; }) as any;
console.warn = (() => {}) as any;

const t0 = Date.now();
const reg = await import(pathToFileURL(path.join(rootDir, 'src/modules/tools/registry.ts')).href);
const pt = await import(pathToFileURL(path.join(rootDir, 'src/core/orchestrator/plan-tools.ts')).href);
const svc = await import(pathToFileURL(path.join(rootDir, 'src/modules/services/ToolService.ts')).href);
const importMs = Date.now() - t0;
console.info = origInfo;
console.warn = origWarn;
console.error(`importMs=${importMs}`);

const tools: any[] = Array.isArray(reg.tools) ? reg.tools : [];
const names: string[] = tools.map((t: any) => t?.name).filter((n: any) => typeof n === 'string');
const dupes = names.filter((n, i) => names.indexOf(n) !== i);
const missingExecute = tools.filter((t: any) => typeof t?.execute !== 'function').map((t: any) => String(t?.name));
const cd = reg.contractDefaults || { permissions: [], rateLimit: [], unknown: [] };

const catalogue: any[] = Array.isArray(pt.PLANNER_TOOL_CATALOGUE) ? pt.PLANNER_TOOL_CATALOGUE : [];
const catTools = catalogue.map((c: any) => String(c?.tool || ''));
const aliases: Record<string, string> = svc.TOOL_ALIASES || {};
const aliasKeys = Object.keys(aliases).sort();

const defsDir = path.join(rootDir, 'src/modules/tools/definitions');
const defFiles = fs.readdirSync(defsDir).filter(f => f.endsWith('.ts')).sort();
// Declared tool names via `name = 'xxx'` / `name: 'xxx'` at def sites.
const declared = new Set<string>();
for (const f of defFiles) {
    const text = fs.readFileSync(path.join(defsDir, f), 'utf8');
    const re = /name\s*[:=]\s*['"]([a-z][a-z0-9_]{2,})['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) declared.add(m[1]);
}
const registeredSet = new Set(names);
const declaredSorted = [...declared].sort();
const declaredNotRegistered = declaredSorted.filter(n => !registeredSet.has(n) && !(n in aliases));
const registeredNotDeclared = [...names].sort().filter(n => !declared.has(n));

const out = {
    tree,
    registryLog: registryLog.trim(),
    registeredCount: names.length,
    registeredSha256: sha([...names].sort().join('\n')),
    duplicateNames: dupes,
    missingExecute,
    contractDefaultedPermissions: (cd.permissions || []).length,
    contractDefaultedRateLimit: (cd.rateLimit || []).length,
    contractUnknownPermissions: (cd.unknown || []).length,
    catalogueCount: catTools.length,
    catalogueSha256: sha([...catTools].sort().join('\n')),
    catalogueEntries: [...catTools].sort(),
    aliasCount: aliasKeys.length,
    aliasSha256: sha(aliasKeys.join('\n')),
    defFileCount: defFiles.length,
    defFilesSha256: sha(defFiles.join('\n')),
    declaredNameCount: declaredSorted.length,
    declaredNotRegistered,
    registeredNotDeclared,
};
process.stdout.write(JSON.stringify(out, null, 1) + '\n');
