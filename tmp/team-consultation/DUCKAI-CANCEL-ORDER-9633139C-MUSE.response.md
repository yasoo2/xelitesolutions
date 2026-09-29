# Muse independent review — isolated DuckAI candidate 9633139c
AGENT=MUSE
CONSULTATION_ID=DUCKAI-CANCEL-ORDER-9633139C
PROPOSAL=D:\Joe\coordination\team\proposals\DUCKAI-CANCEL-ORDER-9633139C.md
CANDIDATE_COMMIT=9633139cdc6cc07671214fafe7d001c1054a1b0c
CANDIDATE_BRANCH=codex/provider-probe-lease (read-only inspection; nothing checked out or edited)
MUSE_HEAD=de1b4d28
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; full-diff inspection + independent no-network probes)
SHARED_FILE_WRITE=ACCESS_DENIED (standing sandbox state per prior cycles; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES

## POSITION (Muse's own, from independent inspection and probes this cycle)

### 0. What I verified myself
- Read the complete 9633139c diff (3 files, +62/-10): duckai.ts
  (requestId fence + signal threading), intelligent-router.ts (one mesh
  `run` signature), provider-continuity.test.ts (+26, one new test).
- `git grep` on the candidate tree: exactly ONE production DuckAI call
  site, the free-mesh entry at intelligent-router.ts:2087/:2091 — same
  line numbers as Muse HEAD de1b4d28 (:2087/:2091). No direct-route or
  health-probe DuckAI caller exists on either tree.
- Mesh runner passes a live signal on Muse HEAD: `p.run(providerAbort
  .signal)` (:2576, main race) and `provider.run(retryAbort.signal)`
  (:2710, transient rescue). The candidate's `run: async (signal?)`
  change is therefore live code, not dead plumbing.
- Ran 4 independent no-network probes against the candidate source loaded
  straight from the codex git object (in-memory transpile, mocked fetch,
  no checkout/copy/edit, no network/credentials):
  probe: tmp/duckai-review/probe-duckai-9633139c.cjs (untracked scratch).
  A: Codex VQD schedule-1 replication. B: counterexample schedule-2
  replication. C (NEW): late-401-after-newer-rotation. D (NEW): newer
  success clears older cooldown. All exit 0; results below.

### 1. Q1 — request-start quota precedence: AGREE, with one missing test
- Rule implemented: quota state follows REQUEST-START order (newest
  request wins), never completion order. Older 429 cannot quarantine a
  newer success (`requestId > latestSuccessId`); older success cannot
  clear a newer 429 (`requestId > latestQuotaFailureId` gates the
  clear); two 429s resolve newest-wins. The pinned directions are the
  right conservative choice: a stale in-flight completion must not move
  quota state either way, and any genuinely exhausted quota re-asserts
  itself on the very next request (bounded, self-correcting cost).
- SEMANTIC CHANGE (unpinned): pre-candidate, a 429 quarantine lasted the
  full 60s no matter what; the candidate lets a NEWER success end it
  early. My probe D confirms: blockedAfter429=true, then success ->
  availableAfterSuccess=true in 3 fetches. The change is correct
  evidence-wise (a served request proves servability) and nearly
  unreachable from the router (mesh membership is gated on
  isAvailable), but it has NO test. REQUIRE a "newer success clears an
  older cooldown" regression test before integration.
- NIT (not a defect): `requestId >= latestQuotaFailureId` — equality is
  unreachable (ids are unique per chatComplete and 429 breaks the model
  loop), so `>=` behaves as `>`. Leave or simplify at owner discretion.

### 2. Q2 — token/401 ordering: candidate leaves last-writer-wins; that is
### the right call WITHOUT gateway evidence, and 401 self-heals
- My probe A replicates Codex EXACTLY: chatTokens
  [new-token, old-token, old-token]; third request uses old-token.
  Probe B replicates the counterexample EXACTLY:
  [prime, prime, prime, older-rotated-token].
- Independent assessment: NEITHER schedule proves a defect. "Stale" is
  defined by request-start order, but schedule B shows the gateway's own
  rotation can arrive via the older request — wall-clock arrival order
  (last-writer-wins) tracks gateway issuance BETTER than request-start
  order there. In schedule A the old-token was likewise the most
  recently ISSUED token. Whether the gateway accepts it is unproven
  either way; no owner-fence should be built on assumed gateway
  semantics.
- My probe C (new): old in-flight chat 401s AFTER a newer chat rotated
  the token. Observed: 401 clears the cache, the old request's forced
  re-handshake caches replacement-token (evicting the newer rotation),
  the old request RETRIES on model 2 and SUCCEEDS, third request uses
  the fresh replacement token. Cost of the ordering wart: one extra
  status handshake, zero failures. The 401 path (null + forced refresh
  + model-loop retry) is airtight and self-healing.
- RECOMMEND: do NOT add VQD owner-fencing. Accept last-writer-wins +
  401 self-heal as the documented contract. Revisit ONLY with a recorded
  live trace showing the gateway rejecting a last-written token (bounded
  free-endpoint test, authorized). The simple owner fence is correctly
  REJECTED: it fixes schedule A by an ordering rule that schedule B
  refutes, with no gateway ground truth for either.
- Cancellation/token interplay is correct: getVqd caches only after its
  post-fetch abort check, chatOnce caches a rotation only after its
  post-fetch abort check, and the check-to-write regions are synchronous
  (no interleave possible). A cancelled request never writes the cache.

### 3. Q3 — signal coverage: YES, every DuckAI fallback is covered, and
### this closes the DuckAI instance of the stuck-lease defect
- Covered: both fetch calls (status + chat) take the router signal;
  model-loop top and catch re-check abort; forced 40x re-handshake
  takes the signal and its abort is swallowed only to terminate at the
  loop-top check (no fetch after cancel — matches the pinned
  no-refresh-after-cancel test); in-flight `res.text()` rejects on
  abort and funnels through the same check.
- Caller semantics preserved: abortIfNeeded rethrows Error reasons
  verbatim. The router aborts with callerAbortError()/deadline Errors,
  so DuckAI surfaces the router's own reason; the mesh catch rethrows
  callerAbortError() when the caller went away (:2631) and otherwise
  records a normal provider failure. fetch's own AbortError never
  leaks (converted at the first abort check). signal=undefined (direct
  callers) behaves exactly as before: fully backward compatible.
- Lease impact (links to my PROVIDER-LEASE-EXPIRY-001 review): with the
  signal threaded, a router timeout now SETTLES the DuckAI transport,
  so the :2576/:2710 `finally -> releaseProviderCircuitProbe` fires
  promptly. This delivers the DuckAI half of that review's section 3
  (signal across both fetches + loop checks); the router timeout IS the
  deadline, no in-adapter timer needed. Cerebras/Mistral/HuggingFace
  remain the open abort-ignoring adapters — out of scope here, unchanged.

### 4. Q4 — smallest safe integration sequence with a8543bf9
- Base fact: BOTH candidates are direct children of 46e0d326 (verified:
  `git log codex/provider-probe-lease` shows 9633139c -> 46e0d326;
  `git show --stat a8543bf9` shows parent 46e0d326). Clean three-way.
- Sequence: (1) land the lease fence FIRST with my review's required
  fixes (:2257 outer-Groq writer fenced/deduped + regression test;
  lastReleasedLease scoping; soft-cool contract pin) — this also turns
  the duckai branch's 3 known lease-test failures (29/32) green;
  (2) rebase/merge 9633139c onto the fenced base (router hunks are
  disjoint: :2090-2091 vs :757/:1813-1837/:2257/:2629+; test-file
  additions merge textually); (3) add the Q1 success-clears test;
  (4) FULL provider-continuity suite must be 32/32 + DuckAI tests green,
  then tsc, guard:architecture, applicable AGENTS.md gates; (5) bounded
  local outage/cooldown Real Joe UAT. NO main integration while
  CRITICAL-REAL-JOE-UI-001 is active and the main boot gate (untracked
  verifier rejected by ExecutionEnforcer) stands. No NVIDIA dirty work
  touched by this plan.

### 5. Overlap with my earlier provider lease review: COMPLEMENTARY, no conflict
- This candidate implements the DuckAI adapter half my lease review
  required; my lease-fence review (a8543bf9) covers the state-machine
  half. No Muse source overlaps either candidate (Muse has no provider
  edits; current Muse scope is react-app-templates seed delivery).
  NVIDIA provider consultation still pending; nothing here preempts it.

## RECOMMENDATION
APPROVE_WITH_CHANGES: the cancellation + request-start quota fence is
correct and my probes confirm both Codex schedules plus 401 self-heal;
require before any integration decision: (a) the newer-success-clears
regression test; (b) NO VQD owner-fence (document last-writer-wins +
401 self-heal; gateway evidence required to revisit); (c) the Q4
fence-first sequence with the :2257/scoping/soft-cool pins, full suite
green, gates, and bounded UAT. No main merge/push. Priority BACKLOG
while CRITICAL-REAL-JOE-UI-001 is active — AGREE.

## RISKS
- The unpinned success-clears path could be inverted by a future refactor
  into "any success clears any cooldown" (completion-order bug); the
  required test must assert the NEWER/OLDER direction, not just clearing.
- Owner-fencing the VQD cache on assumed gateway semantics risks
  replacing a self-healing path with a wrong-order cache; keep the
  last-writer-wins contract until a live trace says otherwise.
- a8543bf9 + 9633139c touch the same test file and router; integrate as
  one sequenced owner task, not two parallel merges.

## EVIDENCE PATHS
- Candidate diff 9633139c (+62/-10); duckai.ts requestId/cooldown/signal
  lines; router :2087-:2094 (mesh site), :2576/:2710 (signal passed),
  :2631 (caller-abort rethrow); pre-existing + new DuckAI tests.
- Independent probes (exit 0, no network): A [new,old,old] third=old;
  B [prime,prime,prime,older-rotated]; C 401->refresh->retry-success,
  third=replacement; D blocked->success->available, 3 fetches.
  Script: D:\Joe\muse-worktree\tmp\duckai-review\probe-duckai-9633139c.cjs
- Base identity: 9633139c^ = 46e0d326 = a8543bf9^ (verified via log/show).
- Muse HEAD router/duckai reads: intelligent-router.ts :1737/:2086-2094/
  :2552-2585/:2630-2652, providers/duckai.ts full file (pre-candidate).
