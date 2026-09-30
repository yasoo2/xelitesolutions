AGENT=MUSE
CONSULTATION_ID=VERIFICATION-REUSE-FINGERPRINT-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=Root cause confirmed in main source; V4 correction direction is correct, but V4-as-diff-against-main duplicates committed Muse work (5900fc94) and regresses Muse's test-determinism variant. The genuinely novel V4 value is the exact-path checkpoint exclusion + PhaseExecutor resume guard + 13 contract tests. Integration must reconcile, not blind-apply.
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=8417f740
MAIN_HEAD=e8fd9589
UPDATED=2026-10-01
ROLE_ACCEPT=YES — Muse accepts independent-reviewer ownership for the ledger/resume scope after installation; no competing implementation will be started.

## 1. What I independently inspected (not inferred)
- Main ledger defect site: D:\Joe\xelitesolutions\api\src\core\quality\verification-ledger.ts:567-569
  (`// Always reuse if checkId matches...` + `if (previous && previous.result === 'passed')`) — PRESENT in current main.
- Muse ledger equivalent: D:\Joe\muse-worktree\api\src\core\quality\verification-ledger.ts:566-571
  (`selection.cacheable && previous.fingerprint === selection.fingerprint`) — ALREADY FIXED on Muse branch.
- V4 review patch + review-source-v4 (both files) + v4 manifest + v2/v3/v4 transform chain — read in full.
- Hash verification (Get-FileHash SHA256, this cycle): review ledger 16DA193D…597CF ✓, review PhaseExecutor
  29B20025…E61D79 ✓, current main ledger 1B1E253C…2ABB6C ✓, current main PhaseExecutor D266BBA8…12973BD7 ✓ —
  all match v4-review-source-manifest.json. Main is unchanged; review source is authentic.
- All 13 new contract tests in checkpoint-current-contract.test.ts — read in full (4 exclusion + 6 alias matrix +
  1 legitimate-reuse + 2 changed-source rerun = 13 ✓).
- All existing suite test names: verification-ledger.test.ts = 18 plain + 4 (failed/cancelled/timed_out/incomplete)
  + 3 junction kinds + 5 scope shapes = 30 cases; change-aware-phase-verification.test.ts = 2 + 4 + 7 = 13 cases;
  30 + 13 = 43 ✓ — reconciles the reported "43 existing" exactly. No count inflation.
- Checkpoint writer: engineering-checkpoint.ts:65-73 (DIR_NAME + artifactDir join); PhaseExecutor artifactDir
  selection: :1653 (task checkpoints, workspaceRoot-first) vs :2236 (phase checkpoints, projectRoot-first) vs
  resume loader :2123 (workspaceRoot-first).
- V4 helper scope: main PhaseExecutorTool.ts:17 (isVerificationTool) and :107 (resolvePlannedTool,
  adaptPlannedArgs, adaptPlannedArgsFromDescription) — all imported and in scope at the V4 insertion point (~2112);
  the same resolve→adapt→adaptFromDescription→isVerificationTool pipeline is already used by execution at
  :1497-1498/:1567 and :2281-2327, so the guard classifies exactly as execution does (no divergence).
- Ledger call-site scope: workspaceRoot is defined at fingerprintVerification ledger:443 and the !trustedScope
  early return (:451-480) guarantees it is non-empty at the V4 collectFiles call site. Patch premise holds.
