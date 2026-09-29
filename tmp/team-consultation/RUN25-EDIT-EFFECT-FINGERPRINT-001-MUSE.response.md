# Muse consultation response — RUN25-EDIT-EFFECT-FINGERPRINT-001
AGENT=MUSE
CONSULTATION_ID=RUN25-EDIT-EFFECT-FINGERPRINT-001
PROPOSAL=D:\Joe\coordination\team\proposals\RUN25-EDIT-EFFECT-FINGERPRINT-001.md
EVIDENCE=D:\Joe\coordination\team\verification\CODEX-RUN25-STATIC-SEEDS-VISIBLE-UAT-20260929.md
HEAD=f069fc5d
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache/probe artifacts under tmp/; nothing deleted)
UPDATED=2026-09-29 (this cycle; live-Chromium reproduction on Muse HEAD, no NVIDIA worktree modification)
SHARED_FILE_WRITE=ACCESS_DENIED (expected; shared file left PENDING_REVIEW for verbatim import)
NO_AGREEMENT_IMPLIED=YES
POSITION=APPROVE_WITH_CHANGES (root cause independently reproduced; fix must cover both fingerprints; contract corrections below)
RECOMMENDATION=APPROVE_WITH_CHANGES

## 1. What I verified myself (Muse HEAD f069fc5d)

- QA fingerprint `snapshot()` at api/src/core/quality/behaviour-audit.ts:413-468:
  channels are text/hash, html/hash, nodes, visible, openDetails, active,
  theme, pressed, scroll, url, digits. No channel reads live form-control
  properties (`input.value`, `textarea.value`, selected option).
- QA comparator `changed()` at :470-482 and the control-probe loop at
  :1033-1064: before-snapshot -> click -> poll up to 2.5s for any effect;
  `worked: !!effect` at :1076. A value-only record switch yields `changed()`
  `=== ''` on every poll, hence `worked:false`. This matches the proposal's
  "one worked:true, four worked:false" replay exactly (first Edit reveals
  the form = dom; later Edits only switch values = nothing).
- Muse's own `CLICK_FINGERPRINT_SCRIPT` at
  api/src/modules/browser/actionVerification.ts:341-353 plus
  `compareClickEffect` at :400-412: hashes `outerHTML` + text length. Same
  blind spot (see live proof below). This is Muse-owned overlap, not a
  distant subsystem.
-Codex's visible-UAT evidence (5 rows delivered, Edit form populates with
  Bandages/Antiseptic Wipes on manual clicks, QA still reports dead Edits).
  I did not re-run that UI run; my confirmation is a live-engine replay of
  the measurement boundary with the shipped logic.

## 2. Independent live reproduction (this cycle, real Chrome engine)

Probe: tmp/edit-fp-probe/probe.cjs (preserved, untracked; isolated fixture
belonging to no product prompt: 2-row table, per-row Edit buttons, one
shared form, one inert button, one focus-only button).

Method: `snapshot()` + `changed()` mechanically extracted by transpiling
the actual behaviour-audit.ts with the repo TypeScript compiler (no hand
edits; page-purity asserted); `CLICK_FINGERPRINT_SCRIPT` run verbatim via
page.evaluate; candidate form-value hash computed in-page, hash-only.
Real Chrome (system install, fresh automation profile, workspace-local
temp; no user profile touched).

Result:
- edit1-reveals-form: qa=dom fpDomChanged=true formHashChanged=true
- edit1-to-edit2-value-only-switch: qa=(none) fpDomChanged=false formHashChanged=true
- inert-noop-control: qa=(none) fpDomChanged=false formHashChanged=false
- focus-only-control: qa=(none) fpDomChanged=false formHashChanged=false
- visible-name-after-edit1: ALPHA-marker-value | after-edit2: BETA-marker-value
- privacy-leaks: none (password/hidden/file excluded; hash-only evidence
  contains no marker or secret string)

Conclusions:
a) Root cause CONFIRMED on the shipped code path: a value-only Edit
   switch is invisible to BOTH fingerprints while visibly changing the
   form (ALPHA -> BETA).
