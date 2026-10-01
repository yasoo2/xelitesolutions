AGENT=MUSE
CONSULTATION_ID=PROVIDER-SETUP-EXPLICIT-CONNECT-001
STATUS=REVIEWED_BY_MUSE
POSITION=Direction APPROVED: explicit-Connect-gated dev-use flag with startup opt-in isolation is correctly implemented in the reviewed diff (only 2 checkConnection call sites; startup never passes explicitConnect; run gate stays fail-closed; backend untouched). Three changes required before integration: (1) handleDisconnect must clear nvidiaDevelopmentUse or Disconnect is not a revoke and the next background probe silently re-activates; (2) failed EXPLICIT re-verify must clear a stale true flag (failure branches preserve it via spread); (3) the bundled Gemini default swap + silent saved-model migration is out of scope and rests on an unverified external retirement claim -- split into a separate evidenced commit or remove from this slice. Earlier Muse checkbox-persistence suggestion is genuinely SUPERSEDED by explicit human UX instruction (recorded as human decision, not conceded on technical merits; timestamp/revoke hardening stays a follow-up recommendation).
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=b10fa488
MUSE_BRANCH=muse/joe-development
MAIN_HEAD=e8fd9589
REVIEWED_CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui @ 710a8908 (+dirty CommandComposer.tsx 52-line diff + untracked web/scripts/verify-provider-connect.mjs; read-only, not modified)
UPDATED=2026-10-01
ROLE_ACCEPT=YES (independent reviewer for this UI slice; no competing implementation)
SHARED_WRITE=DENIED (absolute path outside workspace; shared STATUS left PENDING_REVIEW, no claim of change). This workspace file is the authoritative Muse response for verbatim import by Codex.

## 1. ROOT CAUSE (of the UX friction this slice addresses)

Confirmed from prior exact-line review (carried forward, re-verified against the
current diff base): the NVIDIA acknowledgement lived in session-only React state
(`const [nvidiaDevAck, setNvidiaDevAck] = useState(false)`), lost on every
reload, while every request path fail-closed without it. Repeated friction was
inevitable. This slice replaces session ack with persisted successful-setup
state (`providers.nvidia.nvidiaDevelopmentUse`, inside the existing
`ai_providers` localStorage object, :1299 save / :1074 load). That is the
correct root-cause fix for the stated human requirement (common API key/model/
Connect setup, no checkbox), provided the revoke/stale-flag gaps below close.

## 2. INDEPENDENTLY VERIFIED (Muse-measured, read-only)

V1. Ran the candidate script myself, unmodified:
    `node web/scripts/verify-provider-connect.mjs` -> PASS, exit 0,
    "9 actual-handler scenarios". Transport is mocked; no external connection
    is claimed or proven by this script. The 9 = 3 providers x (success +
    failure) + first-startup + final-startup + remembered-setup.
V2. Exactly TWO checkConnection call sites exist in the candidate source:
    - :3278 startup auto-verify passes `{closeOnSuccess:false,
      background:!isLast}` -- explicitConnect is NEVER passed, so the flag
      reduces to `p.nvidiaDevelopmentUse === true` (saved setup only).
    - :4042 Connect button passes `{closeOnSuccess:true, explicitConnect:true}`
      -- the sole opt-in path. Matches the consultation's "exact refinement".
V3. Flag computation :3185 is strict:
    `key === 'nvidia' && (opts?.explicitConnect === true ||
    p.nvidiaDevelopmentUse === true)`. Non-NVIDIA providers always send false.
V4. Run gate stays fail-closed: `if (providerToSend === 'nvidia' &&
    !nvidiaDevAck)` now derives ack from persisted state and blocks with the
    clear message 'Connect & Activate NVIDIA before starting a request.'
V5. Backend untouched in this slice: dirty files are CommandComposer.tsx,
    verify-provider-model-defaults.mjs (+7, Gemini migration coverage), and 3
    creative-scope files (row-image.ts, ImageGenerationTool.ts,
    verify_pictures_are_fetched.ts). No provider-continuity / router / pipeline
    edits. `isFree:false` for NVIDIA intact (:807). Auto mesh untouched.
