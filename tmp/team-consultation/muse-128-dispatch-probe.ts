/**
 * MUSE wiring audit 128 — dispatch-reachability battery: project-introspection
 * + analysis-support FIRST live proofs (Level 4) over SEVEN unprobed
 * registered families: project_detect, analyze_project, analyze_codebase
 * (non-model paths only), secrets_scan_repo, request_analyzer (refusal only),
 * logger, template_manager.
 *
 * Static audit (read-only source, BEFORE the run):
 * - AnalysisTools.ts:27-36: local resolver anchors relative-exists-from-cwd
 *   then delegates to the shared containment rule; absolute paths go through
 *   the same rule (utils.ts:101-108). Escape throws path_outside_workspace
 *   and safePath converts to ok:false (pinned live by PD4/AC2; touches
 *   nothing — the throw precedes any existsSync/scan).
 * - ToolService.ts:198: project_detect + analyze_codebase are LOW risk;
 *   analyze_project/secrets_scan_repo/request_analyzer/logger/
 *   template_manager match NO carve-out -> default 'medium' (:202), allowed
 *   under default autoSafe with zero approval (pinned live: every family
 *   reaches its handler).
 * - project_detect (:195-257): pure read-only scan; maxDepth clamped to
 *   1..10 (default 4); skips dot-dirs + node_modules/dist/build/coverage/
 *   .git/.next/.turbo/.cache. Nonexistent root -> 'Path not found'.
 * - analyze_project (:54-67) -> Analyst.analyze (system/Analyst.ts): pure
 *   local; techStack from react/next/express/vue/tailwindcss/typescript deps;
 *   generateSuggestions checks stack.includes('typescript') LOWERCASE while
 *   the stack holds 'TypeScript' (:56 vs :28) -> the TypeScript-migration
 *   suggestion fires EVEN WHEN typescript is present (pinned live by AP0;
 *   suggestion-quality bug, info pin, no OBS).
 * - analyze_codebase (:80-165): https? URL short-circuits to a browser_run
 *   redirect with NO model call (pinned live by AC0 incl. the ABSENCE of
 *   the analyze.root log); valid-local-path LLM summary via routeToModel is
 *   DELIBERATELY UNPROVEN (122 precedent: model path needs a provider;
 *   router returns an apology STRING on no-provider (:1319) rather than
 *   throwing, so a naive positive would pin apology-as-summary — out of
 *   scope for a dispatch battery, recorded not executed).
 * - secrets_scan_repo (QualityTools.ts:284-349): pure read-only scan;
 *   6 patterns; findings carry {type, file RELATIVE, line} only — no secret
 *   content enters output/logs (pinned live by SS1 incl. relative-path +
 *   line pins); maxFindings caps (default 200); skips ignored dirs,
 *   non-text extensions and files >1MB. required ['path'] is unenforced at
 *   dispatch (OBS-111-2 class) AND the empty-path default resolves to the
 *   DEFAULT workspace root — SS-{} would scan a live tree, so it is
 *   DELIBERATELY UNPROBED (static note only; executing it risks live-tree
 *   scan + real secret-shaped strings in evidence). All SS1 fixtures are
 *   SYNTHETIC shapes built PROGRAMMATICALLY at runtime (fragments only in
 *   this source, 127/BROWSER-STREAM-002 filter-proof precedent); findings
 *   reference file+line only, so receipts stay clean.
 * - request_analyzer (RequestAnalyzerTool.ts): missing userRequest is a loud
 *   refusal (pinned live by RA0/RA1); valid input calls callLLM — DELIBERATELY
 *   UNPROVEN (needs a provider). Static note: permissions=[] / sideEffects=[]
 *   DESPITE a network/model/spend call (cf analyze_codebase ['read',
 *   'internet']) — permission UNDER-declaration, proposed OBS-128-1 (P3).
 * - logger (LoggerTool.ts): write-DECLARED (permissions+sideEffects ['write'],
 *   comment claims file writes + rotation) but implementation is a STATIC
 *   IN-MEMORY array with slice truncation — description/contract mismatch
 *   (static note, 127 vector-similarity precedent). Process-global by
 *   construction: entries logged under workspace A are visible under
 *   workspace B (pinned live by LG2; memory-only so 126-L1 info class,
 *   no OBS). Unknown action throws -> ok:false (LG4). clear+stats round-trip
 *   (LG0/LG5 hygiene pins).
 * - template_manager (TemplateManagerTool.ts): pure data; list -> 5 templates;
 *   react-app -> 8 files; unknown type throws -> ok:false (TM0-TM2). Required
 *   templateType unenforced (OBS-111-2 class) but the handler fails LOUD
 *   ("Template 'undefined' not found", TM3) — contrast pin vs KS3/KA3 silent
 *   defaults.
 *
 * Every case stays on a SAFE surface: read-only scans over SEEDED sbx trees,
 * in-memory logger round-trip, pure template data, refusal pins. NO network
 * (fetch guard throws), NO model (both LLM paths deliberately unprobed), NO
 * browser, NO spend, NO durable writes outside the sbx. Live api/data is
 * read-only (Z0 records hashes + asserts untouched).
 *
 * Same isolated tsx method as 110-127: canonical test env (setup.ts: JSON
 * persistence, mock DB, network fetch guard), bypass OFF (hermetic), full
 * attribution, CWD = the sandbox dir itself (tsx by absolute path, all
 * imports absolute), FS contained via EXTERNAL_PROJECTS_DIR +
 * JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-128 (tree preserved). NO
 * AUTO_APPROVE_* set at any point. No source edited. NO DATA_DIR is set:
 * the knowledge.ts import-time mkdir lands in <sbx>/data (contained; Z0
 * asserts the <sbx>/data shape like 127).
 *
 * Run from the SANDBOX dir (Set-Location INSIDE the shell — a \\?\ workdir
 * prefix breaks tsx.cmd via CMD.EXE UNC fallback, proven by the run1
 * env-failure receipt: CWD fell back to C:\Windows and the vectorDb import
 * died EPERM on mkdir C:\Windows\data\memory):
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-128
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-128-dispatch-probe.ts
 *
 * RUN-1 (sbx-tmp-128, run1b receipts): 33/34 PASS, EXIT 1. One PROBE-
 * expectation bug (receipts preserved): AP1 expected ok=false 'Path not
 * found' but analyze_project has no existsSync gate — Analyst returns
 * {status:'error'} wrapped in ok:true (genuine dishonest-ok discovery,
 * expectation corrected to pin it; proposed OBS-128-2 P2). All 33 other
 * pins held. The earlier run1 receipt is a pure env failure (UNC workdir),
 * zero cases executed.
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

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const dataDir = String(process.env.DATA_DIR || '');
  const attr = { workspaceId: 'probe-ws-128', userId: 'probe-user-128' } as any;
  const attrB = { workspaceId: 'probe-ws-128-B', userId: 'probe-user-128-B' } as any;

  await executionFirewall.runInContext('muse-128-probe', async () => {
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

    const d1: any = await executeTool('echo', { text: 'probe128-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe128-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    const h4: any = await executeTool('run_command', { action: 'list' }, attr);
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required'",
      actual: `ok=${h4?.ok} error=${String(h4?.error || 'none').slice(0, 40)}`,
      pass: h4?.ok === false && String(h4?.error || '') === 'approval_required',
      detail: 'T5-117 winner reproduced (117/121/123/126/127 continuity); nothing executed',
    });

    // ---- fixture trees (fs-seeded, tool-read) ----
    const tree = path.join(sbxRoot, 'fx128', 'tree');
    const seedFile = (rel: string, content: string) => {
      const f = path.join(tree, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, content, 'utf-8');
    };
    seedFile('nodeA/package.json', JSON.stringify({ name: 'fx128-node', dependencies: { react: '^18.0.0', express: '^4.0.0' }, devDependencies: { typescript: '^5.0.0' } }));
    seedFile('pyB/requirements.txt', 'requests==2.0\n');
    seedFile('goC/go.mod', 'module fx128\n\ngo 1.21\n');
    seedFile('deep/l1/l2/l3/l4/l5/nodeDeep/package.json', JSON.stringify({ name: 'fx128-deep' }));
    seedFile('node_modules/sneaky/package.json', JSON.stringify({ name: 'sneaky' }));
    seedFile('dist/sneaky2/package.json', JSON.stringify({ name: 'sneaky2' }));
    seedFile('.hidden/sneaky3/package.json', JSON.stringify({ name: 'sneaky3' }));

    // ---- project_detect ----
    const pd0: any = await executeTool('project_detect', { path: 'fx128/no-such-dir-128' }, attr);
    results.push({
      case: 'PD0-detect-missing-path', expect: "ok=false error='Path not found'",
      actual: `ok=${pd0?.ok} error=${String(pd0?.error || 'none').slice(0, 40)}`,
      pass: pd0?.ok === false && String(pd0?.error || '') === 'Path not found',
      detail: 'missing-root refusal (contained: relative miss resolves inside sbx, never created)',
    });

    const pd1: any = await executeTool('project_detect', { path: 'fx128/tree' }, attr);
    const pd1o = (pd1?.output as any) || {};
    const pd1node = (pd1o.nodeProjects as string[]) || [];
    const pd1py = (pd1o.pythonProjects as string[]) || [];
    const pd1go = (pd1o.goProjects as string[]) || [];
    const pd1pass = pd1?.ok === true && pd1node.length === 1 && pd1node[0].endsWith('nodeA')
      && pd1py.length === 1 && pd1py[0].endsWith('pyB') && pd1go.length === 1 && pd1go[0].endsWith('goC');
    results.push({
      case: 'PD1-detect-positives', expect: 'ok=true node=[nodeA] python=[pyB] go=[goC] (default depth 4)',
      actual: `ok=${pd1?.ok} node=${JSON.stringify(pd1node.map((s) => path.basename(s)))} py=${JSON.stringify(pd1py.map((s) => path.basename(s)))} go=${JSON.stringify(pd1go.map((s) => path.basename(s)))}`,
      pass: pd1pass, detail: 'FULL-HANDLER pin: marker detection per language + default maxDepth 4 (nodeDeep at depth 6 absent)',
    });

    const pd2: any = await executeTool('project_detect', { path: 'fx128/tree', maxDepth: 10 }, attr);
    const pd2node = (((pd2?.output as any) || {}).nodeProjects as string[]) || [];
    const pd2b: any = await executeTool('project_detect', { path: 'fx128/tree', maxDepth: 99 }, attr);
    const pd2bnode = (((pd2b?.output as any) || {}).nodeProjects as string[]) || [];
    const pd2pass = pd2?.ok === true && pd2node.length === 2 && pd2node.some((s) => s.endsWith('nodeDeep'))
      && pd2b?.ok === true && pd2bnode.length === 2;
    results.push({
      case: 'PD2-detect-maxdepth', expect: 'maxDepth 10 finds nodeDeep (2 node); maxDepth 99 clamps to same',
      actual: `d10=${JSON.stringify(pd2node.map((s) => path.basename(s)))} d99n=${pd2bnode.length}`,
      pass: pd2pass, detail: 'CLAMP pin: max(1,min(10)) — 99 behaves exactly as 10; deep project appears only with depth',
    });

    const pd3all = JSON.stringify(pd2?.output || {});
    const pd3pass = !pd3all.includes('sneaky');
    results.push({
      case: 'PD3-detect-ignoredirs', expect: 'zero sneaky hits (node_modules/dist/dot-dir skipped even at depth 10)',
      actual: `sneakyHits=${!pd3pass} nodeN=${pd2node.length}`,
      pass: pd3pass && pd2?.ok === true, detail: 'IGNORE pin: isIgnoredDir + dot-dir skip hold at max depth',
    });

    const pd4: any = await executeTool('project_detect', { path: 'C:\\Windows' }, attr);
    results.push({
      case: 'PD4-detect-escape', expect: 'ok=false path_outside_workspace (touches nothing)',
      actual: `ok=${pd4?.ok} error=${String(pd4?.error || 'none').slice(0, 60)}`,
      pass: pd4?.ok === false && String(pd4?.error || '').includes('path_outside_workspace'),
      detail: 'CONTAINMENT pin: absolute-outside throws before existsSync/scan (utils.ts:101-108 via safePath)',
    });

    // ---- analyze_project ----
    const ap0: any = await executeTool('analyze_project', { path: 'fx128/tree/nodeA' }, attr);
    const ap0o = (ap0?.output as any) || {};
    const ap0stack = (ap0o.techStack as string[]) || [];
    const ap0sugg = (ap0o.suggestions as string[]) || [];
    const ap0pass = ap0?.ok === true && ap0o.type === 'Node.js Project' && ap0o.hasDocker === false
      && ap0stack.includes('React') && ap0stack.includes('Express') && ap0stack.includes('TypeScript')
      && ap0o.structure && (ap0o.structure as any)['package.json'] === 'file'
      && ap0sugg.some((s: string) => s.includes('Migrating to TypeScript'));
    results.push({
      case: 'AP0-analyze-positive', expect: 'ok=true Node.js + React/Express/TypeScript stack + TS-migration suggestion (case bug)',
      actual: `ok=${ap0?.ok} type=${ap0o.type} stack=${JSON.stringify(ap0stack)} suggN=${ap0sugg.length} tsSugg=${ap0sugg.some((s: string) => s.includes('Migrating to TypeScript'))}`,
      pass: ap0pass, detail: "FULL-HANDLER pin: Analyst dep-map + structure + suggestions; includes('typescript') lowercase never matches 'TypeScript' -> suggestion fires despite the dep (info pin, no OBS)",
    });

    const ap1: any = await executeTool('analyze_project', { path: 'fx128/no-such-dir-128' }, attr);
    const ap1o = (ap1?.output as any) || {};
    results.push({
      case: 'AP1-analyze-missing-path', expect: "ok=true output.status='error' (DISHONEST-OK: no existsSync gate unlike PD0/AC1)",
      actual: `ok=${ap1?.ok} status=${ap1o.status} msg=${String(ap1o.message || 'none').slice(0, 40)}`,
      pass: ap1?.ok === true && ap1o.status === 'error' && String(ap1o.message || '').includes('Path does not exist'),
      detail: 'DISHONEST-OK pin (run-1 discovery): AnalyzeProjectTool.execute has NO existsSync check (AnalysisTools.ts:54-67) unlike its two siblings (:100/:202); Analyst.analyze returns {status:error} wrapped in ok:true — any verifier trusting the tool ok is UNSOUND for this shape (proposed OBS-128-2 P2; one-line sibling-precedented repair)',
    });

    const emptyDir = path.join(sbxRoot, 'fx128', 'emptydir128');
    fs.mkdirSync(emptyDir, { recursive: true });
    const ap2: any = await executeTool('analyze_project', { path: 'fx128/emptydir128' }, attr);
    const ap2o = (ap2?.output as any) || {};
    results.push({
      case: 'AP2-analyze-unknown', expect: "ok=true type='Unknown' on project-less dir",
      actual: `ok=${ap2?.ok} type=${ap2o.type} status=${ap2o.status}`,
      pass: ap2?.ok === true && ap2o.type === 'Unknown' && ap2o.status === 'success',
      detail: 'non-node shape pin (Analyst success-with-Unknown, not an error)',
    });

    const ap3: any = await executeTool('analyze_project', {}, attr);
    const ap3o = (ap3?.output as any) || {};
    results.push({
      case: 'AP3-analyze-default-path', expect: "ok=true type='Unknown' (default '.' = contained fresh probe workspace root)",
      actual: `ok=${ap3?.ok} type=${ap3o.type} status=${ap3o.status}`,
      pass: ap3?.ok === true && ap3o.type === 'Unknown',
      detail: 'DEFAULT-ROOT pin: {} resolves to the contained probe workspace root (fresh/empty); benign here — contrast SS-{} deliberately unprobed',
    });

    // ---- analyze_codebase (non-model paths only; LLM summary deliberately unproven) ----
    const ac0: any = await executeTool('analyze_codebase', { path: 'https://github.com/fake128/repo' }, attr);
    const ac0o = (ac0?.output as any) || {};
    const ac0logs = JSON.stringify(ac0?.logs || []);
    const ac0pass = ac0?.ok === true && ac0o.isRemote === true && ac0o.suggestedTool === 'browser_run'
      && String(ac0o.summary || '').includes('browser_run') && !ac0logs.includes('analyze.root');
    results.push({
      case: 'AC0-codebase-url-redirect', expect: 'ok=true isRemote + browser_run suggestion + NO analyze.root log (no model call)',
      actual: `ok=${ac0?.ok} isRemote=${ac0o.isRemote} sugg=${ac0o.suggestedTool} hasAnalyzeLog=${ac0logs.includes('analyze.root')}`,
      pass: ac0pass, detail: 'REDIRECT pin: URL short-circuit precedes scan+model (AnalysisTools.ts:85-95); LLM-summary path explicitly unproven (122 precedent)',
    });

    const ac1: any = await executeTool('analyze_codebase', { path: 'fx128/no-such-dir-128' }, attr);
    results.push({
      case: 'AC1-codebase-missing-path', expect: "ok=false error='Path not found'",
      actual: `ok=${ac1?.ok} error=${String(ac1?.error || 'none').slice(0, 40)}`,
      pass: ac1?.ok === false && String(ac1?.error || '') === 'Path not found',
      detail: 'missing-root refusal before structure/LLM stages',
    });

    const ac2: any = await executeTool('analyze_codebase', { path: 'C:\\Windows' }, attr);
    results.push({
      case: 'AC2-codebase-escape', expect: 'ok=false path_outside_workspace (touches nothing)',
      actual: `ok=${ac2?.ok} error=${String(ac2?.error || 'none').slice(0, 60)}`,
      pass: ac2?.ok === false && String(ac2?.error || '').includes('path_outside_workspace'),
      detail: 'CONTAINMENT pin: same shared rule as PD4 (second live pin of the resolver)',
    });

    // ---- secrets_scan_repo (synthetic shapes built programmatically; NO credential literals) ----
    const scanRoot = path.join(sbxRoot, 'fx128', 'scan');
    const skFrag = 'sk-' + 'A'.repeat(40);
    const patFrag = 'github_pat_' + 'b'.repeat(16);
    const pwFrag = 'password = "' + 'q'.repeat(20) + '"';
    const keyFrag = '-----BEGIN ' + 'RSA PRIVATE KEY' + '-----';
    const awsFrag = 'AKIA' + 'C'.repeat(16);
    const seedScan = (rel: string, line2: string) => {
      const f = path.join(scanRoot, rel);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, `// fx128 benign header\n${line2}\n`, 'utf-8');
    };
    seedScan('keys.ts', `export const K = "${skFrag}";`);
    seedScan('ci.yml', `token: ${patFrag}`);
    seedScan('config.js', `const ${pwFrag};`);
    seedScan('key.txt', keyFrag);
    seedScan('aws.txt', awsFrag);
    seedScan('node_modules/evil.js', `const E = "${'sk-' + 'D'.repeat(40)}";`);
    seedScan('notes.md', `leaked: ${'sk-' + 'E'.repeat(40)}`);

    const cleanRoot = path.join(sbxRoot, 'fx128', 'scan-clean');
    fs.mkdirSync(cleanRoot, { recursive: true });
    fs.writeFileSync(path.join(cleanRoot, 'clean.ts'), 'export const x = 1;\n', 'utf-8');
    fs.writeFileSync(path.join(cleanRoot, 'readme.txt'), 'nothing secret here\n', 'utf-8');

    const ss0: any = await executeTool('secrets_scan_repo', { path: cleanRoot }, attr);
    const ss0o = (ss0?.output as any) || {};
    results.push({
      case: 'SS0-secrets-clean', expect: 'ok=true findings=[] scannedFiles=2',
      actual: `ok=${ss0?.ok} n=${(ss0o.findings as any[])?.length} scanned=${ss0o.scannedFiles}`,
      pass: ss0?.ok === true && Array.isArray(ss0o.findings) && ss0o.findings.length === 0 && ss0o.scannedFiles === 2,
      detail: 'NEGATIVE pin: clean tree scans green (absolute sbx path — relative would resolve to the default root)',
    });

    const ss1: any = await executeTool('secrets_scan_repo', { path: scanRoot }, attr);
    const ss1o = (ss1?.output as any) || {};
    const ss1f = (ss1o.findings as any[]) || [];
    const ss1types = ss1f.map((f) => f?.type).sort();
    const ss1want = ['aws_access_key', 'generic_secret_assignment', 'github_pat', 'openai_key', 'private_key'].sort();
    const ss1rel = ss1f.every((f) => typeof f?.file === 'string' && !path.isAbsolute(f.file) && !f.file.includes('..'));
    const ss1lines = ss1f.every((f) => f?.line === 2);
    const ss1pass = ss1?.ok === false && ss1f.length === 5 && JSON.stringify(ss1types) === JSON.stringify(ss1want) && ss1rel && ss1lines
      && String(ss1?.error || '').includes('Found 5');
    results.push({
      case: 'SS1-secrets-positives', expect: 'ok=false 5 typed findings, relative files, line=2, no secret content in output',
      actual: `ok=${ss1?.ok} n=${ss1f.length} types=${JSON.stringify(ss1types)} rel=${ss1rel} lines2=${ss1lines}`,
      pass: ss1pass, detail: 'FULL-HANDLER pin: 5/6 pattern classes fire (github_token unseeded); findings are {type,file,line} — zero secret bytes in output/logs',
    });

    const ss2: any = await executeTool('secrets_scan_repo', { path: scanRoot, maxFindings: 2 }, attr);
    const ss2f = (((ss2?.output as any) || {}).findings as any[]) || [];
    results.push({
      case: 'SS2-secrets-maxfindings', expect: 'findings.length=2 (cap honored)',
      actual: `ok=${ss2?.ok} n=${ss2f.length} err=${String(ss2?.error || 'none').slice(0, 30)}`,
      pass: ss2?.ok === false && ss2f.length === 2 && String(ss2?.error || '').includes('Found 2'),
      detail: 'CAP pin: maxFindings truncates the walk (default 200)',
    });

    const ss3mod = ss1f.some((f) => String(f?.file || '').includes('node_modules'));
    results.push({
      case: 'SS3-secrets-ignoredir', expect: 'node_modules/evil.js absent from SS1 findings (n stays 5)',
      actual: `n=${ss1f.length} evilHit=${ss3mod}`,
      pass: ss1?.ok === false && ss1f.length === 5 && ss3mod === false,
      detail: 'IGNORE pin: isIgnoredDir skips node_modules before content scan',
    });

    const ss4md = ss1f.some((f) => String(f?.file || '').endsWith('.md'));
    results.push({
      case: 'SS4-secrets-textfilter', expect: 'notes.md absent from SS1 findings (.md not a text ext)',
      actual: `n=${ss1f.length} mdHit=${ss4md}`,
      pass: ss1?.ok === false && ss1f.length === 5 && ss4md === false,
      detail: 'EXT-FILTER pin: only the isTextFile allowlist is scanned (>1MB skip statically noted, unprobed)',
    });

    // ---- request_analyzer (refusal only; valid-input LLM path deliberately unproven) ----
    const ra0: any = await executeTool('request_analyzer', {}, attr);
    results.push({
      case: 'RA0-analyzer-missing-arg', expect: "ok=false needs-userRequest refusal (loud, no model call)",
      actual: `ok=${ra0?.ok} error=${String(ra0?.error || 'none').slice(0, 60)}`,
      pass: ra0?.ok === false && String(ra0?.error || '').includes('userRequest'),
      detail: 'REFUSAL pin: missing required arg is a loud question, not a crash and not a model call (valid-input path explicitly unproven — needs provider)',
    });

    const ra1: any = await executeTool('request_analyzer', { userRequest: '   ' }, attr);
    results.push({
      case: 'RA1-analyzer-blank-arg', expect: 'ok=false same refusal for blank userRequest',
      actual: `ok=${ra1?.ok} error=${String(ra1?.error || 'none').slice(0, 60)}`,
      pass: ra1?.ok === false && String(ra1?.error || '').includes('userRequest'),
      detail: 'REFUSAL pin (whitespace variant): trim-check before any LLM spend',
    });

    // ---- logger (in-memory round-trip; process-global by construction) ----
    const lg0: any = await executeTool('logger', { action: 'clear' }, attr);
    results.push({
      case: 'LG0-logger-clear-hygiene', expect: 'ok=true clear works (fresh-process store starts empty)',
      actual: `ok=${lg0?.ok} cleared=${(lg0?.output as any)?.clearedCount}`,
      pass: lg0?.ok === true && typeof (lg0?.output as any)?.clearedCount === 'number',
      detail: 'HYGIENE pin: clear semantics + fresh-process baseline before the round-trip',
    });

    const lgMarker = 'm128-marker-probe';
    const lg1: any = await executeTool('logger', { action: 'log', level: 'info', message: lgMarker }, attr);
    const lg1id = (lg1?.output as any)?.logId;
    results.push({
      case: 'LG1-logger-log', expect: "ok=true logId shape log_<ts>_<rand>",
      actual: `ok=${lg1?.ok} id=${String(lg1id || 'none').slice(0, 24)}`,
      pass: lg1?.ok === true && typeof lg1id === 'string' && lg1id.startsWith('log_'),
      detail: 'WRITE-HANDLER pin: in-memory append reaches handler at default medium with zero approval (write-declared, memory-only)',
    });

    const lg2: any = await executeTool('logger', { action: 'query', filter: { level: 'info' } }, attrB);
    const lg2logs = (((lg2?.output as any) || {}).logs as any[]) || [];
    const lg2hit = lg2logs.some((l) => l?.message === lgMarker);
    results.push({
      case: 'LG2-logger-cross-workspace', expect: 'different workspaceId query SEES the LG1 marker (global static store)',
      actual: `ok=${lg2?.ok} n=${lg2logs.length} hit=${lg2hit}`,
      pass: lg2?.ok === true && lg2hit === true,
      detail: 'UNSCOPED pin: static in-memory store has zero workspace partitioning by construction (126-L1 info class: memory-only, no durable write, no OBS)',
    });

    const lg3: any = await executeTool('logger', { action: 'stats' }, attr);
    const lg3s = (((lg3?.output as any) || {}).stats as any) || {};
    results.push({
      case: 'LG3-logger-stats', expect: 'ok=true totalLogs>=1 byLevel.info>=1',
      actual: `ok=${lg3?.ok} total=${lg3s.totalLogs} info=${lg3s.byLevel ? lg3s.byLevel.info : '?'}`,
      pass: lg3?.ok === true && (lg3s.totalLogs as number) >= 1 && ((lg3s.byLevel as any) || {}).info >= 1,
      detail: 'STATS pin: aggregation over the live static store',
    });

    const lg4: any = await executeTool('logger', { action: 'defrag128' }, attr);
    results.push({
      case: 'LG4-logger-unknown-action', expect: "ok=false 'Unknown action' (loud, no silent default)",
      actual: `ok=${lg4?.ok} error=${String(lg4?.error || 'none').slice(0, 40)}`,
      pass: lg4?.ok === false && String(lg4?.error || '').includes('Unknown action'),
      detail: 'REFUSAL pin: unlisted action throws inside the handler -> ok:false (inputSchema enum unenforced at dispatch, OBS-111-2 class)',
    });

    const lg5a: any = await executeTool('logger', { action: 'clear' }, attr);
    const lg5b: any = await executeTool('logger', { action: 'stats' }, attr);
    const lg5t = ((((lg5b?.output as any) || {}).stats as any) || {}).totalLogs;
    results.push({
      case: 'LG5-logger-clear-verify', expect: 'clear>=1 then stats total=0 (cleanup pin)',
      actual: `cleared=${(lg5a?.output as any)?.clearedCount} total=${lg5t}`,
      pass: lg5a?.ok === true && ((lg5a?.output as any)?.clearedCount as number) >= 1 && lg5t === 0,
      detail: 'CLEANUP pin: clear drains the global store; process left with zero logger entries',
    });

    // ---- template_manager (pure data) ----
    const tm0: any = await executeTool('template_manager', { templateType: 'list' }, attr);
    const tm0t = (((tm0?.output as any) || {}).templates as any[]) || [];
    results.push({
      case: 'TM0-template-list', expect: 'ok=true 5 templates incl react-app',
      actual: `ok=${tm0?.ok} n=${tm0t.length} names=${tm0t.map((t) => t?.name).join(',')}`,
      pass: tm0?.ok === true && tm0t.length === 5 && tm0t.some((t) => t?.name === 'react-app'),
      detail: 'LIST pin: catalogue shape (name/description/files-count)',
    });

    const tm1: any = await executeTool('template_manager', { templateType: 'react-app', projectName: 'm128app' }, attr);
    const tm1o = (tm1?.output as any) || {};
    const tm1files = (tm1o.files as any[]) || [];
    const tm1pkg = tm1files.find((f) => f?.path === 'package.json');
    results.push({
      case: 'TM1-template-react', expect: 'ok=true 8 files, name=m128app, package.json customized',
      actual: `ok=${tm1?.ok} n=${tm1files.length} name=${tm1o.name} pkgHit=${String(tm1pkg?.content || '').includes('m128app')}`,
      pass: tm1?.ok === true && tm1files.length === 8 && tm1o.name === 'm128app' && String(tm1pkg?.content || '').includes('m128app'),
      detail: 'POSITIVE pin: react-app file set + projectName interpolation (no FS writes — data only)',
    });

    const tm2: any = await executeTool('template_manager', { templateType: 'cobol-mainframe' }, attr);
    results.push({
      case: 'TM2-template-unknown', expect: "ok=false Template 'cobol-mainframe' not found",
      actual: `ok=${tm2?.ok} error=${String(tm2?.error || 'none').slice(0, 60)}`,
      pass: tm2?.ok === false && String(tm2?.error || '').includes('not found'),
      detail: 'REFUSAL pin: unknown catalogue key fails loud (inputSchema enum unenforced at dispatch, OBS-111-2 class)',
    });

    const tm3: any = await executeTool('template_manager', {}, attr);
    results.push({
      case: 'TM3-template-missing-arg', expect: "ok=false Template 'undefined' not found (required unenforced, handler loud)",
      actual: `ok=${tm3?.ok} error=${String(tm3?.error || 'none').slice(0, 60)}`,
      pass: tm3?.ok === false && String(tm3?.error || '').includes('not found'),
      detail: 'CONTRAST pin: OBS-111-2 instance that fails LOUD vs KS3/KA3 silent defaults',
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
    const zMarkers = ['m128', 'fx128', 'probe128'];
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
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 128 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-128-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-128-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
