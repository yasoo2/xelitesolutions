// Independent verification for CRITICAL-REAL-JOE-UI-001 run33 (csvsum, fresh unseen prompt).
// Searches BOTH api/data/projects (where the :5101 API writes) and data/projects.
// Executes the REAL tool binary and recomputes expected sums/averages INDEPENDENTLY.
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
  const hits = findFiles(ROOT, (n) => /^csvsum.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /csvsum/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh csvsum entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample CSV: fresh .csv near entry with header + >= 8 data rows.
const csvs = findFiles(dir, (n) => n.endsWith('.csv'), [], 0).filter(fresh);
let sample = null, rows = null;
for (const t of csvs) {
  try {
    const lines = fs.readFileSync(t, 'utf8').split('\n').filter((l) => l.trim() !== '');
    if (lines.length >= 9) { sample = t; rows = lines.map((l) => l.split(',')); break; }
  } catch { /* ignore */ }
}
check('sample-csv-8rows', !!sample, sample || `csvs: ${csvs.join(';')}`);

function num(v) { const s = String(v == null ? '' : v).trim(); if (s === '') return 0; const n = Number(s); return Number.isFinite(n) ? n : NaN; }

if (sample) {
  const header = rows[0].map((h) => String(h).trim());
  const data = rows.slice(1);
  // Pick the first column whose every cell parses numeric (else first column).
  let col = header[0];
  for (const h of header) {
    const i = header.indexOf(h);
    if (data.every((r) => !Number.isNaN(num(r[i])))) { col = h; break; }
  }
  const ci = header.indexOf(col);
  const vals = data.map((r) => num(r[ci]));
  const expSum = vals.reduce((a, b) => a + b, 0);
  const expAvg = expSum / vals.length;
  const norm = (s) => String(s || '').trim();
  try {
    const r = cp.spawnSync('node', [entry, sample, col], { timeout: 30000, encoding: 'utf8' });
    check('sum-exact', r.status === 0 && Number(norm(r.stdout)) === expSum, `exit=${r.status} got=${JSON.stringify(norm(r.stdout).slice(0, 60))} exp=${expSum} col=${col}`);
  } catch (e) { check('sum-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, sample, col, '--average'], { timeout: 30000, encoding: 'utf8' });
    const got = Number(norm(r.stdout));
    check('average-exact', r.status === 0 && Math.abs(got - expAvg) < 1e-9, `exit=${r.status} got=${got} exp=${expAvg} col=${col}`);
  } catch (e) { check('average-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, 'no_such_file_xyz_123.csv', col], { timeout: 30000, encoding: 'utf8' });
    check('missing-file-exit4', r.status === 4, `exit=${r.status}`);
    check('missing-file-message', String(r.stderr || '').toLowerCase().includes('no such file'), JSON.stringify(String(r.stderr || '').slice(0, 120)));
  } catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, sample, 'no_such_column_xyz'], { timeout: 30000, encoding: 'utf8' });
    check('missing-column-exit5', r.status === 5, `exit=${r.status}`);
    check('missing-column-message', String(r.stderr || '').toLowerCase().includes('no such column'), JSON.stringify(String(r.stderr || '').slice(0, 120)));
  } catch (e) { check('missing-column-behavior', false, String(e.message).slice(0, 200)); }
} else {
  check('sum-exact', false, 'no sample');
  check('average-exact', false, 'no sample');
}

// --help: exit 0, usage text.
try {
  const r = cp.spawnSync('node', [entry, '--help'], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('help-exit0', r.status === 0, `exit=${r.status}`);
  check('help-content', /usage/i.test(txt) && /csvsum/i.test(txt) && /average/i.test(txt), txt.trim().slice(0, 200));
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
  console.log('VERIFY33: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
