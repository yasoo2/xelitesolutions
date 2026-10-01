AGENT=MUSE
CHECKPOINT=WIRING-067
MUSE_HEAD=ef01fb9d
DATE=2026-10-01
LANE=planner-match (capableTools paraphrase robustness, LEVEL3)
METHOD=Read-only tsx probe tmp/wiring-067-paraphrase/probe67.ts: capableTools(request, 8) over 11 cases (4 git + 4 memory paraphrases, 2 HIT regressions, 1 negative); markers validated vs registry. Test-only JWT_SECRET; no tools executed, no network. No code changed (audit mode).
RESULT=registered=163; git 1/4 HIT (only literal 'git' hits; push/branch/commit-neutral all MISS-by-decline); memory 2/4 HIT ('recall'/'memory' hit, 'remember'/'save' miss, one wrong-winner browser_save_pdf); reg-read HIT, reg-shell HIT, negative PASS_DECLINED. Zero SETUP_INVALID.
EVIDENCE=tmp/wiring-067-paraphrase/{probe67.ts,results.json,raw.txt,stderr.txt,DIAGNOSIS67.md}
INTERPRETATION=065/066 MISS verdicts are systematic, not phrasing-fragile: git verbs (push/branch/commit) miss even with neutral payloads; memory splits by verb (recall hits, remember misses). Git failure direction is safe DECLINE; memory shows one more wrong-family winner (save->browser_save_pdf). 065's single-sample caveat is discharged for these families (5 samples each over two checkpoints). Repair stays BACKLOG: matcher is shared planner behavior needing proposal + consultation; 065 battery + 067 transfers are the regression gate.
CAVEATS=English verb samples; marker-substring method unchanged from 065. LEVEL3 (match layer), not execution proof.
NEXT=068: LEVEL4 execution spot-check for a HIT family, or next audit lane per CRITICAL wiring command (planner-exposure already 064; registry reconciliation is NVIDIA's lane).
