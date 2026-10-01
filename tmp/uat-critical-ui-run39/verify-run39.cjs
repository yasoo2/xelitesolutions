// Independent verification for CRITICAL-REAL-JOE-UI-001 run39 (inisection, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Executes the REAL tool binary and recomputes the section extraction INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run39';
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
  const hits = findFiles(ROOT, (n) => /^inisection.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /inisection/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh inisection entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Sample INI: a .ini/.txt/.cfg file near the entry with >= 3 sections and >= 12 non-empty lines.
function parseSections(text) {
  const sections = [];
  let cur = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const m = /^\[(.+)\]$/.exec(line);
    if (m) { cur = { name: m[1].trim(), kvs: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue;
    if (line.includes('=')) cur.kvs.push(raw.trim());
  }
  return sections;
}
let sample = null, sampleSections = [];
const nearFiles = findFiles(dir, (n) => /\.(ini|txt|cfg)$/i.test(n), [], 2);
for (const f of nearFiles) {
  try {
    const text = fs.readFileSync(f, 'utf8');
    const nonEmpty = text.split('\n').filter((l) => l.trim() !== '');
    if (nonEmpty.length < 12) continue;
    const secs = parseSections(text);
    if (secs.length >= 3 && secs[0].kvs.length >= 1) { sample = f; sampleSections = secs; break; }
  } catch { /* ignore */ }
}
check('sample-ini-3sections-12lines', !!sample, sample || 'none found near ' + dir);

if (sample) {
  const target = sampleSections[0];
  try {
    const r = cp.spawnSync('node', [entry, target.name, sample], { timeout: 30000, encoding: 'utf8' });
    const got = String(r.stdout || '').split('\n');
    if (got.length && got[got.length - 1] === '') got.pop();
    check('section-extract-exact', r.status === 0 && JSON.stringify(got) === JSON.stringify(target.kvs),
      `exit=${r.status} section=${target.name} gotN=${got.length} expN=${target.kvs.length} got=${JSON.stringify(got).slice(0, 200)}`);
  } catch (e) { check('section-extract-exact', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
} else {
  check('section-extract-exact', false, 'no sample ini');
}

try {
  const r = cp.spawnSync('node', [entry, 'anysection', 'no_such_ini_xyz_123.ini'], { timeout: 30000, encoding: 'utf8' });
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
  console.log('VERIFY39: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
