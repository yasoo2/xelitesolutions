// Independent verification for CRITICAL-REAL-JOE-UI-001 run44 (wordwrap, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Builds OWN fixture TXT files and checks wrap/error behavior INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run44';
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
  const hits = findFiles(ROOT, (n) => /^wordwrap.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /wordwrap/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh wordwrap entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

function runTool(args) {
  return cp.spawnSync('node', [entry].concat(args), { timeout: 30000, encoding: 'utf8' });
}
function outLines(r) {
  const got = String(r.stdout || '').split('\n');
  if (got.length && got[got.length - 1] === '') got.pop();
  return got.map((l) => l.replace(/\r$/, ''));
}

// Own deterministic fixtures (independent of Joe's samples).
const fixTxt = RUN + '/verify-sample.txt';
fs.writeFileSync(fixTxt, 'alpha beta gamma delta\r\n\r\nsupercalifragilistic\r\n');
const fixWide = RUN + '/verify-wide.txt';
fs.writeFileSync(fixWide, 'one two three four five six\n');

try {
  const r = runTool([fixTxt, '--width', '10']);
  const got = outLines(r);
  const exp = ['alpha beta', 'gamma', 'delta', '', 'supercalif', 'ragilistic'];
  check('wrap-blank-overlong', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
    `exit=${r.status} got=${JSON.stringify(got).slice(0, 260)}`);
} catch (e) { check('wrap-blank-overlong', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }

try {
  const r = runTool([fixWide, '--width', '9']);
  const got = outLines(r);
  check('width-flag', r.status === 0 && JSON.stringify(got) === JSON.stringify(['one two', 'three', 'four five', 'six']),
    `exit=${r.status} got=${JSON.stringify(got).slice(0, 260)}`);
} catch (e) { check('width-flag', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([fixWide]);
  const got = outLines(r);
  check('default-width-40', r.status === 0 && got.length === 1 && got[0] === 'one two three four five six',
    `exit=${r.status} got=${JSON.stringify(got).slice(0, 260)}`);
} catch (e) { check('default-width-40', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool(['no_such_file_xyz_123.txt']);
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-file-exit3', r.status === 3, `exit=${r.status}`);
  check('missing-file-message', /^file not found/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([]);
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-args-exit2', r.status === 2, `exit=${r.status}`);
  check('missing-args-message', /^invalid arguments/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-args-behavior', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([fixWide, '--width', '0']);
  check('zero-width-exit2', r.status === 2, `exit=${r.status}`);
} catch (e) { check('zero-width-exit2', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([fixWide, '--width', 'abc']);
  check('nan-width-exit2', r.status === 2, `exit=${r.status}`);
} catch (e) { check('nan-width-exit2', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([fixWide, '--width']);
  check('width-novalue-exit2', r.status === 2, `exit=${r.status}`);
} catch (e) { check('width-novalue-exit2', false, String(e.message).slice(0, 200)); }

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
  console.log('VERIFY44: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
