// planexp39.mjs — Checkpoint 39: planner-exposure reconciliation (READ-ONLY).
// For each REGISTERED_NOT_IN_CATALOGUE name (reused filed evidence
// regcheck38_runA.json), checks planner-exposure scopes per tree
// (MUSE + MAIN/NVIDIA read-only):
//   S1 plan-tools.ts ................ static PLANNER_TOOL_CATALOGUE (expect absent)
//   S2 toolCatalog.ts ............... CORE_TOOLS / ROUTER_EXCLUDED membership + literals
//   S3 PlanningEngine.ts ............ deterministic classifier/routing literals
//   S4 ProjectPipelineTool.ts ....... deterministicPhasesFor + schema-route literals
//   S5 ProjectPlannerTool.ts ........ prompt text literals beyond plannerToolPrompt()
//   S6 AgentLoopService.ts .......... orchestrator literals
//   S7 PhaseExecutorTool.ts ......... executor/verification-contract literals
//   S8 SelfFixExecutionService.ts ... repair-allowlist literals
//   S9 adaptive-dag-planner.ts ...... DAG planner literals
//   S10 capability-match.ts ......... intent-match literals
//   S11 tool-rerank.ts .............. rerank literals (Muse-only file; absent in MAIN ok)
// Classification per name (static only; retrieval behavior is checkpoint 40):
//   CORE_ALWAYS_OFFERED   in CORE_TOOLS (selectToolsFor always offers)
//   LITERAL_IN_SCOPE      name literal in >=1 planner scope file (which files listed)
//   RETRIEVAL_ONLY_CANDIDATE  no literal in any planner scope: visible to the
//                             planner ONLY via selectToolsFor description/tag
//                             scoring (behavioral proof deferred to ckpt 40)
// ROUTER_EXCLUDED membership is recorded orthogonally (capabilityRoute never
// single-shot-routes those; it does NOT remove catalogue/retrieval exposure).
// No source edits, no registry boot, no network. Deterministic sorted output.
import fs from 'fs';
import crypto from 'crypto';

const OUT = process.argv[2] || 'tmp/wiring-audit/fx-planexp39/planexp39_runA.json';
const TAG = process.argv[3] || 'runA';

const TREES = {
  MUSE: 'D:/Joe/muse-worktree/api/src',
  MAIN: 'D:/Joe/xelitesolutions/api/src',
};

const SCOPES = [
  ['S1_plan-tools', 'core/orchestrator/plan-tools.ts'],
  ['S2_toolCatalog', 'core/orchestrator/toolCatalog.ts'],
  ['S3_PlanningEngine', 'core/orchestrator/PlanningEngine.ts'],
  ['S4_ProjectPipelineTool', 'modules/tools/definitions/ProjectPipelineTool.ts'],
  ['S5_ProjectPlannerTool', 'modules/tools/definitions/ProjectPlannerTool.ts'],
  ['S6_AgentLoopService', 'modules/services/AgentLoopService.ts'],
  ['S7_PhaseExecutorTool', 'modules/tools/definitions/PhaseExecutorTool.ts'],
  ['S8_SelfFixExecutionService', 'modules/services/SelfFixExecutionService.ts'],
  ['S9_adaptive-dag-planner', 'core/orchestrator/adaptive-dag-planner.ts'],
  ['S10_capability-match', 'core/orchestrator/capability-match.ts'],
  ['S11_tool-rerank', 'core/orchestrator/tool-rerank.ts'],
  ['S12_tool-picker', 'core/llm/tool-picker.ts'],
];

const reg = JSON.parse(fs.readFileSync('tmp/wiring-audit/fx-regcheck38/regcheck38_runA.json', 'utf8'));

function lit(text, name) {
  return text.includes(`'${name}'`) || text.includes(`"${name}"`) || text.includes(`\`${name}\``);
}

function setMembers(text, setName) {
  // Extract quoted members of a const X = [...] / new Set([...]) block (best-effort).
  const out = [];
  const m = text.match(new RegExp(setName + String.raw`\s*=\s*(?:new\s+Set\s*\(\s*)?\[([\s\S]*?)\]`));
  if (!m) return out;
  for (const q of m[1].matchAll(/['"`]([a-z0-9_]+)['"`]/g)) out.push(q[1]);
  return [...new Set(out)];
}

function checkTree(t, root) {
  const scopeText = {};
  const scopeMissing = [];
  for (const [id, rel] of SCOPES) {
    try {
      scopeText[id] = fs.readFileSync(root + '/' + rel, 'utf8');
    } catch { scopeText[id] = null; scopeMissing.push(id); }
  }
  const toolCat = scopeText.S2_toolCatalog || '';
  const coreTools = setMembers(toolCat, 'CORE_TOOLS');
  const routerExcluded = setMembers(toolCat, 'ROUTER_EXCLUDED');
  const queue = reg.trees[t].registeredNotInCatalogue;
  const rows = [];
  for (const name of queue) {
    const hits = [];
    for (const [id] of SCOPES) {
      if (scopeText[id] && lit(scopeText[id], name)) hits.push(id);
    }
    const core = coreTools.includes(name);
    const excl = routerExcluded.includes(name);
    const cls = core ? 'CORE_ALWAYS_OFFERED' : (hits.length ? 'LITERAL_IN_SCOPE' : 'RETRIEVAL_ONLY_CANDIDATE');
    rows.push({ name, class: cls, scopes: hits, routerExcluded: excl });
  }
  rows.sort((a, b) => a.name < b.name ? -1 : 1);
  const byClass = {};
  for (const r of rows) byClass[r.class] = (byClass[r.class] || 0) + 1;
  return {
    queue: queue.length, byClass,
    coreTools, routerExcluded,
    scopeMissing,
    retrievalOnly: rows.filter(r => r.class === 'RETRIEVAL_ONLY_CANDIDATE').map(r => r.name),
    coreOffered: rows.filter(r => r.class === 'CORE_ALWAYS_OFFERED').map(r => r.name),
    rows,
  };
}

const out = { probe: 'planexp39', trees: {} };
for (const [t, root] of Object.entries(TREES)) out.trees[t] = checkTree(t, root);
const json = JSON.stringify(out, null, 1) + '\n';
fs.mkdirSync(OUT.split('/').slice(0, -1).join('/'), { recursive: true });
fs.writeFileSync(OUT, json);
const sha = crypto.createHash('sha256').update(json).digest('hex');
console.log(`tag=${TAG}`);
console.log(`sha256=${sha}`);
for (const [t, r] of Object.entries(out.trees)) {
  console.log(`${t}_queue=${r.queue} byClass=${JSON.stringify(r.byClass)} missing=${r.scopeMissing.join(',') || 'none'}`);
}
