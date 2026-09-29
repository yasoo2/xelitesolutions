# Muse consultation — STATIC-ARTIFACT-HANDOFF-001

AGENT=MUSE
CONSULTATION_ID=STATIC-ARTIFACT-HANDOFF-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=SUPPORT_TYPED_RUN_BOUND_RECEIPT
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=49e9aa3ec3deb08d82f7781b98b2419832d4930a
UPDATED=2026-09-29T06:45:00Z

## Causal explanation — INDEPENDENTLY CONFIRMED on Muse HEAD (read-only)

I traced the same path on my own HEAD without running the :5002 UI:

1. WebPageBuilderTool.ts:2327 returns structured
   {message, url, previewUrl, path, deliveryStatus, qualityBlockers}.
2. PhaseExecutorTool.ts:1727-1730 success path pushes only
   {task, tool, ok, execution, message<=8000 chars} into phase results.
   url/previewUrl/path/deliveryStatus/qualityBlockers do NOT survive the
   phase boundary. Corroborates Codex's boundary trace exactly.
3. ProjectPipelineTool.ts:691 classifies page scope to web_page_builder, then
   :1816->:1846 unconditionally calls project_run after verified phases.
   durablePreviewUrl (:372-390) covers only dist-bearing maintained projects,
   NOT builder HTML artifacts. There is NO static-artifact acceptance branch.
   So a delivered page always faces the package-bearing runnable gate and
   fails it. The :5002 counter run (finalVerified=false, liveUrl=null) is the
   expected outcome of this structure, not a flake.
4. Filenames are stable per session (joe-<sessionKey>.html at :709/:1550;
   ?v= appended at URL build :328 is a cache buster). Same-session overwrite
   is real, so runId stamping alone is insufficient — acceptance-time content
   binding is required. Corroborates Codex's identity analysis.
5. /artifacts is express.static with no route auth (app.ts:321-323). BUT
   projectPreview.ts:10-12 explicitly documents "No auth on purpose, like
   /artifacts" with the local-machine rationale. Local-public preview is a
   DELIBERATE documented dev decision, not an accidental hole. The production
   multi-user tenant contract is still open and must be decided before a
   static URL counts as delivered in any shared deployment.

## Proposed solution — SUPPORT with conditions

- AGREE: narrow typed artifact receipt bound to run/session/workspace, stamped
  by PhaseExecutor at the success boundary (same envelope pattern as the
  a505 phaseVerificationCheck precedent: executor-reported, identity-bound,
  fail-closed), carried through AgentLoop to ProjectPipeline; static
  acceptance validates run binding + path containment under artifactRootDir +
  URL/path agreement + content revision/manifest at acceptance time
  (including split assets); project_run keeps its root safeguards for
  runnable projects; honest stop when unprovable.
- AGREE: never parse chat text, never infer latest-artifact, never invent a
  package to satisfy project_run.
- Checkpoint alternative (FOLLOWUP question): checkpoints DO hold the full
  toolResult keyed by runId+phase+tool+taskDesc (PhaseExecutorTool.ts:1657-
  1667), so a checkpoint-backed lookup is technically possible. I recommend
  AGAINST it as the primary route: checkpoints are a resumption contract
  (skip-completed, 24h TTL, workspace-root artifactDir), and reusing them as
  the delivery-identity channel conflates two contracts with different
  staleness/scope rules. Typed receipt primary; checkpoints stay resumption-only.
- Simpler alternatives considered: (a) teaching project_run to serve static
  HTML — REJECT, it weakens the runnable-project identity that correctly
  refuses to guess; (b) a static branch that trusts the builder URL without
  acceptance checks — REJECT, it would bless unreachable/stale URLs as
  delivered. The proposal's middle path (static acceptance with real browser/
  behavior/scope/quality gates) is the right shape.

## Quality / behavioral / scope gates

Static acceptance must run the SAME final gates as runnable delivery against
the verified preview URL + artifact root: reachability, real browser QA,
requested-interaction behavior checks, and the scope audit (the counter run's
3-pages-vs-1 and oversized-mobile-menu defects must fail acceptance, not ride
along). A skipped audit stays an honest verification failure.

## Required negatives (test contract)

Valid run-bound handoff; absent receipt; stale receipt (content changed after
stamp); foreign receipt (another run/session); path outside artifactRootDir;
URL/path mismatch; split-asset manifest drift; failed quality/browser check;
runnable-project path unchanged (regression). Then AGENTS gates + fresh unseen
Real Joe UI request with independent visual UAT. Do NOT re-run the 34-minute
counter prompt without an implementation change.

## Overlap with my work — REAL, must be sequenced

The receipt rides the same PhaseExecutor result envelope I extended
(phaseVerificationCheck) and the same pipeline acceptance path as the pending
voice/provenance unit. Two owners editing that envelope concurrently WILL
conflict. Recommend ONE owner for the envelope scope until the pending unit
reaches a decision: either bundle the receipt with the voice/provenance owner
or sequence it strictly after. No competing implementation started from this
review.

## Portability / security

- Receipt must carry relative path + expected root identity, never absolute
  machine paths; resolve against configured artifactRootDir at acceptance.
- Decide the artifact public/private contract explicitly for production
  multi-user before treating a static URL as delivered; local-public stays a
  documented dev default, not a silent production posture.

## Recommended owner/reviewer

- IMPLEMENT: Muse (owns this exact boundary: success-path result shape, a505
  receipt precedent, builder output shape; narrowest change surface).
- REVIEW: NVIDIA (independent of PhaseExecutor edits; owns the UAT harness
  that must consume run-bound artifacts, so review doubles as consumer
  validation).
- Codex authored the proposal + RED test, which makes Codex-review less
  independent; Codex audit at integration instead.
- Order: AFTER the CLI CRITICAL routing decision and the pending voice/
  provenance decision, per the control plane. No implementation authorized by
  this response.

## Recommendation

APPROVE_WITH_CHANGES: approve the typed run-bound receipt direction with the
test contract and sequencing above; reject checkpoint-reuse as primary and
any project_run weakening. CLI CRITICAL first.
