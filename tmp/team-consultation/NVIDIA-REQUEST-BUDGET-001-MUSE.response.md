AGENT=MUSE
CONSULTATION_ID=NVIDIA-REQUEST-BUDGET-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES_BOTH_COMMITS
RECOMMENDATION=APPROVE_WITH_CHANGES
UPDATED=2026-10-02
MUSE_HEAD=cddc351b
NOTE=Shared-file write denied by sandbox (absolute path outside workspace).
This fallback file is the complete review. Codex may import it verbatim.
No agreement with any other agent is inferred or recorded here.

SCOPE_REVIEWED:
- Change A: 25e2ace8db58c54bdc80c9088a12b78ac30425df
  "fix(nvidia): preserve Ultra generation budgets and reject truncation"
  (api/src/core/llm/intelligent-router.ts +29/-2,
   api/src/__tests__/provider-continuity.test.ts +78)
- Change B: a8e5877cb62e3339c594338002c6f1fe520a1811
  "fix(nvidia): scope direct frontend output reasoning policy to Ultra"
  (api/src/modules/tools/definitions/AIGeneratorTool.ts +6,
   api/src/__tests__/ai-write-file.test.ts +29)
- Proposal: D:/Joe/coordination/team/proposals/NVIDIA-REQUEST-BUDGET-001.md
- Consultation addendum: Local25e2ace8 wire controls/truncation guard;
  exact UI replay 18:22:45 stopped 3:54, no liveUrl; change B 60
  ai-write-file tests PASS, types/build/diff 0, gates/replay pending.

ROOT_CAUSE_ASSESSMENT=CORRECT_FOR_CHANGE_A
Pre-fix, the custom OpenAI-compatible route built SDK bodies with only
model/messages/stream/tools/tool_choice. Caller maxCompletionTokens and
reasoningEffort were accepted into context and then silently dropped.
Diff-proven: 25e2ace8 adds the ONLY max_tokens/chat_template_kwargs
wiring on that path. Caller-side proven: ProjectPlannerTool requests
reasoningEffort='low' (default) and maxCompletionTokens=12000 (6000 on
one path); AIGeneratorTool requests 1200/2400 (frontend_asset) and 6000
(other). Middle hop verified: AIGeneratorTool llmContext -> callLLM
-> routeToModel(routingContext) is a straight pass-through (llm.ts ~10
lines). The SDK-body loss is a real evidenced contract defect, and the
fix location (single isNvidiaUltra block spread into stream, buffered
and unsupported-stream fallback bodies) is the smallest correct one.

VENDOR_CONTRACT_CHECK=PASS_WITH_ONE_UNVERIFIED_RANGE
Independently fetched
https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer
(200 OK, 2026-10-02). Official request examples confirm: top-level
max_tokens; top-level chat_template_kwargs with {enable_thinking:false},
{enable_thinking:true}, {enable_thinking:true, medium_effort:true};
separate top-level reasoning_budget; docs-template default
reasoning_effort "high". Python SDK wraps these in extra_body, but the
raw REST body takes them top-level, so the Node wire sending them
top-level (no extra_body) matches the REST contract. The OpenAI Node
client (new OpenAI({apiKey, baseURL, maxRetries:0}), create() cast to
any) passes extra top-level keys through to the JSON body.
NOT independently verified from this fetch: the cited max_tokens range
1..32768 and default 16384 (schema bodies elided in fetched markdown).
The Math.min(budget, 32768) cap is safe regardless of the exact vendor
maximum, because it can only reduce an oversized caller value.

CHANGE_A_VERDICT=APPROVE_SUBJECT_TO_C1_AND_TELEMETRY_NOTES
- Exact-Ultra scoping is correct; non-Ultra controls pinned by tests.
- Invalid/absent budget/effort are omitted (vendor defaults apply). Safe.
- low->medium mapping: vendor exposes none/medium/high only, so 'low'
  must map somewhere. Mapping low to (thinking on, medium_effort) is
  the closest thinking-on option; mapping it to none would silently
  disable thinking the caller left enabled. Acceptable, but it is a
  silent cost/latency upgrade and should be documented in code or logs.
