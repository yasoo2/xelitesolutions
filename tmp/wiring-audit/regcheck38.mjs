// regcheck38.mjs — Checkpoint 38: per-declared-name static wiring pass (READ-ONLY).
// For each AST-declared tool name (reused filed evidence astdecl37_runA.json),
// checks three static scopes per tree (MUSE + MAIN/NVIDIA read-only):
//   REG: class identifier instantiated in registry.ts outside import lines
//        (new X / createTool(X) / safeNew(..new X) / new EliteTools.X / bare X,)
//        OR tool-name literal in registry.ts (safeNew labels), OR namespace
//        spread (MemoryTools) for object-tools of that file.
//   CAT: tool-name literal in plan-tools.ts (PLANNER_TOOL_CATALOGUE scope).
//   DISP: DERIVED — ToolService.executeTool resolves generically via
//        tools.find(t => t.name === effectiveName); per-name reachability is
//        REG (+ TOOL_ALIASES keys, recorded separately). No per-name faking.
// No source edits, no registry boot, no network. Deterministic sorted output.
import fs from 'fs';
import crypto from 'crypto';

const OUT = process.argv[2] || 'tmp/wiring-audit/fx-regcheck38/regcheck38_runA.json';
const TAG = process.argv[3] || 'runA';

const TREES = {
  MUSE: 'D:/Joe/muse-worktree/api/src',
  MAIN: 'D:/Joe/xelitesolutions/api/src',
};

const decl = JSON.parse(fs.readFileSync('tmp/wiring-audit/fx-astdecl37/astdecl37_runA.json', 'utf8'));

function nonImportLines(text) {
  return text.split('\n').filter(l => !/^\s*import[\s{*]/.test(l)).join('\n');
}

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function checkTree(root) {
  const reg = fs.readFileSync(root + '/modules/tools/registry.ts', 'utf8');
  const cat = fs.readFileSync(root + '/core/orchestrator/plan-tools.ts', 'utf8');
  const svc = fs.readFileSync(root + '/modules/services/ToolService.ts', 'utf8');
  const regBody = nonImportLines(reg);
  const result = [];
  const node = decl.trees[root === TREES.MUSE ? 'MUSE' : 'MAIN'];
  const files = Array.isArray(node) ? node : node.files;
  for (const f of files) {
    for (const tc of (f.toolClasses || [])) {
      const c = esc(tc.cls);
      const instRe = new RegExp(
        `(new\\s+(EliteTools\\.)?${c}\\s*\\(|createTool\\s*\\(\\s*(EliteTools\\.)?${c}\\b|safeNew\\s*\\([^\\n]*?new\\s+(EliteTools\\.)?${c}\\b|^\\s*${c}\\s*,)`, 'm');
      const byClass = instRe.test(regBody);
      const byName = reg.includes(`'${tc.name}'`) || reg.includes(`"${tc.name}"`);
      const regHit = byClass || byName;
      const catHit = cat.includes(`'${tc.name}'`) || cat.includes(`"${tc.name}"`) || cat.includes(`${tc.name}:`) || cat.includes(`tool: '${tc.name}'`);
      result.push({ name: tc.name, cls: tc.cls, file: f.file, kind: 'class', reg: regHit, regBy: byClass ? 'class' : (byName ? 'name' : 'none'), cat: catHit, disp: regHit ? 'via-registry' : 'unreachable-static' });
    }
    for (const on of (f.objectTools || [])) {
      const byName = reg.includes(`'${on}'`) || reg.includes(`"${on}"`);
      const spread = (f.file === 'MemoryTool.ts' && regBody.includes('...MemoryTools')) ||
        (on === 'todo_write' && /\bTodoWriteTool\b/.test(regBody));
      const ident = esc(f.file.replace(/\.ts$/, ''));
      const bareRe = new RegExp(`(^\\s*${ident}\\s*,|new\\s+(EliteTools\\.)?${ident}\\s*\\(|createTool\\s*\\(\\s*${ident}\\b|safeNew\\s*\\([^\\n]*?new\\s+${ident}\\b)`, 'm');
      const byIdent = bareRe.test(regBody);
      const regHit = byName || spread || byIdent;
      const catHit = cat.includes(`'${on}'`) || cat.includes(`"${on}"`);
      result.push({ name: on, cls: null, file: f.file, kind: 'object', reg: regHit, regBy: byIdent ? 'ident' : (spread ? 'spread' : (byName ? 'name' : 'none')), cat: catHit, disp: regHit ? 'via-registry' : 'unreachable-static' });
    }
  }
  // TOOL_ALIASES keys (reachable alias spellings, not declarations)
  const aliasKeys = [];
  const m = svc.match(/TOOL_ALIASES[^=]*=\s*\{([\s\S]*?)\n\};/);
  if (m) {
    for (const km of m[1].matchAll(/^\s*([a-z0-9_]+)\s*:/gm)) aliasKeys.push(km[1]);
  }
  result.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const unreg = result.filter(r => !r.reg).map(r => `${r.name} (${r.kind}:${r.file}${r.cls ? ':' + r.cls : ''})`);
  const regNoCat = result.filter(r => r.reg && !r.cat).map(r => r.name);
  return { total: result.length, registered: result.filter(r => r.reg).length, unregistered: unreg, registeredNotInCatalogue: regNoCat, aliasKeys: aliasKeys.sort(), rows: result };
}

const out = { probe: 'regcheck38', trees: {} };
for (const [t, root] of Object.entries(TREES)) out.trees[t] = checkTree(root);
const json = JSON.stringify(out, null, 1) + '\n';
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/'), { recursive: true });
fs.writeFileSync(OUT, json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
console.log(`tag=${TAG}`);
console.log(`sha256=${sha}`);
console.log(`MUSE_reg=${out.trees.MUSE.registered}/${out.trees.MUSE.total} MAIN_reg=${out.trees.MAIN.registered}/${out.trees.MAIN.total}`);
console.log(`MAIN_unreg=${out.trees.MAIN.unregistered.length} MUSE_unreg=${out.trees.MUSE.unregistered.length}`);
