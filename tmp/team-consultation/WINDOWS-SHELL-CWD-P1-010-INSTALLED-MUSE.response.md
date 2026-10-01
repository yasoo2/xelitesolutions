# MUSE independent review — WINDOWS-SHELL-CWD-P1-010-INSTALLED-MUSE

AGENT=MUSE
CONSULTATION_ID=WINDOWS-SHELL-CWD-P1-010-INSTALLED-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (exact-diff verified; 4 bounded conditions, no rework of the approach)
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=d38ed615 (muse/joe-development; tracked clean; untracked tmp evidence preserved)
CANDIDATE=C:\Users\home\.codex\worktrees\windows-shell-cwd\xelitesolutions (branch codex/windows-shell-cwd, HEAD=fdad5955=decision base; the 7 files are uncommitted working-tree changes, verified read-only, nothing modified)
MANIFEST=D:\Joe\coordination\team\verification\windows-shell-cwd-20261001\installed-source-manifest.json
DATE=2026-10-01
SHARED_FILE_WRITE=DENIED (sandbox: absolute path outside workspace). This workspace response file is the authoritative Muse position for verified import. Do not mark the shared consultation REVIEWED_BY_MUSE except by importing this file verbatim.

## 1. What was reviewed (exact diff, not claims)

5 modified + 2 new files, 70 insertions / 11 deletions across the 5 tracked files:

