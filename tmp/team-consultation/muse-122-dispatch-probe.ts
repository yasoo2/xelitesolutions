/**
 * MUSE wiring audit 122 — dispatch-reachability battery: ai_write_file
 * guard-depth FIRST live executeTool proof + scaffold_project FIRST live
 * proof + the first live rate_limiter pin (Level 4).
 *
 * ai_write_file is in the self-fix repair allowlist and is the planner's
 * preferred authoring tool, yet no live dispatch proof existed for it. Its
 * handler calls a real LLM past the guard, so every ai_write case below
 * stays on the PRE-LLM surface (missing/blank fields -> the exact guard
 * message, which also proves medium-risk handler reachability, handler
 * self-validation instead of dispatch schema enforcement, and that
 * guard-failures consume rate quota). No valid path+description pair is
 * ever sent: zero model calls, zero network, zero spend.
 *
 * scaffold_project is the planner's greenfield foundation tool (also
 * local-only: no LLM) and had no live proof at all. The battery pins its
 * happy path, repeated-prefix strip, fatal vs non-fatal precheck split,
 * per-entry escape errors with PARTIAL-WRITE semantics, base refusal,
 * empty/vacuous scaffold, object-value coercion, cross-workspace scoping
 * and session registration.
 *
 * Same isolated tsx method as 110-121: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, zero network, CWD = the sandbox dir itself (tsx by
 * absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-122.
 * NO AUTO_APPROVE_* set at any point. No source edited.
 *
 * Expectations derived from source BEFORE the run:
 * - AIGeneratorTool.ts:690-702 guard (exact message, logs==[] at guard);
 *   :84 normalizeRuntimeArtifactPath pure ('' in -> '' out, no throw);
 *   permissions/sideEffects write -> medium -> handler reachable.
 * - ToolService.ts:257 {...input} (null-safe); :285 context spread
 *   (sessionId passes through); :787-793 rate check BEFORE execute
 *   (guard-failures consume quota); :73-92 bucket=name, limit 60,
 *   calendar-minute window, retryAfterMs numeric.
 * - SystemTools.ts ScaffoldProjectTool :1374-1478: baseDir safePath
 *   refusal (:1398-1399, no output key); repeated-prefix strip
 *   (:1381-1393, silent); fatal precheck only when reason is NOT
 *   invalid_path (:1414); per-entry safePath errors collected, loop
 *   continues (:1436-1437); String(content) coercion (:1448);
 *   ok = errors.length===0 (:1477); session registration + projectDir
 *   (:1460-1477); page-store persists under CWD/data/db (contained).
 * - file-write-contract.ts:69-130: invalid_path for ../-escape,
 *   non-string values, absolute paths (:84-89); target_is_directory for
 *   null structural names (:99-100); vacuous {} -> ok.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-122
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-122-dispatch-probe.ts
 *
 * RUN-2 (disclosed; run-1 receipts preserved as .run1.*.log): run-1 went
 * 18/21 — A1/S4/S6 missed on the ToolService envelope, all three PROBE
 * BUGS (expectations), not product findings. Source re-read AFTER run-1
 * (ToolService.ts:878-881 + :963 + :929): the dispatch return keeps ONLY
 * {ok, output, logs, artifacts, error}; output defaults to null when the
 * handler returns none; ToolService's own start line always precedes
 * handler logs. A1/S4 now pin output===null + the start line; S6 now
 * pins the envelope strip itself (reason/repairHint absent top-level) as
 * OBS-122-1. Run-2 uses a FRESH sandbox (sbx-tmp-122b); run-1's tree is
 * preserved untouched.
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

const AI_GUARD = 'ai_write_file needs both a path and a description of what the file should contain — no model was called.';

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const wsA = path.join(extRoot, 'probe-ws-122');
  const wsB = path.join(extRoot, 'probe-ws-122b');
  const attr = { workspaceId: 'probe-ws-122', userId: 'probe-user-122' } as any;
  const ctxB = { workspaceId: 'probe-ws-122b', userId: 'probe-user-122b' } as any;
  const sessAttr = { workspaceId: 'probe-ws-122', userId: 'probe-user-122', sessionId: 'probe-sess-122' } as any;

  await executionFirewall.runInContext('muse-122-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d}`,
      pass: p0a && p0b && p0c && !!p0d, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-121',
    });

    const r1: any = await executeTool('echo', { text: 'probe-122' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-122',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-122')}`,
      pass: r1?.ok === true && out1.includes('probe-122'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    const rh: any = await executeTool('run_command', { action: 'list' }, attr);
    const eh = String(rh?.error || '');
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required' (gate before handler guard)",
      actual: `ok=${rh?.ok} error=${eh.slice(0, 110)}`,
      pass: rh?.ok === false && eh === 'approval_required',
      detail: 'T5-117 divergent-shadow guard re-pin; nothing executed',
    });

    // A1: empty input -> exact handler guard (medium reachability +
    // self-validation pin: a dispatch schema error would look different).
    const a1: any = await executeTool('ai_write_file', {}, attr);
    const a1logs: string[] = Array.isArray((a1 as any)?.logs) ? ((a1 as any).logs as any[]).map(String) : [];
    const a1start = a1logs.length === 1 && a1logs[0].includes('start ai_write_file (orig=ai_write_file)');
    const a1ok = a1?.ok === false && String(a1?.error || '') === AI_GUARD
      && a1start && (a1 as any)?.output === null;
    results.push({
      case: 'A1-ai-guard-empty', expect: 'ok=false exact-guard AND 1 start-line log AND output===null',
      actual: `ok=${a1?.ok} err_match=${String(a1?.error || '') === AI_GUARD} logs=${JSON.stringify(a1logs).slice(0, 120)} output=${JSON.stringify((a1 as any)?.output)}`,
      pass: a1ok,
      detail: 'GUARD pin :696-702 + ENVELOPE pin :623/:879/:929/:963 (ToolService start line + null output); handler ran (not approval_required/unknown_tool) so ai_write_file dispatches medium; required-schema enforced by handler, not dispatch (OBS-111-2 third pin)',
    });

    // A2: path only -> same guard.
    const a2: any = await executeTool('ai_write_file', { path: 'a122-only-path.txt' }, attr);
    results.push({
      case: 'A2-ai-guard-path-only', expect: 'ok=false exact-guard',
      actual: `ok=${a2?.ok} err_match=${String(a2?.error || '') === AI_GUARD}`,
      pass: a2?.ok === false && String(a2?.error || '') === AI_GUARD,
      detail: 'GUARD pin: description required; no model call, nothing written',
    });

    // A3: description only -> same guard.
    const a3: any = await executeTool('ai_write_file', { description: 'write hello 122' }, attr);
    results.push({
      case: 'A3-ai-guard-description-only', expect: 'ok=false exact-guard',
      actual: `ok=${a3?.ok} err_match=${String(a3?.error || '') === AI_GUARD}`,
      pass: a3?.ok === false && String(a3?.error || '') === AI_GUARD,
      detail: 'GUARD pin: path required; normalizeRuntimeArtifactPath(\'\') is pure, no throw',
    });

    // A4: whitespace-only -> same guard (trim pin).
    const a4: any = await executeTool('ai_write_file', { path: '   ', description: '   ' }, attr);
    results.push({
      case: 'A4-ai-guard-whitespace', expect: 'ok=false exact-guard (trim)',
      actual: `ok=${a4?.ok} err_match=${String(a4?.error || '') === AI_GUARD}`,
      pass: a4?.ok === false && String(a4?.error || '') === AI_GUARD,
      detail: 'TRIM pin :689/:695 String().trim() before the guard',
    });

    // A5: mixed valid-path + empty-description -> same guard.
    const a5: any = await executeTool('ai_write_file', { path: 'a122-mixed.txt', description: '' }, attr);
    results.push({
      case: 'A5-ai-guard-mixed', expect: 'ok=false exact-guard',
      actual: `ok=${a5?.ok} err_match=${String(a5?.error || '') === AI_GUARD}`,
      pass: a5?.ok === false && String(a5?.error || '') === AI_GUARD,
      detail: 'GUARD pin: BOTH fields required (:696 ||); a half-valid brief never reaches the model',
    });

    // A6: guard calls wrote nothing.
    let a6entries: string[] = [];
    try { a6entries = fs.existsSync(wsA) ? fs.readdirSync(wsA) : []; } catch { a6entries = ['UNREADABLE']; }
    const a6ok = !a6entries.some((e) => e.includes('a122'));
    results.push({
      case: 'A6-ai-guard-wrote-nothing', expect: 'no a122* entries under wsA after A1-A5',
      actual: `wsA_entries=${JSON.stringify(a6entries).slice(0, 160)}`,
      pass: a6ok,
      detail: 'NO-WRITE pin: the guard precedes the context pack, the model call and every write',
    });

    // A6b: null input -> same guard ({...null} == {} at :257).
    const a6b: any = await executeTool('ai_write_file', null as any, attr);
    results.push({
      case: 'A6b-ai-guard-null-input', expect: 'ok=false exact-guard',
      actual: `ok=${a6b?.ok} err_match=${String(a6b?.error || '') === AI_GUARD}`,
      pass: a6b?.ok === false && String(a6b?.error || '') === AI_GUARD,
      detail: 'NULL pin: ToolService :257 spread tolerates null; handler input?.path guard holds',
    });

    // S1: scaffold happy path (plain node, no react evidence -> unchanged).
    const s1: any = await executeTool('scaffold_project', {
      baseDir: 'sc122-proj',
      structure: {
        'package.json': '{"name":"sc122-job"}',
        'src/index.js': 'console.log("sc122");\n',
        'emptydir': null,
      },
    }, attr);
    const s1out = (s1 as any)?.output || {};
    const s1created: string[] = Array.isArray(s1out.created) ? s1out.created.map(String) : [];
    let s1pkg = 'UNREADABLE'; let s1idx = 'UNREADABLE';
    try { s1pkg = fs.readFileSync(path.join(wsA, 'sc122-proj', 'package.json'), 'utf-8'); } catch { /* keep */ }
    try { s1idx = fs.readFileSync(path.join(wsA, 'sc122-proj', 'src', 'index.js'), 'utf-8'); } catch { /* keep */ }
    const s1dir = path.join(wsA, 'sc122-proj', 'emptydir');
    const s1ok = s1?.ok === true
      && s1created.length === 3 && s1created[0] === 'package.json' && s1created[1] === 'src/index.js' && s1created[2] === 'emptydir/'
      && s1pkg === '{"name":"sc122-job"}' && s1idx === 'console.log("sc122");\n'
      && fs.existsSync(s1dir) && fs.statSync(s1dir).isDirectory();
    results.push({
      case: 'S1-scaffold-happy', expect: 'ok=true created==[package.json,src/index.js,emptydir/] AND disk-exact AND emptydir is dir',
      actual: `ok=${s1?.ok} created=${JSON.stringify(s1created)} pkg=${JSON.stringify(s1pkg).slice(0, 40)} emptydir=${fs.existsSync(s1dir)}`,
      pass: s1ok,
      detail: 'HAPPY pin: medium dispatch -> handler; null value creates a directory (:1440-1444); plain manifest leaves normalizeReact unchanged',
    });

    // S2: repeated baseDir prefix stripped silently.
    const s2: any = await executeTool('scaffold_project', {
      baseDir: 'rp122',
      structure: { 'rp122/a.txt': 'A122', 'rp122/b.txt': 'B122' },
    }, attr);
    const s2created: string[] = Array.isArray((s2 as any)?.output?.created) ? ((s2 as any).output.created as any[]).map(String) : [];
    let s2a = 'UNREADABLE';
    try { s2a = fs.readFileSync(path.join(wsA, 'rp122', 'a.txt'), 'utf-8'); } catch { /* keep */ }
    const s2nested = fs.existsSync(path.join(wsA, 'rp122', 'rp122'));
    const s2ok = s2?.ok === true && s2created.length === 2 && s2created[0] === 'a.txt' && s2created[1] === 'b.txt'
      && s2a === 'A122' && s2nested === false;
    results.push({
      case: 'S2-scaffold-prefix-strip', expect: "ok=true created==[a.txt,b.txt] AND lands in rp122/ AND no rp122/rp122",
      actual: `ok=${s2?.ok} created=${JSON.stringify(s2created)} a=${JSON.stringify(s2a)} nested=${s2nested}`,
      pass: s2ok,
      detail: 'STRIP pin :1381-1393: the one repeated model prefix is removed, not doubled (silent: no log line)',
    });

    // S3: per-entry deep escape -> collected error + PARTIAL write.
    const s3outside = path.resolve(wsA, 'esc122', '../../../../../deep122.txt');
    const s3: any = await executeTool('scaffold_project', {
      baseDir: 'esc122',
      structure: { 'ok122.txt': 'ok', '../../../../../deep122.txt': 'evil122' },
    }, attr);
    const s3out = (s3 as any)?.output || {};
    const s3created: string[] = Array.isArray(s3out.created) ? s3out.created.map(String) : [];
    const s3errors: string[] = Array.isArray(s3out.errors) ? s3out.errors.map(String) : [];
    let s3ok = 'UNREADABLE';
    try { s3ok = fs.readFileSync(path.join(wsA, 'esc122', 'ok122.txt'), 'utf-8'); } catch { /* keep */ }
    const s3pass = s3?.ok === false && s3created.length === 1 && s3created[0] === 'ok122.txt'
      && s3errors.length === 1 && s3errors[0].includes('path_outside_workspace')
      && s3ok === 'ok' && !fs.existsSync(s3outside);
    results.push({
      case: 'S3-scaffold-partial-escape', expect: 'ok=false AND created==[ok122.txt] AND 1 path_outside_workspace error AND outside absent',
      actual: `ok=${s3?.ok} created=${JSON.stringify(s3created)} err=${JSON.stringify(s3errors).slice(0, 160)} outside_absent=${!fs.existsSync(s3outside)}`,
      pass: s3pass,
      detail: `PARTIAL-WRITE pin: invalid_path is non-fatal at precheck (:1414), the loop collects the refusal and still writes siblings (:1436-1437); outside=${s3outside} read-only absent`,
    });

    // S4: baseDir itself escapes -> immediate refusal, no output key.
    const s4outside = path.resolve(wsA, '../../../../../sc122-refused');
    const s4: any = await executeTool('scaffold_project', {
      baseDir: '../../../../../sc122-refused',
      structure: { 'x.txt': 'x' },
    }, attr);
    const s4err = String(s4?.error || '');
    const s4ok = s4?.ok === false && s4err.includes('path_outside_workspace') && (s4 as any)?.output === null && !fs.existsSync(s4outside);
    results.push({
      case: 'S4-scaffold-base-refused', expect: 'ok=false path_outside_workspace AND output===null AND outside absent',
      actual: `ok=${s4?.ok} err=${s4err.slice(0, 120)} output=${JSON.stringify((s4 as any)?.output)} outside_absent=${!fs.existsSync(s4outside)}`,
      pass: s4ok,
      detail: 'BASE-REFUSAL pin :1398-1399: safePath rejects before validation/loop; nothing created anywhere (second null-output envelope pin)',
    });

    // S5: empty structure -> vacuous success, base dir NOT created.
    const s5: any = await executeTool('scaffold_project', { baseDir: 'empty122', structure: {} }, attr);
    const s5out = (s5 as any)?.output || {};
    const s5ok = s5?.ok === true && Array.isArray(s5out.created) && s5out.created.length === 0
      && Array.isArray(s5out.errors) && s5out.errors.length === 0
      && !fs.existsSync(path.join(wsA, 'empty122'));
    results.push({
      case: 'S5-scaffold-empty', expect: 'ok=true created==[] errors==[] AND base dir absent on disk',
      actual: `ok=${s5?.ok} created=${JSON.stringify(s5out.created)} errors=${JSON.stringify(s5out.errors)} basedir=${fs.existsSync(path.join(wsA, 'empty122'))}`,
      pass: s5ok,
      detail: 'VACUOUS pin: {} validates clean and the base dir is only ever created as a parent of entries',
    });

    // S6: null structural name -> FATAL precheck with repairHint.
    const s6: any = await executeTool('scaffold_project', {
      baseDir: 'fat122',
      structure: { 'package.json': null },
    }, attr);
    const s6out = (s6 as any)?.output || {};
    const s6outErrs: string[] = Array.isArray(s6out.errors) ? (s6out.errors as any[]).map(String) : [];
    const s6ok = s6?.ok === false
      && String(s6?.error || '') === 'authored_path_structure_conflict:target_is_directory:package.json'
      && !('reason' in (s6 as any)) && !('repairHint' in (s6 as any))
      && s6outErrs.length === 1 && s6outErrs[0] === String(s6?.error || '')
      && Array.isArray(s6out.created) && s6out.created.length === 0
      && !fs.existsSync(path.join(wsA, 'fat122'));
    results.push({
      case: 'S6-scaffold-fatal-precheck', expect: 'ok=false exact conflict error AND reason/repairHint ABSENT top-level AND output.errors[0]==error AND nothing on disk',
      actual: `ok=${s6?.ok} err=${String(s6?.error || '').slice(0, 100)} has_reason=${'reason' in (s6 as any)} has_hint=${'repairHint' in (s6 as any)} outerr=${JSON.stringify(s6outErrs).slice(0, 100)} disk=${fs.existsSync(path.join(wsA, 'fat122'))}`,
      pass: s6ok,
      detail: 'FATAL pin :1414-1427 aborts before mkdir (contrast S3 non-fatal) + ENVELOPE-STRIP pin :963 (reason/repairHint/path/projectRoot dropped; OBS-122-1: the authored repairHint never reaches the planner)',
    });

    // S7: object value -> String() coercion lands on disk.
    const s7: any = await executeTool('scaffold_project', {
      baseDir: 'co122',
      structure: { 'weird122.txt': { a: 1 } },
    }, attr);
    let s7disk = 'UNREADABLE';
    try { s7disk = fs.readFileSync(path.join(wsA, 'co122', 'weird122.txt'), 'utf-8'); } catch { /* keep */ }
    const s7ok = s7?.ok === true && s7disk === '[object Object]';
    results.push({
      case: 'S7-scaffold-value-coercion', expect: "ok=true AND disk=='[object Object]'",
      actual: `ok=${s7?.ok} disk=${JSON.stringify(s7disk).slice(0, 60)}`,
      pass: s7ok,
      detail: 'COERCION pin: non-string values are invalid_path (non-fatal) then String(content) :1448 — a model type-slip becomes literal file content',
    });

    // S8: ctxB scaffold lands in the ctxB root (async-ctx scoping pin).
    const s8: any = await executeTool('scaffold_project', {
      baseDir: 'b122',
      structure: { 'f.txt': 'bee122' },
    }, ctxB);
    let s8disk = 'UNREADABLE';
    try { s8disk = fs.readFileSync(path.join(wsB, 'b122', 'f.txt'), 'utf-8'); } catch { /* keep */ }
    const s8leak = fs.existsSync(path.join(wsA, 'b122', 'f.txt'));
    const s8ok = s8?.ok === true && s8disk === 'bee122' && s8leak === false;
    results.push({
      case: 'S8-scaffold-cross-workspace', expect: 'ok=true AND lands in wsB AND absent from wsA',
      actual: `ok=${s8?.ok} wsB=${JSON.stringify(s8disk).slice(0, 30)} wsA_leak=${s8leak}`,
      pass: s8ok,
      detail: 'SCOPING pin: scaffold safePath resolves the ctxB root via runWithWorkspace async ctx (OBS-121-2 benign path, third live pin)',
    });

    // S9: session registration surfaces projectDir + log line.
    const s9: any = await executeTool('scaffold_project', {
      baseDir: 'sess122',
      structure: { 's.txt': 'S122' },
    }, sessAttr);
    const s9out = (s9 as any)?.output || {};
    const s9logs: string[] = Array.isArray((s9 as any)?.logs) ? ((s9 as any).logs as any[]).map(String) : [];
    const s9want = path.resolve(wsA, 'sess122');
    const s9ok = s9?.ok === true && String(s9out.projectDir || '') === s9want
      && s9logs.some((l) => l.includes('registered active project probe-sess-122'));
    results.push({
      case: 'S9-scaffold-session-register', expect: 'ok=true AND projectDir==wsA/sess122 AND registered log line',
      actual: `ok=${s9?.ok} projectDir=${String(s9out.projectDir || '').slice(0, 120)} reglog=${s9logs.some((l) => l.includes('registered active project'))}`,
      pass: s9ok,
      detail: 'SESSION pin :1460-1477: effectiveContext spread (:285) carries sessionId to the handler; joeProjects memory + contained persist under sbx data/db',
    });

    // A7 LAST: exhaust the ai_write_file minute bucket live.
    // Prior ai_write calls this process/minute: A1,A2,A3,A4,A5,A6b = 6.
    const a7startMinute = Math.floor(Date.now() / 60000);
    let a7trippedAt = -1;
    let a7retry: any = null;
    let a7preGuard = 0;
    for (let i = 0; i < 130; i++) {
      const r: any = await executeTool('ai_write_file', {}, attr);
      if (String(r?.error || '') === 'rate_limited') { a7trippedAt = i; a7retry = (r as any)?.output?.retryAfterMs; break; }
      if (r?.ok === false && String(r?.error || '') === AI_GUARD) a7preGuard++;
      else break; // unexpected shape: stop hammering, fail loudly below
    }
    const a7endMinute = Math.floor(Date.now() / 60000);
    const a7ok = a7trippedAt >= 0 && typeof a7retry === 'number' && a7retry > 0 && a7preGuard === a7trippedAt;
    results.push({
      case: 'A7-ai-rate-limit-live', expect: 'rate_limited observed with numeric retryAfterMs>0; every pre-trip call identical guard',
      actual: `tripped_loop_index=${a7trippedAt} retryAfterMs=${a7retry} pre_guard=${a7preGuard} minute=${a7startMinute}->${a7endMinute}`,
      pass: a7ok,
      detail: 'LIMITER pin :787-793: bucket=name limit=60 calendar-minute; guard-failures consume quota (check precedes execute); 130-call cap survives one minute rollover',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-122-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-122-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