V6. Checkbox + bespoke notice fully removed; NVIDIA now renders through the
    generic PROVIDER_KEY_INFO card (nvidia entry :828, need:'required',
    key-link rendered :3924-3926). Script asserts absence of `setNvidiaDevAck`
    and `nvidia-development-notice`; confirmed via diff.
V7. ar/en message pairs updated together (ack/run-gate strings). No key
    material in new state; fixture key in the script is clearly fake.
V8. Overlap: ZERO case-insensitive `nvidia` references in Muse-branch
    CommandComposer.tsx (two independent searches, one file-scoped, one
    tree-scoped with 0 matches); all recent Muse commits docs-only.
    OVERLAP_WITH_MUSE_WORK=NONE. NVIDIA dirty main CLI work is separate scope.

## 3. REQUIRED CHANGES (must close before integration)

R1. DISCONNECT IS NOT A REVOKE (medium). `handleDisconnect` (:3301-3306)
    clears only isConnected/isVerifying. `nvidiaDevelopmentUse:true` survives
    in state AND in persisted localStorage, so the next startup background
    probe re-sends true and silently re-activates the "disconnected" provider.
    FIX: clear `nvidiaDevelopmentUse` (and verified) in handleDisconnect.
    This is the minimal consent-revoke path and supersedes the heavier
    timestamp/version scheme for this slice.
R2. STALE FLAG AFTER FAILED EXPLICIT RE-VERIFY (medium). Both failure branches
    (:3239-3242, :3244-3248) spread `...prev[key]`, preserving a previously
    true flag (e.g. key revoked server-side). The script's
    "failed connection cannot save activation" assertion only covers the
    fresh false->false case, not stale true-after-failure.
    FIX: clear the flag on EXPLICIT-connect failure only; keep it on
    background failure (transient network must not revoke consent). Add a
    10th scenario to the script for explicit-failure-clears.
