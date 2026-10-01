# Wiring audit checkpoint 059 — P2 offered-sets at current HEAD (2026-10-01, Muse)

MUSE_HEAD=06909957. MAIN=e8fd9589 (+14 dirty, read-only, untouched). Mode:
read-only discovery; no production source changed anywhere. Offline
in-process probes (tsx import registry+toolCatalog only); no servers,
no network, no provider calls, no tool executions.
Probes: tmp/wiring-audit/offered59.mts + score59.mts; battery
fx-offered59/battery59.json (65 fixed goals copied verbatim from
p3sweep41.mts: P3TARGET 14 + MINPAIR 5 + HAND 46); fixtures
fx-offered59/offered59_{MUSE,MAIN}.json + score59_{MUSE,MAIN}.json.

## Method
- Per goal: selectToolsFor(goal, 30) (toolCatalog.ts:186-220: CORE_TOOLS
  first, then score>0 until 30). Record per-goal offered name sets.
- Union offered names per tree; diff vs that tree's registry names.
- score59: for each never-offered name x 65 goals: scoreTool score +
  raw rank among all registered (browser-only local-folder demotion does
  not touch these 5 names, so raw ranks hold for their own scores).

## Proven this cycle
P1. OFFERED UNION (65-goal battery, top-30): MUSE 158/163, MAIN 159/164.
    offeredNotRegistered (phantom) = 0 BOTH trees. Per-goal counts 14-30
    both trees: the topK cap AND the score>0 filter both bind (e.g.
    target:symbols offers only 14: just 14 tools score >0 there).
P2. NEVER-OFFERED identical BOTH trees (5):
    ambiguity_resolver, ask_user, echo, ls, self_confidence_evaluator.
P3. ZERO vs CROWD-OUT mechanism (score59, both trees identical except
    noted rank 37<->38 IDF effect):
    - ask_user: score 0 on ALL 65. True retrieval zero on this battery
      (no goal mentions asking the user; interactive fallback by design).
    - ambiguity_resolver: 0 on 63; >0 on 2 but crowded out below cutoff.
      (Caution: its raw "best rank 9" is a ZERO-score alphabetical
      artifact — bestScore 0. Ranks on zero-score goals are meaningless;
      only the 2 pos-goal misses count, both crowded out.)
    - echo: 0 on 64; 0.9 on target:translate ("text" desc hit), rank 36:
      crowded out.
    - ls: 0 on 63; 1.0 best on hand:todo, raw rank 26: crowded out
      (9 CORE + 21 higher non-core fill the 30 before it).
    - self_confidence_evaluator: 0 on 63; 1.4 best rank 37/38: crowded out.
P4. TREE DELTA (offered sets): onlyMAIN = {specification_verification},
    offered on 8 main goals (target:packages, pair:short, pair:vague,
    hand:memory-recall/docs/mobile/packages/ci). The NVIDIA dirty-tree
    registration IS P2-planner-visible in main. onlyMUSE = {} (empty).
    Retrieval verdicts otherwise identical: the 164th registry entry
    moves no other name across the offered boundary.
P5. Class-local metadata verified (not file-first misattribution):
    EliteTools.ts:206/262, SystemTools.ts:660/982,
    TaskInteractionTools.ts:239. All 5 have descriptions, so the
    line-188 description filter is NOT their miss cause.

## Finding
F-059-1 P2_RETRIEVAL_REACH_LOWER_BOUND: on the fixed 65-goal battery,
96.9% of registered names (both trees) are offered to the planner at
least once with zero phantom offers. The 5 misses are BATTERY-COVERAGE
gaps (4 low-score crowd-outs + 1 interactive tool with no matching
goal), NOT orphan evidence: each is registered, described, and
scoreable. PLANNER_VISIBLE lower bound established for 158/159 names;
full PLANNER_VISIBLE still needs broader batteries + P3 route +
deterministic-path coverage (unchanged next steps).

## Counts (proven vs unknown — no invention)
OFFERED_UNION_MUSE=158/163 OFFERED_UNION_MAIN=159/164 PHANTOM_OFFERED=0
NEVER_OFFERED_65GOAL=5 (identical both trees, mechanism-solved above)
DISCOVERED_TOOLS=UNKNOWN EXECUTABLE_TOOLS=UNKNOWN FULLY_WIRED=UNKNOWN
PARTIALLY_WIRED=UNKNOWN ORPHANED=UNKNOWN (registry-level corroborations
stand: bulk_file_generator + generate_image IMPORTED_NOT_REGISTERED)
DUPLICATE=UNKNOWN REPAIRED=0 VERIFIED=0 REAL_JOE_PROVEN=0.

## Next discovery step
Targeted retrieval goals for the 5 (name-word + desc-word goals, e.g.
"ask me which region", "echo back", "list directory entries") to move
each from never-offered-on-65 to retrievable-or-truly-zero; then
EXECUTABLE probe (dispatch/firewall reachability) for the offered set.
Owner: Muse lane. No repair proposed (discovery only).
