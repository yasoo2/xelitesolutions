'use strict';
// Executes the complete current orchestrator with closed effect boundaries.
// Tool/provider results are controlled; this proves scheduling, not live inference.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const ts = require('typescript');
const sourceFile = process.argv[2] || path.resolve(__dirname, '../../orchestration/AgentOrchestrator.ts');
const bytes = fs.readFileSync(sourceFile);
const emitted = ts.transpileModule(bytes.toString('utf8'), {
  fileName: sourceFile, reportDiagnostics: true,
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
});
assert.equal((emitted.diagnostics || []).filter(x => x.category === ts.DiagnosticCategory.Error).length, 0);
function fixture(enabled = true, outcome = { ok: true, output: 'controlled result' }) {
  const calls = { narrations: [], providers: [], tools: [], broadcasts: [], records: [] };
  const router = { routeToModel: async (...args) => { calls.providers.push(args); return 'I am checking the next step carefully.'; },
    isProviderFailure: value => typeof value === 'string' && value.startsWith('PROVIDER_FAILURE:'), PROVIDER_FAILURE_PREFIX: 'PROVIDER_FAILURE:' };
  const stubAgent = class {};
  const dependencies = {
    '../core/orchestrator/PlanningEngine': { PlanningEngine: {} },
    '../shared/reply-language': { isArabicReply: () => false, say: (_ar, _a, en) => en },
    '../core/orchestrator/plan-tools': { unrunnableShellStep: () => null },
    '../core/intelligence/IntentParser': { IntentParser: {} },
    '../modules/services/ToolService': { executeTool: async (...args) => { calls.tools.push(args); return outcome; } },
    '../api/ws': { broadcastThinkingDetail: (...args) => calls.broadcasts.push(args), broadcast: () => {} },
    '../core/orchestrator/phaseAnnounce': { announcePhase: () => {} },
    '../core/agents/narrator': { narrationEnabled: () => enabled,
      narrate: async (context, call) => { calls.narrations.push(context); return { text: await call('controlled narration', new AbortController().signal) }; } },
    '../core/llm/intelligent-router': router,
    './departments': { emitDepartment: () => {} },
    'crypto': { randomUUID: () => 'synthetic-id' },
    './agents/BaseAgent': { BaseAgent: stubAgent }, './agents/SecurityAgent': { SecurityAgent: stubAgent },
    './agents/BrowserAgent': { BrowserAgent: stubAgent },
    '../core/orchestrator/ExecutionMemory': { compactRuntimeValue: value => value },
    '../modules/services/TraceManager': { traceManager: { logEvent: () => {} } },
    './AgentExecutionFirewall': { executionFirewall: {} },
    '../shared/utils/deadline': { withDeadline: promise => promise, NODE_DEADLINE_MS: 45_000, RUN_DEADLINE_MS: 120_000 },
    '../core/memory/repair-memory': { repairMemory: {} },
    '../core/session/attended-run': { CANCELLED: 'cancelled' },
    '../core/capabilities/decision-profiles': { compactCapabilityDecisionReceiptForRuntime: value => value },
  };
  const record = { exports: {} };
  const sandbox = vm.createContext({ console: { log() {}, warn() {}, error() {} }, AbortController,
    process: { env: { NODE_ENV: 'test' } }, setTimeout: () => { throw new Error('Unexpected timer'); } });
  const load = name => { assert(Object.hasOwn(dependencies, name), 'Undeclared dependency: ' + name); return dependencies[name]; };
  new vm.Script('(function(exports,require,module){' + emitted.outputText + '\n})').runInContext(sandbox)(record.exports, load, record);
  const orchestrator = new record.exports.AgentOrchestrator();
  const memory = { sessionId: 'session-1', goalText: 'A real user question', getHistory: () => [],
    record: (...args) => calls.records.push(args), getResults: () => ({ node: outcome.output }) };
  return { calls, orchestrator, memory };
}
async function run(tool, enabled = true, outcome, cancelled = false) {
  const f = fixture(enabled, outcome), controller = new AbortController();
  const context = { userId: 'owner-1', sessionId: 'session-1', workspaceId: 'workspace-1', runId: 'run-1',
    cancellation: { signal: controller.signal }, isCancelled: () => cancelled, modelConfig: { provider: 'local' } };
  f.orchestrator.context = context;
  const dag = { id: 'dag-1', status: 'idle', nodes: [{ id: 'node', tool, task: 'Perform this step', agent: 'General',
    input: { question: 'Unscripted question', text: 'Echo this', path: 'note.txt', content: 'text' }, dependencies: [], status: 'pending' }] };
  const result = await f.orchestrator.coordinate(dag, f.memory, context, undefined, 'A real user question');
  return { ...f, result, context, dag };
}
(async () => {
  const results = [];
  async function check(name, work) { try { await work(); results.push({ name, passed: true }); } catch(e) { results.push({ name, passed: false, error: e.message }); } }
  const fileTools = ['write_file', 'file_write', 'create_file', 'write_to_file', 'read_file', 'file_read'];
  for (const tool of ['central_answer', 'echo', 'project_pipeline', ...fileTools, ...fileTools.map(name => ` ${name} `), 'browser_responsive_check', 'central_answer_extra']) {
    await check(tool + ' scheduling and trusted context', async () => {
      const f = await run(tool), skipped = ['central_answer', 'echo', 'project_pipeline'].includes(tool) || fileTools.includes(tool.trim());
      assert.equal(f.result.ok, true); assert.equal(f.calls.narrations.length, skipped ? 0 : 1);
      assert.equal(f.calls.providers.length, skipped ? 0 : 1); assert.equal(f.calls.tools.length, 1);
      assert.equal(f.calls.tools[0][0], tool.trim()); assert.equal(f.dag.nodes[0].status, 'completed');
      const context = f.calls.tools[0][2];
      for (const field of ['userId', 'sessionId', 'workspaceId', 'runId', 'cancellation', 'isCancelled']) assert.equal(context[field], f.context[field]);
      if (tool === 'central_answer') assert.equal(f.calls.tools[0][1].question, 'Unscripted question');
    });
  }
  await check('explicit narration disabled remains effective for ordinary tools', async () => {
    const f = await run('write_file', false); assert.equal(f.calls.providers.length, 0); assert.equal(f.calls.tools.length, 1);
  });
  await check('explicit narration disabled remains effective for a narrated browser tool', async () => {
    const f = await run('browser_responsive_check', false); assert.equal(f.calls.providers.length, 0); assert.equal(f.calls.tools.length, 1);
  });
  await check('file gateway rejection remains a terminal failure without narration or provider recovery', async () => {
    const f = await run('write_file', true, { ok: false, error: 'workspace_access_denied', output: { nonRecoverable: true, status: 'failed' } });
    assert.equal(f.result.ok, false); assert.equal(f.calls.providers.length, 0); assert.equal(f.calls.tools.length, 1);
    assert.equal(f.dag.nodes[0].status, 'failed');
  });
  await check('failed answer stays failed without decorative retry or fabricated output', async () => {
    const f = await run('central_answer', true, { ok: false, error: 'answer deadline', output: { nonRecoverable: true, status: 'failed' } });
    assert.equal(f.result.ok, false); assert.equal(f.calls.providers.length, 0); assert.equal(f.calls.tools.length, 1);
    assert.equal(f.dag.nodes[0].status, 'failed');
  });
  await check('owner cancellation stops before both narration and tool execution', async () => {
    await assert.rejects(run('central_answer', true, undefined, true), /cancelled/);
  });
  await check('owner cancellation also stops a file step before its tool execution', async () => {
    await assert.rejects(run('write_file', true, undefined, true), /cancelled/);
  });
  const output = { sourceFile, sourceSHA256: crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase(),
    passed: results.filter(x => x.passed).length, failed: results.filter(x => !x.passed).length, results,
    limits: 'Full orchestrator; controlled tool/provider/memory boundaries; no live provider, ToolService policy or UI acceptance.' };
  console.log(JSON.stringify(output, null, 2)); if (output.failed) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
