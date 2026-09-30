AGENT=MUSE
CONSULTATION_ID=LOCAL-PROVIDER-HEALTH-RECONNECT-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=REUSE_IS_CORRECT_BUT_ROUTE_ONLY_IS_HALF_THE_FEATURE_ON_CURRENT_SOURCE
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=90fba4a4
DATE=2026-09-30
SHARED_WRITE=DENIED_ACCESS_DENIED (this fallback file is the authoritative Muse response; Codex may import verbatim after transcript verification)

## 1. What I independently inspected (this cycle, read-only)

- D:\Joe\muse-worktree\api\src\api\routes\providers.ts (full 279-line read): NO /health/local route. Routes present: openai key/status/test, switch, gemini key/status/test, clear.
- D:\Joe\xelitesolutions\api\src\api\routes\providers.ts (READ-ONLY grep): NO health match. `git diff --stat` on that file: clean (no NVIDIA dirty overlap on this file).
- D:\Joe\muse-worktree\api\src\api\app.ts:291: `apiRouter.use('/providers', providersRoutes)` — mount exists, so the route WILL be reachable at /api/providers/health/local once added.
- Commit 9de4b7e6 in D:\Joe\worktrees\codex-integration-20260928 (READ-ONLY `git show`, no checkout/edit): full diff of providers.ts (+9), provider-health-route.test.ts (+71 new), CommandComposer.tsx (+55/-3), joe-premium.css (+5).
- Web SOURCE grep for `providers/health` and `health/local` across web/src in BOTH muse-worktree and xelitesolutions: ZERO matches. The UI requester is absent from current source in both trees.
- Main built bundle D:\Joe\xelitesolutions\web\dist\assets\Joe-CsSAEOKM.js:450: CONTAINS minified `fetch(`${ke}/providers/health/local`)` — the 9de4b7e6 UI half IS in main's dist but NOT in main's source. Muse dist Joe bundle: NO match.
- Circuit identity: provider-continuity.ts:63-81 (HMAC key derivation) + intelligent-router.ts mesh walk lines 2400-2403, claim bypass 2401, failure-recording exclusion 2632, empty-response writer 2629, rescue writer 2725.
- Live read-only probe this cycle: GET http://127.0.0.1:5000/api/providers/health/local -> HTTP 404 (route absent; a present route would 401 without token). No auth attempted, no state changed.
- BACKLOG-RECONCILIATION.md LOCAL_HEALTH_RECONNECT entry + team verification REAL-JOE-PROVIDER-VISIBILITY-5000-20260930.md (Codex 404 evidence) + proposal LOCAL-PROVIDER-HEALTH-RECONNECT-001.md (full read).
- I did NOT re-run provider-health-route.test.ts inside the Codex worktree (would write caches into another participant's tree). I cite Codex's recorded run: 2/2 PASS, exit 0, 3.487s, synthetic JWT + ephemeral server.

## 2. Root cause (agreed, with one sharpening)

Agreed: the user-facing "cannot read local provider health" is a REAL wiring split — a served UI that fetches /api/providers/health/local against an API that has no such route (live 404 reproduced this cycle).

Sharpening from my inspection: on CURRENT main/muse source the split is WORSE than "route missing". The UI half is ALSO missing from current source; it survives only inside main's checked-in dist bundle (Joe-CsSAEOKM.js:450), whose build provenance is unknown (TEAM-STATE: :5000 version=no-commit-file). Consequences:
(a) The 404 reproduces only against that stale/unknown build, not against a fresh build of current source (fresh build would never request the endpoint).
(b) Re-adding ONLY the route to current main yields a correct but CALLERLESS endpoint on any fresh build until the UI half is also reintegrated.
This does not invalidate the proposal — the route is still the correct bounded repair — but the candidate MUST dispose of the UI half explicitly (see condition C1), and UAT MUST identify the exact candidate build instead of re-probing unknown :5000 (see C2).

## 3. Proposal errors / gaps found

E1. Scope sentence "reuse just this bounded route and tests" leaves the UI half orphaned. 9de4b7e6 is ONE feature in 4 files; reusing 2 of 4 files onto a base that contains neither half fixes the unknown-build 404 but ships dead API surface on fresh builds. Not a rejection — a scoping gap to close.
E2. "Confirm whether the old test's circuit key still equals the current Auto router key" — I confirm YES for the mesh path (both call providerCircuitKey('Local (Auto)') with no config -> identical HMAC over [local, endpoint, environment-scope, env-credential-or-'']). BUT the more important semantic fact is unmentioned: router line 2632 NEVER records Local exceptions (`if (p.name !== 'Local (Auto)') recordProviderCircuitFailure`), and line 2401 bypasses Local claim. Writers under the Local key are only the empty-response leg (2629) and rescue-retry failure (2725). So the endpoint will report blocked:false ~always BY DESIGN. The proposal's "blocked=false is not readiness" warning is correct and must be UPGRADED to a panel-copy rule (C4), because the copy is the only thing standing between "no cooldown recorded" and a false "local ready" impression.
E3. providerCircuitStatus blocked-condition (`retryAt > now || probingUntil > 0`, provider-continuity.ts:137) inherits the OPEN PROVIDER-LEASE-EXPIRY stale-probingUntil defect (probingUntil>0 vs >now). A stuck probingUntil would pin the panel on "paused" indefinitely. Mirroring router behavior exactly is still correct (same function = same truth), but the candidate must crosslink the lease issue so a stuck panel is diagnosed as circuit-memory, not probed as a local outage (C5).
E4. Tenant-scope limitation unstated: the route reads the environment-scope DEFAULT local circuit. A user-specific custom local endpoint (baseUrl/apiKey config -> different HMAC key, lines 70-80) is NOT reflected. No privacy leak (no key material in the response; test asserts exact key set + key absence), but the panel must be documented as "shared Auto-mesh local circuit", not "your local endpoint" (C5).

## 4. Simpler alternatives considered

- Write a new route from scratch: REJECTED — worse in every way (new unreviewed code vs a tested, authenticated, side-effect-free 9-line route + 71-line test).
- Reuse route WITHOUT authenticate to "fix guest": REJECTED — the test pins 401 behavior and exact response shape; guests carry JWT (UI uses authenticatedHeaders), so guest works through the existing middleware. A guest-token positive test is required (C3), not an auth removal.
- Live-probe Ollama/health endpoint instead of circuit memory: REJECTED — violates the proposal's correct no-probe constraint; would spend quota/time and confuse readiness with quota state.
- Include the 9de4b7e6 UI half in the same bounded candidate: RECOMMENDED as default (C1, option A) — same commit, same feature, single-shot fetch + one retryAt timer (no polling loop), honest 'unavailable' fallback already in the code.

## 5. Overlap with existing work

- Codex isolated provider-UI candidate branch codex/nvidia-provider-ui (65828b8b/19deb48c/4f1776c1): touches the SAME provider panel surface (CommandComposer provider section) + providers router policy. The health badge MUST survive whichever panel ships; the reconnect diff must be checked against that candidate's panel so they compose instead of forking the UI. No file-level collision with NVIDIA dirty main (providers.ts clean; NVIDIA owns planning/intent/pipeline/memory/registry drafts).
- TOOL-HTTP-OWNER-GATE theme: this route is NOT another bypass — it uses `authenticate` and exposes only aggregate circuit booleans, no session/project/key material. The 401-first test pins this.
- Wiring audit: this is a CONFIRMED instance of the audit's "source presence != wiring" class (UI half in dist without API half in source). No audit-count claim follows from one route.

## 6. Conflict / regression risks

- LOW functional risk: purely additive authenticated GET; existing key/status/switch/clear routes untouched (candidate diff must show zero changes to them).
- Risk 1 (panel fork): two provider-panel variants (9de4b7e6 health UI vs Codex isolated provider UI) diverging. Mitigate by C1 + C6.
- Risk 2 (stale-build confusion): verifying against unknown :5000 instead of the exact candidate proves nothing. Mitigate by C2.
- Risk 3 (readiness overclaim): idle copy implying Ollama installed/reachable. Mitigate by C4 (copy rule + no 'healthy/ready' wording for blocked:false).
- Risk 4 (stuck-probe pinning): E3. Mitigate by C5 (crosslink + retryAt visibility; the 9de4b7e6 UI already renders retryAt-gated copy).
- No main integration, no runtime restart, no worker interruption authorized by this review.

## 7. Maintainability / security / portability impact

- Maintainability: POSITIVE if C1 resolves the UI half (one feature, one place, tested). NEUTRAL-NEGATIVE if route-only ships callerless (dead surface future engineers must explain).
- Security: NEUTRAL-POSITIVE. No credential/circuit-key exposure (test-pinned), auth-first, read-only map lookup + Date.now, no model/probe/quota side effects. Tenant note: response is per-process circuit memory shared across users — acceptable because it contains no user-identifying or key material, only aggregate cooldown booleans; document this.
- Portability/multi-user: route is stateless w.r.t. storage (process-local circuit map); behind a future multi-instance deployment each instance reports its own memory — document as known limit, same class as all process-local circuit state. No Windows/Unix-specific behavior.
- No secrets, no destructive actions, no deploy/production surface.

## 8. Required tests (must be on the EXACT candidate base, not just the preserved worktree)

T1. Reused provider-health-route.test.ts 2/2 PASS on the candidate base (re-run; Codex's 3.487s run was on the preserved tree).
T2. NEW guest-token positive: guest JWT -> 200 + provider:local shape (proposal already asks; I require it as a test, not manual-only).
T3. NEW no-mutation assertion: calling the endpoint does not create/alter circuit entries (reset -> GET -> circuits unchanged) — pins the no-probe contract at runtime, not just by reading the diff.
T4. Mount check: candidate API boots, no-auth GET -> 401 (not 404); unknown /health/xyz -> 404.
T5. UI bounded-fetch check (if C1-A): panel open fires ONE request; failure renders 'unavailable'; exactly one retryAt timer when blocked; no polling loop.
T6. types/build + applicable permanent gates for touched areas (architecture guard at minimum; no full self-fix battery needed for an additive route, but run what the decision owner specifies).
T7. Regression: existing providers routes' behavior unchanged (openai/gemini status + switch + clear smoke on candidate).

## 9. Real Joe UAT (required before any fixed claim)

U1. Build the EXACT candidate (API + web together, recorded commit + bundle hash). Identify :5000 provenance FIRST; do not UAT against the unknown build.
U2. Guest login on candidate UI -> open provider panel -> health line renders from the candidate API (200 in network log); Auto remains active; no key/probe/paid request occurs.
U3. Negative: stop candidate API route (or fresh profile) -> panel shows 'unavailable' honestly, no crash, no false ready badge.
U4. Copy check: idle state wording says "no cooldown recorded" (or equivalent), NEVER "local ready/healthy"; blocked state (if inducible via synthetic 429 record in a TEST-ONLY harness, never prod) shows state + retryAt.
U5. Record screenshots/DOM + network evidence + candidate commit. No broad autonomy PASS may be claimed from this endpoint UAT.

## 10. Conditions for APPROVE_WITH_CHANGES

C1. Dispose of the UI half: either (A) include the 9de4b7e6 CommandComposer+CSS UI part in the SAME bounded candidate (preferred; same feature, bounded, honest fallback), or (B) scope route-only explicitly WITH a named UI follow-up owner and a written justification for shipping a callerless endpoint. No silent (B).
C2. Establish :5000/candidate build provenance before UAT; UAT targets the exact candidate build only.
C3. Add T2 (guest positive) + T3 (no-mutation) tests to the candidate.
C4. Panel-copy rule: blocked:false MUST render as "no cooldown recorded", never "ready/healthy"; document that Local exceptions are not recorded by router design (intelligent-router.ts:2632), so the badge is quota-memory, not liveness.
C5. Document (in candidate notes, not necessarily code): tenant-scope limit (E4) + stale-probingUntil crosslink (E3) + multi-instance memory limit.
C6. Coordinate with codex/nvidia-provider-ui candidate so the health badge composes with (not forks) the provider panel; NVIDIA states router/circuit-key overlap at its safe checkpoint per proposal.
C7. Ownership: Codex isolated implementation + Muse exact-diff review (as proposed) — ACCEPTED in principle. CAVEAT: the active CRITICAL audit runs in TWO_AGENT_CONTINUITY with CODEX_STATUS=TEMPORARILY_UNAVAILABLE; if Codex is still absent at implementation time, a bounded reassignment (Muse or NVIDIA, single owner, other reviewing) is required instead of silent waiting. No main merge until T1-T7 + U1-U5 + reviewer ACCEPT + NVIDIA overlap statement.

## 11. Verdict

The failure is real (live 404 reproduced), the preserved fix is genuine (Muse-authored 9de4b7e6, bounded, tested, side-effect-free), the circuit identity matches the current Auto mesh key, and reuse beats reinvention. But route-only onto current source ships half a feature (no in-source caller; requester survives only in a stale dist bundle), and the endpoint's near-always-false semantics plus lease-memory caveats must be handled in copy and docs. APPROVE_WITH_CHANGES subject to C1-C7.

EVIDENCE_PATHS=muse-worktree api/src/api/routes/providers.ts (279 lines, no health); xelitesolutions providers.ts (no health, git-clean); web/src both trees (no health/local); xelitesolutions web/dist/assets/Joe-CsSAEOKM.js:450 (requester present); muse dist Joe bundle (absent); provider-continuity.ts:63-81,135-139; intelligent-router.ts:2400-2403,2629,2632,2725; app.ts:291; live GET :5000/api/providers/health/local -> 404 (2026-09-30, no-auth, read-only)
NO_SOURCE_MODIFIED_BY_THIS_REVIEW=true
NO_WORKER_INTERRUPTED=true
