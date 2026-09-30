# MUSE independent review — LOCAL-PROVIDER-HEALTH-RECONNECT-001

AGENT=MUSE
CONSULTATION_ID=LOCAL-PROVIDER-HEALTH-RECONNECT-001
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_BOUNDED_RECONNECT_ONLY_WITH_IDENTITY_RECONCILIATION
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=ebf2daa0
MUSE_BRANCH=muse/joe-development
MUSE_TRACKED_STATE=CLEAN
MUSE_UNTRACKED_PRESERVED=585_ENTRIES
UPDATED=2026-09-30
SHARED_FILE_WRITE=DENIED_BY_SANDBOX
NOTE=Shared consultation file is outside Muse sandbox write scope
  (absolute path outside workspace). This workspace-local response is the
  complete authentic Muse review. Codex may import it after verifying file
  identity and the worker session transcript. Never fabricate Muse agreement
  beyond this text.
SUPERSEDES=Prior Muse review at MUSE_HEAD=90fba4a4 (same file, HEAD
  version, preserved in git history). This revision re-verified every
  prior claim independently this cycle, adopts the prior C1 UI-half
  disposition / C7 reassignment rule / lease crosslink / full test-UAT
  lists, and ADDS the af29be95 endpoint-identity analysis with a
  code-traced RED-on-main, the full main-vs-preserved continuity diff,
  the preserved-router comparison, UI-copy verification, and the
  authenticate/guest analysis. Nothing from the prior review is dropped.

## 1. What Muse independently inspected (this cycle, read-only)

- Preserved commit 9de4b7e6 (route + test + UI diff) in
  D:\Joe\worktrees\codex-integration-20260928.
- Test-only commit af29be95 (33-line diff) on codex/integration-20260928.
- Current main api/src/api/routes/providers.ts (no health route; routes are
  openai/key, openai/status, openai/test, switch, gemini/key,
  gemini/status, gemini/test, clear; no providerCircuit import, no
  authenticate import — manual 401 checks instead).
- Current main api/src/core/llm/provider-continuity.ts providerCircuitKey
  (lines 63-81), providerCircuitStatus (135-139), canonicalProvider/hosts.
- Current main intelligent-router.ts local-circuit call sites (2400-2401,
  2629, 2632, 2667, 2697) and local-brain breaker references.
- Preserved-branch provider-continuity.ts vs main unified diff (258
  diff lines): endpoint-aware local key, cooldown persistence, NVIDIA
  alias/policy additions.
- Preserved-branch intelligent-router.ts: NO local bypass/record-exclusion
  (only line-878 never-skip remains).
