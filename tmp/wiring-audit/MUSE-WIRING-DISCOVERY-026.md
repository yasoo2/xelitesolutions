# MUSE Wiring Discovery 026 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 26)
HEAD=93a53785 + this checkpoint (probes/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for media_images 2/2 via
canonical path (registry entry, 163 verified; ToolService.executeTool
inside firewall runInContext; session-root fixtures created + removed by
the probe) + static checker partition over the trunk +
pure-function verdict table over source-grounded shapes. Full trunk
probe ran 2x filed runs A/B with 10/10 legs verdict-identical (ok +
error-prefix + output-shape, verdictDiffs=0; decl + verdict table also
byte-stable). One pilot run preceded the filed pair and is reported
honestly below (fixture-path correction after a \\?\ -cwd crash
diagnosis). One diagnostic script (diag_media_read) isolates that crash
with plain-vs-prefixed cwd controls. No live process survived; no
stray files (session/default/api roots re-verified clean, FX removed,
global joeProjects entry restored). No source edits; architecture +
package-scripts guards re-verified green.
EVIDENCE=tmp/wiring-audit/trunk_media.mts + trunk_media_run{A,B}.json +
trunk_media_run{A,B}.log + trunk_media_run1.log (pilot) +
diag_media_read.mts + diag_media_read.log +
compare_media_runs.py (this worktree; A/B filed)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-025.md (network_api LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

media_images = image_studio, video_action (2). Both exist in the
live registry. EFFECT NOTE (same class as the network trunk's F181
asymmetry, milder): one tool shells out to an external binary
(ffmpeg), the other drives an in-repo ladder (photo search ->
generated image -> designed card) through the project's own entities
module — same trunk by purpose (fill/produce media), opposite
execution substrates. Purpose-merge stands; the matrix rows carry
the note.

## New findings (all Muse-branch @ 93a53785)

### F202. executionEngine.run() drops exit status: video_action false success (LIVE 2x, EXTEND P1-012)

va.convert-missing + va.trim-nooptions (missing input, ffmpeg NOT
installed) -> ok:true + output {success:true, savedPath, ffmpegLogs}
BOTH runs, with `FFMPEG Success:` log lines. The failure is real and
visible inside ffmpegLogs ('ffmpeg' is not recognized...), yet ok
lies. savedPath points to files that DO NOT EXIST (out1Exists/
out2Exists=false, checked live pre-cleanup both runs).

Root (source-pinned): runCommandInternal resolves {ok: code===0,
...} and NEVER rejects on nonzero exit (ExecutionEngine.ts:1033-
1042); execute() wraps any non-throw as success:true (:342-346);
run() returns `ok: result.success` (:545-551) — DROPPING data.ok
and exitCode. Its sibling runArgv honors them (:567-568: `ok:
result.success && (result.data?.ok !== false)` + exitCode field).
Code-certain corollary: even engine TIMEOUTS (which resolve
ok:false internally, :1055-1061) surface as run() ok:true.

Blast radius: EVERY executionEngine.run(string) consumer inherits
false success on nonzero exit — video_action is the live-proven
instance; the shell_string family (shell_execute, repo_run_command
string legs, terminal flows) shares the root. This is the SHARPEST
live consequence of the F102 exitCode omission (016): not a lost
cause but an INVERTED receipt. It also feeds the verdict mapping:
ok:true + success:true => passed, so a never-rendered video closes
a verification check as passed.

NOT a new batch: this is the 2nd LIVE instance of the filed
WIRING-P1-012 root (1st: docker_manager 023/F169, MISMATCH #19) and
closes the live check on the 4th surveyed consumer
(VideoActionTool.ts:62). Survey update: video DONE live; 3 remain
(DeadCodeTool.ts:65, ErrorRecoveryTool.ts:146,
RepoSelfCodingTools.ts:90 — each still needs a live check;
consumers that inspect stderr/output content may behave honestly
despite the engine lie). Repair direction stays P1-012's: run()
must honor data.ok like runArgv + surface exitCode (the F102
repair, now with two false-success proofs); audit which consumers
RELY on always-true ok before landing (shell_execute contract
tests will move). Regression: nonzero-exit fixture => run()
ok:false + exitCode pinned; video missing-input leg => ok:false.

### F203. video_action: no validation, raw interpolation, uncontained paths, unverified savedPath (LIVE 2x + code, P2-045 NEW)

(a) required:['action','inputFile','outputFile'] DECORATIVE: {}
yields 'Unknown action' (the switch default), never a schema error
— live 2x, P2-004 instance. (b) UNGUARDED INTERPOLATION live:
trim WITHOUT options puts the literal word `undefined` into the
ffmpeg command (trimLogHasUndefined=true both runs, visible in the
`FFMPEG Success:` log line). (c) options INTERPOLATED RAW into a
shell string for trim/custom/extract_frame (VideoActionTool.ts:45,
51,54 -> executionEngine.run(command) -> shell:true): a
caller-controlled options string reaches cmd.exe — injection
surface, code-cited, NO live payload legs per standing embargo.
(d) inputFile/outputFile UNCONTAINED: no resolveToolPath anywhere;
absolute \\?\ paths honored verbatim (live command lines); outputs
can land anywhere the process can write — code-certain,
outside-write live leg embargoed per standing rule (same protocol
as F179/F198a). (e) savedPath UNVERIFIED: the tool echoes the
requested output path as success evidence without checking the
file (F202 proves the false case). Even after P1-017, exit-0 does
not prove the artifact — the tool must stat its own output.

Repair rides P2-045: enforce required + action/options validation
with sentences; contain paths via the shared util after P2-037
decides the ONE rule; quote/argv-harden the ffmpeg invocation
(prefer runArgv over the shell string); verify savedPath exists
post-run and report honestly; regressions pin the trimmed-undefined
sentence + refusal + byte-present artifact.

### F204. image_studio readTables/writePictures fail SILENT: misleading receipts (LIVE pilot + diag, P2-046 NEW + P2-005 EXTEND)

readTables wraps the ENTIRE subprocess read in try/catch -> []
(ImageStudioTool.ts:63); writePictures catches everything and
reports wrote:0 (line 94). Any spawn fault, ESM import fault, or
25s/40s timeout surfaces as []/0 — and [] renders as the
domain-confident 'No table here has a picture column — pictures
belong to things, not to invoices and people.' The pilot proved
it live: is.allfilled (fixture WITH an image column) returned the
no-picture sentence because the subprocess CRASHED, not because
the column was absent.

Diag isolation (diag_media_read.log, same script text as
readTables): plain cwd -> done {ok:true, exitCode:0}, tables read
correctly (plants/id/name/image + row); \\\\?\\ -prefixed cwd ->
done {ok:false, exitCode:1}, EISDIR crash (node lstat 'D:'),
no out file. Same fixture, same script — the ONLY variable is
the cwd prefix.

writePictures shares the pattern (code-cited): a crashed write
renders as 'table: 0 — ...' INSIDE an ok:true receipt — a silent
zero inside a success. P2-005 instance (cause dies inside the
tool's own catch, same class as F190's parser shape).

Repair rides P2-046: surface spawn/read/write faults as
tool-diagnostic errors (distinct from the no-picture domain
sentence); keep the EISDIR control as a regression (prefixed cwd
=> diagnostic error, never the domain sentence); owner decides
whether to normalize extended prefixes at the entry boundary
(coordinate with P1-010).

### F205. \\\\?\\ sessionRoot breaks subprocess cwd AND shell cwd (LIVE 2x + diag, EXTEND P1-010)

sessionRoot here is `\\\\?\\D:\\Joe\\muse-worktree\\data\\...`
and the prefix propagates: (a) video ffmpegLogs (live 2x) show
cmd.exe 'UNC paths are not supported. Defaulting to Windows
directory.' — the P1-010 extended-prefix cwd-fallback mechanism
reproduced through a CANONICAL tool leg; (b) image readTables
EISDIR on prefixed cwd (diag). Production joeProjects entries
carry plain paths (fixtures corrected to match), but ANY
prefixed dir reaching these tools breaks them — one silently
(F204), one noisily (ffmpegLogs).

No new batch: this is ROOT-ENABLER evidence for the existing
WIRING-P1-010 (extended-prefix cwd). The P1-010 repair must cover
BOTH consumers: normalize-or-reject extended prefixes before
subprocess cwd AND before shell cwd (or stop emitting prefixed
roots from getActiveRoot — owner decides the ONE rule, coordinate
with P2-037's path-util decision).

### F206. POSITIVE: image_studio honest guards + contained positive with zero network/browser (LIVE 2x)

is.noproject/is.nopicture/is.nopicture-any -> honest bilingual
domain sentences BOTH runs (entry-absent + filter-both-modes).
is.allfilled (fixture B, plain path) -> ok:true + filled:0 +
tables:['plants'] + 'every row already has one' BOTH runs, with
allfilledImageNotes=0 and logN=1: picturesFor NEVER reached (the
`continue` branch), no photo search, no Shrinker/browser use
(Shrinker constructed but never exercised — lazy by design,
row-image.ts:89-115 — close() a no-op). The full read chain IS
live-proven: entities.js exists-gate + node-subprocess table read
+ IMAGE_COL filter + limit clamp path + bilingual receipt.
picturesFor/picture-network/writePictures-positive behavior
remains UNPROVEN live (embargoed by design). No batch.

### F207. Verdict table: filled:0-shape => passed (table + LIVE shape, rides #13)

'is allfilled-shape' {ok:true, output:{message, filled:0,
tables:['plants']}} => passed. Same root as #13/#14/#15 (verdictOf
keys on ok/error-text/status-word, never reads output semantics):
a zero-work receipt closes a check as passed. The shape is not
hypothetical — is.allfilled produced it LIVE. No new number (same
root, same repair batch as #13); recorded as a shape per audit
discipline. va ok-shape => passed; all four guard shapes =>
failed (correct). No EXECUTABLE_NOT_VERIFIABLE addition: 146/146
swept tools remain verdict-mappable.

### F208. Selectability + declaration notes (static + registry)

SELECTABLE_BY_KEYWORD 2/2, BOTH rank-1 on the self-name goal
(image 14, video 12.9 — strong self-grounding, same class as
F199). 0/2 ROUTER_EXCLUDED. 0/2 priority-listed. Rate limits
EXPLICIT and low on both (image 6, video 5/min — sane for
heavy tools; contrast the undeclared 60/min defaults elsewhere).
image declares permissions internet+write (honest: photo search
+ DB writes); video declares execute+read+write with matching
sideEffects (honest declarations — the defect is BEHAVIORAL
(F202/F203), not declarative). 0/2 checkers of any level
(checker set stays 14 task-level + project_run live-gate-only).
Boot permission-default list UNCHANGED at 21; rate-default list
UNCHANGED at 2.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probes abort unless 163)
TRUNK_STORIES=17/19 fully storied (media_images 2/2 LEVEL-4 +
static verification-compat + checker-set 0/2) — 144 + 2 = 146
tools. REMAINING 2 trunks are COORDINATION-BLOCKED, not
unstoried-by-choice: planning_orchestration=10 (NVIDIA-OWNED) +
memory_knowledge=7 (overlaps NVIDIA-claimed files) — Muse will
NOT story them without coordination. This checkpoint completes
the Muse-storyable trunk set.
TRUNK_MEDIA=2/2 SELECTABLE (both rank-1 self-name); 10/10 live legs
canonical 2x filed verdict-identical (verdictDiffs=0; decl +
verdict table byte-stable); 7-shape verdict table; diag plain/
extprefix controls; fixtures removed (session/default/api roots
re-verified, FX removed, global entry restored)
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=20 confirmed (NO new number: F207 rides #13;
F202/F204 are tool/engine truth defects, same class as F113/F175/
F155/F190 — counted as batches, not mismatches, per standing rule)
EXECUTABLE_NOT_VERIFIABLE=0 on 17 swept trunks (146/146 verdict-
mappable)
CHECKER_SET=14 task-level + project_run live-gate-only (unchanged;
0/2 trunk task-level checkers)
P1_ITEMS=0 new (P1-012 EXTENDED: video 4th-consumer live
instance F202 + timeout corollary; P1-010 EXTENDED with F205 live
evidence: cmd-fallback + EISDIR)
P2_ITEMS=2 new (P2-045 video_action hardening F203, P2-046
image_studio silent-failure receipts F204) + extensions to P2-004
(video required decorative) and P2-005 (F204 silent-[] instance)
+ #13-batch extension (F207 filled:0 shape)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- EXTEND WIRING-P1-012 (engine run() exit-blindness F202): +
  video_action 2nd live instance (missing input + absent ffmpeg =>
  ok:true success:true, savedPath->nonexistent, live 2x) closing
  the 4th surveyed consumer (3 remain); + timeout corollary
  (code-certain: internal timeout ok:false still surfaces as
  run() ok:true). Repair direction unchanged (honor data.ok +
  surface exitCode); consumer-reliance audit still required
  before landing.
- NEW WIRING-P2-045 (video_action hardening F203): enforce
  required + validate action/options with sentences; contain
  paths via the shared util after P2-037; prefer runArgv over
  the shell string; stat savedPath post-run; regressions pin
  the trimmed-undefined sentence + refusal + byte-present
  artifact.
- NEW WIRING-P2-046 (image_studio silent failures F204):
  surface spawn/read/write faults as diagnostic errors distinct
  from the domain sentence; EISDIR control as regression;
  coordinate prefix normalization with P1-010.
- EXTEND WIRING-P1-010 (extended-prefix cwd F205): + cmd.exe
  UNC-fallback instance (live video ffmpegLogs) + EISDIR
  subprocess-cwd instance (diag); repair must cover shell cwd
  AND subprocess cwd (or stop emitting prefixed roots).
- EXTEND WIRING-P2-004 (decorative required): + video_action
  action/inputFile/outputFile (live 2x — {} yields the switch
  default, never a schema error).
- EXTEND WIRING-P2-005 (cause substitution): + image_studio
  silent-[]/wrote:0 instance (live pilot + diag).
- EXTEND the #13 verdict batch with the F207 shape (filled:0
  => passed, live-produced).
- LIFTED nothing; embargoes hold (ALL live media processing,
  options-payload legs, picturesFor/network legs, Shrinker use,
  cross-owner entry legs, model legs, outside-write live legs,
  SSRF live payloads beyond sync-reject shapes, credentialed
  legs).

## Working hypotheses (formed at source-read, before first run)

- 'both selectable by self-name' — CONFIRMED rank-1 both (F208).
- 'video {} yields a schema error' — REFUTED: 'Unknown action',
  decorative required (F203a).
- 'video unknown action yields Unknown action' — CONFIRMED (F208
  legs va.empty/va.unknown).
- 'video convert on missing input yields ok:false' — REFUTED:
  ok:true success:true with ffmpeg absent (F202).
- 'video trim without options interpolates undefined' —
  CONFIRMED in the live command log (F203b).
- 'image {} with no session project yields honest no-system
  sentence' — CONFIRMED (F206).
- 'image nopicture filter works on a fixture entry' — CONFIRMED
  after the production-shape path correction (F206).
- 'image allfilled yields ok:true filled:0 without picturesFor'
  — CONFIRMED, imageNotes=0 (F206).
- 'readTables works under a sessionRoot-derived dir' — REFUTED
  by the pilot (EISDIR on \\\\?\\ cwd), CORRECTED to plain paths
  per production entry shape (F204/F205).
- 'filled:0-shape maps passed' — CONFIRMED, table + live shape
  (F207).
- '0/2 checkers' — CONFIRMED (F208).

## Limits / UNKNOWNs

- 2/19 trunks remain UNSTORIED and COORDINATION-BLOCKED:
  planning_orchestration=10 (NVIDIA-OWNED — do not story without
  coordination) + memory_knowledge=7 (overlaps NVIDIA-claimed
  files — do not story without coordination). Muse trunk-story
  coverage is COMPLETE for the unblocked set (146 tools).
- F202 timeout-corollary is code-certain, never live-probed
  (no timeout leg by design); owner pins it in the P1-017
  regression.
- F203c options-injection reach is code-certain; NO live
  payload legs per standing embargo. F203d outside-write reach
  is code-certain; owner live-checks with a fixture-owned
  outside dir (same protocol as F179/F198a).
- F204 writePictures-positive + picturesFor ladder behavior
  (photo search, generated image, designed card) entirely
  UNPROVEN live — needs credentialed/network legs outside the
  embargo. The writePictures silent-zero is code-cited.
- F205 production-prefix prevalence UNKNOWN: real joeProjects
  entries observed so far carry plain paths; whether ANY
  production flow stores a prefixed dir is unproven. P1-010
  owner surveys entry writers.
- F202 consumer survey PARTIAL: 2 of 5 P1-012 consumers live-
  proven (docker, video); 3 surveyed siblings still need live
  checks (DeadCodeTool:65, ErrorRecoveryTool:146,
  RepoSelfCodingTools:90) — REQUIRED before the P1-012 repair
  lands, shell_execute contract tests first.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched (probes perform zero source edits;
  CLI-BATCH1 review duty retained, no committed NVIDIA diff
  exists yet to review — main still e8fd9589, CLI work
  dirty/uncommitted, cli-routing-fix.test.ts mtime unchanged
  2026-09-30 08:51).
- No provider/network legs in this checkpoint.

## Reproduction

From api/ with process-only test env (note: the sandbox CWD arrives as
`\\?`-prefixed, which node cannot resolve relatively — reset the
process directory and invoke node with ABSOLUTE paths; npm needs a
real `cd` plus a redirected npm_config_cache):
  [System.IO.Directory]::SetCurrentDirectory('D:\\Joe\\muse-worktree\\api')
  $fx='<worktree>\\tmp\\wiring-audit\\fx-media' (auto-created+removed for tmp)
  $env:TEMP=Join-Path $fx 'tmp'; $env:TMP=Join-Path $fx 'tmp'
  $env:JOE_TEST_MODE='true'; $env:OFFLINE_MODE='true'
  $env:JWT_SECRET='dummy-test-only-not-a-secret'
  $env:JOE_CHAT_STORE_DIR=Join-Path $fx 'store'
  $env:ARTIFACT_DIR=Join-Path $fx 'artifacts'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset;
  ensure GITHUB_TOKEN and STRIPE_SECRET_KEY unset)
  node D:\\Joe\\muse-worktree\\api\\node_modules\\tsx\\dist\\cli.mjs D:\\Joe\\muse-worktree\\tmp\\wiring-audit\\trunk_media.mts
Expected: 2/2 SELECTABLE rank-1; 10 legs, 3 ok (exact: va.empty +
va.unknown ok:false 'Unknown action'; va.convert-missing +
va.trim-nooptions ok:true success:true with outExists=false both +
trim-undefined-true; is.noproject/is.nopicture/is.nopicture-any
ok:false honest sentences; is.allfilled ok:true filled:0
tables:['plants'] imageNotes=0; 2 compare-entries; cleanup=ok);
ffmpegLogs show the cmd.exe UNC-fallback + 'ffmpeg' unrecognized;
node process exits 0.
Diag: node .../tsx/dist/cli.mjs .../tmp/wiring-audit/diag_media_read.mts
Expected: plain -> done {ok:true, exitCode:0} + tables; extprefix ->
done {ok:false, exitCode:1} + EISDIR lines; exit 0.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied (hence the fx tmp redirect); full trunk run ~1 min.
Compare filed runs: python tmp/wiring-audit/compare_media_runs.py
(exit 0, verdictDiffs=0).
Guards: cd api; $env:npm_config_cache='<fx-media>\\npm-cache';
npm run guard:architecture + guard:package-scripts (both exit 0).
