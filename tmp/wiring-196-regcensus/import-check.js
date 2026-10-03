// Static: identifiers imported by registry.ts vs identifiers referenced in the
// revivedTools/baseTools array region. Approximation only; EliteTools.* and
// type-only imports handled explicitly.
const fs = require('fs');
const src = fs.readFileSync('D:/Joe/muse-worktree/api/src/modules/tools/registry.ts', 'utf8');
const lines = src.split('\n');
// Array region: from revivedTools decl (line 138) to end of baseTools array (line ~339 '...revivedTools' + closing).
const startIdx = lines.findIndex((l) => l.includes('const revivedTools'));
const endMarker = lines.findIndex((l, i) => i > startIdx && /^\];/.test(l) && lines.slice(startIdx, i).join('\n').includes('...revivedTools'));
const arrayRegion = lines.slice(startIdx, endMarker + 1).join('\n');
const importRegion = lines.slice(0, startIdx).join('\n');
const imported = new Set();
for (const m of importRegion.matchAll(/import\s+(?:\*\s+as\s+(\w+)|\{([^}]*)\}|(\w+))\s+from/g)) {
  if (m[1]) imported.add(m[1]);
  if (m[2]) m[2].split(',').forEach((s) => { const n = s.trim().split(/\s+as\s+/).pop().trim(); if (n) imported.add(n); });
  if (m[3]) imported.add(m[3]);
}
const skip = new Set(['ToolDefinition', 'ToolPermission', 'EliteTools']);
const missing = [...imported].filter((n) => !skip.has(n) && !new RegExp('\\b' + n + '\\b').test(arrayRegion)).sort();
console.log('IMPORTED_IDENTIFIERS=' + imported.size);
console.log('IMPORTED_BUT_NOT_IN_ARRAYS_COUNT=' + missing.length);
console.log('IMPORTED_BUT_NOT_IN_ARRAYS=' + missing.join(','));
fs.writeFileSync('D:/Joe/muse-worktree/tmp/wiring-196-regcensus/imported-not-in-arrays.txt', missing.join('\n') + '\n');
// Reverse: EliteTools members used
const eliteUsed = [...arrayRegion.matchAll(/EliteTools\.(\w+)/g)].map((m) => m[1]);
console.log('ELITE_MEMBERS_USED_COUNT=' + new Set(eliteUsed).size);
