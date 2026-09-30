# MUSE Wiring Discovery 034 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 34)
HEAD=299fcbc8 + this checkpoint (survey/docs only, no source edits)
DATE=2026-09-30
METHOD=read-only P3/P4 review-batch triage (triage34.ps1): per-name
reference-zone hunt for the dormant-15 across api/web/docs/tests in BOTH
trees (cache/build dirs excluded) + priority-list membership + lead
declaration/registration proof; scaffold 7-case winner matrix from the
verbatim ToolService regexes; github schema-enum vs switch-case matrix;
5 deterministic-bypass anchors; top-10 giant-file symbol inventory both
trees. Filed runs A/B JSON SHA256-identical
(73DDA9A8...5B04BCFC), exit 0 each. Logs differ only in the final
"wrote <own-filename>" line (expected). Two pilot runs preceded the
filed pair and are honestly discarded: pilot-1 broke on non-ASCII bytes
(powershell.exe 5.1 reads the script as ANSI) and Select-String
-Recurse (no such parameter); pilot-2 exposed a broken [char[]] cast
(5 code points became a 9-char string, caught by fe=False on the AR
case), swallowed TopFiles log lines (captured into the return value),
and jest-cache pollution of Muse counts — all fixed (ASCII-only +
\u escapes, [char] -join, logging in main flow, cache exclusion) and
the AR case verified True with a negative control before filing.
No live process survived; no source edits; NVIDIA tree untouched
(read-only). Architecture + package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/fx-triage34/triage34.ps1 + triage34_run{A,B}.json
+ triage34_run{A,B}.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=checkpoint 33 (163/164 count reconciliation, filed in 299fcbc8).

## P3-001 triage: dormant-15 per-name verdicts (static; behavioral probes deferred)

Mechanism (F221): selectToolDefsForProvider (tool-picker.ts:44-51)
looks each PRIORITY_TOOL_NAMES entry up with byName.get(name) and
SILENTLY SKIPS misses (`if (t)`, no else, no warning, no metric).
57 entries parsed. The integrity test (tool-registry-integrity.test.ts)
pins registered-tool honesty only — nothing asserts priority names are
fulfillable. Every name below with no registered form is dead weight
that a reader (and production_sync.md) mistakes for capability.

Per-name (muse==main on every row unless noted):

PRIORITY_LIST_ONLY_SILENT_DROP (no impl, no registered lead, no other refs):
- generate_tests, generate_docs, db_inspect, command_policy_check,
  tool_create_shell, product_search (6): GAP_OR_DEAD_ENTRY. Either a
  real gap to implement, or a dead list entry to remove/document.
- shell_status: same, BUT registered lead shell_check_status exists
  (declared SystemTools.ts:1720, registry.ts:325). Needs a behavioral
  equivalence probe before alias/wire/retire.

PRIORITY_LIST + UI_DISPLAY_ONLY (CommandComposer.tsx toolUi category
map + tool-name list, identical lines 3416/3425/3479 both trees):
- check_syntax, deep_research (F225): cosmetic coverage only. A triage
  reader seeing UI refs could wrongly conclude the tools exist. Same
  GAP_OR_DEAD_ENTRY question as the pure six.

PRIORITY_LIST + REGISTERED_STEM_CANDIDATE (all leads verified
REGISTERED, not merely declared — Elite four via class construction
registry.ts:277-284, rest via named safeNew):
- business_logic ~ business_logic_parser (EliteTools.ts:76):
  EXTRA ref is the lead's own declaration line (stem substring).
- cost_estimator ~ cloud_cost_estimator (:172 decl, :193 error text,
  integrity test :49 tests the LONG name): same shape.
- self_confidence ~ self_confidence_evaluator (:262 decl, :278 error,
  capability-match.ts:40, PlanningEngine.ts:272/285 drifted-but-same
  anchor, integrity test :49): same shape.
- chaos_testing ~ chaos_test_plan (:106) + KNOWLEDGE_DOC demand
  (production_sync.md:17).
- security_scan_repo ~ secrets_scan_repo (QualityTools.ts:248,
  registry.ts:204) + KNOWLEDGE_DOC demand (:19).
- terraform_ops ~ 3 WEAK leads (docker_swarm_ops Infra:193,
  git_ops GitTools:39, kubernetes_ops Infra:145 — suffix-only overlap)
  + KNOWLEDGE_DOC demand (:18).
Verdict for all 7: EQUIVALENCE_PROBE_REQUIRED. Name similarity does
not prove contract coverage; probe each lead's inputSchema/behavior
against the dormant name's implied contract before alias/wire/retire.

Doc conflict (F222): production_sync.md:17-19 DEMANDS chaos_testing,
terraform_ops, security_scan_repo in PRIORITY_TOOL_NAMES for "God Mode"
— but F221's silent-drop makes that guarantee vacuous for unregistered
names. Doc-vs-registry conflict to resolve (implement, alias to the
lead, or correct the doc). Inherited, both trees identical.

