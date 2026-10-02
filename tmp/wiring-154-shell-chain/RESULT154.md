# WIRING-154 -- Shell/terminal-capability wiring census, live-verified (Muse independent)

MUSE_HEAD=764aa747 (tracked CLEAN, 0-line api/web delta; all 154 outputs new under tmp/wiring-154-shell-chain/ + tmp/team-consultation/)
NVIDIA_TREE=D:\Joe\xelitesolutions @ main e8fd9589 + dirty (READ-ONLY; nothing written there)
DATE_UTC=2026-10-02T18:1xZ (this cycle)
METHOD=live tsx probes (registry + TOOL_ALIASES + catalogue + resolvePlannedTool + isVerificationTool) each run 2/2 EXIT 0 byte-identical stdout; definition/registry/dispatch/ledger files READ as text. ZERO DISPATCH: executeTool never called, no shell spawned, no network, no writes, no registry mutation. Synthetic test-only JWT_SECRET (no production credentials); workspace TEMP (system temp EPERM).

## TRIGGER
Shell/terminal is the run-4b root-cause layer (planner smoke vs gate) and a
Muse-lane behavior (planner/tool + verification), but no prior wiring
increment had live-proven its registration -> planner -> verification chain
with gate-shape pins. Wiring-154 closes that gap on Muse HEAD and confirms
the NVIDIA tree carries the identical chain (read-only source check).

## LIVE CENSUS (Muse HEAD; run1.result.json + run1b pins; run1 == run2, run1b == run2b byte-identical)
- registered=163; shell-regex hits = 5 (npm_manager, repo_run_command, shell_check_status, shell_execute, terminal_manager)
- repo_run_command is a REGEX COINCIDENCE (RepoSelfCoding tool, out of scope) -> TRUE shell surface = 4
- TOOL_ALIASES shell hits: 3 (run_command->terminal_manager, bash->terminal_manager, shell->shell_execute); ZERO npm_* aliases
- PLANNER_TOOL_CATALOGUE shell hits: 2/5 (npm_manager, shell_execute)
- isVerificationTool unconditional-true: 0/5 (all false; shell verification is args-shape-dependent, by design)
- resolvePlannedTool live, 8/8 green: 4 phrases -> correct tool via meaning ('run the tests with npm test'->npm_manager, 'run a shell command'->shell_execute, 'install npm dependencies'->npm_manager, 'open a terminal'->shell_execute); shell_execute/terminal_manager exact; run_command->terminal_manager via alias; npm_install->npm_manager via meaning
- Registry log live: "Registered 163 tools (71 revived)"; 21 permission defaults + 2 rate defaults corroborated again
- registryClass: all 4 shell classes direct-new (1 each, import+new = 2 occurrences); no safeNew/createTool

## GATE-SHAPE PINS (run-4b lineage; pure ledger calls, no dispatch)
- 'npm test' -> true; 'npm run test' -> true; 'npx jest' -> true (genuine runners accepted)
- 'npm test -- --watchAll=false' -> false, CORRECT (watch flags rejected at ledger line 754; this explains the run1 gateShapes npm-test=false -- that probe command carried a watch flag, disclosed correction, binding values are the 154b pins)
- 'node index.js < sample.txt' -> false, CORRECT (run-4b class still gate-rejected: '<' fails the strict charset; the 1cf1102f-class sanitizer rewrite is the live repair, currency below)
- 'node --test' -> true, CORRECT
- npm_run/npm_test/npm_build/npm_install: all resolve -> npm_manager via meaning; none are aliases

