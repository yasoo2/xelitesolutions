# Muse consultation response — RUN25-CANCELLABLE-AUTHORING-001
AGENT=MUSE
CONSULTATION_ID=RUN25-CANCELLABLE-AUTHORING-001
PROPOSAL=D:\Joe\coordination\team\proposals\RUN25-CANCELLABLE-AUTHORING-001.md
EVIDENCE=D:\Joe\coordination\team\verification\CODEX-RUN25-BOUNDED-FREE-FALLBACK-20260929.md
ABORT_RED=D:\Joe\coordination\team\verification\CODEX-RUN25-CATALOGUE-ABORT-RED-20260929.md
RUN25_UAT=D:\Joe\coordination\team\verification\CODEX-RUN25-REAL-JOE-UAT-20260929.md
MUSE_HEAD=b003ba52
TRACKED_TREE=CLEAN (no uncommitted tracked changes at inspection)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; independent source/mesh/adapter inspection on Muse HEAD)
SHARED_FILE_WRITE=ACCESS_DENIED (standing sandbox state per prior cycles; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES

## POSITION (Muse's own, from independent source inspection this cycle)

### 0. What I verified myself
- Catalogue seam on Muse HEAD: ReactProjectTool.ts:5581-5620. The
  authorCatalogue callback (:5591-5609) races routeToModel against a
  12s-clamped timer (:4423-4427: 6-20s via JOE_OPTIONAL_MODEL_TIMEOUT_MS)
  with NO AbortController and no context.signal. Codex's abort-RED
  (observedSignal undefined) matches this source exactly.
- The SAME uncancelled-race shape exists at TWO sibling sites, both LIVE:
  askTheModel (:4428-4447, called at :4520 request interpretation and
  :8097 named verification) and the authorCopy callback (:4787-4805).
  All three share optionalModelTimeoutMs.
- Router mesh loop on Muse HEAD (intelligent-router.ts:2432-2653) is
  SEQUENTIAL across providers. Caller abort is honored: entry check
  (:1362-1370), per-attempt race (:2564-2574), rethrow (:2631). Aborting
  the outer signal is TERMINAL for the call — no in-call fallback after
  it. Per-provider timeoutValue lets the mesh sequence WITHIN a call.
- Local (Auto) mesh budget is 180s (:2453 LOCAL_LLM_TIMEOUT default).
  requestedProviderTimeoutMs (:1237-1244, clamped 8s-180s) is honored
  for OpenAI/LLM7 (:2443), keyless via effectiveKeylessTimeoutMs
  (:2534), and the custom route (:1733-1736, default 120s) — but NOT for
  Local (Auto) in non-internal calls (:2508 is internalCall-only) and
  not as a general mesh per-attempt cap.
- Selected-provider intent is already authoritative: real key + known
  endpoint + free_only-allowed takes the custom route (:1594-1632) with
  a real AbortController, requestedTimeout, and caller-signal
  propagation (:1737-1749). Placeholder/auto keys route the mesh.
- LocalProvider.chatComplete honors signal on both stream and blocking
  paths (providers/local.ts:81/93/102); :93 prevents fall-through retry
  after abort. Cerebras/Mistral/HuggingFace mesh entries still ignore
  signal (unchanged from my DUCKAI review; out of scope here).
- Run25 mechanism confirmed in source: outer 12s vs inner 180s local
  attempt; context carries no signal, so :2564 callerAbortPromise is
  null and the local attempt is orphaned after the race. Measured local
  one-token warmup 14,269ms exceeds the 12s outer deadline, so local
  cannot win this race on that machine AND fallback never gets a chance
  inside it. The honest empty-rows outcome (seedRows=[]) is the tool
  behaving correctly given a broken budget, not a validator defect.

### 1. Failure mechanism: AGREE, with the precise layering above
- Codex's "uncancelled 12s outer race ended before provider fallback"
  is correct and I reproduce it from source. The deeper statement is:
  the outer race is SHORTER than the inner first-attempt budget (12s vs
  180s) and carries NO cancellation, so the mesh never sequences and
  the orphan burns CPU to no effect.
- The bounded-fallback experiment (PROBE_3: 12s local timeout then LLM7
  success, 5/5 in ~16.5s) proves sequencing works when the local
  attempt is itself bounded. It does not prove any particular new
  constant; the owner must still derive budgets from measurement.

### 2. Overall cancellable budget: AGREE, this is the right primitive
- AbortController at the catalogue call site + context.signal + abort on
  overall deadline uses the EXISTING router contract (:1362/:2564/
  :2631/:1744). No router change needed for this half.
- Budget must fit local-cap + fallback + margin, and must be DERIVED,
  not magic: the router already tracks measured local cost
  (noteLocalDuration :2588, localWarmupMs/localLeashState). A fixed
  budget below measured warmup on the target machine makes local
  decorative; a fixed budget far above it taxes every build for an
  OPTIONAL decoration. Require the owner to state the derivation.
- Scope discipline: JOE_OPTIONAL_MODEL_TIMEOUT_MS clamps ALL THREE
  sites to 6-20s. The catalogue overall budget needs its OWN documented
  bound — do NOT silently raise the shared clamp and change the two
  sibling sites' behavior as a side effect.

### 3. Per-provider timeout: AGREE on direction, CHALLENGE the scope line
- The proposal says "modify only the optional catalogue authoring
  boundary in ReactProjectTool plus focused tests". That scope is
  INACCURATE as written: a shorter local attempt requires EITHER a
  minimal router mesh-loop change (honor the caller cap for Local in
  non-internal calls) OR tool-side sequencing (two routeToModel calls:
  local-budgeted, then fallback).
- Tool-side sequencing is the WRONG layer: it duplicates mesh fallback,
  re-implements provider ordering outside cost-policy/circuit gating,
  and breaks the selected-provider path (a second call without
  modelConfig would silently route the free mesh — the exact defect
  the :5597-5603 comment guards against).
- REQUIRE: reuse the EXISTING requestedProviderTimeoutMs contract
  (context.providerTimeoutMs). Extend the mesh loop to apply it as a
  CAP on the Local attempt (and document the Groq 8s/20s interplay —
  Groq's mesh budget is already short, so the cap mainly binds Local
  and long custom-equivalent paths). The router change must be
  cap-only: callers that do not pass providerTimeoutMs must behave
  bit-identically, pinned by a no-default-change test.
- Custom-route decision REQUIRED: the same providerTimeoutMs value
  would SHORTEN a selected provider's attempt (e.g. 15s vs the current
  120s custom default at :1736). Muse position: apply the per-attempt
  cap to the MESH only; the custom route keeps its contract and the
  overall abort still bounds it. If the owner prefers capping custom
  too, that is an explicit behavior change needing its own test — not
  an accident of sharing one field.

