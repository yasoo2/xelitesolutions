AGENT=MUSE
CONSULTATION_ID=SCAFFOLD-PROVENANCE-COUNTEREXAMPLE-002-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=COUNTEREXAMPLE_CONFIRMED__WHOLE_ROOT_PROVENANCE_IS_RETRY_PERMISSION_NOT_DELETE_PERMISSION
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=e0722d54
MUSE_BRANCH=muse/joe-development
MAIN_HEAD=e8fd9589
REVIEWED_UTC=2026-10-01T13:35:00Z
SHARED_WRITE=DENIED_BY_SANDBOX_ABSOLUTE_PATH_OUTSIDE_WORKSPACE
NOTE=Shared consultation file could not be updated from this sandbox. This
complete review is published here for verified import. Do not infer NVIDIA
agreement.

INDEPENDENT_VERIFICATION_OF_CODEX_EVIDENCE:
- Counterexample JSON (verification/scaffold-reset-order-20261001/
  provenance-gate-counterexample.json) read in full: 1 failure case
  (joe_registered_root_with_later_user_file: validate -> remove(recursive,
  force) -> validate -> mkdir -> write, ok:true, sentinelPreserved:false)
  + 2 passing controls (unknown_root preserved with
  scaffold_existing_project_preserved; fresh_root writes normally).
  Source/validator hashes cited (280a2393.../eeb3a88d...) match the
  already-verified SystemTools/file-write-contract hashes. The experiment
  shape is consistent with a validate-first + whole-root-provenance
  design, and the failure follows structurally: NOTHING in that design
  distinguishes the later user file from Joe's own output. Confirmed.
- ACTUAL_REGISTRATION confirmed by direct source read in the Muse tree
  (SystemTools.ts:1460-1461, identical file to main per 001 review):
  `if (sessionId && created.length > 0)` registers via writeJoeProject;
  registration happens BEFORE the return at :1477
  (`ok: errors.length === 0`), so a PARTIAL scaffold (created>0 with
  errors) IS registered. Codex's "even with some errors" is accurate.
- Zero-created boundary confirmed structurally (:1447/:1452/:1461): a
  first file write throws AFTER mkdirSync created the directory, so
  created[] stays empty while empty dirs exist on disk, and no
  registration occurs. A retry under my 001 design would meet an
  "unknown root" and be refused a retry it legitimately needs.
  Valid boundary, must be handled.

ROOT_CAUSE (refined by this counterexample):
My 001 review proposed ONE provenance predicate answering TWO different
questions. The counterexample proves they must be split:
1. RETRY permission (root-level): "may Joe attempt a scaffold here
   again?" — root provenance (registry/marker) or same-run pre-claim
   is the right answer.
2. DELETE permission (file-level): "may Joe remove THIS file?" — root
   provenance is NOT an answer. Only per-file ownership (Joe wrote it
   AND it is unchanged since) can authorize removal. A registry entry
   or root marker must never be treated as deletion authorization for
   every current file. Codex is right; my 001 design is corrected
   accordingly (correction, not withdrawal: ordering defect + retry
   requirement from 001 stand).

PROPOSAL_ERRORS_AND_GAPS (in my own 001 recommendation):
1. Whole-root-gated reset erases later user files (the counterexample).
2. created.length>0 as the sole provenance signal orphans failed
   zero-created attempts (empty dirs, no registration, retry blocked).
3. Partial-scaffold registration is CORRECT for retry but widens the
   root gate; file-level rule is then load-bearing, not optional.

RESOLVED_DESIGN (recommended):
- Validate batch first (unchanged from 001).
- Retry gate (root-level): allow when Joe provenance exists (registry
  entry or marker file) OR when the root carries this run/session's
  pre-claim (recorded at scaffold START: runId + root; authorizes
  retry-with-preservation, never delete). Unknown roots get the honest
  collision error naming root + remedy, no removal, no write.
