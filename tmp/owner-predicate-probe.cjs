// Independent check of the 35bf42dd workspace-containment predicate shape.
// Replicates ONLY the path logic (realpathSync + path.relative + .. guard)
// against synthetic dirs under this workspace. No Joe source touched.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const base = fs.mkdtempSync(path.join(process.cwd(), 'tmp', 'owner-pred-'));
const root = path.join(base, 'ws');
const inside = path.join(root, 'proj');
const outside = path.join(base, 'other', 'proj');
fs.mkdirSync(inside, { recursive: true });
fs.mkdirSync(outside, { recursive: true });
let link = null;
try {
  link = path.join(root, 'link-escape');
  fs.symlinkSync(outside, link, 'dir');
} catch { link = null; }

function contained(rootDir, dir) {
  try {
    const r = fs.realpathSync(rootDir);
    const t = fs.realpathSync(dir);
    const rel = path.relative(r, t);
    if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return false;
    return true;
  } catch { return false; }
}

const cases = [
  ['inside-project', contained(root, inside), true],
  ['outside-project', contained(root, outside), false],
  ['root-itself', contained(root, root), true],
  ['missing-dir', contained(root, path.join(root, 'nope')), false],
];
if (link) cases.push(['symlink-escape', contained(root, link), false]);

let fail = 0;
for (const [name, got, want] of cases) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got=${got} want=${want}`);
}
// Case-insensitivity note (Windows): realpathSync normalizes; drive-letter
// difference yields absolute relative -> rejected. Demonstrate:
console.log('INFO relative(root,root)=' + JSON.stringify(path.relative(fs.realpathSync(root), fs.realpathSync(root))));
fs.rmSync(base, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
