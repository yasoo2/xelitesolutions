/**
 * MUSE wiring audit 129 — dispatch-reachability battery: quality + advanced-
 * analysis FIRST live proofs (Level 4) over NINE unprobed registered families:
 * sonar_analysis (refusal only), load_tester (refusal only),
 * ci_generate_pipeline, quality_run, pattern_recognize, auto_refactor,
 * test_generator, performance_profile, doc_generator.
 *
 * Static audit (read-only source, BEFORE the run):
 * - ToolService.ts:142-202 classifyToolRisk: none of the nine names matches a
 *   carve-out (no delete/deploy/write_file-family/low-list hit) -> default
 *   'medium', allowed under default autoSafe with zero approval (pinned live:
 *   every family reaches its handler).
 * - sonar_analysis (QualityTools.ts:32-71): refuses without a trimmed
 *   projectKey (pinned live by SA0/SA1); required ['projectKey'] is unenforced
 *   at dispatch (OBS-111-2 class) but the handler is loud. POSITIVE
 *   DELIBERATELY UNPROVEN: it shells `npx sonar-scanner` (5min timeout) which
 *   would download+run a scanner = network + heavy spawn. Static note: the
 *   sources arg flows into -Dsonar.sources with process.cwd(), no containment.
 * - load_tester (:416-...): refuses without an http(s) url (pinned live by
 *   LT0/LT1). POSITIVE DELIBERATELY UNPROVEN: it fetch-loops the URL and the
 *   canonical setup.ts fetch guard throws on ALL fetch (unit tests must not
 *   use the network) — executing it can only prove the guard, not the tool.
 * - dependency_audit DELIBERATELY UNPROVEN (no live case): the handler ALWAYS
 *   shells `npm audit --json` with no refusal path. Method validation this
 *   cycle (bare sbx dir, outside the probe): npm did NOT fail fast — it
 *   climbed past the sbx into the live worktree, fetched advisory data over
 *   the network (13.6s, EXIT 1, live multer advisories in output). Shell +
 *   upward-climb + network = needs owned gateway review first (dead_code npx
 *   precedent). Static note only.
 * - ci_generate_pipeline (:352-414): contained write + idempotent skip (pinned
 *   live by CI0/CI1); escape throws inside execute with NO try/catch, so the
 *   ToolService catch envelope wraps it as internal_exception (pinned live by
 *   CI2, assert includes). CI-{} DELIBERATELY UNPROBED: required ['path'] is
 *   unenforced AND resolveToolPath('') returns the DEFAULT root, so {} would
 *   mkdir+write .github/workflows/node-ci.yml into a live root (SS-{} class).
 * - quality_run (:106-244): all-skipped honest-incomplete shape (QR0), unknown
 *   task silent-skip (QR1), dependency-free static-records marker branch
 *   (QR2, zero shell), hermetic npm-run pass/fail (QR3/QR4: seeded local
 *   package.json stops the npm upward climb; `node test129*.js` scripts are
 *   pure-local; npm_config_update_notifier=false set in-probe). The npx-tsc
 *   typecheck branch is DELIBERATELY UNPROVEN (would download tsc = network);
 *   lint/build script branches share the QR3/QR4 runNpmScript path.
 * - pattern_recognize (AdvancedTools.ts:10-91): pure static regex analysis;
 *   missing code is a loud refusal (PR1); Singleton positive (PR0); language
 *   'go' is IN the schema enum but has NO patterns table (only typescript/
 *   javascript exist) -> ok:true patterns=[] (PR2 ENUM-GAP pin, live proof).
 * - auto_refactor (:240-377): resolve+existsSync gates (AR1/AR2); contained
 *   write-back positive (AR0: duplicate imports + console.log + if/else);
 *   refactorType 'rename' is IN the schema enum but has NO handler branch ->
 *   ok:true changes=[] silent no-op (AR3 DEAD-ENUM pin, live proof).
 * - test_generator (:382-588): missing/missing-file refusals (TG3/TG4); node-
 *   runner CJS positive with contained __tests__ write (TG0); jest-runner
 *   branch (TG1); TS+node honest-skip shape ok:true generated:false (TG2 —
 *   EXPLICIT skip, contrast dishonest-ok class). Seeded manifests pin
 *   findNearestPackageJson deterministically (no ambient upward dependence).
 * - performance_profile (:593-771): pure static analysis; sync-io + O(n)
 *   positive (PP0); refusals (PP1/PP2).
 * - doc_generator (:776-871): contained .md write positive (DG0) incl. the
 *   BROKEN-COUNTER pin (functions regex /###\s+Function/ never matches the
 *   `### <name>` headers -> 0 always; classes regex /##\s+Class/ matches the
 *   `## Classes` SECTION header -> 1 always); missing-arg misleading error
 *   'File not found: missing filePath' (DG1); unlisted outputFormat writes
 *   .txt (DG2, OBS-111-2 class); extensionless source self-overwrite
 *   (outputPath === sourcePath) DELIBERATELY UNPROBED (destructive).
 * - Path rules (CORRECTED after run-1): QualityTools call resolveToolPath
 *   WITHOUT workspaceId, so ALL their paths are ABSOLUTE sbx paths (SS1-128
 *   precedent — relative would resolve to the DEFAULT root). AdvancedTools
 *   thread context.workspaceId, but the threaded root is
 *   externalRoot/<wsId>/ (= <sbx>/projects/probe-ws-129/, WorkspaceService
 *   .ts:228-259 in JSON/mock mode) — NOT the sbx root — so run-1 RELATIVE
 *   fx129/... paths missed every seeded file (9 misses, all 'File not
 *   found'). Run-2 uses ABSOLUTE sbx paths for AdvancedTools too (uniform;
 *   containment via projectRoot=<sbx> since CWD is the sbx). The 128
 *   relative-path success was AnalysisTools-specific (its local resolver
 *   anchors relative-exists-from-cwd), NOT general threaded behavior. WR0
 *   pins the REAL threaded mapping live (seed under projects/<wsId>/ +
 *   relative read hits it).
 *
 * RUN-1 (sbx-tmp-129): 27/36 PASS, EXIT 1. Eight misses are ONE probe-root
 * bug (relative AdvancedTools paths vs externalRoot/<wsId>/ threaded root —
 * genuine behavior discovery, receipts preserved); QR2 is a probe-assertion
 * string bug ('records artifact' vs 'static-records'). Run-2 (fresh tree
 * sbx-tmp-129b, 37 cases incl. new WR0) corrects both; all 27 other pins
 * held on run-1.
 * RUN-2: 34/37 PASS, EXIT 1. Three misses are all probe-expectation bugs
 * over genuine behavior discoveries (receipts preserved): TG0/TG1 seeded
 * shorthand `module.exports = { name }` but the detector's inner regex needs
 * a trailing , or : INSIDE the braces, so last/shorthand elements are
 * missed (targets=[] -> loads-only); PP0 seed tripped the recursion
 * heuristic via definition-self-match (every `function name(` contains
 * `name(`) -> O(2^n)/50 not O(n)/90. Run-3 (fresh tree sbx-tmp-129c,
 * 38 cases incl. new TG0b shorthand-gap pin) seeds colon-form exports and
 * pins the actual complexity shape; all 34 other pins held on run-2.
 *
 * Every case stays on a SAFE surface: refusal pins, pure-local analysis,
 * contained sbx writes (CI/TG/AR/DG), hermetic local spawns (QR3/QR4 npm run
 * of `node` scripts only). NO network (fetch guard throws; no npx download,
 * no audit, no load target), NO model, NO browser, NO spend. Live api/data
 * is read-only (Z0 records hashes + asserts untouched).
 *
 * Same isolated tsx method as 110-128: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (Set-Location INSIDE the shell
 * — a \\?\ workdir prefix breaks tsx.cmd via CMD.EXE UNC fallback, proven by
 * the 128 run1 env-failure receipt), all imports absolute, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-129 (run-1)
 * / tmp/sbx-tmp-129b (run-2) / tmp/sbx-tmp-129c (run-3 fresh; all preserved).
 * NO DATA_DIR is set:
 * the knowledge.ts import-time mkdir lands
 * in <sbx>/data (contained; Z0 asserts the shape, 127/128 continuity). NO
 * AUTO_APPROVE_* set at any point. No source edited.
 *
 * Run from the SANDBOX dir (run-1: sbx-tmp-129; run-2: sbx-tmp-129b; run-3: fresh sbx-tmp-129c):
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-129c
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-129-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
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
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    EXTERNAL_PROJECTS_DIR: process.env.EXTERNAL_PROJECTS_DIR,
    JOE_TEST_TMP_ROOT: process.env.JOE_TEST_TMP_ROOT,
    DATA_DIR: process.env.DATA_DIR,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;
  process.env.npm_config_update_notifier = 'false';

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const dataDir = String(process.env.DATA_DIR || '');
  const attr = { workspaceId: 'probe-ws-129', userId: 'probe-user-129' } as any;

  await executionFirewall.runInContext('muse-129-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    const p0f = !dataDir || dataDir === sbxRoot || dataDir.startsWith(sbxRoot + path.sep);
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key+data_dir_unset_or_in_sbx',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e} dataOk=${p0f}`,
      pass: p0a && p0b && p0c && !!p0d && p0e && p0f, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const d1: any = await executeTool('echo', { text: 'probe129-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe129-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    const h4: any = await executeTool('run_command', { action: 'list' }, attr);
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required'",
      actual: `ok=${h4?.ok} error=${String(h4?.error || 'none').slice(0, 40)}`,
      pass: h4?.ok === false && String(h4?.error || '') === 'approval_required',
      detail: 'T5-117 winner reproduced (117/121/123/126/127/128 continuity); nothing executed',
    });

    // ---- fixture trees (fs-seeded, tool-read) ----
    const tree = path.join(sbxRoot, 'fx129');
    const seedFile = (rel: string, content: string) => {
      const f = path.join(tree, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content, 'utf-8');
    };

    // ---- threaded workspace-root mapping (run-1 discovery, pinned live) ----
    const wrDir = path.join(sbxRoot, 'projects', 'probe-ws-129', 'fx129b');
    fs.mkdirSync(wrDir, { recursive: true });
    fs.writeFileSync(path.join(wrDir, 'ping129.txt'), 'ping129\n', 'utf-8');
    const wr0: any = await executeTool('performance_profile', { filePath: 'fx129b/ping129.txt' }, attr);
    results.push({
      case: 'WR0-threaded-root', expect: "threaded relative read hits externalRoot/<wsId>/ (ok=true)",
      actual: `ok=${wr0?.ok} error=${String(wr0?.error || 'none').slice(0, 50)}`,
      pass: wr0?.ok === true,
      detail: 'ROOT-MAPPING pin: getActiveRoot(wsId)=externalRoot/<wsId> in JSON/mock mode (WorkspaceService.ts:238-259); run-1 relatives missed because seeds were at <sbx>/fx129, not projects/<wsId>/fx129',
    });

    // ---- sonar_analysis (refusal only; positive needs npx download) ----
    const sa0: any = await executeTool('sonar_analysis', {}, attr);
    results.push({
      case: 'SA0-sonar-missing-key', expect: "ok=false error='sonar_analysis needs a projectKey.'",
      actual: `ok=${sa0?.ok} error=${String(sa0?.error || 'none').slice(0, 60)}`,
      pass: sa0?.ok === false && String(sa0?.error || '') === 'sonar_analysis needs a projectKey.',
      detail: 'GUARD pin: empty key refused before any spawn (required unenforced at dispatch, OBS-111-2 class, handler loud)',
    });

    const sa1: any = await executeTool('sonar_analysis', { projectKey: '   ' }, attr);
    results.push({
      case: 'SA1-sonar-blank-key', expect: 'blank key refused identically (trim-check)',
      actual: `ok=${sa1?.ok} error=${String(sa1?.error || 'none').slice(0, 60)}`,
      pass: sa1?.ok === false && String(sa1?.error || '') === 'sonar_analysis needs a projectKey.',
      detail: 'TRIM pin: whitespace-only key refused; no npx spawn attempted',
    });

    // ---- load_tester (refusal only; positive needs fetch) ----
    const lt0: any = await executeTool('load_tester', {}, attr);
    results.push({
      case: 'LT0-load-missing-url', expect: "ok=false error='load_tester needs an http(s) url to hit.'",
      actual: `ok=${lt0?.ok} error=${String(lt0?.error || 'none').slice(0, 60)}`,
      pass: lt0?.ok === false && String(lt0?.error || '') === 'load_tester needs an http(s) url to hit.',
      detail: 'GUARD pin: missing url refused before any worker spawn (the fixed fetch(undefined) storm stays unfired)',
    });

    const lt1: any = await executeTool('load_tester', { url: 'ftp://x129.invalid/' }, attr);
    results.push({
      case: 'LT1-load-non-http-url', expect: 'non-http url refused identically (scheme gate)',
      actual: `ok=${lt1?.ok} error=${String(lt1?.error || 'none').slice(0, 60)}`,
      pass: lt1?.ok === false && String(lt1?.error || '') === 'load_tester needs an http(s) url to hit.',
      detail: 'SCHEME pin: ^https?:// gate; no network touched (fetch guard would throw regardless)',
    });

    // ---- ci_generate_pipeline (ABSOLUTE sbx paths; {} deliberately unprobed) ----
    const ciProj = path.join(tree, 'ci-proj');
    fs.mkdirSync(ciProj, { recursive: true });
    const ci0: any = await executeTool('ci_generate_pipeline', { path: ciProj }, attr);
    const ci0o = (ci0?.output as any) || {};
    const ci0disk = path.join(ciProj, '.github', 'workflows', 'node-ci.yml');
    let ci0content = '';
    try { ci0content = fs.readFileSync(ci0disk, 'utf-8'); } catch { ci0content = ''; }
    const ci0pass = ci0?.ok === true && ci0o.skipped === false
      && String(ci0o.workflowPath || '').endsWith('node-ci.yml')
      && ci0content.includes('Node.js CI') && ci0content.includes('actions/checkout@v4')
      && JSON.stringify(ci0?.logs || []).includes('created');
    results.push({
      case: 'CI0-ci-create', expect: 'ok=true skipped=false + node-ci.yml on disk with CI markers',
      actual: `ok=${ci0?.ok} skipped=${ci0o.skipped} diskBytes=${ci0content.length} markers=${ci0content.includes('Node.js CI') && ci0content.includes('actions/checkout@v4')}`,
      pass: ci0pass, detail: 'WRITE pin: mkdir -p .github/workflows + workflow write, contained in sbx',
    });

    const ci1: any = await executeTool('ci_generate_pipeline', { path: ciProj }, attr);
    const ci1o = (ci1?.output as any) || {};
    results.push({
      case: 'CI1-ci-skip', expect: 'second call ok=true skipped=true (idempotent, exists branch)',
      actual: `ok=${ci1?.ok} skipped=${ci1o.skipped} logs=${JSON.stringify(ci1?.logs || []).slice(0, 60)}`,
      pass: ci1?.ok === true && ci1o.skipped === true && JSON.stringify(ci1?.logs || []).includes('skipped (exists)'),
      detail: 'IDEMPOTENCE pin: existing workflow never overwritten',
    });

    const ci2: any = await executeTool('ci_generate_pipeline', { path: 'C:\\Windows' }, attr);
    results.push({
      case: 'CI2-ci-escape', expect: 'ok=false includes path_outside_workspace (internal_exception envelope)',
      actual: `ok=${ci2?.ok} error=${String(ci2?.error || 'none').slice(0, 80)}`,
      pass: ci2?.ok === false && String(ci2?.error || '').includes('path_outside_workspace'),
      detail: 'CONTAINMENT pin: resolveToolPath throws with NO handler try/catch -> ToolService catch envelope wraps it (exact envelope in receipt)',
    });

    // ---- quality_run (ABSOLUTE sbx paths; npx-tsc branch deliberately unproven) ----
    const qrBare = path.join(tree, 'qr-bare');
    fs.mkdirSync(qrBare, { recursive: true });
    const qr0: any = await executeTool('quality_run', { path: qrBare, tasks: ['lint', 'test'] }, attr);
    const qr0o = (qr0?.output as any) || {};
    const qr0res = (qr0o.results as any[]) || [];
    const qr0pass = qr0?.ok === false && qr0o.status === 'incomplete'
      && String(qr0?.error || '').includes('No requested quality checks were available')
      && qr0res.length === 2 && qr0res.every((r) => r?.skipped === true);
    results.push({
      case: 'QR0-run-all-skipped', expect: "ok=false status='incomplete' + both skipped on script-less dir",
      actual: `ok=${qr0?.ok} status=${qr0o.status} n=${qr0res.length} err=${String(qr0?.error || 'none').slice(0, 50)}`,
      pass: qr0pass, detail: 'HONEST-INCOMPLETE pin: zero available checks -> ok:false with an explanatory error, never a false pass',
    });

    const qr1: any = await executeTool('quality_run', { path: qrBare, tasks: ['frobnicate129'] }, attr);
    const qr1o = (qr1?.output as any) || {};
    const qr1res = (qr1o.results as any[]) || [];
    results.push({
      case: 'QR1-run-unknown-task', expect: 'unknown task silently skipped:true (no rejection)',
      actual: `ok=${qr1?.ok} status=${qr1o.status} skipped=${qr1res[0]?.skipped}`,
      pass: qr1res.length === 1 && qr1res[0]?.skipped === true && qr1res[0]?.task === 'frobnicate129' && qr1o.status === 'incomplete',
      detail: 'SILENT-SKIP pin (info): unlisted task names fall through to skipped with no validation error (QualityTools.ts:222)',
    });

    seedFile('qr-static/dist/index.html', '<!doctype html><html><head><meta name="joe-artifact-mode" content="static-records"></head><body>fx129</body></html>');
    const qrStatic = path.join(tree, 'qr-static');
    const qr2: any = await executeTool('quality_run', { path: qrStatic, tasks: ['build'] }, attr);
    const qr2o = (qr2?.output as any) || {};
    const qr2build = ((qr2o.results as any[]) || []).find((r) => r?.task === 'build') || {};
    const qr2pass = qr2?.ok === true && qr2o.status === 'completed'
      && qr2build.ok === true && qr2build.skipped === false && qr2build.artifactMode === 'static-records'
      && String(qr2build.output || '').includes('records artifact');
    results.push({
      case: 'QR2-run-static-records', expect: "build passed via artifactMode='static-records' (marker branch, zero shell)",
      actual: `ok=${qr2?.ok} status=${qr2o.status} mode=${qr2build.artifactMode} skipped=${qr2build.skipped}`,
      pass: qr2pass, detail: 'MARKER pin: dist/index.html meta marker short-circuits build before the scripts check (zero spawn)',
    });

    seedFile('qr-pass/test129ok.js', 'process.exit(0);\n');
    seedFile('qr-pass/package.json', JSON.stringify({ name: 'fx129-qr-pass', scripts: { test: 'node test129ok.js' } }));
    const qrPass = path.join(tree, 'qr-pass');
    const qr3: any = await executeTool('quality_run', { path: qrPass, tasks: ['test'] }, attr);
    const qr3o = (qr3?.output as any) || {};
    const qr3test = ((qr3o.results as any[]) || []).find((r) => r?.task === 'test') || {};
    const qr3pass = qr3?.ok === true && qr3o.status === 'completed'
      && qr3test.ok === true && qr3test.skipped === false;
    results.push({
      case: 'QR3-run-npm-pass', expect: 'seeded npm test (node exit 0) passes via runNpmScript (hermetic local spawn)',
      actual: `ok=${qr3?.ok} status=${qr3o.status} testOk=${qr3test.ok} skipped=${qr3test.skipped}`,
      pass: qr3pass, detail: 'HERMETIC-SHELL pin: real ExecutionGateway npm run of a pure-local node script; seeded manifest stops the npm upward climb',
    });

    seedFile('qr-fail/test129fail.js', 'process.exit(3);\n');
    seedFile('qr-fail/package.json', JSON.stringify({ name: 'fx129-qr-fail', scripts: { test: 'node test129fail.js' } }));
    const qrFail = path.join(tree, 'qr-fail');
    const qr4: any = await executeTool('quality_run', { path: qrFail, tasks: ['test'] }, attr);
    const qr4o = (qr4?.output as any) || {};
    const qr4test = ((qr4o.results as any[]) || []).find((r) => r?.task === 'test') || {};
    const qr4pass = qr4?.ok === false && qr4o.status === 'failed'
      && qr4test.ok === false && qr4test.skipped === false
      && String(qr4?.error || '').startsWith('Quality checks failed: test:');
    results.push({
      case: 'QR4-run-npm-fail', expect: "seeded npm test (node exit 3) fails with 'Quality checks failed: test:'",
      actual: `ok=${qr4?.ok} status=${qr4o.status} testOk=${qr4test.ok} err=${String(qr4?.error || 'none').slice(0, 50)}`,
      pass: qr4pass, detail: 'FAILURE-FIDELITY pin: non-zero exit surfaces per-task with the failing task named',
    });

    // ---- pattern_recognize (pure string input; no FS) ----
    const prCode = 'class Svc129 {\n  private static instance: Svc129;\n  static getInstance() { return Svc129.instance; }\n}\n';
    const pr0: any = await executeTool('pattern_recognize', { code: prCode, language: 'typescript' }, attr);
    const pr0pats = (((pr0?.output as any) || {}).patterns as any[]) || [];
    const pr0hit = pr0pats.some((p) => p?.name === 'Singleton' && p?.confidence === 0.85);
    results.push({
      case: 'PR0-pattern-singleton', expect: 'ok=true + Singleton detected at confidence 0.85',
      actual: `ok=${pr0?.ok} n=${pr0pats.length} singleton=${pr0hit}`,
      pass: pr0?.ok === true && pr0hit === true,
      detail: 'POSITIVE pin: static regex table fires per-line (private static instance + getInstance)',
    });

    const pr1: any = await executeTool('pattern_recognize', {}, attr);
    results.push({
      case: 'PR1-pattern-missing-code', expect: "ok=false error='pattern_recognize needs code to read.'",
      actual: `ok=${pr1?.ok} error=${String(pr1?.error || 'none').slice(0, 60)}`,
      pass: pr1?.ok === false && String(pr1?.error || '') === 'pattern_recognize needs code to read.',
      detail: 'REFUSAL pin: missing code is a loud refusal, not a crash (required unenforced at dispatch, OBS-111-2 class)',
    });

    const pr2: any = await executeTool('pattern_recognize', { code: prCode, language: 'go' }, attr);
    const pr2pats = (((pr2?.output as any) || {}).patterns as any[]) || [];
    results.push({
      case: 'PR2-pattern-unimplemented-language', expect: "language 'go' (in enum) -> ok=true patterns=[] (no table)",
      actual: `ok=${pr2?.ok} n=${pr2pats.length}`,
      pass: pr2?.ok === true && pr2pats.length === 0,
      detail: 'ENUM-GAP pin: schema enum promises 5 languages, handler implements 2 (typescript/javascript); go/python/java silently analyze nothing (proposed OBS-129-2 P4)',
    });

    // ---- auto_refactor (ABSOLUTE sbx paths; threaded root mapped by WR0) ----
    seedFile('ar-proj/messy129.js', "import { b } from './b';\nimport { a } from './a';\nimport { b } from './b';\nfunction f129(x) { console.log('dbg129'); if (x) { return 1; } else { return 2; } }\nmodule.exports = { f129 };\n");
    const ar0: any = await executeTool('auto_refactor', { filePath: path.join(tree, 'ar-proj', 'messy129.js'), refactorType: 'all' }, attr);
    const ar0o = (ar0?.output as any) || {};
    const ar0changes = (ar0o.changes as any[]) || [];
    let ar0disk = '';
    try { ar0disk = fs.readFileSync(path.join(tree, 'ar-proj', 'messy129.js'), 'utf-8'); } catch { ar0disk = ''; }
    const ar0bCount = (ar0disk.match(/from '\.\/b'/g) || []).length;
    const ar0pass = ar0?.ok === true
      && ar0changes.some((c) => c?.type === 'optimize-imports')
      && ar0changes.some((c) => c?.type === 'simplify')
      && !ar0disk.includes('console.log') && ar0bCount === 1 && ar0disk.includes('?');
    results.push({
      case: 'AR0-refactor-positive', expect: 'ok=true + optimize-imports/simplify changes + disk rewritten (dedupe, no console.log, ternary)',
      actual: `ok=${ar0?.ok} changes=${ar0changes.map((c) => c?.type).join(',')} noConsole=${!ar0disk.includes('console.log')} bCount=${ar0bCount}`,
      pass: ar0pass, detail: 'WRITE pin: contained in-sbx write-back; import dedupe + console strip + if/else->ternary all fire',
    });

    const ar1: any = await executeTool('auto_refactor', {}, attr);
    results.push({
      case: 'AR1-refactor-missing-arg', expect: "ok=false error='filePath is required'",
      actual: `ok=${ar1?.ok} error=${String(ar1?.error || 'none').slice(0, 40)}`,
      pass: ar1?.ok === false && String(ar1?.error || '') === 'filePath is required',
      detail: 'REFUSAL pin: required unenforced at dispatch (OBS-111-2 class), handler loud',
    });

    const ar2: any = await executeTool('auto_refactor', { filePath: path.join(tree, 'no-such-129.js') }, attr);
    results.push({
      case: 'AR2-refactor-missing-file', expect: "ok=false error includes 'File not found'",
      actual: `ok=${ar2?.ok} error=${String(ar2?.error || 'none').slice(0, 50)}`,
      pass: ar2?.ok === false && String(ar2?.error || '').includes('File not found'),
      detail: 'missing-file refusal after contained resolution (absolute contained miss, never created)',
    });

    seedFile('ar-proj/clean129.js', 'module.exports = { z129: 1 };\n');
    const ar3pre = fs.readFileSync(path.join(tree, 'ar-proj', 'clean129.js'), 'utf-8');
    const ar3: any = await executeTool('auto_refactor', { filePath: path.join(tree, 'ar-proj', 'clean129.js'), refactorType: 'rename' }, attr);
    const ar3changes = ((((ar3?.output as any) || {}).changes as any[]) || []);
    const ar3disk = fs.readFileSync(path.join(tree, 'ar-proj', 'clean129.js'), 'utf-8');
    results.push({
      case: 'AR3-refactor-rename-noop', expect: "refactorType 'rename' (in enum) -> ok=true changes=[] + disk byte-identical",
      actual: `ok=${ar3?.ok} changesN=${ar3changes.length} diskSame=${ar3disk === ar3pre}`,
      pass: ar3?.ok === true && ar3changes.length === 0 && ar3disk === ar3pre,
      detail: 'DEAD-ENUM pin: schema enum promises rename, handler has no branch for it — silent success with zero effect (proposed OBS-129-2 P4)',
    });

    // ---- test_generator (ABSOLUTE sbx paths; seeded manifests pin runner choice) ----
    seedFile('tg-proj/package.json', JSON.stringify({ name: 'fx129-tg-node', scripts: { test: 'node --test' } }));
    seedFile('tg-proj/src129.js', 'function add129(a, b) { return a + b; }\nmodule.exports = { add129: add129 };\n');
    seedFile('tg-proj/sub129.js', 'function sub129(a, b) { return a - b; }\nmodule.exports = { sub129 };\n');
    const tg0: any = await executeTool('test_generator', { filePath: path.join(tree, 'tg-proj', 'src129.js'), testType: 'unit' }, attr);
    const tg0o = (tg0?.output as any) || {};
    let tg0disk = '';
    try { tg0disk = fs.readFileSync(String(tg0o.testFilePath || ''), 'utf-8'); } catch { tg0disk = ''; }
    const tg0pass = tg0?.ok === true && tg0o.runner === 'node'
      && String(tg0o.testFilePath || '').endsWith('.test.js')
      && String(tg0o.importSpecifier || '') === '../src129.js'
      && tg0o.testCount === 2
      && tg0disk.includes("require('node:test')") && tg0disk.includes("require('node:assert/strict')")
      && tg0disk.includes('add129 is exported');
    results.push({
      case: 'TG0-testgen-node-positive', expect: 'ok=true runner=node + __tests__ .test.js on disk with node:test markers + testCount=2',
      actual: `ok=${tg0?.ok} runner=${tg0o.runner} count=${tg0o.testCount} diskBytes=${tg0disk.length}`,
      pass: tg0pass, detail: 'WRITE pin: contained __tests__ generation; colon-form export target detected and drives the per-export case',
    });

    const tg0b: any = await executeTool('test_generator', { filePath: path.join(tree, 'tg-proj', 'sub129.js'), testType: 'unit' }, attr);
    const tg0bo = (tg0b?.output as any) || {};
    let tg0bdisk = '';
    try { tg0bdisk = fs.readFileSync(String(tg0bo.testFilePath || ''), 'utf-8'); } catch { tg0bdisk = ''; }
    const tg0bpass = tg0b?.ok === true && tg0bo.testCount === 1
      && tg0bdisk.includes('loads successfully') && !tg0bdisk.includes('sub129 is exported');
    results.push({
      case: 'TG0b-testgen-shorthand-gap', expect: 'shorthand { sub129 } -> loads-only testCount=1 (last-element detector gap)',
      actual: `ok=${tg0b?.ok} count=${tg0bo.testCount} hasSub=${tg0bdisk.includes('sub129 is exported')}`,
      pass: tg0bpass, detail: 'DETECTOR-GAP pin (info): inner regex needs trailing , or : inside braces, so shorthand-only exports get zero per-export cases (testCount stays truthful; heuristic quality, no OBS)',
    });

    seedFile('tg-jest-proj/package.json', JSON.stringify({ name: 'fx129-tg-jest', scripts: { test: 'jest' } }));
    seedFile('tg-jest-proj/src129j.js', 'function mul129(a, b) { return a * b; }\nmodule.exports = { mul129: mul129 };\n');
    const tg1: any = await executeTool('test_generator', { filePath: path.join(tree, 'tg-jest-proj', 'src129j.js'), testType: 'unit' }, attr);
    const tg1o = (tg1?.output as any) || {};
    let tg1disk = '';
    try { tg1disk = fs.readFileSync(String(tg1o.testFilePath || ''), 'utf-8'); } catch { tg1disk = ''; }
    const tg1pass = tg1?.ok === true && tg1o.runner === 'jest'
      && String(tg1o.importSpecifier || '') === '../src129j'
      && tg1disk.includes('@jest/globals') && tg1disk.includes("it('mul129 is exported'");
    results.push({
      case: 'TG1-testgen-jest-runner', expect: 'runner=jest via scripts.test + @jest/globals import + ext-stripped specifier',
      actual: `ok=${tg1?.ok} runner=${tg1o.runner} spec=${tg1o.importSpecifier} globals=${tg1disk.includes('@jest/globals')}`,
      pass: tg1pass, detail: 'RUNNER-BRANCH pin: detectRunner reads the NEAREST manifest (seeded; no ambient upward dependence); generation only, nothing executed',
    });

    seedFile('tg-ts-proj/package.json', JSON.stringify({ name: 'fx129-tg-ts', scripts: { test: 'node --test' } }));
    seedFile('tg-ts-proj/app129.ts', 'export function f129(): number { return 129; }\n');
    const tg2: any = await executeTool('test_generator', { filePath: path.join(tree, 'tg-ts-proj', 'app129.ts'), testType: 'unit' }, attr);
    const tg2o = (tg2?.output as any) || {};
    const tg2testsDir = fs.existsSync(path.join(tree, 'tg-ts-proj', '__tests__'));
    const tg2pass = tg2?.ok === true && tg2o.generated === false && tg2o.skipped === true
      && String(tg2o.reason || '').includes('test_runner_unsupported')
      && String(tg2o.remediation || '').includes('vitest') && tg2testsDir === false;
    results.push({
      case: 'TG2-testgen-ts-unsupported', expect: 'TS+node -> ok:true generated:false skipped:true + vitest remediation + zero writes',
      actual: `ok=${tg2?.ok} generated=${tg2o.generated} skipped=${tg2o.skipped} testsDir=${tg2testsDir}`,
      pass: tg2pass, detail: 'HONEST-SKIP pin: ok:true with EXPLICIT generated:false (contrast dishonest-ok class); nothing written',
    });

    const tg3: any = await executeTool('test_generator', {}, attr);
    results.push({
      case: 'TG3-testgen-missing-arg', expect: "ok=false error='filePath is required'",
      actual: `ok=${tg3?.ok} error=${String(tg3?.error || 'none').slice(0, 40)}`,
      pass: tg3?.ok === false && String(tg3?.error || '') === 'filePath is required',
      detail: 'REFUSAL pin: required unenforced at dispatch (OBS-111-2 class), handler loud',
    });

    const tg4: any = await executeTool('test_generator', { filePath: path.join(tree, 'no-such-129.js') }, attr);
    results.push({
      case: 'TG4-testgen-missing-file', expect: "ok=false error includes 'File not found'",
      actual: `ok=${tg4?.ok} error=${String(tg4?.error || 'none').slice(0, 50)}`,
      pass: tg4?.ok === false && String(tg4?.error || '').includes('File not found'),
      detail: 'missing-file refusal after contained resolution (absolute contained miss, never created)',
    });

    // ---- performance_profile (ABSOLUTE sbx paths; pure static analysis) ----
    seedFile('pp-proj/slow129.js', "const fs = require('fs');\nfunction load129(p) {\n  const d = fs.readFileSync(p, 'utf-8');\n  let out = '';\n  for (let i = 0; i < d.length; i++) { out += d[i]; }\n  return out;\n}\nmodule.exports = { load129 };\n");
    const pp0: any = await executeTool('performance_profile', { filePath: path.join(tree, 'pp-proj', 'slow129.js') }, attr);
    const pp0o = (pp0?.output as any) || {};
    const pp0issues = (pp0o.issues as any[]) || [];
    const pp0sync = pp0issues.some((s) => s?.type === 'sync-io' && s?.line === 3 && s?.severity === 'medium');
    const pp0cx = (pp0o.complexity as any) || {};
    const pp0rec = (pp0o.recommendations as string[]) || [];
    const pp0pass = pp0?.ok === true && pp0sync === true
      && pp0cx.time === 'O(2^n) or O(n!)' && pp0cx.score === 50
      && pp0rec.some((r) => String(r).includes('async/await'))
      && pp0rec.some((r) => String(r).includes('algorithmic improvements'));
    results.push({
      case: 'PP0-profile-positive', expect: 'ok=true + sync-io@line3 medium + O(2^n)/50 + async+algorithmic recommendations',
      actual: `ok=${pp0?.ok} issues=${pp0issues.length} sync=${pp0sync} cx=${pp0cx.time}/${pp0cx.score}`,
      pass: pp0pass, detail: 'POSITIVE pin: per-line detectors + complexity join (zero execution); recursion heuristic self-matches every named `function name(` (definition contains `name(`) so O(2^n)/50 fires here — heuristic quality, info pin, no OBS (AP0-128 precedent)',
    });

    const pp1: any = await executeTool('performance_profile', {}, attr);
    results.push({
      case: 'PP1-profile-missing-arg', expect: "ok=false error='filePath is required'",
      actual: `ok=${pp1?.ok} error=${String(pp1?.error || 'none').slice(0, 40)}`,
      pass: pp1?.ok === false && String(pp1?.error || '') === 'filePath is required',
      detail: 'REFUSAL pin: required unenforced at dispatch (OBS-111-2 class), handler loud',
    });

    const pp2: any = await executeTool('performance_profile', { filePath: path.join(tree, 'no-such-129.js') }, attr);
    results.push({
      case: 'PP2-profile-missing-file', expect: "ok=false error includes 'File not found'",
      actual: `ok=${pp2?.ok} error=${String(pp2?.error || 'none').slice(0, 50)}`,
      pass: pp2?.ok === false && String(pp2?.error || '').includes('File not found'),
      detail: 'missing-file refusal after contained resolution (absolute contained miss, never created)',
    });

    // ---- doc_generator (ABSOLUTE sbx paths; extensionless case deliberately unprobed) ----
    seedFile('dg-proj/src129doc.js', '/** Adds two numbers. */\nexport function add129(a, b) { return a + b; }\nexport function sub129(a, b) { return a - b; }\n/** Service class. */\nexport class Svc129Doc { run() { return 1; } }\n');
    const dg0: any = await executeTool('doc_generator', { filePath: path.join(tree, 'dg-proj', 'src129doc.js'), outputFormat: 'markdown' }, attr);
    const dg0o = (dg0?.output as any) || {};
    let dg0disk = '';
    try { dg0disk = fs.readFileSync(String(dg0o.outputPath || ''), 'utf-8'); } catch { dg0disk = ''; }
    const dg0pass = dg0?.ok === true && String(dg0o.outputPath || '').endsWith('src129doc.md')
      && dg0disk.includes('# src129doc.js') && dg0disk.includes('### add129') && dg0disk.includes('### Svc129Doc')
      && dg0o.functions === 0 && dg0o.classes === 1;
    results.push({
      case: 'DG0-doc-positive', expect: 'ok=true + .md on disk with markers + functions=0 classes=1 (BROKEN counters)',
      actual: `ok=${dg0?.ok} functions=${dg0o.functions} classes=${dg0o.classes} diskBytes=${dg0disk.length}`,
      pass: dg0pass, detail: 'BROKEN-COUNTER pin: functions regex never matches `### <name>` headers (->0 always); classes regex matches the `## Classes` SECTION header (->1 always) (proposed OBS-129-1 P3 output-fidelity)',
    });

    const dg1: any = await executeTool('doc_generator', {}, attr);
    results.push({
      case: 'DG1-doc-missing-arg', expect: "ok=false error='File not found: missing filePath' (misleading text)",
      actual: `ok=${dg1?.ok} error=${String(dg1?.error || 'none').slice(0, 50)}`,
      pass: dg1?.ok === false && String(dg1?.error || '') === 'File not found: missing filePath',
      detail: 'MISLEADING-ERROR pin: a missing ARG is reported as a missing FILE (sibling tools say filePath is required)',
    });

    seedFile('dg-proj/src129txt.js', 'export function t129() { return 129; }\n');
    const dg2: any = await executeTool('doc_generator', { filePath: path.join(tree, 'dg-proj', 'src129txt.js'), outputFormat: 'txt' }, attr);
    const dg2o = (dg2?.output as any) || {};
    const dg2pass = dg2?.ok === true && String(dg2o.outputPath || '').endsWith('src129txt.txt')
      && fs.existsSync(String(dg2o.outputPath || ''));
    results.push({
      case: 'DG2-doc-unlisted-format', expect: "outputFormat 'txt' (outside enum) -> .txt written (enum unenforced)",
      actual: `ok=${dg2?.ok} out=${String(dg2o.outputPath || 'none').slice(-24)}`,
      pass: dg2pass, detail: 'ENUM-UNENFORCED pin (OBS-111-2 class): markdown/html/json enum not enforced; any string becomes the extension',
    });

    const dg3: any = await executeTool('doc_generator', { filePath: path.join(tree, 'no-such-129.js') }, attr);
    results.push({
      case: 'DG3-doc-missing-file', expect: "ok=false error includes 'File not found'",
      actual: `ok=${dg3?.ok} error=${String(dg3?.error || 'none').slice(0, 50)}`,
      pass: dg3?.ok === false && String(dg3?.error || '').includes('File not found'),
      detail: 'missing-file refusal after contained resolution (absolute contained miss, never created)',
    });

    // Z0: containment — sbx shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const sha256 = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256(zWsKb);
    const zMarkers = ['m129', 'fx129', 'probe129'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        const m = fs.readFileSync('D:/Joe/muse-worktree/api/data/memory/index.json', 'utf-8');
        return zMarkers.some((mk) => a.includes(mk) || b.includes(mk) || m.includes(mk));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveMemSha = sha256(zLiveMem);
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 129 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127/128 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-129-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-129-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
