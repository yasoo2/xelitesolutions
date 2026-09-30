AGENT=MUSE
CONSULTATION_ID=PROVIDER-SETUP-CONSISTENCY-001
STATUS=REVIEWED_BY_MUSE
PRIORITY=HIGH
PROPOSAL=proposals/PROVIDER-SETUP-CONSISTENCY-001.md
MUSE_HEAD=ffaeb342
MUSE_BRANCH=muse/joe-development
REVIEWED_CANDIDATE=D:\Joe\worktrees\codex-nvidia-provider-ui @ 10881308 (+dirty UI/badge diff 19+/49-, read-only, not modified)
UPDATED=2026-09-30
RECOMMENDATION=APPROVE_WITH_CHANGES
SHARED_WRITE=DENIED (Access denied on shared consultation path; this workspace file is the authoritative Muse response for verbatim import)

## POSITION

APPROVE_WITH_CHANGES. The proposal's core direction is sound: unify the NVIDIA
setup experience with other providers through existing metadata/rendering paths,
keep the backend acknowledgement/cost contract intact, and do not relabel
`isFree`. Two corrections narrow the scope: (1) the provider list is ALREADY a
single common list — only the subtitle branch and the setup card are bespoke, so
no list-merge work exists; (2) consent persistence is a per-browser UX
convenience only and must carry timestamp + terms-version + visible revoke, with
the server per-request check unchanged. Smallest change: fold the dev-notice
into the generic PROVIDER_KEY_INFO card as a metadata-driven consent slot, and
persist ack as a separate localStorage object, not a silent bundled flag.

## EVIDENCE INSPECTED (all read-only, exact lines)

1. Candidate CommandComposer.tsx:1124 — `const [nvidiaDevAck, setNvidiaDevAck]
   = useState(false);` — session-only, lost on reload. ROOT CAUSE of repeated
   acknowledgement friction confirmed.
2. Candidate CommandComposer.tsx:2753 (run) and :3168 (verify) — both
   fail-closed with explicit error when NVIDIA selected without ack. No silent
   bypass exists. Correct behavior; must be preserved.
3. Candidate CommandComposer.tsx:2781 and :3191 — per-request
   `nvidiaDevelopmentUse` flag sent in payloads. Server re-checks every
   request; a remembered checkbox can never bypass the backend.
4. Candidate provider-continuity.ts:42-52 — `nvidiaDevelopmentAccessIssue`
   triple-gate: operator env `AI_NVIDIA_DEV_ACCESS=1` AND `acknowledged===true`
   AND model `nvidia/...` format AND pinned `integrate.api.nvidia.com`
   endpoint. :56-62 — `providerAllowedByCost` gates NVIDIA on this check.
5. Candidate CommandComposer.tsx:3804-3810 — NVIDIA subtitle branch inside an
   otherwise COMMON provider list (single map ~3795-3815). There is no separate
   list section; unification scope = subtitle + setup card only.
6. Candidate CommandComposer.tsx:3889-3900 (bespoke dev notice + checkbox) vs
   3902+ (generic PROVIDER_KEY_INFO info-box, NVIDIA explicitly excluded).
   PROVIDER_KEY_INFO already contains an `nvidia` entry (`need:'required'`,
   build.nvidia.com URL) — the metadata seam for unification already exists.
7. Persistence architecture: candidate :1284 persists the WHOLE `providers`
   object (including apiKeys) to localStorage `ai_providers`; :1067 reloads it.
   Same in Muse branch (:1280/:1064). Ack persistence must be judged against
   this existing boundary, not invented fresh.
8. Router no-fallback semantics: candidate intelligent-router.ts:1846-1871 —
   NVIDIA failures stop the request without undisclosed fallback. Depends on
   explicit user selection; the "not selected automatically" notice must
   survive unification.
9. `isFree:false` for NVIDIA verified in candidate provider state. Muse/candidate
   run() free-provider path (`pickFirstValidProvider`) would misroute on a flip.
   Proposal is correct: do not relabel.
10. Pipeline ack propagation fix 0be2c73e IS an ancestor of candidate HEAD;
    ProjectPipelineTool.ts:1357 propagates `modelConfig.nvidiaDevelopmentUse`.
    No pipeline gap remains in the candidate.
11. Overlap check: Muse branch (ffaeb342) CommandComposer.tsx contains ZERO
    case-insensitive `nvidia` references; Muse provider-continuity.ts has only
    `aiCostPolicy`/`providerAllowedByCost(provider,model,baseUrl)` with no
    NVIDIA branch. Main/NVIDIA worktree likewise has no `nvidiaDevAck` UI or
    dev-access continuity check. The acknowledgement feature exists ONLY in the
    Codex candidate branch.
12. Candidate dirty diff on CommandComposer.tsx is 19+/49- (presentation badge
    work, read-only `git diff --stat`). Same file the proposal will touch.

## PROPOSAL ERRORS / CORRECTIONS

- "Separate NVIDIA list section" overstates the divergence. The list is already
  common; only two bespoke branches exist (subtitle, setup card). Do not plan
  or bill a list-merge.
