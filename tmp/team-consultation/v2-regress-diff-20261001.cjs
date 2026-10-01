const fs = require('fs');
function failedSet(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const s = new Set();
  for (const t of j.testResults) {
    const suite = String(t.name).split('__tests__').pop();
    for (const a of t.assertionResults) {
      if (a.status === 'failed') s.add(suite + ' :: ' + a.fullName);
    }
  }
  return s;
}
const d = 'D:/Joe/muse-worktree/tmp/team-consultation/';
const base = failedSet(d + 'v2-base7832-regress.json');
const v2 = failedSet(d + 'v2-pristine-regress.json');
const fixed = [...base].filter(x => !v2.has(x));
const broken = [...v2].filter(x => !base.has(x));
console.log('BASE-ONLY-FAILED (fixed by v2): ' + fixed.length);
fixed.forEach(x => console.log('  FIXED: ' + x));
console.log('V2-ONLY-FAILED (newly broken by v2): ' + broken.length);
broken.forEach(x => console.log('  BROKEN: ' + x));
console.log('STILL-FAILING-BOTH: ' + [...base].filter(x => v2.has(x)).length);
fs.writeFileSync(d + 'v2-regress-attribution-20261001.json', JSON.stringify({ fixed, broken, stillFailing: base.size - fixed.length }, null, 1));
