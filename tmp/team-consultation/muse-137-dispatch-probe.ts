/**
 * MUSE wiring audit 137 — ROUTER-EXCLUSION MECHANISM + RERANK PURE/ASYNC-STUBBED SURFACE.
 *
 * 136 pinned the catalogue STATIC surface (core exact, blind=0, excluded 31/32
 * + known phantom, bridge exact), the SELECTOR contract (determinism, ordering,
 * limit floor, empty collapse, AR lexicon, adversarial bound, case fold, render
 * bridge) and the ROUTER contract (3 shy refusals, 1 positive route, 12-goal
 * no-race sweep). This battery pins the MECHANISM underneath:
 *  (X) exclusion is ROUTE-layer-only: excluded tools ARE selectable (X0),
 *      the sync router never lands on one even for tailor-made bait (X1/X2),
 *      with a live would-win count proving the filter bites (X2), and
 *      inputForTool refuses unfillable tools honestly (X3);
 *  (G) the rerank layer pure surface: registryDigest full/excluded shapes (G0/G1),
 *      needsRerank truth table (G2), parseRanking contract + variants (G3),
 *      kill-switch default + short-circuit (G4/G5), tier-2 reorder via stub (G6),
 *      tier-3 retrieval + tier2-refused fallthrough via stub (G7, incl. the
 *      architecture pin that tier-3 SELECTION may surface excluded tools while
 *      only the ROUTE layer excludes), and capabilityRouteAsync sync-first +
 *      model-cannot-route-excluded via stub (G8).
 *
 * Static facts (read-only source, BEFORE the run):
 * - ROUTER_EXCLUDED (toolCatalog:317-329): 32 names static; 136 S2a proved
 *   31 resolve + phantom bulk_file_generator (known 131 orphan, OBS-136-1 P4).
 * - selectToolsFor `all` filter (toolCatalog:188): name AND description; NO
 *   ROUTER_EXCLUDED check -> excluded tools are selectable (X0 pins live).
 * - capabilityRoute pool (toolCatalog:411-412): name-only + NOT excluded ->
 *   the exclusion filter sits between scoring and ranking (X1/X2 pin live).
 * - capabilityRouteAsync pool (tool-rerank:344-345,352): same exclusion; the
 *   model pool is registryDigest(ROUTER_EXCLUDED) -> the model cannot even
 *   NAME an excluded tool (G8c pins live).
 * - selectToolsForAsync tier-3 digest (tool-rerank:279): registryDigest()
 *   FULL (no exclusion) -> tier-3 retrieval CAN surface excluded tools into
 *   the SELECTION (G7d pins live; consistent with X0, route-layer-only).
 * - needsRerank (tool-rerank:109-115): false when top<=0/empty; false when
 *   top>=12 with no second or gap>=6; else true (G2 pins the table).
 * - parseRanking (tool-rerank:177-211): contract {"ranking"|"pick"|variants},
 *   only candidate names survive in model order, confidence clamped 0..1,
 *   null when nothing survives (G3 pins shapes).
 * - Kill-switch (tool-rerank:246,336): rerankDisabled() short-circuits both
 *   async paths BEFORE resolveCall -> zero model cost (G5 pins live).
 * - Tier-2 gate (tool-rerank:258): candidates>=2 && needsRerank(base); refusal
 *   (conf<threshold) falls through to tier-3 (tool-rerank:274-278) (G6/G7).
 * - Tier-3 gate (tool-rerank:278): topScore<3 (WEAK_SIGNAL_SCORE) or refused.
 *
 * Every case stays on a SAFE surface: pure catalogue scoring/routing/rerank
 * parsing plus STUBBED async paths (explicit in-process llmCall stubs that
 * return canned JSON — zero network, zero model) and one echo control. NO
 * network, NO model, NO browser, NO npm, NO shell execution, NO spend. Same
 * isolated tsx method as 110-136: canonical test env (setup.ts), bypass OFF,
 * full attribution, CWD = the sandbox dir itself, all imports absolute, FS
 * contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
 * tmp/sbx-tmp-137 (fresh). NO DATA_DIR is set. NO AUTO_APPROVE_* set at any
 * point. One CONTAINED env toggle inside G5 only (JOE_TOOL_RERANK set +
 * restored via try/finally; hermetic to this process). No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-137
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-137-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import {
  ACT_VERB,
  CORE_TOOLS,
  ROUTER_EXCLUDED,
  capabilityRoute,
  goalTerms,
  inputForTool,
  norm,
  scoreTool,
  selectToolsFor,
} from 'D:/Joe/muse-worktree/api/src/core/orchestrator/toolCatalog';
import {
  WEAK_SIGNAL_SCORE,
  capabilityRouteAsync,
  clearRerankCache,
  needsRerank,
  parseRanking,
  registryDigest,
  rerankDisabled,
  selectToolsForAsync,
} from 'D:/Joe/muse-worktree/api/src/core/orchestrator/tool-rerank';

interface CaseResult {
  case: string;
  expect: string;
  actual: string;
  pass: boolean;
  detail: string;
  skipped?: boolean;
}

const sha256str = (s: string): string => createHash('sha256').update(s, 'utf-8').digest('hex').toUpperCase();
const sha256file = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };

async function main(): Promise<void> {
  const results: CaseResult[] = [];
  const ambient = {
    ENABLE_AUTH_BYPASS: process.env.ENABLE_AUTH_BYPASS,
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_SAFE: process.env.AUTO_APPROVE_SAFE,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'SET' : 'unset',
    JOE_TOOL_RERANK: process.env.JOE_TOOL_RERANK,
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
  const attr = { workspaceId: 'probe-ws-137', userId: 'probe-user-137' } as any;

  await executionFirewall.runInContext('muse-137-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    const p0f = !dataDir || dataDir === sbxRoot || dataDir.startsWith(sbxRoot + path.sep);
    const p0g = process.env.JOE_TOOL_RERANK === undefined;
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key+data_dir_unset_or_in_sbx+rerank_env_unset',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e} dataOk=${p0f} rerankUnset=${p0g}`,
      pass: p0a && p0b && p0c && !!p0d && p0e && p0f && p0g, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regNames: string[] = (tools as any[]).map((t: any) => String(t?.name || ''));
    const regSet = new Set(regNames);
    const regCount = regNames.length;
    const byName = new Map<string, any>((tools as any[]).map((t: any) => [String(t?.name), t]));
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const sorted = [...regNames].sort();
    const setHash = createHash('sha256').update(sorted.join(',')).digest('hex').toUpperCase().slice(0, 16);
    results.push({
      case: 'RG0-registered-set', expect: 'exact-set hash EQUALS 40739682C4A5CB21 (131 pin, stronger: equality)',
      actual: `n=${regCount} hash=${setHash}`,
      pass: regCount === 163 && setHash === '40739682C4A5CB21',
      detail: 'SET pin: any registration/deregistration/rename since 131 breaks this equality',
    });

    // ---- X0: excluded tools ARE selectable (exclusion is route-layer-only) ----
    const BAITS: Array<[string, string]> = [
      ['shell_execute', 'Execute a shell command to list the running processes'],
      ['write_file', 'Write a file with the deployment notes for the release'],
      ['read_file', 'Read the file with the server configuration settings'],
      ['file_edit', 'Edit the file to fix the configuration value'],
      ['react_project', 'Build a react project dashboard with charts'],
      ['deploy_pages', 'Deploy the static pages to production hosting'],
      ['central_answer', 'Answer the question directly with a short response'],
      ['mobile_builder', 'Build a mobile application with login screens'],
      ['ai_write_file', 'Write a file with AI-generated documentation content'],
      ['project_run', 'Run the project server locally for testing'],
    ];
    let x0hits = 0;
    let x0phantom = 0;
    const x0ranks: string[] = [];
    for (const [target, goal] of BAITS) {
      const sel = selectToolsFor(goal, 30);
      x0phantom += sel.filter((s) => !regSet.has(s.name)).length;
      const idx = sel.findIndex((s) => s.name === target);
      if (idx >= 0) { x0hits += 1; x0ranks.push(`${target}@${idx + 1}`); }
      else x0ranks.push(`${target}:MISS`);
    }
    results.push({
      case: 'X0-selection-sees-excluded', expect: 'hits=10/10 excluded targets retrievable via selectToolsFor (run-1 observed 10/10, re-verified) + zero phantoms across all 10 selections',
      actual: `hits=${x0hits}/10 phantoms=${x0phantom} ranks=[${x0ranks.join(' ')}]`,
      pass: x0hits === 10 && x0phantom === 0,
      detail: 'SELECTION pin: ROUTER_EXCLUDED is not consulted by selectToolsFor; excluded tools stay offered to the planner',
    });

    // ---- X1: sync router never lands excluded on the same bait ----
    let x1routes = 0;
    let x1viol = 0;
    const x1seen: string[] = [];
    for (const [, goal] of BAITS) {
      const r = capabilityRoute(goal);
      if (r) {
        x1routes += 1;
        const t = String((r as any).tool);
        x1seen.push(t);
        if (ROUTER_EXCLUDED.has(t) || !regSet.has(t)) x1viol += 1;
      }
    }
    results.push({
      case: 'X1-router-never-excluded', expect: '0 violations over the 10 exclusion-bait goals (every route null or registered+non-excluded)',
      actual: `routes=${x1routes}/10 violations=${x1viol} targets=[${x1seen.join(',')}]`,
      pass: x1viol === 0,
      detail: 'ROUTE pin: the same goals that SELECT excluded tools never ROUTE to one',
    });

    // ---- X2: 31-goal exclusion sweep + live would-win count ----
    const exclResolved = [...ROUTER_EXCLUDED].filter((n) => regSet.has(n)).sort();
    let x2routes = 0;
    let x2viol = 0;
    let x2wouldWin = 0;
    const x2wouldNames: string[] = [];
    for (const name of exclResolved) {
      const goal = `Audit and review with the ${name.replace(/_/g, ' ')} tool for this request please`;
      const terms = goalTerms(goal);
      const exclTool = byName.get(name);
      const exclScore = scoreTool(exclTool, terms);
      let bestNonExcl = -1;
      for (const t of (tools as any[])) {
        if (!t?.name || ROUTER_EXCLUDED.has(String(t.name))) continue;
        const s = scoreTool(t, terms);
        if (s > bestNonExcl) bestNonExcl = s;
      }
      if (exclScore > bestNonExcl) { x2wouldWin += 1; if (x2wouldNames.length < 8) x2wouldNames.push(`${name}:${exclScore}>${bestNonExcl}`); }
      const r = capabilityRoute(goal);
      if (r) {
        x2routes += 1;
        const t = String((r as any).tool);
        if (ROUTER_EXCLUDED.has(t) || !regSet.has(t)) x2viol += 1;
      }
    }
    results.push({
      case: 'X2-exclusion-sweep-31', expect: '0 violations over all 31 resolvable-excluded bait goals + would-win>=1 (filter bites live)',
      actual: `n=${exclResolved.length} routes=${x2routes} violations=${x2viol} would_win=${x2wouldWin}${x2wouldNames.length ? ' e.g.[' + x2wouldNames.join(' ') + ']' : ''}`,
      pass: exclResolved.length === 31 && x2viol === 0 && x2wouldWin >= 1,
      detail: 'FILTER pin: excluded tools outscore the whole non-excluded pool on would-win baits yet the router never lands on one',
    });

    // ---- X3: inputForTool honest-null + fill pins (runtime-selected tools) ----
    const FILLABLE = /^(url|link|page|address|site|website|query|question|text|request|instruction|goal|task|prompt|description|topic|content|input|projectpath|directory|folder|root|workspacepath)$/i;
    const nullCands: string[] = [];
    for (const t of (tools as any[])) {
      const req: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required.map(String) : [];
      const reqAny: any[] = Array.isArray(t?.inputSchema?.requiredAny) ? t.inputSchema.requiredAny : [];
      if (req.length > 0 && reqAny.length === 0 && req.every((r) => !FILLABLE.test(r))) nullCands.push(String(t.name));
      if (nullCands.length >= 3) break;
    }
    let x3nullOk = 0;
    for (const n of nullCands.slice(0, 3)) {
      const out = inputForTool(byName.get(n), 'handle the items carefully now please', {});
      if (out === null) x3nullOk += 1;
    }
    const urlCands: string[] = [];
    for (const t of (tools as any[])) {
      const req: string[] = Array.isArray(t?.inputSchema?.required) ? t.inputSchema.required.map(String) : [];
      if (req.some((r) => /^(url|link|page|address|site|website)$/i.test(r))) urlCands.push(String(t.name));
      if (urlCands.length >= 2) break;
    }
    let x3fillOk = false;
    let x3fillName = '';
    let x3fillHasUrl = false;
    if (urlCands.length > 0) {
      x3fillName = urlCands[0];
      const out = inputForTool(byName.get(x3fillName), 'Audit the SEO of https://example.com/deep/page', {});
      x3fillHasUrl = !!out && JSON.stringify(out).includes('https://example.com/deep/page');
      x3fillOk = x3fillHasUrl;
    }
    results.push({
      case: 'X3-input-honesty', expect: 'unfillable-required tools -> null (3/3) + a url-required tool fills the URL live',
      actual: `null_cands=${nullCands.length} null_ok=${x3nullOk}/3 [${nullCands.slice(0, 3).join(',')}] fill_tool=${x3fillName || 'NONE'} url_filled=${x3fillHasUrl}`,
      pass: nullCands.length >= 3 && x3nullOk === 3 && x3fillOk,
      detail: 'FILL pin: cannot-feed-it means do-not-call-it (null); a present URL is filled into url-shaped required fields',
    });

    // ---- G0: registryDigest full shape ----
    const digFull = registryDigest();
    const digFullNames = digFull.map((l) => l.split(' — ')[0]);
    const digFullBadFmt = digFull.filter((l) => !l.includes(' — ')).length;
    const digFullUnreg = digFullNames.filter((n) => !regSet.has(n)).length;
    const digFullDup = digFullNames.length - new Set(digFullNames).size;
    let digFullSorted = true;
    for (let i = 1; i < digFull.length; i++) if (digFull[i] < digFull[i - 1]) { digFullSorted = false; break; }
    results.push({
      case: 'G0-digest-full', expect: 'registryDigest() == 163 lines + all names registered + unique + sorted + name — purpose format',
      actual: `n=${digFull.length} unreg=${digFullUnreg} dup=${digFullDup} sorted=${digFullSorted} badfmt=${digFullBadFmt}`,
      pass: digFull.length === 163 && digFullUnreg === 0 && digFullDup === 0 && digFullSorted && digFullBadFmt === 0,
      detail: 'DIGEST pin: the tier-3 model pool is the whole described registry, one sorted line each',
    });

    // ---- G1: registryDigest excluded shape + set reunion ----
    const digExcl = registryDigest(ROUTER_EXCLUDED);
    const digExclNames = digExcl.map((l) => l.split(' — ')[0]);
    const digExclLeak = digExclNames.filter((n) => ROUTER_EXCLUDED.has(n)).length;
    const fullSet = new Set(digFullNames);
    const reunion = new Set([...digExclNames, ...exclResolved]);
    const reunionMiss = digFullNames.filter((n) => !reunion.has(n)).length;
    const reunionExtra = [...reunion].filter((n) => !fullSet.has(n)).length;
    results.push({
      case: 'G1-digest-excluded', expect: 'registryDigest(EXCLUDED) == 132 + zero excluded names + reunion with the 31 resolved excluded == full 163 exactly',
      actual: `n=${digExcl.length} leaked=${digExclLeak} reunion_miss=${reunionMiss} reunion_extra=${reunionExtra}`,
      pass: digExcl.length === 132 && digExclLeak === 0 && reunionMiss === 0 && reunionExtra === 0,
      detail: 'POOL pin: the async-route model pool is exactly the registry minus the 31 resolved excluded tools',
    });

    // ---- G2: needsRerank truth table ----
    const st = (name: string, score: number) => ({ name, score, line: `- ${name} — x` });
    const g2rows: Array<[string, boolean, boolean]> = [
      ['empty', needsRerank([]), false],
      ['zero-top', needsRerank([st('a', 0), st('b', 0)]), false],
      ['solo-decisive', needsRerank([st('a', 25)]), false],
      ['gap7', needsRerank([st('a', 25), st('b', 18)]), false],
      ['gap1', needsRerank([st('a', 25), st('b', 24)]), true],
      ['weak-top', needsRerank([st('a', 11), st('b', 10)]), true],
    ];
    const g2bad = g2rows.filter(([, got, want]) => got !== want);
    results.push({
      case: 'G2-needsRerank-pins', expect: '6/6 truth rows (empty/zero/solo/gap7=false; gap1/weak-top=true)',
      actual: `bad=${g2bad.length}${g2bad.length ? ':' + g2bad.map((r) => r[0]).join(',') : ''}`,
      pass: g2bad.length === 0,
      detail: 'RERANK-GATE pin: decisive winners (top>=12, gap>=6) cost zero tokens; close/weak races ask the model',
    });

    // ---- G3: parseRanking contract + variants ----
    const g3rows: Array<[string, string, boolean]> = [];
    const prA = parseRanking('{"ranking":["b","a"],"confidence":0.9}', ['a', 'b', 'c']);
    g3rows.push(['contract', JSON.stringify(prA), !!prA && prA.ranking.join(',') === 'b,a' && prA.confidence === 0.9]);
    const prB = parseRanking('{"pick":"c"}', ['a', 'b', 'c']);
    g3rows.push(['pick', JSON.stringify(prB), !!prB && prB.ranking.join(',') === 'c' && prB.confidence === 0]);
    const prC = parseRanking('["a","zzz"]', ['a', 'b', 'c']);
    g3rows.push(['bare-array', JSON.stringify(prC), !!prC && prC.ranking.join(',') === 'a' && prC.confidence === 0]);
    const prD = parseRanking('[{"name":"b","confidence":0.8}]', ['a', 'b', 'c']);
    g3rows.push(['obj-array', JSON.stringify(prD), !!prD && prD.ranking.join(',') === 'b' && prD.confidence === 0.8]);
    const prE = parseRanking('{"tools":["zzz"],"confidence":0.9}', ['a', 'b', 'c']);
    g3rows.push(['all-unknown-null', String(prE), prE === null]);
    const prF = parseRanking('not json at all', ['a', 'b', 'c']);
    g3rows.push(['garbage-null', String(prF), prF === null]);
    const prG = parseRanking('{"ranking":["a"],"confidence":2}', ['a', 'b', 'c']);
    g3rows.push(['clamp-hi', JSON.stringify(prG), !!prG && prG.confidence === 1]);
    const prH = parseRanking('{"ranking":["a"],"confidence":-0.5}', ['a', 'b', 'c']);
    g3rows.push(['clamp-lo', JSON.stringify(prH), !!prH && prH.confidence === 0]);
    const prI = parseRanking('Here is my answer: {"ranking":["c","a"],"confidence":0.7} thanks', ['a', 'b', 'c']);
    g3rows.push(['prose-wrapped', JSON.stringify(prI), !!prI && prI.ranking.join(',') === 'c,a' && prI.confidence === 0.7]);
    const g3bad = g3rows.filter((r) => !r[2]);
    results.push({
      case: 'G3-parseRanking-pins', expect: '9/9 shapes (contract/pick/bare-array/obj-array/prose-wrapped parse; unknown/garbage null; confidence clamped)',
      actual: `bad=${g3bad.length}${g3bad.length ? ':' + g3bad.map((r) => `${r[0]}=${r[1]}`).join(' ') : ''}`,
      pass: g3bad.length === 0,
      detail: 'PARSE pin: only candidate names survive in model order; unknown names and garbage yield null, never a guess',
    });

    // ---- G4: rerank on by default ----
    results.push({
      case: 'G4-rerank-default-on', expect: 'rerankDisabled()===false with JOE_TOOL_RERANK unset (P0)',
      actual: `disabled=${rerankDisabled()}`,
      pass: rerankDisabled() === false,
      detail: 'DEFAULT pin: the second-opinion layer is live unless explicitly switched off',
    });

    // ---- G5: kill-switch short-circuits before any model call ----
    clearRerankCache();
    let g5calls = 0;
    const g5stub = async (_p: string): Promise<string> => { g5calls += 1; throw new Error('must-not-be-called'); };
    const g5goal = 'Summarize the server logs for yesterday';
    const g5base = selectToolsFor(g5goal, 30);
    let g5eq = false;
    let g5disabledDuring = false;
    const g5pre = process.env.JOE_TOOL_RERANK;
    try {
      process.env.JOE_TOOL_RERANK = 'off';
      g5disabledDuring = rerankDisabled();
      const g5out = await selectToolsForAsync(g5goal, 30, { llmCall: g5stub });
      g5eq = g5out.length === g5base.length && g5out.every((s, i) => s.name === g5base[i].name && s.score === g5base[i].score);
    } finally {
      if (g5pre === undefined) delete process.env.JOE_TOOL_RERANK; else process.env.JOE_TOOL_RERANK = g5pre;
    }
    const g5restored = rerankDisabled() === false && process.env.JOE_TOOL_RERANK === undefined;
    results.push({
      case: 'G5-killswitch', expect: 'JOE_TOOL_RERANK=off -> disabled + stub calls==0 + output deep-equals base + env restored after',
      actual: `disabled=${g5disabledDuring} calls=${g5calls} equals_base=${g5eq} restored=${g5restored}`,
      pass: g5disabledDuring && g5calls === 0 && g5eq && g5restored,
      detail: 'KILL pin: the switch short-circuits before resolveCall; the toggle is contained to this case (try/finally)',
    });

    // ---- G6: tier-2 reorder via stub (decisive costs zero; ambiguous reorders) ----
    clearRerankCache();
    const SCAN = [
      'Audit the accessibility of my landing page and fix the broken links',
      'Audit the SEO of https://example.com',
      'افحص الروابط المكسورة في موقعي',
      'Review the code',
      'Summarize the server logs for yesterday',
      'Compare the staging and production configs',
      'Generate docs for the payments module',
      'Scan the repository for hardcoded secrets',
    ];
    let g6decisive = '';
    let g6ambig = '';
    const g6scan: string[] = [];
    for (const g of SCAN) {
      const b = selectToolsFor(g, 30);
      const cands = b.filter((s) => s.score > 0).slice(0, 12);
      const need = needsRerank(b);
      g6scan.push(`${b[0] ? b[0].score : '-'}:${need ? 'R' : 'D'}`);
      if (!need && !g6decisive) g6decisive = g;
      if (need && cands.length >= 2 && !g6ambig) g6ambig = g;
    }
    let g6aCalls = -1;
    let g6aEq = false;
    if (g6decisive) {
      const stub = async (_p: string): Promise<string> => { g6aCalls += 1; return '{"ranking":[],"confidence":0.0}'; };
      g6aCalls = 0;
      const base = selectToolsFor(g6decisive, 30);
      const out = await selectToolsForAsync(g6decisive, 30, { llmCall: stub });
      g6aEq = out.length === base.length && out.every((s, i) => s.name === base[i].name);
    }
    let g6bCalls = -1;
    let g6bTop = '';
    let g6bWant = '';
    let g6bSetEq = false;
    let g6bMoved = false;
    if (g6ambig) {
      clearRerankCache();
      const base = selectToolsFor(g6ambig, 30);
      const cands = base.filter((s) => s.score > 0).slice(0, 12).map((s) => s.name);
      const reversed = [...cands].reverse();
      g6bWant = reversed[0];
      let calls = 0;
      const stub = async (_p: string): Promise<string> => { calls += 1; return JSON.stringify({ ranking: reversed, confidence: 0.95 }); };
      const out = await selectToolsForAsync(g6ambig, 30, { llmCall: stub });
      g6bCalls = calls;
      g6bTop = out.length ? out[0].name : 'EMPTY';
      const baseSet = new Set(base.map((s) => s.name));
      g6bSetEq = out.length === base.length && out.every((s) => baseSet.has(s.name));
      g6bMoved = out.some((s, i) => s.name !== base[i].name);
    }
    results.push({
      case: 'G6-tier2-stubbed', expect: 'scan finds decisive+ambiguous; decisive: calls==0 + order unchanged; ambiguous: calls==1 + model top leads + same set + order moved',
      actual: `scan=[${g6scan.join(' ')}] decisive=${g6decisive ? 'yes' : 'NONE'} calls=${g6aCalls} unchanged=${g6aEq} ambig=${g6ambig ? 'yes' : 'NONE'} calls=${g6bCalls} top=${g6bTop} want=${g6bWant} seteq=${g6bSetEq} moved=${g6bMoved}`,
      pass: !!g6decisive && g6aCalls === 0 && g6aEq && !!g6ambig && g6bCalls === 1 && g6bTop === g6bWant && g6bSetEq && g6bMoved,
      detail: 'TIER2 pin: decisive winners never touch the model; ambiguity reorders the SAME candidate set, never invents',
    });

    // ---- G7: tier-3 retrieval + tier2-refused fallthrough via stub ----
    clearRerankCache();
    const ZERO_CANDS = ['xyzzy plugh quux', '???', 'lorem ipsum dolor sit amet consectetur adipiscing elit sed'];
    let g7zero = '';
    let g7zeroTop = -1;
    for (const g of ZERO_CANDS) {
      const b = selectToolsFor(g, 30);
      const top = b.length ? b[0].score : 0;
      if (top < WEAK_SIGNAL_SCORE && !g7zero) { g7zero = g; g7zeroTop = top; }
    }
    let g7aCalls = -1;
    let g7aLead: string[] = [];
    if (g7zero) {
      let calls = 0;
      const picks = ['browser_seo_audit', 'browser_check_links', 'auto_tester'];
      const stub = async (_p: string): Promise<string> => { calls += 1; return JSON.stringify({ ranking: picks, confidence: 0.95 }); };
      const out = await selectToolsForAsync(g7zero, 30, { llmCall: stub });
      g7aCalls = calls;
      g7aLead = out.slice(0, 3).map((s) => s.name);
    }
    let g7dFirst = '';
    if (g7zero) {
      clearRerankCache();
      let calls = 0;
      const stub = async (_p: string): Promise<string> => { calls += 1; return JSON.stringify({ ranking: ['write_file', 'read_file', 'central_answer'], confidence: 0.95 }); };
      const out = await selectToolsForAsync(g7zero + ' v2', 30, { llmCall: stub });
      void calls;
      g7dFirst = out.length ? out[0].name : 'EMPTY';
    }
    let g7bCalls = -1;
    let g7bEq = false;
    let g7bTopScore = -1;
    if (g6ambig) {
      clearRerankCache();
      const base = selectToolsFor(g6ambig, 30);
      g7bTopScore = base.length ? base[0].score : 0;
      let calls = 0;
      const stub = async (_p: string): Promise<string> => { calls += 1; return JSON.stringify({ ranking: base.slice(0, 5).map((s) => s.name), confidence: 0.1 }); };
      const out = await selectToolsForAsync(g6ambig, 30, { llmCall: stub });
      g7bCalls = calls;
      g7bEq = out.length === base.length && out.every((s, i) => s.name === base[i].name);
    }
    results.push({
      case: 'G7-tier3-stubbed', expect: 'zero-goal found (top<3); tier3 picks lead (calls>=1) + excluded write_file CAN lead a SELECTION + refused tier2 falls through (calls==2, base unchanged)',
      actual: `zero=${g7zero ? JSON.stringify(g7zero) + '@' + g7zeroTop : 'NONE'} tier3calls=${g7aCalls} lead=[${g7aLead.join(',')}] excl_lead=${g7dFirst} refused_calls=${g7bCalls} refused_top=${g7bTopScore} base_unchanged=${g7bEq}`,
      pass: !!g7zero && g7aCalls >= 1 && g7aLead.join(',') === 'browser_seo_audit,browser_check_links,auto_tester' && g7dFirst === 'write_file' && g7bCalls === 2 && g7bEq,
      detail: 'TIER3 pin: near-zero signal retrieves (model picks lead); SELECTION includes deterministic-path tools (route-layer-only exclusion); double refusal returns base',
    });

    // ---- G8: capabilityRouteAsync sync-first + model-cannot-route-excluded ----
    clearRerankCache();
    const R1GOAL = 'Audit the SEO of https://example.com';
    const g8sync: any = capabilityRoute(R1GOAL);
    let g8aCalls = 0;
    let g8aSame = false;
    if (g8sync) {
      const stub = async (_p: string): Promise<string> => { g8aCalls += 1; return '{"pick":"zzz_nope","confidence":0.99}'; };
      const out: any = await capabilityRouteAsync(R1GOAL, {}, { llmCall: stub });
      g8aSame = !!out && out.tool === g8sync.tool && JSON.stringify(out.input) === JSON.stringify(g8sync.input) && (out as any).via === undefined;
    }
    const ROUTE_SCAN = [
      'Check the thing thoroughly today please',
      'Review the stuff in detail please',
      'Analyze the items carefully now please',
      'Measure the outputs precisely today please',
      'Scan all entries closely right now please',
      'Inspect the units fully this week please',
      'Test the pieces again tomorrow please',
      'Profile the batch of records now please',
    ];
    const U8 = 'https://example.com';
    let g8nullGoal = '';
    for (const g of ROUTE_SCAN) {
      const full = `${g} ${U8}`;
      if (full.trim().length >= 6 && ACT_VERB.test(norm(full)) && capabilityRoute(full) === null) { g8nullGoal = full; break; }
    }
    let g8bTool = '';
    let g8bVia = '';
    let g8bUrl = false;
    let g8bPick = '';
    if (g8nullGoal) {
      const sel = selectToolsFor(g8nullGoal, 30);
      const feed = sel.map((s) => s.name).filter((n) => !ROUTER_EXCLUDED.has(n))
        .find((n) => inputForTool(byName.get(n), g8nullGoal, {}) !== null) || '';
      g8bPick = feed;
      if (feed) {
        const stub = async (_p: string): Promise<string> => JSON.stringify({ pick: feed, confidence: 0.95 });
        const out: any = await capabilityRouteAsync(g8nullGoal, {}, { llmCall: stub });
        g8bTool = out ? String(out.tool) : 'null';
        g8bVia = out ? String((out as any).via || '') : '';
        g8bUrl = !!out && JSON.stringify(out.input || {}).includes(U8);
      }
    }
    let g8cNull = false;
    let g8dNull = false;
    if (g8nullGoal && g8bPick) {
      const stubC = async (_p: string): Promise<string> => JSON.stringify({ pick: 'write_file', confidence: 0.99 });
      g8cNull = (await capabilityRouteAsync(g8nullGoal, {}, { llmCall: stubC })) === null;
      const stubD = async (_p: string): Promise<string> => JSON.stringify({ pick: g8bPick, confidence: 0.5 });
      g8dNull = (await capabilityRouteAsync(g8nullGoal, {}, { llmCall: stubD })) === null;
    }
    results.push({
      case: 'G8-routeAsync-stubbed', expect: 'sync route returned unchanged + stub calls==0; null-route goal rescued via llm-rerank with URL; excluded pick -> null; low-conf pick -> null',
      actual: `sync=${g8sync ? String(g8sync.tool) : 'NONE'} same=${g8aSame} calls=${g8aCalls} nullgoal=${g8nullGoal ? JSON.stringify(g8nullGoal.slice(0, 40)) : 'NONE'} pick=${g8bPick} rescued=${g8bTool} via=${g8bVia} url=${g8bUrl} excl_null=${g8cNull} lowconf_null=${g8dNull}`,
      pass: !!g8sync && g8aSame && g8aCalls === 0 && !!g8nullGoal && !!g8bPick && g8bTool === g8bPick && g8bVia === 'llm-rerank' && g8bUrl && g8cNull && g8dNull,
      detail: 'ASYNC-ROUTE pin: deterministic decision always wins first; the model rescues refused goals but can never name an excluded tool (pool excludes) nor pass under-confident',
    });

    const d1: any = await executeTool('echo', { text: 'probe137-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe137-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    // Z0: containment — sbx shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256file(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256file(zWsKb);
    const zMarkers = ['m137', 'fx137', 'probe137'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        const m = fs.readFileSync('D:/Joe/muse-worktree/api/data/memory/index.json', 'utf-8');
        return zMarkers.some((mk) => a.includes(mk) || b.includes(mk) || m.includes(mk));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveMemSha = sha256file(zLiveMem);
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 137 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127-137 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  console.log('MUSE137_JSON_BEGIN');
  console.log(JSON.stringify({ probe: 'muse-137-dispatch', results, failed: failed.length, skipped: skipped.length }, null, 2));
  console.log('MUSE137_JSON_END');
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-137-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
