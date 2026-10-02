/**
 * MUSE wiring audit 126 — dispatch-reachability battery: read/inspect +
 * task-lifecycle + decision + outline + repo-read + archive-guard FIRST
 * live proofs (Level 4). Follow-up to 125 (next step named remaining
 * unprobed families outside NVIDIA ACTIVE scope: pipeline/memory/
 * planner areas NOT touched here).
 *
 * Every case stays on a SAFE surface: guard refusals, registry-miss-free
 * read-only handlers over CONTAINED seed dirs, one broadcast-only
 * lifecycle call (no WS server = safe no-op per ws.ts:593-596), one
 * pure policy-receipt decision, and read-only git status/diff in a
 * non-repo sandbox dir (fails closed, no writes). NO network is touched
 * (api_tester refuses before fetch(); dead_code npx path intentionally
 * never triggered; archive shell path intentionally never triggered), NO
 * model is called, NO browser is launched, NO vector store is opened, NO
 * spend. KnowledgeService family SKIPPED (store-root audit owed — write
 * surface unknown, would risk strays outside the sbx).
 *
 * Same isolated tsx method as 110-125: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, zero network, CWD = the sandbox dir itself (tsx by
 * absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-126.
 * NO AUTO_APPROVE_* set at any point. No source edited.
 *
 * Expectations derived from source BEFORE the run:
 * - ToolService.ts:142-203 classifyToolRisk: inspect_directory /
 *   inspect_symbol are 'low' (:198); task_lifecycle is 'low' (:200)
 *   despite declaring permissions ['write'] (TaskLifecycleTool.ts:22);
 *   search_files / search_text / api_tester / repo_* / archive_files /
 *   decide_capability_route / codebase_outline / dead_code_detector fall
 *   to default 'medium' (:202). All reach their handlers under default
 *   autoSafe (bypass OFF, hermetic) — L1/I1..Y4 vs F1.. pin the low/
 *   medium split INSIDE one read family live.
 * - UtilityTools resolveToolPath(p, workspaceId): workspace root is
 *   <EXTERNAL_PROJECTS_DIR>/<wsId> (121-proven); relative paths resolve
 *   inside; absolute-inside allowed; traversal throws
 *   'path_outside_workspace' (UtilityTools.ts:17-32). inspect_directory
 *   (:56) and search_files (:107) call it UNCAUGHT -> dispatch catch
 *   (:968-979) normalizes via formatToolError -> 'internal_exception: '
 *   + err.stack (:45), so I3/F3 assert error INCLUDES the message.
 *   search_text catches it in-handler (:169-172) -> ok:false with the
 *   EXACT message (S4) — the caught-vs-uncaught asymmetry class (124
 *   smart family, 125-A1) gets its third pin.
 * - SearchTextTool.ts:165-211: {} -> exact 'search_text needs a query';
 *   regex:true with bad pattern -> 'bad_regex: ...'; positive scans the
 *   contained dir only (glob default ** / * with node_modules/.git/dist
 *   ignores; 2MB + NUL-binary skips).
 * - inspect_symbol :237-289: brace-counting extraction; missing file ->
 *   'File not found'; missing symbol -> "Symbol 'X' not found in file.";
 *   {} -> resolveToolPath('') returns the workspace ROOT (val==='' :
 *   :20), existsSync(root) is true, readFileSync(dir) throws EISDIR ->
 *   caught :286 -> ok:false (Y4 records the exact engine wording).
 * - TaskLifecycleTool.ts:27-43: action defaults 'update', broadcasts a
 *   task_update event (no-op without a server), returns ok:true
 *   output:{success:true} + log 'Task <action>: <status>'. Declared
 *   write permission + explicit low risk + broadcast-only behavior.
 * - CapabilityDecisionTool.ts:29-54: pure receipt. {} -> exact
 *   'request is required'; unmatched request -> family null (:143-152)
 *   -> 'unsupported_capability_family' + 5 supportedFamilies; explicit
 *   family 'ocr' + ocr request -> ocr-local wins on burden score
 *   (0*10+STALE-evidence-decayed 5*4=20 vs key-service 34).
 * - CodebaseOutlineTool.ts:34-42: NO containment check — absolute paths
 *   are honored directly (:39), unlike UtilityTools resolveToolPath and
 *   RepoSelfCodingTools assertSafeRelativePath. O4 proves absolutes are
 *   honored with a BENIGN sbx-absolute seed path (containment-
 *   divergence pin; no sensitive file is read). {} -> exact 'filePath
 *   is required'; missing -> 'File not found: <full>'.
 * - DeadCodeTool.ts:46-52: nonexistent projectPath -> exact 'Project
 *   path does not exist' BEFORE executionEngine.run. The npx-knip live
 *   path is INTENTIONALLY unproven (spawns npx = network/spend risk;
 *   default workDir is getActiveRoot() with NO workspaceId — the
 *   AGENTS.md-forbidden pattern, static note only, no edit).
 * - ApiTesterTool.ts:37-47: {} -> exact 'api_tester needs a url to
 *   call.'; non-http(s) -> exact 'api_tester needs an http(s) url...'.
 *   A live fetch is INTENTIONALLY never sent (zero network); method
 *   would default to GET (:47).
 * - RepoSelfCodingTools getRepoRoot() = process.cwd() unless basename
 *   is 'api' (:9-12) — under this probe CWD=sbx, so repo_* tools are
 *   AUTO-CONTAINED to the sbx (R/G pins double as cwd-root pins).
 *   assertSafeRelativePath (:14-28): '' -> 'path_required'; absolute
 *   -> 'absolute_paths_not_allowed'; traversal -> 'path_outside_repo';
 *   '.env'-suffixed -> 'secrets_file_write_blocked' — EVEN FOR READS
 *   (R7: a write-named guard blocks repo_read_file; checked BEFORE
 *   containment and existence).
 * - repo_diff_summary :264-279 calls runSafeCommand DIRECTLY (bypasses
 *   isAllowedCommand, but the two commands are hardcoded constants) —
 *   in the non-repo sbx, git exits nonzero -> ok:false with stderr
 *   (G0 records the actual shape; read-only either way).
 * - ArchiveFilesTool.ts:64-71/:82-87/:182: guard trio — missing
 *   archivePath -> exact; create without sourcePaths -> exact;
 *   unknown action -> exact 'Unknown action: X'. Live create/extract/
 *   list go through ExecutionGateway shell (zip/tar/unzip with unix
 *   '2>/dev/null || true' in the zip branch) — INTENTIONALLY unproven
 *   (gateway/portability surface needs owned review).
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-126
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-126-dispatch-probe.ts
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

const MARKER = 'zzprobe126marker';

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const wsA = path.join(extRoot, 'probe-ws-126');
  const attr = { workspaceId: 'probe-ws-126', userId: 'probe-user-126' } as any;
  // Seed 1: workspace-relative fixtures (UtilityTools resolve against wsA).
  const fxDir = path.join(wsA, 'fx', 'seed126');
  // Seed 2: cwd-relative fixtures (codebase_outline + repo_* resolve vs CWD=sbx).
  const olDir = path.join(sbxRoot, 'ol126');
  const repoDir = path.join(sbxRoot, 'repo126');
  const helloTs = [
    "export class Hello126 {",
    "  greet(): string {",
    "    return 'hello-126';",
    "  }",
    "}",
    "",
    "export function add126(a: number, b: number): number {",
    "  return a + b;",
    "}",
    "",
  ].join('\n');
  try {
    fs.mkdirSync(fxDir, { recursive: true });
    fs.writeFileSync(path.join(fxDir, 'hello126.ts'), helloTs, 'utf-8');
    fs.writeFileSync(path.join(fxDir, 'notes126.md'), `# seed126\n\n${MARKER} lives here for search_text.\n`, 'utf-8');
    fs.mkdirSync(olDir, { recursive: true });
    fs.writeFileSync(path.join(olDir, 'hello.ts'), helloTs, 'utf-8');
    fs.mkdirSync(repoDir, { recursive: true });
    fs.writeFileSync(path.join(repoDir, 'note.txt'), `repo126 seed line one\n${MARKER} inside repo seed\n`, 'utf-8');
  } catch { /* positives fail loudly below */ }

  await executionFirewall.runInContext('muse-126-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e}`,
      pass: p0a && p0b && p0c && !!p0d && p0e, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-125',
    });

    const rEcho: any = await executeTool('echo', { text: 'probe-126' }, attr);
    const out1 = JSON.stringify(rEcho?.output ?? rEcho);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-126',
      actual: `ok=${rEcho?.ok} error=${rEcho?.error ?? 'none'} output_has_probe=${out1.includes('probe-126')}`,
      pass: rEcho?.ok === true && out1.includes('probe-126'),
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

    // ---- UtilityTools: inspect_directory (LOW risk :198) ----
    const i1: any = await executeTool('inspect_directory', { path: 'fx/seed126', depth: 1 }, attr);
    const i1tree: any[] = Array.isArray((i1 as any)?.output?.tree) ? (i1 as any).output.tree : [];
    const i1names = i1tree.map((t) => String(t?.name || '')).sort().join(',');
    results.push({
      case: 'I1-inspect-positive', expect: 'ok=true tree=[hello126.ts,notes126.md]',
      actual: `ok=${i1?.ok} error=${String(i1?.error || 'none').slice(0, 60)} names=${i1names}`,
      pass: i1?.ok === true && i1names === 'hello126.ts,notes126.md',
      detail: 'POSITIVE pin inspect_directory (LOW risk): workspace-relative read reaches handler',
    });

    const i2: any = await executeTool('inspect_directory', { path: 'fx/nope126' }, attr);
    results.push({
      case: 'I2-inspect-missing', expect: "ok=false error='Directory not found'",
      actual: `ok=${i2?.ok} error=${String(i2?.error || 'none').slice(0, 60)}`,
      pass: i2?.ok === false && String(i2?.error || '') === 'Directory not found',
      detail: 'GUARD pin UtilityTools.ts:59',
    });

    const i3: any = await executeTool('inspect_directory', { path: '../../..' }, attr);
    const i3err = String(i3?.error || '');
    results.push({
      case: 'I3-inspect-traversal', expect: 'ok=false error INCLUDES path_outside_workspace (UNCAUGHT throw -> internal_exception envelope)',
      actual: `ok=${i3?.ok} error=${i3err.slice(0, 160)}`,
      pass: i3?.ok === false && i3err.includes('path_outside_workspace'),
      detail: 'ASYMMETRY pin: :56 resolveToolPath throws outside any try -> dispatch catch :968-979 (contrast S4 caught-in-handler)',
    });

    // ---- UtilityTools: search_files (MEDIUM default — risk split inside one family) ----
    const f1: any = await executeTool('search_files', { pattern: '*.md', path: 'fx/seed126' }, attr);
    const f1files: string[] = Array.isArray((f1 as any)?.output?.files) ? (f1 as any).output.files : [];
    results.push({
      case: 'F1-search-files-positive', expect: 'ok=true files include notes126.md',
      actual: `ok=${f1?.ok} error=${String(f1?.error || 'none').slice(0, 60)} n=${f1files.length} has_notes=${f1files.some((f) => String(f).includes('notes126.md'))}`,
      pass: f1?.ok === true && f1files.some((f) => String(f).includes('notes126.md')),
      detail: 'POSITIVE pin search_files (MEDIUM default): same read family as I1 but different risk class — split pinned live',
    });

    const f2: any = await executeTool('search_files', {}, attr);
    const f2files: unknown = (f2 as any)?.output?.files;
    results.push({
      case: 'F2-search-files-no-pattern', expect: 'ok=true files=[] (required pattern NOT enforced — missing input becomes glob "undefined")',
      actual: `ok=${f2?.ok} error=${String(f2?.error || 'none').slice(0, 60)} files=${JSON.stringify(f2files)}`,
      pass: f2?.ok === true && Array.isArray(f2files) && (f2files as any[]).length === 0,
      detail: 'VALIDATION pin UtilityTools.ts:107 String(undefined)->"undefined" glob — another OBS-111-2 no-dispatch-validation instance (same known class, no new OBS)',
    });

    const f3: any = await executeTool('search_files', { pattern: '*', path: '../../..' }, attr);
    const f3err = String(f3?.error || '');
    results.push({
      case: 'F3-search-files-traversal', expect: 'ok=false error INCLUDES path_outside_workspace (UNCAUGHT throw)',
      actual: `ok=${f3?.ok} error=${f3err.slice(0, 160)}`,
      pass: f3?.ok === false && f3err.includes('path_outside_workspace'),
      detail: 'ASYMMETRY pin: :107 same uncaught shape as I3 (contrast S4)',
    });

    // ---- UtilityTools: search_text (MEDIUM default; CAUGHT containment) ----
    const s1: any = await executeTool('search_text', { query: MARKER, path: 'fx/seed126' }, attr);
    const s1m: any[] = Array.isArray((s1 as any)?.output?.matches) ? (s1 as any).output.matches : [];
    results.push({
      case: 'S1-search-text-positive', expect: 'ok=true total>=1 match in notes126.md line 3',
      actual: `ok=${s1?.ok} total=${(s1 as any)?.output?.total} first=${JSON.stringify(s1m[0] || null).slice(0, 120)}`,
      pass: s1?.ok === true && ((s1 as any)?.output?.total ?? 0) >= 1 && s1m.some((m) => String(m?.file || '').includes('notes126.md')),
      detail: 'POSITIVE pin search_text: contained content search reaches handler, returns file+line+text',
    });

    const s2: any = await executeTool('search_text', {}, attr);
    results.push({
      case: 'S2-search-text-no-query', expect: "ok=false error='search_text needs a query...'",
      actual: `ok=${s2?.ok} error=${String(s2?.error || 'none').slice(0, 80)}`,
      pass: s2?.ok === false && String(s2?.error || '').startsWith('search_text needs a query'),
      detail: 'GUARD pin SearchTextTool :167 (handler-level requiredAny enforcement)',
    });

    const s3: any = await executeTool('search_text', { query: '([', regex: true, path: 'fx/seed126' }, attr);
    results.push({
      case: 'S3-search-text-bad-regex', expect: "ok=false error starts 'bad_regex: '",
      actual: `ok=${s3?.ok} error=${String(s3?.error || 'none').slice(0, 100)}`,
      pass: s3?.ok === false && String(s3?.error || '').startsWith('bad_regex: '),
      detail: 'GUARD pin :176-180 — malformed regex refused honestly, never throws to dispatch',
    });

    const s4: any = await executeTool('search_text', { query: 'x', path: '../../..' }, attr);
    results.push({
      case: 'S4-search-text-traversal', expect: "ok=false error EXACT 'path_outside_workspace' (CAUGHT in-handler)",
      actual: `ok=${s4?.ok} error=${String(s4?.error || 'none').slice(0, 80)}`,
      pass: s4?.ok === false && String(s4?.error || '') === 'path_outside_workspace',
      detail: 'ASYMMETRY pin :169-172 try/catch — same traversal as I3/F3, opposite error SHAPE (third caught-vs-uncaught pin after 124/125-A1)',
    });

    // ---- UtilityTools: inspect_symbol (LOW risk :198) ----
    const y1: any = await executeTool('inspect_symbol', { filePath: 'fx/seed126/hello126.ts', symbolName: 'Hello126' }, attr);
    const y1code = String((y1 as any)?.output?.code || '');
    results.push({
      case: 'Y1-symbol-positive', expect: 'ok=true code includes class Hello126 + greet',
      actual: `ok=${y1?.ok} error=${String(y1?.error || 'none').slice(0, 60)} has_class=${y1code.includes('class Hello126')} has_greet=${y1code.includes('greet')}`,
      pass: y1?.ok === true && y1code.includes('class Hello126') && y1code.includes('greet'),
      detail: 'POSITIVE pin inspect_symbol (LOW risk): brace-counting extraction reaches handler',
    });

    const y2: any = await executeTool('inspect_symbol', { filePath: 'fx/nope126.ts', symbolName: 'Hello126' }, attr);
    results.push({
      case: 'Y2-symbol-file-missing', expect: "ok=false error='File not found'",
      actual: `ok=${y2?.ok} error=${String(y2?.error || 'none').slice(0, 60)}`,
      pass: y2?.ok === false && String(y2?.error || '') === 'File not found',
      detail: 'GUARD pin :241',
    });

    const y3: any = await executeTool('inspect_symbol', { filePath: 'fx/seed126/hello126.ts', symbolName: 'Nope126ZZZ' }, attr);
    results.push({
      case: 'Y3-symbol-missing', expect: 'ok=false error includes "Symbol \'Nope126ZZZ\' not found"',
      actual: `ok=${y3?.ok} error=${String(y3?.error || 'none').slice(0, 90)}`,
      pass: y3?.ok === false && String(y3?.error || '').includes("Symbol 'Nope126ZZZ' not found"),
      detail: 'GUARD pin :258',
    });

    const y4: any = await executeTool('inspect_symbol', { symbolName: 'Hello126' }, attr);
    results.push({
      case: 'Y4-symbol-no-filepath', expect: 'ok=false (missing filePath resolves to workspace ROOT dir, read fails closed)',
      actual: `ok=${y4?.ok} error=${String(y4?.error || 'none').slice(0, 100)}`,
      pass: y4?.ok === false,
      detail: 'BEHAVIOR pin :238 String("")->resolveToolPath("")=root :20 -> readFileSync(dir) throws -> caught :286 (records exact engine wording)',
    });

    // ---- task_lifecycle: write-declared + LOW risk + broadcast-only ----
    const l1: any = await executeTool('task_lifecycle', { action: 'update', taskName: 'probe126', taskStatus: 'probing126', mode: 'VERIFICATION' }, attr);
    const l1logs: string[] = Array.isArray(l1?.logs) ? (l1.logs as any[]).map(String) : [];
    results.push({
      case: 'L1-lifecycle-positive', expect: 'ok=true success + log "Task update: probing126" (broadcast no-op, no server)',
      actual: `ok=${l1?.ok} success=${JSON.stringify((l1 as any)?.output)} tasklog=${l1logs.some((l) => l.includes('Task update: probing126'))}`,
      pass: l1?.ok === true && (l1 as any)?.output?.success === true && l1logs.some((l) => l.includes('Task update: probing126')),
      detail: 'POSITIVE pin task_lifecycle (LOW risk :200 despite permissions write :22): UI broadcast reaches handler hermetically; "MUTATES task state" comment describes a WS event, no durable write observed',
    });

    // ---- decide_capability_route: pure policy receipt ----
    const c1: any = await executeTool('decide_capability_route', {}, attr);
    results.push({
      case: 'C1-decision-no-request', expect: "ok=false error='request is required'",
      actual: `ok=${c1?.ok} error=${String(c1?.error || 'none').slice(0, 60)}`,
      pass: c1?.ok === false && String(c1?.error || '') === 'request is required',
      detail: 'GUARD pin CapabilityDecisionTool.ts:32',
    });

    const c2: any = await executeTool('decide_capability_route', { request: 'zzzqqq126 definitely not matching any capability family' }, attr);
    const c2fams: unknown = (c2 as any)?.output?.supportedFamilies;
    results.push({
      case: 'C2-decision-unsupported-family', expect: "ok=false 'unsupported_capability_family' + 5 supportedFamilies",
      actual: `ok=${c2?.ok} error=${String(c2?.error || 'none').slice(0, 60)} fams=${JSON.stringify(c2fams)}`,
      pass: c2?.ok === false && String(c2?.error || '') === 'unsupported_capability_family' && Array.isArray(c2fams) && (c2fams as any[]).length === 5,
      detail: 'BEHAVIOR pin :33 + :143-152 family inference returns null for unmatched text',
    });

    const c3: any = await executeTool('decide_capability_route', { request: 'please scan a document with ocr', family: 'ocr' }, attr);
    const c3sel: any = (c3 as any)?.output?.receipt?.selected;
    const c3logs: string[] = Array.isArray(c3?.logs) ? (c3.logs as any[]).map(String) : [];
    results.push({
      case: 'C3-decision-positive', expect: 'ok=true selected.id=ocr-local + "selected local" log',
      actual: `ok=${c3?.ok} sel=${c3sel?.id || 'none'} route=${c3sel?.route || 'none'} userAction=${JSON.stringify((c3 as any)?.output?.userAction ?? null)} sellog=${c3logs.some((l) => l.includes('CAPABILITY_DECISION selected local'))}`,
      pass: c3?.ok === true && c3sel?.id === 'ocr-local' && c3logs.some((l) => l.includes('CAPABILITY_DECISION selected local')),
      detail: 'POSITIVE pin: deterministic least-burden receipt (ZERO_SETUP local wins despite STALE-decayed evidence); no connection/credential/payment touched',
    });

    // ---- codebase_outline: read-only but NO containment check ----
    const o1: any = await executeTool('codebase_outline', { filePath: 'ol126/hello.ts' }, attr);
    const o1out: any = (o1 as any)?.output || {};
    results.push({
      case: 'O1-outline-positive', expect: 'ok=true classes has L1 Hello126 + functions has add126',
      actual: `ok=${o1?.ok} classes=${JSON.stringify(o1out.classes)} funcs=${JSON.stringify(o1out.functions)}`,
      pass: o1?.ok === true && JSON.stringify(o1out.classes).includes('Hello126') && JSON.stringify(o1out.functions).includes('add126'),
      detail: 'POSITIVE pin codebase_outline: cwd-relative regex scan reaches handler',
    });

    const o2: any = await executeTool('codebase_outline', {}, attr);
    results.push({
      case: 'O2-outline-no-filepath', expect: "ok=false error='filePath is required'",
      actual: `ok=${o2?.ok} error=${String(o2?.error || 'none').slice(0, 60)}`,
      pass: o2?.ok === false && String(o2?.error || '') === 'filePath is required',
      detail: 'GUARD pin CodebaseOutlineTool.ts:36',
    });

    const o3: any = await executeTool('codebase_outline', { filePath: 'ol126/nope.ts' }, attr);
    results.push({
      case: 'O3-outline-missing', expect: "ok=false error starts 'File not found: '",
      actual: `ok=${o3?.ok} error=${String(o3?.error || 'none').slice(0, 100)}`,
      pass: o3?.ok === false && String(o3?.error || '').startsWith('File not found: '),
      detail: 'GUARD pin :41 (full resolved path echoed in the error)',
    });

    const o4abs = path.join(olDir, 'hello.ts');
    const o4: any = await executeTool('codebase_outline', { filePath: o4abs }, attr);
    results.push({
      case: 'O4-outline-absolute-accepted', expect: 'ok=true on BENIGN sbx-absolute path (proves absolutes honored — NO containment check :39)',
      actual: `ok=${o4?.ok} error=${String(o4?.error || 'none').slice(0, 60)} classes=${JSON.stringify((o4 as any)?.output?.classes || null)}`,
      pass: o4?.ok === true && JSON.stringify((o4 as any)?.output?.classes || []).includes('Hello126'),
      detail: 'CONTAINMENT-DIVERGENCE pin: UtilityTools + repo_* enforce workspace/repo roots, codebase_outline honors ANY absolute path (source-traced :38-39; no sensitive file read — benign seed only)',
    });

    // ---- dead_code_detector: guard only (npx live path intentionally unproven) ----
    const k1: any = await executeTool('dead_code_detector', { mode: 'scan', projectPath: 'dd126-nope' }, attr);
    results.push({
      case: 'K1-deadcode-guard', expect: "ok=false error='Project path does not exist' (refuses BEFORE npx spawn)",
      actual: `ok=${k1?.ok} error=${String(k1?.error || 'none').slice(0, 80)}`,
      pass: k1?.ok === false && String(k1?.error || '') === 'Project path does not exist',
      detail: 'GUARD pin DeadCodeTool.ts:52 — live `npx knip` path INTENTIONALLY unproven (spawn/network/spend; default workDir uses getActiveRoot() with NO workspaceId — AGENTS.md-forbidden pattern, static note)',
    });

    // ---- api_tester: guards only (live fetch intentionally never sent) ----
    const a1: any = await executeTool('api_tester', {}, attr);
    results.push({
      case: 'A1-apitester-no-url', expect: "ok=false error='api_tester needs a url to call.'",
      actual: `ok=${a1?.ok} error=${String(a1?.error || 'none').slice(0, 70)}`,
      pass: a1?.ok === false && String(a1?.error || '') === 'api_tester needs a url to call.',
      detail: 'GUARD pin ApiTesterTool.ts:43 — refuses BEFORE fetch(); zero network (also bounds the CAPABILITY-MATRIX #5 misroute: the tool asks for url/method, never answers)',
    });

    const a2: any = await executeTool('api_tester', { url: 'ftp://probe126.invalid/x' }, attr);
    results.push({
      case: 'A2-apitester-non-http', expect: "ok=false error starts 'api_tester needs an http(s) url'",
      actual: `ok=${a2?.ok} error=${String(a2?.error || 'none').slice(0, 90)}`,
      pass: a2?.ok === false && String(a2?.error || '').startsWith('api_tester needs an http(s) url'),
      detail: 'GUARD pin :44-46 — scheme gate before any socket',
    });

    // ---- repo_read_file: getRepoRoot() = CWD = sbx (auto-contained) ----
    const rr1: any = await executeTool('repo_read_file', { path: 'repo126/note.txt' }, attr);
    results.push({
      case: 'R1-reporead-positive', expect: 'ok=true content includes marker + bytes>0',
      actual: `ok=${rr1?.ok} error=${String(rr1?.error || 'none').slice(0, 50)} has_marker=${String((rr1 as any)?.output?.content || '').includes(MARKER)} bytes=${(rr1 as any)?.output?.bytes}`,
      pass: rr1?.ok === true && String((rr1 as any)?.output?.content || '').includes(MARKER) && Number((rr1 as any)?.output?.bytes) > 0,
      detail: 'POSITIVE pin repo_read_file (cwd-root pin: resolves vs sbx, NOT the worktree)',
    });

    const rr2: any = await executeTool('repo_read_file', { path: 'repo126/nope.txt' }, attr);
    results.push({
      case: 'R2-reporead-missing', expect: "ok=false error='file_not_found'",
      actual: `ok=${rr2?.ok} error=${String(rr2?.error || 'none').slice(0, 50)}`,
      pass: rr2?.ok === false && String(rr2?.error || '') === 'file_not_found',
      detail: 'GUARD pin RepoSelfCodingTools.ts:115',
    });

    const rr3: any = await executeTool('repo_read_file', { path: 'repo126' }, attr);
    results.push({
      case: 'R3-reporead-not-a-file', expect: "ok=false error='not_a_file'",
      actual: `ok=${rr3?.ok} error=${String(rr3?.error || 'none').slice(0, 50)}`,
      pass: rr3?.ok === false && String(rr3?.error || '') === 'not_a_file',
      detail: 'GUARD pin :116',
    });

    const rr4: any = await executeTool('repo_read_file', {}, attr);
    results.push({
      case: 'R4-reporead-no-path', expect: "ok=false error='path_required'",
      actual: `ok=${rr4?.ok} error=${String(rr4?.error || 'none').slice(0, 50)}`,
      pass: rr4?.ok === false && String(rr4?.error || '') === 'path_required',
      detail: 'GUARD pin :16',
    });

    const rr5: any = await executeTool('repo_read_file', { path: path.join(repoDir, 'note.txt') }, attr);
    results.push({
      case: 'R5-reporead-absolute', expect: "ok=false error='absolute_paths_not_allowed' (contrast O4 outline HONORS absolutes)",
      actual: `ok=${rr5?.ok} error=${String(rr5?.error || 'none').slice(0, 60)}`,
      pass: rr5?.ok === false && String(rr5?.error || '') === 'absolute_paths_not_allowed',
      detail: 'CONTAINMENT pin :17 — repo_* refuse absolutes outright; codebase_outline (O4) accepts them: opposite policies, both live-pinned',
    });

    const rr6: any = await executeTool('repo_read_file', { path: '../../outside126.txt' }, attr);
    results.push({
      case: 'R6-reporead-traversal', expect: "ok=false error='path_outside_repo'",
      actual: `ok=${rr6?.ok} error=${String(rr6?.error || 'none').slice(0, 60)}`,
      pass: rr6?.ok === false && String(rr6?.error || '') === 'path_outside_repo',
      detail: 'CONTAINMENT pin :26 isWithinRoot (caught in-handler :120-122 — third containment SHAPE: exact message, no stack)',
    });

    const rr7: any = await executeTool('repo_read_file', { path: '.env' }, attr);
    results.push({
      case: 'R7-reporead-env-blocked', expect: "ok=false error='secrets_file_write_blocked' (READ blocked by write-named guard, before existence check)",
      actual: `ok=${rr7?.ok} error=${String(rr7?.error || 'none').slice(0, 60)}`,
      pass: rr7?.ok === false && String(rr7?.error || '') === 'secrets_file_write_blocked',
      detail: 'POLICY pin :19-23 — the blocklist fires before containment/existence; name says WRITE but it gates READS too (naming finding, behavior is fail-closed)',
    });

    // ---- repo_search ----
    const q1: any = await executeTool('repo_search', {}, attr);
    results.push({
      case: 'Q1-reposearch-no-query', expect: "ok=false error='query_required'",
      actual: `ok=${q1?.ok} error=${String(q1?.error || 'none').slice(0, 50)}`,
      pass: q1?.ok === false && String(q1?.error || '') === 'query_required',
      detail: 'GUARD pin :143',
    });

    const q2: any = await executeTool('repo_search', { query: MARKER, path: 'repo126', maxResults: 10 }, attr);
    const q2m: any[] = Array.isArray((q2 as any)?.output?.matches) ? (q2 as any).output.matches : [];
    results.push({
      case: 'Q2-reposearch-positive', expect: 'ok=true count>=1 match repo126/note.txt line 2',
      actual: `ok=${q2?.ok} count=${(q2 as any)?.output?.count} first=${JSON.stringify(q2m[0] || null).slice(0, 110)}`,
      pass: q2?.ok === true && Number((q2 as any)?.output?.count) >= 1 && q2m.some((m) => String(m?.path || '').includes('repo126/note.txt')),
      detail: 'POSITIVE pin repo_search: scoped walk (800-file cap) reaches handler; preview truncated 240 chars',
    });

    const q3: any = await executeTool('repo_search', { query: 'x', path: '../../..' }, attr);
    results.push({
      case: 'Q3-reposearch-traversal', expect: "ok=false error='path_outside_repo'",
      actual: `ok=${q3?.ok} error=${String(q3?.error || 'none').slice(0, 60)}`,
      pass: q3?.ok === false && String(q3?.error || '') === 'path_outside_repo',
      detail: 'CONTAINMENT pin :144 scoped-base path goes through the same assertSafeRelativePath',
    });

    // ---- repo_diff_summary: read-only git in a NON-repo sbx ----
    const g0: any = await executeTool('repo_diff_summary', {}, attr);
    const g0out: any = (g0 as any)?.output || {};
    results.push({
      case: 'G0-repodiff-nonrepo', expect: 'ok=false with git stderr (non-repo CWD fails closed; no writes either way)',
      actual: `ok=${g0?.ok} error=${String(g0?.error || 'none').slice(0, 60)} stderr=${String(g0out.stderr || '').slice(0, 120)} status_len=${String(g0out.status || '').length}`,
      pass: g0?.ok === false,
      detail: 'BEHAVIOR pin :264-279 — hardcoded status+diff via runSafeCommand (direct call, bypasses isAllowedCommand allowlist by construction); records the actual non-repo shape',
    });

    // ---- archive_files: guard trio (shell path intentionally unproven) ----
    const v1: any = await executeTool('archive_files', { action: 'create', archivePath: 'x126.zip' }, attr);
    results.push({
      case: 'V1-archive-no-sources', expect: "ok=false error='sourcePaths required for create action'",
      actual: `ok=${v1?.ok} error=${String(v1?.error || 'none').slice(0, 70)}`,
      pass: v1?.ok === false && String(v1?.error || '') === 'sourcePaths required for create action',
      detail: 'GUARD pin ArchiveFilesTool.ts:86 — refuses BEFORE ExecutionGateway shell',
    });

    const v2: any = await executeTool('archive_files', {}, attr);
    results.push({
      case: 'V2-archive-no-path', expect: "ok=false error='archivePath is required'",
      actual: `ok=${v2?.ok} error=${String(v2?.error || 'none').slice(0, 60)}`,
      pass: v2?.ok === false && String(v2?.error || '') === 'archivePath is required',
      detail: 'GUARD pin :69-71 (checked before format detection)',
    });

    const v3: any = await executeTool('archive_files', { action: 'frob126', archivePath: 'x126.zip' }, attr);
    results.push({
      case: 'V3-archive-unknown-action', expect: "ok=false error='Unknown action: frob126'",
      actual: `ok=${v3?.ok} error=${String(v3?.error || 'none').slice(0, 60)}`,
      pass: v3?.ok === false && String(v3?.error || '') === 'Unknown action: frob126',
      detail: 'GUARD pin :182 — live create/extract/list INTENTIONALLY unproven (ExecutionGateway shell + `2>/dev/null || true` unix-ism need owned review)',
    });

    // Z0: containment — seeds intact, no strays at sbx root, live store untouched.
    const zFx = (() => { try { return fs.readdirSync(fxDir).sort().join(','); } catch { return 'MISSING'; } })();
    const zOl = (() => { try { return fs.readdirSync(olDir).join(','); } catch { return 'MISSING'; } })();
    const zRepo = (() => { try { return fs.readdirSync(repoDir).join(','); } catch { return 'MISSING'; } })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveHash = (() => { try { const c = fs.readFileSync(zLiveMem); let h = 0; for (const b of c) h = (h * 31 + b) >>> 0; return `len=${c.length} h=${h.toString(16)}`; } catch { return 'ABSENT'; } })();
    const zRootStrays = ['D:/Joe/muse-worktree/x126.zip', 'D:/Joe/muse-worktree/dd126-nope', path.join(sbxRoot, '..', 'outside126.txt')].map((p) => { try { return fs.existsSync(p); } catch { return false; } });
    results.push({
      case: 'Z0-containment', expect: 'seeds intact + live memory store len/hash stable + zero strays (root/archive/traversal/parent)',
      actual: `fx=[${zFx}] ol=[${zOl}] repo=[${zRepo}] livemem=${zLiveHash} strays=${zRootStrays.join(',')}`,
      pass: zFx === 'hello126.ts,notes126.md' && zOl === 'hello.ts' && zRepo === 'note.txt' && zRootStrays.every((s) => s === false),
      detail: 'CONTAINMENT pin: all handler effects inside sbx; live api/data read-only (hash recorded for feas cross-check)',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-126-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-126-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