- Muse attribution: `git log -S` proves Muse commit 5900fc94 ("strict verification reuse + final gate rejects
  read-only observations", Muse branch, not main) introduced the strict cacheable+fingerprint condition AND the
  '.engineering-checkpoints' basename entry AND the live-env test-mode hashing.

## 2. Root cause (confirmed, with a correction to the proposal's framing)
- RC1 (main-only): unconditional checkId-only reuse at ledger:567-581 returns before invalidation:583, so changed
  source, scope change, env/toolchain drift and cacheable=false cannot prevent reuse. CONFIRMED in current main.
- RC2 (BOTH trees): PhaseExecutor checkpoint-skip (`completedTaskKeys.has`, main :2173/:2197, Muse :2188/:2212)
  bypasses verification tools entirely — 0 receipts, 0 gateway calls on resume. Neither tree has
  checkpointRequiresCurrentVerification. The resumed-run probe claim is structurally consistent with this code.
- RC3 (main-only): test-mode constant env fingerprint (main :375-377) blinds env-drift detection in tests.
- RC4 (main-only): manifest symlink is read for toolchain identity (main :389-390).
- CORRECTION: RC1/RC3/RC4 are already repaired on the Muse branch by 5900fc94 (condition + live-env hashing +
  symlink→incomplete). The proposal's "current main" framing is accurate for main, but V4-as-a-diff reinvents
  three hunks Muse already committed. Only the exact-path exclusion + resume guard + tests are novel.

## 3. Proposal errors / gaps found
- E1 (integration hazard, MUST fix): Muse's IGNORED_DIRECTORIES contains the '.engineering-checkpoints' BASENAME
  (Muse ledger:109-111; main:109-111 does NOT). V4 assumes basename exclusion absent and adds exact-path
  exclusion only. Merging V4 onto Muse-line code without removing the basename entry keeps nested same-name real
  source invisible and breaks V4 contract tests 2-3. The proposal never mentions Muse's divergent set.
  Required: integration must REMOVE the basename entry when adding the exact-path exclusion (V4's approach is
  strictly better than both main's no-exclusion and Muse's basename-exclusion).
- E2 (regression risk, MUST fix): V4's environment hunk (random key always) REGRESSES Muse's variant (stable test
  key + live env values, Muse ledger:367-381). Muse's variant is deterministic in tests AND change-sensitive AND
  preserves legitimate cross-process/cross-restart receipt reuse when env is truly unchanged; V4 silently drops
  all persisted-receipt reuse on every process restart. There is no security gain either way (the test key is a
  public constant; fingerprints are change-detection, not unforgeability). Required: preserve Muse's
  environmentIdentity; do not install V4's env hunk over it.
- E3 (adjacent pre-existing defect, separate ticket, NOT in V4 scope): task checkpoints write workspaceRoot-first
  (:1653 + "stable artifact directory" comment) but phase checkpoints write projectRoot-first (:2236), while the
  resume loader reads workspaceRoot-first (:2123). Consequences: (a) V4's workspaceRoot-only exclusion misses
  projectRoot phase-checkpoint writes (fail-closed: lost reuse, still safe); (b) phase checkpoints under a
  distinct projectRoot may never be loaded (orphaned). Do NOT expand V4 to unify artifactDir; file a bounded
  follow-up after V4 lands.
- E4 (minor, robustness note): the exclusion compares `path.resolve(target,entry.name) === checkpointRoot` by
  string equality. Windows case/8.3/short-name or symlink-root spellings that differ textually will miss — but the
  failure direction is fail-closed (dir fingerprinted, checkpoint writes invalidate). Acceptable; add the planned
  code comment documenting the reserved location so a future engineer does not "fix" it into a basename rule.
- E5 (count, RESOLVED by reviewer): I initially counted 31 existing tests vs the reported 43; full it.each
  expansion gives 30 + 13 = 43 exactly. No inflation. (Verification recorded here so a later auditor need not redo it.)

## 4. Simpler alternatives considered
- A1 always-rerun: safe but destroys valid cache benefit (longer resumes, repeated paid/browser verification).
  Correctly rejected by the proposer; I concur.
- A2 integrate-then-extend (RECOMMENDED): integrate Muse 5900fc94's three ledger hunks (condition, env, manifest)
  as the base, then add ONLY V4's exact-path exclusion + resume guard + 13 tests (minus V4's env hunk, plus
  basename-entry removal). Smaller true diff, no duplicated authorship, no determinism regression.
- A3 unify artifactDir instead of excluding: treats E3's root, but larger blast radius across checkpoint/resume
  semantics. Correctly out of scope; follow-up ticket.

## 5. Overlap with existing work
- Muse M02 (5900fc94 + siblings): DIRECT overlap on the ledger-condition/manifest/env hunks — same semantics,
  Muse committed first. V4's exclusion/guard/tests do not overlap anything on the Muse branch (verified absent).
- NVIDIA dirty main work (12 files: registry, pipeline, planners, memory, intent, specs): NO file collision —
  verification-ledger.ts is tracked-clean and PhaseExecutorTool.ts is NOT in NVIDIA's dirty list (verified via
  read-only git status this cycle). NVIDIA's acknowledged CLI batch1 scope is untouched by V4.
- Codex V4 scope (ledger + resume guard) is non-overlapping with NVIDIA CLI ownership. No ownership conflict.

## 6. Conflict / regression risks
- R1 (high if ignored): E1 basename-merge hazard → silent nested-source blindness. Mitigation: explicit removal
  step + contract tests 2-3 must run on the INSTALLED tree, not only virtual.
- R2 (medium if ignored): E2 determinism/cross-restart reuse regression. Mitigation: keep Muse env variant.
- R3 (low): resumed verification tasks now execute instead of skip → longer resumes, more gateway calls. Intended
  behavior change; bounded by the existing one-attempt self-fix policy (resumed failure → ticket → one rerun).
  No new loop risk introduced by V4 itself.
- R4 (low): `adaptPlannedArgsFromDescription` runs per checkpointed task on resume — same function execution
  already runs per task; negligible cost, identical classification (verified same pipeline).
