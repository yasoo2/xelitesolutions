/**
 * MUSE wiring audit 119 — dispatch-reachability battery: terminal_manager
 * UNSCOPED write/kill/resize reachability depth + silent-noop verdict pins
 * (Level 3).
 *
 * Follow-up to 118 (OBS-118-1: WS ingress enforces terminal ownership, tool
 * ingress does not — proven live for list S5 + read S6; write/kill were
 * conjectured from the shared id-derivation path and deliberately NOT
 * executed cross-session). This probe closes the conjecture with
 * owned-probe-only effects: every mutation touches a PTY this probe created
 * and kills in-probe. Every expectation below was derived from source
 * BEFORE the run:
 *
 *   H4 executeTool('run_command', {action:'list'}) (no session)
 *      -> ok=false, error='approval_required' (T5-117 winner re-pin;
 *      guards the divergent-shadow finding. Nothing executed.)
 *   T0 terminal_manager {action:'list'} (no session, fresh process)
 *      -> ok=true, terminals=[] (baseline.)
 *   T1 create {action:'create'} with context.sessionId='sess-A-119'
 *      -> ok=true, output.id='terminal:sess-A-119' (session forces id;
 *      TaskInteractionTools.ts:73-77. Real PTY spawn; killed in-probe by
 *      K1. Conditional chain: if T1 is not ok, W/R/K cases are recorded
 *      SKIPPED, not failed.)
 *   W1 unscoped write {id:TID_A} with NO command
 *      -> ok=false, error='command input required'
 *      (WRITE-GUARD pin: TaskInteractionTools.ts:135 handler guard fires
 *      BEFORE the kernel; proves the write path reaches the handler with
 *      no owner gate in front of it. Nothing executed.)
 *   W2 scoped-B write with NO command
 *      -> ok=false, error='command input required' (guard is
 *      id-independent: same verdict for a derived-missing id.)
 *   W3 unscoped write WITH command to never-existing id
 *      'terminal:never-119'
 *      -> ok=true (SILENT-WRITE pin: terminal-kernel.ts:106-110 returns
 *      silently on missing id; the verdict is indistinguishable from a
 *      delivered write. Safe: no PTY holds that id in this fresh
 *      hermetic process — T0 baseline proves empty — so the command
 *      text never touches a shell.)
 *   R1 unscoped resize {id:TID_A, cols:81, rows:31}
 *      -> ok=true (RESIZE pin: no validation in the handler :141-145,
 *      kernel resizes the owned PTY; harmless, PTY killed in-probe.)
 *   R2 scoped-B resize (derives to missing terminal:sess-B-119)
 *      -> ok=true (SILENT-RESIZE pin: kernel :125-126 returns silently
 *      on missing id — same verdict as R1's real resize.)
 *   K0 unscoped kill of never-existing id 'terminal:never-119'
 *      -> ok=true (SILENT-KILL pin: kernel :149-150 returns silently;
 *      a kill verdict alone is not evidence of effect.)
 *   K1 unscoped kill {id:TID_A}
 *      -> ok=true (KILL pin: kernel removeTerminal + kill :152-161 on
 *      the OWNED probe PTY; proves the kill path is reachable unscoped
 *      with an explicit id. Distinguished from K0's silent no-op by K2.)
 *   K2 read with context.sessionId='sess-A-119'
 *      -> ok=false, error='Terminal not found' (kill verified: readHistory
 *      :167-171 throws on missing — the ONLY terminal action that reports
 *      a missing id instead of silent-ok.)
 *   K3 unscoped list -> ok=true, terminals=[] (cleanup verified.)
 *
 * Risk derivation (ToolService.ts classifyToolRisk :142-203):
 * terminal_manager matches NO special branch -> 'medium' -> default
 * allowance; H4 resolves to shell_execute with empty command -> 'high'
 * -> approval gate (handler never runs). Every T/W/R/K case must reach
 * its handler.
 *
 * Safety: same isolated tsx method as 110-118 — canonical test env
 * (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-119. NO AUTO_APPROVE_* set
 * at any point. T1 spawns one real PTY and K1 kills it in-probe. No
 * source is modified. No foreign-session terminal is touched: the only
 * PTY in the process is the probe's own.
 *
 * Run from api/ with plain DOS CWD (never the workdir parameter: tsx.cmd is
 * a cmd.exe shim and rejects \\?\ paths):
 *   cd D:\Joe\muse-worktree\api
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   .\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-119-dispatch-probe.ts
 */
