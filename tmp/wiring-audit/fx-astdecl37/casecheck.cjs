const fs = require('fs');
const dir = 'D:/Joe/muse-worktree/api/src/modules/tools/definitions';
for (const flags of ['g', 'gi']) {
  const rx = new RegExp("name\\s*[:=]\\s*'([a-z0-9_]+)'", flags);
  const all = new Set();
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const src = fs.readFileSync(dir + '/' + f, 'utf8');
    let m; rx.lastIndex = 0;
    while ((m = rx.exec(src))) all.add(m[1]);
  }
  console.log(flags, 'distinct=' + all.size);
}