- Removal rule (file-level): remove ONLY files listed in an ownership
  manifest (path + content hash recorded at Joe's write time) whose
  current content still matches. Unknown, user-added, or modified
  files are preserved and named in a collision report with remedy.
  Required-path collision (structure needs a path occupied by foreign
  content) -> honest stop, no partial delete.
- Manifest storage must be workspace-relative (registry-adjacent JSON
  or marker), never process-local, so it survives restarts and
  multi-instance deployment.

SIMPLER_ALTERNATIVE (preferred if the team accepts it):
UPSERT-ONLY scaffold — delete the recursive delete instead of gating
it. Overwrite owned-unchanged paths only; foreign-occupied required
path -> collision error; report orphaned files (on disk, not in the
new structure, not foreign) in logs for a SEPARATE explicit cleanup
tool carrying destructive approval. This removes the entire
deletion-authorization problem: no manifest-gated rm, no provenance
predicate in the delete path at all. Retry loop works (overwrite
partials). Trade-off: stale files linger visibly until explicit
cleanup — honest and auditable, versus today's silent rm. Either
design requires the old sandbox test revision by explicit review
decision (never silent deletion).

OVERLAP_WITH_EXISTING_WORK:
- SelfFixExecutionService skip of scaffold reruns after manifest
  repairs (001 review): preserved under both designs; upsert-only
  makes that skip less load-bearing but it must stay.
- joeProjects registry / writeJoeProject: reuse for root provenance
  + pre-claim; manifest extends it, no parallel tracker.
- Windows installed stack 39fe5c75 touches SystemTools.ts elsewhere:
  implementation stays hunk-scoped, hashes preserved.
- NVIDIA CLI producer lane: scaffold still must NOT become a blind
  CLI fallback. No competing Muse implementation.

CONFLICT_AND_REGRESSION_RISKS:
- system-tools-sandbox.test.ts 'resets a stale product child' still
  encodes the old destructive contract; revise by review decision to
  preservation/collision assertions.
- react-project.test.ts:1302 identity handoff must keep passing.
- Highest risk: greenfield retry after failed run (now TWO shapes:
  partial-with-provenance AND zero-created-with-preclaim). Both need
  explicit passing tests.
- Manifest staleness (hash recorded, file legitimately updated by a
  later Joe edit tool): edits through Joe tools must update the
  manifest entry, else a later retry falsely reports collision. Owned
  edits stay frictionless; only EXTERNAL modification collides.

MAINTAINABILITY_AND_SECURITY_IMPACT:
- File-level rule centralizes the safety invariant in one manifest
  check; upsert-only removes it from the delete path entirely. Both
  beat ordering discipline spread across callers.
- Collision reports follow existing redaction discipline (root +
  file NAMES + remedy; 240-char slice convention; never contents).
- No new privileged surface; no autonomous blanket approval.

REQUIRED_TESTS (additive to my 001 list of 9):
10. Joe-provenance root + later user file + retry: user file
    preserved; success only if no required path needs it.
11. Zero-created retry (empty dirs from failed attempt, same run):
    pre-claim allows retry, scaffold succeeds.
12. Partial-errors scaffold (created>0 + errors): provenance
    recorded, retry allowed.
13. Modified-owned-file (content changed after Joe wrote it):
    preserved + named in collision report, no silent overwrite.
14. Upsert variant (if chosen): orphan report lists stale files;
    no removal call occurs in any scaffold test.
Then: typecheck, build, architecture/package guards, engineer-flow,
AGENTS self-fix/self-healing gates (ToolService-adjacent).

REAL_JOE_UAT (after reviewed implementation + gates + authorized refresh):
Official :5002 UI, fresh greenfield request, then conflicting-name
second run with preserved test-only sentinel + a user-authored file
inside the first output; confirm no-loss + honest collision naming.
No UAT claim from virtualfs probes alone.

ROLE_ACCEPTANCE:
Muse remains INDEPENDENT REVIEWER for the bounded implementation.
CODEX implementer / NVIDIA dependency critic unchanged. No competing
Muse implementation. Integration only after exact-diff review,
combined gates, main-hunk reconciliation and authorized :5002 UAT.

EVIDENCE_PATHS:
D:\Joe\coordination\team\consultations\SCAFFOLD-PROVENANCE-COUNTEREXAMPLE-002-MUSE.md
D:\Joe\coordination\team\verification\scaffold-reset-order-20261001\provenance-gate-counterexample.json
D:\Joe\muse-worktree\api\src\modules\tools\definitions\SystemTools.ts:1409-1477
D:\Joe\muse-worktree\tmp\team-consultation\SCAFFOLD-PRESERVE-EXISTING-WORK-001-MUSE.response.md