- Streaming parity holds: identical generationOptions in all three
  bodies; truncation error rethrown without buffered retry or free-mesh
  substitution (no double-charge, no silent fallback). Tests pin
  single-request behavior for both stream and buffered paths.
- finish_reason=length rejection converts SILENT corruption into LOUD
  failure. It does not repair the product blocker: the 18:22:45 exact
  replay proves it (original request aborted, sole self-fix hit
  truncation, no liveUrl). This is an honest diagnosis aid, not a fix.
  Expect MORE visible failures after adoption until budgets are fixed;
  that is intended behavior, not a regression surprise.
- 0fc compatibility: 0fc normalizes cfgProvider at route entry (line
  ~1574), upstream of isNvidiaUltra (~line 1773) in the same function,
  and change A is already present in the 635/0fc line (blob match
  confirmed). No conflict; they compose correctly.
- Gap 1 (telemetry): no usage capture. The router discards
  completion_tokens_details, so reasoning-vs-output token split is
  unmeasured. Require logging usage when present so the starvation
  hypothesis becomes falsifiable.
- Gap 2 (empty answer): finish_reason=stop with empty content is still
  unhandled. Out of scope for this change, but record it as adjacent.

CHANGE_B_VERDICT=APPROVE_WITH_CHANGES_REQUIRED
- Scoping is correctly narrow: engineeringPipeline + frontend_asset +
  exact Ultra model only; explicit caller effort wins (??); Auto,
  other-model and non-frontend defaults provably unchanged by tests.
- CORE CHALLENGE (as requested): reasoning starvation is a HYPOTHESIS.
  No inference-usage evidence (reasoning_tokens vs output tokens) was
  presented. The 1200/2400 budgets may simply be too small for complete
  frontend files regardless of thinking. Supporting skepticism: the
  tool ALREADY contains a budget-doubling retry for incomplete frontend
  artifacts (previousBudget -> min(4800, x2), capped once), which shows
  small caps were previously suspected insufficient on their own.
  Change B bets the freed thinking room fits real artifacts inside
  1200/2400; the tool tests use a tiny mock HTML snippet that cannot
  prove that. Real calculator-sized artifacts must be measured.
- QUALITY RISK: thinking-off may degrade complex frontend output. No
  thinking-on vs none quality comparison exists. The complex-frontend
  detector (coordinated workflow/state machines/role permissions/audit
  events/multi-step) already identifies files most likely to NEED
  reasoning, yet change B disables thinking for exactly those files
  too. Consider exempting complexFrontendArtifact from the none
  default, or bounding the experiment to non-complex assets first.
- CASE-CONSISTENCY DEFECT (evidence-backed, must fix): change B guards
  on raw context.modelConfig.provider === 'nvidia' (exact lowercase),
  but 0fc/C1 evidence proves mixed-case provider values occur in the
  real system and are normalized only INSIDE routeToModel. With a
  mixed-case selection, change B is silently bypassed (Ultra default
  high thinking, shared cap) while change A still applies. Fix by
  case-normalizing in the tool guard (same predicate shape as 0fc) or
  moving the default into the router; at minimum add a mixed-case test
  pinning the intended behavior.
- COMPOSITION GAP (should fix): change A makes truncation THROW
  provider_response_truncated, but the existing budget-doubling retry
  triggers only on RETURNED content with "incomplete Markdown fence" /
  JSON format errors (prepared.error). A thrown truncation error
  bypasses the doubling retry entirely. Recommend catching
  provider_response_truncated in the artifact path and routing it into
  the existing bounded doubling retry (once), with a test. Without
  this, change A + existing recovery do not compose.
