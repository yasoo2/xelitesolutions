# MUSE independent review — fresh official5002 read-only browser routing failure

AGENT=MUSE
CONSULTATION_ID=REAL5002-READONLY-BROWSER-CONTRACT-20261004-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=DIAGNOSIS_CONFIRMED_WITH_PRECISION_CORRECTION__CANDIDATE_NOT_YET_AVAILABLE
RECOMMENDATION=NEEDS_EVIDENCE
REVIEW_DATE=2026-10-04
MUSE_HEAD=d1837a0f451d3006f67ca5680f64eeed19f5240b
NVIDIA_HEAD=f40f6100e8083bfefeef54eb7812c3690b068048
SHARED_WRITE=NOT_ATTEMPTED_BY_SANDBOX_POLICY (fallback file; Codex to import verbatim)

## Scope actually inspected (read-only, no source edits, no runtime control)

- IntentParser.ts guard (lines ~33-45) and PlanningEngine.ts guard (~797-822)
  on current NVIDIA main bytes; requested-action.ts patterns + exemption logic.
- PlanningEngine explicit-browser-open gate (~984-1006) and every gate between
  the denial guard and it (capability-decision, exact-response,
  file-append/file contracts).
- Codex regression test
  api/src/__tests__/codex-readonly-browser-live-regression.test.ts (untracked,
  root-added) and existing browser-explicit-url-routing.test.ts.
- Independent jest rerun of the Codex suite on NVIDIA bytes with cache + TEMP
  redirected to muse-worktree scratch: 2 failed / 1 passed, matching the owner
  receipt. Trailing logger EPERM is a sandbox teardown artifact after results.
- Health only: curl 5000/api/health OK + 5002/api/health OK (uptime ~1528s,
  no-commit-file). No prompt submitted, no UI driven, no process touched:
  owned verification is running and must not be disturbed.
- Muse tree: tracked clean at d1837a0f, no dirty consumer work to reconcile.
  Prior f40 review (immutable commit f40f6100) stands unchanged.

## Root cause — confirmed with one precision correction

Codex's direction is correct: BOTH front boundaries force central_answer for a
no-write constraint BEFORE the explicit-URL navigation gate, so a requested
bounded browser observation is misrouted into an answer and the Browser panel
stays empty. FAILED acceptance, not a successful refusal. I verified:

1. IntentParser.parse fires the denial guard before capabilityDecision,
   terminal-diagnostic, classification, and quickIntent browser routing.
2. PlanningEngine.generatePlan fires the identical guard (~797) before the
   explicit-browser-open gate (~984). Intermediate gates cannot swallow a
   browser+URL prompt, so the repair is a bounded guard fix, not a reorder.
3. Once the guard stops firing, the EXISTING gate yields exactly what the
   regression test expects: url match + open intent + (titleOnly ||
   !pageWork) all true for the live prompt, readContent=true via the
   report/status-shown matcher. The test expectation is grounded, not invented.

CORRECTION (mechanism, same outcome): this prompt does NOT trigger via
isNoFileChanges. "Do not create or change any files" fails
NO_FILE_CHANGES_EN (verb must be followed directly by files?) but matches
ANSWER_ONLY_EN via the `do\s+not\s+(?:...|create|...)\b` alternative, so
isAnswerOnly=true. Worse, the hasEarlyDenial check then treats the
constraint's OWN verb ("create" inside "Do not create") as the affirmative
verb, guaranteeing denial-wins. The 'Do not modify any files' spelling stays
green because neither pattern lists bare "modify any files". The repair must
therefore handle the ANSWER_ONLY "do not create" path too — reordering only
the isNoFileChanges branch would leave this exact prompt broken.

## Proposal errors / gaps in the request text

- E1 (above): attributes the trigger to isNoFileChanges; the live prompt
  arrives via isAnswerOnly. Owner must fix the denial classification itself
  (or exempt explicit-URL navigation from BOTH flags), not just rebalance one.