## SOURCE READS (both lines; 3/3 shell files byte-identical)
- SystemTools.ts sha 280A2393... both lines: 10 tool names (echo, file_edit, delete_file, write_file, ls, grep_search, npm_manager, scaffold_project, shell_execute, shell_check_status); 0 inline spawn/exec markers (ShellExecuteTool.execute delegates to the visible-terminal/runner path; permissions execute/execute; redaction + long-runner timeout in source)
- TaskInteractionTools.ts sha 498E52E4... both lines: terminal_manager, read_file, ask_user; 1 spawn marker
- ToolService.ts sha F8608F51... both lines: TOOL_ALIASES run_command->terminal_manager (line 244) BUT hard-coded redirect run_command->shell_execute (line 429-431); aliases apply ONLY if (!tDef) (line 691-698), AFTER the hard redirect
- plan-tools.ts: ZERO run_command refs (no MEANS/catalogue entry; alias layer only)
- registry.ts:325-327 comment claims "the WHOLE npm_install/npm_build/npm_run alias family" -- live TOOL_ALIASES has ZERO npm_* entries (npm_* handled by hard redirect npm_run/npm_start/npm_test at ToolService 415-428 + meaning resolution)

## CLASSIFICATION (Muse independent position)
- shell_execute / npm_manager: FULLY_WIRED (registered + catalogued + meaning-resolved + gate-shape-correct)
- terminal_manager: REGISTERED, planner-reachable via exact + run_command/bash aliases (fork caveat below)
- shell_check_status: REGISTERED, exact-only (not catalogued, not aliased) -- minor reachability note, no defect claimed
- run_command: PARTIALLY_WIRED + CONTRACT_MISMATCH (planner/executor fork, live-proven both ends)

## VERDICTS / PROPOSALS (review input for NVIDIA/Codex disposition; Muse starts no patch)
- OBS-154-1 (P2): run_command planner<->executor fork CONFIRMED, both lines. Planner resolvePlannedTool('run_command') -> terminal_manager (alias); executor ToolService dispatch -> shell_execute (hard-code wins, alias never consulted since shell_execute resolves). Same surface name reaches TWO different tools depending on path. Sharpens OBS-148-2 with exact targets + precedence proof. Recommend the owner (NVIDIA ToolService/planner scope) choose ONE target in BOTH layers + a path-pair test (resolve-then-dispatch agreement). Do NOT "fix" by deleting one layer without the test -- both layers are load-bearing for other names.
- OBS-154-2 (P4): stale registry comment (registry.ts:325-327 npm "alias family"). Recommend a comment-only correction (behavior is correct via hard redirect + meaning). No behavior change.
- BATCH note: shell chain now has live Level-2/3 evidence (4 registered, 2 catalogued, 0 unconditional + 7 gate-shape pins, 8/8 resolutions); Level-6 remains UNVERIFIED -- consistent with OBS-150-2.

## CONTRACT CURRENCY (UI-001 repair still live at this HEAD)
- Tracked api/ + web/ delta vs HEAD = 0 lines (git diff --numstat empty) -> prior greens still apply to identical source: smoke-verification-rewrite 5/5 + prose 14/14 (see feas-bs lineage). No jest rerun needed; no wedge.
- Zero contract deaths in all preserved runs (run4b/run22 lineage); Gap-A/B negative integration tests remain NVIDIA/Codex-owned follow-ups, still unimplemented (NVIDIA owns ledger/planner scope, actively dirty, worker live).

## DISCLOSURES / LIMITS
- Census is Level 2-3 (registration + pure resolution + gate-shape pins + source reads); no shell was spawned, no UAT (provider-blocked, see feas-bs).
- Probe corrections disclosed: (1) repo_run_command regex coincidence pinned out-of-scope (TRUE surface 4, not 5); (2) run1 gateShapes 'npm-test' label carried a watch flag -- binding pins are the 154b four-shape set; (3) first capture used PowerShell `>` (UTF-16) + UNC cwd wedge (cmd/tsx EPERM via C:\Windows) -- reran from drive-letter api cwd with cmd.exe redirection, 2/2 EXIT 0 byte-identical (stdout hashes 13FA55D9... both runs).
- stdout framing: 2 preamble lines ([Config], [ToolRegistry]) + 1 trailing provider line; run1.result.json is the extracted pure object (11 keys).
- NVIDIA tree touched READ-ONLY (3 file hashes + 2 grep checks, 0 writes). HEAD e8fd9589, 47 changed paths, worker live; untouched.
- No source changed this cycle (docs/evidence only). Findings are review input, not implementation.
