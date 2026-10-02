# WIRING-153 -- Browser-capability wiring census, live-verified (Muse independent)

MUSE_HEAD=4ac4a8e3 (tracked CLEAN, 0-line api/web delta; all 153 outputs new under tmp/wiring-153-browser-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T17:5xZ (this cycle)
METHOD=live tsx probes (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool) each run 2/2 EXIT 0 byte-identical stdout; definition/registry/dispatch files READ as text. ZERO DISPATCH: executeTool never called, no browser launched, no network, no writes, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials); workspace TEMP (system temp EPERM).

## TRIGGER
Browser is a Muse-lane capability (browser/runtime) with 10 definition files and
a shared WORKERS=1 claim (services/joe-browser-worker), but no prior wiring
increment had live-proven its registration -> planner -> verification chain.
Wiring-153 closes that gap on Muse HEAD and confirms the NVIDIA tree carries
the identical chain (read-only source check).

## LIVE CENSUS (Muse HEAD; run1.result.json + run1b pins; run1 == run2 byte-identical)
- registered=163; browser-ish registered = 35 (34 regex hits + visual_compare via safeNew, outside the regex)
- 25/25 BrowserSmartTools names registered (single-file multi-tool pattern; registry imports per-tool classes)
- TOOL_ALIASES lookup: 0/35 browser names aliased (no alias entries)
- PLANNER_TOOL_CATALOGUE browser hits: 3/35 (browser_run, browser_ui_audit, web_page_builder)
- isVerificationTool unconditional-true: 7/35 (browser_check_links, browser_console_scan, browser_contrast_audit, browser_performance, browser_responsive_check, browser_run, browser_ui_audit)
- visual_qa: registered=false, verificationUnconditional=true (probe-153b, 2/2 EXIT 0 byte-identical)
- resolvePlannedTool live: 'open the page in a browser' -> browser_run (meaning); 'take a screenshot of the page' -> screenshot (nearest); 'check the browser console for errors' -> browser_run (meaning, NOT browser_console_scan); 'audit the page UI' -> unknown; 'fix the page' -> unknown; 'browser_run' -> exact; 'visual_qa' -> unknown
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults + 2 rate defaults (central_answer, web_page_builder) corroborated again

## SOURCE READS (both lines; NVIDIA tree read-only, 10/10 definition files byte-identical)
- VisualQATool: name='visual_qa' (VisualQATool.ts:13, object-literal `name:` style); registry occurrences=2 (single import line, class+path) with NO createTool/new/safeNew -> IMPORTED BUT NEVER REGISTERED (orphan), both lines
- NVIDIA ledger carries visual_qa in its 13-set too -> allowlisted-but-unregistered on BOTH lines
- DeployPagesTool + WebPageBuilderTool: registered via createTool() (registry.ts:298,300), not new/safeNew
- ScreenshotTool.ts exports 2 tools (screenshot + visual_compare via VisualComparisonTool, safeNew lines 164-165)
- PageFixTool declares browser_page_fix, registered (direct new), not verification-accepted
- Browser worker: services/joe-browser-worker exists; manager.ts connects only when BROWSER_WS_ENDPOINT is set (env-gated, else local launch); 6/10 def files route via browser/manager (BrowserAction/Run/Smart/Vision-launch-opts, Screenshot-launch-opts, PageFix); no default worker process; no BROWSER_WS_ENDPOINT probe against live env (secrets out of scope)

## CLASSIFICATION (Muse independent position)
- visual_qa: ORPHANED + CONTRACT_MISMATCH (2nd live-proven case after generate_image; allowlist accepts a name the executor cannot run)
- 25 smart browser tools: REGISTERED, planner-reachable only via exact names/meaning (3/35 catalogued)
- browser_console_scan / browser_page_fix / browser_ui_audit-by-phrase: PARTIALLY_WIRED at planner vocabulary (registered but natural phrases miss or misroute)
- joe-browser-worker: CONDITIONAL infrastructure (exists, env-gated; not a default runtime path)

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-153-1 (P2): visual_qa allowlisted-but-unregistered. Recommend the owner (NVIDIA ledger/registry scope) choose exactly one: (a) register visual_qa + catalogue/MEANS entry + planner selection tests, or (b) remove it from the unconditional allowlist (falsely green verification gate otherwise). Extends OBS-149-2 (name-level IMPLEMENTED_NOT_REGISTERED challenge: now 2 live-proven orphans). Shared REGISTERED_WITHOUT_IMPLEMENTATION=0 is untouched; the inverse gap class is uncounted.
- OBS-153-2 (P3): browser QA planner vocabulary gap. 'audit the page UI'/'fix the page' resolve unknown; console-scan phrase misroutes to browser_run. Recommend MEANS/catalogue entries for browser_console_scan, browser_ui_audit, browser_page_fix (NVIDIA-owned planner scope) + negative phrase tests. No TOOL_ALIASES misuse (0 entries today; keep it that way unless a true synonym exists).
- OBS-153-3 (P4): worker reachability documentation. WORKERS=1 stands as infrastructure, but the matrix should record the BROWSER_WS_ENDPOINT env-gate (no default local worker path) instead of implying an always-on runtime worker.
- BATCH note: browser chain now has live Level-2/3 evidence (35 registered, 3 catalogued, 7 verification-true); Level-6 remains UNVERIFIED (no Real-Joe PASS run cited) -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-br lineage). No jest rerun needed; no wedge.
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + pure resolution + source reads); no browser was launched, no UAT (provider-blocked, see feas-br).
- Probe method corrections disclosed: (1) browser regex missed visual_compare (pinned separately in 153b); (2) registryClass check covered only new/safeNew, missing createTool wiring for DeployPages/WebPageBuilder (corrected by source read); (3) defDetail `name =` regex missed object-literal `name:` style in VisualQATool (corrected by source read). All corrected values above are the binding ones.
- PowerShell 5.1 capture notes: local api/node_modules/.bin/tsx.cmd used (npx fetch EPERM); Out-File -Encoding utf8; run1.stdout.json carries 2 preamble + 1 trailing provider log lines (run1.result.json is the extracted pure object); run1b has the same framing (no separate result file; stdout quoted verbatim in this RESULT).
- NVIDIA tree touched READ-ONLY (10 file hashes + 3 grep checks, 0 writes). HEAD e8fd9589, planner/executor/pipeline/EVAL-006 scope dirty, worker live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
