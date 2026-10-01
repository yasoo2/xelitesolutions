const { execFileSync } = require('child_process');
const crypto = require('crypto');
const repo = 'C:/Users/home/.codex/worktrees/requested-action-transfer/xelitesolutions';
const env = { ...process.env, GIT_CONFIG_GLOBAL: 'D:/Joe/muse-worktree/tmp/sbx-gitconfig' };
function blobSha(rev, path) {
  const buf = execFileSync('git', ['-c', 'safe.directory=' + repo, '-C', repo, 'cat-file', '-p', rev + ':' + path], { env, maxBuffer: 64 * 1024 * 1024 });
  return crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
}
const p = 'api/src/__tests__/requested-action-authority.test.ts';
console.log('blob@166bea99', blobSha('166bea990d7534c535f82a901554ad2d13d9c780', p));
console.log('blob@7832da83 ', blobSha('7832da833833cea708144e3f5aacc1a2088830aa', p));
console.log('manifest     ', '1EF071C440704CA8D3F5784B0F9D5EF39FC012548D7C9AB31B34AC0EA871BDAB');
console.log('worktree     ', 'EDC2E4C33CF7AF55FE69ABE13719FF75387E2621FDB5235F7409D1FEB0903161');
