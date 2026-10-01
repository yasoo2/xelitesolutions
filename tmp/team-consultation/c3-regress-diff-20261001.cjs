const fs = require('fs');
function failedSet(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const s = new Set();
  for (const t of j.testResults) {
    const suite = String(t.name).split('__tests__').pop().replace(/\\/g, '/');
    for (const a of t.assertionResults) {
      if (a.status === 'failed') s.add(suite + ' :: ' + a.fullName);
    }
  }
  return s;
}
const d = 'D:/Joe/muse-worktree/tmp/team-consultation/';
const base = failedSet(d + 'c3-535-regress.json');
const c3 = failedSet(d + 'c3-7812-regress.json');
const fixed = [...base].filter(x => !c3.has(x));
const broken = [...c3].filter(x => !base.has(x));
const still = [...base].filter(x => c3.has(x));
console.log('BASE535-FAILED: ' + base.size + '  C3FAILED: ' + c3.size);
console.log('FIXED-BY-7812: ' + fixed.length);
fixed.forEach(x => console.log('  FIXED: ' + x));
console.log('BROKEN-BY-7812: ' + broken.length);
broken.forEach(x => console.log('  BROKEN: ' + x));
console.log('STILL-FAILING-BOTH: ' + still.length);
still.forEach(x => console.log('  STILL: ' + x));
fs.writeFileSync(d + 'c3-regress-attribution-20261001.json', JSON.stringify({ fixed, broken, still }, null, 1));
