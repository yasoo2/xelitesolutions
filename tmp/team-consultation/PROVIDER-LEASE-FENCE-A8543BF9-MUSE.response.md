# Muse independent code review — isolated provider lease fence a8543bf9
AGENT=MUSE
CONSULTATION_ID=PROVIDER-LEASE-FENCE-A8543BF9
PROPOSAL=D:\Joe\coordination\team\proposals\PROVIDER-LEASE-EXPIRY-001.md
CANDIDATE_COMMIT=a8543bf992cfd5d7480a041a139c679eebaf9e97
CANDIDATE_BRANCH=codex/provider-lease-fence (base 46e0d326)
CANDIDATE_WORKTREE=D:\Joe\worktrees\codex-provider-lease-fence (read-only; verified clean after review)
MUSE_HEAD=91280fb3
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; full-diff inspection + independent test execution)
SHARED_FILE_WRITE=ACCESS_DENIED (verified this cycle via heartbeats write probe; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES

## POSITION (Muse's own, against my PROVIDER-LEASE-EXPIRY-001 APPROVE_WITH_CHANGES review)

### 0. What I verified myself
- Read the complete a8543bf9 diff (3 files, +46/-20): provider-continuity.ts
  (lease-fenced record + lastReleasedLease), intelligent-router.ts (lease
  threading at 7 call sites + currentAttempt gating of custom-route state),
  provider-continuity.test.ts (2 any-cast removals, 1 new test, 1 extended test).
- Ran the focused suite MYSELF in the candidate worktree with process-only dummy
  JWT_SECRET/JOE_TEST_MODE/OFFLINE_MODE and TEMP redirected to my workspace
  cache (no candidate-worktree writes; worktree verified clean afterward):
  -t "lease": 4 passed / 28 skipped, exit 0 (reclaims timed-out lease; ignores
  late quota failure after replacement; honors current recovery lease; late old
  429 does not undo replacement probe via direct custom route).
  -t "already succeeded": 1 passed / 31 skipped, exit 0 (expired probe failure
  after newer success stays fenced — the tombstone case, not matched by "lease").
- All 5 lease-fence tests independently GREEN. I did not rerun the full 32-test
  file; the 4 remaining DuckAI failures are disclosed in the verification record
  and untouched by this commit.

### 1. lastReleasedLease state: SOUND, one non-blocking wart
- The design accepts a released-but-unreplaced owner ("current 429 after
  release") and rejects old owners after a replacement claims or succeeds.
  claim() preserves lastReleasedLease while previous.lease takes precedence when
  set, so a stale released lease cannot shadow a live replacement. Correct.
- WART: lastReleasedLease has indefinite validity when no replacement ever
  claims. A stale leased 429 landing after an intermediate NON-PROBE record
  would be accepted (previous.lease unset, lastReleasedLease matches) and could
  extend the live window upward via the retryAt comparison. Narrow the grant:
  clear lastReleasedLease on any subsequent non-probe record, or bound it by
  time; add a regression test. Not an integration blocker given the upward-only
  effect, but pin it before broader rollout.

### 2. Current 429 after release: AGREE, correctly pinned
- Matches mesh settlement order (underlying finally releases, router records
  next). The new 'honors a quota failure from the current recovery lease' test
  pins blocked=true with retryAt=62002. This is the case my earlier review
  required to keep working; it does.

### 3. Stale 429 after replacement success: AGREE, tombstone-free design works
- Leased failures require an existing record (`!previous -> return false`), so
  post-success deletion rejects old owners without a tombstone. Non-probe
  failures (lease undefined) still create records — preserved semantics.
  Pinned by both the replacement-recovers and the already-succeeded tests.

### 4. Direct custom cooldown: AGREE, stale state correctly gated
- currentAttempt gates failedCustomRoutes.add (:1826), customRouteCooldownUntil
  (:1831), and the benign-failure branch (:1837). A stale 429 no longer poisons
  route-level auth/quota state. recordProviderAttempt still logs the attempt,
  which is acceptable attempt history, not quota state.

### 5. Other provider health state outside the circuit: CORRECT AS-IS (challenge answered)
- Mesh :2638-2644 still applies markProviderFailed/markProviderRateLimited/
  sawRateLimit even when the circuit record is fenced. I challenged this and
  conclude it is CORRECT, not a defect: a just-arrived 429 is fresh quota
  evidence even if its lease is stale — fencing it would discard real provider
  state. The coherent contract is: circuit = hard block (ownership-fenced);
  provider cooling = soft TTL-bounded deprioritization. REQUIRE a test pinning
  exactly that (fenced stale 429 -> circuit unblocked AND provider soft-cool
  TTL-bounded) so a future refactor cannot silently invert either half.

### 6. NEW Muse finding: outer Groq record at :2257 is the last unfenced writer — MUST FIX
- `recordProviderCircuitFailure(groqCircuitKey, e)` at intelligent-router.ts:2257
  (outer happy-route catch) still passes NO lease, while inner callGroq :757
  records with claim.lease. Codex's own callsite trace flagged this duplicate.
- Consequence: if the inner record is correctly rejected as stale, the outer
  record applies the same stale failure unconditionally. Live reachability today
  needs an abort-ignoring transport plus reclaim plus late reject (the SDK abort
  experiment makes this unlikely on the Groq path, and the synchronous
  double-record is otherwise redundant-but-harmless), so this is defense-in-depth
  rather than a proven live race — but the commit's stated purpose is fencing
  stale failures, and this is a known unfenced writer in the fenced set.
- REQUIRE before integration: thread the lease to :2257 or dedupe via a
  recorded-marker set by the inner catch, plus a regression test proving the
  outer path cannot re-apply a fenced stale failure. Do not integrate with a
  known unfenced writer.

### 7. Deadline reclaim + capacity cleanup (pre-existing on branch): AGREE
- providerCircuitStatus :144 and claimProviderCircuit :152 use probingUntil>now;
  capacity cleanup :126 reclaims retryAt/probingUntil-expired entries. The
  updated contract test :255-263 (denied pre-expiry, allowed post-release) plus
  the reclaim test :265-286 express the agreed contract rather than deleting the
  old assertion. Consistent with my review section 6.

### 8. Scope / priority / gates
- Adapter cancellation (DuckAI RED) remains open and is correctly out of scope;
  one lease still does not imply one transport. No integration while the suite
  is red; no Real Joe UAT claimed — AGREE on all three.
- Priority BACKLOG while CRITICAL-REAL-JOE-UI-001 is active — AGREE.
- No overlap with Muse work (Muse has no provider-continuity edits); NVIDIA
  provider consultation still pending. Muse makes no implementation claim here.

## RECOMMENDATION
APPROVE_WITH_CHANGES: the fence design is correct and my 5/5 independent test
reruns pass, but require before any integration decision: (a) fence or dedupe
the :2257 outer Groq writer + regression test; (b) lastReleasedLease scoping
test; (c) soft-cool contract pin test; then full provider suite + applicable
AGENTS.md gates + bounded local provider outage/cooldown UAT. No main merge/push.

## RISKS
- Integrating with :2257 unfenced leaves a stale-failure path the suite cannot see.
- lastReleasedLease's indefinite grant is a small window-extension vector under a
  specific interleaving; scoping it now is cheaper than debugging it later.
- Deadline reclaim without adapter abort work can still overlap physical
  transports on abort-ignoring adapters; the fence fixes state corruption, not
  transport overlap. Keep the two work items linked, not conflated.

## EVIDENCE PATHS
- Candidate diff a8543bf9 (3 files +46/-20); provider-continuity.ts :5/:112-141
  /:144/:152/:157-170; intelligent-router.ts :757/:1680/:1813-1837/:2257/:2629
  /:2632/:2725/:2962/:884-886 (markProviderFailed TTL); tests :255-335, :414-418.
- Independent runs: -t "lease" 4 passed/28 skipped exit 0; -t "already
  succeeded" 1 passed/31 skipped exit 0; candidate worktree clean after review.
- Verification record PROVIDER-LEASE-FENCE-A8543BF9-ISOLATED-20260929.md (claims match).