import * as path from 'path';
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

const SID_A = 'sess-A-119';
const SID_B = 'sess-B-119';
const TID_A = `terminal:${SID_A}`;
const TID_NEVER = 'terminal:never-119';

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

  const attr = { workspaceId: 'probe-ws-119', userId: 'probe-user-119' } as any;
  const ctxA = { ...attr, sessionId: SID_A } as any;
  const ctxB = { ...attr, sessionId: SID_B } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-119-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'}`,
      pass: p0a && p0b && !!sbxRoot, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-118',
    });

    // D1: echo positive control (no session).
    const r1: any = await executeTool('echo', { text: 'probe-119' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-119',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-119')}`,
      pass: r1?.ok === true && out1.includes('probe-119'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // H4: run_command re-pin (gate verdict).
    const rh: any = await executeTool('run_command', { action: 'list' }, attr);
    const eh = String(rh?.error || '');
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required' (gate before handler guard)",
      actual: `ok=${rh?.ok} error=${eh.slice(0, 110)}`,
      pass: rh?.ok === false && eh === 'approval_required',
      detail: 'T5-117 divergent-shadow guard; hardcoded :429 -> shell_execute; empty-cmd HIGH -> gate; nothing executed',
    });

    // T0: unscoped list baseline in a fresh process.
    const rt0: any = await executeTool('terminal_manager', { action: 'list' }, attr);
    const t0list = (rt0?.output as any)?.terminals;
    results.push({
      case: 'T0-terminal-list-empty', expect: 'ok=true terminals=[]',
      actual: `ok=${rt0?.ok} terminals=${JSON.stringify(t0list)} error=${rt0?.error ?? 'none'}`,
      pass: rt0?.ok === true && Array.isArray(t0list) && t0list.length === 0,
      detail: 'fresh hermetic process; baseline for T1-W/R/K chain; also proves TID_NEVER is unheld for W3/K0 safety',
    });

    // T1: session-scoped create.
    const rt1: any = await executeTool('terminal_manager', { action: 'create' }, ctxA);
    const t1id = (rt1?.output as any)?.id;
    const t1ok = rt1?.ok === true && t1id === TID_A;
    results.push({
      case: 'T1-session-create', expect: `ok=true id='${TID_A}'`,
      actual: `ok=${rt1?.ok} id=${t1id} fallback=${(rt1?.output as any)?.fallback} error=${String(rt1?.error || '').slice(0, 100)}`,
      pass: t1ok,
      detail: 'TaskInteractionTools.ts:73-77: ownerSessionId forces terminal:<sid>; real PTY spawn, killed in-probe by K1',
    });
    if (!t1ok) {
      for (const c of ['W1-unscoped-write-no-command', 'W2-scopedB-write-no-command', 'W3-unscoped-write-missing-id', 'R1-unscoped-resize-owned', 'R2-scopedB-resize-missing', 'K0-unscoped-kill-never-id', 'K1-unscoped-kill-owned', 'K2-session-read-after-kill', 'K3-final-list-empty']) {
        results.push({ case: c, expect: 'SKIPPED (T1 create not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
      }
    } else {
      // W1: unscoped write, no command -> handler guard.
      const rw1: any = await executeTool('terminal_manager', { action: 'write', id: TID_A }, attr);
      results.push({
        case: 'W1-unscoped-write-no-command', expect: "ok=false error='command input required'",
        actual: `ok=${rw1?.ok} error=${String(rw1?.error || '').slice(0, 90)}`,
        pass: rw1?.ok === false && String(rw1?.error || '') === 'command input required',
        detail: 'WRITE-GUARD pin: handler :135 reached unscoped with explicit id; no owner gate before it; nothing executed',
      });
      // W2: scoped-B write, no command -> same guard.
      const rw2: any = await executeTool('terminal_manager', { action: 'write' }, ctxB);
      results.push({
        case: 'W2-scopedB-write-no-command', expect: "ok=false error='command input required'",
        actual: `ok=${rw2?.ok} error=${String(rw2?.error || '').slice(0, 90)}`,
        pass: rw2?.ok === false && String(rw2?.error || '') === 'command input required',
        detail: 'guard is id-independent: same verdict for derived-missing terminal:sess-B-119',
      });
      // W3: unscoped write WITH command to never-existing id -> silent ok.
      const rw3: any = await executeTool('terminal_manager', { action: 'write', id: TID_NEVER, command: 'echo probe-119-never-sent' }, attr);
      results.push({
        case: 'W3-unscoped-write-missing-id', expect: 'ok=true (silent no-op on missing id)',
        actual: `ok=${rw3?.ok} error=${rw3?.error ?? 'none'} output=${JSON.stringify(rw3?.output).slice(0, 90)}`,
        pass: rw3?.ok === true,
        detail: 'SILENT-WRITE pin: kernel sendInput :106-110 returns silently on missing id; verdict indistinguishable from delivered write; nothing executed (no PTY holds the id per T0)',
      });
      // R1: unscoped resize of the OWNED probe PTY.
      const rr1: any = await executeTool('terminal_manager', { action: 'resize', id: TID_A, cols: 81, rows: 31 }, attr);
      results.push({
        case: 'R1-unscoped-resize-owned', expect: 'ok=true',
        actual: `ok=${rr1?.ok} error=${rr1?.error ?? 'none'} output=${JSON.stringify(rr1?.output).slice(0, 90)}`,
        pass: rr1?.ok === true,
        detail: 'RESIZE pin: handler :141-145 has no validation and no owner consult; kernel resized the owned probe PTY (harmless; killed in-probe by K1)',
      });
      // R2: scoped-B resize -> silent ok (missing id no-op).
      const rr2: any = await executeTool('terminal_manager', { action: 'resize', cols: 81, rows: 31 }, ctxB);
      results.push({
        case: 'R2-scopedB-resize-missing', expect: 'ok=true (silent no-op on missing id)',
        actual: `ok=${rr2?.ok} error=${rr2?.error ?? 'none'} output=${JSON.stringify(rr2?.output).slice(0, 90)}`,
        pass: rr2?.ok === true,
        detail: 'SILENT-RESIZE pin: kernel :125-126 returns silently on missing id — same verdict as R1 real resize',
      });
      // K0: unscoped kill of never-existing id -> silent ok.
      const rk0: any = await executeTool('terminal_manager', { action: 'kill', id: TID_NEVER }, attr);
      results.push({
        case: 'K0-unscoped-kill-never-id', expect: 'ok=true (silent no-op on missing id)',
        actual: `ok=${rk0?.ok} error=${rk0?.error ?? 'none'} output=${JSON.stringify(rk0?.output).slice(0, 90)}`,
        pass: rk0?.ok === true,
        detail: 'SILENT-KILL pin: kernel :149-150 returns silently; a kill verdict alone is not evidence of effect',
      });
      // K1: unscoped kill of the OWNED probe PTY.
      const rk1: any = await executeTool('terminal_manager', { action: 'kill', id: TID_A }, attr);
      results.push({
        case: 'K1-unscoped-kill-owned', expect: 'ok=true',
        actual: `ok=${rk1?.ok} error=${rk1?.error ?? 'none'} output=${JSON.stringify(rk1?.output).slice(0, 90)}`,
        pass: rk1?.ok === true,
        detail: 'KILL pin: kernel removeTerminal + kill :152-161 ran on the owned probe PTY via the unscoped path; distinguished from K0 silent no-op by K2',
      });
      // K2: read after kill -> Terminal not found (the only action that reports missing).
      const rk2: any = await executeTool('terminal_manager', { action: 'read' }, ctxA);
      results.push({
        case: 'K2-session-read-after-kill', expect: "ok=false error='Terminal not found'",
        actual: `ok=${rk2?.ok} error=${String(rk2?.error || '').slice(0, 90)}`,
        pass: rk2?.ok === false && String(rk2?.error || '') === 'Terminal not found',
        detail: 'kill verified: readHistory :167-171 throws on missing — the ONLY terminal action that reports a missing id instead of silent-ok',
      });
      // K3: final unscoped list -> empty.
      const rk3: any = await executeTool('terminal_manager', { action: 'list' }, attr);
      const k3list = (rk3?.output as any)?.terminals;
      results.push({
        case: 'K3-final-list-empty', expect: 'ok=true terminals=[]',
        actual: `ok=${rk3?.ok} terminals=${JSON.stringify(k3list)} error=${rk3?.error ?? 'none'}`,
        pass: rk3?.ok === true && Array.isArray(k3list) && k3list.length === 0,
        detail: 'cleanup verified: zero residue in-process',
      });
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-119-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-119-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
