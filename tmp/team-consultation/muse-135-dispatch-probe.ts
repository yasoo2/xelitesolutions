/**
 * MUSE wiring audit 135 — LEDGER CACHEABILITY MATRIX + NARROWING + CAPS.
 *
 * Scope: 134 pinned the reuse decision matrix (passed+cacheable+equal-fp
 * reuses; drift/args/workspace invalidate; untrusted never caches). This
 * battery pins the OTHER half of the contract: WHEN a selection is
 * cacheable at all, HOW explicit-path narrowing behaves, and HOW the
 * bounded ledger caps behave. All cases are pure ledger calls on sbx
 * fixture dirs (zero PhaseExecutor dispatch, zero handler execution
 * except the D1 echo control).
 *
 * Static facts (read-only source, BEFORE the run):
 * - narrowedSafe (ledger:426): mode==='final' || (boundary.complete &&
 *   (!explicit.length || all explicit resolve)). Missing/ambiguous/
 *   outside-scope explicit paths resolve to null -> narrowedSafe=false
 *   -> cacheable=false with 'declared verification paths were missing
 *   or ambiguous' (ledger:527-528). Fallback resolved=[root] (whole
 *   scope fingerprinted, conservative, ledger:427-429).
 * - Ambiguity (ledger:416-421): candidates from workspaceRoot- and
 *   root-relative resolution; unique.length===1 required, else null.
 * - Final mode (ledger:408): explicit=[] -> narrowedSafe ALWAYS true.
 * - Browser gate (ledger:519-520,533): tool ^browser_|visual_qa$
 *   without runtimeTarget+runtimeRevision -> cacheable=false.
 * - Overflow (ledger:505-506): Date.now() mixed into the fingerprint
 *   -> consecutive overflow fingerprints DIFFER (never reusable).
 * - Incomplete (ledger:341-344,353,509-516): outside-scope target,
 *   symlink, non-file/dir, or unreadable bytes -> incomplete=true ->
 *   cacheable=false with 'unsupported links or unreadable files'.
 * - Caps (ledger:640,554): receipts capped at 96 (oldest evicted),
 *   decisions at 192; latest-wins replacement (ledger:636).
 * - Accounting (ledger:244-245): counters survive eviction.
 *
 * Every case stays on a SAFE surface: pure ledger calls, one echo
 * control, sbx fixture dirs (incl. one 65MB overflow file and two
 * directory junctions created via fs.symlinkSync 'junction' — no
 * shell, no admin). NO network, NO model, NO browser, NO npm, NO
 * shell execution, NO spend. Same isolated tsx method as 110-134:
 * canonical test env (setup.ts), bypass OFF, full attribution, CWD
 * = the sandbox dir itself, all imports absolute, FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-135
 * (fresh). NO DATA_DIR is set. NO AUTO_APPROVE_* set at any point.
 * No env mutation between the live selects (environmentIdentity
 * hashes process.env; all deletes happen BEFORE case 1). No source
 * edited.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-135
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   + LIVE_KB_PRE/WSROOT_KB_PRE/LIVEMEM_PRE (pre-run SHA256 of the live stores)
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-135-dispatch-probe.ts
 */
