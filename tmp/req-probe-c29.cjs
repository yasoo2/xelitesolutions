const path = require('path');
const out = { node: process.version, cwd: process.cwd() };
try {
  out.absResolve = require.resolve('D:/Joe/muse-worktree/api/node_modules/typescript/lib/typescript.js');
} catch (e) { out.absResolve = 'FAIL:' + e.message; }
try {
  out.bareResolve = require.resolve('typescript', { paths: ['D:/Joe/muse-worktree/api'] });
} catch (e) { out.bareResolve = 'FAIL:' + e.message; }
try {
  out.selfResolve = require.resolve('typescript');
} catch (e) { out.selfResolve = 'FAIL:' + e.message; }
console.log(JSON.stringify(out, null, 2));
