# IMAGE-STUDIO-PRIMARY-DATA-001 — MUSE INDEPENDENT REVIEW
AGENT=MUSE
CONSULTATION_ID=IMAGE-STUDIO-PRIMARY-DATA-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=DEFECT_CONFIRMED_WITH_INDEPENDENT_RUNTIME_PROOF__DIRECTION_CORRECT__CONDITIONS_ARE_MERGE_BLOCKERS
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=8f8b45c3
REVIEWED_UTC=2026-10-02T00:45Z
SHARED_WRITE=DENIED_BY_SANDBOX (workspace response authoritative; Codex import requested)

## 1. INDEPENDENT VERDICT
The core defect is REAL. I reproduced it end-to-end on Muse HEAD 8f8b45c3
with the REAL builder + REAL tool (no mocks, no fixture):
- Built the real nursery project via executeTool('api_project') with the exact
  fixture request. Result: entryResource="plants" (primary), db.js COLS contain
  {"key":"image",...}, db table "plants", entities.js MODEL=[suppliers] only.
- Ran the REAL executeTool('image_studio') against that project twice:
  no-filter -> ok:false "No table here has a picture column";
  table=plants -> ok:false, SAME error.
So even an explicitly addressed primary table with a proven image column is
invisible to the tool. The proposal's root cause (studio reads only the
secondary entities.js namespace) is CONFIRMED, not merely plausible.
Evidence: tmp/probe-image-studio-primary.ts + api/tmp/probe-image-studio-primary.result.json
+ tmp/probe-image-studio-primary2.ts + api/tmp/probe-image-studio-primary.part2.json
(the part2 file landed under api/tmp; both preserved).

## 2. PROPOSAL LINE-POINTERS AUDITED (Muse tree)
- ApiProjectTool.ts:2682-2686 primary excluded from entities model: CONFIRMED
  (proposal cites 2683-2685; exact match modulo my read window).
- writeJoeProject entry carries resource+model at :3352-3359: CONFIRMED EXACT.
- handedModel puts primary at HEAD (:3352): CONFIRMED.
- db.js exposes columns/list/get/create/update/remove/count (:981-1004):
  CONFIRMED. db.update returns row-or-null; entities update returns bool —
  both truthy-on-success, so the tool's `if (t.update(...)) n++` counting
  idiom is COMPATIBLE with db.js. No counting rewrite needed.
- Fixture seeds entities.tables.plants (:175-180 of the fixture): CONFIRMED
  STALE — plants is not a key of entities.tables in current builds, so the
  seed throws TypeError and step [4] cannot pass as written. I did NOT rerun
  the full fixture (needs Chromium/network-ladder); the seed-call failure is
  source-traced + runtime-corroborated. The claimed "14 PASS / 5 FAIL" shape
  is consistent with [4]-only failure but I did not independently reproduce
  that exact tally — do not cite me for it.
- "entry.resource/entry.model exist": CONFIRMED (entryKeys include both).

## 3. PROPOSAL ERRORS / IMPRECISIONS
- E1 (minor): "using registry entry.resource" misnames the source. It is the
  joeProjects SESSION entry (writeJoeProject), not the ToolRegistry. The
  implementer must read the session entry, fall back to file-existence ground
  truth (db.js/entities.js), and NEVER treat ToolRegistry as project metadata.
- E2 (under-specified): "explicit namespace/source discriminator" needs a
  binding rule. REQUIRED: ground truth = entry.resource (primary key) +
  entities MODEL keys (secondary) + file existence. handedModel ORDER must NOT
  be used as the namespace signal (it is a UI-handoff convenience). Bare
  `table` names stay backward compatible: resolve primary-first, report which
  namespace was filled in output, and on a true collision require qualified
  `primary:<t>` / `secondary:<t>` instead of silently picking one.
- E3 (missing): owner semantics. db.list() with no owner returns ALL rows
  across owners (db.js:984-987). Filling pictures for another owner's rows is
  a cross-tenant write. The repair must define this: scope to session owner
  when ownership is available, else fill-all WITH an explicit note. At minimum
  document; preferably scope. Add a multi-owner test.

## 4. ROOT CAUSE (as I state it)
Two contracts drifted apart with no shared authority:
(a) The generator promotes the request's central table to PRIMARY (db.js) and
    deliberately excludes it from entities.js (one-name-one-table invariant,
    ApiProjectTool.ts:2654-2694).
(b) image_studio was written when entities.js held every fillable table; it
    hard-requires entities.js (:130) and enumerates only entities.tables.
No component owns the "primary ∪ secondary" table universe, so the primary
namespace silently left the tool's reach and the fixture's seed target rotted.

## 5. SIMPLER ALTERNATIVES CONSIDERED
- Fixture-only fix: REJECT (agree with proposal) — production stays broken.
- Register generate_image / alias to image_studio: REJECT (agree) — orphan,
  paid-policy + URL-success hazards already established in CREATIVE review.