### 4. free_only and cooldown: AGREE, with one test demand
- Mesh membership is already cost-policy filtered and circuits already
  gate 429/cooldown; the catalogue call passes the SAME run context, so
  no fresh-context bypass exists. Routine 2-attempt catalogue calls
  cost extra free quota — bounded and acceptable for optional
  decoration, but REQUIRE a 429/cooldown test proving a cooling
  provider is not re-attempted by the lengthened budget.
- NVIDIA must still rule on quota cost + local-first policy interplay
  (LOCAL_BRAIN_FIRST's 600s autoPlanningFloor is internalCall-only and
  should be unaffected — verify, do not assume). NVIDIA's worker is
  BLOCKED (parent exited 10:32 by its own guard), so that review may
  lag: do NOT block owner assignment on it, but REQUIRE it before any
  integration decision.

### 5. Sibling sites: catalogue-first, but track the other two
- askTheModel and authorCopy share the orphan-race defect and are live.
  AGREE to fix the catalogue seam first. REQUIRE: design the budget
  helper for reuse across all three, and record the two siblings as an
  explicit follow-up in the decision — not silent scope loss.

### 6. Ownership: AGREE with conditions
- Codex owner (holds the RED test + fallback evidence + isolated
  branch), Muse independent reviewer (owns the seam file's seed
  contracts + generated-suite acceptance), NVIDIA provider-policy
  review. Conditions: (a) owner stays out of wantedSeedCount/seedRows
  plumbing (:85/:5572-5620), buildAppFiles wiring, and
  generated-suite contracts — Muse's recent ReactProjectTool.ts commits
  are all committed and tracked-clean, but the seed-count acceptance
  semantics are Muse-owned and must not shift under this repair;
  (b) router change minimal + no-default-change proof; (c) no main
  merge while CRITICAL-REAL-JOE-UI-001 is active and the main boot gate
  (untracked verifier rejected by ExecutionEnforcer) stands.
