# Git-family wiring slice — exact NVIDIA f40 bytes (read-only audit)

EXACT_SOURCE=f40f6100e8083bfefeef54eb7812c3690b068048 (full api/src via git archive, tmp/wiring-browser-f40)
AUDIT_DATE=2026-10-04
AGENT=MUSE (independent audit lane; implementation owner NVIDIA — NO source edits)
SCOPE=L1 definitions → L2 registration → L3 planner/picker/executor/API refs, static only
METHOD=reused frozen f40 tree + tmp/wiring-git-f40/refcount.py + targeted reads
NOTE=refcount.py census "prod files" label includes tests/manual (backslash filter
miss); manual-test hits are reported as test-layer evidence, not prod consumers.

## L1 — Implemented (5 tool classes, 5 files)

| File | Class | Tool name |
|---|---|---|
| GitTools.ts | GitOpsTool | git_ops |
| GitLocalWorkflowTool.ts | GitLocalWorkflowTool | git_local_workflow |
| GitHubRepoManagerTool.ts | GitHubRepoManagerTool | github_repo_manager |
| GitHubPRTool.ts | GitHubPRTool | github_pr |
| GitHubActionsTool.ts | GitHubActionsTool | github_actions |

## L2 — Registered (5 of 5)

- git_ops: registry.ts:176 via safeNew.
- github_repo_manager / github_pr / github_actions: registry.ts:181-183 via
  safeNew. The :177-180 comment ("were imported but NEVER registered") is
  historical repair narrative, immediately followed by the fix — not a live defect.
- git_local_workflow: registry.ts:323 via direct `new` in the fallback-minimal set.
- IMPLEMENTED_NOT_REGISTERED: 0. DUPLICATE: 0.

## L3 — Planner / picker / executor / API references (counts: refcount.log)

git_ops (14 files incl. 6 manual tests):
- plan-tools.ts x16: catalogue purpose ('git: init, add, commit, branch,
  status'), keyword map (git/github/version control/source control/gitlab/
  bitbucket/git init/git commit/repository/repo → git_ops).
- ARG_SYNONYMS maps action/op/subcommand/verb → operation; REQUIRED_DEFAULTS
  fills operation=status. The documented live failure ("{action:'status'} vs
  `operation`") is repaired at this layer. INPUT_CONTRACT_VALID.
- tool-picker.ts PRIORITY slot (registered → byName.get HITS; LLM-visible).
- ToolService.ts x5: aliases IN (git_commit/commit → commit; git_push/push →
  push; github_repo_manager+push → git_ops) — all set effectiveInput.operation.
- Real consumers: DeployPagesTool.ts:195 (clone/stage ops), WebDevelopmentTools
  .ts:341,350,374 (repo ops + push), api/routes/github.ts:286,288,299,306
  (fetch/pull/clone with askpass auth).
- Focused tests: plan-tools.test.ts (Git→git_ops meaning), token-revoked.test
  .ts (auth-failure translation), wiring-policy.test.ts (arg repair).

github_repo_manager (8 files):
- plan-tools.ts x2: purpose ('create or connect a GitHub repository') + keyword
  (github → github_repo_manager).
- PlanningEngine.ts x5: repo-analysis fast-path → github_repo_manager(analyze)
  (:2385/:2389) — VERIFIES the registry.ts:179-180 comment claim (see G2).
- AgentOrchestrator.ts: DETERMINISTIC_TOOLS member (protected from weak-model
  re-decision; header comment documents the real past silent-discard of
  analyze and this fix) + SERIAL_TOOLS regex member (serialization).
- ToolService.ts x2: alias IN (github_create_repo → action=create) and alias
  OUT (action=push → git_ops). No push-through-repo-manager path survives.
- Manual test: verify_tool_reach.ts.

github_pr (3 files): plan-tools purpose ('open a pull request') + keyword map
('pull request'/pr → github_pr). Registered; no executor-side gate found.

github_actions (3 files): plan-tools keyword ('github actions' → github_actions).
Real workflow-file generator (node-ci/deploy-vercel/docker-build/test-and-
deploy); honest list_runs refusal routes to github_repo_manager (:57-63).
Registered; no executor-side gate found.

git_local_workflow (3 files):
- PlanningEngine.ts x2: early-GitHub-local-work contract → import_project +
  git_local_workflow (:1190-1209), gated on explicit branch/commit/docs
  deliverables in the request (fail-closed for analysis-only).
- Contract COMPATIBLE: planner passes input {request}; tool requires `request`
  (inputSchema required:['request']).
- AgentOrchestrator.ts: DETERMINISTIC_TOOLS + SERIAL_TOOLS (git_ prefix).
- Pinned by import-project.test.ts:118 (steps[1] local_git_workflow).

PhaseExecutor: ZERO refs to any git name — no executor-side gate, block, or
verification-selection regex touches this family (neutral-positive: nothing
to trip on, nothing family-specific verified at execution layer).

## Findings

- G1 (alias-only PRIORITY slot, LOW): 'github_create_repo' sits in
  PRIORITY_TOOL_NAMES (tool-picker.ts:13) but is NOT registered — byName.get
  misses (tool-picker.ts:44-51), so the LLM never receives it as a provider
  tool. Direct calls still resolve via the ToolService alias (:542-546), and
  the planner keyword map routes 'github' straight to github_repo_manager, so
  user-visible impact is ~nil. Same class as the browser-slice web_search /
  image_generate wasted-slot note. Fix (NVIDIA-owned): drop the slot or add a
  planner-side alias entry; do NOT touch ToolService behavior.
- G2 (POSITIVE — comment claim verified): registry.ts:179-180 "github_repo_
  manager is what the repo-analysis fast-path routes to" is TRUE on f40 bytes
  (PlanningEngine.ts:2385,2389). No stale-comment repair needed.
- G3 (POSITIVE — cross-layer repair verified): AgentOrchestrator.ts:27-34
  documents a real silent discard of github_repo_manager(analyze) by the
  weak-model picker and its DETERMINISTIC_TOOLS fix. Planner → orchestrator
  contract is consistent on f40 bytes.

## Classification summary (git family, f40)

- FULLY_WIRED (registered + deterministic-planner-visible, same bar as the
  browser slice): 5 (git_ops, git_local_workflow, github_repo_manager,
  github_pr, github_actions).
- IMPLEMENTED_NOT_REGISTERED: 0. REGISTERED_NOT_PLANNER_VISIBLE: 0.
- PARTIALLY_WIRED: 0. DUPLICATE: 0. UNKNOWN: 0.
- github_pr / github_actions have no observed runtime consumer in f40 bytes
  (planner-routable + executable on demand); re-check under live dirty bytes
  at integration time.

## Ownership / non-overlap

NVIDIA dirty lane (17 tracked paths, HEAD f40 intact) touches NONE of the 5
git tool definitions. It DOES touch PlanningEngine.ts / plan-tools.ts, so
planner-ref counts must be re-verified against live dirty bytes before any
repair. Muse records findings ONLY — no implementation, no competing edit.
G1 repair owner: NVIDIA; Muse re-reviews fixed bytes.

## Repro

python tmp/wiring-git-f40/refcount.py  (ROOT = frozen full f40 tree)
