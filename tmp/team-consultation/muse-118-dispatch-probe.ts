/**
 * MUSE wiring audit 118 — dispatch-reachability battery: terminal_manager
 * SESSION-SCOPED isolation depth + :429 shadow-sibling completion (Level 3).
 *
 * Follow-up to 117 (next step named session-scoped terminal isolation
 * depth). For each target this probe executes the REAL executeTool dispatch
 * path (alias layer -> registry -> firewall -> approval gate -> handler).
 * Session identity travels in the ToolContext (the production route path:
 * TaskInteractionTools.ts:92-96 notes the route puts identity in CONTEXT).
 * Every expectation below was derived from source BEFORE the run:
 *
 *   H1 executeTool('command_execute', {action:'list'}) (no session)
 *      -> ok=false, error='approval_required'
 *      (:429 hardcoded branch rewrites to shell_execute; empty command
 *      classifies HIGH (:168 fallthrough) so the gate fires before the
 *      handler's missing-command guard (:1511). Sibling 1 of the T5-117
 *      run_command pin. Nothing executed.)
 *   H2 executeTool('exec', {action:'list'}) -> same gate verdict
 *      (sibling 2; `exec` is NOT a registered tool — no `name = 'exec'`
 *      in definitions — so the branch is a pure rename, table-silent.)
 *   H3 executeTool('terminal', {action:'list'}) -> same gate verdict
 *      (sibling 3; `terminal` is NOT a registered tool either.)
 *   H4 executeTool('run_command', {action:'list'}) -> approval_required
 *      (T5-117 winner re-pin; guards the divergent-shadow finding.)
 *   S0 terminal_manager {action:'list'} (no session, fresh process)
 *      -> ok=true, terminals=[] (baseline; listTerminals('') returns
 *      all ids, terminal-kernel.ts:176-180; fresh process holds none.)
 *   S1 create {action:'create', id:'probe-118-decoy'} with
 *      context.sessionId='sess-A-118'
 *      -> ok=true, output.id='terminal:sess-A-118'
 *      (session OVERRIDES requestedId: TaskInteractionTools.ts:73-77.
 *      Real PTY spawn; killed in-probe by S7. Conditional chain: if
 *      S1 is not ok, S2-S9 are recorded SKIPPED, not failed.)
 *   S2 list with context.sessionId='sess-A-118'
 *      -> ok=true, terminals CONTAINS 'terminal:sess-A-118'
 *      (scoped filter :176-180 exact/prefix match.)
 *   S3 list with context.sessionId='sess-B-118'
 *      -> ok=true, terminals LACKS 'terminal:sess-A-118'
 *      (cross-session list isolation.)
 *   S4 read with context.sessionId='sess-B-118'
 *      -> ok=false, error='Terminal not found'
 *      (id derives to terminal:sess-B-118 which does not exist;
 *      cross-session read isolation via id derivation.)
 *   S5 list with NO sessionId
 *      -> ok=true, terminals CONTAINS 'terminal:sess-A-118'
 *      (SCOPING pin: listTerminals('') returns ALL ids with no
 *      filter — the unscoped path sees session terminals.)
 *   S6 read {id:'terminal:sess-A-118'} with NO sessionId
 *      -> ok=true, history is string
 *      (OWNER pin: the read path derives id from requestedId and
 *      never consults registerTerminalSessionOwner — an unscoped
 *      caller naming the id explicitly reaches the session
 *      terminal. Read-only observation; nothing mutated.)
 *   S7 kill with context.sessionId='sess-A-118' -> ok=true
 *      (kernel killTerminal removes + kills :144-162.)
 *   S8 read with context.sessionId='sess-A-118'
 *      -> ok=false, error='Terminal not found' (kill verified.)
 *   S9 list with NO sessionId -> ok=true, terminals=[] (cleanup.)
 *
 * Risk derivation (ToolService.ts classifyToolRisk :142-203):
 * terminal_manager matches NO special branch -> 'medium' -> default
 * allowance; sessionId does not change risk. H1-H4 resolve to
 * shell_execute with empty command -> 'high' -> approval gate, so
 * those four must STOP at the gate (handler never runs). Every S
 * case must reach its handler.
 *
 * Safety: same isolated tsx method as 110-117 — canonical test env
 * (setup.ts: JSON persistence, mock DB), bypass OFF (hermetic), full
 * attribution, zero network, FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-118. NO AUTO_APPROVE_* set
 * at any point. S1 spawns one real PTY and S7 kills it in-probe. No
 * source is modified.
 *
 * Run from api/ with plain DOS CWD (never the workdir parameter: tsx.cmd is
 * a cmd.exe shim and rejects \\?\ paths):
 *   cd D:\Joe\muse-worktree\api
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   .\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-118-dispatch-probe.ts
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

const SID_A = 'sess-A-118';
const SID_B = 'sess-B-118';
const TID_A = `terminal:${SID_A}`;

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

  const attr = { workspaceId: 'probe-ws-118', userId: 'probe-user-118' } as any;
  const ctxA = { ...attr, sessionId: SID_A } as any;
  const ctxB = { ...attr, sessionId: SID_B } as any;
  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');

  await executionFirewall.runInContext('muse-118-probe', async () => {
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
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-117',
    });

    // D1: echo positive control (no session).
    const r1: any = await executeTool('echo', { text: 'probe-118' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-118',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-118')}`,
      pass: r1?.ok === true && out1.includes('probe-118'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    // H1-H4: :429 shadow siblings + run_command re-pin (gate verdicts).
    for (const [tag, nm] of [['H1-command-execute-shadow', 'command_execute'], ['H2-exec-shadow', 'exec'], ['H3-terminal-shadow', 'terminal'], ['H4-run-command-repin', 'run_command']] as const) {
      const rh: any = await executeTool(nm, { action: 'list' }, attr);
      const eh = String(rh?.error || '');
      results.push({
        case: tag, expect: "ok=false error='approval_required' (gate before handler guard)",
        actual: `ok=${rh?.ok} error=${eh.slice(0, 110)}`,
        pass: rh?.ok === false && eh === 'approval_required',
        detail: 'hardcoded :429 -> shell_execute; empty-cmd HIGH (:168) -> gate fires before handler :1511; nothing executed',
      });
    }

    // S0: unscoped list baseline in a fresh process.
    const rs0: any = await executeTool('terminal_manager', { action: 'list' }, attr);
    const s0list = (rs0?.output as any)?.terminals;
    results.push({
      case: 'S0-terminal-list-empty', expect: 'ok=true terminals=[]',
      actual: `ok=${rs0?.ok} terminals=${JSON.stringify(s0list)} error=${rs0?.error ?? 'none'}`,
      pass: rs0?.ok === true && Array.isArray(s0list) && s0list.length === 0,
      detail: 'fresh hermetic process; baseline for S1-S9 session chain',
    });

    // S1: session-scoped create (session overrides requestedId).
    const rs1: any = await executeTool('terminal_manager', { action: 'create', id: 'probe-118-decoy' }, ctxA);
    const s1id = (rs1?.output as any)?.id;
    const s1ok = rs1?.ok === true && s1id === TID_A;
    results.push({
      case: 'S1-session-create-overrides-id', expect: `ok=true id='${TID_A}'`,
      actual: `ok=${rs1?.ok} id=${s1id} fallback=${(rs1?.output as any)?.fallback} error=${String(rs1?.error || '').slice(0, 100)}`,
      pass: s1ok,
      detail: 'TaskInteractionTools.ts:73-77: ownerSessionId forces terminal:<sid>, requestedId ignored; real PTY spawn',
    });
    if (!s1ok) {
      for (const c of ['S2-session-list-own', 'S3-session-list-other', 'S4-session-read-other', 'S5-unscoped-list-sees-session', 'S6-unscoped-read-explicit-id', 'S7-session-kill', 'S8-session-read-after-kill', 'S9-final-list-empty']) {
        results.push({ case: c, expect: 'SKIPPED (S1 create not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
      }
    } else {
      const rs2: any = await executeTool('terminal_manager', { action: 'list' }, ctxA);
      const s2list = (rs2?.output as any)?.terminals;
      results.push({
        case: 'S2-session-list-own', expect: `ok=true terminals_contains_${TID_A}`,
        actual: `ok=${rs2?.ok} terminals=${JSON.stringify(s2list)} error=${rs2?.error ?? 'none'}`,
        pass: rs2?.ok === true && Array.isArray(s2list) && s2list.includes(TID_A),
        detail: 'scoped filter exact/prefix match (terminal-kernel.ts:176-180)',
      });
      const rs3: any = await executeTool('terminal_manager', { action: 'list' }, ctxB);
      const s3list = (rs3?.output as any)?.terminals;
      results.push({
        case: 'S3-session-list-other', expect: `ok=true terminals_lacks_${TID_A}`,
        actual: `ok=${rs3?.ok} terminals=${JSON.stringify(s3list)} error=${rs3?.error ?? 'none'}`,
        pass: rs3?.ok === true && Array.isArray(s3list) && !s3list.includes(TID_A),
        detail: 'cross-session list isolation via scoped filter',
      });
      const rs4: any = await executeTool('terminal_manager', { action: 'read' }, ctxB);
      results.push({
        case: 'S4-session-read-other', expect: "ok=false error='Terminal not found'",
        actual: `ok=${rs4?.ok} error=${String(rs4?.error || '').slice(0, 90)}`,
        pass: rs4?.ok === false && String(rs4?.error || '') === 'Terminal not found',
        detail: 'id derives to terminal:sess-B-118 (missing); cross-session read isolation via derivation',
      });
      const rs5: any = await executeTool('terminal_manager', { action: 'list' }, attr);
      const s5list = (rs5?.output as any)?.terminals;
      results.push({
        case: 'S5-unscoped-list-sees-session', expect: `ok=true terminals_contains_${TID_A}`,
        actual: `ok=${rs5?.ok} terminals=${JSON.stringify(s5list)} error=${rs5?.error ?? 'none'}`,
        pass: rs5?.ok === true && Array.isArray(s5list) && s5list.includes(TID_A),
        detail: 'SCOPING pin: listTerminals(\'\') returns ALL ids unfiltered (:176-180)',
      });
      const rs6: any = await executeTool('terminal_manager', { action: 'read', id: TID_A }, attr);
      const h6 = (rs6?.output as any)?.history;
      results.push({
        case: 'S6-unscoped-read-explicit-id', expect: 'ok=true history_is_string',
        actual: `ok=${rs6?.ok} history_type=${typeof h6} history_len=${typeof h6 === 'string' ? h6.length : -1} error=${rs6?.error ?? 'none'}`,
        pass: rs6?.ok === true && typeof h6 === 'string',
        detail: 'OWNER pin: read path never consults registerTerminalSessionOwner; explicit id reaches session terminal; read-only, nothing mutated',
      });
      const rs7: any = await executeTool('terminal_manager', { action: 'kill' }, ctxA);
      results.push({
        case: 'S7-session-kill', expect: 'ok=true',
        actual: `ok=${rs7?.ok} error=${rs7?.error ?? 'none'}`,
        pass: rs7?.ok === true,
        detail: 'kernel killTerminal removes + kills (terminal-kernel.ts:144-162)',
      });
      const rs8: any = await executeTool('terminal_manager', { action: 'read' }, ctxA);
      results.push({
        case: 'S8-session-read-after-kill', expect: "ok=false error='Terminal not found'",
        actual: `ok=${rs8?.ok} error=${String(rs8?.error || '').slice(0, 90)}`,
        pass: rs8?.ok === false && String(rs8?.error || '') === 'Terminal not found',
        detail: 'kill verified: session terminal gone',
      });
      const rs9: any = await executeTool('terminal_manager', { action: 'list' }, attr);
      const s9list = (rs9?.output as any)?.terminals;
      results.push({
        case: 'S9-final-list-empty', expect: 'ok=true terminals=[]',
        actual: `ok=${rs9?.ok} terminals=${JSON.stringify(s9list)} error=${rs9?.error ?? 'none'}`,
        pass: rs9?.ok === true && Array.isArray(s9list) && s9list.length === 0,
        detail: 'cleanup verified: zero residue in-process',
      });
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-118-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-118-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
