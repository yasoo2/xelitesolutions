/**
 * MUSE wiring audit 117 — dispatch-reachability battery: execute_python
 * handler contracts + missing-interpreter behavior, terminal_manager
 * handler contracts + bash/run_command alias-shadow resolution (Level 3).
 *
 * Follow-up to 116 (next step named python_execution/execute_python +
 * terminal_manager depth). For each target this probe executes the REAL
 * executeTool dispatch path (alias layer -> registry -> firewall ->
 * approval gate -> handler). Every expectation below was derived from
 * source (+ one environment fact: `python3` NOT on PATH, verified via
 * Get-Command before the run; only C:\Python314\python.exe exists)
 * BEFORE the run:
 *
 *   PY0 execute_python {} (empty code)
 *      -> ok=false, error='No Python code provided.'
 *      (HANDLER guard, PythonExecutionTool.ts:58-64. No spawn, no tmp
 *      write — the cheapest handler-reachability pin for this family.)
 *   PY1 execute_python {code:'print("hello-117")'}
 *      -> ok=false, error non-empty naming the interpreter failure
 *      (handler writes joe_python_<Date.now()>.py to os.tmpdir() then
 *      ExecutionGateway.execute('python3', ...) (:66-75); `python3` is
 *      absent on this Windows box, so the engine reports failure and
 *      the handler returns ok=false (:93-96). The tmp file is deleted
 *      on both paths (:82/:103) — the probe snapshots os.tmpdir() for
 *      joe_python_* before/after to prove transient-only. PORTABILITY
 *      pin: the tool hardcodes the `python3` binary name.)
 *   T0 terminal_manager {action:'list'} (fresh process, no sessionId)
 *      -> ok=true, terminals=[]
 *      (HANDLER list, TaskInteractionTools.ts:152-155; kernel
 *      listTerminals('') returns all ids, terminal-kernel.ts:176-180;
 *      fresh process holds none. BASELINE guard for T6-T9.)
 *   T1 terminal_manager {action:'frobnicate-117'}
 *      -> ok=false, error='Unknown action'
 *      (HANDLER fallthrough :157. Actions ARE validated.)
 *   T2 terminal_manager {action:'write'} (no command)
 *      -> ok=false, error='command input required'
 *      (HANDLER guard :135. No kernel call.)
 *   T3 terminal_manager {action:'read'} (no id/session -> 'default')
 *      -> ok=false, error='Terminal not found'
 *      (HANDLER read :125-132; kernel readHistory throws on missing
 *      id, terminal-kernel.ts:167-170.)
 *   T4 executeTool('bash', {action:'list'})
 *      -> ok=true, terminals array
 *      (ALIAS-CHAIN pin: `bash` is not registered and has no hardcoded
 *      branch, so TOOL_ALIASES :245 bash->terminal_manager applies at
 *      ToolService.ts:691-698. 4th live alias chain after shell 110,
 *      fetch_url 113, grep_search 115.)
 *   T5 executeTool('run_command', {action:'list'})
 *      -> ok=false, error='approval_required' (gate, handler never runs)
 *      (SHADOW-WINNER pin: TOOL_ALIASES :244 says terminal_manager but
 *      the hardcoded :429 branch rewrote effectiveName to shell_execute
 *      FIRST, and the table only applies `if (!tDef)` (:691) — shell_
 *      execute IS registered, so the table entry is dead. shell_execute
 *      with an empty command classifies HIGH (classifyToolRisk :155-168
 *      falls through to :168 return 'high'), so the approval gate fires
 *      BEFORE the handler's own missing-command guard (:1511) — safe
 *      discriminator either way: terminal_manager would have answered
 *      ok=true for {action:'list'}. RUN-1 CORRECTION (disclosed): the
 *      first run expected the handler guard text; the live path proved
 *      gate-before-handler. Expectation fixed to the gate verdict.)
 *   T6 terminal_manager {action:'create', id:'probe-117'}
 *      -> ok=true, output.id='probe-117'
 *      (HANDLER create :80-123; no sessionId -> requestedId;
 *      kernel.createTerminal spawns the real PTY. Conditional chain:
 *      if create is not ok, T7-T9 are recorded SKIPPED, not failed.)
 *   T7 terminal_manager {action:'read', id:'probe-117'}
 *      -> ok=true, history is string (live session read-back)
 *   T8 terminal_manager {action:'kill', id:'probe-117'}
 *      -> ok=true (kernel killTerminal removes + kills :144-162)
 *   T9 terminal_manager {action:'read', id:'probe-117'}
 *      -> ok=false, error='Terminal not found' (kill verified)
 *
 * Risk derivation (ToolService.ts classifyToolRisk :142-203):
 * execute_python and terminal_manager match NO special branch and none
 * of the name regexes -> 'medium' -> default allowance. No sessionId is
 * sent, so no gate is met; every case below must reach its handler.
 *
 * Safety: same isolated tsx method as 110-116 — canonical test env
 * (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, NO sessionId, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-117
 * (plus one transient os.tmpdir() python file the handler itself owns
 * and deletes; snapshotted). NO AUTO_APPROVE_* set at any point. T6
 * spawns one real PTY and T8 kills it in-probe. No source is modified.
 *
 * Run from api/ with plain DOS CWD (never the workdir parameter: tsx.cmd is
 * a cmd.exe shim and rejects \\?\ paths):
 *   cd D:\Joe\muse-worktree\api
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   .\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-117-dispatch-probe.ts
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
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

function joePythonFiles(): string[] {
  try {
    return fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith('joe_python_'));
  } catch {
    return ['TMPDIR_UNREADABLE'];
  }
}

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const attr = { workspaceId: 'probe-ws-117', userId: 'probe-user-117' } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-117-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const p0d = !!sbxRoot && String(process.env.EXTERNAL_PROJECTS_DIR || '').startsWith(path.resolve(sbxRoot).slice(0, 20));
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'}`,
      pass: p0a && p0b && !!sbxRoot, detail: `ambient=${JSON.stringify(ambient)} contained_hint=${p0d}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-116',
    });

    // D1: echo positive control (106-P3 / 110-D1 / 111-D1 / 112-D1 / 113-D1 / 114-D1 / 115-D1 / 116-D1).
    const r1: any = await executeTool('echo', { text: 'probe-117' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-117',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-117')}`,
      pass: r1?.ok === true && out1.includes('probe-117'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // PY0: empty code rejected by the handler guard (no spawn, no tmp write).
    const rp0: any = await executeTool('execute_python', {}, attr);
    results.push({
      case: 'PY0-python-empty', expect: "ok=false error='No Python code provided.'",
      actual: `ok=${rp0?.ok} error=${String(rp0?.error || '').slice(0, 90)}`,
      pass: rp0?.ok === false && String(rp0?.error || '') === 'No Python code provided.',
      detail: 'PythonExecutionTool.ts:58-64 guard; handler reached via default medium allowance',
    });

    // PY1: real script, missing `python3` binary on this Windows box.
    const before = joePythonFiles();
    const rp1: any = await executeTool('execute_python', { code: 'print("hello-117")' }, attr);
    const after = joePythonFiles();
    const newResidue = after.filter((f) => !before.includes(f));
    const e1 = String(rp1?.error || '');
    const e1names = /python3|ENOENT|not recognized|spawn|failed/i.test(e1);
    results.push({
      case: 'PY1-python-missing-binary', expect: 'ok=false error_names_interpreter_failure + zero_new_tmp_residue',
      actual: `ok=${rp1?.ok} error=${e1.slice(0, 120)} residue_new=${newResidue.length}`,
      pass: rp1?.ok === false && e1.length > 0 && e1names && newResidue.length === 0,
      detail: `tmp_before=${before.length} tmp_after=${after.length} new=${JSON.stringify(newResidue).slice(0, 120)}; hardcoded 'python3' argv (PythonExecutionTool.ts:72), Get-Command python3 absent pre-run`,
    });

    // T0: list baseline in a fresh process.
    const rt0: any = await executeTool('terminal_manager', { action: 'list' }, attr);
    const t0list = (rt0?.output as any)?.terminals;
    results.push({
      case: 'T0-terminal-list-empty', expect: 'ok=true terminals=[]',
      actual: `ok=${rt0?.ok} terminals=${JSON.stringify(t0list)} error=${rt0?.error ?? 'none'}`,
      pass: rt0?.ok === true && Array.isArray(t0list) && t0list.length === 0,
      detail: 'fresh hermetic process; baseline for T6-T9 lifecycle',
    });

    // T1: unknown action rejected.
    const rt1: any = await executeTool('terminal_manager', { action: 'frobnicate-117' }, attr);
    results.push({
      case: 'T1-terminal-unknown-action', expect: "ok=false error='Unknown action'",
      actual: `ok=${rt1?.ok} error=${String(rt1?.error || '').slice(0, 90)}`,
      pass: rt1?.ok === false && String(rt1?.error || '') === 'Unknown action',
      detail: 'TaskInteractionTools.ts:157 fallthrough; actions validated',
    });

    // T2: write without command rejected (no kernel call).
    const rt2: any = await executeTool('terminal_manager', { action: 'write' }, attr);
    results.push({
      case: 'T2-terminal-write-no-command', expect: "ok=false error='command input required'",
      actual: `ok=${rt2?.ok} error=${String(rt2?.error || '').slice(0, 90)}`,
      pass: rt2?.ok === false && String(rt2?.error || '') === 'command input required',
      detail: 'TaskInteractionTools.ts:135 guard; handler reached via default medium allowance',
    });

    // T3: read of missing id.
    const rt3: any = await executeTool('terminal_manager', { action: 'read' }, attr);
    results.push({
      case: 'T3-terminal-read-missing', expect: "ok=false error='Terminal not found'",
      actual: `ok=${rt3?.ok} error=${String(rt3?.error || '').slice(0, 90)}`,
      pass: rt3?.ok === false && String(rt3?.error || '') === 'Terminal not found',
      detail: 'no id/session -> default; kernel readHistory throws (terminal-kernel.ts:167-170)',
    });

    // T4: `bash` alias chain live -> terminal_manager.
    const rt4: any = await executeTool('bash', { action: 'list' }, attr);
    const t4list = (rt4?.output as any)?.terminals;
    results.push({
      case: 'T4-bash-alias-live', expect: 'ok=true terminals_array (alias bash->terminal_manager)',
      actual: `ok=${rt4?.ok} terminals=${JSON.stringify(t4list)} error=${rt4?.error ?? 'none'}`,
      pass: rt4?.ok === true && Array.isArray(t4list),
      detail: 'TOOL_ALIASES :245 applies at :691-698 (bash unregistered, no hardcoded branch); 4th live chain',
    });

    // T5: `run_command` shadow winner — hardcoded shell_execute beats the table,
    // and its HIGH risk meets the approval gate before the handler guard.
    const rt5: any = await executeTool('run_command', { action: 'list' }, attr);
    const e5 = String(rt5?.error || '');
    results.push({
      case: 'T5-run-command-shadow', expect: "ok=false error='approval_required' (gate before handler guard)",
      actual: `ok=${rt5?.ok} error=${e5.slice(0, 110)}`,
      pass: rt5?.ok === false && e5 === 'approval_required',
      detail: 'hardcoded :429 wins over TOOL_ALIASES :244 (table only `if (!tDef)` :691); empty-cmd shell_execute=high (:168) -> gate fires before handler :1511; run-1 disclosed correction',
    });

    // T6-T9: create/read/kill/read lifecycle (conditional chain).
    const rt6: any = await executeTool('terminal_manager', { action: 'create', id: 'probe-117' }, attr);
    const t6id = (rt6?.output as any)?.id;
    const t6ok = rt6?.ok === true && t6id === 'probe-117';
    results.push({
      case: 'T6-terminal-create', expect: "ok=true id='probe-117'",
      actual: `ok=${rt6?.ok} id=${t6id} fallback=${(rt6?.output as any)?.fallback} error=${String(rt6?.error || '').slice(0, 100)}`,
      pass: t6ok,
      detail: 'requestedId path (no sessionId); kernel.createTerminal real PTY spawn',
    });
    if (!t6ok) {
      for (const c of ['T7-terminal-read-created', 'T8-terminal-kill', 'T9-terminal-read-after-kill']) {
        results.push({ case: c, expect: 'SKIPPED (T6 create not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
      }
    } else {
      const rt7: any = await executeTool('terminal_manager', { action: 'read', id: 'probe-117' }, attr);
      const h7 = (rt7?.output as any)?.history;
      results.push({
        case: 'T7-terminal-read-created', expect: 'ok=true history_is_string',
        actual: `ok=${rt7?.ok} history_type=${typeof h7} history_len=${typeof h7 === 'string' ? h7.length : -1} error=${rt7?.error ?? 'none'}`,
        pass: rt7?.ok === true && typeof h7 === 'string',
        detail: 'live session read-back via kernel.readHistory',
      });
      const rt8: any = await executeTool('terminal_manager', { action: 'kill', id: 'probe-117' }, attr);
      results.push({
        case: 'T8-terminal-kill', expect: 'ok=true',
        actual: `ok=${rt8?.ok} error=${rt8?.error ?? 'none'}`,
        pass: rt8?.ok === true,
        detail: 'kernel killTerminal removes + kills (terminal-kernel.ts:144-162)',
      });
      const rt9: any = await executeTool('terminal_manager', { action: 'read', id: 'probe-117' }, attr);
      results.push({
        case: 'T9-terminal-read-after-kill', expect: "ok=false error='Terminal not found'",
        actual: `ok=${rt9?.ok} error=${String(rt9?.error || '').slice(0, 90)}`,
        pass: rt9?.ok === false && String(rt9?.error || '') === 'Terminal not found',
        detail: 'kill verified: session gone',
      });
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-117-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-117-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
