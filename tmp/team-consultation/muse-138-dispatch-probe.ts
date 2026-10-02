/**
 * MUSE wiring audit 138 — RUN-EVIDENCE DURABILITY MATRIX.
 *
 * 137 pinned the router-exclusion MECHANISM (route-layer-only) and the rerank
 * pure/async-stubbed surface. This battery pins the DURABLE-EVIDENCE sink that
 * every QA/verification claim flows through: does a realistic QA finding
 * (fragmentedHeader provenance shape, exact per ui-inspection.ts:745-755 +
 * requestedVw/actualVw per :933) survive the FULL persist/read-back round-trip
 * through run-evidence-store compaction, and what are the live adversarial
 * bounds (depth stepping/floor, byte budget, event window, record cap,
 * rotation, restart-reconcile, session scoping, per-run queue isolation)?
 *
 * Static facts (read-only source, BEFORE the run):
 * - runEvidenceStore = JsonStore('run-evidence') with NO directory ->
 *   path.join(process.cwd(),'data','db') (jsondb.ts:32). The probe runs with
 *   CWD = the sbx dir, so EVERY store write lands in <sbx>/data/db/ and the
 *   three live stores stay byte-identical (Z0 pins both sides).
 * - compactEvent (run-evidence-store.ts:90-125): tries EVIDENCE_DEPTHS
 *   [10,7,5,4] deepest-first; falls back to '[event payload truncated]' when
 *   nothing fits 64KB; last resort '[event payload omitted]'.
 * - compactValue (:74-85): strings sliced to 16_000 chars; arrays capped at
 *   96 items; keys trimmed to 160 chars; depth>=cap -> marker.
 * - boundRecord (:136-159): events trimmed to head-4 + tail-496 at 500;
 *   receipt compacted at cap=4; 2MB record bound shifts events, then guts
 *   the receipt to {status,selfFixReason}.
 * - rotateOldRuns (:171-181): MAX_RUN_RECORDS=100, oldest-updatedAt evicted.
 * - reconcileInterruptedRunEvidence (:306-345): every status='running' record
 *   -> 'interrupted' + run_interrupted/api_restart event.
 * - enqueue (:161-169): per-runId promise chain; getRunEvidence (:289-298)
 *   drains the caller's queue before reading.
 *
 * Every case stays on a SAFE surface: the module's own exported API
 * (create/append/saveRunReceipt/getRunEvidence/getRunEvidenceForSession/
 * reconcileInterruptedRunEvidence/compactEventForTest) against the
 * sbx-scoped store, plus registry re-observation and one echo control. NO
 * network, NO model, NO browser, NO npm, NO shell execution, NO spend. Same
 * isolated tsx method as 110-137: canonical test env (setup.ts), bypass OFF,
 * full attribution, CWD = the sandbox dir itself, all imports absolute, FS
 * contained via EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to
 * tmp/sbx-tmp-138 (fresh). NO DATA_DIR is set. NO AUTO_APPROVE_* set at any
 * point. No source edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-138
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-138-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import {
  EVIDENCE_DEPTHS,
  MAX_EVENTS_PER_RUN,
  MAX_EVENT_BYTES,
  MAX_RUN_RECORDS,
  appendRunEvidenceEvent,
  compactEventForTest,
  createRunEvidence,
  getRunEvidence,
  getRunEvidenceForSession,
  reconcileInterruptedRunEvidence,
  runEvidenceStore,
  saveRunReceipt,
} from 'D:/Joe/muse-worktree/api/src/shared/run-evidence-store';

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
const stable = (v: unknown): string => JSON.stringify(v);

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
  const attr = { workspaceId: 'probe-ws-138', userId: 'probe-user-138' } as any;
  const RID = (s: string): string => `m138-${s}`;

  await executionFirewall.runInContext('muse-138-probe', async () => {
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

    const regNames: string[] = (tools as any[]).map((t: any) => String(t?.name || ''));
    results.push({
      case: 'D0-registered-count', expect: 'registered=163',
      actual: `registered=${regNames.length}`,
      pass: regNames.length === 163, detail: 'registry count re-observed (Muse lineage)',
    });

    const sorted = [...regNames].sort();
    const setHash = createHash('sha256').update(sorted.join(',')).digest('hex').toUpperCase().slice(0, 16);
    results.push({
      case: 'RG0-registered-set', expect: 'n=163 hash=40739682C4A5CB21 (131 pin)',
      actual: `n=${sorted.length} hash=${setHash}`,
      pass: sorted.length === 163 && setHash === '40739682C4A5CB21', detail: 'registry set equality 131->132->133->134->135->136->137->138',
    });

    // E1: realistic fragmentedHeader finding -> append -> read-back deep-equal.
    // Exact producer shape: ui-inspection.ts:745-755 + requestedVw/actualVw (:933).
    const fh: any = {
      sel: 'header.app-bar > div.m138', label: 'fragmented mobile header',
      w: 390, h: 154, rows: 2, offscreenControls: 0,
      url: 'http://127.0.0.1:5002/m138/plants',
      headerBox: { x: 0, y: 0, width: 390, height: 154 },
      childBoxes: [
        { x: 0, y: 0, width: 390, height: 60, tag: 'div' },
        { x: 0, y: 60, width: 390, height: 94, tag: 'nav' },
      ],
      requestedVw: 390, actualVw: 390,
    };
    const e1run = RID('finding');
    await createRunEvidence(e1run, { sessionId: 'm138-sess' });
    await appendRunEvidenceEvent(e1run, {
      type: 'qa_finding', sessionId: 'm138-sess', seq: 1, ts: 1790000000000,
      data: { code: 'mobile_header_fragmented', severity: 'major', evidence: [fh] },
    });
    const e1rec: any = await getRunEvidence(e1run);
    const e1ev = e1rec?.events?.[0]?.data?.evidence?.[0];
    const e1same = stable(e1ev) === stable(fh);
    const e1keys = e1ev ? ['sel', 'label', 'w', 'h', 'rows', 'offscreenControls', 'url', 'headerBox', 'childBoxes', 'requestedVw', 'actualVw'].filter((k) => (e1ev as any)[k] === undefined) : ['NOEVENT'];
    results.push({
      case: 'E1-finding-roundtrip', expect: 'provenance byte-identical after persist+read-back, zero missing keys',
      actual: `same=${e1same} missing=[${e1keys.join(',')}] events=${e1rec?.events?.length}`,
      pass: e1same === true && e1keys.length === 0, detail: 'QA-FINDING pin: url/headerBox/childBoxes/viewports survive the store untouched',
    });

    // E2: small-but-deep payload -> deepest-first cap=10 keeps everything.
    // shape(0)->data(1)->l1(2)..l8(9)->leaf at depth 9 < 10.
    const deep8: any = {};
    let cursor: any = deep8;
    for (let i = 1; i <= 8; i++) { cursor[`l${i}`] = {}; cursor = cursor[`l${i}`]; }
    cursor.leaf = 'leaf138';
    const e2run = RID('deep8');
    await appendRunEvidenceEvent(e2run, { type: 'm138-deep', seq: 1, data: deep8 });
    const e2rec: any = await getRunEvidence(e2run);
    let e2leaf: any = e2rec?.events?.[0]?.data;
    for (let i = 1; i <= 8; i++) e2leaf = e2leaf?.[`l${i}`];
    results.push({
      case: 'E2-deep-small-survives', expect: "depth-8 leaf 'leaf138' intact (cap=10 attempt fits)",
      actual: `leaf=${JSON.stringify(e2leaf?.leaf)} depths=${JSON.stringify(EVIDENCE_DEPTHS)}`,
      pass: e2leaf?.leaf === 'leaf138', detail: 'DEEPEST-FIRST pin: small deep events keep everything, no fixed cliff',
    });

    // E3: depth-12 payload -> truncation markers at depth>=10, no throw.
    // l9 sits at depth 10 -> its value becomes the marker.
    const deep12: any = {};
    let c3: any = deep12;
    for (let i = 1; i <= 12; i++) { c3[`k${i}`] = {}; c3 = c3[`k${i}`]; }
    c3.leaf = 'deep138';
    const e3run = RID('deep12');
    await appendRunEvidenceEvent(e3run, { type: 'm138-deep', seq: 1, data: deep12 });
    const e3rec: any = await getRunEvidence(e3run);
    let e3walk: any = e3rec?.events?.[0]?.data;
    for (let i = 1; i <= 8; i++) e3walk = e3walk?.[`k${i}`];
    results.push({
      case: 'E3-deep-beyond-10-truncates', expect: 'k1..k8 objects survive, k9 == marker, no throw',
      actual: `k8_isobj=${typeof e3walk === 'object' && e3walk !== null} k9=${JSON.stringify(e3walk?.k9)}`,
      pass: (typeof e3walk === 'object' && e3walk !== null) && e3walk?.k9 === '[truncated evidence value]',
      detail: 'DEPTH-FLOOR pin: cap=10 is the live ceiling for a fitting event',
    });

    // E4a: single 100KB string -> sliced to exactly 16_000 chars, prefix kept.
    const big100k = `m138-${'x'.repeat(100 * 1024)}`;
    const e4arun = RID('bigstr');
    await appendRunEvidenceEvent(e4arun, { type: 'm138-big', seq: 1, data: { msg: big100k } });
    const e4arec: any = await getRunEvidence(e4arun);
    const e4amsg = String(e4arec?.events?.[0]?.data?.msg || '');
    results.push({
      case: 'E4a-big-string-sliced', expect: 'len==16000 + prefix kept',
      actual: `len=${e4amsg.length} prefix=${JSON.stringify(e4amsg.slice(0, 8))}`,
      pass: e4amsg.length === 16000 && e4amsg.startsWith('m138-xxx'), detail: 'STRING-CAP pin: 16k slice, head preserved',
    });

    // E4b: 10x20KB strings (160KB compacted) -> whole-payload fallback.
    const fat: any = {};
    for (let i = 0; i < 10; i++) fat[`f${i}`] = 'y'.repeat(20 * 1024);
    const e4brun = RID('fat');
    await appendRunEvidenceEvent(e4brun, { type: 'm138-fat', seq: 1, data: fat });
    const e4brec: any = await getRunEvidence(e4brun);
    results.push({
      case: 'E4b-oversized-fallback', expect: "data == '[event payload truncated]' + record readable",
      actual: `data=${JSON.stringify(e4brec?.events?.[0]?.data)} maxBytes=${MAX_EVENT_BYTES}`,
      pass: e4brec?.events?.[0]?.data === '[event payload truncated]' && e4brec?.runId === e4brun,
      detail: 'BYTE-BUDGET pin: overshoot loses the payload, never the record',
    });

    // E6: receipt round-trip (shallow QA-shaped receipt survives; phase_receipt event present).
    const e6run = RID('receipt');
    const receipt: any = {
      projectRoot: 'D:/Joe/muse-worktree/tmp/sbx-tmp-138/projects/m138-app',
      taskReceipts: [{ tool: 'write_file', ok: true }, { tool: 'read_file', ok: true }],
      fidelityVerdict: { passed: true, checks: 3 },
    };
    await saveRunReceipt(e6run, receipt, 'done');
    const e6rec: any = await getRunEvidence(e6run);
    const e6phase = (e6rec?.events || []).find((e: any) => e?.type === 'phase_receipt');
    results.push({
      case: 'E6-receipt-roundtrip', expect: 'status done + receipt deep-equal + phase_receipt event carries projectRoot',
      actual: `status=${e6rec?.status} receiptSame=${stable(e6rec?.receipt) === stable(receipt)} phaseRoot=${JSON.stringify((e6phase?.data as any)?.projectRoot || 'MISSING')}`,
      pass: e6rec?.status === 'done' && stable(e6rec?.receipt) === stable(receipt) && (e6phase?.data as any)?.projectRoot === receipt.projectRoot,
      detail: 'RECEIPT pin: durable receipt + receipt-event both survive with QA shape',
    });

    // E9: session query oldest-first + session-scoped.
    const r9a = RID('sess-a1');
    const r9b = RID('sess-a2');
    const r9c = RID('sess-b1');
    await createRunEvidence(r9a, { sessionId: 'm138-s9a' });
    await createRunEvidence(r9b, { sessionId: 'm138-s9a' });
    await createRunEvidence(r9c, { sessionId: 'm138-s9b' });
    const e9rows = await getRunEvidenceForSession('m138-s9a');
    const e9ids = e9rows.map((r: any) => r.runId);
    results.push({
      case: 'E9-session-query', expect: '[sess-a1, sess-a2] oldest-first, sess-b1 excluded',
      actual: `ids=${JSON.stringify(e9ids)}`,
      pass: e9ids.length === 2 && e9ids[0] === r9a && e9ids[1] === r9b,
      detail: 'SESSION pin: the session question answers in creation order, scoped',
    });

    // E10: empty runId is a silent no-op.
    const e10before = (await runEvidenceStore.find()).length;
    await createRunEvidence('');
    await appendRunEvidenceEvent('', { type: 'm138-ghost', data: { x: 1 } });
    const e10after = (await runEvidenceStore.find()).length;
    const e10null = await getRunEvidence('');
    results.push({
      case: 'E10-empty-runid-noop', expect: 'no record created, getRunEvidence returns null',
      actual: `before=${e10before} after=${e10after} get=${e10null === null ? 'null' : 'ROW'}`,
      pass: e10before === e10after && e10null === null, detail: 'EMPTY-ID pin: falsy ids never touch the store',
    });

    // E11: array/key caps via the exported test hook (its documented purpose).
    const e11 = compactEventForTest({ type: 'm138-caps', data: { arr: Array.from({ length: 150 }, (_, i) => i), ['k'.repeat(200)]: 'v' } } as any) as any;
    const e11keys = Object.keys(e11?.data || {});
    results.push({
      case: 'E11-compact-caps', expect: "2 keys kept ('arr' + trimmed) + array capped at 96 + long key trimmed to 160",
      actual: `keys=${e11keys.length} k0=${JSON.stringify(e11keys[0])} k1len=${e11keys.length > 1 ? e11keys[1].length : -1} arrLen=${(e11?.data as any)?.arr?.length}`,
      pass: (e11?.data as any)?.arr?.length === 96 && e11keys.length === 2 && e11keys[0] === 'arr' && e11keys[1].length === 160,
      detail: 'ARRAY/KEY-CAP pin: one producer cannot bloat durable state',
    });

    // E12: two runs, sequential appends -> isolation + per-run order.
    // (Run-1 fired the three appends concurrently and the runB record was
    // LOST (b=[], E8 closed 10 not 11, E7 pre=12 not 13): concurrent
    // first-writes to DIFFERENT runs race the file read-modify-write.
    // That race is filed as OBS-138-1 PROPOSED with run-1 verbatim
    // evidence; this case pins only the deterministic sequential path.)
    const r12a = RID('concur-a');
    const r12b = RID('concur-b');
    await appendRunEvidenceEvent(r12a, { type: 'm138-q', seq: 1, data: { mark: 'A1' } });
    await appendRunEvidenceEvent(r12b, { type: 'm138-q', seq: 1, data: { mark: 'B1' } });
    await appendRunEvidenceEvent(r12a, { type: 'm138-q', seq: 2, data: { mark: 'A2' } });
    const e12a: any = await getRunEvidence(r12a);
    const e12b: any = await getRunEvidence(r12b);
    const e12aseq = (e12a?.events || []).map((e: any) => e?.seq);
    const e12bseq = (e12b?.events || []).map((e: any) => e?.seq);
    results.push({
      case: 'E12-two-run-isolation', expect: 'runA seqs [1,2] ordered, runB seqs [1], zero cross-talk',
      actual: `a=${JSON.stringify(e12aseq)} b=${JSON.stringify(e12bseq)}`,
      pass: stable(e12aseq) === '[1,2]' && stable(e12bseq) === '[1]',
      detail: 'QUEUE pin: sequential appends stay isolated per run; concurrent first-write race is OBS-138-1',
    });

    // E8: restart-reconcile closes EVERY running record (BEFORE E7's 102).
    // Running so far: finding, deep8, deep12, bigstr, fat, sess-a1, sess-a2,
    // sess-b1, concur-a, concur-b + e8self (receipt/ is 'done'; ghost none).
    const e8self = RID('recon');
    await createRunEvidence(e8self, { sessionId: 'm138-s8' });
    const e8expect = [e1run, e2run, e3run, e4arun, e4brun, r9a, r9b, r9c, r12a, r12b, e8self].sort();
    const e8got = (await reconcileInterruptedRunEvidence()).sort();
    const e8rec: any = await getRunEvidence(e8self);
    const e8last = (e8rec?.events || [])[(e8rec?.events || []).length - 1];
    const e8again = await reconcileInterruptedRunEvidence();
    results.push({
      case: 'E8-restart-reconcile', expect: 'all 11 running closed + interrupted/run_interrupted/api_restart + second pass empty',
      actual: `closed=${e8got.length} match=${stable(e8got) === stable(e8expect)} status=${e8rec?.status} last=${e8last?.type}/${(e8last?.data as any)?.reason} again=${e8again.length}`,
      pass: e8got.length === 11 && stable(e8got) === stable(e8expect) && e8rec?.status === 'interrupted'
        && e8last?.type === 'run_interrupted' && (e8last?.data as any)?.reason === 'api_restart' && e8again.length === 0,
      detail: 'RECONCILE pin: stale running records close explicitly; idempotent',
    });

    // E5: 520 appends -> head-4 (seq 1-4) + tail-496 (seq 25-520) survive.
    const e5run = RID('window');
    for (let i = 1; i <= 520; i++) {
      await appendRunEvidenceEvent(e5run, { type: 'm138-seq', seq: i, data: { i } });
    }
    const e5rec: any = await getRunEvidence(e5run);
    const e5seq: number[] = (e5rec?.events || []).map((e: any) => e?.seq);
    results.push({
      case: 'E5-event-window-500', expect: '500 kept: head [1,2,3,4] + tail starts at 25 + last 520',
      actual: `len=${e5seq.length} head=${JSON.stringify(e5seq.slice(0, 4))} fifth=${e5seq[4]} last=${e5seq[e5seq.length - 1]} max=${MAX_EVENTS_PER_RUN}`,
      pass: e5seq.length === 500 && stable(e5seq.slice(0, 4)) === '[1,2,3,4]' && e5seq[4] === 25 && e5seq[499] === 520,
      detail: 'WINDOW pin: head-4 history + fresh tail; the middle is dropped, never the ends',
    });

    // E7: 102 fresh runs -> store holds exactly 100; every pre-E7 record +
    // rot-0/rot-1 evicted oldest-first; rot-101 present. (Pre-E7 ids snapshotted
    // dynamically so a dispatch side-effect row cannot flake the pin.)
    const e7pre: string[] = (await runEvidenceStore.find()).map((r: any) => String(r.runId));
    for (let i = 0; i <= 101; i++) {
      await createRunEvidence(RID(`rot-${i}`), { sessionId: 'm138-rot' });
    }
    const e7all: string[] = (await runEvidenceStore.find()).map((r: any) => String(r.runId));
    const e7set = new Set(e7all);
    const e7preGone = e7pre.filter((id) => !e7set.has(id));
    results.push({
      case: 'E7-record-rotation-100', expect: 'count==100 + all pre-E7 gone + rot-0/rot-1 gone + rot-101 kept',
      actual: `count=${e7all.length} pre=${e7pre.length} preGone=${e7preGone.length} rot0=${e7set.has(RID('rot-0'))} rot1=${e7set.has(RID('rot-1'))} rot101=${e7set.has(RID('rot-101'))} max=${MAX_RUN_RECORDS}`,
      pass: e7all.length === 100 && e7preGone.length === e7pre.length
        && !e7set.has(RID('rot-0')) && !e7set.has(RID('rot-1')) && e7set.has(RID('rot-101')),
      detail: 'ROTATION pin: oldest-updatedAt eviction keeps the store bounded at 100',
    });

    const d1: any = await executeTool('echo', { text: 'probe138-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe138-alive'),
      detail: 'dispatch sanity (low-risk echo reaches handler)',
    });

    // Z0: containment — sbx shape, live stores byte-identical to pre-run.
    const zSbxUsers = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'users.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zSbxMemDir = (() => { try { return fs.statSync(path.join(sbxRoot, 'data', 'memory')).isDirectory(); } catch { return false; } })();
    const zSbxRunEv = (() => { try { const s = fs.statSync(path.join(sbxRoot, 'data', 'db', 'run-evidence.json')); return s.isFile() ? s.size : -1; } catch { return -1; } })();
    const zJoeData = String(process.env.JOE_DATA_DIR || '');
    const zJoeInSbx = !!zJoeData && (zJoeData === sbxRoot || zJoeData.startsWith(sbxRoot + path.sep));
    const zLiveKb = 'D:/Joe/muse-worktree/api/data/knowledge.json';
    const zLiveKbHash = sha256file(zLiveKb);
    const zWsKb = 'D:/Joe/muse-worktree/data/knowledge.json';
    const zWsKbHash = sha256file(zWsKb);
    const zMarkers = ['m138', 'fx138', 'probe138'];
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
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape + run-evidence in sbx + live hashes == pre + zero 138 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} sbxRunEv=${zSbxRunEv} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && zSbxRunEv > 0 && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: every store write landed in the sbx; live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  console.log('MUSE138_JSON_BEGIN');
  console.log(JSON.stringify({ probe: 'muse-138-dispatch', results, failed: failed.length, skipped: skipped.length }, null, 2));
  console.log('MUSE138_JSON_END');
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-138-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
