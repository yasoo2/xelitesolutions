// Independent verification for CRITICAL-REAL-JOE-UI-001 run45 (palin, fresh unseen prompt).
// Searches the run-local projects root (where the :5101 API writes) plus workspace roots.
// Executes the REAL tool binary and recomputes palindrome verdicts INDEPENDENTLY.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RUN = 'D:/Joe/muse-worktree/tmp/uat-critical-ui-run45';
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
  const hits = findFiles(ROOT, (n) => /^palin.*\.(js|mjs|cjs)$/.test(n), [], 0).filter(fresh);
  const dirHits = findFiles(ROOT, (n, p) => /^(index|main|app)\.(cjs|mjs|js)$/.test(n) && /palin/i.test(path.dirname(p)), [], 0).filter(fresh);
  for (const h of hits.concat(dirHits)) if (!cands.includes(h)) cands.push(h);
}
const entries = cands.filter((p) => !/test|spec/i.test(path.basename(p)));
check('entry-exists', entries.length > 0, (entries.join(';') || cands.join(';')) || 'no fresh palin entry');
if (!entries.length) { finish(); }

const entry = entries.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const dir = path.dirname(entry);

// Independent palindrome model.
function verdict(phrase, ignoreCase, ignoreSpaces) {
  let s = phrase;
  if (ignoreSpaces) s = s.replace(/\s/g, '');
  if (ignoreCase) s = s.toLowerCase();
  return s === s.split('').reverse().join('') ? 'yes' : 'no';
}
function fmt(phrase, v) { return `${phrase} -> ${v}`; }
function linesOf(f) { return fs.readFileSync(f, 'utf8').split(/\r?\n/); }

let sample = null, sampleLines = [];
const nearFiles = findFiles(dir, (n) => /\.txt$/i.test(n), [], 2);
for (const f of nearFiles) {
  try {
    let ls = linesOf(f);
    if (ls.length && ls[ls.length - 1] === '') ls.pop();
    if (ls.length < 12) continue;
    const content = ls.filter((l) => l.trim() !== '');
    const vs = content.map((l) => verdict(l, false, false));
    if (!vs.includes('yes') || !vs.includes('no')) continue;
    if (!ls.some((l) => l.trim() === '')) continue;
    const tricky = content.filter((l) => verdict(l, false, false) !== verdict(l, true, true));
    if (tricky.length < 2) continue;
    sample = f; sampleLines = ls; break;
  } catch { /* ignore */ }
}
check('sample-12lines-varied', !!sample, sample ? `${sample} n=${sampleLines.length}` : 'none found near ' + dir);

function expected(lines, ignoreCase, ignoreSpaces, filter) {
  const out = [];
  for (const l of lines) {
    if (l.trim() === '') continue;
    const v = verdict(l, ignoreCase, ignoreSpaces);
    if (filter === 'yes' && v !== 'yes') continue;
    if (filter === 'no' && v !== 'no') continue;
    out.push(fmt(l, v));
  }
  return out;
}
function runTool(args) {
  return cp.spawnSync('node', [entry].concat(args), { timeout: 30000, encoding: 'utf8' });
}
function outLines(r) {
  const got = String(r.stdout || '').split('\n');
  if (got.length && got[got.length - 1] === '') got.pop();
  return got;
}

if (sample) {
  try {
    const r = runTool([sample]);
    const got = outLines(r), exp = expected(sampleLines, false, false, null);
    check('default-verdicts', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length} got=${JSON.stringify(got).slice(0, 240)}`);
  } catch (e) { check('default-verdicts', false, 'exec-fail: ' + String(e.message).slice(0, 200)); }
  try {
    const r = runTool([sample, '--ignore-case']);
    const got = outLines(r), exp = expected(sampleLines, true, false, null);
    check('ignore-case-flag', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length}`);
  } catch (e) { check('ignore-case-flag', false, String(e.message).slice(0, 200)); }
  try {
    const r = runTool([sample, '--ignore-spaces']);
    const got = outLines(r), exp = expected(sampleLines, false, true, null);
    check('ignore-spaces-flag', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length}`);
  } catch (e) { check('ignore-spaces-flag', false, String(e.message).slice(0, 200)); }
  try {
    const r = runTool([sample, '--ignore-case', '--ignore-spaces']);
    const got = outLines(r), exp = expected(sampleLines, true, true, null);
    check('combined-flags', r.status === 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length}`);
  } catch (e) { check('combined-flags', false, String(e.message).slice(0, 200)); }
  try {
    const r = runTool([sample, '--yes-only']);
    const got = outLines(r), exp = expected(sampleLines, false, false, 'yes');
    check('yes-only-flag', r.status === 0 && exp.length > 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length}`);
  } catch (e) { check('yes-only-flag', false, String(e.message).slice(0, 200)); }
  try {
    const r = runTool([sample, '--no-only']);
    const got = outLines(r), exp = expected(sampleLines, false, false, 'no');
    check('no-only-flag', r.status === 0 && exp.length > 0 && JSON.stringify(got) === JSON.stringify(exp),
      `exit=${r.status} gotN=${got.length} expN=${exp.length}`);
  } catch (e) { check('no-only-flag', false, String(e.message).slice(0, 200)); }
} else {
  for (const n of ['default-verdicts', 'ignore-case-flag', 'ignore-spaces-flag', 'combined-flags', 'yes-only-flag', 'no-only-flag'])
    check(n, false, 'no sample txt');
}

try {
  const r = runTool(['no_such_txt_xyz_123.txt']);
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('missing-file-exit3', r.status === 3, `exit=${r.status}`);
  check('missing-file-message', /^file not found/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('missing-file-behavior', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([sample || 'dummy.txt', '--yes-only', '--no-only']);
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('both-filters-exit2', r.status === 2, `exit=${r.status}`);
  check('both-filters-message', /^invalid arguments/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('both-filters-behavior', false, String(e.message).slice(0, 200)); }

try {
  const r = runTool([sample || 'dummy.txt', '--bogus-flag']);
  const txt = String(r.stdout || '') + '\n' + String(r.stderr || '');
  check('unknown-flag-exit2', r.status === 2, `exit=${r.status}`);
  check('unknown-flag-message', /^invalid arguments/im.test(txt), txt.trim().slice(0, 160));
} catch (e) { check('unknown-flag-behavior', false, String(e.message).slice(0, 200)); }

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
  console.log('VERIFY45: ' + fails + ' FAILURES');
  process.exit(fails ? 1 : 0);
}
finish();
