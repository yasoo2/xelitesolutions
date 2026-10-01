# Muse review — NVIDIA-PROVIDER-UI-CANDIDATE-19DEB48C
AGENT=MUSE
CONSULTATION_ID=NVIDIA-PROVIDER-UI-CANDIDATE-19DEB48C
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES (candidate direction sound and supersedes c8524f01 policy-wise; 19deb48c key-removal fix verified correct for the reported bug; integration blocked on R1 silent-ineffective server clear, R2 one-seam disposition, R3 consent persistence, R4 re-verification at integration base)
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=88e27a54
MUSE_TREE=tracked clean (untracked tmp/audit evidence preserved, nothing deleted)
CANDIDATE_COMMITS=65828b8b,19deb48c (exact; branch has since advanced to 46bf42f8 — this review covers ONLY the two named commits)
CANDIDATE_PARENT=65828b8b~1 = e8fd9589 (current main; verified, so no Codex-branch-only rebase gap for this candidate)
C8524F01_PARENT=a926caee (Codex-branch-only; verified — c8524f01 still needs semantic rebase if ever used)
DRAFT_STATE=PRESERVED_UNTOUCHED (former untracked api/src/core/llm/providers/nvidia.ts is now tracked at 94394552 "preserve NVIDIA NIM transport" + contract test; zero production imports — verified via git grep at HEAD)
MAIN_STATE=e8fd9589 + 14 dirty tracked files (none provider-related); zero nemotron/nvidia-endpoint matches in main api/src+web/src at e8fd9589 (verified)
NO_AGREEMENT_IMPLIED=YES
SHARED_FILE_WRITE=DENIED_BY_SANDBOX (absolute path outside workspace; coordinator imports via COORDINATION_FALLBACK. This workspace file is the authoritative Muse position.)

## 1. Root cause of the reported 19deb48c bug (confirmed from pre-image)
Pre-19deb48c `deleteProviderKey` ended with `if (!isFree) setActiveProvider('openai')` — unconditional. Removing ANY non-free provider key (e.g. a non-active synthetic NVIDIA key) silently switched the runtime provider to OpenAI, even keyless. The browser finding is fully explained by this line; no deeper cause needed.

## 2. 19deb48c fix verification (safe means: exact-source inspection at 19deb48c)
- Single caller: CommandComposer.tsx:3981 (Clear-Key button onClick). No other deleteProviderKey call sites.
- Cancel path: `if (!confirm(...)) return false` + caller `if (!deleteProviderKey(...)) return;` → server fetch skipped. Confirm-gate CONFIRMED.
- Non-active paid key removal: `activeProvider === key` false → no switch. Reported bug FIXED.
- Active paid key removal: `setActiveProvider('auto')`. 'auto' is a valid DEFAULT_PROVIDERS entry (:798, isFree, connected) — no keyless-paid activation. CORRECT.
- handleDisconnect (:3275, used at :4082) never touches activeProvider — no parallel silent-activation path. CLEAR.
- Free-provider reset to 'free-mode' + isConnected preserved. Unchanged behavior, still correct.

## 3. REMAINING MISMATCH — R1 (new finding, blocking for integration)
The server-side OpenAI clear is silently ineffective:
- Clear-key onClick sends `fetch(${API}/providers/clear)` with NO Authorization header (contrast handleDisconnect, which sends the bearer token).
- `POST /providers/clear` (providers.ts:258, no auth middleware) only calls `setDynamicOpenAIKey` when `(req).user?.id` exists, yet returns `{success:true}` regardless → false success.
- Net effect: UI shows the key removed while the server retains the dynamic OpenAI key for the logged-in user.
- Secondary: endpoint docstring "Clear all provider configurations" overstates (only the dynamic OpenAI key); fire-and-forget fetch never checks response status.
- Required fix: (a) include the bearer token in the clear-key fetch (same pattern as handleDisconnect); (b) return 401 when unauthenticated instead of false success; (c) correct the docstring; (d) check response status in the UI call. Small, bounded, no architecture change.

