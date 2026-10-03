# C235 nearest-fallback audit slice — full prose-form enumeration (Muse HEAD f65b74a9)

SOURCE_HEAD=f65b74a9f7703496fc5fd35d14f58b3317fa416b (muse/joe-development, tracked clean)
API_TREE=15ba650934df35f205d64ff6ff47592852eb6c43 — IDENTICAL to 9df7dd8e:api,
  so c234 MEANS (100 keys/27 targets) and contract 41/41 results carry to HEAD
  by byte-equivalence; no rerun needed. Diff 9df..f65 = 6 docs/evidence files only.
DATE_UTC=2026-10-04
PROBES=tmp/c235-nearest/nearest-probe.mts (163 tools x prose form) +
  tmp/c235-nearest/forensics-probe.mts (null forensics + exact baselines).
  Read-only; resolve names only, execute no tools. Same harness precedent as c234
  (tsx import, synthetic JWT_SECRET, MOCK_DB=true, workspace TEMP).
RESULTS=tmp/c235-nearest/probe-result.json + forensics-result.json
SCOPE=Muse lane (planner/tool behavior, source-level wiring). Zero source delta.
Closes the explicit c234 residual: nearest branch (plan-tools.ts:257-258) untested.

## Method

Per registered tool T: resolvePlannedTool("please run <T with _ -> space> for this").
One fixed prose shape — a deliberate scope boundary, not a vocabulary claim.
Null resolutions get candidate-count forensics (verbatim key/snake copies).
F-C234-1/2 re-asserted on HEAD bytes. 5 exact-name baselines pin prose-only scope.

## Counts (runtime, exact-source bound)

- REGISTERED=163, CATALOGUE=40, GAP=123 (matches c233/c234)
- GAP_PROSE_SELF=80/123 (76 via nearest, 4 via meaning)
- GAP_PROSE_MISROUTE=42/123 (ALL via meaning; ZERO via nearest)
- GAP_PROSE_NULL=1/123 (file_edit_advanced; ambiguous, fail-closed, correct)
- CATALOGUE_PROSE_SELF=35/40; 5 non-self (4 meaning misroutes + 1 ambiguous null)
- F-C234-1 (react native -> react_project) and F-C234-2 (github actions ->
  github_repo_manager) REPRODUCE on HEAD bytes.

## R-235-1 (positive wiring evidence): nearest branch surfaces 76 gap tools

76/123 gap tools resolve to THEMSELVES in prose form via how=nearest.
The c234 residual is closed with a positive answer: the nearest fallback is a
real reachability channel for most non-catalogue tools, and it produced ZERO
misroutes in this enumeration. 4 more (docker_manager, terraform_manager,
kubernetes_ops, ci_generate_pipeline) self-resolve via meaning.

## F-C235-1 (NEW, needs owner disposition): meaning-priority misroute class, 46 tools

42 gap + 4 catalogue tools resolve to a DIFFERENT tool in prose form because a
MEANS word matches inside the prose before the resolver ever reaches the
nearest branch (plan-tools.ts:249-253 runs before :257-258). This GENERALIZES
F-C234-1/2 from 2 cases to a 46-tool class:

- 29 browser-family -> browser_run (28 gap: browser_summarize/ui_fix/page_fix/
  fill_form/compare/extract_data/check_links/performance/seo_audit/console_scan/
  save_pdf/readability/contrast_audit/a11y_deep/extract_meta/translate/
  responsive_check/find_text/design_tokens/click/fullpage_shot/smart_agent/
  autofix/consent/search/launch/action/vision + user_browser; 1 catalogue:
  browser_ui_audit). MEANS 'browser' swallows all browser prose.
- 7 repo-family -> git_ops (repo_read_file/search/apply_patch/run_command/
  diff_summary + git_local_workflow + secrets_scan_repo). MEANS 'repo'.
- 3 api-family -> api_project (gap api_tester/search_api; catalogue inspect_api,
  validate_api). MEANS 'api'.
- 2 github-family -> github_repo_manager (gap github_actions = F-C234-2 repeat;
  catalogue github_pr). MEANS 'github' precedes the specific entry.
- deploy_pages -> deploy_project ('deploy'); terminal_manager -> shell_execute
  ('terminal'); docker_swarm_ops -> docker_manager ('docker').

Exact-name baselines (browser_seo_audit, repo_search, github_actions,
ai_write_file, browser_ui_audit) ALL resolve how=exact, so the defect is
PROSE-FORM ONLY: PARTIALLY_WIRED, not orphaned. Severity note: 4 catalogue
tools misroute despite being prompt-visible vocabulary. NOT repaired (audit-first).

## N-235-1 (verified correct, no action): ambiguity fails closed, 2 cases

- file_edit_advanced prose: candidates [file_edit, file_edit_advanced] -> unknown.
- ai_write_file (catalogue) prose: candidates [ai_write_file, write_file] -> unknown.
Both are the intended :258 unanimity guard. Pinned as correct behavior.

## Ownership / overlap

- plan-tools.ts remains in NVIDIA's ACTIVE dirty scope (main a10c71ab + 19-file
  dirty, read-only confirmed this cycle; no new NVIDIA bytes vs c234 check).
  Muse proposes NO repair: owner NVIDIA (or Codex-coordinated after NVIDIA's
  plan-tools work lands); Muse stays independent reviewer.
- No JOE-* shared audit file modified (Codex hold respected).

## Residuals (explicitly NOT covered)

- Only ONE prose shape tested ("please run X for this"); other shapes may differ.
- Whether a model planner ever EMITS these prose forms (prompt shows 40 tools).
- F-C234-1/2 now fold into F-C235-1; F-106-1 still awaits team review/ownership.
- Forensics harness printed complete JSON then exited 1 on teardown noise
  (same class as the known logger-teardown pattern); forensics-result.json
  re-parsed OK (704 bytes). Not a result-integrity issue.

## CRITICAL-UI lane status this cycle (same HEAD)

- Official :5002 UNREACHABLE (verified this cycle) -> fresh Real Joe UI UAT BLOCKED.
- :5000 API-only OK (uptime 43997s, no-commit-file) is NOT a substitute per team state.
- Verification-contract battery 41/41 carries to HEAD by api-tree hash equality.
- No :5101 alternate-port retry as acceptance (prior-codex safe action respected).
