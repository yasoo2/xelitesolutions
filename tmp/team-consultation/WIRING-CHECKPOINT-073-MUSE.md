# Muse wiring checkpoint 073 — alias-layer resolution: 3 layers mapped, 1 new orphan, 1 planner-visible gap, 1 stale-green test, 1 refutation
MUSE_HEAD=db4be6a8
DATE=2026-10-01
SCOPE=read-only alias/target resolution on current Muse HEAD (ToolService if-chain + TOOL_ALIASES + plan-tools sanitizer + registry + tool-picker). No source edits (audit-first rule).

## Method
- Read ToolService.ts 195-249 (TOOL_ALIASES table), 477-553 (if-chain rewrites), 674-720 (dispatch lookup + alias fallback).
- Read registry.ts 1-340 in full; extracted declared `name` fields from 9 definition files (not safeNew labels — labels lie, see W73-4).
- Traced TOOL_ALIASES consumers (plan-tools.ts:234, PlanningEngine.ts:3443-3447, ToolService.ts:692).
- Ran wiring-policy + tool-aliases + integration-audit suites (TEMP/cache redirected to workspace): 211/228 pass; alias locks green; 17 unrelated failures listed below.

## Finding W73-1: three alias layers, all if-chain targets resolve (MAPPED, healthy)
Layers in plan->execute order: (1) plan-tools.ts:234 sanitizer maps plan tool names via TOOL_ALIASES; (2) ToolService if-chain pre-lookup rewrites (12 target names); (3) ToolService.ts:691-698 fallback: on registry miss, consult TOOL_ALIASES and adopt the target if registered.
All 12 if-chain targets verified against DECLARED tool names (not labels): file_edit, read_file (SafeReadFileTool's name IS read_file), dependency_audit, quality_run, project_detect, website_full_pipeline (see W73-4), inspect_directory, search_text, browser_run, git_ops, github_repo_manager, generate_image (KNOWN DANGLING per W72-1 — only broken if-chain target).
PRIMARY_STATE per layer: CONNECTED except the known generate_image orphan.

## Finding W73-2: codebase_navigator — IMPLEMENTED_NOT_REGISTERED #4 (new, ORPHANED)
- IMPLEMENTED=YES: CodebaseNavigatorTool.ts declares name 'codebase_navigator' with a real async execute() (action/targetDir/query/limit/pattern).
- IMPORTED=YES: registry.ts:16. REGISTERED=NO (absent from revivedTools and baseTools — full-list read).
- RUNTIME HANDLES IT DEAD: ToolService session-injection (~562) and risk classifier (~198) name-match it, but dispatch can never reach it (unknown_tool).
- No policy blocker visible (read-only navigator over workspace) — unlike generate_image (paid/remote) and bulk_file_generator (containment). Repair (NOT done): register + focused tests + gates. P1.

## Finding W73-3: tool-aliases.test.ts is stale-green + 4 stale comments (TEST_ONLY/doc drift, P2 hygiene)
- The test pins grep_search/grep/ripgrep/code_search/search_code/find_in_files -> search_files in a LOCAL const and asserts the const against ITSELF (line 51), never importing the real TOOL_ALIASES — while its docstring claims "this checks the table against the actual registry rather than against itself". Suite PASSES (verified this cycle) on the old wrong mapping.
- The REAL table (grep_search -> search_text) is correct per the wiring-audit note ("used to point at search_files... answered {files:[]}... caught it"), the live manual check (verify_tool_wiring.ts:103-106 expects real content search), and wiring-policy.test.ts locks (lines 44/49/57 — verified PASSING this cycle against the real export).
- Stale search_files references: integration-audit.test.ts:35-37, registry.ts:329-331, ToolService.ts:681-682, verify_full_system.ts:135-136.
- Risk: false confidence — a regression back to search_files would be "confirmed" by tool-aliases.test.ts. Repair (NOT done): make the test import the real table; sync 4 comments. No live breakage today.

## Finding W73-4: REFUTATION — web_pipeline is NOT dangling; registry labels mislead (cosmetic, P4)
- Initial hypothesis (web_pipeline -> website_full_pipeline dangling) REFUTED: WebPipelineTool's DECLARED name is 'website_full_pipeline' (WebDevelopmentTools.ts:35) and that object IS registered — safeNew('web_pipeline') is a log label only. Calls via either spelling resolve. Planner-visible "website_full_pipeline" (tool-picker.ts:8) resolves directly.
- Same label/name drift: safeNew('dev_server') registers the object named 'dev_server_start'. Bare 'dev_server' has no production callers (only the label + a test regex at live-code-stream.test.ts:85) — no live breakage, audit noise only.
- Repair (NOT done): rename the two safeNew labels to the declared names.

## Finding W73-5: shell_status PLANNER_VISIBLE_NOT_EXECUTABLE (new, P2)
- tool-picker.ts:11 offers "shell_status" to the planner. The registered tool is named 'shell_check_status' (SystemTools.ts:1720). No if-chain entry and no TOOL_ALIASES entry map shell_status -> shell_check_status (both lists fully read). Planner selecting it dies with unknown_tool (suggestion engine may offer shell_check_status, but the step still fails).
- Repair (NOT done): one TOOL_ALIASES row + focused resolve/execute test. Bounded.

## Adjacent observation (out of slice, needs triage)
- wiring-policy "a plan may only name tools that exist :: the executor checks again, because a phase can arrive from anywhere" FAILS: a literal-source assertion expects `if (!resolved.tool)...execution: 'skipped'...continue;` in executor source. Cannot distinguish stale lock from real executor-contract drift without behavioral probing — queued for a plan/executor-contract slice, possibly UI-001-adjacent. The other 16 wiring-policy failures are unrelated literal-source areas (templates, feed server, chat history, schema, roles, domain packaging).

## Suite evidence (this cycle, Muse HEAD, redirected TEMP/cache)
- wiring-policy: 159/176 (17 fail, all listed above; alias locks "no alias points at a tool that does not exist" + "no alias shadows a registered tool" PASS).
- tool-aliases: all PASS (stale-green per W73-3). integration-audit: all PASS. Combined: 211/228.

## Classification delta
- codebase_navigator: ORPHANED (IMPLEMENTED_NOT_REGISTERED #4; joins generate_image, visual_qa, bulk_file_generator).
- shell_status: PLANNER_VISIBLE_NOT_EXECUTABLE (PARTIALLY_WIRED family).
- web_pipeline/website_full_pipeline: CONNECTED (refutation recorded; label drift P4).
- No global count changes claimed. No repairs performed (audit-first).
