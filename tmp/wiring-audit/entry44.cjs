/* Checkpoint 44: ENTRY-B deterministic tool-name inventory (static, zero Joe imports).
 * Per tree: EMITTED names from ProjectPipelineTool.ts (tool: literals +
 * CAN_BUILD_OR_RUN + writeTools sets) reconciled against DECLARED tool names
 * (name =/: '...' in definitions/) and TOOL_ALIASES keys/targets.
 * Read-only; never imports or executes Joe source. */
const fs = require('node:fs');
const path = require('node:path');

const TREES = {
  MUSE: 'D:/Joe/muse-worktree/api/src',
  MAIN: 'D:/Joe/xelitesolutions/api/src',
};

function read(p) { return fs.readFileSync(p, 'utf8'); }

function emittedFromPipeline(srcDir) {
  const src = read(path.join(srcDir, 'modules/tools/definitions/ProjectPipelineTool.ts'));
  const out = new Map(); // name -> Set(sources)
  const add = (n, s) => { if (!out.has(n)) out.set(n, new Set()); out.get(n).add(s); };
  for (const m of src.matchAll(/tool:\s*'([a-z0-9_]+)'/g)) add(m[1], 'tool-literal');
  for (const m of src.matchAll(/executeTool\(\s*'([a-z0-9_]+)'/g)) add(m[1], 'direct-executeTool');
  for (const setName of ['CAN_BUILD_OR_RUN', 'writeTools']) {
    const idx = src.indexOf('new Set([');
    // find the set assigned near setName: search `setName = new Set([ ... ])`
    const re = new RegExp(setName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)');
    const mm = re.exec(src);
    if (mm) for (const q of mm[1].matchAll(/'([a-z0-9_]+)'/g)) add(q[1], setName);
    void idx;
  }
  return out;
}

function declaredNames(srcDir) {
  const defDir = path.join(srcDir, 'modules/tools/definitions');
  const names = new Map(); // name -> [files]
  for (const f of fs.readdirSync(defDir)) {
    if (!f.endsWith('.ts')) continue;
    const src = read(path.join(defDir, f));
    for (const m of src.matchAll(/\bname\s*[:=]\s*'([a-z0-9_]+)'/g)) {
      if (!names.has(m[1])) names.set(m[1], []);
      if (!names.get(m[1]).includes(f)) names.get(m[1]).push(f);
    }
  }
  return names;
}

function toolAliases(srcDir) {
  const src = read(path.join(srcDir, 'modules/services/ToolService.ts'));
  const m = /TOOL_ALIASES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  const map = new Map();
  if (m) for (const e of m[1].matchAll(/^\s*([a-z0-9_]+)\s*:\s*'([a-z0-9_]+)'/gm)) map.set(e[1], e[2]);
  return map;
}

const result = {};
for (const [tree, srcDir] of Object.entries(TREES)) {
  const emitted = emittedFromPipeline(srcDir);
  const declared = declaredNames(srcDir);
  const aliases = toolAliases(srcDir);
  const rows = [];
  for (const [name, sources] of [...emitted.entries()].sort()) {
    const direct = declared.has(name);
    const aliasTarget = aliases.get(name);
    const aliasOk = !!aliasTarget && declared.has(aliasTarget);
    rows.push({
      name,
      sources: [...sources].sort(),
      declaredDirect: direct,
      declaredIn: direct ? declared.get(name) : [],
      aliasOf: aliasTarget || null,
      aliasTargetDeclared: aliasTarget ? declared.has(aliasTarget) : null,
      executorReachableStatic: direct || aliasOk,
    });
  }
  result[tree] = {
    emittedCount: emitted.size,
    declaredCount: declared.size,
    aliasCount: aliases.size,
    unreachableStatic: rows.filter((r) => !r.executorReachableStatic).map((r) => r.name),
    aliasResolved: rows.filter((r) => !r.declaredDirect && r.aliasOf).map((r) => r.name + '->' + r.aliasOf),
    rows,
  };
}
// cross-tree diff of emitted vocabularies
const m = new Set(result.MUSE.rows.map((r) => r.name));
const n = new Set(result.MAIN.rows.map((r) => r.name));
result.EMITTED_DIFF = {
  onlyMUSE: [...m].filter((x) => !n.has(x)).sort(),
  onlyMAIN: [...n].filter((x) => !m.has(x)).sort(),
};
const outDir = 'D:/Joe/muse-worktree/tmp/wiring-audit/fx-entry44';
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'entry44_MUSE.json'), JSON.stringify(result.MUSE, null, 1));
fs.writeFileSync(path.join(outDir, 'entry44_MAIN.json'), JSON.stringify(result.MAIN, null, 1));
fs.writeFileSync(path.join(outDir, 'entry44_DIFF.json'), JSON.stringify(result.EMITTED_DIFF, null, 1));
console.log('MUSE emitted=' + result.MUSE.emittedCount + ' declared=' + result.MUSE.declaredCount +
  ' aliases=' + result.MUSE.aliasCount + ' unreachable=' + JSON.stringify(result.MUSE.unreachableStatic));
console.log('MAIN emitted=' + result.MAIN.emittedCount + ' declared=' + result.MAIN.declaredCount +
  ' aliases=' + result.MAIN.aliasCount + ' unreachable=' + JSON.stringify(result.MAIN.unreachableStatic));
console.log('aliasResolved MUSE=' + JSON.stringify(result.MUSE.aliasResolved) + ' MAIN=' + JSON.stringify(result.MAIN.aliasResolved));
console.log('DIFF=' + JSON.stringify(result.EMITTED_DIFF));
