# Muse consultation response — REAL5002-NVIDIA-BACKEND-SYNC-001 (635 target)
AGENT=MUSE
CONSULTATION_ID=REAL5002-NVIDIA-BACKEND-SYNC-001-MUSE
MUSE_HEAD=0c0deb47 (review cycle; no Muse source edits for this scope)
MUSE_BRANCH=muse/joe-development
CANDIDATE_ROOT=C:/Users/home/.codex/worktrees/nvidia-main-preserved/xelitesolutions
CANDIDATE_COMMIT=635b19f84b8ca6690403c8c64a2faaa2607a0768
CAPTURED_BASE=80055bd3 (preserved main working source)
SHARED_FILE_WRITE=DENIED (expected: absolute path outside workspace; shared file left PENDING_REVIEW for Codex verbatim import; no STATUS change claimed)
STATUS=REVIEWED_BY_MUSE
POSITION=16-file scope VERIFIED on pristine bytes (861+/101-, blob-identity 16/16). 4/5 provenance files byte-identical to NVIDIA 1fd (run.ts, router, continuity, CommandComposer); pipeline delta is exactly preserved-main content + the 1 consent line (verified 80055..635 = 1 line). API runtime byte-identical f3..635 (empty diff) so f3 gates transfer by byte-identity. Independently reproduced: API tsc EXIT 0, 18/18 scoped tests (11 inherited + 7 boundary), 3/3 UI behavior scripts, web tsc EXIT 0. Cost policy preserved (free_only default untouched; NVIDIA branch cannot be bypassed even by allow_paid; no silent fallback anywhere in the diff; placeholder keys rejected at 3 layers). Vite build NOT independently reproduced (junction EPERM, environment-only). Two manifest hashes unbound to any commit (dbf-era/unknown provenance). Live tree has 792 dirty entries POST-freeze (includes deletions of all 4 scoped test files) — load must come from the commit, never the tree. Mixed-case provider handling is inconsistent (toLowerCase at 2 sites, exact 'nvidia' at 5 sites). APPROVE the composition; REQUIRE the listed changes before any load.
RECOMMENDATION=APPROVE_WITH_CHANGES
UPDATED=2026-10-01 (independent exact-commit inspection + pristine-overlay test execution this cycle; candidate repo/tree untouched by reviewer: zero writes, no checkout/worktree/stash)

## Review basis (exactness)
- Commit chain verified: 80055bd3 (captured main) -> 4dcfebda (7-file API) -> f3ce42a1 (2-file type/test) -> b03d37ce (6-file UI) -> dbf33c2d (boundary test) -> 635b19f8 (fixture fidelity 2+/2-). HEAD=635.
- Diff 80055..635: exactly 16 files, 861+/101-. Matches diff-stat.txt receipt line-for-line.
- Pristine overlay (candidate tree untouched): git archive 635 (api+web) to tmp/team-consultation/p635-pristine-635, node_modules via read-only junctions, TEMP/TMP/cache redirected. Blob-identity: git hash-object overlay == git rev-parse 635:path for 16/16 files.
- Independent reruns on PRISTINE 635 bytes: API tsc --noEmit EXIT 0; jest 4 scoped suites 18/18 PASS (policy + run-boundary + pipeline-ack + verification-boundary), JEST_EXIT=0; web scripts verify-provider-connect/connect-focus/model-defaults all PASS (15 scenarios + 15/15 focus + 13/13 models); web tsc EXIT 0.
- F3 transfer proof: git diff f3ce..635 -- api/src/api api/src/core api/src/modules = EMPTY; full f3..635 = exactly 7 files (1 API test + 6 web). f3's 10/10 gates + 11/11 + build0 transfer by byte-identity (exact-scope reuse, correctly scoped by the owner).
- Junction note: forward-slash junction targets broke node resolution (EISDIR lstat 'D:'); recreated with native backslash paths. npx is broken in this sandbox (RFC 8089 error); all tools invoked via node <binary> directly. Neither affects evidence.
- TREE DRIFT DURING REVIEW (read-only observation): live tree shows 792 dirty entries vs 635, including DELETION of all 4 scoped API test files and broad edits across orchestrator/llm/design. Checkpoint-final.json recorded trackedStatus: [] at 20:19:54Z, so the drift happened AFTER the freeze. Cause unknown (not investigated — out of scope, no writes). Every number above is measured on pristine 635 commit bytes. The live tree is NOT the frozen target.

