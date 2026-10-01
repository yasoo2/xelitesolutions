// Independent verification for CRITICAL-REAL-JOE-UI-001 run40 (jsonkeys, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Executes the REAL tool binary and recomputes the key listing INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run40';
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
  const hits = findFiles(ROOT, (n) => /^jsonkeys.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /jsonkeys/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh jsonkeys entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample JSON: a .json file near the entry with >= 6 top-level keys incl. a nested object and an array.
let sample = null, sampleKeys = [];
const nearFiles = findFiles(dir, (n) => /\.json$/i.test(n) && n !== 'package.json', [], 2);
for (const f of nearFiles) {
  try {
    const obj = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) continue;
    const keys = Object.keys(obj);
    if (keys.length < 6) continue;
    const vals = keys.map((k) => obj[k]);
    const hasObj = vals.some((v) => v && typeof v === 'object' && !Array.isArray(v));
    const hasArr = vals.some((v) => Array.isArray(v));
    if (hasObj && hasArr) { sample = f; sampleKeys = keys.slice().sort(); break; }
  } catch { /* ignore */ }
}
check('sample-json-6keys-nested', !!sample, sample ? `${sample} keys=${sampleKeys.length}` : 'none found near ' + dir);

if (sample) {
  try {
    const r = cp.spawnSync('node', [entry, sample], { timeout: 30000, encoding: 'utf8' });
    const got = String(r.stdout || '').split('\n');
    if (got.length && got[got.length - 1] === '') got.pop();
    check('key-list-exact', r.status === 0 && JSON.stringify(got) === JSON.stringify(sampleKeys),
      `exit=${r.status} gotN=${got.length} expN=${sampleKeys.length} got=${JSON.stringify(got).slice(0, 200)}`);
  } catch (e) { check('key-list-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = cp.spawnSync('node', [entry, '--count', sample], { timeout: 30000, encoding: 'utf8' });
    check('count-mode', r.status === 0 && String(r.stdout || '').trim() === String(sampleKeys.length),
      `exit=${r.status} out=${String(r.stdout || '').trim().slice(0, 60)} exp=${sampleKeys.length}`);
  } catch (e) { check('count-mode', false, String(e.message).slice(0, 200)); }
} else {
  check('key-list-exact', false, 'no sample json');
  check('count-mode', false, 'no sample json');
}

try {
  const r = cp.spawnSync('node', [entry, 'no_such_json_xyz_123.json'], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-file-exit3', r.status === 3, `exit=${r.status}`);
  check('missing-file-message', /^file not found/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }

try {
  const badPath = path.join(dir, 'verify40-invalid-tmp.json');
  fs.writeFileSync(badPath, '{ this is not valid json,,,');
  const r = cp.spawnSync('node', [entry, badPath], { timeout: 30000, encoding: 'utf8' });
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('invalid-json-exit2', r.status === 2, `exit=${r.status}`);
  check('invalid-json-message', /^invalid json/im.test(txt), txt.trim().slice(0, 160));
  try { fs.unlinkSync(badPath); } catch { /* keep */ }
} catch (e) { check('invalid-json-behavior', false, String(e.message).slice(0, 200)); }

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
  console.log('VERIFY40: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
