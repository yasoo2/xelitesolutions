AGENT=MUSE
CHECKPOINT=WIRING-065
MUSE_HEAD=efe79c45
DATE=2026-10-01
LANE=planner-match (capableTools top-k vs expected family, LEVEL3)
METHOD=Read-only tsx probe tmp/wiring-065-capable-tools/probe.ts: capableTools(request, 8) over a 12-case battery; family markers validated against the registry (zero-match marker => SETUP_INVALID, never fail). Test-only JWT_SECRET for the import chain; no tools executed, no network.
RESULT=registered=163; 7 HIT (browser/read/write/npm-test/shell/search/react) / 2 MISS (git/memory) / 1 family-covered-with-name-orphan (image: image_studio HIT, generate_image still absent from registry) / 1 PASS_DECLINED (gibberish => []) / 1 OBSERVED (multi-verb whole-rank mix). Zero SETUP_INVALID.
EVIDENCE=tmp/wiring-065-capable-tools/{probe.ts,results.json,stderr.txt,raw.txt}
INTERPRETATION=MISS means "this phrasing did not surface the family in top-8", not "family unreachable": the LLM planner can select tools directly; capableTools only widens reach. git: "Commit all changes ..." surfaced browser_*fix (via "fix") + business_logic_parser (via "parser") — "commit" matched no git profile (git_local_workflow/git_ops/github_* exist). memory: "Remember that the user prefers ..." surfaced notify_user/user_browser (via "user") — recall_memory (sole memory tool) not surfaced. image: image_studio registered+matched, so the IMAGE family is match-reachable; the checkpoint-063 orphan finding is refined to the exact name generate_image (still unregistered). Negative control confirms decline-rather-than-guess. This is LEVEL3 (match layer) evidence, not execution proof.
CAVEATS=Single English sample per family; markers are Muse-chosen substrings. Broaden phrasing before treating git/memory as wiring defects.
NEXT=066: git/memory paraphrase variants (robustness) and/or profile inspection (why commit/remember miss); keep LEVEL4 execution spot-checks for HIT families.
