// Wiring checkpoint 058: live /api/tools name-set reconciliation (read-only).
// 1. Fetch live name sets from :5101 (Muse bundle, own UAT runtime) and :5000 (main).
// 2. Count + duplicate check + set differences.
// 3. Per-name source-anchor check: every live name must appear literally in api/src.
const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function getJson(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/api/tools`, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Build a literal-substring index of api/src: file -> content (bounded: .ts files only, skip node_modules/dist).
function indexTree(root) {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.jest-cache' || e.name === '.tmp') continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) files.push(p);
    }
  };
  walk(path.join(root, 'api', 'src'));
  return files;
}

(async () => {
  const out = { errors: [] };
  const a5101 = await getJson(5101).catch((e) => { out.errors.push('5101: ' + e.message); return null; });
  const a5000 = await getJson(5000).catch((e) => { out.errors.push('5000: ' + e.message); return null; });
  if (!a5101 || !a5000) { console.log(JSON.stringify(out, null, 1)); process.exit(2); }
  const namesOf = (payload) => (payload.tools || []).map((t) => t.name);
  const n5101 = namesOf(a5101), n5000 = namesOf(a5000);
  out.count_5101 = a5101.count; out.entries_5101 = n5101.length;
  out.count_5000 = a5000.count; out.entries_5000 = n5000.length;
  const dups = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);
  out.dups_5101 = [...new Set(dups(n5101))];
  out.dups_5000 = [...new Set(dups(n5000))];
  const s5101 = new Set(n5101), s5000 = new Set(n5000);
  out.only_5101 = n5101.filter((x) => !s5000.has(x));
  out.only_5000 = n5000.filter((x) => !s5101.has(x));

  // Source-anchor check per live name (literal occurrence in api/src .ts, both trees).
  const trees = { muse: 'D:/Joe/muse-worktree', main: 'D:/Joe/xelitesolutions' };
  const contents = {};
  for (const [k, root] of Object.entries(trees)) {
    const files = indexTree(root);
    contents[k] = files.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
    out['src_files_indexed_' + k] = files.length;
  }
  const noAnchor = [];
  for (const name of new Set([...n5101, ...n5000])) {
    const inMuse = contents.muse.includes(name);
    const inMain = contents.main.includes(name);
    if (!inMuse && !inMain) noAnchor.push(name);
  }
  out.names_without_any_src_anchor = noAnchor;
  // Reverse: revivedTools safeNew class-name anchors — count safeNew( occurrences per tree registry.
  for (const [k, root] of Object.entries(trees)) {
    const reg = fs.readFileSync(path.join(root, 'api/src/modules/tools/registry.ts'), 'utf8');
    out['safenew_count_' + k] = (reg.match(/safeNew\(/g) || []).length;
  }
  fs.writeFileSync('D:/Joe/muse-worktree/tmp/wiring-audit/nameset058.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({ count_5101: out.count_5101, entries_5101: out.entries_5101, count_5000: out.count_5000, entries_5000: out.entries_5000, dups_5101: out.dups_5101, dups_5000: out.dups_5000, only_5101: out.only_5101, only_5000: out.only_5000, names_without_any_src_anchor: noAnchor, errors: out.errors }, null, 1));
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
