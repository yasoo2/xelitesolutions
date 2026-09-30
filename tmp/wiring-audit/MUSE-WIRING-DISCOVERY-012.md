# MUSE Wiring Discovery 012 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 12)
HEAD=6aa6b8c4 + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=verification-compat sweep (LEVEL 5) on the two storied trunks
(files 10 + browser_ui 33): Part 0 static = isVerificationTool partition
over all 43 names + verificationResultFromToolResult over a 21-shape
source-grounded table (verify_sweep12.mts, exit 0, 21/21 match); Part 1
live = 6 legs through REAL PhaseExecutorTool dispatched canonically
(ToolService.executeTool('phase_executor') inside firewall runInContext;
registry entry, 163 verified) with a probe-owned workspace
(EXTERNAL_PROJECTS_DIR + setActiveRoot contained; checkpoints/roots
inside FX) + one loopback fixture page for the browser leg. Full sweep
ran 2x with identical verdicts (run 2 + run 3, fresh fixtures).
EVIDENCE=tmp/wiring-audit/verify_sweep12.json + .mts + verify12.log
(this worktree) + verify12b.mts fragment (V3 status-control) + .log
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-011.md (browser_ui 33/33 LEVEL-4)

## Consumer contract (read-before-call)

Two consumption points, both in PhaseExecutorTool.ts:

- Task level (:1557-1650): isVerificationTool(toolName, args,
  explicitlyMarked) -> selectVerification -> executeTool ->
  verificationResultFromToolResult -> recordVerification. Non-checker
  tasks skip selection entirely; their phase contribution is the ok-gate.
- Phase gate (:2302-2449): verificationTask checker must pass
  isVerificationTool with existence+live-run opt-ins; rejected
  pre-execution otherwise. Phase verified only if vResult.ok AND
  outcome==='passed'.
- ToolService wraps every result as {ok, output, logs, artifacts,
  error} with output = res.output (ToolService.ts:878-879, :963), so
  the verifier sees the tool's `output` object only.
- Auto-build (:2481-2494) never fires here (no package.json written).

## New findings (all Muse-branch @ 6aa6b8c4)

### F67. read_file existence gates always take the nonce-fingerprint path (NEW CONTRACT_MISMATCH #10 + WIRING-P2-018)

Phase-gate scopeRoot = verificationArgs.cwd || projectPath || path ||
workspaceRoot (PhaseExecutorTool.ts:2372-2378). For read_file
{path:'proof.txt'} the scopeRoot is the relative FILE path, which
path.resolve()s against process.cwd() — the API server dir, outside
the workspace. fingerprintVerification then takes the uncontained
branch (verification-ledger.ts:451-480): fingerprint =
hash(..., nonce: Date.now()), cacheable:false.

Proven live (V1/V6, same checkId, same args, same files, same env,
carried ledger):

- V1 receipt: scopeRoot=`...\api\proof.txt`, decisionReason=
  'selected: trusted workspace containment is unavailable, so reuse
  and filesystem fingerprinting are disabled', fp 89c4e353...
- V6 receipt: decision 'invalidated', fp 50d47d6a... (different —
  nonce). Reuse structurally impossible for this checker shape.
- V2 (negative): same nonce path, scopeRoot `...\api\absent.txt`,
  honest failed receipt + phase partial.

