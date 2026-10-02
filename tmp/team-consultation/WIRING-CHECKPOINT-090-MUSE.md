# WIRING CHECKPOINT 090 — MUSE (2026-10-02)
MODE=THREE_AGENT_COORDINATION
MUSE_HEAD=ba1cd984 (exact; verified at probe time)

## Scope: grep family (content search, fourth 086 gap)
090 executes the 089 next step for the grep family: offered `grep_search`
vs registered `search_text` (+ sibling `search_files`). Method: source reads
only (picker offer, ToolService rename :526-528 + TOOL_ALIASES table :212+,
registry, target contract + execute, lock tests). No tool executed, no
network, no source edited. Evidence: this file + cited line numbers.

## Result: dropped at offer, FULLY wired at dispatch (first clean family)
1. OFFER (picker): `grep_search` is in PRIORITY_TOOL_NAMES
   (tool-picker.ts:9) but is silently dropped by selectToolDefsForProvider
   (F-086-1 instance: `if (t)` with no else, :44-51). Neither `search_text`
   nor `search_files` is in the priority list. Planner receives the real
   tool only via tag scoring (SearchTextTool tags include search/grep;
   wantsSearch +85). Same offer-side pattern as 087/088/089.
2. DISPATCH — TWO parallel mechanisms, both converge on search_text:
   a. rename-if (ToolService.ts:526-528): search_code/find_in_files/grep/
      grep_search -> search_text. No arg coercion.
   b. TOOL_ALIASES table (:212+): grep/grep_search/ripgrep/code_search/
      search_code/find_in_files -> search_text, applied at plan cleaning
      (plan-tools.ts:234), planner guard (PlanningEngine.ts:3447) and
      dispatch fallback (:692-694).
   The 4 rename names are covered twice (harmless: rename fires first,
   alias lookup then no-ops on search_text); ripgrep/code_search rely on
   the alias table alone. Coherent redundancy, but two lists must stay in
   sync — a maintenance coupling, not a live defect.
3. REGISTRY: `search_text` IS registered (registry.ts:219,
   SearchTextTool). `search_files` registered (:217, FileSearchTool).
   `grep_search` deliberately UNregistered (:329-331). No dead end.
4. TARGET CONTRACT (UtilityTools.ts:139-163): required:[] + non-standard
   requiredAny:[['query','pattern']] (planner repair pass understands it
   per comment). query/pattern both accepted, path defaults '.', maxResults
   clamped 1..1000 (default 200). Unlike F-089-1 there is NO required-field
   gap: {} passes schema, then execute fails CLOSED with an honest ok:false
   (:167 'search_text needs a query'). Graceful, no violation.
5. TARGET IMPLEMENTATION (:165-211): REAL content search — glob file list
   (binary extensions ignored), 2MB cap, NUL-byte binary skip, escaped
   literal or real regex, per-line {file,line,text}, result clamp. The
   class comment (:128-138) documents the historical wrong-tool bug
   (aliases -> glob answered confident-empty {files:[]}) that this repair
   fixed. Not a stub.
6. LOCK TESTS: wiring-policy.test.ts:56-57 pins all 6 names -> search_text
   and 3 file names -> search_files; :44-50 pin no-broken/no-shadow aliases.
   The wiring is test-protected at the alias layer.

## Verdict
- grep family: PLANNER_INTENT_UNRESOLVED at offer (F-086-1 drop);
  FULLY_WIRED at dispatch (rename + alias + registered target +
  compatible contract + real implementation + honest failures). First
  086-gap family with zero dispatch-side gaps.
- F-090-1 (new, doc-only but actively misleading, NOT repaired): registry
  comment :329-331 still says ToolService "redirects that name to
  search_files". FALSE since the one-hop fix: both mechanisms redirect to
  search_text, and the lock test pins it. A future engineer trusting the
  comment could reintroduce the confident-empty-answer bug. Comment
  correction needs coordinated ownership (registry.ts is shared surface).
- F-090-2 (observation, minor): execute output includes `truncated`
  (:208) but outputSchema declares only {matches,total} (:161). Whether
  any consumer validates outputs strictly is UNKNOWN; no defect claimed.
- Recommended direction (backlog, coordinated ownership): fix the OFFER
  side (offer registered `search_text`, or a TOOL_ALIASES-aware picker)
  + correct the stale comment. Keep dual dispatch + per-name semantics.
- Observed for future checkpoints (not 090 scope): browse family
  (:529-531 -> browser_run), git families (:532-539 -> git_ops + forced
  operation). One family per checkpoint; no edits.

## Locks carried (not rerun: api/ registry/picker/ToolService/UtilityTools
## + plan-tools/PlanningEngine alias consumers unchanged since 086; HEAD
## moved only by docs/evidence commits; REGISTERED=163 Muse-lineage)
- 086: 57 offered / 38 resolved / 19 gaps / 28 aliases 0-broken.
- 087: image chain mapped, STALE_OR_FUTURE, residual hazard open.
- 088: github chain coherent, F-088-1 open.
- 089: read_file_tree mapped, F-089-1 open.
- 084 P4 + F-086-1 + F-088-1 + F-089-1 + F-090-1 + F-090-2obs await team
  review/ownership.

## Counters (evidence-backed only)
DISCOVERED_TOOLS=UNKNOWN (repository-wide scan incomplete)
REGISTERED_TOOLS=163 (Muse-lineage, carried from 089 probe stdout)
PRIORITY_OFFERED=57 PRIORITY_RESOLVED=38 PRIORITY_UNRESOLVED=19
PRIORITY_FAMILY_MAPPED=4/19 (image 087 + github 088 + read_file_tree 089 + grep 090)
ALIASES=28 ALIAS_BROKEN=0
ORPHANED=4 locked DUPLICATE=0 UNKNOWN=majority
REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0

## Next audit step
Contract-compare the next probable-rename family (browse -> browser_run
:529-531, or git -> git_ops :532-539 with forced operation coercion),
or the next Codex-requested bounded scope. No picker/registry/
ToolService edits without coordinated ownership.