## What the composition gets right (confirmed independently)
1. Provenance is exemplary: run.ts, intelligent-router.ts, provider-continuity.ts, CommandComposer.tsx blobs at 635 are byte-identical to NVIDIA 1fd63763. No silent rewrite of NVIDIA's work.
2. The one-line pipeline overlap is exactly one line (80055..635 for ProjectPipelineTool.ts = 1+). The large 1fd-vs-635 pipeline delta is preserved captured-main content (CLI scaffold, spec verification) — inspected, expected, untouched by the composition.
3. no_key-before-cost-checks contract VERIFIED in source (verifyProviderDirect returns no_key for keyless NVIDIA before any cost evaluation) — the proposal's core behavioral claim, plus a permanent 7-case boundary suite pinning it (all green here).
4. Strict-boolean discipline throughout: nvidiaDevelopmentUse coerced with === true at every layer (route -> verify -> router -> pipeline -> UI payload). Truthy-string bypass impossible.
5. Defense in depth, 3 layers: /start route gate (key + access-issue 400s), routeToModel gate (throws), providerAllowedByCost NVIDIA branch. Placeholder keys (free-mode/auto-mode/dummy/empty/non-ASCII) rejected consistently.
6. Cost policy untouched and unbypassable for NVIDIA: aiCostPolicy() body identical; the NVIDIA branch returns BEFORE the allow_paid check, so even allow_paid cannot silently opt NVIDIA into Auto routing. No paid fallback introduced anywhere.
7. Honest-stop over silent fallback: 5 router sites throw for NVIDIA instead of falling back to the mesh (cost/auth/quota/circuit/catch); UI deletes the silent pickFirstValidProvider fallback (~23 lines removed) and gates run/queue on ensureSelectedProviderReady (queue pauses WITHOUT dequeuing — no draft loss; run refuses before session/draft consumption).
8. Ultra-specific contract correctly scoped: template options + 32768 cap + thinking flags apply ONLY to nvidia/nemotron-3-ultra-550b-a55b; truncation (finish_reason=length) throws provider_response_truncated instead of delivering a cut artifact. generationOptions is empty for all other providers (zero behavior change).
9. Key lifecycle fixed: deleting the active keyed provider returns to 'auto' (was: keyless 'openai'); disconnect/delete revoke dev-use and win over in-flight verifications via generation guards; explicit Connect & Activate is the only opt-in (startup probes can only reuse, never opt in).
10. UI honesty improvements verified in diff: verified=true only after live success; exact-retired-default Gemini migration (custom models preserved — pinned by 13/13 model script); per-provider model placeholder (fixes gpt-4o confusion); focus trap + dialog a11y + mobile CSS are scoped and clean.
11. No secrets/key material in the diff; no new network endpoints; no persistence schema change; no worker/launcher/process control.

## Root cause of the findings
A correct byte-level composition with two evidence-hygiene gaps (manifest generated pre-final-bytes for 2 files; post-freeze tree drift by an unknown writer), one genuine code robustness gap (case-sensitivity inconsistency across 7 NVIDIA check sites), and one environment-only verification gap (junction EPERM blocks independent vite build). Nothing in the 16-file content is wrong.

