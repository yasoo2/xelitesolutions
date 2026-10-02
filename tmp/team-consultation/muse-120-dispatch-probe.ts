/**
 * MUSE wiring audit 120 — dispatch-reachability battery: memory family
 * (recall_memory + memorize_codebase) first live executeTool proof (Level 4).
 *
 * Prior coverage was match-layer only (065: recall_memory NOT surfaced by
 * capableTools for "Remember that the user prefers ...") plus catalogue
 * mentions (076/077/108). No live dispatch proof existed for either tool.
 * Every expectation below was derived from source BEFORE the run:
 *
 * RUN-2 (disclosed; run-1 receipts preserved as .run1.*.log): run-1 went
 * 7/13 — two probe bugs (R2 query contained the digit token '120' shared
 * with every fixture filename; M2 expected singular '1 file' but the
 * message is always plural) plus a REAL product finding: M0/R0 proved the
 * registered MemoryTool.ts guards NEVER fire on the canonical path because
 * ToolService.ts:571-608 still carries the pre-registry special-case shim
 * that returns early (before the :623 dispatch envelope, :764 attribution,
 * :772 approval gate and :787 rate limit). The MemoryTool.ts header comment
 * claiming the work moved out of ToolService is stale. M0/R0 are re-pinned
 * below to the SHIM's actual verdicts and S3 pins the envelope bypass
 * differentially. No source was edited; the finding is OBS-120-1.
 *
 *   M0 memorize_codebase {directory:<missing>} (no session)
 *      -> ok=true, output='Successfully indexed 0 files into Deep Memory.'
 *      (SHIM pin: ToolService.ts:583-608 has no missing-dir guard; glob
 *      with a nonexistent cwd yields []; the registered MemoryTool.ts:88-90
 *      guard is shadowed. Nothing indexed, but verdict is success.)
 *   M1 memorize_codebase {directory:<sbx>/memfix120} with ctxA
 *      -> ok=true, output='Successfully indexed 2 files into Deep Memory.'
 *      (glob **\/*.{ts,...,md} :93-95 over the 2-file fixture; vectorDb
 *      clear() :96 then addDocument per file :98-106.)
 *   R0 recall_memory {query:''} -> ok=true, output='No relevant memory
 *      found.' (SHIM pin: ToolService.ts:571-581 has no empty-query guard;
 *      search('') tokenizes empty -> []; the registered MemoryTool.ts:45-47
 *      guard is shadowed. Nothing searched, but verdict is success.)
 *   R1 recall_memory {query:'quokka zephyr filament'} with ctxB on a
 *      DIFFERENT workspace (probe-ws-120b)
 *      -> ok=true, output contains 'alpha-120' + 'quokka' (hit on the
 *      alpha fixture doc; CROSS-WORKSPACE pin when it hits: memorized
 *      under ws-A, recalled under ws-B — vectorDb is a process-global
 *      singleton :138 with no workspace key.)
 *   R2 recall_memory {query:'qqqzzz nomatch wwww'} -> ok=true,
 *      output='No relevant memory found.' (shim :577 empty-result branch;
 *      run-1 query wrongly contained digit token '120', shared with every
 *      fixture filename — fixed to digit-free tokens with zero doc overlap.)
 *   R3 recall_memory {query:'memfixcommon', limit:1} -> ok=true, output
 *      has NO '\n---\n' separator (both fixture docs match the shared
 *      token with score>0.05, slice(0,1) :124-127 truncates to one
 *      block — limit-contract pin.)
 *   M2 memorize_codebase {directory:<sbx>/memfix120b} (single gamma
 *      file, disjoint tokens) -> ok=true, 'indexed 1 files' (message is
 *      always plural in BOTH copies — run-1 expected singular; fixed).
 *   R5 recall_memory {query:'quokka zephyr filament'} again -> ok=true,
 *      'No relevant memory found.' (REPLACE-NOT-MERGE pin: clear() :96
 *      wipes the prior index on every memorize run.)
 *   M3 index-file containment: <sbx>/data/memory/index.json exists,
 *      parses, holds exactly 1 doc whose metadata.filePath contains
 *      'gamma' (post-M2 state on disk; proves the CWD-scoped store).
 *
 *   S3 envelope-differential: D1 echo's returned logs CONTAIN a 'start
 *      echo' line (registered path :623) while M1 memorize's returned
 *      logs contain NO 'start ' line at all (shim returns before :623 —
 *      hence before attribution :764, approval :772 and rate limit :787;
 *      gate bypass is source-order-proven from the live envelope pin).
 *
 * Controls carried: P0 (bypass OFF + non-system + contained + CWD PIN:
 * process.cwd() must sit under JOE_TEST_TMP_ROOT, which forces
 * vectorDb storagePath 'data/memory' :19-20 into the sandbox — the
 * REAL api/data/memory/index.json is never touched), D0
 * (registered=163), D1 (echo positive + stashes its logs for S3), H4
 * (run_command -> approval_required divergent-shadow guard).
 *
 * Risk derivation (SUPERSEDED by run-1 finding): classifyToolRisk :142-203
 * would rate both tools 'medium' (no special branch), but the rating is
 * NEVER CONSULTED for them — the :571-608 shim returns before the :772
 * gate. S3 pins this live via the missing :623 envelope line.
 *
 * Safety: same isolated tsx method as 110-119 — canonical test env
 * (setup.ts: JSON persistence, mock DB, network fetch guard), bypass
 * OFF (hermetic), full attribution, zero network, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-120
 * AND process CWD = the sandbox dir itself (vectorDb store +
 * fixtures all inside it). NO AUTO_APPROVE_* set at any point. No
 * source is modified. No foreign memory is read or written: the
 * fixture dirs are probe-created and the store path is sandbox-only.
 *
 * Run from the SANDBOX dir (NOT api/: vectorDb resolves its store
 * against process.cwd(); tsx is invoked by absolute path and all
 * imports are absolute, so CWD affects only runtime relative paths):
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-120
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-120-dispatch-probe.ts
 */