- SIMPLER/MEASURED ALTERNATIVES (evidence-backed, for the record):
  1. Measure first: capture usage.completion_tokens_details on Ultra
     responses for a few real artifact generations before/after; let
     the reasoning/output split decide between none-vs-budget-raise.
  2. Raise the Ultra frontend floor (e.g. 2400 -> 4096+) instead of or
     alongside disabling thinking; vendor default max_tokens alone
     (16384, cited) suggests headroom exists.
  3. Pass reasoning_budget explicitly (vendor supports it) for bounded
     thinking rather than binary on/off.
  4. Reuse the existing doubling retry as the truncation recovery
     vehicle (see composition gap) instead of adding new retry logic.
  None of these replace change B outright; (1) is required as follow-up
  measurement, (4) is recommended for composition.

OVERLAP=NONE_FOUND
- Muse lanes (redactor, browser/runtime, verification contracts): no
  overlap; no shared files with my uncommitted/committed work.
- NVIDIA lanes (classifier/parser/consumers, CLI batch): no overlap.
  CLI artifacts are not frontend_asset; planner guard untouched.
- 0fc case-routing: compatible (see above); change A already in the
  635/0fc line, change B not yet present there. No competing edits.

CONFLICT_AND_REGRESSION_RISKS=LOW_WITH_KNOWN_BEHAVIOR_CHANGE
- Other providers/models: byte-identical behavior (exact-Ultra gate).
- Ultra callers passing budgets now get them enforced: previously
  over-budget-but-lucky completions may now truncate-FAIL loudly.
  Intended; UAT must expect it.
- Change B alters Ultra frontend output distribution (no thinking).
  Quality must be observed on real artifacts, not mocks.
- No policy/cost change, no deadline change, no new retry, no paid
  fallback, no secrets touched.

MAINTAINABILITY_AND_SECURITY_IMPACT=NEGLIGIBLE
Small diffs (+35/+107 lines incl. tests), clear comments, no new
dependencies, no credential handling, no persistence or multi-user
surface change. Operator consent/acknowledgement paths untouched.

REQUIRED_TESTS_BEFORE_INTEGRATION:
1. Change B: mixed-case provider guard test (or normalize + test). MUST.
2. Change B: remaining mandatory gates + type/build on exact source
   (pending per addendum). MUST.
3. Recommended: truncation->doubling-retry composition test. SHOULD.
4. Recommended: tool->router param integration pin (currently covered
   by two boundary suites + 10-line forwarder inspection). SHOULD.
5. Required follow-up (may land after integration behind measurement):
   Ultra usage telemetry logging (reasoning/output split). MUST-PLAN.

REAL_JOE_UAT_REQUIRED=YES
- Exact calculator replay through real UI (same prompt as 17:52:19 /
  18:22:45) to terminal state: observe completion vs abort vs
  truncation, physical files, build/test, rendered arithmetic.
- One materially different frontend request (different domain/layout):
  observe artifact completeness and thinking-off quality.
- Record observed token usage if telemetry lands; otherwise record
  artifact byte sizes vs the 1200/2400 caps as sufficiency evidence.
- No main merge, no runtime adoption, no production action authorized
  by this review. Integration owner decides after NVIDIA review.

EVIDENCE_PATHS:
- D:/Joe/worktrees/codex-nvidia-provider-ui (commits 25e2ace8, a8e5877c;
  read-only inspection, no modification)
- D:/Joe/worktrees/codex-nvidia-case-contract-20261002 (0fc277e1; router
  blob comparison, AIGeneratorTool absence check)
- https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-ultra-550b-a55b-infer
  (fetched 2026-10-02, 200 OK; request examples confirming top-level
  max_tokens/chat_template_kwargs/reasoning_budget)
- D:/Joe/coordination/team/proposals/NVIDIA-REQUEST-BUDGET-001.md

Handoff note: fallback copy only; shared consultation file unchanged
(STATUS there remains PENDING_REVIEW until Codex imports this review).
