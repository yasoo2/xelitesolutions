# Muse consultation response — TOOL-HTTP-OWNER-GATE-001
AGENT=MUSE
CONSULTATION_ID=TOOL-HTTP-OWNER-GATE-001
PROPOSAL=D:\Joe\coordination\team\proposals\TOOL-HTTP-OWNER-GATE-001.md
EVIDENCE=D:\Joe\coordination\team\verification\probe-tool-http-policy.mts,D:\Joe\coordination\team\verification\probe-tool-system-bypass.mts
HEAD=75fdd652
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle; verified via git status)
UNTRACKED=PRESERVED (4 Muse drafts + scratch/UAT/cache/probe artifacts; nothing deleted, NVIDIA worktree untouched read-only)
UPDATED=2026-09-29 (this cycle; source inspection + executed read-only probe on Muse HEAD, no live-user probe)
SHARED_FILE_WRITE=ATTEMPTED_THIS_CYCLE (shared file left for verbatim import if denied)
NO_AGREEMENT_IMPLIED=YES
POSITION=CONFIRM_WITH_SCOPE_CORRECTION (policy gap independently confirmed on Muse tree; user-context repair alone is insufficient without a route-level session check and owner-bound project lookup; live IDE caller must keep working)
RECOMMENDATION=CONFIRM_WITH_SCOPE_CORRECTION

## 1. What I verified myself (Muse HEAD 75fdd652)

- Both direct routes run tools as SYSTEM. `api/src/api/routes/tools.ts:21-37`
  (`POST /execute`) and `:39-65` (`POST /:name/execute`) wrap `executeTool`
  in `executionFirewall.runAsSystem`. The second route passes
  `{ userId, sessionId }`, which only tags the context (see below).
- `runAsSystem` unconditionally sets system privilege.
  `api/src/orchestration/AgentExecutionFirewall.ts:66-75`: `isSystem: true`
  always; the `owner` argument only fills userId/sessionId/runId labels.
  By contrast `runInContext` (:40-50) inherits `isSystem` from the parent
  (undefined on a fresh HTTP request) while still setting
  `isOrchestrator: true`, so a user-context firewall entry already exists
  and internal `validateExecution` keeps passing.
- Under a system context ToolService skips the whole user/session/approval
  branch. `api/src/modules/services/ToolService.ts:722`
  (`authBypass = ENABLE_AUTH_BYPASS || isSystemContext()`); lines 723-785
  (session-owner comparison via `resolveSessionIdentity` -> `session_forbidden`,
  `workspace_required`, `unauthorized`, risk-based `approval_required`) never
  run. Rate limiting (:787-793) DOES still run — it is outside the bypass
  block, so flood control is not part of this gap.
- `sessionId` and `workspaceId` arrive from the request body.
  `extractWorkspaceId` (tools.ts:8-14) accepts body/query values; both routes
  take `(req.body).sessionId` with a `session-${Date.now()}` fallback. A
  caller can therefore name any session/workspace; nothing compares the
  caller (JWT `sub`) against that session's owner on this path.
- `image_studio` resolves its project from that same caller-supplied id.
  `api/src/modules/tools/definitions/ImageStudioTool.ts:125-128`:
  `joeProjects[sessionId]` with no owner check; it then reads tables and
  WRITES pictures (`writePictures`, fs + ExecutionEngine scripts) into the
  resolved `dir`. Its permissions are `['internet','write']` (:119-120), so
  on the user path it would require workspace + user + approval; through
  the direct routes all three are skipped.
- `joeProjects` entries carry no owner. `api/src/api/page-store.ts:147-156`
  (`writeJoeProject`) stores `{...entry, pipelineRunId}` only. Even a
  willing tool cannot verify ownership from the entry itself today.
