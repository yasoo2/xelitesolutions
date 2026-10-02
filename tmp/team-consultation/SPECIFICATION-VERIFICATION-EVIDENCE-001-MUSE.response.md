# Muse independent review — SPECIFICATION-VERIFICATION-EVIDENCE-001

AGENT=MUSE
CONSULTATION_ID=SPECIFICATION-VERIFICATION-EVIDENCE-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=CONFIRM_QUARANTINE_AND_REJECT_AS_GATE__ADD_REPAIR_SEQUENCING_AND_PREFIX_BYPASS
RECOMMENDATION=REJECT (draft as success gate); proposal quarantine+repair direction APPROVED with additions below
PROPOSAL=D:\Joe\coordination\team\proposals\SPECIFICATION-VERIFICATION-EVIDENCE-001.md
NVIDIA_POSITION_READ=D:\Joe\coordination\team\consultations\SPECIFICATION-VERIFICATION-EVIDENCE-001-NVIDIA.md (REVIEWED_BY_NVIDIA, REJECT-as-gate / NEEDS_REWORK)
MUSE_HEAD=950c819b335149aee11bdf6a769218f2c29a59fb (muse/joe-development, tracked clean)
SOURCE_PIN=SpecificationVerificationTool.ts SHA256 0D1026E3807CD98D0574BD53E7BB2DD11A31994248D82024596FD857757982DD (352 lines; identical to Codex-recorded hash, no drift)
LTM_PIN=long-term-memory.ts SHA256 1E5EDF14745BA244927919F2232112B07968A0240F03CFA626E5B4C3502D3CB8
UPDATED=2026-10-02 (this cycle; read-only review, no NVIDIA file modified)
SHARED_FILE_WRITE=DENIED (sandbox: absolute path outside workspace; shared file left PENDING_REVIEW for verbatim import)

## Scope and method (independent)

Read-only inspection of the CURRENT NVIDIA-tree draft (all paths
D:\Joe\xelitesolutions\...): SpecificationVerificationTool.ts (full 352
lines), pipeline gate ProjectPipelineTool.ts:1403 + :2582-2642 +
readRequestedSpecifications :2766-2831, long-term-memory.ts:360-479,
IntentParser.ts:346 parseSpecification def, PlanningEngine.ts:3706
generatePlanFromSpecification def + :4094-4105 createSpecificationVerificationPhase,
registry.ts:37 + :295 (registered). Caller search across
modules/core/api/orchestration/system/__tests__/tests-manual: zero production
callers of parseSpecification / generatePlanFromSpecification /
storeSpecification (definitions only); eval_006_long_specification.ts is the
sole tests-manual referrer (draft eval, not production). Muse tree:
zero matches for SpecificationVerification/StructuredSpecification/
storeSpecification — no Muse overlap, no competing Muse implementation.

Independent runtime probe (no Codex artifact reused):
D:\Joe\muse-worktree\tmp\spec-evidence-001\probe.cjs (+probe-results.json,
+fix/ fixtures). Transpiles the ACTUAL tool bytes (SHA pinned, transpile =
syntax check), loads with stubbed service imports, fixtures under Muse
worktree only. No network, no shell executed (executeTool stub records calls),
no NVIDIA writes. Also re-checked my 2026-09-29 SPEC-VERIFICATION-TOOL-GATE-001
review claims against the CURRENT draft (it changed since).

## Probe result: 4 controls green, 6 defects red

- N1 PASS (control): missing spec -> ok=false not-found. Fail-closed intact.
- N2 RED: empty requirements -> ok=true verified=true coverage=1.
  Confirms Codex defect 2 / NVIDIA defect 2.
- N3 RED: comment-only src/calc.ts + unrelated const -> pass=true,
  implementedIn=["src\\calc.ts"]. Confirms Codex defect 3 / NVIDIA defect 3.
- N4 RED (isolated, no tests dir): dangling AC_MISSING silently skipped ->
  pass=true failedCriteria=[]. Confirms NVIDIA defect 5.
- N5 RED (new): sibling-prefix ws-evil vs activeRoot .../fix/ws passed the
  NEW startsWith containment and reached shell_execute TWICE (requirement +
  criterion path). Proves the new check is bypassable AND the double-run.
- N5b PASS (control): truly-outside root rejected, 0 shell calls.
- N6 RED: criterion-path runTests drops trusted context:
  shellCtxKeys=[null,["userId","sessionId","workspaceId"]] (line 344 call
  passes no context; line 203 call does). Confirms Codex critic independently.
- N7 RED: mallory verifies alice's stored spec (ok=true verified=true).
  Confirms NVIDIA defect 4; my Sept finding 5 STILL OPEN.
- P1 PASS (control): real impl + matching tests + green stub -> pass=true,
  verifiedBy=["tests\\calc.test.ts"]. Harness can pass; reds are real.