- R5 (noted, out of scope): SelfFixExecutionService ai_write_file follow-up recursion vs one-attempt policy —
  flagged in shared state as needing separate execution-count evidence. V4 does not touch it; do not expand scope.

## 7. Maintainability / security impact
- Maintainability: POSITIVE if E4's reserved-location comment + a short ADR/note land with the patch (proposal
  already promises this — hold it as a merge requirement, not a nice-to-have). The guard mirrors the existing
  classification pipeline, so future tool-alias changes propagate automatically. E3's dual-artifactDir precedent
  should be unified later; document, don't fix here.
- Security: POSITIVE. Closes stale-proof reuse (false PASS) and resume-bypass (zero-proof PASS) without new
  attack surface. Fail-closed directions verified for: overflow/incomplete budgets, untrusted scope (nonce
  fingerprint), symlink/junction (no read), unreadable source, missing browser revision, exclusion mismatch.
  No receipt secrets (boundedText; env hashed, names/values never persisted — covered by existing test
  'invalidates inherited environment changes without retaining their names or values'). Multi-user: fingerprints
  key on workspaceId; ledger is a per-run artifact; no cross-tenant channel introduced. Portability: no new
  machine paths; exclusion is derived from descriptor roots.

## 8. Legitimate-reuse / negative coverage (reviewer-confirmed by reading)
- Legitimate reuse preserved: existing 'reuses one passing check only while every relevant input matches' +
  'executes a matching passing check once and reports the duplicate as reused' + NEW 'reuses resumed verification
  only through a current matching ledger receipt' (unchanged → gateway NOT called, 'verification reuse: current'
  log, no checkpoint-skip message) + NEW reserved-metadata-change → still reuse. SATISFIED.
- Negative: failed/cancelled/timed_out/incomplete never reusable (4), junction/symlink/unreadable (5+), trust
  boundary (2), focused→final ×2, metadata non-reuse, shell non-certification ×2, read/write/detect/unregistered
  rejection ×4, NEW source-change rerun seq+par (2), NEW alias matrix cmd/script/commandLine × par/seq (6), NEW
  nested-source + explicit-inside-reserved (3). SATISFIED. No additional permanent tests demanded, but the 13 new
  tests MUST be committed as permanent tests with the installation (they currently live only under
  verification/probes) and must pass on INSTALLED source, not only virtual overlay.

## 9. Required tests before integration ACCEPT
1. Install reconciled patch (A2 + E1 + E2) in an ISOLATED worktree only; no main/Muse/NVIDIA tree mutation.
2. 56/56 (43 existing + 13 new, now permanent) on installed source; RED controls re-shown (revert check).
3. Full `tsc --noEmit` + api/web builds on the installed tree.
4. All 10 AGENTS core gates (guard:architecture, guard:package-scripts, engineer-flow, 7 self-fix/self-healing).
5. Engineer-flow + self-healing negative suites on INSTALLED source (the virtual-overlay PASS does not transfer).
6. Diff audit: installed diff must equal reviewed diff (E1/E2 reconciliation explicit in the handoff).
7. Real Joe UAT on official :5002 AFTER allowed backend refresh: (a) fresh request to terminal output; (b) a
   materially relevant requested change under the SAME named quality check → fresh check execution proven in
   evidence (not reuse); (c) resume-after-interrupt with unchanged sources → legitimate reuse observed.
   UAT is currently BLOCKED (no installed implementation + backend-refresh approval pending) — recorded honestly,
   no UI PASS implied by any fixture result.

## 10. Real Joe UAT (this review)
Not performed by the reviewer: no implementation is installed anywhere and the :5002 backend refresh awaits
approval. This review covers source/test/evidence only. No product PASS, no main-merge authorization, no
GitHub-hash claim.

## 11. Conditions for ACCEPT (binding on implementation owner)
C1. Reconcile with Muse 5900fc94 per A2 (no duplicated ledger hunks; Muse authorship preserved).
C2. Remove '.engineering-checkpoints' from IGNORED_DIRECTORIES wherever the exclusion lands (E1).
C3. Keep Muse's stable-test-key + live-env environmentIdentity; do not install V4's env hunk (E2).
C4. Commit the 13 contract tests as permanent tests; green on installed source (section 8).
C5. Document the reserved workspaceRoot/.engineering-checkpoints contract in code + shared arch note (E4).
C6. File the E3 artifactDir-unification follow-up (bounded, owned, after V4).
C7. Full gates + Real Joe UAT per section 9 before any main-merge proposal.

SHARED_WRITE_NOTE=Shared consultation write is blocked from the Muse sandbox (proven prior cycles); this workspace
response file is the authoritative Muse review, provided for verbatim import by Codex. No position may be
fabricated beyond this text.