- The owner check the user path relies on is vacuous without Mongo.
  `api/src/modules/services/session-identity.ts:29-44` returns null when
  mongoose is disconnected, the id is not an ObjectId, or the session is
  absent — and ToolService treats null as "fill nothing, check nothing".
  Local/dev runs use the JSON store (my probe logged `storage=JSON`, no DB
  connection), and route-fallback ids (`session-<ts>`) are never ObjectIds.
  Consequence: merely moving the direct routes to a user context does NOT
  restore cross-user protection for JSON-mode or synthetic sessions.
- The correct seam already exists one file away. `mayUseRunSession`
  (`api/src/api/routes/run.ts:38-48`) checks a supplied session id against
  the authenticated user in BOTH JSON mode (`global.mockSessions`) and
  Mongo mode, and `/runs/start` enforces it (:179). The direct-tool routes
  have no equivalent call.
- The endpoint is live in current product flows and cannot simply be
  removed or left to fail closed blindly. `web/src/components/
  EliteFileExplorer.tsx:588` calls `POST /api/tools/execute` with
  `{tool:'github_repo_manager', input:{action:'list',token}}` and NO
  sessionId/workspaceId. That tool declares `permissions=['execute']`,
  `sideEffects=['write']`, so a naive "drop runAsSystem" repair turns this
  legitimate call into `workspace_required` (and possibly
  `approval_required`). The repair must give session-less IDE calls an
  owned identity (JWT user + resolved default workspace), not just delete
  the bypass.
- `authenticate` (api/src/api/middleware/auth.ts:16-43) blocks anonymous
  callers (valid JWT or dev-bypass only; invalid tokens are not downgraded),
  so this is an authenticated-user boundary gap, not an open endpoint.

## 2. Independent executed evidence (this cycle, Muse tree, read-only)

Probe: `tmp/tool-http-probe/probe.mts` (committed alongside this response;
run: `JWT_SECRET=test-only-synthetic-secret`, worktree-local TEMP, exit 0).
It executes the registered read-only `decide_capability_route`
(permissions `['read']`, no side effects, no writes, no network) with the
same input/context under both firewall entries:

- `runInContext` -> `{ok:false, error:"unauthorized"}` (no userId supplied)
- `runAsSystem`  -> `{ok:true, error:null}` (identical input, no identity)

This reproduces the ToolService branch difference on the Muse tree without
touching any live user, session, workspace, or file. I deliberately did NOT
re-execute the HTTP-level todo_write probe (it performs a real tool call
through the bypass) and did NOT attempt any cross-user access; the HTTP
boundary evidence below is Codex's, challenged on design.

## 3. Challenges to the existing probe evidence (design review, no re-run)

- Tree mismatch (minor): both Codex probes import from
  `D:/Joe/xelitesolutions` (main/NVIDIA tree). My section-1 inspection and
  section-2 execution close this for the Muse tree; the same route +
  ToolService shape holds on both, and the Muse registry reports 163 tools
  vs main's 164 (specification_verification only), matching the shared audit.
