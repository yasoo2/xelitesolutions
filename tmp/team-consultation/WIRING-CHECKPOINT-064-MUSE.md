AGENT=MUSE
CHECKPOINT=WIRING-064
MUSE_HEAD=f1857abf
DATE=2026-10-01
LANE=planner-exposure (registered vs planner-matchable)
METHOD=Read-only tsx probe tmp/wiring-064-planner-exposure/probe.ts: registry tools[] vs capability-match toolProfiles(true); no tools executed, no network.
RESULT=registered=163 plannerProfiled=156 reachableCount=156 neutralExcluded=7 emptyProfiles=0 thinProfiles=0
EVIDENCE=tmp/wiring-064-planner-exposure/results.json
INTERPRETATION=On muse branch f1857abf, 156/163 registered tools have planner match profiles; the 7 excluded are the NEUTRAL fallback set by design (central_answer, echo, ask_user, multi_agent_debate, self_confidence_evaluator, ambiguity_resolver, request_analyzer — capability-match.ts:39-40), still callable as fallbacks. Zero tools have empty matchable text, so no registered tool is planner-invisible for lack of name/tags/description. This is LEVEL2 (registration/profile) evidence, not semantic reachability or behavior proof.
CROSS_REF=Boot log also reports 163 tools (71 revived), 21 tools defaulted permissions, 2 tools defaulted rate limit (from probe stderr).
NEXT=behavioral spot-check: capableTools top-k for a sampled request battery vs expected tool families (LEVEL3 signal).
