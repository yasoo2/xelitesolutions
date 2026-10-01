// Independent verification for CRITICAL-REAL-JOE-UI-001 run32 (wordfreq, fresh unseen prompt).
// Searches BOTH api/data/projects (where the :5101 API writes) and data/projects.
// Executes the REAL tool binary and recomputes expected word frequencies INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOTS = ['D:/Joe/muse-worktree/api/data/projects', 'D:/Joe/muse-worktree/data/projects'];
const results = [];
function check(name, ok, detail) { results.push({ name, ok: !!ok, detail: String(detail).slice(0, 300) }); }

function findFiles(dir, pred, acc, depth) {
  if (depth > 6) return acc;
  let ents = [];
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of ents) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '.engineering-checkpoints') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findFiles(p, pred, acc, depth + 1);
    else if (pred(e.name, p)) acc.push(p);
  }
  return acc;
}

// Only files modified in the last 180 minutes (this run), to avoid stale matches.
const cutoff = Date.now() - 180 * 60 * 1000;
const fresh = (p) => { try { return fs.statSync(p).mtimeMs >= cutoff; } catch { return false; } };

let cands = [];
for (const ROOT of ROOTS) {
  const hits = findFiles(ROOT, (n) => /^wordfreq.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /wordfreq/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh wordfreq entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample text: fresh .txt near entry with >= 10 non-empty lines.
const txts = findFiles(dir, (n) => n.endsWith('.txt'), [], 0).filter(fresh);
let sample = null, sampleText = '';
for (const t of txts) {
  try {
    const text = fs.readFileSync(t, 'utf8');
    const nonEmpty = text.split('\n').filter((l) => l.trim() !== '');
    if (nonEmpty.length >= 10) { sample = t; sampleText = text; break; }
  } catch { /* ignore */ }
}
check('sample-txt-10lines', !!sample, sample || `txts: ${txts.join(';')}`);

function expectedTop(text, n) {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  const counts = new Map();
  for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1));
  return sorted.slice(0, n).map(([w, c]) => `${w} ${c}`).join('\n');
}

if (sample) {
  // Correct top-3, recomputed independently.
  try {
    const r = cp.spawnSync('node', [entry, sample, '3'], { timeout: 30000, encoding: 'utf8' });
    const got = String(r.stdout || '').replace(/\s+$/, '');
    const exp = expectedTop(sampleText, 3);
    check('top3-exact', r.status === 0 && got === exp, `exit=${r.status} got=${JSON.stringify(got.slice(0, 120))} exp=${JSON.stringify(exp.slice(0, 120))}`);
  } catch (e) { check('top3-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  // Missing file: exit 3 + 'cannot open' on stderr.
  try {
    const r = cp.spawnSync('node', [entry, 'no_such_file_xyz_123.txt', '5'], { timeout: 30000, encoding: 'utf8' });
    const err = String(r.stderr || '');
    check('missing-file-exit3', r.status === 3, `exit=${r.status}`);
    check('missing-file-message', err.toLowerCase().includes('cannot open'), JSON.stringify(err.slice(0, 120)));
  } catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }
  // Bad N (0 and xyz): exit 2 + 'bad count' on stderr.
  for (const bad of ['0', 'xyz']) {
    try {
      const r = cp.spawnSync('node', [entry, sample, bad], { timeout: 30000, encoding: 'utf8' });
      const err = String(r.stderr || '');
      check(`bad-count-${bad}-exit2`, r.status === 2, `exit=${r.status}`);
      check(`bad-count-${bad}-message`, err.toLowerCase().includes('bad count'), JSON.stringify(err.slice(0, 120)));
    } catch (e) { check(`bad-count-${bad}-behavior`, false, String(e.message).slice(0, 200)); }
  }
} else {
  check('top3-exact', false, 'no sample');
  check('missing-file-exit3', false, 'no sample');
}

// --help: exit 0, usage text.
try {
  const r = cp.spawnSync('node', [entry, '--help'], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('help-exit0', r.status === 0, `exit=${r.status}`);
  check('help-content', /usage/i.test(txt) && /wordfreq/i.test(txt), txt.trim().slice(0, 200));
} catch (e) { check('help-behavior', false, String(e.message).slice(0, 200)); }

// npm test script present + passes.
let pkgPath = path.join(dir, 'package.json');
if (!fs.existsSync(pkgPath)) {
  let pkgs = [];
  for (const ROOT of ROOTS) pkgs = pkgs.concat(findFiles(ROOT, (n) => n === 'package.json', [], 0).filter(fresh));
  pkgPath = pkgs[0] || pkgPath;
}
let hasTest = false;
try { hasTest = !!((JSON.parse(fs.readFileSync(pkgPath, 'utf8')).scripts || {}).test); } catch { /* ignore */ }
check('npm-test-script', hasTest, pkgPath);
if (hasTest) {
  try {
    const env = { ...process.env, npm_config_cache: 'D:/Joe/muse-worktree/tmp/npm-cache' };
    const r = cp.spawnSync('npm', ['test', '--silent'], { cwd: path.dirname(pkgPath), timeout: 180000, encoding: 'utf8', shell: true, env });
    check('npm-test-passes', r.status === 0, `exit=${r.status} tail=${((r.stdout || '') + (r.stderr || '')).trim().slice(-200)}`);
  } catch (e) { check('npm-test-passes', false, String(e.message).slice(0, 200)); }
}

function finish() {
  console.log(JSON.stringify(results, null, 1));
  const fails = results.filter((r) => !r.ok).length;
  console.log('VERIFY32: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