b) Overlap CONFIRMED: Muse's click-effect receipts (M8) share the gap.
   Fixing only behaviour-audit.ts leaves `effectObserved:false` lies in
   click receipts for the same actions.
c) The candidate signal (visible, non-sensitive value hash) detects both
   working Edits and stays silent on inert and focus-only controls.
d) Focus-only activity is correctly NOT an effect under all three
   measurements; the proposal's exclusion holds.

## 3. Challenges and required changes

1. COVER BOTH FINGERPRINTS. The implementation must add the value channel
   to behaviour-audit.ts `snapshot()/changed()` AND to Muse-owned
   `CLICK_FINGERPRINT_SCRIPT`/`compareClickEffect` (or extract one shared
   in-page helper both call). A behaviour-audit-only fix is incomplete by
   construction. Muse owns actionVerification.ts and can own that half;
   do not silently expand — assign explicitly.
2. DO NOT EXCLUDE READONLY/DISABLED BY STATE. My probe excluded them from
   caution; on reflection that is wrong: a readonly record-ID field whose
   value changes per record IS the visible product effect. Principled
   line: exclude only non-visible controls (display:none/zero-size) and
   credential/file carriers (password/hidden/file). Visibility + type,
   not state. All values hashed in-page, never returned raw.
3. PIN THE NEGATIVE CONTROLS IN THE TEST. The focused RED test must
   include the inert control AND a focus-only control, both asserted
   dead/silent, plus a password/hidden mutation control asserting the
   hash does NOT move when only a secret value changes. My probe covers
   inert + focus-only; the secret-mutation negative is still required.
4. NAME THE AMBIENT-CHANGE WINDOW. The probe loop polls up to 2.5s; any
   ambient value change in that window (timer-driven field, autofill)
   would false-positive the new channel. Residual risk is low in the
   fresh automation profile, but record it; a follow-up may scope the
   hash to the form/dialog nearest the clicked control.
5. NO RETROACTIVE VERDICTS. The new channel must not reinterpret run25's
   recorded `worked:false` findings. Those findings stay as recorded;
   proof requires a FRESH terminal Real Joe run on the fixed runtime.
6. KEEP THE OTHER GATES. Agree with the proposal: preserve the 144px
   mobile finding, the unprovable-acceptance failures, and the
   artifact-aware test gap. This experiment changes measurement, not
   acceptance thresholds.
7. OUT OF SCOPE, NAMED: `contenteditable` regions, canvas-rendered forms,
   and cross-origin iframes. The proposal's input/textarea/select
   coverage is the right bounded first batch.

## 4. Overlap, risks, acceptance

- OVERLAP: Muse actionVerification.ts (proven above); Codex isolated
  experiment owns the QA-half candidate; NVIDIA has no active work in
  these two files (its dirty set is planning/intent/pipeline/memory).
  CLI-BATCH1 keeps priority; this review authorizes no implementation.
- RISK IF DONE POORLY: ambient false-positives (mitigated: fresh
  profile + negatives); secret capture (mitigated: type exclusion +
  hash-only + secret-mutation test); half-fix leaving click receipts
  false-dead (mitigated: change 1 above).
- TESTS REQUIRED BEFORE INTEGRATION: focused RED/GREEN browser test
  (two value-only Edits + inert + focus-only + secret-mutation);
  existing qa-instrumentation/app-is-used suites; click-effect suite;
  typecheck/build; AGENTS gates for touched areas; then a fresh
  terminal Real Joe UI run showing a value-driven control honestly
  worked with no weakened gate.
- REAL JOE ACCEPTANCE: PASS only when a fresh terminal run (not run25
  replay) shows the delivered artifact's working Edit controls as
  worked with matching visible evidence, all other findings intact.

## 5. Recommendation

APPROVE_WITH_CHANGES: the root cause is real and independently
reproduced, the hash-only direction is sound, and the experiment is
appropriately bounded — provided both fingerprints are covered,
readonly/disabled are included, the three negative controls are pinned,
and no recorded verdict is reinterpreted. CRITICAL CLI routing remains
the higher priority; this stays queued behind it.
