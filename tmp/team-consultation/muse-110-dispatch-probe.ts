/**
 * MUSE wiring audit 110 — dispatch-reachability battery (Level 3).
 *
 * Follow-up to 109 (OBS-109-3): planner RETRIEVAL is complete (union=163/163)
 * on Muse lineage, so the catalogue battery has exhausted its discriminating
 * power. This probe moves DOWN the chain: for one representative tool per
 * family it executes the REAL executeTool dispatch path
 * (alias layer -> registry -> firewall -> handler) with inputs that each
 * handler provably rejects BEFORE any side effect:
 *
 *   D1 echo                attributed -> ok:true (positive control, 106-P3)
 *   D2 read_file           nonexistent path -> 'File not found' (pure read)
 *   D3 write_file          no path -> 'filename or path is required' (pre-write)
 *   D4 shell_execute       no command -> approval_required, risk=high (gate
 *                             layer; the gate precedes the handler for
 *                             high-risk tools)
 *   D4b shell_execute       no command + scoped approval -> handler's own
 *                             '... needs a command' (handler layer, nothing run)
 *   D5 terminal_manager    unknown action -> 'Unknown action' (no kernel call)
 *   D6 muse_110_no_such_tool -> unknown_tool dead end (routing negative)
 *   D7 shell (alias table) -> 'tool alias' log + approval_required (alias
 *                             resolution + gate layer)
 *   D7b shell (alias table) + scoped approval -> handler's own pre-exec
 *                             error (full alias->handler chain, nothing run)
 *   D8 image_generate      -> unknown_tool "generate_image" (orphan re-pin)
 *
 * Safety: bypass OFF (hermetic), full attribution where the firewall requires
 * it, NO sessionId (no session-store lookup), zero tool side effects by
 * construction (every error return precedes the effect in source), zero
 * network, FS contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT.
 * AUTO_APPROVE_ALL='1' is set process-scoped ONLY around D4b/D7b (empty
 * commands that the handler provably rejects before execution) and removed
 * immediately after; it is read solely by the approval gate (ToolService
 * :774, sole consumer). No source is modified by this script.
 *
 * Run from api/ with plain DOS CWD:
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   ..\api\node_modules\.bin\tsx.cmd ..\tmp\team-consultation\muse-110-dispatch-probe.ts
 */
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const attr = { workspaceId: 'probe-ws-110', userId: 'probe-user-110' } as any;

  await executionFirewall.runInContext('muse-110-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()}`,
      pass: p0a && p0b, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107/108/109',
    });

    // D1: echo positive control.
    const r1: any = await executeTool('echo', { text: 'probe-110' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-110',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-110')}`,
      pass: r1?.ok === true && out1.includes('probe-110'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // D2: file-read dispatch — handler's own 'File not found'.
    const r2: any = await executeTool('read_file', { path: 'muse-110-no-such-file.txt' }, attr);
    results.push({
      case: 'D2-read-dispatch', expect: 'ok=false error=File not found',
      actual: `ok=${r2?.ok} error=${r2?.error}`,
      pass: r2?.ok === false && r2?.error === 'File not found',
      detail: `logs=${JSON.stringify((r2?.logs || []).slice(-2))}`,
    });

    // D3: file-write dispatch — pre-write validation error, zero writes.
    const r3: any = await executeTool('write_file', { content: 'probe-110-must-never-land' }, attr);
    results.push({
      case: 'D3-write-dispatch', expect: 'ok=false error=filename or path is required',
      actual: `ok=${r3?.ok} error=${r3?.error}`,
      pass: r3?.ok === false && r3?.error === 'filename or path is required',
      detail: 'empty path returns before safePath/mkdir/write',
    });

    // D4: shell dispatch, GATE layer — high-risk tools meet the approval
    // gate before the handler. approval_required proves routing + policy
    // evaluation; it does NOT prove handler reachability (see D4b).
    const r4: any = await executeTool('shell_execute', {}, attr);
    results.push({
      case: 'D4-shell-gate', expect: 'ok=false error=approval_required risk=high',
      actual: `ok=${r4?.ok} error=${r4?.error} risk=${(r4?.output as any)?.risk}`,
      pass: r4?.ok === false && r4?.error === 'approval_required' && (r4?.output as any)?.risk === 'high',
      detail: `logs=${JSON.stringify((r4?.logs || []).slice(-1))}`,
    });

    // D4b: shell dispatch, HANDLER layer — scoped approval lets the empty
    // command through the gate; the handler rejects it before execution.
    process.env.AUTO_APPROVE_ALL = '1';
    let r4b: any = null;
    try {
      r4b = await executeTool('shell_execute', {}, attr);
    } finally {
      delete process.env.AUTO_APPROVE_ALL;
    }
    results.push({
      case: 'D4b-shell-handler', expect: 'ok=false error=shell_execute needs a command',
      actual: `ok=${r4b?.ok} error=${r4b?.error}`,
      pass: r4b?.ok === false && String(r4b?.error || '').startsWith('shell_execute needs a command'),
      detail: 'empty command returns before gateway/redact/workspace; nothing run',
    });

    // D5: terminal dispatch — unknown action, zero kernel calls.
    const r5: any = await executeTool('terminal_manager', { action: 'probe_no_such_action_110' }, attr);
    results.push({
      case: 'D5-terminal-dispatch', expect: 'ok=false error=Unknown action',
      actual: `ok=${r5?.ok} error=${r5?.error}`,
      pass: r5?.ok === false && r5?.error === 'Unknown action',
      detail: 'unknown action falls through all kernel branches',
    });

    // D6: unknown-name routing dead end (no context needed: check precedes firewall).
    const r6: any = await executeTool('muse_110_no_such_tool', {});
    results.push({
      case: 'D6-unknown-name', expect: 'ok=false error=unknown_tool "muse_110_no_such_tool"',
      actual: `ok=${r6?.ok} error=${String(r6?.error || '').slice(0, 80)}`,
      pass: r6?.ok === false && String(r6?.error || '').startsWith('unknown_tool: "muse_110_no_such_tool"'),
      detail: `logs=${JSON.stringify((r6?.logs || []).slice(-1))}`,
    });

    // D7: alias-TABLE dispatch, GATE layer — 'shell' has no direct rename,
    // flows via TOOL_ALIASES to shell_execute, then meets the approval gate.
    const r7: any = await executeTool('shell', {}, attr);
    const logs7 = JSON.stringify(r7?.logs || []);
    results.push({
      case: 'D7-alias-gate', expect: 'tool-alias log + approval_required',
      actual: `ok=${r7?.ok} error=${r7?.error} aliasLog=${logs7.includes('tool alias')}`,
      pass: r7?.ok === false
        && r7?.error === 'approval_required'
        && logs7.includes('tool alias'),
      detail: `logs=${logs7.slice(0, 300)}`,
    });

    // D7b: alias-TABLE dispatch, HANDLER layer — full alias->handler chain.
    process.env.AUTO_APPROVE_ALL = '1';
    let r7b: any = null;
    try {
      r7b = await executeTool('shell', {}, attr);
    } finally {
      delete process.env.AUTO_APPROVE_ALL;
    }
    results.push({
      case: 'D7b-alias-handler', expect: 'ok=false error=shell_execute needs a command',
      actual: `ok=${r7b?.ok} error=${r7b?.error}`,
      pass: r7b?.ok === false && String(r7b?.error || '').startsWith('shell_execute needs a command'),
      detail: 'alias resolution + handler reached; nothing run',
    });

    // D8: orphan re-pin — image_generate -> generate_image -> unknown_tool.
    const r8: any = await executeTool('image_generate', { prompt: 'probe-110' });
    results.push({
      case: 'D8-orphan-repin', expect: 'ok=false error=unknown_tool "generate_image"',
      actual: `ok=${r8?.ok} error=${String(r8?.error || '').slice(0, 80)}`,
      pass: r8?.ok === false && String(r8?.error || '').startsWith('unknown_tool: "generate_image"'),
      detail: 'ImageGenerationTool still unregistered on Muse lineage',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-110-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-110-dispatch', fatal: String(e?.stack || e) }));
  process.exitCode = 2;
});