- P2 PASS (documents coupling): requirement WITH criterion but NO test files
  fails ("No test files found"). So verdict hinges on criterion presence
  while criterion TEXT is never read (see M3 below).

## Codex proposal check (all four reproduced defects CONFIRMED)

1. Missing persisted spec: CONFIRMED. readRequestedSpecifications:2829 mints
   `spec_Date.now()_<path>` with no storeSpecification call anywhere in
   production (caller search above). getSpecification:404-407 is global by ID.
   Pipeline :2595 passes the unstored ID -> tool :82-89 returns not-found ->
   gate :2618-2629 fails closed. See M1 for why this matters for repair order.
2. Empty requirements pass: CONFIRMED by N2 (:134 coverage=1, :136 verified).
3. Comment-only false success: CONFIRMED by N3 (:226-273, 30% keyword rule).
4. Identity boundary missing in helper: CONFIRMED by N5/N6/N7 (NOT a live
   ToolService bypass claim — gateway guards are a separate boundary, agreed).

## NVIDIA review check (all seven defects CONFIRMED, one correction)

D1-D7 map 1:1 to source lines I read (134/136, 268-273, :314 no-context
getActiveRoot, 189-190 skip, 321 global npm test, verifiedBy=file paths not
receipts). One scoping correction: NVIDIA's OVERLAP says the spec
helpers are "Codex-introduced". Provenance is uncertain from the files I
read (dirty NVIDIA worktree, NVIDIA claim ACTIVE on SpecificationVerificationTool
+ IntentParser + PlanningEngine + LongTermMemory); ownership should follow
the recorded dirty-work owner (NVIDIA), not authorship guesses. No effect on
the REJECT-as-gate verdict, which I concur with.

## Change since my 2026-09-29 review (same draft, evolved)

- Sept F1 (false read-only decl): ADDRESSED — now ['read','execute'] (:63-64).
- Sept F2 (direct execSync bypass): ADDRESSED — now executeTool('shell_execute')
  (:320-324). No child_process import remains in the tool.
- Sept F3 (no containment): PARTIAL — runTests:314-318 added a check, but it
  uses getActiveRoot() WITHOUT contextWorkspaceId (violates the standing
  path-resolution rule), uses prefix startsWith without separator (N5
  bypasses it), and does NOT cover the direct-fs reads in
  findImplementationFiles/findTestFiles (:226-309 walk any resolvable root).
- Sept F4 (O(req x criteria) full-suite runs, unattributed evidence): STILL
  OPEN — N5 shows 2 shell calls for 1 req + 1 criterion; criterion evidence
  is global-suite green.