## 4. 65828b8b vs c8524f01 — provenance, duplication, seams
- OVERLAP (textual + semantic, cannot both apply): nvidia DEFAULT_PROVIDERS entry, PROVIDER_KEY_INFO nvidia row, initialProviderState nvidia, VENDOR_BASE nvidia, knownCustomEndpoint 'nvidia', continuity alias/host/envkey rows. 65828b8b re-derives these from main e8fd9589 with opposite policy (isFree:false, Dev/Test section, ack checkbox, AI_NVIDIA_DEV_ACCESS=1 operator flag, per-request ack, exact-endpoint + nvidia/* model gate, no-silent-fallback throws).
- c8524f01 policy defect stands: bare `isFree:true` + provFree + free_only allowlist misrepresents Developer Program dev/test access as unconditionally free (NVIDIA FAQ: production serving needs AI Enterprise). SUPERSEDED by 65828b8b — do not integrate c8524f01 as-is. Preserved as evidence only.
- Ack propagation is coherent end-to-end: UI checkbox → /start + /verify bodies → run.ts gates → verifyProviderDirect cfg gate (:2854/:2857) → routeToModel modelConfig gate (:1595/:1613). Candidate's own test asserts ack-present verify resolves (provider-continuity.test.ts:85). Accepted at assertion level; I did NOT re-run the candidate suites (see R4).
- Server trusts the client's boolean ack claim (session-local UI state, no timestamp/version/revocation/persistence). Acceptable for an isolated candidate; integration must carry the PROVIDER-SETUP-CONSISTENCY-001 consent-persistence conditions (already recorded in my earlier APPROVE_WITH_CHANGES review).

## 5. R2 — one-seam disposition (blocking for integration)
Three NVIDIA approaches exist: (a) 65828b8b router seam (recommended survivor), (b) c8524f01 router variant (superseded, preserve as evidence), (c) Muse providers/nvidia.ts native-fetch class + contract test (tracked at 94394552, zero production imports — staged, harmless, but a second seam + different default model super-120b vs ultra-550b). Integrate exactly one seam: keep (a); explicitly park (c) with a one-line pointer comment or remove it at integration time with its test. Do NOT silently leave two NVIDIA paths.

## 6. Proposal errors / simpler alternatives
- No structural error in the candidate direction; R1 is an inherited pre-existing endpoint weakness the patch exposes, not a flaw in the patch's own logic.
- Simpler alternative to (b)+(c): land UI entry + honest no-key verify + qualified label only (my earlier CONTINUITY-001 §3). Still valid as a fallback if the full policy seam stalls — but 65828b8b already implements the fuller correct policy, so prefer it with R1–R4.

## 7. Conflict / regression risks
- Zero file overlap with NVIDIA's dirty CLI/spec scope (verified file lists). Sequencing dependency only: provider-continuity.ts + intelligent-router.ts are shared with lease-fence/DuckAI candidates — order explicitly, re-verify after each.
- Regression surface of R1 fix: OpenAI key lifecycle only; guard with a focused test (clear without token → 401; clear with token → server key gone; UI state matches server state).
- Main/NVIDIA runtime behavior unchanged by this review (read-only; no source, Git, process, or coordination-state mutation by Muse this cycle beyond this response file + live report).

## 8. Maintainability / security impact
- 65828b8b improves honesty (no silent fallback, explicit errors, docs). No secret logging added (keys stay in existing flows; no key copied by the integration).
- Security note: /clear false-success (R1) is the only new honesty gap found; fix as above. Ack-spoofing (client boolean) is a known accepted limitation pending consent persistence (R3).

## 9. Required tests (before ACCEPT of any integration)
- R1: unauthenticated /clear → 401; authenticated clear → dynamic key empty; cancel-confirm → no fetch (unit/DOM); response-status check covered.
- Keep candidate tests (policy negatives: untrusted endpoint, non-blank port, unknown model, missing ack/key/operator flag; no-fallback honesty on 429/auth).
- Provider-continuity + router suites + tsc/build + AGENTS architecture/package-script gates on the integration base (candidate evidence 34/34 + gates is REPORTED_BY_CODEX at 65828b8b/19deb48c, not re-run by Muse).

## 10. Real Joe UAT (before VERIFIED)
On one reviewed build with safe test access (never the user's real key): panel shows Dev/Test NVIDIA section with license notice; select without ack → blocked with honest message; select with ack + test key → direct verify of THAT endpoint/model; forced 429/auth failure → honest message, no other-provider answer shown as NVIDIA; key removal (active + non-active cases) → Auto preserved, server key actually cleared; served bundle contains the entry (rebuild proof). No production deployment.

## 11. Overlap statement
No overlap with Muse's wiring-audit/UI-001 work this cycle (review only, no provider source touched). No file overlap with NVIDIA's dirty work. Muse is AUTHOR-BIASED on c8524f01 mechanics (Muse authored it) — but this review's R1/R2/R3/R4 objections are independently evidenced above and stand regardless; the core recommendation (prefer 65828b8b over my own c8524f01) runs against my authorship bias.
