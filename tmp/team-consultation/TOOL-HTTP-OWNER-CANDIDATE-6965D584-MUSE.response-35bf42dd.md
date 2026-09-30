AGENT=MUSE
CONSULTATION_ID=TOOL-HTTP-OWNER-CANDIDATE-6965D584-FOLLOWUP-35BF42DD
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=25ad8378
DATE=2026-09-30
SHARED_WRITE=DENIED_SANDBOX (workspace-local response; Codex may import after transcript check)

## Scope inspected (exact)

- Isolated branch codex/tool-http-owner-20260930 (worktree
  codex-local-bind-safety, READ ONLY): full diff of 35bf42dd -
  api/src/api/page-store.ts (+15/-2, owner stamp + cross-owner
  throw) and api/src/modules/tools/definitions/ImageStudioTool.ts
  (+21, caller/owner check + ownerless realpath containment).
- Commit stats of 6965d584 (routes+firewall+verify, 3 files) and
  96d01386 (+12 verify lines, sessionless IDE case): covered under
  Muse's earlier ACCEPT_WITH_CONDITIONS for 6965d584+96d01386
  (consultation TOOL-HTTP-OWNER-CANDIDATE-6965D584-MUSE-REVIEW-23718F74,
  preserved). Test-only 6d42ffdf/d4dfff46/532fe2e1 reviewed via
  committed assertions as described in TEAM-STATE + the updated
  candidate evidence file, not line-by-line.
- Muse-branch cross-checks @25ad8378:
  AgentExecutionFirewall.ts:53-56 currentOwner() never throws,
  returns '' when unset; firewall file imports NO page-store (no
  file-level import cycle from the new dependency direction);
  ProjectEditTool.ts:605 execute() has NO outer try/catch and
  writes undo bytes (:651) BEFORE writeJoeProject (:654).

## Position

1. 35bf42dd IS a genuine improvement for the image_studio boundary:
   input-supplied ownerUserId can no longer be spoofed (stripped +
   context-stamped), cross-owner overwrite throws, and the image tool
   enforces caller==owner with a realpath containment fallback.
2. STORE-TIME THROW IS TOO LATE FOR project_edit. Because undo bytes
   land at :651 before the :654 rebind, 35bf42dd cannot fix the
   PROJECT-ENTRY override: it converts the rebind into an exception
   but the foreign write already happened. The two batches are
   complementary; this candidate must NOT be read as covering
   project_edit/repair/undo/ui_fix, which remain unbound at the tool
   layer. (See Muse's PROJECT-ENTRY-PATH-BOUNDARY-001 response, C2/C5.)
3. ADOPTION vs CONTAINMENT (preserved disagreement, now concrete):
   the ownerless fallback forbids every outside-root dir. But the
   source supports explicit outside-root imports, and ALL 20 sampled
   persisted entries are ownerless - so the rule as written forbids a
   supported capability for the entire legacy population, with zero
   observed breakage only because the sample has no imported entry.
   Muse maintains: ADOPT the entry to the authenticated caller on
   first legitimate same-session use, then enforce owner equality;
   keep realpath containment as defense-in-depth or grant-bypassed
   fallback - not as the sole ownerless rule.

## Required changes (blocking integration)

C1. IMPORT-GRANT BYPASS OR ADOPTION RULE. Either implement
    authenticated-session adoption for ownerless entries, or add an
    explicit external-import grant that bypasses the containment
    rejection. A contained positive control (eligible legacy/imported
    image project with entities.js, owned-by-caller after grant)
    must pass; the current synthetic suite has no such control.
C2. !caller REJECTION NEEDS A CALLER AUDIT. `if (!caller ... ) return
    project_forbidden` breaks every legitimate path that reaches
    image_studio without a userId (system/internal pipeline calls,
    sessionless IDE, guest/anonymous preview if any). Provide
    evidence that no legitimate caller omits userId, or scope the
    rejection to owned entries only.
C3. RESIDUAL: OWNERLESS-CONTEXT WRITES TO OWNED ENTRIES. When
    contextOwner=='' the code preserves existingOwner and ALLOWS the
    write. Either fail closed with a compatibility audit of internal
    writers, or document this residual explicitly in the integration
    record. Do not silently keep it.
C4. THROW SHAPE. writeJoeProject throwing 'project_forbidden' becomes
    an uncaught tool exception in callers without outer try/catch
    (ProjectEditTool verified). Acceptable fail-closed direction, but
    pin the surfaced shape in a ToolService-level test so the error is
    a clean rejection, not a 500-class crash.
C5. 'default' KEY (repeats Muse's earlier follow-up, still open):
    ProjectEditTool :615 falls back to a shared 'default' session key
    and 35bf42dd does not reject it at the write boundary. State the
    first-writer rule for 'default' or reject it.
C6. MINOR: dir==workspace-root yields relative=='' and is ALLOWED;
    confirm image writes at the bare root are intended. TOCTOU
    between realpath check and use is noted, non-blocking at this
    threat level.

## Roles / overlap

- Muse serves as INDEPENDENT REVIEWER for this candidate (this
  response). Codex remains implementation owner; NVIDIA's follow-up
  review is still required before any main integration.
- No overlap with Muse's active wiring audit (probe-only). No file
  overlap with NVIDIA's dirty set (routes/tools.ts, firewall,
  page-store, ImageStudioTool are NOT in NVIDIA's dirty list), but
  the firewall + ToolService interaction needs NVIDIA's policy
  challenge per the proposal before integration.

## What this review does NOT claim

No main integration approval (conditions open), no full Real Joe
product UAT, no claim about other joeProjects readers. The :5003
browser smoke and 73/73 focused results are Codex-reported and were
not independently re-executed by Muse.
