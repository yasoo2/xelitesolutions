# WIRING-146: planner tool-name reference census (ProjectPlannerTool.ts)

HEAD=e7629598 (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
census + live recall diagnostic: registry + resolvePlannedTool +
TOOL_ALIASES + PLANNER_TOOL_CATALOGUE imported live (same as
143/144/145); the planner file is READ as text (never imported, never
executed). Census step: every quoted tool-shaped literal AND every
vocabulary-matching naive-regex-span token is resolved live through the
executor's OWN resolver. Recall step (NEW this cycle): EVERY word token
in the file is intersected live against
registered ∪ aliasKeys ∪ catalogue to close the bare-word blind spot.
ZERO DISPATCH: no executeTool, no firewall context, no network, no
writes, no registry mutation. Synthetic test-only JWT + JOE_TEST_MODE.
Deterministic stdout (canonical JSON, sorted); volatile timings on
stderr only.

## Live verdict (clean pairs, byte-identical)

- Census pair run1+run2: 2x EXIT 0, SHA256 3C3062E2... identical.
- Recall pair recall1+recall2: 2x EXIT 0, SHA256 A22DAC97... identical.
- Planner file: 1732 lines (python-verified), sha 399bb699...,
  131121 bytes on disk, pure CRLF (1731/1731 breaks).
- Registered tools: 163 (continuity with 139-145). Census vocab
  (registered ∪ aliases ∪ catalogue ∪ static `name:` hits): 203.
  Recall vocab (registered ∪ aliasKeys ∪ catalogue): 191.
- Census: 24 vocab names = REGISTERED_EXACT 19 + ALIAS_KEY 1
  (edit_file) + DANGLING_DECLARED 4 (app, express, mobile, next)
  + REGISTERED_NONEXACT 0 + DANGLING_UNDECLARED 0.
- Recall gap: 10 bare-word tool refs the census scanners cannot see,
  ALL REGISTERED_EXACT live: auto_tester, browser_run,
  code_reviewer, deploy_project, doc_generator, echo, npm_manager,
  phase_executor, read_file, test_generator.
- TRUE planner tool surface = 34 distinct names (29 exact + 1 alias
  + 4 audited coincidences). Zero unregistered tool names referenced.
- Non-vocabulary literals, fully listed: 8 underscore + 43 plain.
  Underscore: existing_workspace,
  no_implementation_artifacts_after_contract_recovery, not_run,
  not_started, plan_scope_insufficient, planner_only,
  planner_unavailable_or_invalid, unportable_native_dependency —
  all run-state/status words. Plain 43: all status/schema/prompt
  words (args, phases, deliverables, greenfield, dashboard,
  warehouse, console, sass, node, python, ...), zero tool names.
  Full lists in the logs.
- Equals-style `name = 'xxx'` def-site cross-check: 165 names; the
  single nonVocab intersection ("description") is HTML
  meta/textarea selector noise at 8 sites (verified by read), not a
  tool. Real nonVocab def-name hits = 0.
- Planner-only rule HOLDS for this file: zero executeTool anywhere
  (search-verified); the planner references tools but dispatches
  none, consistent with the canonical pipeline.

## Context audit (every name verified by direct source read)

- Self-name: project_planner :34 (`name = 'project_planner'`).
- Plan-shape validation Sets/comparisons (comparing task.tool
  strings, never dispatching): :1076, :1185-1186, :1196
  (hasBrowserAuditableArtifact), :1530-1534 + :1553
  (countImplementationArtifacts) — scaffold_project, react_project,
  web_page_builder, ai_write_file, write_file, file_edit, edit_file
  (alias-tolerant matching), project_edit, file_edit_advanced,
  scaffold_full_stack, api_project, mobile_builder, auth_builder,
  db_schema_migrator.
- Plan construction (emitting task objects in the constrained
  frontend fallback, :1651-1669): decide_capability_route,
  search_public_apis, react_project.
- Prompt prose + JSON schema examples (instructing the model;
  :848, :850, :852, :854, :912, :914, :934, :936, :965, :967, :977,
  :979, :1006, :1021-1022, :1214, :1225, :1588, :1594): ai_write_file,
  write_file, scaffold_project, scaffold_full_stack, react_project,
  api_project, web_page_builder, mobile_builder, npm_manager,
  project_run, shell_execute, terminal_manager, read_file,
  doc_generator, test_generator, auto_tester, deploy_project,
  code_reviewer, browser_run, echo.
- Output prose (:716 nextStep handoff sentence): phase_executor.
- Coincidences (English/framework words, NOT tool refs):
  app = regex path alternatives (:1184, :1619), regex word
  alternatives (:1053, :1055, :1175), prompt example JSON (:1594);
  express/next = stack-detection regex alternations (:1041, :1065);
  mobile = quoted word inside a code comment (:1046). Their
  `declaredIn` sites (MobileBuilderTool.ts:447 etc.) are
  naive-pattern noise; none is a tool definition site.
- Known-unregistered names absent: bulk_file_generator, visual_qa,
  image_generate, generate_image occur ZERO times in this file.

## Audit findings

- OBS-146-1 (P4, record, PROPOSED, no code): pin the planner
  tool-reference baseline for this file at HEAD e7629598 — TRUE set
  = 34 (29 exact live + edit_file alias + 4 audited coincidences;
  class split above). Any future "planner references unknown tool X"
  claim against this file must reproduce census+recall before
  opening a wiring defect. Sibling to OBS-144-1 (executor, TRUE=2)
  and OBS-145-1 (orchestrator, TRUE=3).
- OBS-146-2 (P4, method, PROPOSED, no code): the quoted+span census
  has a bare-word blind spot — 10 planner refs (incl. echo and
  phase_executor) are visible ONLY to full-token recall. The 144/145
  "exactly N" claims share this blind spot and must get the same
  recall recheck before being treated as exhaustive. Method fix
  (applied here): every file census ships with a recall diagnostic.
- No new wiring defect. Registry <-> resolver <-> planner-refs are
  consistent: every planner tool reference resolves exact live
  (or via the documented edit_file alias).
- Methodology caveats (disclosed): (a) the naive `name: 'xxx'`
  static pattern matched only 16 names (same set as 144/145) and is
  corroborating-only; 140b remains the def-site authority; the
  equals-style scan (165 names) is likewise noisy (HTML selector
  hits). Zero-hidden-tool verdicts rest on live registry membership
  + live resolvePlannedTool + full-token recall, not on static
  patterns. (b) On dense template lines the q-vs-rx bucket is
  heuristic (prose slashes such as React/Vite/Next/Expo pair into
  naive /.../ spans); line attribution is exact (empirically
  re-verified this cycle on :854/:977/:1006), verdicts are
  bucket-independent.

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (not kept): the tool `workdir` parameter resolved to a
  UNC (\\?\) path and cmd.exe refused it ("UNC paths are not
  supported", access denied). Fixed BEFORE any kept run: plain
  Set-Location with a drive-letter path + absolute script/log paths
  (same miss class as 145 attempt-0, disclosed there too).
- Attempt 1 (diagnostic one-liner, not kept): a node -e recall sketch
  died to PowerShell single-quote nesting (parser error, node never
  ran, zero strays). Rewritten as committed recall-146.mts and run
  as a clean pair instead.
- Attempt 2 (comparison artifact, not kept as evidence): api/data
  pre/post manifest diffs of 6088 then 1560 rows were Compare-Object
  type/serialization artifacts (CSV strings vs live ints/dates;
  directory rows). Corrected: files-only normalized string compare
  = prefiles 2264, postfiles 2264, filediff 0. api/data untouched,
  proven.
- Intermediate read-only parses of run1 (exec-16) failed on the
  known 2-line stdout prefix + a stale-cwd .NET call; caused zero
  reruns (run1 file itself verified byte-identical afterwards).
- stderr pairs differ ONLY in importMs (volatile timing,
  stderr-only). Registry default notes identical to
  141/142/143/144/145 (21 defaulted, 2 rate-set). Stdout carries
  the same 2 prefix lines before canonical JSON ([Config],
  [ToolRegistry]).

## Evidence

- tmp/wiring-146-planner-refs/probe-plannerrefs.mts (census design)
- tmp/wiring-146-planner-refs/recall-146.mts (recall design)
- tmp/wiring-146-planner-refs/run1/run2.stdout.log (3C3062E2...,
  byte-identical) + stderr logs
- tmp/wiring-146-planner-refs/recall1/recall2.stdout.log
  (A22DAC97..., byte-identical) + stderr logs
- tmp/wiring-146-planner-refs/pre-data-manifest.csv (api/data
  pre-run manifest; post-run files-only compare = 0 diffs)
- Tracked tree verified CLEAN (0 dirty) before the first kept run
  and after all runs. api/data untouched (2264/2264 files
  identical). No source, runtime, worker, or NVIDIA state touched.
  tsx cache dir REMOVED. Contained data/+logs/ dirs under the
  evidence dir only (probe-cwd artifacts, same as 145).
