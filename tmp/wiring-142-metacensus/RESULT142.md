# WIRING-142: live registry-metadata census (alias integrity + permission defaults)

HEAD=81371ddc (muse/joe-development) · DATE=2026-10-02 · METHOD=live tsx
metadata read of the real registry + TOOL_ALIASES. ZERO DISPATCH: no
executeTool call, no firewall context needed, no network, no writes, no
registry mutation. Synthetic test-only JWT + JOE_TEST_MODE (config import
requires it, same as 141).

## Live verdict (clean pair run1+run2, 2x EXIT 0, byte-identical SHA256 49E8BE05...)

- Registered tools: 163, unique names: 163, duplicateRegistrations: 0.
  Reaching probe end is itself live proof of the fail-at-startup duplicate
  guard (registry.ts throws at import on any dup).
- Registry line both runs: `[ToolRegistry] Registered 163 tools (71 revived).`
  Set-hash continuity with 139/140/141 holds (163/71).
- Alias integrity: 28 aliases, 0 broken targets, 0 shadowed keys. Live-load
  confirmation of the wiring-policy.test.ts pins on this exact tree.
- Permission defaults: 21 tools (5 write / 16 read / 0 internet):
  - WRITE-defaulted (5): alert_manager, cache_manager,
    project_state_manager, template_manager, web_page_builder.
  - READ-defaulted (16): ambiguity_resolver, ask_user,
    business_logic_parser, central_answer, chaos_test_plan,
    cloud_cost_estimator, compliance_validator, echo, form_inbox,
    json_query, monitoring, multi_agent_debate, project_planner,
    request_analyzer, self_confidence_evaluator, shell_check_status.
- Rate-limit defaults: 2 tools (central_answer, web_page_builder -> 30/min).
- Unknown-permission drops: 0. Shape-bad definitions: 0/163 (every tool
  carries name + permissions[] + sideEffects[] + numeric rateLimitPerMinute
  post-enforcement).
- sideEffects census: 89/163 declare empty sideEffects (enforceContract
  filters invalid entries but never defaults sideEffects).
- Intersection: 19/21 permission-defaulted tools also declare empty
  sideEffects. The 2 exceptions declare se=[write]: alert_manager,
  project_state_manager.

## Effective-permission distribution (163, post-enforcement)

- execute:14, execute+internet:6, execute+internet+read+write:1,
  execute+internet+write:3, execute+read:6, execute+read+write:7,
  execute+write:9, internet:32, internet+read:4, internet+read+write:1,
  internet+write:5, read:41, read+write:14, write:20. No tool has an
  empty effective set (enforcement guarantees >= 1).

## Audit findings

- OBS-142-1 (P3, hygiene, PROPOSED, no code this cycle): 3 write-defaulted
  tools with empty sideEffects — web_page_builder, cache_manager,
  template_manager — carry write attribution ONLY from the PERMISSION_HINTS
  name regex. Pin explicit permissions at their definition sources (behavior
  unchanged, attribution no longer a guess). alert_manager and
  project_state_manager already declare se=[write]; they need only the
  permissions pin. Overlaps definitions owned across lanes; no Muse edit
  without an ownership decision.
- OBS-142-2 (P4, record): the 16 read-defaulted names above are pinned live
  as the standing under-grant watchlist (Codex's "potential under-grant
  risks, not proven defects" stands). No defect claimed; no re-probe needed
  until the registry changes.
- 28/28 alias integrity is recorded continuity, not a new OBS (test-pinned
  already; now also live-proven on this tree).
- OBS-141-1 (P3 doc) + OBS-141-2 (P2 wiring) from 141 remain PROPOSED and
  untouched by this probe (no dispatch, no executor refs read).

## Disclosed probe misses (environment/invocation, zero source impact)

- Attempt 0 (not kept, files overwritten by real run1): PowerShell `^&`
  inside the cmd chain set literal `&` into env values so tsx never ran
  (two empty logs); foreground rerun then showed tsx EPERM creating its
  IPC dir under the sandbox user's real TEMP. Corrected: inherited
  $env:TEMP/$env:TMP pointing at tmp/cache-tsx-142 + `&&` chain. Kept
  run1/run2 are the clean pair; cache dir REMOVED after runs.
- Stdout carries the same 2 prefix lines as 141 ([Config], [ToolRegistry])
  before the canonical JSON; pair equality covers the full bytes.
- stderr pair differs ONLY in importMs (8156 vs 12286, volatile timing).
  Registry default notes identical to 141 (21 defaulted, 2 rate-set).

## Evidence

- tmp/wiring-142-metacensus/probe-meta.mts (zero-dispatch census design)
- tmp/wiring-142-metacensus/run1/run2.stdout.log (49E8BE05..., byte-identical) + stderr logs
- Tracked tree verified CLEAN (0 dirty) before the first kept run and after
  all runs. api/data untouched (latest writes Oct 1). No source, runtime,
  worker, or NVIDIA state touched. Zero strays outside tmp/ (9 non-tmp
  untracked paths are all pre-existing issue86/jest-cache artifacts).