R3. BUNDLED GEMINI DEFAULT SWAP IS OUT OF SCOPE (medium). The diff changes the
    Gemini default `gemini-2.0-flash` -> `gemini-3.5-flash-lite` and SILENTLY
    rewrites any saved exact old default. The in-code claim ("Google retired
    Joe's previous default on 2026-06-01") is an unverified external factual
    claim, and the replacement model id is unevidenced in this review. If the
    claim is wrong, this breaks working user setups without consent.
    FIX: split into a separate commit with cited evidence, or remove from this
    slice. The +7 model-defaults assertions travel with that split, not here.

## 4. MINOR / FOLLOW-UP (recommended, not blocking)

M1. Subtitle 'API key' is now hardcoded English (was a bilingual branch).
    Restore the ar/en branch.
M2. The removed notice carried two things the generic card drops: the "not
    selected automatically" sentence and the Access-terms link
    (docs.api.nvidia.com/nim). Router no-fallback behavior is unchanged, so
    users get no explanation when Auto never picks NVIDIA. Restore one clause
    + the terms link in the NVIDIA body. (Key-acquisition link survives via
    the generic getUrl rendering -- verified :3924-3926.)
M3. Key-change handler (:3950) clears verified/isConnected but keeps
    nvidiaDevelopmentUse: attestation becomes PER-BROWSER, not per-key.
    Acceptable, but state it explicitly in the integration record.
M4. Follow-up hardening (post-integration): timestamp + terms-version on the
    persisted flag with visible "Acknowledged <date> -- Revoke", per the
    earlier Muse position. Enforcement stays server-side regardless.

## 5. PROPOSAL / REQUEST ASSESSMENT

- "Manual Connect submits development-use flag; background does not opt in
  unless saved successful manual setup" -- IMPLEMENTED CORRECTLY (V2/V3).
- "Backend cost/operator/model/endpoint checks unchanged, isFree stays false,
  auto mesh excluded" -- VERIFIED (V5).
- "9-handler scenarios and 102 API policy tests pass" -- the 9 are
  independently re-run PASS by Muse (V1). The "102 API policy tests" need an
  exact suite/command citation in the integration record; backend is untouched
  so risk is low, but the number is currently unverified by Muse.
- "UI build underway" / "rendered 5002/connection evidence forthcoming" --
  AGREED as still-required; mocks are not provider PASS. No external provider
  availability is claimed or proven at this checkpoint.
- Supersession note (prior Muse checkbox-persistence suggestion superseded by
  explicit human UX instruction, not fabricated agreement) -- CONCUR. Muse
  confirms: the human instruction genuinely overrides the earlier suggestion
  on the checkbox question. Timestamp/revoke hardening (M4) remains Muse's
  standing technical recommendation as follow-up, not a condition.

## 6. SIMPLER ALTERNATIVES CONSIDERED

- Keep session checkbox + add "remember" toggle (Muse's earlier proposal):
  REJECTED by explicit human instruction; not pursued further.
- Gate persistence on explicitConnect success only, ignoring saved true on
  startup (always require fresh Connect per session): would satisfy the
  strictest consent reading but reintroduces the exact friction the human
  asked to remove. NOT recommended.
- The chosen design (persist successful manual setup; startup reuses, never
  opts in) is the smallest change satisfying the human requirement. R1/R2
  close its two real gaps without restructuring.

## 7. OVERLAP / CONFLICT / REGRESSION RISKS

- Co-dirty creative files in the same worktree (row-image.ts,
  ImageGenerationTool.ts, verify_pictures_are_fetched.ts) are a SEPARATE
  scope: must not be co-integrated or co-reviewed with this slice.
- Future whole-file CommandComposer integration will meet Muse M04 key-note
  change: note for the integration owner, not a blocker.
- Same-file sequencing: no other agent is currently editing the candidate
  composer; Codex retains sole ownership of this slice.
- Regression surface is UI-only: provider setup rendering, connect flow,
  startup probes, run gating. No planner/executor/router/persistence paths
  touched. Startup now issues a real /runs/verify call for unconfigured
  NVIDIA instead of short-circuiting (early attempts silent via
  background:true; final attempt surfaces visibly) -- intended, minor extra
  failed call on cold start.

## 8. SECURITY IMPACT

NEUTRAL. Server triple-gate (operator env + per-request ack + model/endpoint
pin) is unchanged and re-validates every request, so R1/R2 are
consent-hygiene issues, not authorization bypasses. No new storage boundary
(same ai_providers object that already holds keys); no identity/key material
added; no new logging of provider payloads (C07 precedent respected). No
credential-in-URL, no auto-selection change.

## 9. MAINTAINABILITY IMPACT

POSITIVE. Removes a bespoke `key === 'nvidia'` setup branch in favor of the
existing PROVIDER_KEY_INFO metadata seam (the direction Muse's prior review
recommended). One new optional boolean + one new opt-in param, both clearly
named. i18n discipline kept except M1.

## 10. REQUIRED TESTS (before integration)

- Apply R1/R2/R3, then re-run: verify-provider-connect.mjs (10 scenarios
  incl. new explicit-failure-clears + disconnect-clears cases),
  verify-provider-model-defaults.mjs, web typecheck + build, existing
  browser-UI contract suite (24/24).
- Cite exact command + result for the claimed "102 API policy tests".
- No weakening of existing assertions (per expanded-regression precedent).

## 11. REAL JOE UAT (required before integration, after authorized refresh)

- On 5002: desktop + mobile + keyboard walk of unified setup; key stays
  masked; manual Connect activates NVIDIA; reload preserves setup WITHOUT
  re-prompt; Disconnect revokes (post-R1: no silent re-activation on next
  startup); negative paths (no key, bad key, operator denied) block with
  actionable messages; explicit NVIDIA run produces real output.
- Source-only or mocked-UI PASS does not satisfy this gate.

## 12. LIMITS OF THIS REVIEW

- Source-level review of candidate HEAD 710a8908 + dirty diff (read-only) and
  one independent script execution (PASS exit 0). No browser execution, no
  5002 runtime check, no NVIDIA worker session inspection in this cycle.
- Independent exact-diff ACCEPT of the final R1/R2/R3 implementation is still
  required. This review is a position on the CURRENT dirty candidate, not
  integration consent.
- No competing Muse implementation created or planned. CODEX remains
  implementation owner, MUSE reviewer, NVIDIA critique pending.
