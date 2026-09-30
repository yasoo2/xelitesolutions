// Checkpoint 43: production run-ingress census (static text scan, zero Joe imports).
// Finds every site that can START a Joe run / build an execute-goal outside tests:
//   - `new AgentOrchestrator` / `AgentOrchestrator.execute` / `orchestrator.execute(`
//   - `generatePlan(` call sites
//   - `AgentLoopService` references (orchestrator entry)
//   - `executeGoal` / `runGoal` shaped entry symbols
// Usage: node ingress43.mjs <apiSrcDir> <outJson>
// Classification is path-based; verdicts require hand review of each hit.
const fs = require('fs');
const path = require('path');

const root = path.resolve(process.argv[2]);
const outFile = path.resolve(process.argv[3]);
if (!root || !outFile) { console.error('usage: node ingress43.mjs <apiSrcDir> <outJson>'); process.exit(2); }

const PATTERNS = [
  { id: 'NEW_ORCHESTRATOR', re: /new\s+AgentOrchestrator\b/ },
  { id: 'ORCHESTRATOR_EXEC', re: /\borchestrator\.execute\s*\(/ },
  { id: 'AGENTLOOP_EXEC', re: /\bAgentLoopService\b/ },
  { id: 'GENERATE_PLAN', re: /\bgeneratePlan\s*\(/ },
  { id: 'EXECUTE_GOAL', re: /\b(executeGoal|runGoal|startRun|createRun)\s*\(/ },
];

function isTestPath(rel) {
  const n = rel.replace(/\\/g, '/');
  return n.includes('__tests__/') || n.includes('tests/manual/') || n.includes('system/scripts/');
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name === 'node_modules' || e.name === '.git') continue; walk(p, acc); }
    else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

const files = walk(root, []);
const hits = [];
for (const f of files) {
  const rel = path.relative(root, f);
  const lines = fs.readFileSync(f, 'utf8').split('\n');
  lines.forEach((text, i) => {
    for (const p of PATTERNS) {
      if (p.re.test(text)) {
        hits.push({ file: rel.replace(/\\/g, '/'), line: i + 1, pattern: p.id,
          test: isTestPath(rel), text: text.trim().slice(0, 220) });
      }
    }
  });
}
const prod = hits.filter((h) => !h.test);
const result = { root, filesScanned: files.length, totalHits: hits.length,
  prodHits: prod.length, testHits: hits.length - prod.length, prod, test: hits.filter((h) => h.test) };
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ filesScanned: files.length, totalHits: hits.length,
  prodHits: prod.length, testHits: hits.length - prod.length }));
