# MUSE WIRING DISCOVERY 040 — behavioral P2 battery: all 53 retrievable

PROBE=tmp/wiring-audit/p2battery40.mts (read-only tsx, registry import only)
FIXTURES=tmp/wiring-audit/fx-p2battery40{A,B}/p2battery40_{MUSE,MAIN}.json
AB_BYTES=IDENTICAL both trees (fc /B no differences)
SHA256_MUSE=2430D1B0178A82EE26C357713EA6309A80B6B877D021FB5559A3E77133D685AD
SHA256_MAIN=6CC615D9E6DAB7DE8C96052678D4A5A084D8E310D22C8B2E15A2BD00F4337395
HEAD_MUSE=12eb7854 (muse/joe-development) MAIN=read-only NVIDIA worktree (dirty preserved, untouched)
ENV=process-only dummy JWT_SECRET + JOE_TEST_MODE=true + worktree-local TEMP
  (tsx default TEMP mkdir is sandbox-denied; registry import chain requires
  a JWT_SECRET value at load — dummy, never a real credential; no servers,
  no network, no provider calls during the probe)
METHOD=P2 selectToolsFor(goal, 30) executed per tree over a FIXED battery:
  A. 46 hand-written natural goals (EN + AR, diverse domains).
  B. 53 description-derived goals (tool name words + own description slice,
     the same slice toolLine() uses) = upper-bound recall control.
  Per watched name: best rank/score on hand goals, self rank/score on own
  description, plus outside-top-30 score proof where applicable.

## F19 all 53 are RETRIEVABLE — zero NEVER_RETRIEVED, both trees

On the fixed battery, every one of the ckpt-39 53 (33 retrieval-only +
20 dormant/excluded-only) ranks inside P2 top-30 on at least one natural
hand goal AND on its own description goal, in BOTH trees (MUSE 163
registered, MAIN 164 registered).

  desc self-rank avg: 1.04 both trees (all 53 in ranks 1-3).
  best hand-rank avg: 3.64 MUSE / 3.66 MAIN.
  hand best-rank distribution (MUSE): 38 in 1-3, 9 in 4-10, 6 in 11-20,
  0 in 21-30, 0 outside top-30.

No structurally unreachable tool among the 53. F14's RETRIEVAL_ONLY_
CANDIDATE label is now behaviorally confirmed as RETRIEVABLE (on this
battery) — the residual risk is per-goal phrasing sensitivity, not a
per-tool structural defect. Case closed from ckpt39 F17: recall_memory
ranks #1 (score 12.9) on the Arabic memory goal via the AR lexicon and
#10 (6.0) on the English one — memory IS P2-reachable on memory-shaped
goals in both trees.

## F20 fragile tail: 5 tools surface only weakly (IDENTICAL both trees)

Best-hand-score <= 2.0, and their best-hand goals are semantically WRONG
goals (stray-word matches), which also exposes battery-coverage limits:

  enterprise_platform_foundation  best hand r4/s1.7 on hand:notify (wrong goal)
  image_studio                    best hand r4/s1.0 on hand:email (wrong goal)
  orion_business_foundation       best hand r8/s0.8 on hand:cloud (wrong goal)
  browser_action                  best hand r14/s0.6 on hand:payment (wrong goal)
  dependency_graph                best hand r12/s0.7 on hand:report (wrong goal)

All five have desc self-rank 1 (scores 18.7-40.8), so structure is fine.
Two honest readings, both recorded: (a) my hand battery lacks a good
natural goal for foundation-generator tools (battery gap, not tool gap);
(b) browser_action on its OWN natural goal (hand:browser-act: "open the
dashboard and click the export button, then take a screenshot") ranks
only 19 at score 1.0 — the generic browser-action primitive loses to
specialists on browser-shaped goals. That one is a genuine
retrieval-quality observation, not a battery artifact: sibling checks
show dependency_graph r12/s6.0 and image_studio r10/s3.1 on their
semantically-right goals (packages/design), merely mid-list, while
browser_action is near the cut on its home turf. Recommended repair
backlog item (P2, not this lane): strengthen browser_action retrieval
(tags/description) or add a deterministic browser-primitive guard; do
NOT weaken any test to hide it.

## F21 Muse-vs-MAIN behavioral delta is nil (fully explained)

Only 3 per-name best-hand rows differ, all trivially:
  repo_run_command: MUSE r4/s6.3 vs MAIN r5/s6.3 on hand:errors —
    IDENTICAL score; one-rank shift from MAIN's 164th registry entry
    (tie-order artifact, not a behavior delta).
  execute_python: r1/s11.2 vs r1/s11.3; search_api: r1/s9.3 vs r1/s9.4 —
    IDF rounding from registry size 163 vs 164.
Fragile-tail membership, desc ranks, and all other scores are identical.
The Muse P2 deltas (local-disk demotion, tool-rerank layer) do not move
any of the 53 on this battery — expected: no battery goal names a local
folder (demotion inactive) and rerank runs downstream of selectToolsFor.

## F22 ckpt-39 OPEN LEAD CLOSED: no fifth exposure path

AgentOrchestrator.ts:27-30 mentions "a second tool selector with a short
hardcoded list" — but :707 states it is RETIRED ("A retired second
selector could replace a planned tool..."), and both live branches
execute the planned tool as-is via executeTool (:704, :715). No live
second selector exists in that file. DETERMINISTIC_TOOLS (:31-35) is
today a COERCION guard at execution (:507-511: protected tools survive
agent re-classification; unprotected ones are coerced to
browser_run/shell_execute) — it guards planned tools, it does NOT select
tools for the planner. Exposure paths remain EXACTLY the F13 four
(1 dormant). No code change; static verdict, challengers welcome.

## Counts for the wiring matrix (behavioral, both trees)

WATCHED_53=53 RETRIEVABLE=53 NEVER_RETRIEVED=0 (on this fixed battery)
DESC_SELF_RANK_AVG=1.04 HAND_BEST_RANK_AVG=3.64/3.66
FRAGILE_TAIL=5 (browser_action retrieval-fragile on home goal; 4 vague-
  description foundation/generator tools with battery-coverage caveat)
EXPOSURE_PATHS=4 (1 dormant) — fifth-path lead CLOSED
TREE_DELTA=nil (1 tie-order rank shift + 2 IDF roundings, all explained)

## F23 cross-review note

Method + probe + A/B bytes filed in this worktree for NVIDIA/Codex
challenge. "53/53 retrievable" is battery-relative by construction: the
hand battery was DESIGNED to cover the 53, so it proves reachability
(no structural zero), not universal phrasing robustness. The desc-goal
half is the ceiling control: any tool failing its OWN description would
be strongly suspect — none failed. Challenger recipe: add YOUR natural
goal to HAND, rerun the probe (two env vars documented above), and show
a watched tool dropping out of top-30 — that is a real retrieval bug
with a repro attached. The browser_action home-goal rank-19 case is the
first such exhibit, filed with numbers.

NEXT (checkpoint 41): P3 single-shot router behavioral sweep —
capabilityRoute over ACT-verb goals; measure route rate, name-hit gate
pass rate, and input-fill refusal rate per tool; check whether any of
the 53 is P3-routable (ROUTER_EXCLUDED membership says 5 are barred —
verify behaviorally).
