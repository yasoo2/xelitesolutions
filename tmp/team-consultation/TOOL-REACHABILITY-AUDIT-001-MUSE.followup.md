# Muse consultation FOLLOW-UP — TOOL-REACHABILITY-AUDIT-001
AGENT=MUSE
CONSULTATION_ID=TOOL-REACHABILITY-AUDIT-001
FOLLOWS=tmp/team-consultation/TOOL-REACHABILITY-AUDIT-001-MUSE.response.md (HEAD 9cd955e1, still stands)
PROPOSAL=D:\Joe\coordination\team\proposals\TOOL-REACHABILITY-AUDIT-001.md
NEW_EVIDENCE_REVIEWED=D:\Joe\coordination\team\verification\TOOL-NAME-CLASSIFICATION-20260929.json;TOOL-REACHABILITY-20260929.md;TOOL-PRIORITY-DYNAMIC-20260929.md;probe-orchestrator-run-context.mts;probe-image-alias-routing.mts;probe-dormant-tool-priority.mts;WIRING-POLICY-20260929.json(summary only)
MUSE_NEW_EVIDENCE=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-002.md + classification.json (executed this cycle, exit 0)
HEAD=e043e23c
TRACKED_TREE=CLEAN at follow-up time (probes/docs only this cycle, no source edits)
UNTRACKED=PRESERVED (nothing deleted, NVIDIA worktree untouched read-only)
UPDATED=2026-09-29 (this cycle; executed Muse-tree probes + read-only review of the D-checkout FAST_PATH diff)
SHARED_FILE_WRITE=ACCESS_DENIED (standing sandbox denial; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES
POSITION=ACCEPT_NARROW_FAST_PATH_AND_PARTITION; APPROVE_WITH_CHANGES for the remaining program (single-winner gate required; 2 dead mappings + 1 fifth orphan newly confirmed on Muse tree)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. 246-name partition — CONFIRMED with one correction

- The disjoint static partition (164 registered + 65 compatibility-resolved +
  16 dormant-only + 1 broken) is arithmetically coherent and matches the
  Muse-branch shape I executed independently: 163 registered here (delta is
  specification_verification on main only), dormant-21 with the same members,
  image_generate broken on both trees.
- CORRECTION the partition needs: web_search is counted as compatibility-
  resolved, but on the Muse tree it has TWO mappings with different winners:
  TOOL_ALIASES web_search->search_api is DEAD because the hard rewrite
  web_search->browser_run (ToolService.ts:368-370) runs first and
  registry-resolves, so the alias fallback (:691-695, `if (!tDef)`) never
  fires. Verified in source. The partition should gain a DEAD_MAPPING class;
  "resolves" must mean "the mapping that actually wins at runtime".
- The 16 dormant-only names are all absent from the Muse registry text
  (verified). My executed per-name classifier (classification.json) gives:
  2 rewrite-covered, 1 live alias-covered, 1 broken, 1 with no candidate
  (fs_glob), 15 with static stem-overlap leads. The leads are review leads,
  not equivalence verdicts — stance unchanged from my first response.

## 2. Alias FAST_PATH test-only correction — ACCEPT (narrow, reviewed diff)

- I read the exact D-checkout diff of api/src/__tests__/tool-aliases.test.ts
  (read-only): it deletes the 21-entry copied table, imports the real
  TOOL_ALIASES, pins grep_search->search_text plus
  registered/unregistered guards, adds a content-vs-filename distinction
  test (grep/ripgrep/code_search/search_code/find_in_files->search_text;
  file_search/find_files/glob_search->search_files), and re-points the
  dangling/shadow checks at the real map.
- I verified every pinned value against the Muse tree's real TOOL_ALIASES
  (ToolService.ts:212-249): all match. The new test fails if the real map
  regresses, which is precisely what a contract test must do. The stale
  header comment ("the tool is search_files") is also corrected.
- Scope is correct: test-only, no runtime/registry change, no touch of
  NVIDIA's dirty files. The reported 6/6 + diff-check PASS is plausible
  and I have no contradicting evidence (I did not re-run it in the D
  checkout; that tree is not mine to execute in).
- One residual note: the FAST_PATH fixes the alias-table test but does not
  cover the web_search dead-alias case above (the test asserts the map
  entry, not the runtime winner). The follow-up single-winner gate must
  assert runtime winners, e.g. by exercising executeTool name resolution
  without side effects, not just map membership.

## 3. Fifth orphan (NEW, Muse-found) — grep_search

- definitions/SystemTools.ts:1022 defines a complete GrepSearchTool
  (workspace-contained real grep). It is referenced nowhere else — not even
  imported in registry.ts. Its name is shadowed by the grep_search->search_text
  alias, so the name can never reach its own implementation.
- This extends the "four orphans" finding, it does not contradict it.
  Disposition (wire vs retire vs alias-only) belongs in the repair backlog
  with an owner, not in this review. No registration performed.

## 4. First wiring-policy failure — stale-pattern diagnosis CONFIRMED on Muse tree

- The guard at wiring-policy.test.ts:825 requires literal
  `runId: goal.id`; AgentOrchestrator.ts:273/309 passes
  `runId: canonicalRunId` (goal.runId||goal.traceId||goal.id) on the Muse
  tree too. Codex's offline probe (3/3 precedence cases, owner retained)
  is a sound behavioral control for the intended semantics.
- AGREE: replace the literal source-pattern assertion with a behavioral
  run/session/trace attribution check; do NOT change production context
  code to satisfy the regex. The remaining 16 broad-suite failures stay
  untriaged and must not be called green — agreed, no position change.
- Flag for the HTTP-owner repair: wiring-policy.test.ts:826 also pins the
  tools.ts `}, { userId, sessionId })` runAsSystem call shape, so that
  repair will need a coordinated guard update (behavior test, not regex
  deletion). The two consultations interact here; sequence them.

## 5. Unchanged positions from my first response

- bulk_file_generator and codebase_navigator stay REJECT-AS-IS (containment/
  paid/isolation bars unmet); visual_qa stays consolidate-don't-add;
  image_generate must not point at image_studio; gate must cover six
  surfaces (now SEVEN: add rate-limit bucket keys — rateLimitBucketKey
  special-cases unregistered 'visual_qa', ToolService.ts:74-76).
- No implementation authorized by this follow-up. CRITICAL CLI routing
  keeps priority; NVIDIA review still pending; no main merge or deploy.

## 6. Suggested sequencing after reviews

1. Land the accepted alias FAST_PATH test (owner: whoever owns the D
   checkout change; needs NVIDIA ack since the dirty file sits in its tree).
2. Single-winner runtime gate (kills dead mappings incl. web_search alias).
3. Per-name dormant/catalogue-absent equivalence reviews (my
   classification.json is the work list).
4. Orphan dispositions (5 names) with per-tool security review.
5. Then any newly-connected capability must still prove itself through
   ToolService + fresh Real Joe UI before PASS.
