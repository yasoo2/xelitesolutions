// MUSE wiring audit checkpoint 006 — corrected implemented-not-registered census.
// Re-baseline of the 047 method at current HEADs, fixing 047's failure mode:
// tree-wide reference checks use a Node file-walk (sandbox-safe), NOT git grep
// (which fails under sandbox git-ownership and caused the withdrawn grep_search
// orphan claim in 053). Static text scan, zero Joe imports, read-only both trees.
const fs = require('fs');
const path = require('path');

const MUSE = 'D:/Joe/muse-worktree';
const MAIN = 'D:/Joe/xelitesolutions';
const OUT = path.join(MUSE, 'tmp', 'wiring-audit', 'fx-census06');
fs.mkdirSync(OUT, { recursive: true });
const runTag = process.argv[2] || 'a';

function walkTs(dir, acc) {
  acc = acc || [];
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return acc; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p, acc);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

function exportedSymbols(tree) {
  const dir = path.join(tree, 'api', 'src', 'modules', 'tools', 'definitions');
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    const chunks = src.split(/(?=export\s+(?:default\s+)?(?:class|const)\s+\w+)/g);
    for (const ch of chunks) {
      const cm = ch.match(/export\s+(?:default\s+)?(class|const)\s+(\w+)/);
      if (!cm) continue;
      if (/ToolDefinition\[\]/.test(ch.slice(0, 120))) { out.push({ sym: cm[2], kind: 'array', file: f }); continue; }
      // tool-shape: chunk declares a tool name and an execute member
      const nm = ch.match(/name\s*[:=]\s*['"]([a-z0-9_]+)['"]/);
      const hasExec = /\bexecute\s*\(/.test(ch) || /\bexecute\s*[:=]/.test(ch);
      out.push({ sym: cm[2], kind: cm[1], file: f,
        toolName: nm ? nm[1] : null, toolShaped: !!(nm && hasExec) });
    }
  }
  return out;
}

function census(tree, label) {
  const reg = fs.readFileSync(path.join(tree, 'api', 'src', 'modules', 'tools', 'registry.ts'), 'utf8');
  const syms = exportedSymbols(tree);
  const unref = [];
  for (const s of syms) {
    const re = new RegExp('\\b' + s.sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
    if (!re.test(reg)) unref.push(s);
  }
  // Tree-wide reference check (sandbox-safe walk of api/src, own file excluded).
  const allTs = walkTs(path.join(tree, 'api', 'src'));
  const cache = {};
  for (const f of allTs) cache[f] = fs.readFileSync(f, 'utf8');
  for (const s of unref) {
    const re = new RegExp('\\b' + s.sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'g');
    let count = 0; const files = [];
    const own = path.join(tree, 'api', 'src', 'modules', 'tools', 'definitions', s.file);
    for (const f of allTs) {
      if (path.resolve(f) === path.resolve(own)) continue;
      const m = cache[f].match(re);
      if (m) { count += m.length; if (files.length < 8) files.push(path.relative(tree, f).replace(/\\/g, '/') + 'x' + m.length); }
    }
    s.treeRefs = count; s.treeRefFiles = files;
  }
  return { label, exported: syms.length, unreferenced: unref };
}

const result = { run: runTag, muse: census(MUSE, 'MUSE'), main: census(MAIN, 'MAIN') };
const fp = path.join(OUT, 'census06_' + runTag + '.json');
fs.writeFileSync(fp, JSON.stringify(result, null, 1));
console.log('MUSE exported=' + result.muse.exported + ' unref=' + result.muse.unreferenced.length);
console.log('MAIN exported=' + result.main.exported + ' unref=' + result.main.unreferenced.length);
console.log('wrote ' + fp);
