# Muse wiring checkpoint 072 — media/QA registry reconciliation: 2 IMPLEMENTED_NOT_REGISTERED + 1 corroboration
MUSE_HEAD=5274a277
DATE=2026-10-01
SCOPE=read-only registry reconciliation for image/media tools on current Muse HEAD (registry.ts 399-line + ToolService + ledger + PhaseExecutor name-pattern consumers). No source edits, no registration performed (audit-first rule).

## Method
- registry.ts membership enumerated by direct read: imports (lines 14/15/18) vs revivedTools (138-225, all 60+ entries read) vs baseTools (227-340, all entries read).
- Cross-references via scoped Select-String over api/src (*.ts) and web/src (*.ts/*.tsx) for `generate_image` and `visual_qa`.
- Consumer call sites read in full context (ToolService session-injection + rate-limit + alias block; ledger isVerificationTool + fingerprint gate; PhaseExecutor revision trackers).

## Finding W72-1: generate_image — IMPLEMENTED_NOT_REGISTERED, dangling alias
- IMPLEMENTED=YES: api/src/modules/tools/definitions/ImageGenerationTool.ts (plain ToolDefinition object, name `generate_image`, real execute(): OpenAI dall-e-3 when OPENAI_API_KEY present, else free remote Pollinations fallback; permissions [execute, internet]; rateLimit 5).
- IMPORTED=YES: registry.ts:15. REGISTERED=NO (absent from both revivedTools and baseTools; only ImageStudioTool is registered at :306).
- ALIAS POINTS AT DEAD NAME: ToolService.ts ~551 maps `image_generate` -> `generate_image`; the target is unregistered, so calls via EITHER name die with unknown_tool (same failure shape as the pre-fix github_* story documented in registry comments).
- No web/src references; no planner/capability-matrix references found.
- POLICY BLOCKER: execute() spends paid OpenAI when a key exists and otherwise calls a third-party remote (Pollinations). Registration without a free-only/policy decision would violate cost posture. Same repair discipline as bulk_file_generator (which must NOT be registered for containment reasons).
- PRIMARY_STATE=ORPHANED (no legitimate runtime path; intended path evidenced by the alias).
- Repair (NOT done this cycle): policy decision first (free-only vs keyed vs local), then register + focused tests + gates, or remove the alias and classify dead. P1 after W72-2.

## Finding W72-2: visual_qa — IMPLEMENTED_NOT_REGISTERED but verification-visible (PARTIALLY_WIRED)
- IMPLEMENTED=YES: VisualQATool.ts (plain ToolDefinition object, name `visual_qa`, screenshot critique; uses routeToModel — provider/cost note: description names GPT-4o-Vision).
- IMPORTED=YES: registry.ts:14. REGISTERED=NO (absent from both lists).
- VERIFICATION_LAYER ACCEPTS IT: verification-ledger.ts isVerificationTool includes `visual_qa` in the known-verification-tool set (~line 738), and the fingerprint gate name-matches it (~519). A plan emitting verificationTask {tool: visual_qa} passes verification selection but CANNOT execute (unknown_tool) — accepted-but-unexecutable, a sibling of the UI-001 unsupported-verification-contract family (distinct mechanism: missing registration vs string/object shape).
- RUNTIME HANDLING EXISTS: ToolService browser-session injection (~562) and rate-limit bucket (~75) special-case `visual_qa`; PhaseExecutor revision trackers name-match it (1737, 2047, 2051 — recognition, not dispatch; no live dispatch breakage there).
- PRIMARY_STATE=PARTIALLY_WIRED (verification-visible + runtime-handled, executor-unreachable).
- Repair (NOT done this cycle): register object directly in baseTools (TodoWriteTool precedent — plain object, no safeNew class wrapper needed) + focused register/execute/select tests + AGENTS gates + Real Joe UAT before any claim. P1 (verification-path coherence).

## Finding W72-3: bulk_file_generator — prior Codex finding CORROBORATED on Muse HEAD
- Imported registry.ts:18, NOT in either registration list. Unchanged vs Codex's 2026-09-30 report. No registration attempted (workspace-containment caveat stands). Not re-prescribed.

## Classification delta
- media/creative family: PARTIALLY_WIRED (ImageStudioTool registered; generate_image orphaned behind policy question).
- visual-verification family: PARTIALLY_WIRED (visual_qa accepted by ledger, unexecutable).
- IMPLEMENTED_NOT_REGISTERED (this checkpoint, Muse HEAD): generate_image, visual_qa (+ bulk_file_generator corroborated).
- No global count changes claimed (totals remain last-reported/UNKNOWN). No repairs performed (audit-first).
