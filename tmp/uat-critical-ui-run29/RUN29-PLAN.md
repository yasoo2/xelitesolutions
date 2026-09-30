# CRITICAL-REAL-JOE-UI-001 — Run 29 plan (prepared 2026-09-30, NOT YET RUN)

PURPOSE=Dedicated fresh-prompt re-UAT for the run4b verification-contract
repair class (planner-emitted smoke `shell_execute` verification vs strict
phase gate). PROMPT29.txt is CLI-shaped like taglines (exercises routing +
smoke verification + exit codes + self-run npm test) but a NEW unseen
domain (word frequency), new binary name (wordtally), new flags/exit codes
(usage/exit-2, cannot-open/exit-3). It does NOT reuse the taglines prompt
and does NOT tell Joe which files to edit.

WHY_NOT_RUN_THIS_CYCLE:
- Muse runtime :5101 is DOWN (probed CLOSED this cycle); a run needs a
  fresh api dist build + server launch + 15-40 min supervised browser
  session, which exceeds this turn's remaining budget after the required
  consultation + focused verifications + audit increment.
- STOP_RULE caution: run28 proved the mesh-stall -> 31min-hang pattern
  (GAP 2, no bounded provider verdict). Launching an unsupervised long
  run risks repeating an unchanged expensive failure. Run29 must be
  SUPERVISED with a firm wall-clock cap and early-stop driver.
- This is recorded as NEXT_ACTION, not DONE. CRITICAL-REAL-JOE-UI-001
  stays PENDING until run29 (or equivalent fresh CLI-shaped UI run)
  produces terminal evidence.

PRECONDITIONS (next cycle):
1. Rebuild Muse api dist from HEAD; start API on 5101 (JSON persistence,
   run-local JWT, workspace TMPDIR redirect per run4 lesson).
2. /api/health OK before SEND. Fresh browser profile, guest login, new chat.
3. Copy driver-run28.cjs -> driver-run29.cjs; SEND-AT + early-stop
   (long-stable cap ~20 min) + ledger poll; firm stop at 40 min.
4. Independent verifier: entry file, sample>=30 words, exact top-5 lines,
   usage/exit-2, cannot-open/exit-3, npm test exit 0 — executed against
   the REAL generated project, never prompt-word matching.

PASS_CRITERIA: terminal run receipt + deliverable independently verified
(7/7-class check) + zero `verification_unavailable` contract deaths.
Any contract death reopens the repair (regression); any stall reopens
GAP 2 (bounded provider verdict) before further long runs.

EVIDENCE_TARGET: tmp/uat-critical-ui-run29/ (driver, timeline, DOM,
screenshots, RESULT29.md, verifier log) + run-evidence.json run ID.
FINAL_REPORT (when PASS/FAIL known):
D:\Joe\coordination\evaluations\results\CRITICAL-REAL-JOE-UI-001.md
