// Independent verification for CRITICAL-REAL-JOE-UI-001 run34 (dupfind, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Executes the REAL tool binary and recomputes duplicate groups INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run34';
const ROOTS = [RUN + '/data/projects', RUN + '/api/data/projects',
  'D:/Joe/muse-worktree/api/data/projects', 'D:/Joe/muse-worktree/data/projects'];
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
  const hits = findFiles(ROOT, (n) => /^dupfind.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /dupfind/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh dupfind entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample dir: a directory near the entry holding >= 6 files forming >= 2 dup groups.
function groupsOf(d, recursive) {
  const files = [];
  const walk = (dd, rel) => {
    for (const e of fs.readdirSync(dd, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = path.join(dd, e.name);
      if (e.isDirectory()) { if (recursive) walk(p, path.join(rel, e.name)); }
      else if (e.isFile()) files.push(path.join(rel, e.name));
    }
  };
  walk(d, '');
  const byHash = new Map();
  for (const f of files) {
    const h = require('crypto').createHash('sha256').update(fs.readFileSync(path.join(d, f))).digest('hex');
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(f);
  }
  return [...byHash.values()].filter((g) => g.length > 1)
    .map((g) => g.slice().sort().join(',')).sort();
}
let sampleDir = null, expGroups = null;
const subdirs = [dir, ...fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(dir, e.name))];
for (const d of subdirs) {
  try {
    const files = [];
    for (const e of fs.readdirSync(d, { withFileTypes: true })) if (e.isFile()) files.push(e.name);
    if (files.length < 6) continue;
    const g = groupsOf(d, false);
    if (g.length >= 2) { sampleDir = d; expGroups = g; break; }
  } catch { /* ignore */ }
}
check('sample-dir-6files-2groups', !!sampleDir, sampleDir || 'none');

if (sampleDir) {
  try {
    const r = cp.spawnSync('node', [entry, sampleDir], { timeout: 30000, encoding: 'utf8' });
    const got = String(r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean).sort();
    check('groups-exact', r.status === 0 && JSON.stringify(got) === JSON.stringify(expGroups),
      `exit=${r.status} got=${JSON.stringify(got).slice(0, 200)} exp=${JSON.stringify(expGroups).slice(0, 200)}`);
  } catch (e) { check('groups-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, sampleDir, '--recursive'], { timeout: 30000, encoding: 'utf8' });
    check('recursive-exit0', r.status === 0, `exit=${r.status} stderr=${String(r.stderr || '').slice(0, 120)}`);
  } catch (e) { check('recursive-exit0', false, String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, 'no_such_dir_xyz_123'], { timeout: 30000, encoding: 'utf8' });
    check('missing-dir-exit6', r.status === 6, `exit=${r.status}`);
    check('missing-dir-message', String(r.stderr || '').toLowerCase().includes('no such directory'), JSON.stringify(String(r.stderr || '').slice(0, 120)));
  } catch (e) { check('missing-dir-behavior', false, String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, entry], { timeout: 30000, encoding: 'utf8' });
    check('notdir-exit7', r.status === 7, `exit=${r.status}`);
    check('notdir-message', String(r.stderr || '').toLowerCase().includes('not a directory'), JSON.stringify(String(r.stderr || '').slice(0, 120)));
  } catch (e) { check('notdir-behavior', false, String(e.message).slice(0, 200)); }
} else {
  check('groups-exact', false, 'no sample dir');
}

try {
  const r = cp.spawnSync('node', [entry, '--help'], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('help-exit0', r.status === 0, `exit=${r.status}`);
  check('help-content', /usage/i.test(txt) && /dupfind/i.test(txt) && /recursive/i.test(txt), txt.trim().slice(0, 200));
} catch (e) { check('help-behavior', false, String(e.message).slice(0, 200)); }

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
  console.log('VERIFY34: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
