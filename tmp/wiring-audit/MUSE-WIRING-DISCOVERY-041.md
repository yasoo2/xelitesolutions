# MUSE WIRING DISCOVERY 041 — P3 single-shot router behavioral sweep

PROBE=tmp/wiring-audit/p3sweep41.mts (read-only tsx, registry+toolCatalog import only)
SCHEMA_DUMP=tmp/wiring-audit/dumpschema41.mts (registry required-field dump)
FIXTURES=tmp/wiring-audit/fx-p3sweep41{A,B}/p3sweep41_{MUSE,MAIN}.json
HEAD_MUSE=ec71fcd8 (muse/joe-development) MAIN=read-only NVIDIA worktree e8fd9589 (dirty preserved, untouched)
ENV=process-only dummy JWT_SECRET + JOE_TEST_MODE=true + worktree-local TEMP
  (no servers, no network, no provider calls)
METHOD=capabilityRoute(goal) executed per tree over FIXED batteries, each goal
  twice: CTX0={} and CTX1={previewUrl,workspaceRoot}:
  A. 14 crafted P3TARGET goals (act verb + distinctive tool-name words).
  B. 5 MINPAIR gate-attribution goals (noverb/short/vague/nobuild/ar-inspect).
  C. 46 ckpt40 HAND natural goals (route-rate + 53-routability).
  D. 32 EXCL goals (act verbs + one excluded tool's own name words).
  Staging uses the tree's OWN scoreTool/goalTerms/inputForTool. ACT_VERB and
  ROUTER_EXCLUDED are source-extracted from BOTH trees at probe runtime with
  a byte-identity assertion (no trust in prior static claims). Name-hit is a
  PROXY (substring, no weight rule — MAIN weight is private), labeled PROXY.

## F24 deterministic P3 is behaviorally IDENTICAL both trees (65 goals x 2 ctx)

Route verdicts match on ALL 65 goals under BOTH contexts: diffs=0.
  ctx0: target 5/14, pair 0/5, hand 0/46 — both trees.
  ctx1: target 7/14, pair 0/5, hand 9/46 — both trees.
Runtime premise asserted by the probe itself: ACT_VERB bodies identical,
ROUTER_EXCLUDED bodies identical (32 names). Registry 163 vs 164 moves no
P3 verdict (IDF deltas below every gate threshold here, unlike ckpt40 P2).
SCOPE: this is the SYNC capabilityRoute both trees share. Muse PRODUCTION
additionally tries capabilityRouteAsync (tool-rerank.ts:329: sync first,
unchanged when it fires; LLM second opinion only on sync-refused goals,
still verb+exclusion+fill gated). MAIN has sync only (PlanningEngine:1807).
The LLM layer needs a model and is NOT probed offline — filed, not claimed.

## F25 the input-fill gate is the dominant refusal stage, not name-hit

HAND ctx0 histogram (both trees): verb-pass 25/46, score>=8 40/46, but
fill-true only 6/46 — and handRouted 0/46. With CTX1, 9 hand goals route,
ALL to sensible specialists: browser_click, browser_fullpage_shot,
browser_translate, browser_seo_audit, browser_responsive_check,
browser_summarize, browser_contrast_audit, browser_design_tokens, rss_fetch.
P3 is CONTEXT-GATED by construction ("cannot feed it -> do not call it"):
without previewUrl/workspaceRoot in the planner context, URL/path tools
honestly refuse. Whether PlanningEngine:1818's runtime context actually
carries previewUrl/workspaceRoot/sessionId is a RUNTIME-TRACE follow-up
(static call-site shows context threaded through; contents unproven here).

## F26 fill vocabulary gap is structural and general (per-field evidence)

Required fields outside {url-ish, query-ish, projectpath-ish} are NEVER
filled, so high-scoring distinctive tools refuse even WITH context
(all proxy-name-hit TRUE, score 9-18.3, route NULL under ctx1):
  secrets_scan_repo/16.4  requires [path]
  npm_manager/16.7        requires [command]
  inspect_symbol/11.3     requires [filePath, symbolName]
  performance_profile/10.5 requires [filePath]
  code_reviewer/12.8      requires [files]
  video_action/9          requires [action, inputFile, outputFile]
`path`/`filePath`/`files`/`action`/`command`/`symbolName` have no filler.
CORRECTION (self-caught): browser_translate requires ONLY [url] (target
is optional) — ctx0 refusal was the missing URL, ctx1 ROUTES. An earlier
draft note claiming it unroutable was wrong; schema dump overturned it.
REPAIR LEAD (P2 backlog, not this lane): extend the fill vocabulary with
explicit per-field extractors (quoted/local-path spans -> path/filePath;
file lists; action/command enums) or give tools requiredAny alternatives;
each addition needs negative tests (no credential/descriptor stuffing).

## F27 gate load-bearing verdicts (behavioral, both trees)

ACT_VERB gate: LOAD-BEARING. pair:noverb (same SEO content minus verb)
  scores browser_seo_audit/11.4 fillable yet routes NULL — the verb alone
  decides. pair:nobuild (build intent, no verb) likewise NULL.
INPUT-FILL gate: LOAD-BEARING + ISOLATED. unfill probe: alert_manager
  requires [action]; goal names it distinctively (best 11.8); route NULL.
  target:api-test shows the gate SAVING a wrong route: stray 'checkout'
  match scores payments_create_checkout_session/18.3, fill refuses.
NAME-HIT gate: NEVER BINDING on 65x2 sweeps — zero cases of
  (null + verb + score>=8 + fillable). Unproven load-bearing; may be
  redundant with (score>=8 + fill) or live only for adversarial phrasing.
  Challenger recipe: goal where best.score>=8, inputForTool non-null,
  route NULL, and only the weight>=0.5 name rule explains it.
LENGTH gate (<6): NOT ISOLATED — pair:short dies on score too (5.6<8);
  no natural short goal reaches score>=8. Static-only.
ARABIC verbs: ALIVE — pair:ar-inspect passes the verb gate (dies honestly
  at fill: best repo_run_command/10.8 unfillable). NOTE: an Arabic
  inspect-page goal surfaces a SHELL tool, not a browser tool — retrieval
  quality observation, same class as ckpt40 browser_action rank-19.

## F28 ROUTER_EXCLUDED holds: 0 violations, 24/32 load-bearing

All 32 exclusion goals: ZERO routes to the named excluded tool, both trees.
24 are DEFLECTED_LOADBEARING (excluded tool WOULD rank #1 unfiltered on its
own name-goal; the fence deflects a would-be winner). 8 are DEFLECTED_MOOT
(api_project, project_pipeline, deploy_project, website_full_pipeline,
write_file, file_edit, go_builder, bulk_file_generator — wouldn't win even
unfiltered; fence holds vacuously there). The 5 ckpt39 exclusion-only names
(go/java/python_builder, progressive_generator, website_full_pipeline) stay
P3-unroutable as designed; whether their DETERMINISTIC paths own them is a
separate (non-P3) wiring question.

## F29 only 1 of the 53 is P3-routable on this battery

watch53Routed={dead_code_detector} (requires [], routes on the
refactor-dead goals). The other 52 never P3-route here: 20 are verb/dead
by design or fill-blocked, 33 retrieval-only stay P2-only. P3 is NOT a
backstop for the retrieval-dependent set — it serves URL/query-shaped
specialist calls. No P3 exposure change recommended for the 53; the F26
vocabulary repair would move a few (secrets/inspect/symbols) honestly.

## Counts for the wiring matrix (behavioral, both trees, deterministic P3)

P3_ROUTE_RATE_CTX0=target 5/14, hand 0/46 | P3_ROUTE_RATE_CTX1=target 7/14,
  hand 9/46 | PAIR_NEGATIVES_HOLD=5/5 both ctx | EXCL_VIOLATIONS=0
  EXCL_LOADBEARING=24 EXCL_MOOT=8 | WATCH53_P3_ROUTED=1
  FILL_GATE_DOMINANT (hand fill-true 6/46 ctx0) | NAMEHIT_BINDING=0 observed
  TREE_DELTA=nil (0/130 verdict diffs)
FILL_VOCAB_GAP_TOOLS=7 named with required fields (F26) + alert_manager.

## F30 cross-review note + method fix during run

First A-run reported premise FALSE — a probe regex bug (ACT_VERB head
spanned into ROUTER_EXCLUDED via `])`, and the `export ` keyword prefix
was compared). Fixed to capture-group bodies + loud failure on empty
extraction + shape assertion; reran A/B green. Route verdicts never
depended on the extraction (tree's own functions), only stage labels did;
all numbers above are from the FIXED probe. Challenger recipe: add YOUR
goal to P3TARGET/HAND, rerun both trees (env at top), show a verdict
delta or a name-hit isolate — repro attached or it didn't happen.

NEXT (checkpoint 42): P4-dormancy re-verification — resolve the ckpt39 S12
caveat (dynamic-require production caller hunt for tool-picker) + trace
what context PlanningEngine:1818 REALLY passes at runtime (log-grep a live
run's planner context keys; read-only, no runtime restart).
