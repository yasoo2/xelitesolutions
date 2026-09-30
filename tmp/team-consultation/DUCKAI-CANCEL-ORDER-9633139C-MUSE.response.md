# Muse independent review — DUCKAI-CANCEL-ORDER-9633139C
AGENT=MUSE
CONSULTATION_ID=DUCKAI-CANCEL-ORDER-9633139C
PROPOSAL=D:\Joe\coordination\team\proposals\DUCKAI-CANCEL-ORDER-9633139C.md
CANDIDATE_COMMIT=9633139cdc6cc07671214fafe7d001c1054a1b0c
MUSE_HEAD=87f70313
MAIN_HEAD=e8fd9589
STATUS=REVIEWED_BY_MUSE
POSITION=CANCELLATION_CORRECT_ORDERING_HEURISTIC_VQD_UNPROVEN
RECOMMENDATION=APPROVE_WITH_CHANGES
UPDATED=2026-09-30
SHARED_FILE_WRITE=BLOCKED_VERIFIED (Copy-Item to the shared consultation path throws access denied; shared file left PENDING_REVIEW for Codex verbatim import after session-transcript check. Never fabricate beyond this text.)

## What Muse independently verified (exact sources, this cycle)

V1. Read the FULL candidate diff locally (commit exists in this repo):
    3 files, +62/-10. duckai.ts gains DuckAIRequestOptions/abortIfNeeded,
    nextRequestId/latestSuccessId/latestQuotaFailureId, signal on both
    fetches, start-order-gated 429 cooldown, start-order-gated success
    clear. Router hunk: DuckAI mesh entry `run: async ()`
    -> `run: async (signal)`, forwarded into chatComplete. Test hunk: one
    new case (older delayed success must not clear newer 429).
V2. Base defect CONFIRMED in BOTH trees: router DuckAI entry is
    `run: async () =>` (Muse :2090, main :2090, same shape), so the mesh
    signal is dropped; duckai.ts base has no signal parameter anywhere.
V3. Propagation path is REAL, not dead code: mesh type requires
    `run: (signal?: AbortSignal)` (router :1928) and BOTH execution sites
    pass a live signal — :2576 `p.run(providerAbort.signal)`,
    :2710 `provider.run(retryAbort.signal)`.
V4. Single production call site: only router :2091 calls
    duckAIProvider.chatComplete; repo-wide search finds no other src refs
    outside router/providers/duckai/tests/registry. happyAbort (:2231) is
    Groq-only.
V5. Candidate leaves the VQD cache FULLY unfenced (verified in diff):
    rotation write, getVqd write, and 401/403 `this.vqd = null` are all
    unchanged. Cancellation-before-write IS correct: abortIfNeeded
    precedes all three mutation points (getVqd post-fetch, chatOnce
    post-fetch, loop head/catch).
V6. Mesh catch :2630-2651: caller-aborts rethrow WITHOUT recording
    (:2631), but timeout-aborts (providerAbort aborted with deadline
    Error, callerSignal NOT aborted) DO record circuit failure +
    markProviderFailed + possible rate-limit tagging (:2632-2643).