## Findings REQUIRING changes (before any LOAD; none blocks composition approval)
P635-H1. MANIFEST BINDS 14/16, not 16/16. Manifest hashes match pristine-635 raw bytes for 14 files; provider-verification-boundary.test.ts matches NEITHER 635 nor dbf blobs (635 changed it 2+/2- after the manifest; dbf blob hash 84bd0d1f... also differs — provenance of the manifest entry unknown); real-joe-ui-fresh-test.spec.ts matches NO commit blob (untouched since f3, yet f3/635 blob dbb0b8a9... differs from manifest 3FDCF7AC...). Prescription: regenerate checkpoint manifest on exact 635 bytes (or the exact final bytes) and re-verify 16/16 before load. Evidence-hygiene only; the commit itself is fully verified here.
P635-H2. POST-FREEZE TREE DRIFT (792 dirty, incl. 4 scoped-test deletions). Prescription: load/integrate ONLY from commit 635b19f8 bytes (fresh clone/archive + hash check), never from the live tree; re-freeze discipline (clean-tree check bound to rev-parse at load time). The drift cause needs no investigation for this verdict, but the tree must not be mistaken for the target.
P635-C1. MIXED-CASE provider handling (genuine robustness gap, P1). 'nvidia' is matched with toLowerCase() at 2 sites (cost-check gate, VENDOR_BASE) but exact === 'nvidia' at 5 sites (auth/quota/circuit throw sites, local-brain exclusion, isNvidiaUltra). A config spelling 'NVIDIA'/'Nvidia' would pass strict cost gating yet silently receive local-brain substitution + mesh fallback + skipped Ultra options. Prescription: normalize cfgProvider once at route entry (const nvidiaSelected = String(cfgProvider).toLowerCase() === 'nvidia') and use it at all 7 sites + the error-message ternaries; add 2 permanent tests (uppercase NVIDIA gets strict-throw behavior; Ultra options resolve case-insensitively or are explicitly documented case-sensitive). Small, bounded, NVIDIA-scoped.
P635-B1. VITE BUILD not independently reproduced (environment-only). Build fails at config-load with EPERM writing node_modules/.vite-temp through the read-only junction — a method artifact, not a source defect. Prescription: require a fresh bound vite build (rev-parse + status + exit + compiled-flag grep) on the exact load bytes before official-5002 loading; do not treat the owner's build receipt as independently verified.
Carry-over (NOT blockers, tracked): Google default change (bundled, vendor-doc-checked, migration pinned — keep explicit in load notes); dev-ack persistence in localStorage without timestamp/version (revocation works; consent-versioning is follow-up scope); NVIDIA's own 1-line pipeline-overlap + cost-policy review (NVIDIA consultation side, still pending); live NVIDIA activation + multi-prompt 5002 UAT (required AFTER reviewed load, correctly not claimed).

## Pre-existing / out-of-scope items correctly NOT attributed
- Captured-main content (CLI scaffold, spec verification, dirty tests) is preserved context, not composition behavior; reviewed only for preservation (intact).
- 164-registered-tools observation (jest setup log, main-lineage bytes) vs 163 on composed-5f bytes: 1-tool lineage delta, recorded in wiring checkpoint 075, not a composition defect.
- Runtime provenance (PID31464, dist hash, no-commit-file) unchanged by this review; no process inspection performed.

## Proposal errors / corrections
1. "16 files" TRUE; file list and 861+/101- counts VERIFIED exact.
2. "API runtime byte-unchanged from f3" TRUE (empty diff proven here) — f3 gate reuse is legitimate exact-scope reuse.
3. "trackedStatus: []" was TRUE at 20:19:54Z and is FALSE now (792 dirty). Bind tree-state to rev-parse at every future checkpoint.
4. Vendor-doc note (gemini-3.5-flash-lite ID + free tier) accepted as documentation check; live key/account access correctly NOT_PROVEN and not claimed.
5. "No mocked network called real vendor" TRUE for all reruns here (vendorCalls=0; scripts use transport mocks/DOM fixtures — correctly labeled, not UAT).

## Simpler alternatives considered
- Load API-only (f3) without UI: REJECTED — owner's frontend-gap evidence (nvidiaDevelopmentUse count 0 in served dist) proves API-only adoption cannot complete the browser handshake; paired loading is required.
- Re-verify by rebuilding node_modules writable copy: REJECTED as disproportionate — tsc + scripts + byte-identity + bound-build-at-load is sufficient; a full independent build adds little once H2/B1 gates are honored.
- Treat manifest mismatches as content suspicion: REJECTED — 16/16 blob-identity to the commit is stronger than the manifest; the mismatch is receipt staleness, not content doubt.

## Overlap with existing work (scope flags, no action taken)
- Zero overlap with Muse lanes (redactor repair; read-only wiring discovery; 003/004 semantic reviews) and zero with the Windows/checkpoint candidate.
- NVIDIA owns: 1-line pipeline overlap review + cost-policy review (its consultation side) + retained CLI dirty work inside 80055. This review judges the composition only and grants no ownership change.
- Semantic line (7812..5f) and provider line (80055..635) are disjoint scopes on disjoint bases; no cross-attribution performed or implied.
- No competing Muse implementation exists or is planned.

## Conflict / regression risks of the REQUIRED changes
- H1/H2/B1 are zero-behavior (receipt regen + load discipline + bound build).
- C1 narrows-or-equal behavior for non-lowercase spellings only; lowercase path (all 18 tests + all scripts) is untouched; every existing NVIDIA negative re-verified by the 18-test + 15-scenario pins.
- No provider/LLM/persistence/API/cost-policy impact beyond the NVIDIA-selected path; other providers see zero diff lines in behavior (verified: all non-NVIDIA hunks are additive branches or UI-only).
- Largest risk is procedural (H2): loading from the drifted tree instead of the commit. The bound-archive prescription eliminates it.

