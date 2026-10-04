// Tool-name uniqueness check on exact f40 bytes.
const fs = require('fs');
const path = require('path');
const D = path.join(__dirname, 'f40', 'api', 'src', 'modules', 'tools', 'definitions');
const names = {};
for (const f of fs.readdirSync(D)) {
  if (!f.endsWith('.ts')) continue;
  const src = fs.readFileSync(path.join(D, f), 'utf8');
  const blocks = src.split(/^(?=export\s+(?:default\s+)?(?:class|const)\s+[A-Za-z0-9_]+|(?:class|function|interface|type|let|var|const)\s+[A-Za-z0-9_]+)/gm);
  for (const b of blocks) {
    const hm = b.match(/^export\s+(?:default\s+)?(?:class|const)\s+([A-Za-z0-9_]+)/);
    if (!hm) continue;
    const nm = b.match(/^[ \t]*(?:readonly\s+)?name\s*[:=]\s*['"`]([^'"`]+)['"`]/m);
    const ex = /^[ \t]*(?:async\s+)?execute\s*\(|execute\s*:\s*(?:async\s*)?\(/m.test(b);
    if (nm && ex) {
      const n = nm[1];
      (names[n] = names[n] || []).push(hm[1] + '@' + f);
    }
  }
}
names['recall_memory'] = (names['recall_memory'] || []).concat(['MemoryTools(member)@MemoryTool.ts']);
names['memorize_codebase'] = (names['memorize_codebase'] || []).concat(['MemoryTools(member)@MemoryTool.ts']);
const dups = Object.entries(names).filter(([, v]) => v.length > 1);
console.log('UNIQUE_TOOL_NAMES=' + Object.keys(names).length);
if (dups.length) { console.log('DUPS:'); for (const [n, s] of dups) console.log(' - ' + n + ': ' + s.join(' / ')); }
else console.log('DUPLICATE_TOOL_NAMES=0');
