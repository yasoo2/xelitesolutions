# EVIDENCE-c222-exec-evidence — Level-4 focused execution of 5 planner-invisible tools

MUSE_HEAD=18f72334 (clean tracked tree, verified before/after; zero Joe source delta)
DATE_UTC=2026-10-03
SCOPE=Corpus-bound: the 5 never-surfaced candidates from cycle-212
 (cloud_cost_estimator, self_confidence_evaluator, ask_user, rss_fetch, task_lifecycle).
METHOD=Direct execute() calls in isolated tsx (no server). 10 cases (2/tool).
 12s timeout/case (0 timeouts observed). JWT_SECRET=C222-PROBE-DUMMY (synthetic,
 process-local, never persisted). No API keys in env (verified). rss_fetch used
 refused-localhost URL only — zero external traffic from the probe except the two
 tools' own free-tier LLM path (LLM7 keyless/DuckAI/Pollinations, no paid calls).
RESULTS=tmp/c222-exec-evidence/run1-normalized.json
 (SHA256 453FCF4069FE2B684499380D025DC7A5D60D43F812E78595038968CA48FB223D)
 + run2-normalized.json
 (SHA256 C9023CE8F46C3F34EB041262A5FAACB2751BB45F6B0162C306664FC4E051FD6E)

## Outcome: 8/10 deterministic GREEN, 2/10 LLM-path NON-DETERMINISTIC (finding, not flaw)

- All 10 cases RESOLVED (no throws, no timeouts). EXECUTED=YES for all 5 tools.
- 8 non-LLM cases are byte-identical across both runs.
- The 2 valid-LLM-path cases differ run-to-run because they depend on live
  keyless-LLM output AND quota state. This non-determinism is the finding; it is
  recorded, not normalized away. No third LLM run was attempted (quota exhausted,
  would hammer fallback providers).

## Per-tool classification (this corpus only)

1. cloud_cost_estimator (CostEstimatorTool, EliteTools.ts:171)
   EXECUTED=YES. invalid-empty-resources -> ok:false + clear error (deterministic).
   valid-llm-path -> ok:true, outKeys run1=[costs,instance_type,region],
   run2=[costs,instance_type,region] (same keys this time, values not compared).
   OUTPUT_CONTRACT_VALID=PARTIAL (shares the || '{}' false-success pattern below).
2. self_confidence_evaluator (SelfConfidenceTool, EliteTools.ts:261)
   EXECUTED=YES. invalid-blank-content -> ok:false + clear error (deterministic).
   valid-llm-path run1 -> ok:true outKeys=[score] (LLM7 keyless answered).
   valid-llm-path run2 -> ok:true outKeys=[] WHILE the log shows TOTAL provider
   failure (LLM7 429 quota -> DuckAI 418 -> DeepSeek TIMEOUT -> CRITICAL all failed).
   DEFECT (class-level, confirmed): on total model failure the tool returns
   ok:true with output={} (JSON.parse fallback `|| '{}'`, EliteTools.ts:284).
   A tool that cannot reach the model must fail, not answer — the file's own
   header comment (lines 6-12) states this principle, but the parse fallback
   violates it. OUTPUT_CONTRACT_VALID=NO on the failure path. No repair attempted
   (audit-first rule; NVIDIA owns no competing scope here but repair needs review).
3. ask_user (AskUserTool, TaskInteractionTools.ts:238)
   EXECUTED=YES. valid -> ok:true {status,message} + log (deterministic).
   missing-question -> ok:true with log ask="undefined" (deterministic): class does
   NOT enforce required:['question']. FLAG (minor): gateway validation exists per
   c220 (4/4 validation GREEN), so planner-path impact is UNKNOWN, not proven.
   broadcast() is a safe no-op in isolation ([WS] liveWssRef null).
4. rss_fetch (RssFetchTool, ContentTools.ts:91)
   EXECUTED=YES. refused-localhost -> ok:false "connect ECONNREFUSED 127.0.0.1:9"
   (deterministic, localhost-only). empty-url -> ok:false with EMPTY error string
   (deterministic, both runs). WART: ok:false + "" error is near-useless evidence
   for the verification layer. OUTPUT_CONTRACT_VALID=PARTIAL.
5. task_lifecycle (TaskLifecycleTool, TaskLifecycleTool.ts:6)
   EXECUTED=YES. valid + minimal-defaults -> ok:true {success:true} + log
   (deterministic). broadcast() safe no-op in isolation. OUTPUT_CONTRACT_VALID=YES.

## Cross-cutting notes

- EVIDENCE_PRODUCED=YES for all 5 (output or error always present), but quality
  varies: empty error string (rss) and false-success {} (LLM tools) are the two
  evidence defects.
- Quota side-effect (disclosed): the probe's 4 free-tier LLM calls contributed to
  LLM7 keyless 429 (daily quota exceeded, retry ~24.9h). No paid calls (no keys).
- REAL_JOE level: Level-4 (focused runtime execution) proven for 5/5 tools in this
  corpus. NOT Level-5 (canonical pipeline) or Level-6 (Real Joe UI).
- Runtime this cycle: :5002 DOWN, :5101 DOWN (direct checks), :5000 UP API-only
  (not a substitute). Fresh official UI UAT remains BLOCKED.
- No PENDING_REVIEW consultation for Muse this cycle (verified by scan).
- NVIDIA: main a10c71ab, 19 tracked dirty owned scopes + untracked, preserved
  untouched (read-only). No overlap: this probe ran only in the Muse worktree.

## Limits

- Corpus-bound (5 tools). No global wiring counters claimed.
- LLM-path behavior observed, not pinned (live model + quota).
- Class-level execution only; ToolService/verification-layer handling of these
  outputs is separate (c220 covered dispatch; verification consumption still open).
