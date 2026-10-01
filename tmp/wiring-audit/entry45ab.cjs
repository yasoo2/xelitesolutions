const fs = require('fs');
const D = 'D:/Joe/muse-worktree/tmp/wiring-audit/fx-entry45/';
const a = new Set(JSON.parse(fs.readFileSync(D + 'entry45_MUSE.json', 'utf8')).selectedNames);
const b = new Set(JSON.parse(fs.readFileSync(D + 'entry45_MAIN.json', 'utf8')).selectedNames);
console.log('MAIN-ONLY:' + JSON.stringify([...b].filter((n) => !a.has(n))));
console.log('MUSE-ONLY:' + JSON.stringify([...a].filter((n) => !b.has(n))));