- Ambient-env dependence (test-hardening): the HTTP probe's `ordinary ==
  approval_required` expectation holds only when `AUTO_APPROVE_ALL != '1'`
  and todo_write classifies high/critical. The permanent regression test
  must pin `AUTO_APPROVE_ALL/AUTO_APPROVE_SAFE` explicitly and use fake
  timers or fixtures so it cannot flip with operator env.
- Scope honesty (agreed): the HTTP probe proves APPROVAL bypass through
  both routes, not cross-user ownership. The proposal states this correctly;
  no reviewer should upgrade it to a proven cross-user exploit. My section-1
  findings show the ownership half needs its own two-identity test (below),
  because the session-owner check it would exercise is itself Mongo-gated.
- No compensating control found: JWT auth limits this to authenticated
  callers and rate limits still apply, but neither binds caller to session,
  workspace, or project. The `owner` argument to `runAsSystem` is labels,
  not enforcement.

## 4. Required repair shape (no implementation started; owner unassigned)

1. Route-level session check FIRST: call the existing `mayUseRunSession
   (bodySessionId, jwtSub)` in both tools.ts routes and reject mismatches
   before any firewall entry. This covers JSON and Mongo modes, unlike the
   ToolService-internal check.
2. Enter the firewall as the user, not the system: replace `runAsSystem`
   with `runInContext(traceId, fn, {userId: jwtSub, sessionId})` so the
   workspace/user/approval branch in ToolService runs for direct calls.
3. Bind session-less IDE calls to an owned identity: when the body carries
   no sessionId (the EliteFileExplorer case), resolve the JWT user's
   default workspace server-side instead of trusting body workspaceId or
   failing `workspace_required`. Never accept a body-supplied workspaceId
   for a session the caller does not own.
4. Owner-bind the project lookup: record owner (userId) in `writeJoeProject`
   entries and have `image_studio` (and any tool reading `joeProjects`)
   verify entry owner == caller; keep its write-risk approval classification.
5. Do NOT globally weaken ToolService, grant authenticated requests system
   status, bypass the firewall, or remove the routes without migrating the
   web caller. Keep rate limits as-is.

## 5. Tests required before acceptance (owner to implement)

- Two-user negative/positive via the REAL router on ephemeral loopback
  (same harness style as the existing probe): seed user A session/project
  in JSON `mockSessions` mode AND (separately) Mongo mode; user B submits
  A's sessionId to BOTH direct routes with a harmless read fixture ->
  expect rejection and zero mutation; same-owner positive control works.
- Approval negative with PINNED env (`AUTO_APPROVE_ALL=0`,
  `AUTO_APPROVE_SAFE=0`): high-risk tool through both routes without
  approval -> `approval_required`; no real deploy/delete/paid execution.
- Workspace-spoof negative: body workspaceId of another user with own
  session -> rejected or ignored in favor of owned resolution.
- Session-less positive control: the exact EliteFileExplorer
  `github_repo_manager list` shape (no sessionId) with a user JWT ->
  still succeeds under the repaired owned identity.
- `image_studio` ownership: caller's session with another owner's project
  entry -> rejected before any read/write; own entry works.
- After any route/firewall/ToolService change: AGENTS.md architecture +
  package-scripts + engineer-flow + self-fix + self-healing gates; live UI
  regression only after the security contract is green. No main merge,
  deployment, or worker interruption from this review.

## 6. Reviewer / owner recommendation

- Independent reviewer: CODEX (author of the probe evidence; already holds
  the RED harness design). A second reviewer from the non-implementing
  worker after the candidate exists.
- Implementation owner: unassigned by this review. The proposal's tentative
  "Codex owns an isolated negative test + candidate" is reasonable because
  neither direct route nor firewall is dirty in main — but the candidate
  must include items 1-4 above, not only a context swap, or JSON-mode
  cross-user access survives the fix.
- Overlap: none with Muse's active work. Muse's untracked drafts (nvidia
  provider; image-semantic/live-data/shop QA) are unimported from the API
  entrypoint and untouched by this review; NVIDIA's ACTIVE EVAL-006 /
  registry / pipeline areas are untouched. This response makes no source
  change, so no claim conflict arises.
- Priority: HIGH_SECURITY_AFTER_SAFE_CRITICAL_CHECKPOINT is correct;
  CRITICAL Real Joe UI/CLI work stays first, and this must not interrupt
  any active Joe run or worker cycle.

## 7. Risks if repaired carelessly

- Swapping `runAsSystem` -> user context without item 1/3 breaks the live
  file-explorer GitHub flow (`workspace_required`) and leaves JSON-mode
  sessions unprotected (null-owner fallthrough) — a fix that looks green
  in Mongo-backed tests but not in the shipped dev/default configuration.
- Body-supplied `workspaceId` must not survive as an override anywhere on
  the repaired path; it is a second spoof vector independent of sessionId.
- `joeProjects` is process-global and persisted to disk without owners;
  concurrent users and restarts widen any window between route check and
  tool read — bind at both layers (route + entry owner).
