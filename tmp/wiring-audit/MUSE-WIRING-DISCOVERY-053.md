# MUSE wiring discovery checkpoint 053 (2026-10-01, HEAD 35bdf710)

Scope: cross-review of shared JOE-ORPHAN-AND-LEGACY-REGISTER O001-O007
against CURRENT source in BOTH trees + executed alias-guard verification +
dormant-16 locate attempt #2. Read-only; zero source edits anywhere.
Main tree read-only (dirty work preserved, untouched).

## 1. O001 grep_search — register recommendation CONFIRMED, detail STALE;
## Muse 047 self-correction (WITHDRAWN claim)

- Register (2026-09-29) says: alias grep_search -> search_files, KEEP_AS_ALIAS.
- CURRENT Muse HEAD: TOOL_ALIASES grep_search -> 'search_text'
  (api/src/modules/services/ToolService.ts:217) + hand-redirect :526-528
  + registry.ts:329 comment "stays UNregistered on purpose" + guard in
  wiring-policy.test.ts:56-58 asserting search_text against the REAL table
  (imported from ToolService, :24). Main tree identical: grep_search ->
  'search_text' + same redirect (Select-String verified).
- The alias was repointed search_files -> search_text AFTER the register was
  written ("They used to point at search_files... The wiring audit caught
  it", ToolService.ts:213-216). Register detail stale; KEEP_AS_ALIAS stands.
- SELF-CORRECTION: Muse 047 claimed "Tree-wide references: exactly ONE (its
  own export), verified git grep". FALSE at current HEAD: 20+ references
  (ToolService x6, registry comment, plan-tools callers, 4 test files,
  system-prompt/tool-picker/catalog docs). 047's git-grep evidently failed
  (same sandbox git-ownership failure mode observed this cycle) and the
  empty result was misread. 047 IMPLEMENTED_NOT_REGISTERED=1 is WITHDRAWN:
  grep_search is INTENTIONAL_ALIAS (reachable via alias), not orphan.
- Revised F48-census reading: 0 tool-shaped orphans from the 047 method once
  grep_search is reclassified. Full census re-baseline (047 probe re-run)
  NOT done this cycle — next step, owner: Muse discovery lane.

## 2. F53-A (NEW, executed): tool-aliases.test.ts is stale yet GREEN —
## two suites assert contradictory mappings, both pass

- tool-aliases.test.ts keeps a LOCAL ALIASES copy asserting
  grep_search -> 'search_files' (:20, :51). Its header claims "Kept in step
  with the table in ToolService by the assertions below" — but NO assertion
  compares against the real TOOL_ALIASES; all checks run the local copy
  against the registry only. search_files IS registered, so it passes.
- wiring-policy.test.ts:53-65 asserts grep_search -> 'search_text' against
  the REAL imported table — and passes.
- Executed (HEAD 35bdf710, OFFLINE/JOE_TEST/NODE_ENV=test, ephemeral
  test-only JWT, TEMP redirected to tmp/sbx-temp-053):
  - tool-aliases.test.ts: PASS 5/5 (10.7s)
  - wiring-policy.test.ts -t 'alias|CONTENT|shadow': PASS 3/3, 173 skipped
  Both green, contradictory mappings — proven.
- Full wiring-policy run (same env): 17 failed / 164 passed (82.6s). The 17
  are literal-source-assertion drift (e.g. :2444 dist-copy pattern),
  UNRELATED to aliases, pre-existing at this HEAD (zero source edits this
  cycle). Do NOT cite full-suite green; alias subset is 3/3.
- Repair-backlog candidate P2: make tool-aliases.test.ts import TOOL_ALIASES
  (or delete it as superseded by wiring-policy). Owner UNASSIGNED; no
  implementation (discovery lane read-only). Same staleness shape as the
  c71f6d81/doc drifts: tests that snapshot instead of importing.

## 3. F53-B (NEW): image_generate -> generate_image redirect is BROKEN on
## BOTH trees; hand-redirect class is unguarded

- Muse tree: ImageGenerationTool.ts is a SINGLE const export
  (name 'generate_image'); zero references to GenerateImage/ImageGeneration
  under api/src/modules/tools/ (registry never imports it).
- Main tree: registry.ts:15 imports ImageGenerationTool but NEVER uses it
  (single match = import only; no 'generate_image' string, no safeNew).
  File content byte-identical shape to Muse (single const, dall-e-3 +
  pollinations fallback).
