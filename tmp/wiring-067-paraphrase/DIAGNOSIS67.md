# Muse wiring checkpoint 067: git/memory paraphrase robustness (MUSE, 2026-10-01)

Follows 065 (7/9 HIT, git+memory MISS) and 066 (root-caused both misses).
Method: read-only tsx probe tmp/wiring-067-paraphrase/probe67.ts — same harness
as 065 (capableTools(request, 8), markers validated against registry).
4 git paraphrases + 4 memory paraphrases + 2 HIT regressions + 1 negative.
Test-only JWT_SECRET for the import chain; no tools executed, no network.
No code changed (audit mode).

## Results (results.json; registered=163 unchanged)
- git-v1-push "Push my changes...": MISS (declined, top empty)
- git-v2-branch "Create a new branch...": MISS (declined, top empty)
- git-v3-explicit "Show me the git status...": HIT (github_repo_manager 8, git_ops in top)
- git-v4-commit-neutral "Commit all changes ... update readme": MISS (declined)
- mem-v1-recall "Recall what I told you...": HIT (recall_memory 5)
- mem-v2-save "Save my dark mode preference...": MISS (browser_save_pdf 5 wins on 'save')
- mem-v3-remember-q "What do you remember...": MISS (declined, top empty)
- mem-v4-explicit "Search your memory...": HIT (recall_memory 8)
- reg-read HIT, reg-shell HIT (065 HITs stable, harness healthy)
- negative PASS_DECLINED (decline-rather-than-guess intact)

## Interpretation
- GIT miss is SYSTEMATIC, not payload-fragile: 3/4 verb phrasings miss,
  including v4 with a neutral payload (066's 'fix parser' interaction was a
  contributor, not the cause). Only the literal word 'git' surfaces the
  family. Failure direction is DECLINE (safe), not wrong-guess — the family
  is matcher-unreachable by verb, not misrouted.
- MEMORY miss is VERB-SPLIT: 'recall'/'memory' HIT, 'remember'/'save' MISS.
  v2 reproduces 066's wrong-family-winner pattern (browser_save_pdf on
  incidental 'save'); v3 declines. 066's VOCAB_GAP (remember vs recall/memory)
  + CAPABILITY_GAP (no user-fact store tool) both confirmed.
- 065's CAVEAT is now discharged for git/memory: 5 samples per family across
  two checkpoints, same verdicts. These are stable matcher-vocabulary gaps.

## Backlog (unchanged from 066; needs proposal + consultation)
- Matcher is shared planner behavior: verb synonyms/aliases, tag-weight review,
  mention-vs-order handling — with the 065 battery + these 067 transfer cases
  as the regression gate (HITs stay HITs, negative stays declined,
  off-family winners must lose).
- User-fact store tool (if wanted): bounded proposal with privacy/security
  design first. No unbounded store.

## Audit counters (Muse tree)
- REGISTERED_TOOLS=163 (unchanged). Planner-match battery: git 1/4 HIT,
  memory 2/4 HIT (067 paraphrases); 065 + 067 combined stable.
- No counts changed; no code changed.
