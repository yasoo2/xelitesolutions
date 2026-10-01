const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const ts = require('D:/Joe/muse-worktree/api/node_modules/typescript');
const file = 'D:/Joe/muse-worktree/web/src/utils/redactUrl.ts';
const source = fs.readFileSync(file, 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const sandbox = { exports: {}, URL };
vm.runInNewContext(compiled.outputText, sandbox, { timeout: 1000 });
const redact = sandbox.exports.redactCredentialsFromUrl;
const fake = 'SYNTHETIC_CREDENTIAL_ONLY';
const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJzeW50aGV0aWMifQ.c3ludGhldGljc2lnbmF0dXJl';
const cases = [
  ['token query', `wss://example.invalid/stream?token=${fake}&sessionId=public`, x => !x.includes(fake) && x.includes('sessionId=public')],
  ['credential name affix', `https://example.invalid/?X_ACCESS_TOKEN=${fake}`, x => !x.includes(fake)],
  ['username token', `https://${fake}@example.invalid/`, x => !x.includes(fake)],
  ['username and password', `https://user:${fake}@example.invalid/`, x => !x.includes(fake) && !x.includes('user:')],
  ['fragment credential', `https://example.invalid/#auth=${fake}&tab=public`, x => !x.includes(fake) && x.includes('tab=public')],
  ['unknown query JWT', `https://example.invalid/?opaque=${jwt}`, x => !x.includes(jwt)],
  ['relative credential fallback', `/stream?api_key=${fake}`, x => !x.includes(fake)],
  ['protocol relative userinfo', `//${fake}@example.invalid/`, x => !x.includes(fake)],
  ['benign URL', 'https://example.invalid/?sessionId=public', x => x === 'https://example.invalid/?sessionId=public'],
  ['bare email', 'name@example.invalid', x => x === 'name@example.invalid'],
  ['nonstring fail closed', null, x => x === '[redacted]'],
  ['encoded credential parameter name', `https://example.invalid/?%74oken=${fake}`, x => !x.includes(fake)],
  ['percent-encoded JWT unknown parameter', `https://example.invalid/?opaque=%65${jwt.slice(1)}`, x => !decodeURIComponent(x).includes(jwt)],
];
const results = cases.map(([name, input, check]) => ({ name, passed: check(redact(input)) }));
const report = { sourceFile: file, sha256: crypto.createHash('sha256').update(source).digest('hex'), scope: 'Actual existing Muse helper, synthetic inputs only; no network, UI, source mutation or integration', results, passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length };
fs.writeFileSync(__dirname + '/codex-existing-redactor-results.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failed ? 1 : 0;
