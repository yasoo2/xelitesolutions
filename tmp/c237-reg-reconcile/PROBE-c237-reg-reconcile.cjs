// C237 registry reconciliation probe — Muse HEAD, source-text only (no imports).
// Compares: definitions/*.ts exports  vs  registry.ts instantiation references.
// Stdlib only. Read-only: writes nothing outside its own result dir (caller redirects stdout).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = 'D:\\Joe\\muse-worktree';
const REG = path.join(ROOT, 'api/src/modules/tools/registry.ts');
const DEFDIR = path.join(ROOT, 'api/src/modules/tools/definitions');

const sha16 = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);
const shaFull = (b) => crypto.createHash('sha256').update(b).digest('hex');

const regBytes = fs.readFileSync(REG);
const reg = regBytes.toString('utf8');

// ---- 1. Registration references in registry.ts ----
const news = [...reg.matchAll(/new\s+([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1])
  .filter(x => x !== 'T' && x !== 'EliteTools' && x !== 'Error');
const elites = [...reg.matchAll(/new\s+EliteTools\.([A-Za-z0-9_]+)\s*\(/g)].map(m => 'EliteTools.' + m[1]);
const created = [...reg.matchAll(/createTool\s*\(\s*([A-Za-z0-9_]+)\s*\)/g)].map(m => m[1]);
const safeLabels = [...reg.matchAll(/safeNew\s*\(\s*'([^']+)'/g)].map(m => m[1]);
// bare ToolDefinition objects placed directly in arrays:
const bareArch = /^\s*ArchitectTool\s*,?(?:\s*\/\/.*)?$/m.test(reg) ? ['ArchitectTool'] : [];
const bareTodo = /^\s*TodoWriteTool\s*,?(?:\s*\/\/.*)?$/m.test(reg) ? ['TodoWriteTool'] : [];
// MemoryTools members:
const memSrc = fs.readFileSync(path.join(DEFDIR, 'MemoryTool.ts'), 'utf8');
const memNames = [...memSrc.matchAll(/name\s*:\s*'([^']+)'/g)].map(m => m[1]);

// safeNew class refs are already inside `news` (they use `new X()`); split for reporting:
const safeNewClasses = [...reg.matchAll(/safeNew\s*\([^,]+,\s*\(\)\s*=>\s*new\s+([A-Za-z0-9_]+)\s*\(/g)].map(m => m[1]);
const baseNewClasses = news.filter(x => !safeNewClasses.includes(x));

const registeredRefs = [...new Set([...news, ...created, ...elites.map(e => e.split('.')[1]), ...bareArch, ...bareTodo])];

// ---- 2. Definition exports ----
const defFiles = fs.readdirSync(DEFDIR).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts')).sort();
const exportsByClass = {}; // className -> {file, toolName|null}
for (const f of defFiles) {
  const src = fs.readFileSync(path.join(DEFDIR, f), 'utf8');
  const lines = src.split('\n');
  // find export anchors: export class X / export const X
  const anchors = [];
  const re = /^export\s+(?:default\s+)?(class|const|function)\s+([A-Za-z0-9_]+)([^\n]*)/gm;
  let m;
  while ((m = re.exec(src)) !== null) anchors.push({ kind: m[1], name: m[2], decl: m[3], idx: m.index });
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const start = a.idx;
    const end = i + 1 < anchors.length ? anchors[i + 1].idx : src.length;
    const body = src.slice(start, end);
    // A definition export counts as a tool symbol only if: a class ending in
    // Tool(s); a const explicitly typed ToolDefinition; or a const object with
    // both name: and execute: (untyped tool literals like ImageGenerationTool).
    // This excludes helper functions/consts (planContainsTool, namespaces...).
    const isTool = (a.kind === 'class' && /Tools?$/.test(a.name)) ||
      (a.kind === 'const' && (/ToolDefinitions?/.test(a.decl) ||
        (/name\s*:/.test(body) && /execute\s*[:\(]/.test(body))));
    if (!isTool && !registeredRefs.includes(a.name)) continue;
    const nm = body.match(/name\s*[:=]\s*['"]([^'"]+)['"]/);
    if (!exportsByClass[a.name]) {
      exportsByClass[a.name] = { file: f, toolName: nm ? nm[1] : null };
    }
  }
}

// ---- 3. Reconcile ----
const IMPLEMENTED_NOT_REGISTERED = Object.keys(exportsByClass)
  .filter(c => !registeredRefs.includes(c) && c !== 'MemoryTools')
  .sort();
const REGISTERED_WITHOUT_IMPLEMENTATION = registeredRefs
  .filter(c => !exportsByClass[c])
  .sort();
// duplicate class instantiation refs (same class `new` more than once):
const allInstRefs = [...news, ...created, ...elites.map(e => e.split('.')[1])];
const counts = {};
for (const c of allInstRefs) counts[c] = (counts[c] || 0) + 1;
const DUPLICATE_INSTANTIATION = Object.entries(counts).filter(([, n]) => n > 1);
// safeNew label vs declared name check:
const labelMismatches = [];
{
  const pairs = [...reg.matchAll(/safeNew\s*\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*new\s+([A-Za-z0-9_]+)\s*\(/g)];
  for (const p of pairs) {
    const decl = exportsByClass[p[2]] ? exportsByClass[p[2]].toolName : null;
    if (decl && decl !== p[1]) labelMismatches.push({ label: p[1], cls: p[2], declared: decl });
  }
}

// ---- 4. Counts ----
const totalRegisteredInstances =
  baseNewClasses.length + created.length + elites.length +
  safeNewClasses.length + memNames.length + bareArch.length + bareTodo.length;

const out = {
  provenance: {
    museHead: '62f8a0ec1f4891e6af458b2baaa07b205b494bda',
    registrySha256: shaFull(regBytes),
    defFiles: defFiles.length,
  },
  counts: {
    definitionFiles: defFiles.length,
    exportedToolSymbols: Object.keys(exportsByClass).length,
    registeredUniqueRefs: registeredRefs.length,
    registeredInstances: totalRegisteredInstances,
    baseNew: baseNewClasses.length,
    createTool: created.length,
    eliteNew: elites.length,
    safeNew: safeNewClasses.length,
    memoryMembers: memNames.length,
    bareObjects: bareArch.length + bareTodo.length,
    memoryNames: memNames,
  },
  IMPLEMENTED_NOT_REGISTERED: IMPLEMENTED_NOT_REGISTERED.map(c => ({ cls: c, ...exportsByClass[c] })),
  REGISTERED_WITHOUT_IMPLEMENTATION,
  DUPLICATE_INSTANTIATION: DUPLICATE_INSTANTIATION.map(([c, n]) => ({ cls: c, times: n })),
  safeNewLabelMismatches: labelMismatches,
};
console.log(JSON.stringify(out, null, 2));
