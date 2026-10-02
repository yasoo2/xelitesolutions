/**
 * MUSE wiring audit 127 — dispatch-reachability battery: knowledge_search /
 * knowledge_add FIRST live proofs (Level 4) + KnowledgeService store-root
 * audit closure. Follow-up to 126 (knowledge family was DELIBERATELY
 * unproven there — store-root audit owed; this battery IS that audit,
 * static part first, live part only inside a DATA_DIR-scoped sandbox).
 *
 * Static audit (read-only source, BEFORE the run):
 * - api/src/modules/services/knowledge.ts:6-7: store root is
 *   process.env.DATA_DIR || <cwd>/data, single file knowledge.json.
 *   PROCESS-GLOBAL, NO workspaceId/session/user scoping — cross-workspace
 *   read/write BY CONSTRUCTION (pinned live by KX1).
 * - knowledge.ts:10-12: module-level fs.mkdirSync(DATA_DIR) AT IMPORT —
 *   importing the service (via registry -> KnowledgeTools) creates the
 *   store dir as a side effect. Contained here because DATA_DIR is set in
 *   the shell BEFORE tsx starts (P0 asserts it; Z0 asserts <sbx>/data was
 *   NOT created, proving DATA_DIR won over the cwd fallback).
 * - DATA_DIR is referenced ONLY by knowledge.ts (repo-wide search) — no
 *   other module shares or redirects this store.
 * - search() is read-only (loadKnowledge only; missing file -> []).
 *   add() is read-modify-write of the WHOLE file; save failure is
 *   SWALLOWED (:53-58 catch only console.errors) and add still returns
 *   the doc -> tool returns ok:true for an UNPERSISTED write (pinned
 *   live by KA5).
 * - Description claims 'vector similarity' but search() is deterministic
 *   keyword scoring (phrase/token/tag weights + recency, normalized /50).
 *   Contract/description mismatch, static note (behavior is deterministic
 *   and fully pinnable — no model, no vector store opened).
 * - ToolService.ts:202 default: neither knowledge_search nor knowledge_add
 *   matches any risk carve-out, so BOTH are 'medium' — including the
 *   write-declared knowledge_add (permissions+sideEffects ['write']).
 *   Medium is allowed under default autoSafe, so the write reaches its
 *   handler with NO approval (pinned live by KA4). Precedent: 126-L1
 *   (write-declared task_lifecycle at LOW) was info/no-OBS because it is
 *   broadcast-only with no durable write; knowledge_add DOES durable-write
 *   to a global unscoped store -> proposed OBS-127-1 (P2).
 * - inputSchema required (query / filename+content) is NOT enforced at
 *   dispatch (OBS-111-2 class): handlers String(undefined) their inputs.
 *   {} on search -> query '' which matches EVERY doc at max score
 *   (''.includes is true: +20 text +30 filename +2 recency = 52 -> 1.0),
 *   pinned live by KS3. {} on add -> filename 'unknown.txt' + empty
 *   content WRITTEN to the store, pinned live by KA3.
 *
 * Every case stays on a SAFE surface: read-only search over a SEEDED
 * sbx store, contained writes into DATA_DIR=<sbx>/kdata only, one
 * dir-swap failure-injection with full restore (KA5). NO network, NO
 * model, NO browser, NO vector store, NO spend. Live api/data is
 * read-only (Z0 records hashes + asserts the live knowledge.json path
 * is untouched).
 *
 * Same isolated tsx method as 110-126: canonical test env (setup.ts:
 * JSON persistence, mock DB, network fetch guard), bypass OFF
 * (hermetic), full attribution, zero network, CWD = the sandbox dir
 * itself (tsx by absolute path, all imports absolute), FS contained
 * via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT + DATA_DIR scoped to
 * tmp/sbx-tmp-127 (tree preserved). NO AUTO_APPROVE_* set at any
 * point. No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-127
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects & set DATA_DIR=<sbx>\kdata
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-127-dispatch-probe.ts
 *
 * RUN-1 (sbx-tmp-127): 13/15 PASS, EXIT 1. Two PROBE-expectation bugs
 * (receipts preserved as .run1.stdout/.stderr.log): KS2 expected [] but
 * the recency +2 floor returns the seed at 0.04 (genuine precision
 * discovery, expectation corrected); Z0 expected absent stores but live
 * api/data/knowledge.json (938B, 9/27) + worktree-root data/knowledge.json
 * (311B, 9/26) PRE-EXIST and <sbx>/data/{db,memory} is a contained
 * import-graph side effect (expectation corrected to exact-shape +
 * pre-hash equality). Zero behavior surprises; all 13 other pins held.
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
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const dataDir = String(process.env.DATA_DIR || '');
  const kbFile = dataDir ? path.join(dataDir, 'knowledge.json') : '';
  const attr = { workspaceId: 'probe-ws-127', userId: 'probe-user-127' } as any;
  const attrB = { workspaceId: 'probe-ws-127-B', userId: 'probe-user-127-B' } as any;

  await executionFirewall.runInContext('muse-127-probe', async () => {
    const p0a = process.env.ENABLE_AUTH_BYPASS !== 'true';
    const p0b = executionFirewall.isSystemContext() === false;
    const cwd = process.cwd();
    const p0c = !!sbxRoot && (cwd === sbxRoot || cwd.startsWith(sbxRoot + path.sep));
    const p0d = !process.env.AUTO_APPROVE_ALL && !process.env.AUTO_APPROVE_SAFE;
    const p0e = !process.env.OPENAI_API_KEY;
    const p0f = !!dataDir && (dataDir === sbxRoot || dataDir.startsWith(sbxRoot + path.sep));
    let p0g = false;
    try { p0g = fs.existsSync(dataDir) && fs.statSync(dataDir).isDirectory(); } catch { p0g = false; }
    results.push({
      case: 'P0-preconditions', expect: 'bypass_off+non_system+contained+cwd_in_sbx+no_autoapprove+no_openai_key+data_dir_in_sbx+data_dir_exists',
      actual: `bypass=${process.env.ENABLE_AUTH_BYPASS ?? 'unset'} isSystem=${executionFirewall.isSystemContext()} sbx=${sbxRoot ? 'set' : 'MISSING'} cwd_in_sbx=${p0c} noAA=${p0d} noOpenAI=${p0e} dataInSbx=${p0f} dataExists=${p0g}`,
      pass: p0a && p0b && p0c && !!p0d && p0e && p0f && p0g, detail: `ambient=${JSON.stringify(ambient)}`,
    });

    const regCount = (tools as any[]).length;
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regCount}`,
      pass: regCount === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const d1: any = await executeTool('echo', { text: 'probe127-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe127-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    const h4: any = await executeTool('run_command', { action: 'list' }, attr);
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required'",
      actual: `ok=${h4?.ok} error=${String(h4?.error || 'none').slice(0, 40)}`,
      pass: h4?.ok === false && String(h4?.error || '') === 'approval_required',
      detail: 'T5-117 winner reproduced (117/121/123/126 continuity); nothing executed',
    });

    // ---- knowledge_search: read-only pins over an empty-then-seeded store ----
    const ks0: any = await executeTool('knowledge_search', { query: 'zz-no-match-127-q' }, attr);
    let ks0FileExists = false;
    try { ks0FileExists = fs.existsSync(kbFile); } catch { ks0FileExists = false; }
    results.push({
      case: 'KS0-search-empty-store', expect: 'ok=true results=[] + knowledge.json NOT created (read-only)',
      actual: `ok=${ks0?.ok} results=${JSON.stringify((ks0?.output as any)?.results ?? null)} fileCreated=${ks0FileExists}`,
      pass: ks0?.ok === true && Array.isArray((ks0?.output as any)?.results) && (ks0?.output as any).results.length === 0 && ks0FileExists === false,
      detail: 'READ-ONLY pin: loadKnowledge catch -> [] with zero writes (knowledge.ts:24-32)',
    });

    // Seed ONE doc directly (fs, not the tool) for search positives.
    const seedDoc = { id: 'seed127-id', filename: 'seed127.txt', content: 'wiring battery one-two-seven baseline orchard document', tags: ['seed127'], createdAt: Date.now() };
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(kbFile, JSON.stringify([seedDoc], null, 2), 'utf-8'); } catch { /* positives fail loudly below */ }

    const ks1: any = await executeTool('knowledge_search', { query: 'orchard' }, attr);
    const ks1r = (ks1?.output as any)?.results as any[];
    const ks1ok = ks1?.ok === true && Array.isArray(ks1r) && ks1r.length >= 1
      && ks1r[0]?.filename === 'seed127.txt' && typeof ks1r[0]?.id === 'string'
      && typeof ks1r[0]?.snippet === 'string' && typeof ks1r[0]?.score === 'number'
      && ks1r[0].score > 0 && ks1r[0].score <= 1;
    results.push({
      case: 'KS1-search-positive', expect: 'ok=true results[0]=seed127.txt with id/snippet/0<score<=1',
      actual: `ok=${ks1?.ok} n=${Array.isArray(ks1r) ? ks1r.length : '?'} first=${ks1r && ks1r[0] ? `${ks1r[0].filename} score=${ks1r[0].score}` : 'none'} log=${JSON.stringify(ks1?.logs || []).slice(0, 60)}`,
      pass: ks1ok, detail: 'FULL-HANDLER pin: keyword scoring + /50 normalization + slice(0,10) shape (:68-118)',
    });

    const ks2: any = await executeTool('knowledge_search', { query: 'zz-no-match-127-q' }, attr);
    const ks2r = (ks2?.output as any)?.results as any[];
    results.push({
      case: 'KS2-search-no-match', expect: 'ok=true returns the recent-but-IRRELEVANT seed at score=0.04 (recency floor)',
      actual: `ok=${ks2?.ok} n=${Array.isArray(ks2r) ? ks2r.length : '?'} scores=${Array.isArray(ks2r) ? ks2r.map((r) => r?.score).join(',') : '?'}`,
      pass: ks2?.ok === true && Array.isArray(ks2r) && ks2r.length === 1 && ks2r[0]?.score === 0.04,
      detail: 'PRECISION pin (run-1 discovery): recency +2 alone clears the score>0 filter (:115) -> EVERY doc <7 days old matches EVERY query at 0.04 floor; there is no true no-match on a fresh store (proposed OBS-127-3 P3)',
    });

    const ks3: any = await executeTool('knowledge_search', {}, attr);
    const ks3r = (ks3?.output as any)?.results as any[];
    results.push({
      case: 'KS3-search-no-query', expect: "ok=true returns ALL 1 docs at score=1 (required 'query' unenforced)",
      actual: `ok=${ks3?.ok} n=${Array.isArray(ks3r) ? ks3r.length : '?'} scores=${Array.isArray(ks3r) ? ks3r.map((r) => r?.score).join(',') : '?'}`,
      pass: ks3?.ok === true && Array.isArray(ks3r) && ks3r.length === 1 && ks3r[0]?.score === 1,
      detail: "OBS-111-2 class: String(undefined)->'' matches every doc (+20 text +30 filename +2 recency = 52 -> 1.0); missing required query degrades to a full-store dump at max confidence",
    });

    // ---- knowledge_add: contained-write pins ----
    const ka1: any = await executeTool('knowledge_add', { filename: 'note127.txt', content: 'wiring battery 127 marker alpha zephyr', tags: ['t127'] }, attr);
    const ka1id = (ka1?.output as any)?.id;
    let ka1docs: any[] = [];
    try { ka1docs = JSON.parse(fs.readFileSync(kbFile, 'utf-8')); } catch { ka1docs = []; }
    const ka1new = ka1docs.find((d) => d?.id === ka1id);
    results.push({
      case: 'KA1-add-positive', expect: 'ok=true uuid id + file has 2 docs with filename/tags/createdAt',
      actual: `ok=${ka1?.ok} id=${String(ka1id || 'none').slice(0, 18)} docs=${ka1docs.length} new=${ka1new ? `${ka1new.filename} tags=${JSON.stringify(ka1new.tags)} ts=${typeof ka1new.createdAt}` : 'MISSING'}`,
      pass: ka1?.ok === true && typeof ka1id === 'string' && ka1id.length >= 32 && ka1docs.length === 2 && ka1new?.filename === 'note127.txt' && Array.isArray(ka1new?.tags) && typeof ka1new?.createdAt === 'number',
      detail: 'WRITE-HANDLER pin: read-modify-write whole file (:42-60), contained in DATA_DIR',
    });

    const ka2: any = await executeTool('knowledge_search', { query: 'zephyr' }, attr);
    const ka2r = (ka2?.output as any)?.results as any[];
    results.push({
      case: 'KA2-search-finds-added', expect: 'round-trip: query marker finds note127.txt',
      actual: `ok=${ka2?.ok} files=${Array.isArray(ka2r) ? ka2r.map((r) => r?.filename).join(',') : '?'}`,
      pass: ka2?.ok === true && Array.isArray(ka2r) && ka2r.some((r) => r?.filename === 'note127.txt'),
      detail: 'add->search round-trip inside the contained store',
    });

    const kx1: any = await executeTool('knowledge_search', { query: 'zephyr' }, attrB);
    const kx1r = (kx1?.output as any)?.results as any[];
    results.push({
      case: 'KX1-cross-workspace-read', expect: 'different workspaceId sees the SAME note127.txt (unscoped store)',
      actual: `ok=${kx1?.ok} files=${Array.isArray(kx1r) ? kx1r.map((r) => r?.filename).join(',') : '?'}`,
      pass: kx1?.ok === true && Array.isArray(kx1r) && kx1r.some((r) => r?.filename === 'note127.txt'),
      detail: 'UNSCOPED-STORE pin: zero workspace/session/user partitioning (knowledge.ts has no workspaceId in any path); tenant A reads tenant B writes by construction (OBS-127-1 evidence)',
    });

    const ka3: any = await executeTool('knowledge_add', {}, attr);
    const ka3id = (ka3?.output as any)?.id;
    let ka3docs: any[] = [];
    try { ka3docs = JSON.parse(fs.readFileSync(kbFile, 'utf-8')); } catch { ka3docs = []; }
    const ka3new = ka3docs.find((d) => d?.id === ka3id);
    results.push({
      case: 'KA3-add-missing-args', expect: "ok=true writes filename='unknown.txt' content='' (required unenforced)",
      actual: `ok=${ka3?.ok} docs=${ka3docs.length} new=${ka3new ? `${ka3new.filename} contentLen=${String(ka3new.content ?? '').length}` : 'MISSING'}`,
      pass: ka3?.ok === true && ka3docs.length === 3 && ka3new?.filename === 'unknown.txt' && ka3new?.content === '',
      detail: "OBS-111-2 class: required filename/content unenforced at dispatch; handler defaults (:52-53) write an empty-content doc — a no-op-looking call that mutates the global store",
    });

    results.push({
      case: 'KA4-add-medium-risk', expect: 'both adds reached handler (no approval_required) = write at default medium',
      actual: `ka1err=${String(ka1?.error || 'none')} ka3err=${String(ka3?.error || 'none')}`,
      pass: ka1?.ok === true && ka3?.ok === true,
      detail: "RISK pin: knowledge_add declares permissions+sideEffects ['write'] but matches NO classifyToolRisk carve-out -> default 'medium' (:202), allowed under default autoSafe with zero approval (OBS-127-1 evidence; cf 126-L1 broadcast-only info pin — this one durable-writes)",
    });

    // KA5: failure injection — replace knowledge.json with a DIRECTORY so
    // saveKnowledge throws; add() swallows it (:53-58) and still returns ok.
    let ka5: any = null;
    let ka5backup = '';
    let ka5restored = false;
    try { ka5backup = fs.readFileSync(kbFile, 'utf-8'); } catch { ka5backup = ''; }
    try {
      fs.rmSync(kbFile, { force: true });
      fs.mkdirSync(kbFile, { recursive: true });
      ka5 = await executeTool('knowledge_add', { filename: 'ghost127.txt', content: 'this write cannot persist', tags: [] }, attr);
    } catch (e) {
      ka5 = { ok: 'THREW', error: String((e as any)?.message || e).slice(0, 80) };
    } finally {
      try { fs.rmSync(kbFile, { recursive: true, force: true }); fs.writeFileSync(kbFile, ka5backup, 'utf-8'); ka5restored = true; } catch { ka5restored = false; }
    }
    let ka5docs: any[] = [];
    try { ka5docs = JSON.parse(fs.readFileSync(kbFile, 'utf-8')); } catch { ka5docs = []; }
    const ka5ghost = ka5docs.some((d) => d?.filename === 'ghost127.txt');
    results.push({
      case: 'KA5-add-swallowed-save', expect: 'ok=true DESPITE persist failure + ghost absent after restore (dishonest ok)',
      actual: `ok=${(ka5 as any)?.ok} id=${String((ka5 as any)?.output?.id || 'none').slice(0, 12)} restored=${ka5restored} docs=${ka5docs.length} ghost=${ka5ghost}`,
      pass: (ka5 as any)?.ok === true && ka5restored === true && ka5docs.length === 3 && ka5ghost === false,
      detail: 'HONEST-WRITE pin: saveKnowledge throw is console.error-only (:53-58); caller told ok:true with an id for a doc that exists NOWHERE (proposed OBS-127-2 P1)',
    });

    // Z0: containment — sbx store shape, contained import-graph side effect,
    // live stores byte-identical to pre-run (hashes passed via env).
    const sha256 = (p: string): string => { try { return createHash('sha256').update(fs.readFileSync(p)).digest('hex').toUpperCase(); } catch { return 'UNREADABLE'; } };
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256(zWsKb);
    const zMarkers = ['zephyr', 'ghost127', 'note127', 'seed127', 'probe127'];
    const zMarkerHit = (() => {
      try {
        const a = fs.readFileSync(zLiveKb, 'utf-8'); const b = fs.readFileSync(zWsKb, 'utf-8');
        return zMarkers.some((m) => a.includes(m) || b.includes(m));
      } catch { return true; }
    })();
    const zLiveMem = 'D:/Joe/muse-worktree/api/data/memory/index.json';
    const zLiveHash = (() => { try { const c = fs.readFileSync(zLiveMem); let h = 0; for (const b of c) h = (h * 31 + b) >>> 0; return `len=${c.length} h=${h.toString(16)}`; } catch { return 'ABSENT'; } })();
    const zLiveMemSha = sha256(zLiveMem);
    let zKbDocs = -1;
    try { zKbDocs = (JSON.parse(fs.readFileSync(kbFile, 'utf-8')) as any[]).length; } catch { zKbDocs = -1; }
    const zPreLive = String(process.env.LIVE_KB_PRE || '');
    const zPreWs = String(process.env.WSROOT_KB_PRE || '');
    const zPreMem = String(process.env.LIVEMEM_PRE || '');
    results.push({
      case: 'Z0-containment', expect: 'sbx kb=3 + <sbx>/data shape exact (users.json 2B + memory dir) + both live kb hashes == pre + zero 127 markers + live mem == pre',
      actual: `kbDocs=${zKbDocs} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb=${zLiveKbHash.slice(0, 12)}==pre:${zLiveKbHash === zPreLive} wsKb=${zWsKbHash.slice(0, 12)}==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem=${zLiveHash}==pre:${zLiveMemSha === zPreMem}`,
      pass: zKbDocs === 3 && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: <sbx>/data is a contained import-graph side effect (cwd-default JSON stores; exact shape pinned, zero outside); live stores byte-identical incl. both pre-existing kb files (CWD-fragmentation evidence: worktree-root + api stores coexist)',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-127-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-127-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
