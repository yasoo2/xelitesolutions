// callers42.mjs — checkpoint 42 probe B: who calls PlanningEngine.generatePlan and with what context keys (static).
import fs from 'fs';
import path from 'path';
const TREES = { MUSE: 'D:/Joe/muse-worktree/api/src', MAIN: 'D:/Joe/xelitesolutions/api/src' };
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js)$/.test(e.name)) out.push(p);
  }
  return out;
}
for (const [name, root] of Object.entries(TREES)) {
  console.log(`=== ${name} ===`);
  for (const f of walk(root)) {
    const rel = path.relative(root, f);
    if (/PlanningEngine\.ts$/.test(rel)) continue;
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((ln, i) => {
      if (/generatePlan\s*\(/.test(ln) && !/^\s*(\/\/|\*)/.test(ln)) {
        console.log(`${rel}:${i + 1}: ${ln.trim().slice(0, 160)}`);
        for (let k = 1; k <= 6 && i + k < lines.length; k++) {
          const c = lines[i + k].trim().slice(0, 160);
          console.log(`    +${k}: ${c}`);
          if (/\)\s*;?\s*$/.test(lines[i + k]) && /\)/.test(c)) break;
        }
      }
    });
  }
}
