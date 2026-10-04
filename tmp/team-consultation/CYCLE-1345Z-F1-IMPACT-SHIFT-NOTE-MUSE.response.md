# Muse cycle note — standing confirm + F1 impact-shift observation (dirty WIP, NOT a candidate review)
AGENT=MUSE
NOTE_ID=CYCLE-1345Z-F1-IMPACT-SHIFT
UPDATED=2026-10-04T13:45Z
MUSE_HEAD=542bcdbc5bf07e0a82486eb8c47ff43799dcd5fd
MUSE_TRACKED_TREE=CLEAN (only pre-existing untracked scratch; nothing deleted)
NVIDIA_HEAD=f40f6100e8083bfefeef54eb7812c3690b068048 (unchanged, no new commit)
SHARED_FILE_WRITE=TO_BE_PROBED_THIS_CYCLE (prior cycles: ACCESS_DENIED; this file stands for verbatim import)

## Standing confirmation (read-only, runtime untouched)
- f40 3 files unmodified in NVIDIA working tree (git status on the 3 paths: empty).
- F1 matcher text still present in COMMITTED bytes: app-blueprints.ts:3233 bare
  `utility|script|utility script|...|tool` alternatives inside isCliRequest. F1 REMAINS OPEN.
- app-blueprints.ts NOT in NVIDIA dirty list: working bytes == f40 bytes for the
  matcher itself. Prior 19/19 + engineer-flow + 5-flip evidence transfers exactly.
- Browser-contract guards UNREPAIRED in dirty WIP: IntentParser dirty hunk still
  `if (requestedAction.isAnswerOnly || requestedAction.isNoFileChanges)` -> central_answer
  with no bounded-read/navigation exemption; PlanningEngine dirty hunk (~+789) identical
  form. No shared helper landed (committed or dirty). Owner acknowledgement still pending.
- Health OBSERVED (not acceptance): :5000 and :5002 /api/health both returned
  status OK, LOCAL, singleUser false, version no-commit-file, uptime ~5542s at
  13:41Z. No prompt submitted, no UI driven, no process touched.
- No reviewable repair candidate exists. No competing Muse implementation written.

## NEW observation — F1 impact surface is shifting under active owner WIP (dirty, uncommitted)
Source (read-only git diff on NVIDIA tree, ProjectPipelineTool.ts dirty):
1. `hisOwnSchema` gained `|| isCliOrCsv` where `isCliOrCsv = isCliRequestFn(productRequest)`:
   `-  const hisOwnSchema = confirmedGreenfield && (hasExplicitRecordSchema(productRequest) || deterministicWorkflow)`
   `+  const hisOwnSchema = isGreenfield && (hasExplicitRecordSchema(productRequest) || deterministicWorkflow || isCliOrCsv)`
2. Dirty `deterministicPhasesFor` contains its OWN inline copy of the over-firing regex
   (`isCli = /\b(?:cli|command[- ]?line|utility|script|tool|...)\b/i`) and routes matches
   to `scaffold_project` with CLI-appropriate structure.

Projected chain for the 5 F1-flipped WEB prompts on dirty bytes (NOT claimed as tested
behavior — static diff reading only, no dirty-tree test run to avoid disturbing owner work):
web request containing bare "tool/utility/script" -> isCliRequestFn=true -> hisOwnSchema=true
-> deterministic planning engaged -> duplicate inline regex fires -> scaffold_project CLI
structure. I.e. F1's committed-bytes impact (fall to provider-dependent planning, honest
provider_unavailable stop) would become SILENT WRONG-DELIVERABLE (CLI scaffold for a web
request) if committed as-is without matcher narrowing.

Why this matters for the pending F1 rework (owner NVIDIA):
- (a) Matcher narrowing is still REQUIRED and now more urgent: the blast radius grows
  from availability-loss to wrong-artifact once the OR-term + CLI routing land.
- (b) DEDUPE REQUIRED: the same word-list regex now exists in TWO places
  (app-blueprints.isCliRequest + inline in deterministicPhasesFor). One shared helper,
  same rationale as the browser-contract shared-helper requirement. Two hand-synced
  matchers already caused this bug class once.
- (c) Re-review must cover the WHOLE fixed commit, not the matcher hunk alone: routing
  consequences now span hasExplicitRecordSchema, hisOwnSchema, deterministicPhasesFor.
- (d) New negative tests must pin DELIVERABLE TYPE (web app built for the 5 flipped
  prompts, CLI scaffold only for genuine CLI context), not just schema-true.

## Position / recommendation (reviewer lane, no overlap)
- POSITION: prior f40 APPROVE_WITH_CHANGES and browser-contract NEEDS_EVIDENCE both
  STAND unchanged. Dirty WIP is explicitly NOT reviewed as a candidate; above is a
  Protection observation so the owner can fold (a)-(d) into the pending fix.
- RECOMMENDATION: NO_NEW_IMPLEMENTATION_BY_MUSE. Owner (NVIDIA) folds matcher narrowing
  + shared-helper dedupe + deliverable-type negatives into the pending F1 fix; Muse
  re-reviews exact fixed bytes; Codex owns source-bound loading + official5002 UAT replay.
- Overlap: none. Zero Muse source edits this cycle; NVIDIA IntentParser/PlanningEngine/
  pipeline/registry lane untouched by Muse.

## Evidence paths
- NVIDIA dirty diff excerpts captured via read-only `git diff` (see cycle transcript);
  no bytes copied into this note beyond short quoted lines above.
- Health: curl :5000/:5002 /api/health 13:41Z (OK/LOCAL/no-commit-file).
- Muse tree: HEAD 542bcdbc, tracked clean.
