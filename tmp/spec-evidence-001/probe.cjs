// Muse independent probe: SPECIFICATION-VERIFICATION-EVIDENCE-001.
// Method: read-only transpile of the ACTUAL NVIDIA-tree
// SpecificationVerificationTool.ts (SHA256 pinned below), loaded with stubbed
// service imports. No NVIDIA file modified, no network, no shell executed
// (executeTool stub records calls and returns canned results), fixtures live
// under the Muse worktree only.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');

const TOOL_PATH = 'D:\\Joe\\xelitesolutions\\api\\src\\modules\\tools\\definitions\\SpecificationVerificationTool.ts';
const EXPECTED_SHA256 = '0D1026E3807CD98D0574BD53E7BB2DD11A31994248D82024596FD857757982DD';
const TS_PATH = 'D:\\Joe\\muse-worktree\\api\\node_modules\\typescript\\lib\\typescript.js';
const FIX_ROOT = 'D:\\Joe\\muse-worktree\\tmp\\spec-evidence-001\\fix';

const results = { cases: [], toolCalls: [] };
const record = (id, question, observed, verdict) => {
  results.cases.push({ id, question, observed, verdict });
  console.log(`${verdict} ${id}: ${question} :: ${observed}`);
};

// 1. Pin the exact source under test.
const src = fs.readFileSync(TOOL_PATH, 'utf-8');
const sha = crypto.createHash('sha256').update(src).digest('hex').toUpperCase();
if (sha !== EXPECTED_SHA256) {
  console.log(`FATAL source drift: ${sha}`);
  process.exit(2);
}
console.log(`SOURCE_PIN_OK sha256=${sha} bytes=${src.length}`);

// 2. Transpile (syntax check included).
const ts = require(TS_PATH);
const js = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, allowSyntheticDefaultImports: true },
  reportDiagnostics: true,
  fileName: 'SpecificationVerificationTool.ts',
}).outputText;
console.log(`TRANSPILE_OK jsBytes=${js.length}`);

// 3. Stubbed service graph (source-faithful where noted).
const specStore = new Map(); // specificationId -> specMemory (global by ID, like LTM 404-407)
const stubs = {
  'types-stub': {},
  'toolservice-stub': {
    calls: [],
    async executeTool(name, args, ctx) {
      stubs['toolservice-stub'].calls.push({ name, args, ctxKeys: ctx ? Object.keys(ctx) : null });
      return { ok: true, output: 'stubbed green suite' };
    },
  },
  'workspace-stub': { root: null, getActiveRoot() { return this.root; } },
  'memory-stub': {
    async getSpecification(id) { return specStore.get(id) || null; }, // faithful: global by ID, no user check
    async storeSpecification() { throw new Error('probe never stores (mirrors zero production callers)'); },
  },
  'spec-types-stub': {},
};
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename === 'PROBE_TOOL.js') {
    if (request === '../types') return stubs['types-stub'];
    if (request === '../../services/ToolService') return stubs['toolservice-stub'];
    if (request === '../../services/WorkspaceService') return { workspaceService: stubs['workspace-stub'] };
    if (request === '../../../core/memory/long-term-memory') return { longTermMemory: stubs['memory-stub'] };
    if (request === '../../../core/intelligence/specification') return stubs['spec-types-stub'];
  }
  return origLoad.call(this, request, parent, isMain);
};
const toolMod = new Module('PROBE_TOOL.js', null);
toolMod.filename = 'PROBE_TOOL.js';
toolMod.paths = Module._nodeModulePaths(path.dirname(TOOL_PATH));
toolMod._compile(js, 'PROBE_TOOL.js');
const Tool = toolMod.exports.SpecificationVerificationTool;
const tool = new Tool();
console.log(`LOAD_OK name=${tool.name} permissions=${JSON.stringify(tool.permissions)} sideEffects=${JSON.stringify(tool.sideEffects)}`);

