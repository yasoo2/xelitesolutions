// MUSE independent fallback-cwd probe (review evidence for WINDOWS-FALLBACK-CWD-001).
// Uses ONLY the Muse worktree source. Faults node-pty availability in this own
// process (executionEngine.pty=null); no live worker/API/process/module touched.
// Fixtures live under this probe directory. No secrets, no network, no provider.
const fs = require('fs'), path = require('path');
const candidate = 'D:/Joe/muse-worktree/api';
process.env.JWT_SECRET = 'test-only-secret-not-used-anywhere-else';
process.env.NODE_ENV = 'test';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
require(candidate + '/node_modules/ts-node').register({ transpileOnly: true, project: candidate + '/tsconfig.json' });
const { executionEngine } = require(candidate + '/src/kernel/ExecutionEngine');
const { ExecutionGateway } = require(candidate + '/src/kernel/ExecutionGateway');
const { executionFirewall } = require(candidate + '/src/orchestration/AgentExecutionFirewall');

const naturalPty = executionEngine.pty ? 'native-available' : 'natural-fallback';
executionEngine.pty = null; // availability fault, own process only

const fixtureRoot = path.join(__dirname, 'fixtures');
fs.mkdirSync(fixtureRoot, { recursive: true });

(async () => {
  const results = [];
  const open = async (cwd) => executionFirewall.runInContext(undefined, () => ExecutionGateway.execute({
    id: 'muse-fallback-probe', type: 'pty', priority: 'normal',
    payload: { options: { cwd, sessionId: 'muse-fallback-probe' } }
  }));
  const observe = async (cwd, commands = []) => {
    const result = await open(cwd);
    if (!result.success || !result.data) return { sessionOpened: false, error: result.error };
    const session = result.data;
    let output = '';
    session.onData((data) => { output += data; });
    try {
      for (const command of commands) await session.write(command + '\r');
      await session.write('node -e "console.log(\'MUSE_FALLBACK_CWD=\'+process.cwd())"\r');
      const actual = output.match(/(?:^|\$ )MUSE_FALLBACK_CWD=([^\r\n]+)/m)?.[1];
      return { sessionOpened: true, fallback: session.fallback === true, actual, output };
    } finally { session.kill(); }
  };

  // Case 1: plain initial cwd (control — must match).
  {
    const root = fs.mkdtempSync(path.join(fixtureRoot, 'plain-'));
    const o = await observe(root);
    results.push({ case: 'plain-initial', root, expected: root, actual: o.actual, match: !!o.actual && o.actual.toLowerCase() === root.toLowerCase(), sessionOpened: o.sessionOpened });
  }
  // Case 2: extended initial cwd (defect witness — expect mismatch pre-fix).
  {
    const root = fs.mkdtempSync(path.join(fixtureRoot, 'extended-'));
    const o = await observe('\\\\?\\' + root);
    results.push({ case: 'extended-initial', root, requested: '\\\\?\\' + root, actual: o.actual, match: !!o.actual && o.actual.toLowerCase() === root.toLowerCase(), sessionOpened: o.sessionOpened });
  }
  // Case 3: plain initial then cd to extended (defect witness — expect mismatch pre-fix).
  {
    const root = fs.mkdtempSync(path.join(fixtureRoot, 'cdext-'));
    const child = path.join(root, 'child'); fs.mkdirSync(child);
    const o = await observe(root, ['cd \\\\?\\' + child]);
    results.push({ case: 'cd-extended', root: child, actual: o.actual, match: !!o.actual && o.actual.toLowerCase() === child.toLowerCase(), sessionOpened: o.sessionOpened });
  }
  // Case 4: missing initial cwd (defect witness — currently opens successfully).
  {
    const missing = path.join(fixtureRoot, 'does-not-exist-' + Date.now());
    const o = await observe(missing);
    results.push({ case: 'missing-initial', requested: missing, sessionOpened: o.sessionOpened, error: o.error || null, note: 'pre-fix code returns a session; proposal requires success=false' });
  }
  // Case 5: invalid cd retains prior cwd + observable error (control).
  {
    const root = fs.mkdtempSync(path.join(fixtureRoot, 'badcd-'));
    const o = await observe(root, ['cd missing-dir-xyz']);
    results.push({ case: 'invalid-cd', root, actual: o.actual, match: !!o.actual && o.actual.toLowerCase() === root.toLowerCase(), errorVisible: /cd: no such directory/.test(o.output || '') });
  }

  const summary = { tree: 'muse-worktree', naturalPty, fault: 'executionEngine.pty=null (own process)', results };
  fs.writeFileSync(path.join(__dirname, 'muse-fallback-result.json'), JSON.stringify(summary, null, 2));
  for (const r of results) console.log(JSON.stringify({ case: r.case, sessionOpened: r.sessionOpened, match: r.match, actual: r.actual, error: r.error || undefined, errorVisible: r.errorVisible }));
  console.log('naturalPty=' + naturalPty);
})().catch((error) => { console.error('PROBE_ERROR ' + (error && error.message)); process.exitCode = 2; });
