# MUSE WIRING DISCOVERY 044 — ENTRY-B emitted vocabulary reconciled + F36 orphan rows

PROBE=tmp/wiring-audit/entry44.cjs (+shellexec44.cjs follow-up; static text
scan, zero Joe imports; v2 ADDED direct-executeTool('name') extraction after
hand-review caught project_repair/:2416 bypassing the `tool:` pattern)
FIXTURES=tmp/wiring-audit/fx-entry44/entry44_{MUSE,MAIN,DIFF}.json
HEAD_MUSE=839720e1 MAIN=e8fd9589 (read-only, dirty preserved, untouched)
ENV=no servers, no network, no provider calls, no source edits anywhere
METHOD=per tree: EMITTED names from ProjectPipelineTool.ts (`tool:`
literals + direct executeTool('name') + CAN_BUILD_OR_RUN + writeTools
sets) reconciled against DECLARED names (`name =/: '...'` in
definitions/) and TOOL_ALIASES keys/targets. Executor rule verified in
source: ToolService.ts:675 direct registry hit, :691-698 alias fallback
(alias target must itself be registered), :700-719 honest unknown_tool.

## F40 ENTRY-B emitted vocabulary = 20 names (MUSE), 21 (MAIN)

MUSE: ai_write_file, api_project, create_file, engineering_discovery,
file_write, inspect_directory, npm_manager, project_edit,
project_pipeline, project_planner, project_repair, project_run,
react_project, read_file, scaffold_full_stack, scaffold_project,
shell_execute, web_page_builder, write_file, write_to_file.
MAIN: same 20 + specification_verification (NVIDIA dirty EVAL-006
integration; declared in MAIN's uncommitted SpecificationVerificationTool).

## F41 ENTRY-B executor-reachability: ZERO statically unreachable (both)

Every emitted name is either DECLARED in definitions/ or resolves via a
registered alias target. Alias-resolved (both trees, identical):
create_file->write_file, file_write->write_file,
write_to_file->write_file. The write_to_file alias (an earlier audit
catch: "resolved to NOTHING") is confirmed load-bearing for ENTRY-B.
Direct-executeTool emissions (bypass phase `tool:` literals but still
flow through executeTool+firewall): engineering_discovery,
inspect_directory, npm_manager, project_planner, project_repair,
project_run, read_file (+specification_verification in MAIN).

## F42 `shell_exec` is a DORMANT_REFERENCE (both trees)

ProjectPipelineTool.ts:505 accepts `tool === 'shell_exec'` in a
normalization comparison, but exact-quoted 'shell_exec' appears NOWHERE
else in either tree: declared nowhere, aliased nowhere (TOOL_ALIASES
has run_command->terminal_manager and shell->shell_execute, but no
shell_exec entry), emitted nowhere. Consequence today: NIL (nothing
emits it). Latent hazard: any future planner emitting tool:'shell_exec'
passes pipeline normalization and dies at executeTool with unknown_tool.
Candidate P4 backlog row: add the alias or remove the comparison —
DECISION FOR LATER, no action in the read-only discovery lane.

## F43 MAIN declared+1 is NVIDIA's uncommitted draft (provenance note)

Declared-name census: MUSE 174, MAIN 175, delta exactly
{specification_verification} in MAIN's favour, sourced from NVIDIA's
untracked SpecificationVerificationTool.ts + dirty ProjectPipelineTool
integration. No other declared-name delta. MUSE has zero unique
declared names. (Counts include working-tree dirty/untracked files by
design; committed-only counts would differ.)

## Orphan-register draft rows (F36 from ckpt43)

PATH=api/src/core/orchestration/AgentLoopService.ts (MUSE:1010-1013 /
MAIN:883-area, "Unified Autonomous Planning Entry Point")
CAPABILITY=plan-only via AgentLoopService.plan() -> orchestrator.plan()
WHY_SUSPECTED=zero invocations outside its own definition body, both trees
CALLER_SEARCH=`AgentLoopService.plan` / `orchestrator.plan(` / `orch.plan(`
all .ts, both trees: 0 production callers (ckpt43)
DYNAMIC_USAGE_CHECK=bounded greps for name variants/re-exports: none found;
exhaustive string-built dispatch NOT excluded (static limit, stated)
CONFIG_USAGE_CHECK=no config/route references found
TEST_USAGE=none found (all generatePlan hits are __tests__/tests/manual for
the EXECUTE path, not plan())
GIT_CONTEXT=identical shape both trees; no recent churn (not a fresh stub)
CONFIDENCE=HIGH (CERTAIN requires a runtime loaded-module trace)
RECOMMENDATION=register as ORPHANED_ENTRY; NO removal; needs NVIDIA
cross-review + one runtime-trace confirmation before any action.

## ENTRY-scoped matrix rows (append to ckpt43 rows)

| CAPABILITY | ENTRY | STATE | EVIDENCE |
|---|---|---|---|
| ENTRY-B 20-name core vocabulary | B | FULLY_WIRED (static) | F40+F41, 0 unreachable both |
| write_to_file/create_file/file_write alias leg | B | FULLY_WIRED via alias | F41, targets registered |
| specification_verification (MAIN dirty) | B | PARTIALLY_WIRED* | F40: emitted+declared in dirty tree; committed-main reachability UNKNOWN |
| shell_exec comparison branch | B | DORMANT_REFERENCE | F42, sole mention :505 both |

*MAIN-dirty verdicts are working-tree facts, not committed-main facts.

Counts: ENTRYB_EMITTED_MUSE=20 ENTRYB_EMITTED_MAIN=21
ENTRYB_UNREACHABLE_STATIC=0/0 ALIAS_RESOLVED=3/3
DECLARED_MUSE=174 DECLARED_MAIN=175 TOOL_ALIASES=28/28
DORMANT_REFS_NEW=1 (shell_exec) ORPHAN_REGISTER_ROWS_DRAFTED=1 (plan())

## Scope honesty / NOT proven
- Static only. Declared!=registered (baseTools selection) — the probe
  checks declaration + alias-target declaration, not baseTools
  membership. A declared-but-unregistered ENTRY-B name would still fail;
  none found, but the registry-membership leg needs the runtime
  /api/tools cross-check (NVIDIA lane owns canonical ingress).
- Dynamic tool-name construction (template/string-built) not covered.
- No removal/registration action taken or recommended.

NEXT (checkpoint 45): baseTools-membership leg for the ENTRY-B 20
(registry source: which DECLARED names are actually selected into
`tools[]`) + runtime /api/tools count cross-check IF a live own-API
window exists; else continue static (ENTRY-A planner-emitted names).