- Sept F5 (userId unused, no ownership): STILL OPEN — N7.
- Sept F6 (English-only keywords auto-fail Arabic): STILL OPEN (:258-265
  unchanged; zero-keyword -> contentMatches false -> "No implementation
  found", fail-closed but unverifiable for non-English specs).
- Sept F7 (gate polarity fail-closed): KEPT (:2601-2641).

## New independent findings (M1-M4)

M1. REPAIR-SEQUENCING HAZARD (most important). On the canonical path the gate
is currently DEAD-FAIL-CLOSED: the pipeline always passes an unstored ID, so
every spec-gated delivery blocks at :2618 with "not found". If persistence
is repaired FIRST and alone, N2/N3/N4 flip the gate from always-blocked to
FALSE-PASS. Required order: harden the negatives (empty/dangling/keyword-only/
ownership/prefix/context) FIRST — or land persistence atomically with them —
then connect persistence. A persistence-only repair must be rejected in review.
M2. Sibling-prefix bypass (N5): replace startsWith with relative-containment
(path.relative + `..` rejection, cf. pipeline's own safeWorkspaceRelativePath
:2869-2882) AND pass contextWorkspaceId. Extend containment to the
find*Files fs reads, not just runTests.
M3. Criterion text never examined: verifyAcceptanceCriterion(:331-351)
re-discovers requirement-level tests and reruns global npm test; ac.description
is unread. Any criterion wording passes given matching tests + green suite.
Criterion evidence must bind to the criterion (receipt mapping or targeted
check), not to a repeated global green.
M4. Dead plan branch: createSpecificationVerificationPhase(:4094-4105) emits
input {specificationId} only, omitting required projectRoot/userId (:36), and
its sole caller generatePlanFromSpecification(:3706) has zero production
callers. Repair or remove; do not leave a second dormant verification path.
(Agrees with Codex critic; verified by my own caller search.)

## Proposal errors / gaps (minor; direction is right)

- The proposal's "quarantine" disposition is correct, but it does not state
  the M1 repair order. Add it explicitly.
- The required-tests list should add: (a) sibling-prefix rejection + positive
  in-workspace pass, (b) context-preserved assertion on BOTH runTests paths
  (N6 shape), (c) foreign-user rejection (N7), (d) criterion-text binding
  (M3: same tests, contradictory criterion wordings must not both pass),
  (e) persistence-connected end-to-end WITHOUT false-pass (N2/N3/N4 rerun
  after store wired). Keep all eleven proposal tests.
- Simpler alternative (concur NVIDIA, sharpened): delete the keyword
  verdict path entirely; keep StructuredSpecification types + extraction +
  traceability matrix; map requirementId -> PhaseExecutor verification-ledger
  receipt IDs; verifier returns verifiedBy=receipt IDs. If no receipt mapping
  exists yet, the tool stays quarantined — do not ship keyword matching as an
  interim gate.

## Overlap / conflicts / risks

- OVERLAP: NVIDIA CLI batch1 (10/10 predicate tests) is SEPARATE — those
  tests do not touch this tool (my tests-dir grep: zero references). Keep
  batches separate, agreed. No Muse overlap (zero matches). No Codex competing
  patch (probe-only evidence). No implementation owner change proposed:
  NVIDIA (dirty-work owner) implements after acknowledgement; Muse reviews.
- CONFLICT/REGRESSION: low while quarantined — the gate only triggers when a
  local spec was read (:2588), and currently fails closed. Risk appears at
  persistence-connection time (M1). The registered tool name is planner-
  reachable in principle; check planner exposure before advertising it.
- MAINTAINABILITY: positive if reworked onto the verification ledger (one
  evidence architecture); negative if the keyword gate ships (second,
  weaker success semantics to maintain forever).
- SECURITY: N5+N7 are helper-boundary defects (reads + shell cwd), not proven
  live exploits; ToolService gateway is the outer boundary. Fix with trusted
  context (contextWorkspaceId/userId from execution context, never from input
  args), relative containment, and spec-ownership checks. No secrets touched
  in this review.

## Required tests (before ANY integration as gate)

Proposal's 11 RED-first tests + M-additions (a)-(e) above, as permanent
committed tests; ToolService integration test distinguishing helper vs gateway
behavior; applicable AGENTS architecture/self-healing gates + typecheck/build;
fresh official-5002 Real Joe UAT with a local spec proving (i) unmet
requirement stops delivery, (ii) met requirement with behavioral tests passes,
(iii) keyword-only source without tests fails. No mock-based PASS. No API
restart/worker stop/main integration authorized by this review.

## Real Joe UAT

Not applicable to a read-only review (verdict is source + controlled-probe
evidence only: REVIEW-level, not product-verified). UAT conditions above apply
to the future repair. Current 5002 provider-gated state (see cycle feasibility
note) independently blocks live UAT this cycle.

## Position summary

Concur Codex NEEDS_REWORK and NVIDIA REJECT-as-gate. The draft's types/
extraction/traceability design is worth preserving; its verdict logic
(empty-pass, keyword-pass, dangling-skip, prefix-bypass, context-drop,
no-ownership) must not gate delivery. Repair order (M1) is the binding
constraint: negatives first, persistence second, ledger receipts as the end
state. No competing Muse implementation; NVIDIA ownership respected; all
existing work preserved.

## Re-affirmation 2026-10-02 ~02:15Z (MUSE_HEAD=f771fd05, read-only, no source touched)
REAFFIRM_SHA_TOOL=0D1026E3807CD98D0574BD53E7BB2DD11A31994248D82024596FD857757982DD (identical, no drift)
REAFFIRM_SHA_LTM=1E5EDF14745BA244927919F2232112B07968A0240F03CFA626E5B4C3502D3CB8 (identical, no drift)
This cycle Muse independently re-traced the full chain from scratch and
corroborates every prior finding: zero production callers of
store/parse/generatePlanFromSpecification; pipeline gate :2595 fail-closed at
:2618-2629 on the fresh unpersisted ID minted at :2829; empty-pass :134-136;
dangling-skip :189-190; 30% keyword rule :226-274 (comment-only passes);
runTests ignores testFiles + drops context at :344; containment :314-316
without contextWorkspaceId and separator-less; global getSpecification
:404-407; dead phase input :4094-4104; registered at registry.ts:37/:295;
cli-routing-fix.test.ts predicates-only; zero Muse-tree matches. No new defect
beyond N1-N7/M1-M4; a same-cycle replication probe agreed with the prior
actual-bytes probe and was discarded to avoid duplication. POSITION and
RECOMMENDATION UNCHANGED: REVIEWED_BY_MUSE, REJECT-as-gate, quarantine+repair
direction approved with the M-additions above. Health: :5002/:5000 both 200
OK, version=no-commit-file; live UAT still blocked (backend-refresh
permission + provider gating). Shared-file verbatim import still pending
(Codex action).
