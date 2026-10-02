/**
 * MUSE wiring audit 121 — dispatch-reachability battery: file_edit FIRST live
 * executeTool proof + ls FIRST live proof + delete_file gate-verdict depth
 * (Level 4).
 *
 * file_edit is in the self-fix repair allowlist and is the core mutation tool
 * of autonomous engineering, yet no live dispatch proof existed for it (110
 * covered read_file/write_file only at negative depth). ls had no live proof
 * at all. delete_file was gate-pinned only (113, name-based high).
 *
 * Every expectation below was derived from source BEFORE the run:
 *
 * Path mechanics (verified by reading, pinned live here): executeTool routes
 * file_edit through ToolService containPath(fp, contextWorkspaceId)
 * (ToolService.ts:477-487), which calls resolveToolPath(p, {workspaceId})
 * CORRECTLY (:64-71) and rewrites the input to an ABSOLUTE path (deleting
 * `filename`, keeping `path`). The handler's own safePath passes the id as a
 * bare string (SystemTools.ts:608-611), which resolveToolPath ignores as an
 * options object — but executeTool wraps the handler in
 * runWithWorkspace(contextWorkspaceId) (:863-865), so the async context
 * carries the id and both layers resolve the SAME per-workspace root:
 * <EXTERNAL_PROJECTS_DIR>/<wsId> (WorkspaceService.ts:238-259, local JSON
 * mode). E9+L4 pin that the canonical path IS workspace-scoped despite the
 * string-as-options smell; the smell only bites direct handler callers
 * outside runWithWorkspace (robustness note, not a live defect).
 *
 * Containment fallback (utils.ts:101-106): a path inside ANY of
 * root/buildsDir/projectRoot/externalRoot is allowed. With CWD=sbx,
 * projectRoot=<sbx>, so a 2-level escape from the ws root still lands
 * INSIDE the sandbox (W7 pins the fallback live); deeper escapes leave
 * all four roots and are refused pre-dispatch (W8 via write_file, E7 via
 * file_edit).
 *
 * RUN-2 (disclosed; run-1 receipts preserved as .run1.*.log): run-1 went
 * 23/24 — W7 used a 3-level escape, which from <sbx>/projects/probe-ws-121
 * lands in tmp/ (OUTSIDE projectRoot) and is correctly refused. PROBE BUG
 * (depth arithmetic), not a product finding: the refusal itself behaved
 * exactly per the multi-root rule. W7 is fixed to 2 levels (allowed,
 * sbx-root landing) and W8 keeps the 3-level escape as a second refusal
 * pin. Run-2 uses a FRESH sandbox (sbx-tmp-121b) because E1 consumes its
 * find text; run-1's tree is preserved untouched.
 *
 *   Controls: P0 (bypass OFF + non-system + contained + CWD pin), D0
 *   (registered=163), D1 (echo positive), H4 (run_command re-pin).
 *
 *   Setup (write_file, medium -> handler reachable):
 *   W0 fe121-target.txt (LF, repeated beta line) -> ok=true, lands under
 *      <sbx>/projects/probe-ws-121, NOT under my-workspace.
 *   W1 fe121-crlf.txt (CRLF content) -> ok=true.
 *   W2 .hidden121 (dotfile) -> ok=true.
 *   W7 write_file '../../w7-fallback-121.txt' -> ok=true, lands in <sbx>
 *      ROOT (projectRoot fallback), not the ws root. Contained pin.
 *   W8 write_file '../../../w8-refused-121.txt' -> ok=false
 *      path_outside_workspace, outside path absent (refusal pin).
 *
 *   file_edit (medium -> handler reachable; input rewritten to abs path):
 *   E1 find 'beta121 line two' (matches lines 2 AND 3 as substring) ->
 *      ok=true, output.success=true; on-disk line 2 replaced, line 3
 *      intact (FIRST-OCCURRENCE pin: String.replace :773).
 *   E2 search/new_string aliases -> ok=true, on-disk verify.
 *   E3 missing find -> ok=false 'file_edit needs the text to find (`find`).'
 *   E4 missing filename -> ok=false 'file_edit needs a filename to edit.'
 *   E5 unknown text -> ok=false 'Text to replace not found in <abs>. Looked
 *      for: zzz-no-such-text-121. The file has 3 lines and none of them
 *      opens with that text.' (abs path in message; hint-branch pin).
 *   E6 LF 2-line find against the CRLF file -> ok=true, file keeps \r\n
 *      (normalization pin :746-751).
 *   E7 '../../../../e7-refused-121.txt' -> ok=false, error contains
 *      'path_outside_workspace' (ToolService pre-dispatch refusal); the
 *      outside path is NOT created.
 *   E8 filename '.' -> ok=false, error ends 'is a folder, not a file.'
 *   E9 ctxB (other workspace) edit of fe121-target.txt -> ok=false 'File
 *      not found' (SCOPING pin: per-ws roots).
 *
 *   ls (default medium -> handler reachable):
 *   L1 '.' -> ok=true, entries == [fe121-crlf.txt, fe121-target.txt]
 *      (sorted, hidden excluded).
 *   L2 includeHidden:true -> entries include '.hidden121'.
 *   L3 'no-such-dir-121' -> ok=false, error contains 'ENOENT'.
 *   L4 '.' ctxB -> ok=true, entries lack fe121 files (READ-SCOPING pin).
 *
 *   delete_file (name-based HIGH :196 -> approval gate, bypass OFF):
 *   X1 {path:'fe121-target.txt'} -> approval_required, file still on disk
 *      (GATE-PRECEDES-HANDLER pin).
 *   X2 {} -> approval_required (GATE-BEFORE-GUARD pin: handler's 'needs a
 *      path' never reached; second pin of the 117 order class).
 *   X3 rm_file alias -> approval_required + file still on disk
 *      (RESOLVED-NAME risk pin, cf. G1-115).
 *
 * Safety: same isolated tsx method as 110-120 — canonical test env
 * (setup.ts: JSON persistence, mock DB, network fetch guard), bypass OFF
 * (hermetic), full attribution, zero network, CWD = the sandbox dir itself
 * (tsx invoked by absolute path, all imports absolute), FS contained via
 * EXTERNAL_PROJECTS_DIR + JOE_TEST_TMP_ROOT scoped to tmp/sbx-tmp-121.
 * NO AUTO_APPROVE_* set at any point. No source is modified. W7's fallback
 * write and every fixture land inside the sandbox; E7's refusal is verified
 * by error text plus a read-only absence check of the outside path.
 *
 * Run from the SANDBOX dir:
 *   cd D:\Joe\muse-worktree\tmp\sbx-tmp-121
 *   set TEMP/TMP/TMPDIR/JOE_TEST_TMP_ROOT=<sbx> & set EXTERNAL_PROJECTS_DIR=<sbx>\projects
 *   D:\Joe\muse-worktree\api\node_modules\.bin\tsx.cmd D:\Joe\muse-worktree\tmp\team-consultation\muse-121-dispatch-probe.ts
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
    JOE_WORKSPACE_ROOT: process.env.JOE_WORKSPACE_ROOT,
    PERSISTENCE_MODE: process.env.PERSISTENCE_MODE,
    CWD: process.cwd(),
  };
  delete process.env.ENABLE_AUTH_BYPASS;
  delete process.env.AUTO_APPROVE_ALL;
  delete process.env.AUTO_APPROVE_SAFE;

  const sbxRoot = String(process.env.JOE_TEST_TMP_ROOT || '');
  const extRoot = String(process.env.EXTERNAL_PROJECTS_DIR || '');
  const wsA = path.join(extRoot, 'probe-ws-121');
  const wsB = path.join(extRoot, 'probe-ws-121b');
  const attr = { workspaceId: 'probe-ws-121', userId: 'probe-user-121' } as any;
  const ctxB = { workspaceId: 'probe-ws-121b', userId: 'probe-user-121b' } as any;

  await executionFirewall.runInContext('muse-121-probe', async () => {
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
      pass: regCount === 163, detail: 'Muse-lineage pin from 107-120',
    });

    const r1: any = await executeTool('echo', { text: 'probe-121' }, attr);
    const out1 = JSON.stringify(r1?.output ?? r1);
    results.push({
      case: 'D1-echo-positive', expect: 'ok=true output_contains_probe-121',
      actual: `ok=${r1?.ok} error=${r1?.error ?? 'none'} output_has_probe=${out1.includes('probe-121')}`,
      pass: r1?.ok === true && out1.includes('probe-121'),
      detail: `output=${out1.slice(0, 200)}`,
    });

    const rh: any = await executeTool('run_command', { action: 'list' }, attr);
    const eh = String(rh?.error || '');
    results.push({
      case: 'H4-run-command-repin', expect: "ok=false error='approval_required' (gate before handler guard)",
      actual: `ok=${rh?.ok} error=${eh.slice(0, 110)}`,
      pass: rh?.ok === false && eh === 'approval_required',
      detail: 'T5-117 divergent-shadow guard; hardcoded :429 -> shell_execute; empty-cmd HIGH -> gate; nothing executed',
    });

    // W0: seed the edit target under ws-A.
    const w0: any = await executeTool('write_file', {
      filename: 'fe121-target.txt',
      content: 'alpha121 line one\nbeta121 line two\nbeta121 line two again\n',
    }, attr);
    const w0disk = path.join(wsA, 'fe121-target.txt');
    const w0mw = path.join(extRoot, 'my-workspace', 'fe121-target.txt');
    const w0ok = w0?.ok === true && fs.existsSync(w0disk) && !fs.existsSync(w0mw);
    results.push({
      case: 'W0-seed-target', expect: 'ok=true AND disk_under_wsA AND absent_from_my-workspace',
      actual: `ok=${w0?.ok} err=${String(w0?.error || 'none').slice(0, 80)} wsA=${fs.existsSync(w0disk)} myws=${fs.existsSync(w0mw)}`,
      pass: w0ok,
      detail: 'write_file medium -> handler; per-ws root pin (WorkspaceService.ts:238-259 via runWithWorkspace async ctx)',
    });

    // W1: CRLF seed.
    const w1: any = await executeTool('write_file', {
      filename: 'fe121-crlf.txt',
      content: 'one121\r\ntwo121\r\nthree121\r\n',
    }, attr);
    const w1disk = path.join(wsA, 'fe121-crlf.txt');
    let w1raw = '';
    try { w1raw = fs.readFileSync(w1disk, 'utf-8'); } catch { w1raw = 'UNREADABLE'; }
    const w1ok = w1?.ok === true && w1raw === 'one121\r\ntwo121\r\nthree121';
    results.push({
      case: 'W1-seed-crlf', expect: "ok=true AND disk=='one121\\r\\ntwo121\\r\\nthree121' (trimmed, endings kept)",
      actual: `ok=${w1?.ok} disk=${JSON.stringify(w1raw).slice(0, 80)}`,
      pass: w1ok,
      detail: 'normalizeArtifactContent trims only; CRLF preserved for the E6 normalization pin',
    });

    // W2: hidden dotfile seed.
    const w2: any = await executeTool('write_file', { filename: '.hidden121', content: 'hidden-marker-121' }, attr);
    const w2ok = w2?.ok === true && fs.existsSync(path.join(wsA, '.hidden121'));
    results.push({
      case: 'W2-seed-hidden', expect: 'ok=true AND dotfile on disk under wsA',
      actual: `ok=${w2?.ok} disk=${fs.existsSync(path.join(wsA, '.hidden121'))}`,
      pass: w2ok,
      detail: 'seed for the L1/L2 hidden-visibility pins',
    });

    // W7: projectRoot-fallback escape — allowed by the multi-root rule, but contained in sbx.
    // (run-2 fix: 2 levels from <sbx>/projects/probe-ws-121 land in <sbx>; run-1's 3 levels overshot.)
    const w7: any = await executeTool('write_file', {
      filename: '../../w7-fallback-121.txt',
      content: 'w7-fallback-marker-121',
    }, attr);
    const w7sbx = path.join(sbxRoot, 'w7-fallback-121.txt');
    const w7ws = path.join(wsA, 'w7-fallback-121.txt');
    const w7ok = w7?.ok === true && fs.existsSync(w7sbx) && !fs.existsSync(w7ws);
    results.push({
      case: 'W7-fallback-lands-in-sbx-root', expect: 'ok=true AND disk_in_sbx_root AND absent_from_wsA',
      actual: `ok=${w7?.ok} err=${String(w7?.error || 'none').slice(0, 80)} sbxroot=${fs.existsSync(w7sbx)} wsA=${fs.existsSync(w7ws)}`,
      pass: w7ok,
      detail: 'FALLBACK pin: resolveToolPath utils.ts:101-106 allows projectRoot(<sbx> when CWD=sbx); write escapes the ws root but stays in the sandbox',
    });

    // W8: 3-level escape leaves every root -> refused pre-write (run-1 W7 shape, kept as a refusal pin).
    const w8: any = await executeTool('write_file', {
      filename: '../../../w8-refused-121.txt',
      content: 'w8-must-never-land-121',
    }, attr);
    const w8err = String(w8?.error || '');
    const w8outside = path.resolve(wsA, '../../../w8-refused-121.txt');
    const w8ok = w8?.ok === false && w8err.includes('path_outside_workspace') && !fs.existsSync(w8outside);
    results.push({
      case: 'W8-deep-escape-refused', expect: 'ok=false path_outside_workspace AND outside path absent',
      actual: `ok=${w8?.ok} err=${w8err.slice(0, 120)} outside=${w8outside} absent=${!fs.existsSync(w8outside)}`,
      pass: w8ok,
      detail: 'REFUSAL pin (write path): handler safePath rejects before mkdir/write; read-only absence check proves nothing landed in tmp/',
    });

    if (!w0ok) {
      for (const c of ['E1-edit-happy-first-occurrence', 'E2-edit-alias-fields', 'E5-edit-text-not-found', 'E9-edit-cross-workspace-miss', 'L1-ls-sorted-no-hidden', 'X1-delete-gate-file-intact', 'X3-delete-alias-gate']) {
        results.push({ case: c, expect: 'SKIPPED (W0 seed not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
      }
    } else {
      // E1: happy path + first-occurrence pin.
      const e1: any = await executeTool('file_edit', {
        filename: 'fe121-target.txt', find: 'beta121 line two', replace: 'BETA121 EDITED',
      }, attr);
      let e1disk = 'UNREADABLE';
      try { e1disk = fs.readFileSync(w0disk, 'utf-8'); } catch { /* keep */ }
      const e1ok = e1?.ok === true && (e1 as any)?.output?.success === true
        && e1disk === 'alpha121 line one\nBETA121 EDITED\nbeta121 line two again';
      results.push({
        case: 'E1-edit-happy-first-occurrence', expect: 'ok=true success=true AND line2 replaced AND line3 intact',
        actual: `ok=${e1?.ok} success=${(e1 as any)?.output?.success} disk=${JSON.stringify(e1disk).slice(0, 100)}`,
        pass: e1ok,
        detail: 'HAPPY-PATH + FIRST-OCCURRENCE pin: String.replace :773 replaces the line-2 match only; ToolService pre-rewrote input to the abs path',
      });

      // E2: search/new_string aliases.
      const e2: any = await executeTool('file_edit', {
        filename: 'fe121-target.txt', search: 'BETA121 EDITED', new_string: 'BETA121 ALIASED',
      }, attr);
      let e2disk = 'UNREADABLE';
      try { e2disk = fs.readFileSync(w0disk, 'utf-8'); } catch { /* keep */ }
      const e2ok = e1ok && e2?.ok === true && e2disk.includes('BETA121 ALIASED') && !e2disk.includes('BETA121 EDITED');
      results.push({
        case: 'E2-edit-alias-fields', expect: 'ok=true AND disk has ALIASED AND lacks EDITED (gated on E1)',
        actual: `ok=${e2?.ok} has_aliased=${e2disk.includes('BETA121 ALIASED')} lacks_edited=${!e2disk.includes('BETA121 EDITED')}`,
        pass: e2ok,
        detail: 'ALIAS pin: SystemTools.ts:701 accepts search/old_string + new_string',
      });

      // E5: unknown text -> honest miss with the line-count hint branch.
      const e5: any = await executeTool('file_edit', {
        filename: 'fe121-target.txt', find: 'zzz-no-such-text-121', replace: 'never-lands-121',
      }, attr);
      const e5err = String(e5?.error || '');
      const e5ok = e1ok && e5?.ok === false
        && e5err.includes('Text to replace not found in')
        && e5err.includes('fe121-target.txt')
        && e5err.includes('Looked for: zzz-no-such-text-121.')
        && e5err.includes('The file has 3 lines and none of them opens with that text.');
      results.push({
        case: 'E5-edit-text-not-found', expect: 'ok=false + abs-path miss message + Looked-for + 3-line hint (gated on E1)',
        actual: `ok=${e5?.ok} err=${e5err.slice(0, 200)}`,
        pass: e5ok,
        detail: 'HONEST-MISS pin: :771 names the (abs) file, the wanted text and the no-match hint; nothing written',
      });

      // E9: cross-workspace edit must MISS (per-ws roots).
      const e9: any = await executeTool('file_edit', {
        filename: 'fe121-target.txt', find: 'alpha121', replace: 'XRAY121',
      }, ctxB);
      const e9ok = e9?.ok === false && String(e9?.error || '') === 'File not found';
      results.push({
        case: 'E9-edit-cross-workspace-miss', expect: "ok=false error='File not found' under ctxB",
        actual: `ok=${e9?.ok} err=${String(e9?.error || '').slice(0, 80)}`,
        pass: e9ok,
        detail: 'SCOPING pin: ctxB resolves externalRoot/probe-ws-121b where the file was never seeded — canonical path IS ws-scoped via async ctx despite the string-as-options call',
      });

      // L1: sorted listing, hidden excluded.
      const l1: any = await executeTool('ls', { path: '.' }, attr);
      const l1e = Array.isArray((l1 as any)?.output?.entries) ? ((l1 as any).output.entries as any[]).map(String) : [];
      const l1ok = w2ok && l1?.ok === true && l1e.length === 2
        && l1e[0] === 'fe121-crlf.txt' && l1e[1] === 'fe121-target.txt';
      results.push({
        case: 'L1-ls-sorted-no-hidden', expect: "ok=true entries==[fe121-crlf.txt, fe121-target.txt] (gated on W2)",
        actual: `ok=${l1?.ok} entries=${JSON.stringify(l1e).slice(0, 120)}`,
        pass: l1ok,
        detail: 'LIST pin: readdirSync + dotfile filter + localeCompare sort :1010-1013',
      });

      // X1: delete gate fires, file untouched.
      const x1: any = await executeTool('delete_file', { path: 'fe121-target.txt' }, attr);
      const x1disk = fs.existsSync(w0disk);
      const x1ok = x1?.ok === false && String(x1?.error || '') === 'approval_required' && x1disk === true;
      results.push({
        case: 'X1-delete-gate-file-intact', expect: "approval_required AND file still on disk",
        actual: `ok=${x1?.ok} err=${String(x1?.error || '').slice(0, 60)} disk=${x1disk}`,
        pass: x1ok,
        detail: 'GATE-PRECEDES-HANDLER pin: name-based high (:196) refuses before the unlink path; hermetic proof nothing was deleted',
      });

      // X3: rm_file alias resolves to the same high gate.
      const x3: any = await executeTool('rm_file', { path: 'fe121-target.txt' }, attr);
      const x3ok = x3?.ok === false && String(x3?.error || '') === 'approval_required' && fs.existsSync(w0disk) === true;
      results.push({
        case: 'X3-delete-alias-gate', expect: "rm_file -> approval_required AND file still on disk",
        actual: `ok=${x3?.ok} err=${String(x3?.error || '').slice(0, 60)} disk=${fs.existsSync(w0disk)}`,
        pass: x3ok,
        detail: 'RESOLVED-NAME-RISK pin: TOOL_ALIASES rm_file->delete_file carries high (cf. G1-115)',
      });
    }

    // E3: missing find guard (no fixture needed).
    const e3: any = await executeTool('file_edit', { filename: 'fe121-target.txt', replace: 'x' }, attr);
    results.push({
      case: 'E3-edit-missing-find', expect: "ok=false error='file_edit needs the text to find (`find`).'",
      actual: `ok=${e3?.ok} err=${String(e3?.error || '').slice(0, 90)}`,
      pass: e3?.ok === false && String(e3?.error || '') === 'file_edit needs the text to find (`find`).',
      detail: 'GUARD pin :707 — the silent-prepend corruption class stays closed on the canonical path',
    });

    // E4: missing filename guard.
    const e4: any = await executeTool('file_edit', { find: 'a', replace: 'b' }, attr);
    results.push({
      case: 'E4-edit-missing-filename', expect: "ok=false error='file_edit needs a filename to edit.'",
      actual: `ok=${e4?.ok} err=${String(e4?.error || '').slice(0, 90)}`,
      pass: e4?.ok === false && String(e4?.error || '') === 'file_edit needs a filename to edit.',
      detail: 'GUARD pin :706 — EISDIR-on-root class stays closed (no fp -> no containPath rewrite -> handler guard)',
    });

    // E6: CRLF normalization (chained on W1).
    if (!w1ok) {
      results.push({ case: 'E6-edit-crlf-keeps-endings', expect: 'SKIPPED (W1 seed not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
    } else {
      const e6: any = await executeTool('file_edit', {
        filename: 'fe121-crlf.txt', find: 'two121\nthree121', replace: 'TWO121\nTHREE121',
      }, attr);
      let e6disk = 'UNREADABLE';
      try { e6disk = fs.readFileSync(w1disk, 'utf-8'); } catch { /* keep */ }
      const e6ok = e6?.ok === true && e6disk === 'one121\r\nTWO121\r\nTHREE121';
      results.push({
        case: 'E6-edit-crlf-keeps-endings', expect: "ok=true AND disk=='one121\\r\\nTWO121\\r\\nTHREE121'",
        actual: `ok=${e6?.ok} err=${String(e6?.error || 'none').slice(0, 80)} disk=${JSON.stringify(e6disk).slice(0, 80)}`,
        pass: e6ok,
        detail: 'NORMALIZATION pin: toFile :749 converts the LF find to the dominant CRLF; the file keeps its endings',
      });
    }

    // E7: deep escape refused pre-dispatch; outside path never created.
    const e7: any = await executeTool('file_edit', {
      filename: '../../../../../e7-refused-121.txt', find: 'a', replace: 'b',
    }, attr);
    const e7err = String(e7?.error || '');
    const e7outside = path.resolve(wsA, '../../../../../e7-refused-121.txt');
    const e7ok = e7?.ok === false && e7err.includes('path_outside_workspace') && !fs.existsSync(e7outside);
    results.push({
      case: 'E7-edit-deep-escape-refused', expect: "ok=false path_outside_workspace AND outside path absent",
      actual: `ok=${e7?.ok} err=${e7err.slice(0, 120)} outside=${e7outside} absent=${!fs.existsSync(e7outside)}`,
      pass: e7ok,
      detail: 'REFUSAL pin: ToolService containPath rejects before the gate/handler; read-only absence check proves nothing landed outside (contrast W7 fallback)',
    });

    // E8: directory as filename.
    const e8: any = await executeTool('file_edit', { filename: '.', find: 'x', replace: 'y' }, attr);
    const e8err = String(e8?.error || '');
    const e8ok = e8?.ok === false && e8err.endsWith('is a folder, not a file.') && e8err.includes('probe-ws-121');
    results.push({
      case: 'E8-edit-directory-refused', expect: "ok=false error='<wsA-abs> is a folder, not a file.'",
      actual: `ok=${e8?.ok} err=${e8err.slice(0, 160)}`,
      pass: e8ok,
      detail: 'DIRECTORY pin :716-718; the abs path in the message also re-pins the ToolService pre-rewrite',
    });

    // L2: hidden visibility (chained on W2).
    if (!w2ok) {
      results.push({ case: 'L2-ls-hidden-visible-on-request', expect: 'SKIPPED (W2 seed not ok)', actual: 'skipped', pass: true, detail: 'conditional chain: not a failure, disclosed skip' });
    } else {
      const l2: any = await executeTool('ls', { path: '.', includeHidden: true }, attr);
      const l2e = Array.isArray((l2 as any)?.output?.entries) ? ((l2 as any).output.entries as any[]).map(String) : [];
      results.push({
        case: 'L2-ls-hidden-visible-on-request', expect: 'ok=true entries include .hidden121',
        actual: `ok=${l2?.ok} has_hidden=${l2e.includes('.hidden121')} n=${l2e.length}`,
        pass: l2?.ok === true && l2e.includes('.hidden121'),
        detail: 'HIDDEN pin: includeHidden flips the :1011 dotfile filter',
      });
    }

    // L3: missing dir -> raw ENOENT surfaces.
    const l3: any = await executeTool('ls', { path: 'no-such-dir-121' }, attr);
    const l3err = String(l3?.error || '');
    results.push({
      case: 'L3-ls-missing-dir', expect: 'ok=false error contains ENOENT',
      actual: `ok=${l3?.ok} err=${l3err.slice(0, 120)}`,
      pass: l3?.ok === false && l3err.includes('ENOENT'),
      detail: 'MISS pin: readdirSync throw surfaces as e.message :1016-1018 (raw-errno class, cf. K2-119 readHistory)',
    });

    // L4: read scoping under ctxB.
    const l4: any = await executeTool('ls', { path: '.' }, ctxB);
    const l4e = Array.isArray((l4 as any)?.output?.entries) ? ((l4 as any).output.entries as any[]).map(String) : [];
    const l4ok = l4?.ok === true && !l4e.some((e) => e.includes('fe121')) && fs.existsSync(wsB);
    results.push({
      case: 'L4-ls-cross-workspace-empty', expect: 'ok=true AND no fe121 entries AND wsB dir exists',
      actual: `ok=${l4?.ok} entries=${JSON.stringify(l4e).slice(0, 120)} wsB=${fs.existsSync(wsB)}`,
      pass: l4ok,
      detail: 'READ-SCOPING pin: ctxB lists its own (empty) root; wsB auto-created by getActiveRoot :251-252',
    });

    // X2: gate fires before the handler missing-path guard.
    const x2: any = await executeTool('delete_file', {}, attr);
    results.push({
      case: 'X2-delete-gate-before-guard', expect: "ok=false error='approval_required' (not 'needs a path')",
      actual: `ok=${x2?.ok} err=${String(x2?.error || '').slice(0, 90)}`,
      pass: x2?.ok === false && String(x2?.error || '') === 'approval_required',
      detail: 'GATE-BEFORE-GUARD pin: :772 approval precedes the :831 handler guard — second pin of the T5-117 order class',
    });
  });

  const failed = results.filter((r) => !r.pass);
  console.log(JSON.stringify({ probe: 'muse-121-dispatch', results, failed: failed.length }, null, 2));
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.log(JSON.stringify({ probe: 'muse-121-dispatch', fatal: String((e as any)?.stack || e) }));
  process.exitCode = 2;
});
