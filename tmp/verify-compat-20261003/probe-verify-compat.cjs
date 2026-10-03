// Cycle-217 verification-compatibility probe (Muse lane, CRITICAL wiring audit).
// Static only: compares candidate tool output contracts (c216 contracts.json)
// against the verification-layer consumer contracts on exact Muse HEAD bytes.
// Nothing is executed. Deterministic: sorted keys, no timestamps.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = 'D:/Joe/muse-worktree';
const OUT_DIR = path.join(ROOT, 'tmp/verify-compat-20261003');
const CONTRACTS = path.join(ROOT, 'tmp/contract-introspect-20261003/contracts.json');

const VERIFIER_FILES = [
  'api/src/core/quality/verification-ledger.ts',
  'api/src/modules/tools/definitions/PhaseExecutorTool.ts',
  'api/src/core/orchestrator/plan-tools.ts',
  'api/src/modules/tools/definitions/AutoTesterTool.ts',
];

// Fields verificationResultFromToolResult reads (ledger.ts:652-665, byte-asserted below).
const MAPPER_FIELDS = ['ok', 'status', 'error', 'stderr', 'verificationFailed', 'cancelled', 'timedOut'];
const PASS_STATUS_VOCAB = ['completed', 'passed', 'success', 'succeeded', 'ok'];
const FAIL_STATUS_VOCAB = ['failed', 'error', 'partial', 'incomplete', 'blocked', 'fatal_error'];

function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function fail(msg) { console.error('PROBE_FAIL: ' + msg); process.exitCode = 1; }

const contracts = JSON.parse(fs.readFileSync(CONTRACTS, 'utf8'));
const list = contracts.rows || []; // c216 shape: {museHead, method, rows:[...]}
if (!list.length) fail('no tool rows in contracts.json');

const sources = {};
for (const f of VERIFIER_FILES) {
  sources[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
}
const ledger = sources['api/src/core/quality/verification-ledger.ts'];

// 1. Extract gate set from the isVerificationTool literal (ledger.ts ~735-739).
const gateMatch = ledger.match(/if \(new Set\(\[([\s\S]*?)\]\)\.has\(name\)\) return true;/);
if (!gateMatch) fail('gate-set literal not found');
const gateSet = Array.from(gateMatch ? gateMatch[1].matchAll(/'([a-z0-9_]+)'/g) : []).map(m => m[1]).sort();

// 2. Byte-assert the mapper contract literals (ledger.ts:652-665).
const mapperAssertions = {
  passVocab: PASS_STATUS_VOCAB.every(w => ledger.includes(w)),
  failVocab: FAIL_STATUS_VOCAB.every(w => ledger.includes(w)),
  okStrict: ledger.includes('raw.ok !== true'),
  verificationFailed: ledger.includes('output.verificationFailed === true'),
  cancelled: ledger.includes('output.cancelled === true'),
  timedOut: ledger.includes('output.timedOut === true'),
  outputEnvelope: ledger.includes("const output = raw.output && typeof raw.output === 'object' ? raw.output : {}"),
};
for (const [k, v] of Object.entries(mapperAssertions)) if (!v) fail('mapper literal missing: ' + k);

// Positive controls: known verifiers must be reachable as YES verdicts.
for (const known of ['quality_run', 'auto_tester', 'visual_qa']) {
  if (!gateSet.includes(known)) fail('positive control missing from gate set: ' + known);
}

// 3. Per-tool rows.
const rows = [];
for (const t of list) {
  const name = String(t.name || t.tool || '');
  if (!name) continue;
  const outProps = Array.isArray(t.outputProperties) ? t.outputProperties.slice().sort() : [];
  const mapperOverlap = outProps.filter(p => MAPPER_FIELDS.includes(p)).sort();
  const inGateSet = gateSet.includes(name.toLowerCase());
  const refs = [];
  const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  for (const [f, src] of Object.entries(sources)) if (re.test(src)) refs.push(f);
  refs.sort();
  rows.push({
    name,
    registered: t.registered !== false,
    outputProps: outProps,
    mapperFieldOverlap: mapperOverlap,
    asVerifierInGateSet: inGateSet,
    referencedByVerifierFiles: refs,
    asVerifierVerdict: inGateSet ? 'YES' : 'NO',
    // Envelope (ok/status/error) is added by ToolService at runtime; declared
    // output props alone cannot prove mapper compatibility without execution.
    evidenceVerdict: 'UNKNOWN_REQUIRES_EXECUTION',
  });
}
rows.sort((a, b) => a.name < b.name ? -1 : 1);

// 4. Controls must discriminate.
const byName = Object.fromEntries(rows.map(r => [r.name, r]));
const bogus = byName['bogus_tool_xyz_7788'];
if (bogus && (bogus.registered !== false || bogus.asVerifierInGateSet !== false)) fail('bogus control failed');

const result = {
  probe: 'verify-compat-20261003',
  museHead: '7f51785b',
  method: 'static contract comparison; nothing executed',
  sourceProvenance: Object.fromEntries(VERIFIER_FILES.map(f => [f, sha256(sources[f])])),
  gateSet,
  gateSetSize: gateSet.length,
  mapperAssertions,
  mapperFields: MAPPER_FIELDS,
  passStatusVocab: PASS_STATUS_VOCAB,
  failStatusVocab: FAIL_STATUS_VOCAB,
  rows,
};
fs.mkdirSync(OUT_DIR, { recursive: true });
const outPath = path.join(OUT_DIR, 'verify-compat.json');
fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log('rows=' + rows.length + ' gateSet=' + gateSet.length + ' sha=' + sha256(JSON.stringify(result, null, 2) + '\n'));
console.log(outPath);