// 4. Fixtures (Muse worktree only).
const mk = (dir, files) => {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
};
const DIR_COMMENT = path.join(FIX_ROOT, 'proj-comment-only');
mk(DIR_COMMENT, {
  'src/calc.ts': '// calculator adds numbers and shows test results\nconst unrelated = 1;\n',
});
const DIR_REAL = path.join(FIX_ROOT, 'proj-real');
mk(DIR_REAL, {
  'src/calc.ts': 'export function calculatorAddNumbers(a: number, b: number): number { return a + b; }\n',
  'tests/calc.test.ts': "import { calculatorAddNumbers } from '../src/calc';\ntest('calculator adds numbers', () => { expect(calculatorAddNumbers(1, 2)).toBe(3); });\n",
});
const DIR_EVIL = path.join(FIX_ROOT, 'proj-evil');
mk(DIR_EVIL, {
  'src/calc.ts': 'export function calculatorAddNumbers(a: number, b: number): number { return a + b; }\n',
  'tests/calc.test.ts': "test('calculator adds numbers', () => { expect(1 + 2).toBe(3); });\n",
});
// Sibling-prefix trap: activeRoot = <fix>/ws, evil project = <fix>/ws-evil.
const DIR_WS = path.join(FIX_ROOT, 'ws');
const DIR_WS_EVIL = path.join(FIX_ROOT, 'ws-evil');
mk(DIR_WS_EVIL, {
  'src/calc.ts': 'export function calculatorAddNumbers(a: number, b: number): number { return a + b; }\n',
  'tests/calc.test.ts': "test('calculator adds numbers', () => { expect(1 + 2).toBe(3); });\n",
});
fs.mkdirSync(DIR_WS, { recursive: true });

const mem = (specificationId, userId, requirements, acceptanceCriteria) => ({
  specificationId, userId, sourceText: 'probe spec',
  requirements, constraints: [], implicitRequirements: [],
  acceptanceCriteria, constraintInteractions: [],
  metadata: { createdAt: Date.now() },
});
const REQ = (id, description, acceptanceCriteria) => ({ id, description, acceptanceCriteria });

