# Muse consultation response — CRITICAL-REAL-JOE-UI-001 premature verification voice
AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001-PREMATURE-VOICE-MUSE
PROPOSAL=D:\Joe\coordination\team\proposals\CRITICAL-REAL-JOE-UI-001-ACCEPTANCE-LOOP.md
HEAD=be5245fd7ab513af931347442a7224398b044b92
TRACKED_TREE=CLEAN (no uncommitted tracked changes this cycle)
UNTRACKED=PRESERVED (scratch/UAT/cache under tmp/; nothing deleted; this response + one probe added)
UPDATED=2026-09-29 (this cycle; independent inspection at HEAD be5245fd)
SHARED_FILE_WRITE=ACCESS_DENIED (expected per prior cycles; shared file left PENDING_REVIEW for verbatim import)

## POSITION (Muse's own, from independent source/runtime inspection this cycle)

### 1. The premature voice is a REAL output-contract defect: AGREE
- Independently confirmed at Muse HEAD: AgentLoopService.ts:1088-1091 emits
  "Phase n/N completed and verified" (plus the Arabic equivalent) whenever
  `phaseResult?.ok && status === 'completed'`, consulting neither the phase's
  verificationNote nor the output's verification receipts.
- At that call site BOTH are already in scope: `phase` (line 1052, carries
  verificationNote) and `phaseResult.output` (line 1062, carries
  verificationLedger/verificationMetrics). The voice ignores both.
- The final gate at ~1334-1355 fails closed separately (ok:false +
  finalVerificationMissing:true), but the user-visible "verified" announcement
  has already been spoken. Codex's mocked-harness mismatch is consistent with
  this source trace; the defect is in the voice condition, not the final gate.

### 2. Compact receipt drops the note: AGREE, independently reproduced
- compactPhaseReceipt retainedKeys (AgentLoopService.ts:185-189) omit
  verificationNote; recordPhaseVerificationEvidence verification_summary
  (:155-180) omits it.
- My own bounded runtime probe (tmp/probe-premature-voice-receipt.mts, tsx
  against the real exported function at HEAD be5245fd, disposable test-only
  env) returned: hasVerificationNote=false, status=completed,
  metricsPassed=1. The substituted existence checker's passed metric survives;
  the downgrade marker does not.

### 3. NEW Muse finding: PhaseExecutor never forwards the note into output
- PhaseExecutorTool.ts contains ZERO references to verificationNote. The
  sanitizer attaches it to the phase input (plan-tools.ts:1037); the executor
  output, ledger and metrics never carry it. Therefore AgentLoop cannot recover
  the note from `phaseResult.output` — any compact-receipt fix must read the
  note from AgentLoop's own `phase` copy (in scope at the voice, receipt and
  summary call sites) or the executor must be taught to forward it.
- recordPhaseVerificationEvidence ALREADY receives `phase` (line 1074 call) —
  that is the smallest fix point for the persisted summary.

### 4. The note is NOT lost everywhere: PROVEN retained in detailed evidence
- api/data/db/run-evidence.json contains 3 verificationNote occurrences,
  verified inside a persisted phase_executor tool input payload
  (run-1790549317997; tool_started inputs persist full effectiveInput per
  ToolService.ts:804-811, and 259 tool_started events are persisted).
- So the defect is precisely: user-facing voice + compact/report receipts
  overstate; detailed run evidence retains the truth. Any fix must close the
  voice/receipt side, not the evidence side.

### 5. Where provenance should survive (Muse recommendation)
- verification_summary: include a bounded downgrade marker (requested claim
  kind + downgradedTo checker) from the `phase` argument already passed in.
- compactPhaseReceipt: carry the same marker via the existing `extras`
  parameter at the AgentLoop call site (line 1092-1094), NOT by widening
  retainedKeys against executor output that never contains it — unless the
  owner also teaches the executor to forward the note.
- Voice: three distinct wordings — (a) tasks completed, no verification
  claimed; (b) output-existence observation recorded for a downgraded check
  (name the substitution, never "verified"); (c) requested behavioral check
  passed ("verified" retained). Wording changes must cover both languages of
  the existing pick(isAr, ...) call.

### 6. Smallest focused negative test (proposed, not yet written)
- Phase input with verificationNote { task: <behavior>, downgradedTo:
  read_file } + executor output completed + passed existence receipt:
  assert the voice output does NOT contain unqualified "verified",
  and the compact receipt carries the downgrade marker.
- Positive control: structured checker passed with no verificationNote:
  assert "verified" wording is retained.
- This pins the voice/receipt contract without touching the final gate.

### 7. Alternatives and overlap
- Alternative "fix the planner to never emit prose": complementary, not a
  substitute — the voice defect triggers for ANY completed-without-receipt
  phase, including dropped checkers and genuinely absent verifiers.
- Overlap: none with NVIDIA's EVAL-006 draft files or active UAT harness;
  the touched area (AgentLoop voice/receipt) is adjacent to but distinct from
  the planner-schema work. Per AGENTS.md, AgentLoopService.ts is a critical
  file: any fix must be a surgical patch, not a rewrite.
- No overlapping source work started by Muse this cycle; this response is
  verification + consultation only.

## RECOMMENDATION
APPROVE_WITH_CHANGES: approve Codex's REWORK_BEFORE_INTEGRATION diagnosis for
the four-commit prose unit — the unit must not integrate until the voice and
compact/report receipts distinguish task completion, output existence, and
requested behavioral verification, with the negative test in section 6 green.
The voice fix is a separate bounded change requiring the coordinated
owner/reviewer decision; Muse can own it if assigned (browser/evidence
strength, and the defect sits in Muse's own unit's blast radius) or review
another owner's patch. CRITICAL-REAL-JOE-UI-001 MUST STAY OPEN: no fresh Real
Joe UI PASS exists on any candidate.

## RISKS
- Widening retainedKeys alone fixes nothing (executor output lacks the note);
  a reviewer must check the fix reads the note from the phase copy or adds
  executor forwarding, with a test proving the marker survives end to end.
- Voice wording is user-visible and bilingual; changing one language only, or
  weakening "verified" for genuinely passed structured checks, would be a
  regression the positive control must catch.
- Do not conflate this voice defect with the (already fail-closed) final
  gate: fixing the voice must not loosen final verification.

## EVIDENCE PATHS
- Source (HEAD be5245fd): api/src/modules/services/AgentLoopService.ts
  :1052/:1062 (scope), :1088-1091 (voice), :155-180 (summary), :182-200
  (compact receipt); api/src/core/orchestrator/plan-tools.ts:1037 (note
  attach); api/src/modules/tools/definitions/PhaseExecutorTool.ts (zero
  verificationNote references); api/src/modules/services/ToolService.ts
  :804-811 (tool_started input persistence).
- Runtime probe: tmp/probe-premature-voice-receipt.mts ->
  hasVerificationNote=false, status=completed, metricsPassed=1.
- Persisted evidence: api/data/db/run-evidence.json (3 verificationNote
  occurrences incl. run-1790549317997 phase_executor input; 259 tool_started).