- Web sources: 'health/local' fetch exists ONLY in preserved worktree
  CommandComposer.tsx:1059; ABSENT from main and Muse web sources
  (recursive *.ts/*.tsx search, zero hits in both trees).
- Preserved UI copy in 9de4b7e6 (Arabic states + unavailable handling).
- Main api/src/api/middleware/auth.ts authenticate (lines 16-43).
- Verification docs: REAL-JOE-PROVIDER-VISIBILITY-5000-20260930.md,
  LOCAL-HEALTH-ENDPOINT-IDENTITY-AF29BE95-20260930.md.
- Live server (read-only GET, curl): 127.0.0.1:5000/api/health -> 200
  (0.01s); 127.0.0.1:5000/api/providers/health/local -> 404.
- Router mount: muse api/src/api/app.ts:291
  `apiRouter.use('/providers', providersRoutes)` — the route WILL be
  reachable at /api/providers/health/local once added (mount exists).
- Main built bundle web/dist/assets/Joe-CsSAEOKM.js (2026-09-28):450
  CONTAINS minified `fetch(`${key}/providers/health/local`)` — the UI
  half survives ONLY in main's checked-in dist, not in main/muse
  source. Provenance pinpoint for the live 404 (re-verified this
  cycle; adopts and confirms the prior review's bundle evidence).
- NVIDIA main worktree read-only: HEAD e8fd9589, 12 tracked dirty files,
  none in provider-continuity/router/middleware/providers-route.

## 2. Root cause (agreed, with one verified addition)

The user-facing defect is real: the served :5000 UI requests
/api/providers/health/local and gets 404 because main source has no such
route. Muse reproduces the 404 independently.

ADDITION — API/web provenance mismatch on live :5000 (verified this
cycle, read-only): the fetch exists in
NO current main or Muse web source; it exists only in the preserved
codex-integration branch (9de4b7e6). Therefore the live :5000 web bundle
was built from a tree containing 9de4b7e6 (or descendant) while its API
behaves like main (no route). This is consistent with Codex's
version=no-commit-file provenance finding. Consequence: reconnecting the
route in source does NOT fix the running :5000 until it is redeployed
from a known commit. UAT must target an exact candidate build (API + web
from the same commit) on an isolated port; no claim against live :5000
without redeploy evidence.

## 3. Circuit-identity challenge (the core review finding)

The proposal asks whether the old test's circuit key still equals the
current Auto router key. Muse's answer: NOT WITHOUT RECONCILIATION.
Three code-verified gaps:

GAP-1 — endpoint-aware key derivation missing in main. Preserved
providerCircuitKey derives the local endpoint from
config.baseUrl OR process.env.LOCAL_LLM_BASE_URL with loopback
normalization (127.0.0.1/localhost/[::1] unified) and pathname handling.
Main derives endpoint='local' whenever config.baseUrl is absent and never
reads LOCAL_LLM_BASE_URL. Code-traced consequence: af29be95's endpoint
test CANNOT pass on unmodified main — all three env values produce the
same key, so the "11435 reports blocked:false" assertion gets blocked:true
(RED). The owner must run this RED first to confirm, then choose: (a) port
the narrow endpoint-aware local derivation, or (b) rewrite the test to
main semantics with an explicit documented limitation (cooldown shared
across daemon endpoint changes). Silent weakening is forbidden.

GAP-2 — persistence vs ephemeral memory. Preserved branch persists signed
quota cooldowns with a stable identityKey (JWT_SECRET-derived). Main uses
a per-process random identityKey and loses all circuits on restart. On
main semantics the health signal is process-local memory that resets on
restart (safe direction). Must be documented; persistence port is
explicitly OUT of scope for this reconnect.

GAP-3 — on main the reported circuit is near-vacuous for Local (Auto).
Main mesh BYPASSES the circuit claim for Local (intelligent-router.ts:2401
`allowed:true` always), records empty-response failures for all providers
including local (2629), but EXCLUDES local from exception recording
(2632). Real local gating lives in the separate local-brain breaker
(localCircuitUntil/isLocalBrainOpen/noteLocalBrainTimeout). In the
preserved branch the bypass/exclusion are absent (local cooldown is
respected via 7d390ea3/a926caee/f13cb4b9), so the route is meaningful
there. Porting route-only to main fixes the 404 but reports a circuit the
router barely consults for Local: writers under the local key are only
the empty-response leg (2629) and the rescue-retry failure leg (2725),
so "no recorded block" will usually be true-but-meaningless, and a down
local daemon still shows "no recorded block". This is acceptable ONLY
with the honest-copy condition below; any change to the router
bypass/record behavior is a SEPARATE decision (it alters Auto routing)
and must not ride along silently.

## 4. Proposal errors / corrections

E1. "Reuse just this bounded route and tests" understates the gap: the
tests (af29be95 endpoint identity) encode preserved-branch key behavior
that main lacks. The reconnect scope must explicitly include identity
reconciliation (condition C1), not just route + tests.
E2. The proposal correctly states blocked=false is not readiness, but does
not pin the mechanism: on main semantics even blocked=true is nearly
unreachable for local (only via the empty-response leg 2629 and the
rescue-retry failure leg 2725). The review
requires the response/UI to stay strictly about RECORDED QUOTA MEMORY
(condition C2); optionally surface the read-only local-brain breaker
state in the same response (no probe) as a follow-up, not silently.
E3. Auth coverage gap: existing tests use role USER; the live repro path
is Guest. Main `authenticate` has no role check so guest JWT passes, but
this needs a pinned guest-role test (T3), since main providers.ts
otherwise uses manual 401 checks and this route is its first middleware
use.
E4. No candidate base is named. The base must be explicit (recommend:
main e8fd9589 + nothing else, isolated branch) with a declared
composition rule against Codex's adjacent isolated provider candidates
(4f1776c1 UI, 0be2c73e ack, 25e2ace8 budget, a8543bf9/40c30ec3 lease).
E5. (Adopted from prior review, re-verified.) UI-half orphaning:
9de4b7e6 is ONE feature in 4 files; "route and tests only" onto a base
containing neither half ships a CALLERLESS endpoint on any fresh build
(the requester survives only in the stale dist bundle). The candidate
MUST dispose of the UI half explicitly: (A) include the
CommandComposer+CSS UI part in the SAME bounded candidate (preferred —
same feature, bounded, honest 'unavailable' fallback already in the
code), or (B) scope route-only explicitly WITH a named UI follow-up
owner and a written justification for shipping a callerless endpoint.
No silent (B).
E6. (Adopted from prior review.) providerCircuitStatus blocked-condition
(`retryAt > now || probingUntil > 0`, provider-continuity.ts:137)
inherits the OPEN PROVIDER-LEASE-EXPIRY stale-probingUntil defect
(`> 0` vs `> now`). Mirroring router behavior exactly is still correct
(same function = same truth), but the candidate must crosslink the
lease issue so a stuck panel is diagnosed as circuit-memory, never
probed as a local outage. The af29be95 no-lease-consumption test is
necessary but does not cover this pre-existing condition.

## 5. Simpler alternatives considered

A1. Redeploy :5000 from known main: the fetch disappears (it is absent
from main UI), so no 404 — zero source change. REJECTED as the primary
fix because it deletes a genuinely useful cooldown-visibility feature to
hide a wiring gap; keep as fallback if reconciliation fails.
A2. Route-only port with main semantics + rewritten endpoint test.
Viable ONLY with the documented daemon-sharing limitation and honest UI
copy; weaker than (C1-option-a) but smaller.
A3. (Recommended direction) Route + narrow endpoint-aware local key
derivation + full test matrix on the candidate base + honest copy. Still
bounded; makes the signal actually mean what the UI says.

## 6. Overlap with existing work

- NVIDIA dirty main (12 tracked files, read-only check this cycle):
  package files, tool-aliases test, app-blueprints, IntentParser,
  context-engine, long-term-memory, PlanningEngine, plan-tools,
  ProjectPipelineTool, registry, capability-registry doc. NO
  provider-continuity/router/middleware/providers-route edits → no direct
  file overlap. NVIDIA must still confirm at its safe checkpoint.
- Codex isolated provider candidates listed in E4 touch adjacent policy;
  the reconnect base/branch must stay isolated from them until a composed
  integration decision. (Adopted.) The nvidia-provider-ui candidate
  touches the SAME provider panel surface: the health badge must compose
  with (not fork) whichever panel ships — the reconnect diff must be
  checked against that candidate's panel.
- Muse: discovery lane is read-only/fixture-contained; CLI-review duty
  retained and preempts. No Muse source overlap.
- No worker file, process, or runtime was modified by this review.

## 7. Conflict / regression risks

R1. If endpoint-aware key derivation is ported: local circuit keys change
(reset of local cooldown memory — safe direction). MUST NOT alter any
other provider's key derivation, cost policy, or retry semantics. Guard
with a key-stability test for non-local providers.
R2. MUST NOT port cooldown persistence, NVIDIA policy, or router
bypass/record changes in this batch. Each is a separate decision.
R3. UI copy MUST NOT claim readiness. Preserved copy is already honest
('no RECORDED block' / 'could not read'); keep it; add nothing like
"local healthy".
R4. Live :5000 must not be presented as fixed by a source commit; only by
a redeploy + same-build UAT.

## 8. Maintainability / security impact

- Maintainability: +9 route lines + focused tests; small, isolated,
  well-covered. Positive.
- Security: authenticated; response contains only provider/blocked/
  state/retryAt/checkedAt — no credential, circuit key, or endpoint
  (asserted by tests). No probe and no model/provider call → no quota
  spend, no SSRF surface, no paid-request risk. Guest readability exposes
  only shared environment-circuit quota memory (no per-user data) —
  acceptable; document it.
- Portability: no machine-specific behavior; endpoint env var already the
  portable mechanism.

## 9. Ownership answer

YES: Codex may own the bounded isolated reconnect; Muse will review the
exact diff. Conditions: isolated branch off the agreed base; no main
edits by the implementer; exact-commit Muse review before any integration
decision; NVIDIA overlap statement at its safe checkpoint; no competing
implementation. Caveat per C7: Codex is absent this cycle — bounded
reassignment required if absence persists at implementation time.

## 10. Mandatory conditions (APPROVE_WITH_CHANGES)

C1. Name the candidate base explicitly and reconcile circuit identity
(GAP-1): run af29be95 tests on the base to confirm the code-traced RED,
then either port narrow endpoint-aware local derivation or rewrite the
test to main semantics with a documented limitation. No silent weakening.
C2. Keep response/UI strictly about recorded quota memory; never present
absent memory as local runtime readiness. Any local-brain-breaker
surfacing or router-behavior change is a separate decision.
C3. Add guest-role auth test (live path is Guest) and full-app mount test
(mounted-router test alone does not prove the app serves the route).
C4. Keep the reconnect read-only: no probe, no lease consumption (already
covered), no provider/model call (add assertion), free_only unchanged.
C5. UAT targets the exact candidate build (API+web same commit, isolated
port, guest login, Auto panel, DOM capture, no provider attempt logged
from health reads). No :5000-fixed claim without redeploy evidence.
C6. Run applicable AGENTS gates (architecture minimum; self-fix/provider
gates if continuity code is touched) and record exact results.
C7. (Adopted.) Ownership: Codex isolated implementation + Muse
exact-diff review ACCEPTED in principle. CAVEAT: Codex is absent this
cycle; if Codex is still absent at implementation time, a bounded
reassignment (Muse or NVIDIA, single owner, other reviewing) is
required instead of silent waiting. No main merge until T1-T9 + U1-U5
+ reviewer ACCEPT + NVIDIA overlap statement.

## 11. Required tests (all on the EXACT candidate base)

T1 af29be95 4/4 PASS on exact candidate base (after C1 reconciliation).
T2 Router-equivalence test pinning the chosen semantic (mesh-recorded
local failure visible-or-documented via the route).
T3 Guest-role auth test (live path is Guest; JWT positive -> 200 +
provider:local shape).
T4 Full-app mount test: candidate API boots, no-auth GET -> 401 (not
404); unknown /health/xyz -> 404.
T5 No-lease-consumption (exists in af29be95) + no-provider-call
assertion (add) + no-mutation assertion (add: reset -> GET ->
circuits unchanged — pins the no-probe contract at runtime).
T6 UI contract test (shape satisfies CommandComposer guard; copy stays
readiness-neutral).
T7 Applicable AGENTS gates (architecture minimum; provider/self-fix
gates if continuity touched).
T8 (Adopted; if UI half included per E5-A.) UI bounded-fetch check:
panel open fires ONE request; failure renders 'unavailable'; exactly
one retryAt timer when blocked; no polling loop.
T9 (Adopted.) Providers regression smoke: existing openai/gemini
status + switch + clear behavior unchanged on the candidate.

## 12. Real Joe UAT (bounded, required before integration ACCEPT)

U1 Build the EXACT candidate (API + web together, recorded commit +
bundle hash). Establish :5000/candidate build provenance FIRST; never
UAT against the unknown build.
U2 Guest login on candidate UI -> open provider panel -> health line
renders from the candidate API (200 in network log); Auto remains
active; no key/probe/paid request occurs.
U3 (Adopted.) Negative: stop the candidate API route (or fresh
profile) -> panel shows 'unavailable' honestly, no crash, no false
ready badge.
U4 Copy check: idle state wording says "no cooldown recorded" (or
equivalent), NEVER "local ready/healthy"; blocked state (if inducible
via synthetic 429 record in a TEST-ONLY harness, never prod) shows
state + retryAt.
U5 Record screenshots/DOM + network evidence + candidate commit. No
broad autonomy PASS may be claimed from this endpoint UAT.

## 13. Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES under C1-C7. The 404 is real, the
route is safe and read-only, and Codex-isolated-owner/Muse-reviewer is
accepted (with the C7 absence caveat). The reconnect must not proceed
as "route + tests only" without disposing of the UI half (E5),
resolving the proven circuit-identity mismatch (GAP-1/2), and handling
the near-vacuous main-semantics signal in copy and docs (GAP-3).