- The open decision (persisted ack vs deployment access mode) should resolve to
  PERSISTED ONE-TIME PROVIDER CONFIGURATION (per browser profile), not a
  deployment access mode. A deployment mode would attest development-use on
  behalf of ALL users, breaking per-user attestation and the multi-user design
  rule. Operator env `AI_NVIDIA_DEV_ACCESS` already serves as the deployment
  gate; user consent must stay per-user/per-browser.
- Hiding server env instructions from normal users is approved, but the
  operator-denied error (`nvidia_operator_access_required`) must remain
  actionable ("ask your operator to enable development access"), not a dead
  end. Currently the frontend has no distinct rendering for it — verify and
  add if missing.

## SIMPLER ALTERNATIVE (recommended smallest approach)

1. Keep session checkbox semantics. Add metadata-driven consent slot:
   `PROVIDER_KEY_INFO.nvidia.consent='nvidia-dev'` renders the existing dev
   notice + checkbox INSIDE the generic setup card; delete the `!== 'nvidia'`
   exclusion and the subtitle branch (subtitle from metadata label).
2. Add opt-in "remember on this browser" second step that writes separate key
   `nvidia_dev_ack_v1 = {acknowledgedAt, termsVersion}`; on load, restore only
   if `termsVersion` matches current; render "Acknowledged <date> — Revoke".
   Terms-text change bumps version and forces re-ack. Server code untouched.
3. Sequence AFTER the dirty presentation/badge diff (19+/49-) is committed, to
   avoid same-file collision. No competing implementation started by Muse.

## OVERLAP WITH EXISTING WORK

- Muse current work (wiring audit docs through checkpoint 37, media parser
  review): NO file overlap — Muse branch has no NVIDIA provider code at all.
- Candidate dirty presentation FAST_PATH (same file, uncommitted): DIRECT
  same-file overlap — sequence, do not parallel-edit.
- Future whole-file CommandComposer integration will meet Muse M04 key-note
  change: note for integration owner, not a blocker for this proposal.
- NVIDIA dirty main CLI/schema work: separate scope, no overlap.
- No competing Muse implementation created or planned; CODEX remains proposed
  implementation owner, MUSE proposed reviewer.

## CONFLICT / REGRESSION RISKS

- Flipping `isFree` (explicitly NOT proposed — must stay that way) would break
  FREE_FIRST routing and auto-fallback.
- Weakening any leg of the triple-gate (operator env / per-request ack /
  model+endpoint pin) would silently convert development access into effective
  production access. UI unification must not touch provider-continuity.ts or
  the router NVIDIA branches.
- Dropping the "not selected automatically" notice during subtitle unification
  would contradict router no-fallback behavior and confuse users when Auto
  never picks NVIDIA.
- Remembered consent without visible date/revoke/terms-version would be
  attestation without informed state — the checkbox would claim a decision the
  user forgot. The timestamp+revoke requirement is not cosmetic.
- i18n: both ar/en strings must be updated together; the candidate already
  carries full ar/en pairs for this card.

## MAINTAINABILITY / SECURITY IMPACT

- Maintainability POSITIVE if done via metadata consent slot: per-provider
  special-casing stays declarative in PROVIDER_KEY_INFO instead of growing
  more `key === 'x'` branches.
- Security NEUTRAL provided: server per-request check unchanged; no key
  material added to any new storage; ack object contains only timestamp +
  version (no identity, no key); no new logging of provider payloads
  (precedent: C07 token-bearing URL console log — do not repeat).
- Never store a key in consultation/screenshot/log/test output (proposal
  already states; concur — existing `safeProviderError` redaction must cover
  any new test fixture).

## REQUIRED TESTS

- RED-first: fresh setup, reload/reconnect (ack remembered iff opted in, with
  visible date), provider switching, invalid/missing key, denied operator
  access (actionable message), terms-version bump forces re-ack, revoke clears.
- FREE_FIRST: no implicit paid request, no NVIDIA auto-selection, no arbitrary
  endpoint acceptance, no credential-in-URL.
- Existing suites green: nvidia-development-policy, nvidia-run-boundary,
  project-pipeline-nvidia-ack, provider-continuity.
- Web typecheck + build. AGENTS architecture gates only if router/pipeline
  touched — UI-only scope per this review touches neither, so gates are
  proportionally web typecheck/build + browser-UI contract.
- No weakening of existing assertions to pass (per expanded-regression
  precedent: pre-existing failures stay backlog, not reclassified).

## REAL JOE UAT (required before integration)

- On 5002 after authorized refresh: real desktop + mobile + keyboard walk of
  unified setup; configured key stays masked; explicit NVIDIA selection runs a
  fresh appropriate request to real output; negative path (no ack) blocks with
  message; reload behavior matches opted-in/out state.
- Source-only or mocked-UI PASS does not satisfy this gate.

## LIMITS OF THIS REVIEW

- Source-level review of candidate HEAD 10881308 (+ read-only dirty stat) and
  Muse branch ffaeb342; no runtime/browser execution performed in this cycle;
  no NVIDIA worker session state inspected beyond preserved-process notes in
  TEAM-STATE. Independent exact-diff ACCEPT of the future implementation is
  still required.
