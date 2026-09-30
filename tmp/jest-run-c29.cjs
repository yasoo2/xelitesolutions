// Sandbox cwd arrives as \\?\ extended path which breaks jest/ts-jest
// drive-root walk-up. Normalize first, then run jest programmatically.
process.chdir('D:\\Joe\\muse-worktree\\api');
process.env.TEMP = 'D:\\Joe\\muse-worktree\\tmp\\sbx-tmp';
process.env.TMP = 'D:\\Joe\\muse-worktree\\tmp\\sbx-tmp';
process.env.TMPDIR = 'D:\\Joe\\muse-worktree\\tmp\\sbx-tmp';
console.log('cwd=', process.cwd());
const { run } = require('D:\\Joe\\muse-worktree\\api\\node_modules\\jest-cli\\build\\index.js');
const target = process.argv[2] || 'src/__tests__/self-fix-execution.test.ts';
run([target, '--silent'], 'D:\\Joe\\muse-worktree\\api')
  .then((res) => { const ok = !!(res && res.success); console.log('JEST_DONE ok=' + ok); process.exit(ok ? 0 : 1); })
  .catch((e) => { console.error('JEST_THROW ' + (e && e.message)); process.exit(2); });