- Parallel image store/schema: REJECT (agree) — duplicate architecture.
- Generator-side unified tables facade: REJECT (my own alternative, weaker) —
  rewrites the generator contract and breaks every already-built project; the
  tool promises to work on any system Joe ever built. The proposal's
  studio-reads-both-namespaces direction is the smallest compatible repair.

## 6. SECURITY / CORRECTNESS CONDITIONS (merge blockers)
The CURRENT tool has live hazards the repair must fix, not preserve:
- C1 CONTAINMENT+OWNERSHIP: resolve `dir` through workspaceService
  active-root + containment check (AGENTS.md path-resolution rule) and verify
  session ownership BEFORE spawning node with cwd=dir. Negative tests:
  escape/symlink/foreign-session must fail closed.
- C2 NO SCRIPTS IN PROJECT DIR: .joe-*.mjs are written INTO the user project
  today (readTables:35, writePictures:72) — servable by a running server,
  left behind on crash. REQUIRED: stable helper module shipped with the API
  (argv: dir+op), or per-call scripts under a unique os.tmpdir dir. Never
  write executables into user data dirs.
- C3 UNPREDICTABLE TEMP NAMES: joe-tables-${Date.now()} / joe-pics-${Date.now()}
  are predictable (CWE-377; low risk on this dev box, production debt).
  REQUIRED: random suffix (crypto.randomUUID) or unique dir per operation.
- C4 REAL CANCELLATION: Promise.race timeout leaves the child RUNNING (no
  kill on the timeout path) — orphaned node writers. REQUIRED: kill on
  timeout + temp cleanup + explicit cancelled outcome. Test it.
- C5 ABSENT vs FAILED: readTables catch-all returns [] -> "no picture
  column", masking crashes as absence (the exact error I reproduced can hide
  either). REQUIRED: distinct codes (NO_IMAGE_TABLE vs STUDIO_FAILED with
  cause). Empty/failed update must not report completed fill (agree with
  proposal; extend to read path).
- C6 FIELD PRESERVATION: db.update merges patch-over-current (safe), but a
  regression test must prove price/qty/description bytes are unchanged after
  a fill, plus redo=false keeps existing images.
- C7 ToolService/ExecutionEngine reuse: all spawn/file actions through
  existing ToolService policy + executionEngine facilities (no new raw
  exec path). Agree with proposal. NVIDIA to confirm runArgvStreaming
  timeout/kill semantics support C4 or bound the gap.
- C8 row-image.ts (pictureFor/picturesFor/describePictures/Shrinker) stays
  UNTOUCHED — repair is data-access only. Local/free image policy retained.

## 7. OVERLAP / OWNERSHIP
- ImageStudioTool.ts + row-image.ts + fixture are Muse-authored (Muse lane).
  Codex isolated owner ACCEPTED iff diff stays within ImageStudioTool.ts +
  fixture + new tests, row-image.ts untouched, NO ApiProjectTool/planner/
  schema/app-blueprints edits (NVIDIA dirty region), NO registry/ToolService
  core changes (separate scopes).
- REVIEW_OWNER=Muse (accept). NVIDIA independent critique required for C4/C7
  (execution/cancellation) + C3/C1 (workspace policy). INTEGRATION after
  applicable gates + Real Joe UAT, dirty-preserving.
- No overlap with active CLI producer, provider 0fc, or wiring-audit lanes.

## 8. REQUIRED TESTS (beyond the proposal's list)
Proposal's list accepted (separation, primary-only, table filter, duplicate
names, escape/symlink/user/session/cancellation negatives, preservation,
true counts, fake-server generation + provenance, fixture rerun). ADD:
T1 absent-vs-failed codes; T2 child-killed-on-timeout; T3 temp uniqueness;
T4 legacy entities-only project backward compat; T5 primary-only project
(no entities.js) WORKS; T6 qualified-table collision; T7 non-image-field
round-trip; T8 multi-owner scoping decision; T9 entry-missing fallback
(file-existence ground truth when session entry is absent/stale).

## 9. REAL JOE UAT (required before integration verdict)
U1: fresh visible request on :5002 "fill pictures for the <system> system" ->
terminal completion, row readback shows data:image/* in PRIMARY table,
screenshots. U2 TRANSFER: a materially different second system/domain (not
the nursery) to prove the namespace repair is general, not fixture-shaped.
Unit/fixture green alone is NOT acceptance.

## 10. CONFLICT / REGRESSION RISKS
- handedModel consumers (React builder) unaffected (read-only use here).
- Existing built projects (entities-only era) must keep working -> T4.
- owned-checkpoint/CLI lanes untouched by this scope; no shared files.
- Risk if C2/C4 done sloppily: orphaned processes / junk files in user
  projects — hence T2 + post-run project-dir cleanliness assertion.

RECOMMENDATION=APPROVE_WITH_CHANGES (conditions C1-C8 + tests T1-T9 + U1/U2).
Ownership: Codex isolated implementer / Muse reviewer / NVIDIA execution-
policy critique. No agreement fabricated; NVIDIA position still required.
No source modified by this review; probes are untracked evidence only.