- Both ToolService files redirect image_generate -> generate_image (:551-553)
  onto an UNREGISTERED name; tool-picker.ts:13 offers 'image_generate' to
  the model. Register O002/O003 core claim (implemented, never registered)
  CONFIRMED shared; its "two classes" detail is WRONG in both trees.
- Coverage gap: wiring-policy "no alias points at nothing" checks
  TOOL_ALIASES only, NOT the hand-written `if (name===...)` redirects, so
  this broken chain is green-by-construction. Same guard family as F53-A.
- Repair-backlog candidate P1: register generate_image OR remove redirect +
  picker mention; needs paid-key/pollinations policy decision (overlaps
  register U001). Owner UNASSIGNED.

## 4. O004/O006/O007 — orphan status REFUTED (Muse-unique wired work)

- Files EXIST, TRACKED, committed in 94394552 ("wire shop/live-data/image
  QA specialists into app-audit"), live at api/src/core/quality/
  (shop-qa.ts, live-data-qa.ts, image-semantic-qa.ts) — NOT under
  definitions/ as the register says, NOT untracked.
- Imported by production app-audit.ts:30-32 + covered by
  domain-qa-specialists.test.ts:4,17-19. Reclassify: WIRED-INTERNAL
  (downstream app-audit reachability already established by existing
  consumer; full canonical-path proof is app-audit's scope, not this item).
- Absent from main tree (filename scan) → Muse-unique, NEEDS_REVIEW for
  integration via normal handoff path. No action this cycle.

## 5. O005 nvidia_provider — NOT FOUND in current main tree

- Filename scan of D:\Joe\xelitesolutions\api\src: zero *nvidia* files
  (also zero *shop-qa*/*live-data*/*semantic-qa*). Was untracked at
  register time, so git cannot show its fate. Needs NVIDIA confirmation:
  moved / integrated / dropped? Reclassify UNKNOWN (was MEDIUM untracked).
- Note: main api/src has no providers/nvidia.ts either (Muse tree has
  api/src/core/llm/providers/nvidia.ts + nvidia-provider-contract.test.ts).
  Filename-scan evidence only; no content claim about provider support.

## 6. Dormant-16 locate attempt #2 — still UNLOCATED

- Team-tree filename scan for *dormant*: no artifacts. *priority* hits are
  unrelated (snapshots, scheduler ps1). 051's missing artifacts
  (TOOL-PRIORITY-DYNAMIC-20260929.md / probe-dormant-tool-priority.mts)
  still not found.
- OBSOLETE_REGISTRATION stays UNKNOWN. Next step unchanged: regenerate the
  16-name list from main (U004 TOOL_NAME_RESOLUTION reference) or request
  the source artifact from the audit owner. NOT done this cycle (bounded
  scope: orphan cross-review first).

## 7. Counts / dispositions from this checkpoint

- IMPLEMENTED_NOT_REGISTERED (047 scope, corrected): grep_search
  reclassified INTENTIONAL_ALIAS (was: orphan). generate_image is the live
  implemented-not-registered case (shared, both trees) — replaces it.
- REGISTERED_WITHOUT_USE (new shape): main registry imports
  ImageGenerationTool without registering it (dead import).
- TEST_DRIFT: 1 stale-green suite (tool-aliases) + 1 unguarded redirect
  class (hand-written, incl. 1 broken chain).
- OBSOLETE_REGISTRATION=UNKNOWN (unchanged). D001/L001-L003/I001-I003/
  U001-U004: not re-verified this cycle (out of scope).
- No repair attempted (discovery lane read-only). Findings feed
  JOE-WIRING-REPAIR-BACKLOG reconciliation by the audit owner.

## 8. UI-001 feasibility + observation-review status (this cycle)

- Health probes: :5000 OK (uptime 63545s, no-commit-file), :5002 OK
  (uptime 36967s, no-commit-file), :5101 DOWN. Same stand as prior cycle:
  shared runtimes stale-healthy, refresh unauthorised, no local Muse
  runtime → no UI rerun justified. UI-001 stays PENDING/BLOCKED.
- Observation review (fallback STATUS=REVIEWED_BY_MUSE, APPROVE_WITH_CHANGES)
  zero-drift re-verified: main plan-tools:948, PhaseExecutor:2326-2327
  (2-arg, defect present), AgentLoop:1047; Muse PhaseExecutor:2355-2357
  gate present, plan-tools:932/943, AgentLoop:1175. Shared import pending
  (sandbox write denied); fallback stands, no reaffirm needed.