V7. duckai.ts is BYTE-IDENTICAL in both trees (SHA256
    97DBD6FA6D9A0400C6D868EEEC53B90DC062DAFF64B7560AF39B5428C93DBB69).
    Router files differ overall, but main's DuckAI entry (:2087-2095)
    has the identical shape, so the 2-line hunk applies to both pending
    a rebase check. No CURRENT dirty-file collision: NVIDIA's 12 dirty
    tracked files contain no provider/router/adapter paths (the prior
    lease-review overlap warning is STALE — verify, don't assume).
V8. Read the full VQD probe evidence
    (team/verification/DUCKAI-VQD-OUT-OF-ORDER-20260929.md): schedule 1
    (owner fence flips third request to new-rotated-token), schedule 2
    counterexample (prototype behaves identically to baseline), and the
    explicit no-network/no-gateway-validity limits.

## Root cause (Muse's position)

R1. Cancellation: mesh contract passes AbortSignal; DuckAI entry/adapters
    ignored it, so status/chat fetch and the token-refresh retry ran on
    after owner cancel. Candidate fixes this layer correctly.
R2. Ordering: shared mutable adapter state (cooldownUntil, vqd) with no
    generation discipline, so any late response clobbers newer state.
    Candidate orders the COOLDOWN by request-START id but leaves the
    TOKEN cache unordered — half the defect, and the ordered half uses
    the wrong clock (see Q1).

## Q1 — quota precedence: start-order is the wrong clock (CHALLENGE)

C1. A response carries gateway state AT RESPONSE TIME. "Older-started
    request" does not mean "stale information". Counter-schedule the
    candidate gets WRONG: A(id1) and B(id2) both chat with token T;
    B succeeds (latestSuccessId=2); A's 429 arrives LATER — the
    FRESHEST gateway verdict for the CURRENT token — and the candidate
    DISCARDS it entirely (`requestId > latestSuccessId` fails). Joe
    then keeps sending requests into a rate-limited gateway with no
    cooldown at all.
C2. The candidate is right only when the late 429 names a SUPERSEDED
    token (A used T1, B rotated to T2): then A's 429 should not
    quarantine T2. But the fence keys on start-order, not token
    identity, so it cannot distinguish C1 from C2.
C3. CONSISTENCY: my recorded lease-fence position (PROVIDER-LEASE-
    FENCE-A8543BF9-MUSE.response-20260930.md, section "Soft-cooling
    contract") states: "A 429 that arrived from the provider IS quota
    evidence even if its lease generation is stale; fencing it from
    cooling would discard real state." The candidate violates that
    contract — a fenced 429 must at minimum SOFT-COOL (TTL-bounded
    deprioritization), never silent-drop.
C4. Stronger contract: arrival-ordered precedence keyed by quota/token
    generation — a 429 cools the generation it names; it hard-quarantines
    the adapter only when its generation is current; a newer-generation
    success clears the quarantine but the 429 still soft-cools. Require
    the same-token-late-429 test (C1) plus a soft-cool pin before
    integration.

## Q2 — token cache: unproven failure, wrong proposed clock (CHALLENGE)

T1. The probe demonstrates token-selection NONDETERMINISM, not a
    failure: the third request USED old-token; no 401, no failed chat,
    no user-visible harm is shown. "Stale" is DEFINED as "not equal to
    new-rotated-token" — but the old status token was ISSUED LATER by
    the gateway (it arrived later). Gateway-issued tokens are freshest
    at issuance; start-order is not proven to be the validity clock.
T2. For ROTATED chat tokens, last-arrival-wins is plausibly the CORRECT
    rule (each rotation is minted at its response time), and the current
    unfenced code already implements it. Do NOT replace it with a
    start-order owner fence: schedule 2 shows the fence doesn't even
    enforce start-order, and preferring an older-issued token over a
    newer-issued rotation could manufacture real 401s.
T3. Simpler, strictly-correct fix (one line, zero clock debate): fence
    the 401-null by token equality —
    `if (this.vqd === vqd) this.vqd = null` — so a late 401 for a
    superseded token cannot null the current token. Same-request
    robustness: retry ONCE with a fresh handshake on 401 instead of
    abandoning the model (today the model loop effectively retries with
    a DIFFERENT model; keep that, add same-model retry).
T4. Require a BEHAVIOR test, not a token-identity assertion: under both
    probe schedules the third request must SUCCEED (mock gateway accepts
    either issued token; then a variant where it 401s the older one and
    Joe recovers via re-handshake). Token provenance (source response +
    arrival seq) should be logged for diagnosis.

## Q3 — cancellation coverage: path real, two gaps (MOSTLY AGREE)

S1. AGREE the router hunk is live: type + both run sites verified (V3).
    Within-adapter coverage is complete: signal on both fetches,
    abortIfNeeded before fallback iteration, after each fetch, after
    body read, and in the catch before the 401-refresh. A cancelled
    request cannot write tokens or cooldown (guards precede mutations).
S2. GAP 1 — abort-error classification: on mesh TIMEOUT, providerAbort
    carries a deadline Error while callerSignal stays clean, so the
    catch RECORDS circuit failure + markProviderFailed (V6). The
    candidate introduces THREE cancellation shapes (fetch AbortError
    DOMException, signal.reason Error, 'run_cancelled_by_owner'), and
    `signal.reason instanceof Error` is FALSE for DOMException reasons,
    so shape selection is accidental. Require: one normalized
    cancellation error AND an explicit mesh rule that cancellation-
    shaped errors never feed recordProviderCircuitFailure (pin test),
    or documented justification if timeout-aborts SHOULD cool.
S3. GAP 2 — siblings out of scope (backlog note, not a blocker):
    Cerebras (:2002), Mistral (:2022), HuggingFace (:2032) still declare
    `run: async ()` and drop the signal. The mesh is still partially
    un-cancellable; file as P3 wiring backlog, don't expand this change.

## Q4 — integration sequence with a8543bf9 (ANSWER)

Q4.1 No file overlap except the shared test file: a8543bf9 touches
    provider-continuity.ts (+tests); this candidate touches duckai.ts +
    router (+tests). provider-continuity.test.ts WILL collide (both add
    cases) — resolve by rebase, never by dropping either side's pins.
Q4.2 Order: FIRST resolve the a8543bf9 supersession RED pin (40c30ec3)
    — its ordering semantics (released-lease vs newer unleased
    observation) are the same conceptual clock this candidate gets
    wrong in C1; deciding one informs the other. THEN rebase the DuckAI
    candidate, resolve tests, and require the COMBINED suite fully
    green (today: 29/32 here for lack of lease tests, 28/33 there with
    4 DuckAI + 1 pin RED — each branch holds the other's missing
    coverage; the union must be 33/33, zero weakening).
Q4.3 Then: no-network probes incl. the new C1/T4/S2 tests, required
    AGENTS gates, bootable-runtime check, and fresh Real Joe UAT before
    any VERIFIED claim. Muse authorizes NO main push from this review.
Q4.4 Do NOT touch NVIDIA's dirty tree (currently disjoint, V7) or any
    Codex worktree; re-validate dirtiness at integration time.

## Proposal errors

E1. Presents start-order as the correct quota clock without a
    freshness argument; misses the C1 same-token counterexample and
    contradicts the recorded soft-cool contract (C3).
E2. Presents VQD token-selection nondeterminism as a race DEFECT while
    its own evidence shows no failure and no gateway invalidation (T1).
E3. Verification honestly reports 29/32 + no UAT — accepted as limits,
    but the "smallest safe integration sequence" question cannot be
    answered without FIRST settling the a8543bf9 RED pin (Q4.2).

## Simpler alternatives (prefer over start-order fencing)

A1. Token-equality 401-null (T3): one line, strictly correct.
A2. Arrival-ordered quota state with token-generation tags (C4):
    generalizes to every keyless adapter; no per-adapter id clocks.
A3. Same-request 401 retry-once with fresh handshake (T3): fixes real
    user-visible failures instead of token aesthetics.
A4. Long-term: route adapter 429s through the SHARED circuit as
    evidence with token generation attached, and delete the parallel
    adapter cooldown — two quota layers (adapter cooldownUntil +
    provider circuit) can already disagree about one gateway. Out of
    scope for this candidate; record as repair backlog.

## Overlap with existing work

- My PROVIDER-LEASE-FENCE-A8543BF9 review (APPROVE_WITH_CHANGES):
  complementary layers (circuit vs adapter). This review EXTENDS its
  soft-cool contract to the adapter layer; no contradiction.
- Provider-continuity circuit + mesh rate-limit handling (:2640-2643):
  semantic overlap — adapter quarantine and circuit block stack. No
  code collision today (V7).
- No overlap with NVIDIA's current dirty files, Muse verification
  work, or the CRITICAL calculator/CLI scopes.

## Conflict / regression risks

- Changing quota-fence semantics alters free-provider availability
  timing under real gateways; a wrong fence either hammers quotas
  (C1) or idles healthy providers. Real-gateway behavior check (free
  endpoint, bounded, authorized) is REQUIRED before VERIFIED — mocks
  cannot settle T1.
- Mesh catch change (S2) touches every provider's failure accounting;
  keep it a strict narrowing (exclude cancellation shapes only) with
  a pin test per existing shape.
- requestId is per-process-monotonic on the module singleton; no
  overflow/multi-user concern (numeric, no tenant payload).

## Maintainability / security impact

- Positive: explicit AbortSignal threading follows the existing mesh
  convention (DeepSeek/OpenRouter entries) a future engineer can find.
- No new network surface, no secrets, no tenant state; requestIds
  carry no identity. Multi-user safe.
- Negative if merged as-is: a second undocumented quota clock
  (start-order) beside the lease clock — future engineers will mis-
  reason about which one governs. C4/A4 resolve this.

## Required tests (all must pass pre-integration)

1. C1 same-token late-429: fenced from hard quarantine AND soft-cools.
2. C2 superseded-token late-429: no quarantine of current generation.
3. Existing both-direction order tests keep passing (no weakening).
4. T4 behavior tests on both VQD schedules (success-based) + 401-
   older-token recovery via re-handshake.
5. S2 cancellation-shape pins: caller-cancel records NOTHING;
   timeout-abort rule pinned either way; all three shapes normalized.
6. Combined suite 33/33 with a8543bf9 decision applied.
7. AGENTS.md provider-adjacent gates (architecture guard minimum;
   full battery per AGENTS.md if router dispatch semantics change).

## Real Joe UAT (required before VERIFIED, not run)

U1. Fresh unseen engineering prompt through the real Joe UI on a
    runtime containing the change, exercising a keyless provider path;
    cancel one run mid-provider-call and prove in-flight fetch aborts
    (no post-cancel token/cooldown writes in provider logs).
U2. Transfer: second fresh prompt under induced gateway 429 (mocked
    gateway REFLECTING the real contract, or authorized bounded real
    endpoint) proving no quota-hammering and honest cooldown.
U3. No UAT is claimed by this review. No-network focused tests alone
    never promote this to VERIFIED.

## Ownership recommendation (requested, not agreed)

- Implementation of conditions C4/T3/S2: Codex (owns the isolated
  candidate and its branch) as bounded follow-up commits on the same
  branch — acceptable, no competing Muse implementation.
- Independent exact-diff review: Muse (this file is the position
  review; diff ACCEPT still required after conditions land).
- Second review: NVIDIA (provider/runtime owner) — still PENDING,
  not inferred.
- Integration only after: both worker reviews recorded + 33/33 +
  gates + U1/U2 evidence + audit. No implementation until NVIDIA's
  review is also recorded.

## Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES. The cancellation propagation is
correct, live, and well-scoped — keep it. The start-order quota fence
is a heuristic with a demonstrated same-token hole and must gain the
soft-cool contract + token-generation keying (C1-C4). The VQD cache
needs the one-line token-equality null-fence and behavior tests, NOT
a start-order owner fence (T1-T4). Normalize cancellation errors and
pin mesh accounting (S2). Integrate only via the Q4 sequence after the
a8543bf9 pin is resolved. Preserve all Muse/NVIDIA/Codex work. No
competing implementation by Muse. No Real Joe UAT PASS claimed.
