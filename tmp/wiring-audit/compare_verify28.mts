// Compare filed verify_sweep28 runs A/B at verdict level.
// Compares per leg: status, ok, error-prefix(60), receipt.result,
// metrics.passed/failed, phaseVerificationCheck.result, reusedInLogs +
// static partition + static verdict matches. Ignores timing/fingerprints.
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A = JSON.parse(fs.readFileSync(path.join(HERE, 'verify_sweep28_runA.json'), 'utf8'));
const B = JSON.parse(fs.readFileSync(path.join(HERE, 'verify_sweep28_runB.json'), 'utf8'));

const LEGS = ['q-pass', 'q-fail', 'a-pass', 'a-fail', 'd-nolock', 's-seeded', 's-clean', 'r-quick', 'r-gate', 'q-reuse'];
const ep = (v: any) => String(v?.errorPreview || '').slice(0, 60);
let diffs = 0;
for (const k of LEGS) {
  const a = A.live[k], b = B.live[k];
  const rows = [
    ['status', a.status, b.status],
    ['ok', a.ok, b.ok],
    ['errPrefix', ep(a), ep(b)],
    ['receipt', a.receipt?.result, b.receipt?.result],
    ['passed', a.metrics?.passed, b.metrics?.passed],
    ['failed', a.metrics?.failed, b.metrics?.failed],
    ['check', a.phaseVerificationCheck?.result, b.phaseVerificationCheck?.result],
  ];
  if ('reusedInLogs' in a || 'reusedInLogs' in b) rows.push(['reusedInLogs', a.reusedInLogs, b.reusedInLogs]);
  for (const [f, va, vb] of rows) {
    if (JSON.stringify(va) !== JSON.stringify(vb)) { console.log(`DIFF ${k}.${f}: A=${JSON.stringify(va)} B=${JSON.stringify(vb)}`); diffs++; }
  }
}
const pa = JSON.stringify(A.static.partition), pb = JSON.stringify(B.static.partition);
if (pa !== pb) { console.log('DIFF static.partition'); diffs++; }
const va = JSON.stringify(A.static.verdicts), vb = JSON.stringify(B.static.verdicts);
if (va !== vb) { console.log('DIFF static.verdicts'); diffs++; }
console.log(`COMPARE28_DONE verdictDiffs=${diffs} legs=${LEGS.length}`);
process.exit(diffs ? 1 : 0);