(async () => {
  const execCalls = () => stubs['toolservice-stub'].calls;

  // N1: missing specification -> must fail closed.
  specStore.clear(); execCalls().length = 0;
  const n1 = await tool.execute({ specificationId: 'spec_missing', projectRoot: DIR_REAL, userId: 'u1' }, { userId: 'u1' });
  record('N1', 'missing spec returns ok=false not-found', `ok=${n1.ok} error=${n1.error}`, n1.ok === false ? 'PASS' : 'FAIL');

  // N2: empty requirements -> verified must be false.
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_empty', mem('spec_empty', 'u1', [], []));
  const n2 = await tool.execute({ specificationId: 'spec_empty', projectRoot: DIR_REAL, userId: 'u1' }, { userId: 'u1' });
  record('N2', 'empty requirements must not verify', `ok=${n2.ok} verified=${n2.output && n2.output.verified} coverage=${n2.output && n2.output.coverage}`,
    n2.output && n2.output.verified === false ? 'PASS' : 'FAIL');

  // N3: comment-only source, no criteria -> must not pass.
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_comment', mem('spec_comment', 'u1',
    [REQ('R1', 'Calculator adds numbers and shows test results', [])], []));
  const n3 = await tool.execute({ specificationId: 'spec_comment', projectRoot: DIR_COMMENT, userId: 'u1' }, { userId: 'u1' });
  const n3r = n3.output && n3.output.requirements[0];
  record('N3', 'comment-only source must not pass', `verified=${n3.output && n3.output.verified} pass=${n3r && n3r.pass} impl=${JSON.stringify(n3r && n3r.implementedIn)}`,
    n3r && n3r.pass === false ? 'PASS' : 'FAIL');

  // Workspace root valid for all cases except N5/N5b (which set their own).
  stubs['workspace-stub'].root = FIX_ROOT;

  // N4: dangling criterion -> must fail loudly, not skip.
  // Isolated: DIR_COMMENT has keyword-matching src but NO tests dir, so the
  // only question is whether AC_MISSING is silently skipped.
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_dangle', mem('spec_dangle', 'u1',
    [REQ('R1', 'Calculator adds numbers and shows test results', ['AC_MISSING'])], []));
  const n4 = await tool.execute({ specificationId: 'spec_dangle', projectRoot: DIR_COMMENT, userId: 'u1' }, { userId: 'u1' });
  const n4r = n4.output && n4.output.requirements[0];
  record('N4', 'dangling criterion must fail loudly', `pass=${n4r && n4r.pass} failedCriteria=${JSON.stringify(n4r && n4r.failedCriteria)}`,
    n4r && n4r.pass === false ? 'PASS' : 'FAIL');

  // N5: sibling-prefix workspace escape -> containment must reject.
  specStore.clear(); execCalls().length = 0;
  stubs['workspace-stub'].root = DIR_WS;
  specStore.set('spec_evil', mem('spec_evil', 'u1',
    [REQ('R1', 'Calculator adds numbers', [])],
    [{ id: 'AC1', description: 'criterion text nobody checks' }]));
  // give the requirement a criterion so runTests executes via the criterion path too
  specStore.get('spec_evil').requirements[0].acceptanceCriteria = ['AC1'];
  const n5 = await tool.execute({ specificationId: 'spec_evil', projectRoot: DIR_WS_EVIL, userId: 'u1' }, { userId: 'u1', sessionId: 's1', workspaceId: 'w1' });
  const shellCalls = execCalls().filter(c => c.name === 'shell_execute');
  record('N5', 'sibling-prefix projectRoot must not reach shell', `shellCalls=${shellCalls.length} cwd=${shellCalls[0] && shellCalls[0].args.cwd}`,
    shellCalls.length === 0 ? 'PASS' : 'FAIL');

  // N5b control: truly outside root -> rejected. Bounded small dir (never a drive root).
  const DIR_OUTSIDE = path.join('D:\\Joe\\muse-worktree\\tmp\\spec-evidence-001', 'outside');
  mk(DIR_OUTSIDE, {
    'src/calc.ts': 'export function calculatorAddNumbers(a: number, b: number): number { return a + b; }\n',
    'tests/calc.test.ts': "test('calculator adds numbers', () => { expect(1 + 2).toBe(3); });\n",
  });
  execCalls().length = 0;
  const n5b = await tool.execute({ specificationId: 'spec_evil', projectRoot: DIR_OUTSIDE, userId: 'u1' }, { userId: 'u1' });
  const shellCallsB = execCalls().filter(c => c.name === 'shell_execute');
  record('N5b', 'outside-root projectRoot rejected (control)', `shellCalls=${shellCallsB.length}`, shellCallsB.length === 0 ? 'PASS' : 'FAIL');

  // N6: trusted context dropped on criterion path?
  execCalls().length = 0;
  stubs['workspace-stub'].root = FIX_ROOT;
  const n6 = await tool.execute({ specificationId: 'spec_evil', projectRoot: DIR_REAL, userId: 'u1' }, { userId: 'u1', sessionId: 's1', workspaceId: 'w1' });
  const ctxs = execCalls().filter(c => c.name === 'shell_execute').map(c => c.ctxKeys);
  const dropped = ctxs.some(k => k === null);
  record('N6', 'criterion-path runTests keeps trusted context', `shellCtxKeys=${JSON.stringify(ctxs)}`, dropped ? 'FAIL' : 'PASS');

  // N7: foreign userId reads another user's spec?
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_alice', mem('spec_alice', 'alice', [REQ('R1', 'Calculator adds numbers', [])], []));
  const n7 = await tool.execute({ specificationId: 'spec_alice', projectRoot: DIR_REAL, userId: 'mallory' }, { userId: 'mallory' });
  record('N7', 'foreign userId must not verify another user spec', `ok=${n7.ok} verified=${n7.output && n7.output.verified}`,
    (n7.ok === false || (n7.output && n7.output.verified === false)) ? 'PASS' : 'FAIL');

  // P1 positive control: real impl + matching tests + green suite -> pass.
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_real', mem('spec_real', 'u1', [REQ('R1', 'Calculator adds numbers', [])], []));
  const p1 = await tool.execute({ specificationId: 'spec_real', projectRoot: DIR_REAL, userId: 'u1' }, { userId: 'u1' });
  const p1r = p1.output && p1.output.requirements[0];
  record('P1', 'real impl + tests + green suite passes (control)', `pass=${p1r && p1r.pass} verifiedBy=${JSON.stringify(p1r && p1r.verifiedBy)}`,
    p1r && p1r.pass === true ? 'PASS' : 'FAIL');

  // P2: requirement WITH criterion but NO test files -> fails (documents criterion/test coupling).
  specStore.clear(); execCalls().length = 0;
  specStore.set('spec_crit', mem('spec_crit', 'u1',
    [REQ('R1', 'Calculator adds numbers', ['AC1'])],
    [{ id: 'AC1', description: 'sums two integers' }]));
  const p2 = await tool.execute({ specificationId: 'spec_crit', projectRoot: DIR_COMMENT, userId: 'u1' }, { userId: 'u1' });
  const p2r = p2.output && p2.output.requirements[0];
  record('P2', 'criterion without tests fails (documents coupling)', `pass=${p2r && p2r.pass} failed=${JSON.stringify(p2r && p2r.failedCriteria)}`,
    p2r && p2r.pass === false ? 'PASS' : 'FAIL');

  const fails = results.cases.filter(c => c.verdict === 'FAIL').map(c => c.id);
  console.log(`SUMMARY pass=${results.cases.filter(c => c.verdict === 'PASS').length}/${results.cases.length} red=[${fails.join(',')}]`);
  fs.writeFileSync(path.join('D:\\Joe\\muse-worktree\\tmp\\spec-evidence-001', 'probe-results.json'), JSON.stringify({ sha, cases: results.cases }, null, 2));
  process.exit(0);
})().catch(e => { console.error('PROBE_ERROR', e); process.exit(1); });
