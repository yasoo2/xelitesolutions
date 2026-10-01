const fs = require('fs');
const D = 'D:/Joe/muse-worktree/tmp/wiring-audit/fx-entry45/';
const rt = new Set(JSON.parse(fs.readFileSync(D + 'entry45_RUNTIME.json', 'utf8')).names);
const st = new Set(JSON.parse(fs.readFileSync(D + 'entry45_MUSE.json', 'utf8')).selectedNames);
const onlyRt = [...rt].filter((n) => !st.has(n)).sort();
const onlySt = [...st].filter((n) => !rt.has(n)).sort();
console.log('ONLY_RUNTIME(' + onlyRt.length + '):' + JSON.stringify(onlyRt));
console.log('ONLY_STATIC(' + onlySt.length + '):' + JSON.stringify(onlySt));
fs.writeFileSync(D + 'entry45_GAP.json', JSON.stringify({ onlyRuntime: onlyRt, onlyStatic: onlySt }, null, 1));