Consequences: (a) resume/reuse is dead for file-existence gates —
every resume re-executes; (b) receipt scopeRoot points at the API
server dir, misleading provenance; (c) no filesystem bytes are
fingerprinted, so the passing receipt does not bind the observed
file content (weaker than the ledger's design intent). Fail-safe
direction (never wrongly reuses). The same path-preference exists
at task level (:1570-1578: toolArgs.path preferred over workspace
root) — any task-level check with a relative path arg hits it too.

### F68. Checker-allowlist partition over all 43 storied tools (static, complete)

isVerificationTool(name, {}, false,false,false): exactly 7/33
browser tools are task-level checkers — browser_console_scan,
browser_ui_audit, browser_contrast_audit, browser_check_links,
browser_performance, browser_run, browser_responsive_check.
read_file is a checker ONLY via the phase-gate existence opt-in
(isVerificationTool('read_file',{path},false,true,false)=true,
taskLevel=false). The other 35 storied tools can never produce
ledger receipts. V5 proves the boundary live: file_edit task ->
phase completed, receipts 0, decisions 0. The ledger is a
checker-only record, not a task-execution record.

### F69. Verdict mapping is ok/error-only for all 43 storied tools

Grep-verified across all 13 definition files: no storied tool
emits output.status / output.verificationFailed / output.cancelled
/ output.timedOut (ScreenshotTool's status:'success'/'error' hits
are UI broadcast payloads, not tool output). So
verificationResultFromToolResult reduces to ok ? passed :
classify(error-text). 21-shape table 21/21 match, including all
previously-evidenced hollow shapes mapping in the SAFE direction
for execution-truth: absence-as-success x6 -> passed (check ran),
extract-swallow -> passed, empty search answer -> passed,
mislabeled dep-audit error -> failed, trio offline-with-output ->
failed (partials dropped by consumer), injected-forbidden ->
failed. Passed means "the check executed", NEVER "the requested
behavior was observed" — the verdict is content-blind. Arabic
timeout prose -> failed, not timed_out (classifier is
English-only; evidence-shape note). verificationFailed-without-
error maps to incomplete (control; no storied tool emits it).

### F70. Evidence-pointer split across the 8 storied checker shapes

verificationMetricsFrom reads output.evidenceLocation/reportPath/
url. Static + live:

- 6 (a)-checkers emit output.url (console :422, seo :375,
  contrast :575, a11y :637, ui_audit :1044, links :270, perf :323,
  responsive :1297 — all verified) -> evidenceLocation=url. V4
  proves live: console receipt evidenceLocation=runtimeTarget=
  loopback URL.
- browser_run emits pageUrl only (BrowserRunTool.ts:426-438) ->
  evidenceLocation='' (extends MISMATCH #8: receipts point nowhere).
- read_file gate emits no url -> evidenceLocation='' (live V1/V2).

### F71. Browser checks never reuse by design (live V4)

runtimeRevision is '' outside a pipeline (no projectContext
revision) -> browserStateNeedsRevision -> 'selected: browser
verification has no trusted target revision...' -> always run,
cacheable:false. V4 receipt proves it. Safe direction; documents
why browser receipts never show 'reused'.

### F72. Direct PhaseExecutor invocation is firewall-rejected (method)

Run 1 of this probe called ex.execute() outside a firewall
context: every nested tool was blocked ('Execution bypass
detected', fail-closed) and the blocked browser leg STILL got an
honest failed receipt. LEVEL-5 MUST dispatch phase_executor
through ToolService inside runInContext (run 2+ method). Also
documents: bypass attempts produce failed receipts, never
silence. (Run-1 detailed log overwritten by run 2 by design —
single log path; behavior re-producible by direct invocation.)

### F73. Gate rejection is pre-execution and browser-clean (live V3)

verificationTask browser_click -> results[1].error =
'verification_unavailable: unsupported verification tool
contract', phase ok:false status partial (V3 status-control
fragment verify12b confirms 'partial'), liveBrowserSessionCount
0 after. No browser launched for a rejected checker.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=2/19 fully storied + verification-swept (files 10/10 +
browser_ui 33/33; per-tool VERIFICATION_COMPATIBLE in matrix §VERIFY12)
VERIFY_SWEEP12=static 21/21 verdict match + 43/43 allowlist partition;
live 6/6 legs canonical (V1 completed/passed-receipt, V2
partial/failed-receipt, V3 partial/honest-rejection/0 sessions, V4
completed/browser-receipt+url, V5 completed/0-receipts, V6
completed/invalidated-nonce); full sweep 2x verdict-identical
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=10 confirmed (new #10: gate/task scopeRoot
prefers the checker's relative path arg over the workspace root ->
uncontained nonce fingerprint; reuse dead for read_file gates)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-018 (gate/task scopeRoot must resolve the checker's
  path arg inside the trusted workspace root, or fall back to the
  workspace root; receipt scopeRoot must never point at process.cwd()).
- EXTENDED WIRING-P2-012 (browser_run evidenceLocation: emit `url`
  alongside pageUrl so receipts point at the checked page).
- P2-004 verifier note now evidenced: verdicts are content-blind
  (F69) — verifiers/consumers must read message/flags, not ok alone;
  6 absence-instances + extract-swallow + empty-answer enumerated.
- LIFTED nothing; no new embargoes.

## Corrections to prior checkpoints

- 011 §Limits "Verification-compat sweep still pending (LEVEL 5-6)":
  LEVEL-5 now done for both storied trunks. LEVEL-6 (Real Joe UI)
  remains pending by design (no UI runs in this checkpoint).
- 008/P2-004 "absence-as-success verifier note for LEVEL 5-6 sweep":
  delivered — F69 + matrix §VERIFY12.
- Probe-bug correction (mine, not product): sweep run 2 recorded
  V3 status null via a stale nested reader (v3.output.status on a
  flattened object); the V3-control fragment + fixed run 3 prove
  the product returns status 'partial'. Fixed in verify_sweep12.mts.

## Limits / UNKNOWNs

- 17/19 trunks still unstories; their tools' verification-compat
  (esp. testing_qa checkers quality_run/auto_tester/code_reviewer,
  shell_execute test-command shapes) unsurveyed.
- Model-present checker behavior unprobed (no provider in sandbox).
- page_fix/ui_fix bodies still deliberately unprobed (010/011).
- user_browser helper-present path unprobed.
- fingerprint coverage: only the read_file-gate nonce path + browser
  no-revision path proven; shell_execute checker fingerprinting
  (cwd shapes) not exercised.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-verify12run' (any writable dir)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:EXTERNAL_PROJECTS_DIR='<worktree>\tmp\wiring-audit\fx-verify12\ext'
  (exact: the probe asserts it; recreated automatically)
  For V4 only: BROWSER_HEADLESS='true'; USE_USER_BROWSER_PROFILE='0';
  USE_SYSTEM_CHROME='0'; BROWSER_PERSISTENT_PROFILE='0'
  $env:BROWSER_EXECUTABLE_PATH='<installed Chrome/Chromium>'
  (omit only if Playwright bundled chromium is installed; without it
  V4 records skipped, everything else still runs)
  $env:ARTIFACT_DIR="$fx\artifacts"; $env:BROWSER_SESSION_DIR="$fx\sessions";
  $env:BROWSER_CONSENT_DIR="$fx\consent"; $env:BROWSER_PROFILE_DIR="$fx\profiles";
  $env:BROWSER_PROFILE_CLONE_DIR="$fx\clones"
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\verify_sweep12.mts
Expected: exit 0; VERIFY12_DONE static_mismatch=0 v1=completed
v2=partial v3unavail=true v5receipts=0 v6reused=false v4=completed;
JSON verdicts per F67-F73 (V1 fp-head differs every run by nonce —
that IS the finding; V6 decision always invalidated).
Probe fixtures live under tmp\wiring-audit\fx-verify12* (untracked);
delete after. NOTE: redirect to file (pipe flake); system TEMP may
be sandbox-denied.