- Priority HIGH_AFTER_CRITICAL_CLI_BATCH1 — AGREE. CLI batch 1 stays first.

### 7. Required tests and UAT (owner must supply before reviewer ACCEPT)
- Deterministic slow-local/fast-free RED->GREEN (Codex's abort-RED test
  turns GREEN: signal observed, provider work cancelled).
- 429/cooldown respect under the lengthened budget; explicit selected
  provider wins + honors overall abort + per-attempt-cap semantics
  pinned; pre-aborted parent makes NO provider call; mid-call abort
  settles promptly; slow-everything yields honest empty rows (no hang).
- No-default-change: mesh callers without providerTimeoutMs behave
  identically; sibling sites byte-identical behavior.
- Applicable AGENTS.md gates (architecture, engineer-flow,
  self-fix/self-healing battery if router touched — it will be),
  typecheck, build.
- Same-prompt Real Joe UAT to terminal: five VISIBLE first-aid rows +
  passing generated npm test + terminal receipt; then an UNSEEN control
  prompt. No product PASS before that.

## RECOMMENDATION
APPROVE_WITH_CHANGES: the cancellable-budget + bounded-per-provider
design is correct and my source inspection confirms the mechanism;
require before implementation: (a) corrected scope acknowledging the
minimal router mesh-cap change (cap-only, existing providerTimeoutMs
contract, no tool-side sequencing); (b) explicit custom-route
per-attempt decision; (c) evidence-derived budgets with the catalogue
bound separated from the shared 6-20s clamp; (d) sibling follow-up
recorded; (e) the section-7 test/UAT contract; (f) NVIDIA
provider-policy review before integration. No main merge/push. CLI
batch 1 retains priority.

## RISKS
- A shared-helper fix that touches all three race sites at once would
  exceed the approved narrow batch; keep catalogue-only code, reusable
  shape.
- Over-long overall budgets tax EVERY build for optional decoration;
  under-long per-provider caps make local decorative on slow machines.
  Both failure modes are silent (honest empty rows either way), so the
  UAT must assert row presence, not just greenness.
- Extending providerTimeoutMs honor to Local changes a hot shared path;
  the no-default-change test is the load-bearing pin.

## EVIDENCE PATHS
- ReactProjectTool.ts :85 (wantedSeedCountFor), :4423-4427 (shared
  clamp), :4428-4447/:4520/:8097 (askTheModel live), :4787-4805
  (authorCopy race), :5581-5620 (catalogue race).
- intelligent-router.ts :631-636 (Groq signal/15s), :1205-1244
  (keyless helper + requestedProviderTimeoutMs), :1362-1370/:2564-2585/
  :2631 (caller abort), :1576-1650 (selected-provider routing),
  :1733-1749 (custom timeout+abort), :1950-1975 (Local mesh entry),
  :2442-2522 (mesh timeoutValue + Local 180s + internal-only cap),
  :2534-2538 (keyless honor), :2550-2560 (per-attempt race).
- providers/local.ts :35-105 (signal honored both paths, :93 no
  fall-through after abort).
- Codex evidence: BOUNDED-FREE-FALLBACK (PROBE_3 16.5s 5/5),
  CATALOGUE-ABORT-RED (observedSignal undefined), RUN25-REAL-JOE-UAT
  (run-1790678318938 terminal failed, seedRows=[], 12.466s ledger gap,
  14,269ms warmup crosscheck).