import * as fs from 'fs';
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

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const attr = { workspaceId: 'probe-ws-120', userId: 'probe-user-120' } as any;
  const ctxB = { workspaceId: 'probe-ws-120b', userId: 'probe-user-120b' } as any;

  // Fixture dirs (probe-created, sandbox-only, disjoint token sets).
  const fixA = path.join(sbxRoot, 'memfix120');
  const fixB = path.join(sbxRoot, 'memfix120b');
  const missingDir = path.join(sbxRoot, 'no-such-dir-120');
  fs.mkdirSync(fixA, { recursive: true });
  fs.mkdirSync(fixB, { recursive: true });
  fs.writeFileSync(path.join(fixA, 'alpha-120.ts'),
    'quokka zephyr filament memfixcommon\ndelta axle rotor spindle\n');
  fs.writeFileSync(path.join(fixA, 'beta-120.md'),
    'harbor lantern ledger memfixcommon\nmanifold beacon anvil\n');
  fs.writeFileSync(path.join(fixB, 'gamma-120.md'),
    'tundra compass voyage beacon\nharborless uplink cairn\n');

  await executionFirewall.runInContext('muse-120-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c}`,
      pass: p0a && p0b && p0c, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    // D0: registration count re-observed.
    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-119',
    });

    // D1: echo positive control (no session). Stash logs for S3.
    const r1: any = await executeTool('echo', { text: 'probe-120' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    const d1logs = Array.isArray((r1 as any)?.logs) ? ((r1 as any).logs as any[]).map(String).join('\n') : '';
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-120',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-120')}`,
      pass: r1?.ok === true && out1.includes('probe-120'),
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

    // M0: memorize a missing directory -> shim success (run-2 re-pin).
    const rm0: any = await executeTool('memorize_codebase', { directory: missingDir }, attr);
    const om0 = String(rm0?.output ?? rm0?.error ?? '');
    results.push({
      case: 'M0-memorize-missing-dir', expect: "ok=true output='Successfully indexed 0 files into Deep Memory.' (shim, no guard)",
      actual: `ok=${rm0?.ok} output=${om0.slice(0, 90)}`,
      pass: rm0?.ok === true && om0 === 'Successfully indexed 0 files into Deep Memory.',
      detail: 'SHIM pin: ToolService.ts:583-608 has no missing-dir guard; glob nonexistent cwd yields []; registered MemoryTool.ts:88-90 guard shadowed; nothing indexed but verdict is success (OBS-120-1)',
    });

    // M1: memorize the 2-file fixture under ws-A. Stash logs for S3.
    const rm1: any = await executeTool('memorize_codebase', { directory: fixA }, attr);
    const om1 = String(rm1?.output ?? rm1?.error ?? '');
    const m1logs = Array.isArray((rm1 as any)?.logs) ? ((rm1 as any).logs as any[]).map(String).join('\n') : 'NO_LOGS_ARRAY';
    const m1ok = rm1?.ok === true && om1 === 'Successfully indexed 2 files into Deep Memory.';
    results.push({
      case: 'M1-memorize-fixture', expect: "ok=true output='Successfully indexed 2 files into Deep Memory.'",
      actual: `ok=${rm1?.ok} output=${om1.slice(0, 90)}`,
      pass: m1ok,
      detail: 'glob **/*.{ts,...,md} :93-95 over probe fixture; vectorDb clear :96 + addDocument per file; store=<sbx>/data/memory per P0 cwd pin',
    });
    if (!m1ok) {
      for (const c of ['R0-recall-empty-query', 'R1-recall-hit-cross-workspace', 'R2-recall-miss', 'R3-recall-limit-one', 'M2-rememorize-replaces', 'R5-recall-stale-after-replace', 'M3-index-file-contained', 'S3-envelope-differential']) {
        results.push({ case: c, expect: 'SKIPPED (M1 memorize not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
      }
    } else {
      // R0: empty query -> shim success (run-2 re-pin).
      const rr0: any = await executeTool('recall_memory', { query: '' }, attr);
      const or0 = String(rr0?.output ?? rr0?.error ?? '');
      results.push({
        case: 'R0-recall-empty-query', expect: "ok=true output='No relevant memory found.' (shim, no guard)",
        actual: `ok=${rr0?.ok} output=${or0.slice(0, 90)}`,
        pass: rr0?.ok === true && or0 === 'No relevant memory found.',
        detail: 'SHIM pin: ToolService.ts:571-581 has no empty-query guard; search tokenizes empty to []; registered MemoryTool.ts:45-47 guard shadowed; nothing searched but verdict is success (OBS-120-1)',
      });
      // R1: cross-workspace recall hit (memorized ws-A, recalled ws-B).
      const rr1: any = await executeTool('recall_memory', { query: 'quokka zephyr filament' }, ctxB);
      const or1 = String(rr1?.output ?? rr1?.error ?? '');
      results.push({
        case: 'R1-recall-hit-cross-workspace', expect: "ok=true output_contains_alpha-120+quokka (ctxB other workspace)",
        actual: `ok=${rr1?.ok} has_alpha=${or1.includes('alpha-120')} has_quokka=${or1.includes('quokka')}`,
        pass: rr1?.ok === true && or1.includes('alpha-120') && or1.includes('quokka'),
        detail: 'HIT pin + CROSS-WORKSPACE pin when green: vectorDb singleton :138 has no workspace key; Jaccard>0.05 on alpha-only tokens',
      });
      // R2: no-match query -> honest empty branch (run-2: digit-free query).
      const rr2: any = await executeTool('recall_memory', { query: 'qqqzzz nomatch wwww' }, attr);
      const or2 = String(rr2?.output ?? rr2?.error ?? '');
      results.push({
        case: 'R2-recall-miss', expect: "ok=true output='No relevant memory found.'",
        actual: `ok=${rr2?.ok} output=${or2.slice(0, 90)}`,
        pass: rr2?.ok === true && or2 === 'No relevant memory found.',
        detail: 'EMPTY pin: MemoryTool.ts:53 branch; zero docs above score 0.05',
      });
      // R3: shared-token query with limit 1 -> single block.
      const rr3: any = await executeTool('recall_memory', { query: 'memfixcommon', limit: 1 }, attr);
      const or3 = String(rr3?.output ?? rr3?.error ?? '');
      results.push({
        case: 'R3-recall-limit-one', expect: 'ok=true output_has_no_separator (slice(0,1))',
        actual: `ok=${rr3?.ok} has_separator=${or3.includes('\n---\n')} len=${or3.length}`,
        pass: rr3?.ok === true && !or3.includes('\n---\n') && or3.length > 0,
        detail: 'LIMIT pin: vectorDb.ts:124-127 slice(0,limit); both fixture docs match the shared token above 0.05',
      });
      // M2: re-memorize the single-gamma dir (replace, not merge).
      const rm2: any = await executeTool('memorize_codebase', { directory: fixB }, attr);
      const om2 = String(rm2?.output ?? rm2?.error ?? '');
      const m2ok = rm2?.ok === true && om2 === 'Successfully indexed 1 files into Deep Memory.';
      results.push({
        case: 'M2-rememorize-replaces', expect: "ok=true output='Successfully indexed 1 files into Deep Memory.' (always plural)",
        actual: `ok=${rm2?.ok} output=${om2.slice(0, 90)}`,
        pass: m2ok,
        detail: 'vectorDb.clear() :96 runs on every memorize; gamma tokens disjoint from quokka family',
      });
      // R5: stale-token recall after replace -> miss.
      const rr5: any = await executeTool('recall_memory', { query: 'quokka zephyr filament' }, attr);
      const or5 = String(rr5?.output ?? rr5?.error ?? '');
      results.push({
        case: 'R5-recall-stale-after-replace', expect: "ok=true output='No relevant memory found.'",
        actual: `ok=${rr5?.ok} output=${or5.slice(0, 90)}`,
        pass: m2ok && rr5?.ok === true && or5 === 'No relevant memory found.',
        detail: 'REPLACE-NOT-MERGE pin: prior alpha/beta docs wiped by M2 clear(); gated on M2 ok',
      });
      // M3: on-disk store is sandbox-scoped and holds post-M2 state.
      let m3actual = 'unread';
      let m3pass = false;
      try {
        const idxFile = path.join(sbxRoot, 'data', 'memory', 'index.json');
        const raw = fs.readFileSync(idxFile, 'utf-8');
        const docs = JSON.parse(raw);
        const fps = Array.isArray(docs) ? docs.map((d: any) => String(d?.metadata?.filePath || '')) : [];
        m3actual = `docs=${fps.length} files=${fps.join(',').slice(0, 120)}`;
        m3pass = m2ok && fps.length === 1 && fps[0].includes('gamma');
      } catch (e: any) {
        m3actual = `read_error=${String(e?.message || e).slice(0, 100)}`;
      }
      results.push({
        case: 'M3-index-file-contained', expect: 'sbx index.json parses, exactly 1 doc, gamma filePath',
        actual: m3actual,
        pass: m3pass,
        detail: 'STORE pin: default storageDir data/memory resolved under P0-pinned sandbox CWD; real api/data/memory/index.json never in the write path',
      });
      // S3: envelope differential — shim returns before the :623 log line.
      const s3echo = d1logs.includes('start echo');
      const s3mem = !m1logs.includes('start ');
      results.push({
        case: 'S3-envelope-differential', expect: 'echo_logs_have_start_echo AND memorize_logs_have_no_start',
        actual: `echo_has_start=${s3echo} memorize_has_no_start=${s3mem} memorize_logs_len=${m1logs.length}`,
        pass: s3echo && s3mem,
        detail: 'ENVELOPE-BYPASS pin: registered path emits :623 start line, shim path emits none — live proof the :571-608 early return fires before :623, hence before attribution :764, approval :772 and rate limit :787 (OBS-120-1)',
      });
    }
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-120-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-120-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