import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import 'D:/Joe/muse-worktree/api/src/__tests__/setup.ts';
import { executionFirewall } from 'D:/Joe/muse-worktree/api/src/orchestration/AgentExecutionFirewall';
import { executeTool } from 'D:/Joe/muse-worktree/api/src/modules/services/ToolService';
import { tools } from 'D:/Joe/muse-worktree/api/src/modules/tools/registry';
import {
  createVerificationLedger,
  selectVerification,
  recordVerification,
  fingerprintVerification,
} from 'D:/Joe/muse-worktree/api/src/core/quality/verification-ledger';

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
  const attr = { workspaceId: 'probe-ws-135', userId: 'probe-user-135' } as any;

  await executionFirewall.runInContext('muse-135-probe', async () => {
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
    const regCount = regNames.length;
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

    // ---- pure-ledger slice (zero dispatch; per-case isolated scope dirs) ----
    const mkScope = (tag: string, files: Record<string, string>): string => {
      const dir = path.join(sbxRoot, 'ledger-scope', tag);
      fs.mkdirSync(dir, { recursive: true });
      for (const [name, content] of Object.entries(files)) {
        const full = path.join(dir, name);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content, 'utf-8');
      }
      return dir;
    };
    const desc = (checkId: string, scopeRoot: string, extra: Record<string, any> = {}): any => ({
      checkId,
      tool: 'read_file',
      args: { path: 'f135.txt' },
      workspaceId: 'probe-ws-135',
      workspaceRoot: sbxRoot,
      scopeRoot,
      mode: 'affected',
      ...extra,
    });

    // N0: missing explicit path -> narrowedSafe=false -> cacheable=false,
    // never reuses even with a recorded passed receipt.
    const scopeN0 = mkScope('n0', { 'f135.txt': 'alpha\nn0-missing-explicit\ntheta\n' });
    let ledN0: any = createVerificationLedger();
    const dN0 = desc('n0-missing-135', scopeN0, { relevantPaths: ['nope/missing135.ts'] });
    const selN0a = selectVerification(ledN0, dN0); ledN0 = selN0a.ledger;
    ledN0 = recordVerification(ledN0, selN0a.selection, 'passed', 12, Date.now());
    const selN0b = selectVerification(ledN0, desc('n0-missing-135', scopeN0, { relevantPaths: ['nope/missing135.ts'] })); ledN0 = selN0b.ledger;
    results.push({
      case: 'N0-missing-explicit-denied', expect: "missing explicit -> cacheable false + 'missing or ambiguous' reason + passed receipt NOT reused (run/run)",
      actual: `cacheable=${selN0a.selection.cacheable} first=${selN0a.selection.action} second=${selN0b.selection.action} reason=${selN0a.selection.reason.slice(0, 60)}`,
      pass: selN0a.selection.cacheable === false && selN0a.selection.action === 'run'
        && selN0b.selection.action === 'run'
        && selN0a.selection.reason === 'selected: declared verification paths were missing or ambiguous, so narrowed reuse is disabled',
      detail: 'MISSING-NARROW pin: an unresolvable declared path disables narrowed reuse entirely',
    });

    // N1a: ambiguous explicit (resolves in BOTH workspaceRoot- and
    // root-relative positions) -> null -> narrowedSafe=false.
    const n1ws = path.join(sbxRoot, 'n1');
    const n1root = path.join(n1ws, 'proj');
    fs.mkdirSync(path.join(n1root, 'proj'), { recursive: true });
    fs.writeFileSync(path.join(n1root, 'x135.txt'), 'inner\n', 'utf-8');
    fs.writeFileSync(path.join(n1root, 'proj', 'x135.txt'), 'nested\n', 'utf-8');
    let ledN1: any = createVerificationLedger();
    const selN1a = selectVerification(ledN1, desc('n1-ambig-135', n1root, { workspaceRoot: n1ws, relevantPaths: ['proj/x135.txt'] })); ledN1 = selN1a.ledger;
    results.push({
      case: 'N1a-ambiguous-explicit-denied', expect: 'dual-resolving explicit -> cacheable false + missing-or-ambiguous reason',
      actual: `cacheable=${selN1a.selection.cacheable} action=${selN1a.selection.action} reason=${selN1a.selection.reason.slice(0, 60)}`,
      pass: selN1a.selection.cacheable === false && selN1a.selection.action === 'run'
        && selN1a.selection.reason === 'selected: declared verification paths were missing or ambiguous, so narrowed reuse is disabled',
      detail: 'AMBIGUOUS-NARROW pin: two candidates for one declared path resolve to null (never pick one silently)',
    });

    // N1b: disambiguated (nested copy removed) -> single resolve ->
    // cacheable + relevantPaths pin the one file.
    fs.unlinkSync(path.join(n1root, 'proj', 'x135.txt'));
    const selN1b = selectVerification(ledN1, desc('n1b-single-135', n1root, { workspaceRoot: n1ws, relevantPaths: ['proj/x135.txt'] })); ledN1 = selN1b.ledger;
    results.push({
      case: 'N1b-disambiguated-cacheable', expect: 'single resolve -> cacheable true + relevantPaths exactly [x135.txt]',
      actual: `cacheable=${selN1b.selection.cacheable} rel=${JSON.stringify(selN1b.selection.descriptor.relevantPaths)}`,
      pass: selN1b.selection.cacheable === true
        && JSON.stringify(selN1b.selection.descriptor.relevantPaths) === JSON.stringify(['x135.txt']),
      detail: 'SINGLE-RESOLVE pin: one candidate narrows to exactly that file',
    });

    // N2: existing-but-outside-scope explicit path -> narrowedSafe=false +
    // whole-scope fallback (relevantPaths ['.']) + unrelated drift changes fp.
    const scopeN2 = mkScope('n2', { 'f135.txt': 'alpha\nn2-outside-explicit\ntheta\n' });
    const outsideFile = path.join(sbxRoot, 'n2-outside135.txt');
    fs.writeFileSync(outsideFile, 'outside\n', 'utf-8');
    let ledN2: any = createVerificationLedger();
    const selN2a = selectVerification(ledN2, desc('n2-outside-135', scopeN2, { relevantPaths: [outsideFile] })); ledN2 = selN2a.ledger;
    const fpN2a = String(selN2a.selection.fingerprint);
    fs.writeFileSync(path.join(scopeN2, 'f135.txt'), 'alpha\nn2-DRIFTED-unrelated\ntheta\n', 'utf-8');
    const selN2b = selectVerification(ledN2, desc('n2-outside-135', scopeN2, { relevantPaths: [outsideFile] })); ledN2 = selN2b.ledger;
    results.push({
      case: 'N2-outside-explicit-conservative', expect: 'outside explicit -> cacheable false + relevantPaths [.] + unrelated in-scope drift changes fp (whole-scope, not narrowed)',
      actual: `cacheable=${selN2a.selection.cacheable} rel=${JSON.stringify(selN2a.selection.descriptor.relevantPaths)} fpChanged=${selN2b.selection.fingerprint !== fpN2a}`,
      pass: selN2a.selection.cacheable === false
        && JSON.stringify(selN2a.selection.descriptor.relevantPaths) === JSON.stringify(['.'])
        && selN2b.selection.fingerprint !== fpN2a,
      detail: 'OUTSIDE-CONSERVATIVE pin: unsafe declared paths widen to the whole project, never narrow silently',
    });

    // N3a: narrowed single file -> cacheable + drift OUTSIDE the narrowing
    // still reuses (proof covers only the narrowed file).
    const scopeN3a = mkScope('n3a', { 'only135.txt': 'alpha\nn3a-narrowed\ntheta\n', 'other135.txt': 'alpha\nn3a-bystander\ntheta\n' });
    let ledN3a: any = createVerificationLedger();
    const dN3a = desc('n3a-narrow-135', scopeN3a, { relevantPaths: ['only135.txt'] });
    const selN3aa = selectVerification(ledN3a, dN3a); ledN3a = selN3aa.ledger;
    ledN3a = recordVerification(ledN3a, selN3aa.selection, 'passed', 12, Date.now());
    fs.writeFileSync(path.join(scopeN3a, 'other135.txt'), 'alpha\nn3a-BYSTANDER-DRIFTED\ntheta\n', 'utf-8');
    const selN3ab = selectVerification(ledN3a, desc('n3a-narrow-135', scopeN3a, { relevantPaths: ['only135.txt'] })); ledN3a = selN3ab.ledger;
    results.push({
      case: 'N3a-narrowed-ignores-outside-drift', expect: 'narrowed cacheable + bystander drift -> reuse with SAME fp',
      actual: `cacheable=${selN3aa.selection.cacheable} second=${selN3ab.selection.action} fpEqual=${selN3ab.selection.fingerprint === selN3aa.selection.fingerprint}`,
      pass: selN3aa.selection.cacheable === true && selN3ab.selection.action === 'reuse'
        && selN3ab.selection.fingerprint === selN3aa.selection.fingerprint,
      detail: 'NARROWED-SCOPE pin: proof covers exactly the narrowed file; bystander drift cannot invalidate it',
    });

    // N3b: drift INSIDE the narrowed file -> invalidated + run.
    const scopeN3b = mkScope('n3b', { 'only135.txt': 'alpha\nn3b-narrowed\ntheta\n', 'other135.txt': 'alpha\nn3b-bystander\ntheta\n' });
    let ledN3b: any = createVerificationLedger();
    const selN3ba = selectVerification(ledN3b, desc('n3b-narrow-135', scopeN3b, { relevantPaths: ['only135.txt'] })); ledN3b = selN3ba.ledger;
    ledN3b = recordVerification(ledN3b, selN3ba.selection, 'passed', 12, Date.now());
    fs.writeFileSync(path.join(scopeN3b, 'only135.txt'), 'alpha\nn3b-NARROWED-DRIFTED\ntheta\n', 'utf-8');
    const selN3bb = selectVerification(ledN3b, desc('n3b-narrow-135', scopeN3b, { relevantPaths: ['only135.txt'] })); ledN3b = selN3bb.ledger;
    results.push({
      case: 'N3b-narrowed-drift-invalidates', expect: 'narrowed-file drift -> run + invalidated reason',
      actual: `action=${selN3bb.selection.action} reason=${selN3bb.selection.reason.slice(0, 40)}`,
      pass: selN3bb.selection.action === 'run' && String(selN3bb.selection.reason).startsWith('invalidated:'),
      detail: 'NARROWED-DRIFT pin: narrowed proof still invalidates when its own file changes',
    });

    // N4: incomplete boundary -> complete=false -> narrowedSafe=false even
    // with zero explicit paths.
    const scopeN4 = mkScope('n4', { 'only135.txt': 'alpha\nn4-boundary\ntheta\n' });
    let ledN4: any = createVerificationLedger();
    const selN4 = selectVerification(ledN4, desc('n4-boundary-135', scopeN4, {
      boundaries: { ui135: { paths: ['only135.txt'], dependsOn: [], incomplete: true } },
      boundary: 'ui135',
    })); ledN4 = selN4.ledger;
    results.push({
      case: 'N4-incomplete-boundary-denied', expect: 'incomplete boundary -> cacheable false + whole-scope rel [.]',
      actual: `cacheable=${selN4.selection.cacheable} rel=${JSON.stringify(selN4.selection.descriptor.relevantPaths)}`,
      pass: selN4.selection.cacheable === false
        && JSON.stringify(selN4.selection.descriptor.relevantPaths) === JSON.stringify(['.']),
      detail: 'BOUNDARY-COMPLETE pin: an incomplete boundary map disables narrowed reuse',
    });

    // N4b control: complete boundary + existing path -> narrowed + cacheable.
    const selN4b = selectVerification(ledN4, desc('n4b-boundary-135', scopeN4, {
      boundaries: { ok135: { paths: ['only135.txt'], dependsOn: [] } },
      boundary: 'ok135',
    })); ledN4 = selN4b.ledger;
    results.push({
      case: 'N4b-complete-boundary-narrows', expect: 'complete boundary -> cacheable true + relevantPaths exactly [only135.txt]',
      actual: `cacheable=${selN4b.selection.cacheable} rel=${JSON.stringify(selN4b.selection.descriptor.relevantPaths)}`,
      pass: selN4b.selection.cacheable === true
        && JSON.stringify(selN4b.selection.descriptor.relevantPaths) === JSON.stringify(['only135.txt']),
      detail: 'BOUNDARY-NARROW pin: a complete boundary narrows to exactly its paths',
    });

    // F0: final mode bypasses narrowing (explicit=[] always) -> a missing
    // declared path does NOT block cacheability; whole scope fingerprinted.
    const scopeF0 = mkScope('f0', { 'f135.txt': 'alpha\nf0-final-mode\ntheta\n' });
    let ledF0: any = createVerificationLedger();
    const selF0a = selectVerification(ledF0, desc('f0-final-135', scopeF0, { mode: 'final', relevantPaths: ['missing135.txt'] })); ledF0 = selF0a.ledger;
    ledF0 = recordVerification(ledF0, selF0a.selection, 'passed', 12, Date.now());
    const selF0b = selectVerification(ledF0, desc('f0-final-135', scopeF0, { mode: 'final', relevantPaths: ['missing135.txt'] })); ledF0 = selF0b.ledger;
    results.push({
      case: 'F0-final-bypasses-narrowing', expect: "final + missing explicit -> cacheable true + rel [.] + second select reuses",
      actual: `cacheable=${selF0a.selection.cacheable} rel=${JSON.stringify(selF0a.selection.descriptor.relevantPaths)} second=${selF0b.selection.action}`,
      pass: selF0a.selection.cacheable === true
        && JSON.stringify(selF0a.selection.descriptor.relevantPaths) === JSON.stringify(['.'])
        && selF0b.selection.action === 'reuse',
      detail: 'FINAL-WHOLE-SCOPE pin: final mode fingerprints the whole scope and never narrowing-blocks',
    });

    // B0: browser tool without target revision -> cacheable=false.
    const scopeB0 = mkScope('b0', { 'f135.txt': 'alpha\nb0-browser\ntheta\n' });
    let ledB0: any = createVerificationLedger();
    const selB0 = selectVerification(ledB0, desc('b0-browser-135', scopeB0, { tool: 'browser_navigate' })); ledB0 = selB0.ledger;
    results.push({
      case: 'B0-browser-no-revision-denied', expect: 'browser tool w/o target+revision -> cacheable false + no-trusted-target reason',
      actual: `cacheable=${selB0.selection.cacheable} reason=${selB0.selection.reason.slice(0, 64)}`,
      pass: selB0.selection.cacheable === false
        && selB0.selection.reason === 'selected: browser verification has no trusted target revision, so stale visual evidence cannot be reused',
      detail: 'BROWSER-REVISION pin: visual proof needs a trusted target revision to be reusable',
    });

    // B1 control: browser tool WITH target+revision -> cacheable + reuses.
    let ledB1: any = createVerificationLedger();
    const dB1 = desc('b1-browser-135', scopeB0, { tool: 'browser_navigate', runtimeTarget: 'http://127.0.0.1:9/probe135', runtimeRevision: 'rev135' });
    const selB1a = selectVerification(ledB1, dB1); ledB1 = selB1a.ledger;
    ledB1 = recordVerification(ledB1, selB1a.selection, 'passed', 12, Date.now());
    const selB1b = selectVerification(ledB1, desc('b1-browser-135', scopeB0, { tool: 'browser_navigate', runtimeTarget: 'http://127.0.0.1:9/probe135', runtimeRevision: 'rev135' })); ledB1 = selB1b.ledger;
    results.push({
      case: 'B1-browser-with-revision-reuses', expect: 'browser tool with target+revision -> cacheable true + second select reuses',
      actual: `cacheable=${selB1a.selection.cacheable} second=${selB1b.selection.action}`,
      pass: selB1a.selection.cacheable === true && selB1b.selection.action === 'reuse',
      detail: 'BROWSER-REVISION-OK pin: pinned target+revision makes visual proof reusable (pure-string, zero network)',
    });

    // O0: 65MB scope exceeds the 64MB budget -> overflow -> cacheable
    // false + consecutive fingerprints DIFFER (Date.now nonce).
    const scopeO0 = path.join(sbxRoot, 'ledger-scope', 'o0');
    fs.mkdirSync(scopeO0, { recursive: true });
    fs.writeFileSync(path.join(scopeO0, 'big135.bin'), Buffer.alloc(65 * 1024 * 1024, 7));
    let ledO0: any = createVerificationLedger();
    const selO0a = selectVerification(ledO0, desc('o0-overflow-135', scopeO0)); ledO0 = selO0a.ledger;
    const selO0b = selectVerification(ledO0, desc('o0-overflow-135', scopeO0)); ledO0 = selO0b.ledger;
    results.push({
      case: 'O0-overflow-never-reusable', expect: '65MB scope -> cacheable false + budget reason + fp1 != fp2 (Date.now nonce)',
      actual: `cacheable=${selO0a.selection.cacheable} reason=${selO0a.selection.reason.slice(0, 52)} fpDiffer=${selO0a.selection.fingerprint !== selO0b.selection.fingerprint}`,
      pass: selO0a.selection.cacheable === false
        && selO0a.selection.reason === 'selected: fingerprint budget exceeded, so reuse is disabled'
        && selO0a.selection.fingerprint !== selO0b.selection.fingerprint,
      detail: 'OVERFLOW pin: over-budget fingerprints are non-deterministic by construction, so reuse is impossible',
    });

    // I0/I1: junction support pre-check (honest skip when unsupported).
    let junctionOk = false;
    try {
      const jScratch = path.join(sbxRoot, 'junction-scratch135');
      const jTarget = path.join(jScratch, 'target');
      fs.mkdirSync(jTarget, { recursive: true });
      fs.writeFileSync(path.join(jTarget, 't.txt'), 't\n', 'utf-8');
      fs.symlinkSync(jTarget, path.join(jScratch, 'link'), 'junction');
      junctionOk = fs.existsSync(path.join(jScratch, 'link', 't.txt'));
      fs.unlinkSync(path.join(jScratch, 'link'));
    } catch { junctionOk = false; }

    // I0: junction to an OUTSIDE dir -> incomplete -> cacheable=false.
    if (!junctionOk) {
      results.push({
        case: 'I0-outside-junction-denied', expect: 'SKIP when junctions unsupported',
        actual: 'junctionUnsupported=true', pass: true, detail: 'honest skip: fs junction creation unavailable in this environment', skipped: true,
      });
    } else {
      const scopeI0 = mkScope('i0', { 'sub/leaf135.txt': 'alpha\ni0-leaf\ntheta\n' });
      const outsideI0 = path.join(sbxRoot, 'i0-out135');
      fs.mkdirSync(outsideI0, { recursive: true });
      fs.writeFileSync(path.join(outsideI0, 'out.txt'), 'outside\n', 'utf-8');
      fs.symlinkSync(outsideI0, path.join(scopeI0, 'linked135'), 'junction');
      let ledI0: any = createVerificationLedger();
      const selI0 = selectVerification(ledI0, desc('i0-junction-135', scopeI0)); ledI0 = selI0.ledger;
      results.push({
        case: 'I0-outside-junction-denied', expect: 'outside junction -> cacheable false + unsupported-links reason',
        actual: `cacheable=${selI0.selection.cacheable} reason=${selI0.selection.reason.slice(0, 64)}`,
        pass: selI0.selection.cacheable === false
          && selI0.selection.reason === 'selected: fingerprint inputs contain unsupported links or unreadable files, so reuse is disabled',
        detail: 'OUTSIDE-LINK pin: a link escaping the scope disables reuse (fail-closed)',
      });
    }

    // I1 (corrected after run-1 21/22: inside junctions are ALSO denied —
    // on this platform lstatSync(junction).isSymbolicLink()===true, so
    // junctions trip both the ancestor-walk containment check and the
    // direct lstat link check. Always conservative = fail-closed safe).
    if (!junctionOk) {
      results.push({
        case: 'I1-inside-junction-still-denied', expect: 'SKIP when junctions unsupported',
        actual: 'junctionUnsupported=true', pass: true, detail: 'honest skip: fs junction creation unavailable in this environment', skipped: true,
      });
    } else {
      const scopeI1 = mkScope('i1', { 'sub/leaf135.txt': 'alpha\ni1-leaf\ntheta\n' });
      fs.symlinkSync(path.join(scopeI1, 'sub'), path.join(scopeI1, 'linked135'), 'junction');
      let ledI1: any = createVerificationLedger();
      const selI1 = selectVerification(ledI1, desc('i1-junction-135', scopeI1)); ledI1 = selI1.ledger;
      results.push({
        case: 'I1-inside-junction-still-denied', expect: 'inside junction -> cacheable false + unsupported-links reason (junctions always conservative)',
        actual: `cacheable=${selI1.selection.cacheable} reason=${selI1.selection.reason.slice(0, 64)}`,
        pass: selI1.selection.cacheable === false
          && selI1.selection.reason === 'selected: fingerprint inputs contain unsupported links or unreadable files, so reuse is disabled',
        detail: 'INSIDE-LINK pin (run-2 correction): junctions read as symlinks via lstat, so every junction disables reuse — conservative by construction',
      });
    }

    // C0: 100 records -> 96 kept, oldest 4 evicted (receipts are a cache).
    const scopeC = mkScope('c0', { 'f135.txt': 'alpha\nc0-caps\ntheta\n' });
    let ledC: any = createVerificationLedger();
    for (let i = 0; i < 100; i++) {
      const tag = `cap135-${String(i).padStart(3, '0')}`;
      const sel = selectVerification(ledC, desc(tag, scopeC)); ledC = sel.ledger;
      ledC = recordVerification(ledC, sel.selection, 'passed', 5, Date.now());
    }
    const receiptsC: any[] = ledC.receipts || [];
    results.push({
      case: 'C0-receipt-cap-evicts-oldest', expect: '100 records -> 96 receipts; oldest cap135-000..003 evicted; last cap135-099 kept',
      actual: `n=${receiptsC.length} first=${receiptsC[0]?.checkId} last=${receiptsC[receiptsC.length - 1]?.checkId}`,
      pass: receiptsC.length === 96 && receiptsC[0]?.checkId === 'cap135-004'
        && receiptsC[receiptsC.length - 1]?.checkId === 'cap135-099',
      detail: 'RECEIPT-CAP pin: the ledger is a bounded reuse cache, not an execution history',
    });

    // C1: 200 selects -> 192 decisions kept.
    let ledC1: any = createVerificationLedger();
    for (let i = 0; i < 200; i++) {
      const tag = `dec135-${String(i).padStart(3, '0')}`;
      const sel = selectVerification(ledC1, desc(tag, scopeC)); ledC1 = sel.ledger;
    }
    const decisionsC1: any[] = ledC1.decisions || [];
    results.push({
      case: 'C1-decision-cap-evicts-oldest', expect: '200 selects -> 192 decisions; first dec135-008 kept',
      actual: `n=${decisionsC1.length} first=${decisionsC1[0]?.checkId}`,
      pass: decisionsC1.length === 192 && decisionsC1[0]?.checkId === 'dec135-008',
      detail: 'DECISION-CAP pin: decisions are bounded at 192 with oldest-first eviction',
    });

    // C2: accounting survives eviction (counters are cumulative).
    results.push({
      case: 'C2-accounting-survives-eviction', expect: 'after C0 eviction: executions=100 with 96 receipts + accounting.complete true',
      actual: `executions=${ledC.accounting?.executions} receipts=${receiptsC.length} complete=${ledC.accounting?.complete}`,
      pass: ledC.accounting?.executions === 100 && receiptsC.length === 96 && ledC.accounting?.complete === true,
      detail: 'ACCOUNTING pin: replacement/eviction cannot erase cumulative cost counters',
    });

    const d1: any = await executeTool('echo', { text: 'probe135-alive' }, attr);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output has probe text',
      actual: `ok=${d1?.ok} out=${JSON.stringify(d1?.output || '').slice(0, 60)}`,
      pass: d1?.ok === true && JSON.stringify(d1?.output || '').includes('probe135-alive'),
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
    const zMarkers = ['m135', 'fx135', 'probe135'];
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
      case: 'Z0-containment', expect: 'JOE_DATA_DIR in sbx + <sbx>/data shape exact + both live kb + mem hashes == pre + zero 135 markers',
      actual: `joeInSbx=${zJoeInSbx} sbxUsers=${zSbxUsers} sbxMemDir=${zSbxMemDir} liveKb==pre:${zLiveKbHash === zPreLive} wsKb==pre:${zWsKbHash === zPreWs} markers=${zMarkerHit} livemem==pre:${zLiveMemSha === zPreMem}`,
      pass: zJoeInSbx === true && zSbxUsers === 2 && zSbxMemDir === true && !!zPreLive && zLiveKbHash === zPreLive && !!zPreWs && zWsKbHash === zPreWs && zMarkerHit === false && !!zPreMem && zLiveMemSha === zPreMem,
      detail: 'CONTAINMENT pin: all workspace/data roots inside the sbx; <sbx>/data is the contained import-graph side effect (127-135 continuity); live stores byte-identical',
    });
  });

  const failed = results.filter((r) => !r.pass && !r.skipped);
  const skipped = results.filter((r) => r.skipped);
  console.log(JSON.stringify({ probe: 'muse-135-dispatch', results, failed: failed.length, skipped: skipped.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-135-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
