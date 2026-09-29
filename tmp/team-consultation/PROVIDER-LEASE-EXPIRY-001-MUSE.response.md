# Muse consultation response — PROVIDER-LEASE-EXPIRY-001
AGENT=MUSE
CONSULTATION_ID=PROVIDER-LEASE-EXPIRY-001
PROPOSAL=D:\Joe\coordination\team\proposals\PROVIDER-LEASE-EXPIRY-001.md
HEAD=be5245fd7ab513af931347442a7224398b044b92
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; independent inspection at HEAD be5245fd)
SHARED_FILE_WRITE=ACCESS_DENIED (expected per prior cycles; shared file left PENDING_REVIEW for verbatim import)

## POSITION (Muse's own, from independent source inspection this cycle)

### 1. Stale-lease diagnosis: AGREE, reproduced on Muse HEAD
- provider-continuity.ts: PROVIDER_RECOVERY_TIMEOUT_MS=30_000 (:11);
  providerCircuitStatus blocks on `probingUntil > 0` (:137);
  claimProviderCircuit denies on `probingUntil > 0` (:145) and sets
  `probingUntil = now + 30_000` with a new lease (:146-147).
- A probe whose transport never settles therefore blocks its circuit
  indefinitely — past both the quota retryAt and the named 30s probe window.
- Router release paths on Muse HEAD attach releaseProviderCircuitProbe to the
  UNDERLYING promise's finally at intelligent-router.ts:2576 (main race),
  :2711 (transient rescue) and :2861 (direct health probe). If provider.run
  does not settle after abort, the race returns TIMEOUT but the lease is
  never released. Codex's main-branch audit matches Muse HEAD exactly here.

### 2. Main/Muse divergence on this module: NONE
- Read-only comparison of D:\Joe\xelitesolutions main
  provider-continuity.ts: same Circuit shape (:5), same status (:137), claim
  (:145-148) and fenced release (:158) at identical line numbers. A future
  fix applies to both branches identically; no Muse-local overlap to
  reconcile. Muse has no dirty edits in provider-continuity.ts or its test.

### 3. Deadline-only reclaim is INSUFFICIENT: AGREE with Codex REWORK
- Independently audited Muse HEAD adapters (provider-module layout, not
  main's inline definitions):
  - api/src/core/llm/providers/cerebras.ts: chatComplete(messages, model,
    tools) takes no signal/timeout; the SDK call
    `client.chat.completions.create(body)` (:74) passes no RequestOptions,
    so a router abort cannot reach the transport.
  - api/src/core/llm/providers/duckai.ts: native fetch in getVqd (:37-39)
    and chatOnce (:71-82) has no signal/timeout; chatComplete (:114-132)
    loops over up to 3 models with no abort check between attempts.
- A reclaimed lease can therefore launch a second physical request while the
  first transport is still pending. One active lease does NOT imply one
  in-flight transport for these adapters today.

### 4. NEW Muse finding: failure records are the unfenced path
- markProviderCircuitHealthy (:150-155) IS lease-fenced (refuses to clear
  when circuit.lease !== lease); releaseProviderCircuitProbe (:156-159) IS
  lease-fenced. But recordProviderCircuitFailure (:112-132) takes NO lease
  parameter and preserves the previous probingUntil/lease (:132).
- Consequence: after a deadline-aware reclaim issues lease N+1, a late 429
  from the stale lease-N transport would overwrite the circuit record with a
  fresh retryAt under the new lease's window. Late old completions stay
  harmless for release/healthy, but NOT for failure recording.
- Any reclaim design must either lease-fence failure records or prove stale
  transports settle (via section 3 adapter work) before the reclaim fires.
  Fencing failures is the smaller, transport-independent half.

### 5. Should lease expiry permit one new probe? YES, as a package
- The 30s named lease is otherwise misleading, and an indefinite block on an
  unsettled transport is a real availability defect (distinct from honoring
  an active quota Retry-After, which must never shorten).
- The safe package is: (a) deadline-aware reclaim with lease identity (one
  current lease; late release/healthy fenced — already present);
  (b) adapter abort/timeout propagation — router signal through SDK
  RequestOptions for OpenAI-compatible adapters (Cerebras/Mistral/
  HuggingFace), explicit signal+deadline across both DuckAI fetch calls plus
  abort checks in its model loop; (c) lease-fenced failure recording per
  section 4; (d) bounded orphan/backoff policy if any transport can still
  ignore abort (decision point for the owner: reclaim-then-fence vs
  reclaim-with-backoff).
- Priority: BACKLOG while CRITICAL-REAL-JOE-UI-001 is active — AGREE with
  the proposal's priority. No provider source edits started by Muse.

### 6. Existing test contract conflict: CONFIRMED on Muse HEAD
- provider-continuity.test.ts:232-240 ("does not open a second probe while
  the first transport is unresolved") expects a claim at t=50000 to stay
  denied after a t=2001 claim whose 30s window expired at t=32001.
  Deadline-aware reclaim intentionally inverts this assertion. The test must
  be UPDATED to express the agreed recovery contract (expiry reclaimable
  once; pre-expiry denied; stale-lease release/healthy/failure cannot disturb
  the new lease) — not deleted, and not silently flipped without the adapter
  and fencing evidence in sections 3-4.

### 7. Focused tests / gates / UAT needed (when owned)
- RED/GREEN: expired lease reclaimable exactly once; pre-expiry denied;
  stale release/healthy/failure fenced from the new lease; new failure under
  the live lease preserves the longer quota window; saturation reclaims only
  truly expired probes; free_only and tenant isolation intact.
- Adapter tests: signal propagation to SDK/fetch; bounded settlement on
  abort; no new attempt during Retry-After; DuckAI stops its model loop on
  abort. No paid endpoints or real credentials (fake-fetch/stub style per
  Codex's network-free experiments).
- Then applicable AGENTS.md gates for the touched area, plus a bounded Real
  Joe local-provider outage/cooldown UAT. No expensive live experiment until
  source/test evidence warrants it.

## RECOMMENDATION
APPROVE_WITH_CHANGES: approve the diagnosis and the reclaim direction, but
require the fenced package (deadline-aware reclaim + adapter abort
propagation + lease-fenced failure records + updated contract test) under one
assigned owner and an independent reviewer before any provider source edit or
integration. Do not implement deadline-only reclaim alone.

## RISKS
- Reclaiming without adapter work converts a stuck-blocked circuit into
  potentially overlapping physical requests against a quota-limited provider
  — trading availability for quota burn and out-of-order side effects.
- recordProviderCircuitFailure is called from many router paths; adding a
  lease parameter must keep all non-probe call sites (plain failures with no
  lease) behaving exactly as today.
- Provider-continuity state also has restart-persistence and cross-workspace
  semantics under separate discussion (C04); the reclaim owner must not
  silently change circuit-key scoping.

## EVIDENCE PATHS
- Muse HEAD be5245fd: api/src/core/llm/provider-continuity.ts :11, :112-160
  (full lease/state machine); api/src/core/llm/intelligent-router.ts :2576,
  :2711, :2861 (release-on-finally races); providers/cerebras.ts :45-49/:74
  (no signal), providers/duckai.ts :37-39/:71-82/:114-132 (no signal, retry
  loop); api/src/__tests__/provider-continuity.test.ts:232-240 (conflict).
- Main READ-ONLY: provider-continuity.ts identical lease lines (:137/:145/
  :146/:158); no Muse divergence.
