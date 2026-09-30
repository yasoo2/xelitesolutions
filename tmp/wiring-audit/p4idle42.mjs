// p4idle42.mjs — checkpoint 42 probe A: S12/tool-picker dormancy re-verification.
// PURE STATIC TEXT SCAN. No Joe imports, no servers, no network, no writes outside fx dir.
// Usage: node tmp/wiring-audit/p4idle42.mjs
// Exit 0 with JSON verdicts per tree; a production caller overturns DORMANT.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'fx-p4idle42');
const TREES = {
  MUSE: 'D:/Joe/muse-worktree/api/src',
  MAIN: 'D:/Joe/xelitesolutions/api/src',
};
const EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.tmp')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}
// Production runtime vs tooling/test classification (path-based, explicit).
function classify(rel) {
  const r = rel.replace(/\\/g, '/');
  if (/(^|\/)(__tests__|__test__|tests?\/manual|system\/scripts|scripts\/|test-|spec\.|\.test\.|\.spec\.)/.test(r)) return 'tooling-or-test';
  return 'production';
}
function scanTree(root) {
  const files = walk(root);
  const pickerRefs = [];   // any mention of tool-picker module path
  const symbolRefs = [];   // selectToolDefsFor* / dynamicCatalogue / catalogueForAsync mentions
  const dynRequire = [];   // require(/import( with non-literal first arg
  const reexports = [];    // export ... from '...tool-picker...'
  for (const f of files) {
    const rel = path.relative(root, f);
    let src;
    try { src = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      const ln = i + 1;
      const cut = line.replace(/\/\/.*$/, ''); // strip line comments (strings may false-positive; reviewed manually)
      if (/tool-picker/.test(cut)) pickerRefs.push({ file: rel, line: ln, cls: classify(rel), text: line.trim().slice(0, 140) });
      if (/\bselectToolDefsFor\w*|dynamicCatalogue|catalogueForAsync\b/.test(cut) && !/tool-picker\.ts$/.test(rel.replace(/\\/g, '/')))
        symbolRefs.push({ file: rel, line: ln, cls: classify(rel), text: line.trim().slice(0, 140) });
      if (/^\s*export\s+[^;]*\bfrom\b/.test(cut) && /tool-picker/.test(cut))
        reexports.push({ file: rel, line: ln, cls: classify(rel), text: line.trim().slice(0, 140) });
      // dynamic require/import: require( or import( whose first non-space char is NOT a quote
      const m = cut.match(/\brequire\s*\(\s*([^'"'\s)]...)/) || cut.match(/\brequire\s*\(\s*([^'"'\s])/) ;
      if (m) dynRequire.push({ file: rel, line: ln, cls: classify(rel), kind: 'require(', text: line.trim().slice(0, 140) });
      const im = cut.match(/\bimport\s*\(\s*([^'"'\s])/) ;
      if (im && !/^\s*import\s+[('"]/.test(cut)) dynRequire.push({ file: rel, line: ln, cls: classify(rel), kind: 'import(', text: line.trim().slice(0, 140) });
      if (/\brequire\.resolve\s*\(/.test(cut) || /\bcreateRequire\s*\(/.test(cut))
        dynRequire.push({ file: rel, line: ln, cls: classify(rel), kind: 'resolve/createRequire', text: line.trim().slice(0, 140) });
    });
  }
  const prodPickerRefs = pickerRefs.filter(r => r.cls === 'production');
  const prodSymbolRefs = symbolRefs.filter(r => r.cls === 'production');
  return {
    filesScanned: files.length,
    pickerRefs, symbolRefs, reexports, dynRequire,
    verdict: (prodPickerRefs.length === 0 && prodSymbolRefs.length === 0 && reexports.filter(r => r.cls === 'production').length === 0)
      ? 'DORMANT_UPHELD' : 'CALLER_FOUND',
  };
}

const result = { probe: 'p4idle42', at: new Date().toISOString(), trees: {} };
for (const [name, root] of Object.entries(TREES)) result.trees[name] = scanTree(root);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'p4idle42_AB.json'), JSON.stringify(result, null, 1));
for (const [name, t] of Object.entries(result.trees)) {
  console.log(`${name}: files=${t.filesScanned} pickerRefs=${t.pickerRefs.length} symbolRefs=${t.symbolRefs.length} reexports=${t.reexports.length} dynReq=${t.dynRequire.length} VERDICT=${t.verdict}`);
  for (const r of [...t.pickerRefs, ...t.symbolRefs, ...t.reexports]) console.log(`  [${r.cls}] ${r.file}:${r.line}: ${r.text}`);
}
console.log('wrote fx-p4idle42/p4idle42_AB.json');
