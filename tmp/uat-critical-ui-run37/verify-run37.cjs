// Independent verification for CRITICAL-REAL-JOE-UI-001 run37 (loggrep, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Executes the REAL tool binary and recomputes the filter INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run37';
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
  const hits = findFiles(ROOT, (n) => /^loggrep.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /loggrep/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh loggrep entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample log: a .log/.txt file near the entry with >= 12 lines, some ERROR, some WARN, some neither.
let sample = null;
const nearFiles = findFiles(dir, (n) => /\.(log|txt)$/i.test(n), [], 2);
for (const f of nearFiles) {
  try {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    const nonEmpty = lines.filter((l) => l.trim() !== '');
    if (nonEmpty.length < 12) continue;
    const hasErr = nonEmpty.some((l) => l.includes('ERROR'));
    const hasWarn = nonEmpty.some((l) => l.includes('WARN'));
    const hasNeither = nonEmpty.some((l) => !l.includes('ERROR') && !l.includes('WARN'));
    if (hasErr && hasWarn && hasNeither) { sample = f; break; }
  } catch { /* ignore */ }
}
check('sample-log-12lines-mixed', !!sample, sample || 'none found near ' + dir);

function expectedMatches(file) {
  return fs.readFileSync(file, 'utf8').split('\n')
    .filter((l) => l.includes('ERROR') || l.includes('WARN'));
}

if (sample) {
  const exp = expectedMatches(sample);
  try {
    const r = cp.spawnSync('node', [entry, sample], { timeout: 30000, encoding: 'utf8' });
    const got = String(r.stdout || '').split('\n');
    if (got.length && got[got.length - 1] === '') got.pop();
    check('filter-exact', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length} got=${JSON.stringify(got).slice(0, 200)}`);
  } catch (e) { check('filter-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, '--count', sample], { timeout: 30000, encoding: 'utf8' });
    check('count-exact', r.status === 0 && String(r.stdout || '').trim() === String(exp.length),
      `exit=${r.status} got=${JSON.stringify(String(r.stdout || '').trim())} exp=${exp.length}`);
  } catch (e) { check('count-exact', false, String(e.message).slice(0, 200)); }
  // Also accept `node loggrep.js <logfile> --count` ordering if the primary fails.
  const countCheck = results.find((x) => x.name === 'count-exact');
  if (countCheck && !countCheck.ok) {
    try {
      const r = cp.spawnSync('node', [entry, sample, '--count'], { timeout: 30000, encoding: 'utf8' });
      if (r.status === 0 && String(r.stdout || '').trim() === String(exp.length)) {
        countCheck.ok = true;
        countCheck.detail = 'trailing-flag-ordering exit=0 got=' + exp.length;
      }
    } catch { /* keep original failure */ }
  }
} else {
  check('filter-exact', false, 'no sample log');
  check('count-exact', false, 'no sample log');
}

try {
  const r = cp.spawnSync('node', [entry, 'no_such_log_xyz_123.log'], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-file-exit3', r.status === 3, `exit=${r.status}`);
  check('missing-file-message', /^file not found/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }

try {
  const r = cp.spawnSync('node', [entry], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-arg-exit2', r.status === 2, `exit=${r.status}`);
  check('missing-arg-usage', /^usage/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-arg-behavior', false, String(e.message).slice(0, 200)); }

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
  console.log('VERIFY37: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
