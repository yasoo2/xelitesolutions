p = r'D:\Joe\muse-worktree\tmp\wiring-audit\staging\JOE-WIRING-AUDIT-SUMMARY.md'
t = open(p, encoding='utf-8-sig').read()
anchor = 'NEXT_DISCOVERY_STEP_032=await owner assignment for READY batches (recommend P2-037 ONE-rule'
assert anchor in t, 'anchor missing'
# find end of the NEXT_DISCOVERY_STEP_032 line
i = t.index(anchor)
j = t.index('\n', i)
add = (
"\nTRIAGE_034=P3/P4 review-batch triage filed at Muse HEAD 299fcbc8, A/B JSON SHA-identical 73DDA9A8 (fx-triage34/): dormant-15 all in PRIORITY_TOOL_NAMES (57 entries) with silent-drop mechanism F221 (tool-picker.ts:44-51 no-else, unpinned by integrity test); 6 pure priority-only GAP_OR_DEAD_ENTRY + shell_status w/ registered lead; 2 UI-display-only F225 (check_syntax, deep_research, CommandComposer identical lines); 6 with registered stem candidate needing equivalence probe (F222 doc conflict: production_sync.md:17-19 demands chaos/terraform/security names); github push schema-vs-switch gap F223 (new P2-054); scaffold 7-case winner matrix deterministic both trees F224 (AR redirect live, api-substring trap clean); bypass anchors re-pinned (veto Muse-only as expected); giant top-10 set identical both trees F226 (main PlanningEngine/ProjectPipeline deltas include NVIDIA dirty work). New batches P2-053 (priority integrity gate) + P2-054. All inherited except veto. Guards green."
"\nNEXT_DISCOVERY_STEP_034=await owner assignment for READY batches (recommend P2-037 ONE-rule + verdict/receipt-class proposals + P2-053 gate + P2-054 enum decision first; quick wins P2-034/P2-016/P2-027); equivalence probes for the 6 stem candidates as checkpoint 35 (fixture-contained, no live network); planning/memory trunks remain NVIDIA-coordination-blocked; DUCKAI/CLI/calculator exact-diff reviews on standby"
)
t = t[:j] + add + t[j:]
open(p, 'w', encoding='utf-8-sig', newline='').write(t)
print('summary updated OK')
