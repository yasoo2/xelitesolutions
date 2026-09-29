# MUSE Wiring Discovery 008 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 8)
HEAD=ef3476e7 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=files-trunk declaration + self-grounded selection survey, then
trunk_files.mts live round-trip batch (exit 0, 16 cases) via canonical path
+ arch2.mts backend matrix (exit 0, 3 cases) + targeted source reads
EVIDENCE=tmp/wiring-audit/trunk_files.json + trunk_files.mts + arch2.json +
arch2.mts (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-007.md (risk table surveyed;
per-trunk stories 0/19 + fixture designs queued)

## New findings (all Muse-branch @ ef3476e7, independently executed)

### F34. Files trunk 10/10 registered + SELECTABLE_BY_KEYWORD; exclusion is fast-path-only

All 10 files-trunk names rank in the keyword top-30 on self-grounded goals
(8 best-rank-1: archive/delete/advanced/inspect/project_edit/read/search/
write; file_edit best-rank-2 behind file_edit_advanced; ls best-rank-2).
6/10 are ROUTER_EXCLUDED (delete_file, file_edit, inspect_directory,
project_edit, read_file, write_file) — but selectToolsFor() never consults
that set (toolCatalog.ts:186-220): it scores all 163 by name/tags/desc and
pins 5 of these 10 via CORE_TOOLS. ROUTER_EXCLUDED gates only capabilityRoute
(the ACT-verb single-specialist fast path, :412) and the tool-rerank pool
(tool-rerank.ts:345) — "tools with their own deterministic path". So the
excluded file tools ARE planner-visible (catalogue block) and ARE selectable;
they are only never ACT-verb auto-routed. Coherent design, now evidenced.
Priority-listed 5/10 (archive_files, file_edit, ls, read_file, write_file).
Doc nit (no batch): toolCatalog.ts header still says "Joe registers 151
tools" — stale at 163.

### F35. Files round-trip green + advanced-edit atomicity proven live

write_file -> read_file -> file_edit -> read_file -> file_edit_advanced
(2 edits) -> read_file all ok:true with byte-verified content at each step
(trunk_files.json). file_edit_advanced with 1 matching + 1 missing edit
returned ok:false 'could not match 1 replacement(s)' AND the follow-up read
shows content byte-identical to before (ALPHA/BETA2 intact) — the
never-persist-partial rule (UtilityTools.ts:380-389) holds live.

### F36. project_edit no-project -> ok:true message (6th absence-as-success)

{request:'change the title'} with no session project returned ok:true +
'No active project in this session — scaffold one first.'
(ProjectEditTool.ts:624-630). Honest message, success-shaped absence —
joins WIRING-P2-004 (6th instance).

### F37. archive_files zip backend broken on Windows; tar.gz works (new P2-009)

zip create failed 2/2 (trunk_files.json + arch2.json rerun): the tool runs
`zip -r ... 2>/dev/null || true` (ArchiveFilesTool.ts:92) — no `zip` binary
on this Windows box, `|| true` swallows the failure, then statSync on the
never-created archive throws ENOENT, surfaced as 'Archive operation failed:
ENOENT ... stat b.zip'. Two defects: (a) zip backend needs an external Unix
binary (portability defect per standing production rules); (b) `|| true` +
statSync converts 'tool missing' into a misleading 'archive missing' error.
tar.gz create+list on the same fixture: ok:true both (arch2.json) — the
create/list machinery itself works. New WIRING-P2-009. Note: tar.gz list
shows the archive stored an absolute-source path
('Joe/muse-worktree/.../a.txt') — extraction-path review rides with the batch.

### F38. delete_file explicit path -> approval_required, target SURVIVED

delete_file {path: <fixture>/doomed.txt} returned ok:false approval_required
risk=high (firewall pre-emption, 2nd live proof after 006's {} case) and the
probe verified doomed.txt still exists afterwards. Gate precedes execute for
explicit paths too. No deletion was performed by the audit.

### F39. dead_code_detector contained fixture: explicit path accepted, honest fail

{projectPath: <fixture-abs>, mode:'files'} did NOT return 'Project path does
not exist' — the explicit path was accepted and npx knip was attempted in it;
knip is not installed and npx could not fetch (sandbox EPERM cache), and the
tool returned honest ok:false scanned:false with the raw cause
(trunk_files.json). The {} default-root behavior (Joe's own repo) remains
CODE-INDICATED (DeadCodeTool.ts:50), correctly unprobed. autoFix dead input
unchanged (WIRING-P2-006).

### F40. dependency_audit contained fixture: per-input root PROVEN; error text mislabels

{path: <fixture-abs>} ran npm audit IN the fixture: the failure is ENOLOCK
about the fixture's own missing lockfile ('requires an existing lockfile'),
which proves the explicit path selects the execution root (it did NOT audit
Joe's repo). But the tool's `error` says 'Audit found security
vulnerabilities.' (QualityTools.ts:102) — a lockfile/setup failure labeled as
a vulnerability finding. The output.report DOES carry the real stderr, so the
cause is recoverable, but any ok/error-only consumer misreads it. New
WIRING-P2-010 (misleading error text; distinct from P2-005's missing error).

### F41. Fixture DESIGNS for the 4 EMBARGO names (static; no live calls)

- memorize_codebase: vectorDb is a singleton over path.resolve(cwd,
  'data/memory') (vectorDb.ts:19-20) with clear() unconditional
  (MemoryTool.ts:96). Safe design: dedicated probe process that chdir()s to
  an empty temp dir BEFORE importing (all probe imports absolute), so the
  singleton persists under temp/data/memory; then canonical-path
  {directory: <2-file fixture>, extensions:['txt']} and expect ok:true
  'indexed 2 files'; follow with recall_memory {query: <fixture token>} and
  expect the token. Proves routing + index + recall without touching real
  memory. NOTE: cwd-relative default store is itself a portability smell
  (memory location depends on launch cwd) — rides with WIRING-P2-001.
- deploy_pages: fake-token-store fixture only (per WIRING-P1-003): stub
  getAllWorkspacesForLookup to {foreign workspace with token} + session
  workspace without token; call with a session context and assert the foreign
  token is NEVER selected (expect honest no-token failure). Never a live
  gh-pages push. Proves token scope without external mutation.
- project_run: ephemeral-port + auto-stop fixture: {command: 'node -e
  "setTimeout(()=>{},2000)"', cwd: <fixture>} with a 10s probe cap; assert
  started receipt + process reaped after stop/timeout + no listener left on
  the port. Never a real server/bind the dev ports.
- browser_launch: headless data-URL fixture: {url: 'data:text/html,<title>
  probe</title>', headless: true} with a 30s cap; assert session receipt +
  title observable + session closed afterwards. Never google.com default.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; trunk probe aborts unless 163)
TRUNK_STORIES=1/19 (files 10/10: declarations + selection + live round-trip)
FILES_SELECTION=10/10 SELECTABLE_BY_KEYWORD (8 rank-1, 2 rank-2)
FILES_LIVE=write/read/edit/advanced/inspect/ls/glob green (verified content);
advanced atomicity proven; project_edit absence-as-success; archive tar.gz
green, zip 0/2 (backend missing); delete_file gated + target survived
FIXTURE_LIVE=2/2 FIXTURE-class probed contained (dead_code honest fail,
dep_audit per-input root proven); 4/4 EMBARGO designs written, still unexecuted
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2 (unchanged)
CONTRACT_MISMATCHES=7 confirmed + 2 new error-evidence defects (F37b cause-swallow,
F40 mislabel) filed as P2-009/P2-010 (tool-local, not cross-boundary mismatches)
REAL_JOE_PROVEN=no new UAT in this checkpoint (read-only discovery + bounded safe probes by design)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-009 (archive_files zip backend: external-binary portability +
  `|| true` cause-swallow + misleading ENOENT; tar.gz proven working; review
  absolute-source storage in archives).
- NEW WIRING-P2-010 (dependency_audit misleading error text: setup/lockfile
  failures labeled 'vulnerabilities'; error must reflect cause class).
- WIRING-P2-004 extended: project_edit no-project ok:true (6th
  absence-as-success instance).
- WIRING-P2-001 extended: vectorDb cwd-relative store note (fixture design
  depends on it; portability smell).

## Corrections to prior checkpoints

- Checkpoint 5/7 summary line ROUTER_EXCLUDED=32 "exclusion-from-keyword-router,
  not proof of internal-by-design": REFINED — exclusion is from the ACT-verb
  capabilityRoute fast path + rerank pool only; selectToolsFor/catalogueFor
  (the planner prompt block) includes excluded tools and pins 9 via
  CORE_TOOLS. No file tool is planner-hidden by this set.
- Checkpoint 6 "dead_code/dependency_audit live behavior unprobed": PARTIALLY
  SUPERSEDED — both now probed with contained explicit inputs; {} defaults
  remain code-indicated by rule.

## Limits / UNKNOWNs

- Per-trunk stories 1/19 (browser_ui next per plan; 33 members, needs batching).
- 4 EMBARGO fixture designs written, unexecuted (need isolated-process harness).
- archive extract path unprobed (create-failure blocked zip; tar.gz extract
  + absolute-source extraction review future).
- delete_file execute-body honesty (not_found/is_directory branches) unprobed:
  firewall pre-empts first under default policy (approval probe, not execute).
- Verification-compat sweep pending (LEVEL 5-6).
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker still BLOCKED at last observation.

## Reproduction

From api/ with process-only test env:
  $env:TEMP='<writable>'; $env:TMP='<writable>'; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_files.mts > ..\tmp\wiring-audit\trunk_files.log 2>&1
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\arch2.mts > ..\tmp\wiring-audit\arch2.log 2>&1
Expected: both exit 0; trunk_files.json 16 live cases (round-trip green,
atomicity proven, project_edit absence ok:true, zip create ok:false ENOENT,
delete_file approval_required + doomed survived, dead_code honest scanned:false,
dep_audit ENOLOCK with mislabeled error); arch2.json tar.gz create+list ok:true,
zip rerun ok:false. NOTE: redirect to file or rerun (pipe flake exits 1 with
complete output); system TEMP may be sandbox-denied, use a worktree-local dir.