## Maintainability / security / portability
- Strict improvement: typed strict-boolean consent replaces truthy checks; honest-stop replaces 2 silent-fallback paths; error taxonomy (no_key/operator/ack/model/endpoint) is explicit and UI-surfaced bilingually.
- Security: placeholder-key rejection at 3 layers; endpoint allowlist is exact-match (protocol+host+port+path, no userinfo/query/hash); model regex anchored; no key material logged (safeProviderError preserved at all touched log sites — verified in diff).
- No new dependencies, no persistence changes, no localhost hard-codes, no multi-user state (per-request flags + existing circuit keys); the diff is deployment-portable.
- Consent persistence without timestamp/version is the one security-hygiene carry-over (accepted for dev-testing; revocation paths verified).

## Required tests (before any LOAD of this line)
1. H1: regenerated manifest verifies 16/16 on exact final bytes.
2. C1: uppercase-NVIDIA strict-behavior pins (throw, no fallback) + Ultra case disposition; 18/18 + scripts re-green.
3. B1: fresh bound vite build on exact load bytes (rev-parse + clean status + exit 0 + compiled nvidiaDevelopmentUse grep in emitted assets).
4. Full 10 AGENTS gates on the EXACT final bytes with bound rev-parse + status (f3's 10/10 transfers by byte-identity ONLY if API runtime remains byte-identical; any C1 touch re-runs affected gates).
5. NVIDIA overlap review (pipeline 1-line + cost policy) recorded in writing.
6. Load from commit bytes (fresh archive + 16/16 hash check), never from the drifted live tree.
7. AFTER load: real NVIDIA Connect & Activate with the configured key, then fresh multi-prompt 5002 UAT per ACTIVE-PLAN (bill + calculator + converter/contact-form + non-web transfer), terminal runs, physical-file + rendered-control inspection.

## Real Joe UAT
NOT_RUN (correctly — isolated candidate, no integration). No UI verdict inferred from 18/18, scripts, or typechecks. Feasibility this cycle: :5002 HTTP 200 (uptime ~2h, version=no-commit-file, UNBOUND) and :5000 HTTP 200, both healthy; provider activation still gated per shared state. NO_LAUNCH (official target live; provenance unbound; activation gated; this review is the prerequisite step).

## Verdict rationale
The composition is byte-faithful to NVIDIA's 1fd work, preserves all captured-main content, keeps cost policy unbypassable, replaces two silent fallbacks with honest stops, and is pinned by 18 API tests + 3 UI behavior suites + double typechecks — all independently reproduced on pristine commit bytes with zero regressions in scope. The remaining items (2 unbound manifest hashes, post-freeze tree drift, case-normalization, unreproduced build) are bounded, prescribed, and procedural/robustness-grade — nothing in the 16-file content is wrong. Hence APPROVE_WITH_CHANGES, not REWORK and not bare APPROVE (H1/H2/C1/B1 + NVIDIA review + bound gates + post-load UAT gate adoption).
FIXES_REQUIRED_BEFORE_LOAD=P635-H1-manifest-regen-16-16; P635-H2-load-from-commit-bytes; P635-C1-provider-case-normalization-plus-pins; P635-B1-bound-vite-build-at-load; nvidia-overlap-review; gates-10-of-10-bound-on-final-bytes; post-load-activation-plus-multi-prompt-UAT.
REVIEW_COMMANDS=(pristine overlay under tmp/team-consultation/p635-pristine-635, candidate tree untouched):
git archive 635b19f8 api web; tar -xf (file-based); node_modules junctions (read-only, backslash targets); TEMP/TMP/cache redirected; node-direct binary invocation (npx broken in sandbox)
git hash-object overlay == git rev-parse 635:path => 16/16; git diff f3ce..635 -- api runtime => EMPTY; git diff 80055..635 -- pipeline => 1 line
node tsc --noEmit (api) => EXIT 0; node jest 4 suites => 18/18 JEST_EXIT=0; 3 web scripts => PASS/15-15/13-13; node tsc (web) => EXIT 0; vite build => EPERM (junction artifact, disclosed)
1fd blob compare => 4/5 identical (pipeline delta = preserved-main, expected); manifest raw-hash => 14/16 (2 unbound, disclosed)
live-tree status => 792 dirty incl. 4 scoped-test deletions (post-freeze drift, disclosed)