## P3-002 triage: conditional shadows + bypass anchors

F223 github_repo_manager action=push: schema enum promises
['create','push','list','delete','analyze'] (:86, also class docstring
"push code"), but execute()'s switch (:175-190) has NO push case —
action=push falls to default and throws "Unknown action: push"
(caught -> ok:false). Matrix: create/list/delete/analyze implemented
both trees; push implemented NEITHER (IDENTICAL parity = inherited
contract defect). Auth rule verified both trees: analyze+public-repo
needs no token (canReadPublicRepo :151-155), everything else demands
github_auth_required. New batch P2-054 (remove from enum OR implement;
pushing code has approval/safety implications — decision first).

F224 scaffold_full_stack redirect: ToolService.ts:390-403 redirects
frontendish&&!backendish inputs to react_project; invisible in the
ScaffoldTool contract. 7-case matrix, both trees (redirect present
:390 both): en-frontend-only->react_project, AR-frontend-only->
react_project (proves the Arabic alternatives live), backend-only->
scaffold, both->scaffold (backendish vetoes), neither-cli->scaffold,
vite-spa->react_project, api-substring-trap ("rapid prototype")->
scaffold (clean, no false \bapi\b). Deterministic 7/7.

Bypass anchors (proposed CANONICAL-vs-FALLBACK classification needs
NVIDIA cross-review; Muse proposes only):
- hisOwnSchema entry: muse 1359/1367/1431/1434/1435, main
  1343/1351/1415/1418/1419 (drifted, same shape).
- deterministicPhasesFor: muse 646/808/1361/1498/1537, main
  638/792/1345/1482/1521 (drifted, same shape).
- frontdoor scaffold redirect: 390/645 IDENTICAL both trees.
- terminal-veto (demandsTerminalRuntime): muse :152 ONLY, main absent
  — expected Muse-only M03 delta (honest divergence, not drift).
- schema predicate (hasExplicitRecordSchema): muse 517/3290, main
  501/3231 (drifted, same shape).

## P4-001 triage: giant-file inventory (no split proposed)

Top-10 .ts-by-bytes under api/src: IDENTICAL FILE SET both trees.
Muse bytes/lines/exports/classes/imports (main delta in parens):
ReactProjectTool 563029/8928/99/1/53 (main -2731B/-45L/-1exp);
react-app-templates 362751/5801/92/0/38 (main -11366B/-190L/-1exp);
PlanningEngine 250207/3731/6/1/18 (MAIN +18548B/+430L — NVIDIA dirty
EVAL-006 work on the main side, read-only observed, not Muse);
app-blueprints 243437/3983/48/0/4 (main -3043B/-53L/-1exp);
ApiProjectTool 205328/3524/37/1/45 (identical);
ProjectPipelineTool 194223/3051/33/1/18 (main +3477B/+54L, NVIDIA dirty);
WebPageBuilderTool 189382/2869/2/1/41 (identical);
ProjectEditTool 179911/2335/27/1/15 (main -10742B/-152L/-4exp);
intelligent-router 163192/2980/44/0/9 (main -2979B/same lines);
BrowserSmartTools 154851/2126/26/25/8 (identical).
F226: size concentration confirmed (top file 563KB/8928 lines/99
exports); main-side deltas include UNCOMMITTED NVIDIA work, so no
committed-tree claim is made from the main column. Responsibility
clustering (export-name groups) is the next step, NOT a line-count
split — no file is proposed for splitting by this checkpoint.

## Counts (this checkpoint)

DORMANT_TRIAGED=15/15 (7 priority-only incl 1 with lead, 2 UI-only,
6 with registered stem candidate incl 3 doc-demanded + 1 weak-triple)
NEW_FINDINGS=F221 priority silent-drop, F222 doc-vs-registry conflict,
F223 github push mismatch, F224 scaffold redirect matrix,
F225 UI-display-only refs, F226 giant-file parity
NEW_BATCHES=P2-053 priority-list integrity gate, P2-054 github push
contract (appended to staging backlog, UNASSIGNED, no owner)
PARITY_NOTES=terminal-veto Muse-only (expected); PlanningEngine/
ProjectPipeline main-side deltas include NVIDIA dirty work
INHERITED=priority mechanism, push gap, doc conflict, redirect,
UI refs, giant set (all BOTH_PRESENT or BOTH_ABSENT by shape)

## Staging updates (this checkpoint)

- JOE-WIRING-REPAIR-BACKLOG.md: +P2-053, +P2-054; +READINESS/
  +READINESS_EVIDENCE on P3-001, P3-002, P4-001.
- JOE-WIRING-AUDIT-SUMMARY.md: checkpoint-34 line + NEXT step.
- No matrix/register/architecture change (triage verdicts feed the
  shared files at import time; dispositions unchanged).