- E2: "patch general contract at BOTH boundaries (shared helper if useful)" —
  shared helper should be REQUIRED, not optional: two hand-synced guards
  already drifted into this bug (planner duplicates the parser guard).
- No candidate exists yet, so there is no diff to approve. This response sets
  the acceptance gate; Muse re-review of fixed bytes remains required.

## Simpler alternative considered

Instead of touching denial semantics, move the explicit-URL gate above the
denial guard at both boundaries. REJECTED as the whole fix: it leaves
isAnswerOnly=true for scoped no-write constraints, which poisons downstream
consumers (answerOnly metadata, ledger, self-fix policy) even when the URL
gate happens to fire. The correct minimal fix is a shared helper, e.g.
denialAllowsBoundedReadNavigation(text), consulted by both guards: genuine
no-execution contracts ("Answer only. Do not execute anything") still deny
everything; scoped no-write constraints ("Do not create or change any
files") deny writes/builds but permit an explicit-URL bounded read. Keep the
quoted/negated-intent and explanatory-context exemptions intact.

## Overlap with existing work

- NVIDIA owns IntentParser/PlanningEngine/intent-classifier dirty lane: no
  competing Muse implementation written or planned. This review only.
- Codex-owned regression test + live receipt: accepted as the RED pin.
- Muse M03 terminal-runtime veto lineage: same problem family (constraint vs
  intent), main-absent, no file overlap with this repair. Converge later.
- Prior f40 review: separate scope, stands as APPROVE_WITH_CHANGES (F1/F2).

## Conflict / regression risks

- R1: weakening the guard could let genuine answer-only/no-execution prompts
  (incl. quoted long specs with example URLs) execute tools. The suite's 3rd
  control plus quoted-spec negatives must stay green.
- R2: no-write must still deny MUTATING browser actions (login/fill/click/
  autofix). A fix that whitelists "browser" broadly would breach the safety
  contract pinned by existing observation-output work (56f 106-test matrix).
- R3: hasEarlyDenial self-match (constraint verb counted as affirmative) is a
  latent defect for other prompts; fixing only the URL case leaves it.
- R4: live backend is no-commit-file (exact loaded source unproven); UAT
  replay requires the source-bound loading Codex owns, not a blind restart.

## Maintainability / security impact

- Shared helper REDUCES duplication (two guards -> one contract). No new
  execution authority: browser_launch read-only path already exists and stays
  behind ToolService policy. Loopback URL was explicitly user-requested; no
  SSRF expansion. No secrets, no paid-provider path touched (Auto free).

## Required tests before UAT replay (owner NVIDIA)

1. Codex 3-test suite 3/3 green on fixed bytes (currently 2FAIL/1PASS).
2. Existing browser-explicit-url-routing suite fully green, INCLUDING the
   'Do not modify any files' spelling (no flip in either direction).
3. NEW committed negatives: quoted answer-only spec containing a URL stays
   central_answer; no-write + login/fill/click request does NOT launch
   mutating browser tools; bare "Do not create" build refusal still refuses.
4. Existing no-execution/authority matrices green (no weakening to pass).
5. tsc zero in touched production files; affected AGENTS gates + engineer-flow
   with published logs (10-gate claim needs log receipts, cf. f40 F2).
6. Muse re-review of the exact fixed bytes BEFORE any runtime adoption.

## Real Joe UAT (integration owner Codex, after 1-6)

- Replay the SAME fresh UI prompt on source-bound official5002 to terminal
  result; PASS = page opened in Joe's Browser + reported status matches the
  health payload + zero file changes + no paid usage.
- Then ONE materially different transfer prompt (different URL + read task,
  different wording) to prove a general contract fix, not a prompt patch.
- No UAT attempted by Muse this cycle: owned verification running; both
  runtimes left untouched (health OK observed, not claimed as acceptance).

## Conditions

- This NEEDS_EVIDENCE covers diagnosis acceptance + gate criteria only.
- Do NOT adopt any repair to a runtime until 1-6 pass and Muse re-reviews.
- Preserve NVIDIA dirty work, Codex test, all runtimes and workers.