- api/src/modules/tools/path-containment.ts — new pure `canonicalizeWindowsPath`
  (extended `\\?\` drive/UNC normalization, `\\.\` device + malformed rejection),
  both-side canonicalization inside `isWithinRoot` with fail-closed null handling.
- api/src/kernel/ExecutionEngine.ts — new `shellWorkingDirectory` preflight
  (namespace/UNC/long-path/missing-dir explicit errors) applied at BOTH shell
  spawn sites (gateway streaming path + `runCommandInternal`); actual `cwd`
  receipt added to all three `runCommandInternal` outcomes.
- api/src/modules/tools/handlers.ts — `HandlerResult` gains `cwd`/`exitCode`,
  passed through from gateway data.
- api/src/modules/tools/definitions/SystemTools.ts — `shell_execute` local
  receipt reports real `r.exitCode ?? (r.ok?0:1)` and real `r.cwd` instead of
  synthesized 0/1 and requested workDir.
- api/src/modules/tools/definitions/ProjectRunTool.ts — exactly 1 import +
  1 serialized canonicalizer declaration (matches the decision scope).
- 2 new test files (untracked): windows-shell-cwd.test.ts (24 tests),
  windows-preview-serialization.test.ts (2 tests).

Manifest check (independent): 7/7 SHA256 MATCH at review time.

## 2. Independent verification performed by MUSE (this cycle)

V1. Manifest hashes: 7/7 MATCH (powershell Get-FileHash, read-only).
V2. Full rerun of both suites against the candidate, jest cache + JOE_TEST_TMP_ROOT
    redirected into Muse workspace (sandbox cannot write candidate tree or
    system temp): first pass 25/26, the single failure an environmental EPERM
    writing the candidate's api/logs file (winston DailyRotateFile, relative
    path, sandbox UID) — NOT an assertion failure.
V3. Scoped rerun of the blocked test from a writable cwd: 1/1 PASS.
    Independent total: 26/26 PASS (24 shell-cwd + 2 serialization).
V4. RED-validity probe of the old 3-line helper (node one-liner, no source
    touched): old `isWithinRoot('D:\workspace\child','\\?\D:\workspace')`
    = false (new test expects true); old device same-root = true (new test
    expects false). Both directions are genuine RED→GREEN, not tautologies.
V5. Spawn-site audit (ExecutionEngine.ts): shell:true sites are L664 (gateway)
    and L1024 (runCommandInternal) — both preflighted. Remaining spawn sites
    are shell:false by design (L843 detached updater, L960 runArgvInternal)
    where extended spellings are legal for direct CreateProcess. PTY
    createSession (L451) passes raw cwd — confirmed as the acknowledged,
    still-open exclusion (see C2).
V6. exitCode-consumer audit: PhaseExecutorTool.ts and AutoTesterTool.ts in the
    candidate contain ZERO `.exitCode` references, so the honest-receipt
    change (exitCode may now be null, cwd may now be undefined on
    never-spawned runs) has no consumer in the phase-verification path.
    Broader `.exitCode` consumers exist only in routes/quality/diagnostic
    modules (packages.ts, project.ts, log-doctor, terminal-audit, etc.),
    none on the shell_execute receipt path. No regression vector found, but
    C3 records the contract delta.
V7. Overlap check: Muse branch path-containment.ts is byte-identical to the
    pre-patch base (no canonicalizer) — no competing Muse implementation,
    no merge conflict on this file. CLI remains NVIDIA-owned; untouched.

## 3. Root cause assessment (agree)

The RED case (extended-spelling workspace root silently executing in the wrong
cwd; exit 7 misreported as 1) is real and correctly diagnosed: (a) containment
compared unresolved spellings so `\\?\`-rooted paths never matched; (b) the
shell preflight did not exist so cmd.exe received spellings it cannot honor;
(c) receipts synthesized exit/cwd instead of reporting them. The fix addresses
all three at the correct layer (one shared canonicalizer, preflight before
spawn, passthrough receipts).

## 4. Proposal errors / defects found

D1 (minor, real). Inconsistent preflight-failure shape between the two
    covered paths: gateway path returns exitCode:null ("never spawned",
    truthful), runCommandInternal returns exitCode:1 (implies a process
    exited 1). Same failure class, different evidence. Recommend null in
    both (condition C1).
D2 (minor, real). `shell_cwd_not_directory` conflates missing path,
    not-a-directory, and permission/stat failures (single catch). The
    "distinct missing-dir error" claim holds only against the other three
    error classes, not within stat failures. Recommend keeping the code but
    documenting the conflation, or splitting EPERM/EACCES (condition C1).
D3 (observation, not a defect). Forward-slash namespace spellings
    (`//?/D:/x`, `//./x`) bypass the canonicalizer and fall through to
    path.resolve. Traced: resolve normalizes them, so containment still
    holds on resolved meaning; no bypass found. Suggest one explicit test
    row locking this behavior (condition C4).
D4 (no defect found). Rejected-run receipts now carry cwd=undefined /
    exitCode=null. Verified honest (nothing executed) and consumer-safe
    per V6. Must be recorded as an intentional contract delta (C3), not
    silently relied upon.

No argv/quoting redesign found (as scoped). No planner/registry/provider/
workspace-root changes found. Serialization test genuinely executes the
actual generated handler from BOTH TS source and shipped dist/index.js
(AST-extracted, VM-run, 403 on traversal in both shapes) — not a
compilation-only check. dist/index.js contains the canonicalizer
(build 11:05Z, before consultation creation 11:19Z).

## 5. Simpler alternatives considered (none better)

- Canonicalizing only at the ToolService layer instead of ExecutionEngine:
  rejected — gateway/direct/PTY paths would diverge; engine-level preflight
  covers every shell spawn with one function.
- Coercing extended→plain inside isWithinRoot only, without spawn preflight:
  rejected — containment would pass but cmd.exe would still misbehave; the
  preflight is the actual behavioral fix.
- Allowing UNC/long cwd and letting cmd fail naturally: rejected — silent
  wrong-cwd execution was the original defect; explicit rejection is correct.

## 6. Overlap / conflict / regression risks

- Overlap: none with Muse work (V7); none with NVIDIA CLI ownership
  (no intent/routing/planner files touched). Complements (does not duplicate)
  the separate REPO-COMMAND-SHELL-BOUNDARY work (that is about shell:true
  command parsing; this is about cwd spelling).
- Conflict risk on integration: LOW. 5 small files; Muse tree matches base on
  path-containment.ts; handlers/SystemTools/ProjectRunTool hunks are additive.
- Regression risk: LOW for shell_execute consumers (receipts strictly more
  truthful; V6 finds no exitCode-keyed branching on this path). MEDIUM only
  for hypothetical external consumers parsing `exit=N` log lines or
  assuming numeric exitCode — none found in-tree.
- The node_modules of the candidate is a junction to
  D:\Joe\worktrees\codex-n... (outside the candidate). Test evidence is
  valid but dependency-pinned reproducibility of the candidate worktree
  alone is weaker than a self-contained tree. Noted, not blocking.

## 7. Maintainability / security impact

- Maintainability: positive. One pure canonicalizer replaces a class of
  spelling bugs; comment quality high; tests are behavioral (real spawns,
  real ToolService dispatch) with explicit non-goals (no browser UAT claim).
- Security: positive. Device-namespace paths can no longer satisfy
  containment by self-equality; malformed extended paths fail closed on
  BOTH sides; unsupported cwd never spawns (spawn-not-called asserted).
  No new trust boundary introduced; firewall/permission layers untouched.

## 8. Required tests (conditions for integration)

C1. Unify preflight-failure evidence: exitCode null (never spawned) in
    runCommandInternal to match the gateway path; document or split the
    stat-failure conflation in shell_cwd_not_directory. (D1, D2)
C2. PTY probe follow-up stays mandatory and separate: PowerShell-through-conpty
    with extended/UNC/long cwd is still unproven (createSession L451 raw cwd).
    Not a blocker for THIS slice (shell_execute path is complete), but the
    integration record must carry it as an explicit open item with owner.
C3. Record the receipt contract delta (exitCode: number|null,
    cwd: string|undefined on never-spawned runs) in the integration note;
    no code change needed after V6.
C4. Add one locked test row for forward-slash namespace spelling
    (`//?/D:/...`) documenting resolve-normalized containment (D3).
GATES. tsc + build + the 26 + applicable AGENTS permanent gates at the
  integration base (candidate-reported 113/113 regression and 10 gates were
  NOT independently rerun by Muse this cycle; trusted as owner evidence,
  must be re-observed at integration).

## 9. Real Joe UAT

Not required for ACCEPT of this slice (narrow, engine-level, behaviorally
tested with real child processes through the real ToolService dispatch),
but REQUIRED before main promotion per the consultation itself: real :5002
(or :5101) UI run exercising shell_execute with an extended-spelling
workspace root is still outstanding, and terminal fallback without node-pty
remains explicitly unverified. No runtime refresh / main merge / push is
authorized by this review.

## 10. Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES (C1–C4 + gates at integration base).
The approach is correct, the exact diff matches the approved decision scope
(7 files, no scope creep), RED→GREEN is independently proven, and 26/26
tests pass under independent rerun. No competing implementation started by
MUSE; implementation ownership stays with CODEX.
