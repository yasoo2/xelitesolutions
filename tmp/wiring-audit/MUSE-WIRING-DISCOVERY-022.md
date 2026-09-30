# MUSE Wiring Discovery 022 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 22)
HEAD=f48ef78b + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for interaction 8/8 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures + JOE_CHAT_STORE_DIR redirected into a
probe-owned dir, both removed by the probe; NO network legs; NO model legs —
central_answer's router path embargoed, code-cited only) + static checker
partition over the trunk + pure-function verdict table over
source-grounded shapes. Full trunk probe ran 2x filed runs A/B with 37/37
legs verdict-identical (ok + error-prefix + output-shape, verdictDiffs=0;
5 comparison entries + decl byte-identical). No live process survived; no
stray files (session root clean, fx-ixn removed).
EVIDENCE=tmp/wiring-audit/trunk_interaction.mts + trunk_ixn_run{A,B}.json +
trunk_ixn_run{1,2}.log (this worktree; runs 1/2 = filed A/B)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-021.md (observability LEVEL-4)
STAGING_NOTE=this checkpoint also backfills checkpoint-21 staging deltas
(TRUNK_OBS + #16/#17 + P1-011 + P2-029..031 + 5 obs matrix rows), which 021
filed as a discovery doc only. Staging now covers checkpoints 1-22.

## Trunk membership (merge.json v1, challenged, stands)

interaction = ask_user, business_profile, central_answer, echo, form_inbox,
notify_user, task_lifecycle, todo_write (8). All 8 exist in the live
registry. 0/8 are task-level checkers. central_answer's instant fast-path
(no-model) and empty-question refusal were probed live; its routeToModel
path was NOT executed (model embargo).

## New findings (all Muse-branch @ f48ef78b)

### F160. todo_write returns `data`, not `output` — canonical output is null (LIVE 2x, MISMATCH #18 NEW + P2-032 NEW)

td.replace/merge/nomerge/empty all -> ok:true + output null BOTH runs;
td.compare.replaceDataDropped=true BOTH runs (no `data` field survives the
canonical result). Mechanism: TodoWriteTool.ts:63-66 returns
{ok, data:{acknowledged,count}, logs}; ToolService reads `res?.output ??
null` (ToolService.ts:879) and returns {ok,output,logs,artifacts,error}
(:963) — NO data passthrough anywhere on the canonical path. The tool's
own declared outputSchema promises {acknowledged,count}, so the receipt
contradicts its contract: count survives only inside a log line. The
verdict table maps 'todo ok-null-output'=>passed — a null-evidence PASS.
Repair direction (batch P2-032): return output:{acknowledged,count}
(keep `data` only if a non-canonical consumer needs it — none surveyed;
owner checks before dropping).

### F161. todo_write missing todos throws a raw TypeError (LIVE 2x, rides P2-032)

td.notodos ({merge:false}, no todos) -> ok:false + 'Failed to update
todos: Cannot read properties of undefined (reading 'length')' BOTH
runs: `input.todos.length` with no input guard (TodoWriteTool.ts:65),
caught by the tool's own try/catch. required:['merge','todos'] is
unenforced by the tool AND the gateway. Same input-guard class as
F150/F155. Consequence today is an ugly error, not false success.
Repair rides P2-032 (same tool): reject missing todos with a sentence
before broadcast.

### F162. business_profile save+clear both hit the shared default slot (LIVE 2x, P2-033 NEW)

bp.store after save -> slots ["audit-sess","default"], BOTH carrying the
fixture brand+phone BOTH runs (setProfile writes [keyOf(session),
'default'], business-profile.ts:57-72). bp.cleared after clear ->
slots [] BOTH runs (clearProfile deletes BOTH, :74-79). Save-side
cross-sessionism is DOCUMENTED intent ("one save serves every session",
:11-13); clear-side wipes the shared default too — one session's "forget
me" erases every session's profile. Cross-session READ impact is
code-cited (getProfile default-fallback, :47-53), not live-probed with a
second session. Repair direction (batch P2-033): confirm multi-user
intent with a second-context test; at minimum scope clear to the own
slot (or make default-wipe explicit); document the shared-default
semantics. Privacy-positive note: auditFields=[] keeps contact PII out
of audit logs (BusinessProfileTool.ts:28).

### F163. form_inbox answers English in Arabic — `isAr` is hardwired true (LIVE 2x, P2-034 NEW)

fi.english (plain-English request) -> Arabic message BOTH runs
(fi.scope.englishIsArabic=true). Mechanism: `... || true` at
FormInboxTool.ts:26 — the language branch is dead code. Minor i18n
defect, no data impact. Repair direction (batch P2-034): drop `|| true`
(or wire the real request language); keep Arabic default.

### F164. required/enum unenforced across 4 broadcast tools (LIVE 2x, note, no batch)

au.missing ({} vs required:['question']), nt.missing ({} vs
required:['message']), lc.missing ({} vs required:['action']), lc.bad
(action:'explode' vs enum), ec.missing ({} vs required:['text']) ->
ALL ok:true BOTH runs. ask_user with no question still broadcasts a
user_input_request carrying question:undefined; lifecycle broadcasts
'action:explode' as success:true. Harmless (UI-cosmetic broadcasts, no
state, no false artifact) — recorded for a future input-guard sweep,
same family as F150/F155/F161. No batch.

### F165. business_profile save/show/clear roundtrip honest (LIVE 2x, positive)

bp.show-empty/show/save/save-nofield/clear/show-cleared ALL honest BOTH
runs: empty shows the no-profile message with profile:null; one English
sentence deterministically parsed into brand+phone+email (no model
involved — positive); gibberish save returns the no-field message
without writing; clear verified by store read (slots []). Deterministic
parse + honest absence + verified deletion.

### F166. form_inbox session scoping honest (LIVE 2x, positive)

fi.list -> count 2, ownSeen true, otherLeaked false BOTH runs: the two
audit-sess submissions render newest-first; the other-sess submission
is NOT returned. listSubmissions site-filtering works as documented
("one session never reads another session's messages").

### F167. central_answer refusal + fast-path honest, zero model calls (LIVE 2x, positive)

ca.empty/ca.missing -> ok:false + 'central_answer was called without a
question.' BOTH runs (fail-before-model, CentralAnswerTool.ts:126-132).
ca.hi/ca.thanks/ca.ar-greet -> instant fast-path logs, string outputs,
correct language branch (ar-greet Arabic) BOTH runs — no routeToModel
call on any leg (instant returns at :240-242). The router/fallback path
(:244-302) was NOT executed live (model embargo) — code-cited only.

### F168. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 8/8 (7 rank-1, echo rank-3 on self-name).
5/8 PRIORITY-listed (ask_user, central_answer, echo, notify_user,
todo_write). 3/8 ROUTER_EXCLUDED (business_profile, central_answer,
form_inbox) — exclusion applies ONLY to the capabilityRoute ACT-verb
fast-path (toolCatalog.ts:316/412: "their own deterministic path");
selectToolsFor still carries them, so this is BY DESIGN, not a wiring
gap; their "own deterministic paths" are unmapped (note, no claim).
4/8 in the 21 boot permission-defaulted tools (central_answer,
form_inbox, echo, ask_user -> read; boot list UNCHANGED at 21; same
systemic family as summary finding #4); central_answer ALSO
rate-limit-defaulted 30/min (declares rateLimitPerMinute=0).
`[ToolService] Auto-assigned workspace context: session-audit-sess`
fired on legs (context propagation visible). Verdict-table notes: 'ask
waiting'=>incomplete (CORRECT — waiting is not a pass); 'profile
no-field'=>passed + 'inbox empty'=>passed (generic ok+message ledger
mapping — observation, consistent with the ledger's rule, no batch).

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=12/19 fully storied (interaction 8/8 LEVEL-4 + static
verification-compat + checker-set 0/8) — 112 + 8 = 120 tools
TRUNK_IXN=8/8 SELECTABLE (7 rank-1, echo rank-3); 37/37 live legs
canonical 2x filed verdict-identical (verdictDiffs=0; comparison
entries + decl byte-identical); 15-shape verdict table; fixtures
removed (session root clean, fx-ixn removed)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=18 confirmed (NEW #18: todo_write data-drop ->
null canonical output, verdict passed F160)
EXECUTABLE_NOT_VERIFIABLE=0 on 12 swept trunks (120/120 verdict-
mappable; null-evidence joins as MAPPING-false-pass (#18))
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/8 trunk task-level checkers)
P1_ITEMS=0 new | P2_ITEMS=3 new (P2-032 todo receipt+guard F160+F161,
P2-033 profile slot scope F162, P2-034 inbox i18n F163)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-032 (todo_write receipt+guard F160+F161): return
  output:{acknowledged,count}; reject missing todos with a sentence.
  Needs owner + reviewer + focused tests (output-shape assertion on the
  canonical path, missing-todos rejection) + consumer survey for `data`.
- NEW WIRING-P2-033 (profile slot scope F162): confirm multi-user
  intent with a second-context test; scope clear to own slot or make
  default-wipe explicit; document shared-default semantics. Privacy
  posture (auditFields=[]) must be preserved.
- NEW WIRING-P2-034 (inbox i18n F163): drop `|| true`; assert English
  request -> English message + Arabic default preserved.
- BACKFILLED 021 batches (filed in 021 doc, now in staging):
  WIRING-P1-011 + WIRING-P2-029 + WIRING-P2-030 + WIRING-P2-031.
- LIFTED nothing; embargoes hold (model legs on central_answer router
  path; network legs; cross-session live probing).
- NOTE for the P2-032 owner: the fix is two lines in TodoWriteTool.ts
  — but the `data`-field consumer survey must come first.

## Working hypotheses (formed at source-read, before first run)

- 'echo returns input text' — CONFIRMED (ec.ok).
- 'echo {} is rejected' — REFUTED: ok:true out={} (F164 note).
- 'ask_user blocks' — REFUTED by code: broadcast + waiting receipt, returns immediately (F164 legs).
- 'ask_user {} is rejected' — REFUTED: ok:true waiting (F164 note).
- 'notify/task_lifecycle/todo honor required+enum' — REFUTED: all ok:true incl. bad action (F164/F161).
- 'todo_write output carries acknowledged/count' — REFUTED: output null, data dropped (F160).
- 'profile save/show/clear roundtrips' — CONFIRMED (F165).
- 'profile writes own slot only' — REFUTED: own + default (F162).
- 'profile clear wipes own slot only' — REFUTED: wipes both (F162).
- 'inbox isolates sessions' — CONFIRMED: own 2, other not leaked (F166).
- 'inbox answers English in English' — REFUTED: Arabic always (F163).
- 'central empty fails honestly' — CONFIRMED (F167).
- 'short greetings avoid the model' — CONFIRMED: fast-path logs (F167).
- 'all eight are selectable by self-name' — CONFIRMED (7 rank-1, echo rank-3) (F168).
- 'router-excluded means unwired' — REFUTED: exclusion is fast-path-only by design (F168).

## Limits / UNKNOWNs

- 7/19 trunks still unstories; memory_knowledge overlaps
  NVIDIA-claimed files and planning_orchestration is NVIDIA-owned —
  do not story without coordination. Suggested next: infra_ops=6
  (likely honest-unavailable legs) or documentation=2 + media_images=2
  (small trunks) or network_api=12 (network embargo care) or
  language_runtimes=4 (execution embargo care).
- F160 `data`-field consumers outside the canonical path UNKNOWN
  (not surveyed — owner checks).
- F162 cross-session READ impact code-cited, not live-probed with a
  second session.
- central_answer router/fallback path (model) never executed live —
  code-cited only.
- business_profile/form_inbox "own deterministic paths" (the reason
  for ROUTER_EXCLUDED) unmapped — no claim made.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff exists
  yet to review — main still e8fd9589, CLI work dirty/uncommitted).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths):
  [System.IO.Directory]::SetCurrentDirectory('D:\Joe\muse-worktree\api')
  $fx='<worktree>\tmp\wiring-audit\fx-ixn' (auto-created+removed)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN unset)
  node D:\Joe\muse-worktree\api\node_modules\tsx\dist\cli.mjs D:\Joe\muse-worktree\tmp\wiring-audit\trunk_interaction.mts
Expected: 8/8 SELECTABLE (echo r30=3); 37 legs, 29 ok; td.* output
null + replaceDataDropped; td.notodos TypeError fail; bp slots
[own,default] then []; fi 2 own / 0 leaked / English Arabic;
ca empty fail + 3 fast-paths; cleanup=ok; node process exits 0.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1 min.
