# Muse consultation FOLLOW-UP — PROVIDER-LEASE-FENCE-A8543BF9 (2026-09-30)
AGENT=MUSE
CONSULTATION_ID=PROVIDER-LEASE-FENCE-A8543BF9
PRIOR_RESPONSE=tmp/team-consultation/PROVIDER-LEASE-FENCE-A8543BF9-MUSE.response.md (committed 57471649, PRESERVED BYTE-FOR-BYTE — this file only adds)
CANDIDATE_COMMIT=a8543bf9 (branch codex/provider-lease-fence)
NEW_COMMIT=40c30ec3 (test-only supersession pin, same branch, 2026-09-30 — did not exist at prior review)
HEAD=84693d36 (muse/joe-development, TRACKED CLEAN this cycle)
UPDATED=2026-09-30 (independent re-verification + new-evidence review)
SHARED_FILE_WRITE=BLOCKED (absolute path outside workspace sandbox; for verbatim import alongside the prior response)
POSITION=CONFIRM_PRIOR_WITH_ONE_ESCALATION (prior APPROVE_WITH_CHANGES stands; its section-1 wart is now RED-pinned and must be resolved, not deferred)
RECOMMENDATION=APPROVE_WITH_CHANGES (unchanged direction; tightened conditions below)

## Re-verification of the prior review (all confirmed)

- Re-ran the focused fence tests MYSELF in the candidate worktree (cache + TEMP
  redirected to Muse fx dir; Codex worktree source untouched; no network):
  5 passed / 28 skipped, exit 0 — log fx-db/lease-focused.log. The prior
  review's 5/5 GREEN stands.
- Re-read the full a8543bf9 diff: fence design, current-429-after-release,
  post-success deletion-fencing, direct-custom currentAttempt gating, and the
  :2257 outer Groq unfenced writer are all as the prior review describes.
  Verified :2257 STILL passes no lease at branch HEAD (40c30ec3 is test-only):
  `recordProviderCircuitFailure(groqCircuitKey, e);` — the prior MUST FIX is
  still open. Endorsed without change.
- Soft-cooling contract (prior section 5): AGREE — circuit = hard
  ownership-fenced block, provider cooling = soft TTL-bounded deprioritization
  on real provider responses. A 429 that arrived from the provider IS quota
  evidence even if its lease generation is stale; fencing it from cooling
  would discard real state. The still-missing soft-cool pinning test
  (fenced stale 429 -> circuit unblocked AND provider soft-cool TTL-bounded)
  is REQUIRED as the prior review states — it does not exist yet.

## NEW evidence since the prior review

1. SUPERSESSION PIN EXISTS AND IS RED (escalation).
   Commit 40c30ec3 adds exactly the regression test the prior review requested
   in section 1 ('rejects a released recovery lease after a newer unleased
   quota observation'). Independent run: 1 FAILED / 32 skipped —
   accepted:true retryAt:62004 vs expected accepted:false retryAt:12003
   (log fx-db/lease-pin.log). Root cause confirmed: record() preserves
   previous.lastReleasedLease across unleased records (provider-continuity.ts
   :136-138 spread), so the released lease stays the accepted owner until a
   replacement probe claims, even over newer unleased quota evidence.
   POSITION DELTA: the prior review called this wart 'not an integration
   blocker ... pin it before broader rollout'. The pin now exists and FAILS
   on the candidate code — a RED contract test on the exact commit under
   review. This must now be RESOLVED before integration (implement
   supersession, e.g. clear lastReleasedLease on any newer record, OR the
   owner explicitly rescopes the pin with recorded justification). A RED pin
   cannot ride along silently.
2. FULL SUITE NOW 28/33 (was 28/32 at prior review).
   Independent full run: 28 passed / 5 failed, exit 1 (log fx-db/lease-full.log):
   4 DuckAI (separate candidate, correctly out of scope) + 1 supersession pin
   (this candidate's new RED). Target before integration: 29/33 minimum
   (pin fixed), 33/33 combined with the DuckAI decision.
3. NVIDIA PROVIDER OVERLAP GREW (rebase warning).
   Read-only status this cycle: NVIDIA's dirty main tree now modifies
   provider-continuity.ts, intelligent-router.ts, AND ten provider adapters
   (cerebras/deepseek/gemini/huggingface/llm7/mistral/openai/openrouter/
   pollinations + others). The candidate base predates this work. Integration
   MUST rebase onto the post-CLI-batch1 tree and re-run the suite there.
   Muse still has zero provider edits (no Muse-side conflict).

## Unchanged from the prior review

- Fence direction, post-success fencing, current-after-release, direct-custom
  gating, deadline-reclaim agreement, DuckAI out-of-scope, BACKLOG priority,
  and the :2257 MUST FIX + soft-cool pin + AGENTS gates + bounded Real Joe
  outage/cooldown UAT requirements all stand.
- No competing Muse implementation started. CLI-BATCH1 review duty and the
  wiring-discovery lane are unaffected.
- No Real Joe UAT run here (isolated branch, suite red). No PASS claimed.

## Verdict

APPROVE_WITH_CHANGES: integrate only after (a) supersession pin GREEN or
explicitly rescoped by the owner with recorded justification, (b) :2257
fenced/deduped + regression test, (c) soft-cool contract pin test,
(d) suite green on the rebased tree, (e) applicable gates + bounded Real Joe
provider UAT. No main merge/push until then.

EVIDENCE_PATHS=
D:\Joe\worktrees\codex-provider-lease-fence (read-only; a8543bf9 + 40c30ec3)
D:\Joe\muse-worktree\tmp\wiring-audit\fx-db\lease-focused.log (5/5 fence green)
D:\Joe\muse-worktree\tmp\wiring-audit\fx-db\lease-pin.log (pin RED)
D:\Joe\muse-worktree\tmp\wiring-audit\fx-db\lease-full.log (28/33)
Prior response file (preserved): tmp/team-consultation/PROVIDER-LEASE-FENCE-A8543BF9-MUSE.response.md @ 57471649
RUN_IDS=none (Jest only, offline)

NOTE=Shared consultation file write was denied by sandbox. This follow-up and
the preserved prior response together carry Muse's complete authentic position
for verbatim import. STATUS change NOT claimed on the shared file.
