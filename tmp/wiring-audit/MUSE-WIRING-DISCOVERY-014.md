# MUSE Wiring Discovery 014 — CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT

AGENT=MUSE
TASK=Deep capability/wiring audit, Muse portion (discovery checkpoint 14)
HEAD=876e197d + this checkpoint (probe/docs only, no source edits)
DATE=2026-09-30
METHOD=trunk story (LEVEL 4) for security 3/3 via canonical path
(registry entry, 163 verified; ToolService.executeTool inside firewall
runInContext; session-root fixtures created + removed by the probe;
NO network legs) + static checker partition over the trunk +
pure-function verdict table over source-grounded shapes +
one pure resolveToolPath mapping proof (no scan). Full trunk probe ran
2x exit 0 with identical verdicts (13/13 legs; audit.empty-dir report
text varies by mechanism, see F83).
EVIDENCE=tmp/wiring-audit/trunk_security.mts + trunk_security.json (run 2
machine-readable; run 1 preserved in trunk_security.log) +
trunk_security_run2.log (this worktree)
STATUS=AUDIT_FIRST — no registrations, refactors, or deletions performed.
PRIOR=tmp/wiring-audit/MUSE-WIRING-DISCOVERY-013.md (testing_qa LEVEL-4)

## Trunk membership (merge.json v1, challenged, stands)

security = dependency_audit, secrets_scan_repo, security_scanner (3).
All 3 exist in the live registry; no membership correction needed.
This closes the checker set except code_reviewer (code_understanding
trunk, still unsurveyed): 13/14 allowlisted task-level checker shapes
now partitioned (013/F77 + 014/F87).

## New findings (all Muse-branch @ 876e197d)

### F83. dependency_audit audits the ANCESTOR package on packageless paths (P2-006 extension + P2-005 4th instance, LIVE 2x)

audit.empty-dir (explicit contained path, empty dir), two runs:
run 1 -> ok:false, error 'Audit found security vulnerabilities.',
report = PURE npm self-update NOTICE (exit cause nowhere);
run 2 -> ok:false, same error, report = ancestor audit JSON
(auditReportVersion 2, multer/high via source 1113635).
Upward-chain proof: the ONLY package.json above the fixture is
D:\Joe\muse-worktree\package.json (Joe's own root); multer exists
only in Joe's own deps. npm prefix resolution walked up out of the
explicit path and audited Joe's own repo over the network.
Consequences: (a) the recommended "explicit path" usage is still
uncontained when the dir lacks package.json — P2-006 is not only a
default-root defect; (b) same leg, two runs, two entirely different
reports (notice-noise vs ancestor JSON) — verdict-stable ok:false,
diagnostic-unstable (P2-005 4th instance: cause-substitution +
content variance); (c) the P2-010 mislabel stands on both shapes
(setup failure reported as 'vulnerabilities'). Fix direction (batch):
pre-check package.json/lockfile presence in-tool; pin --prefix.
Positive leg (real audit with lockfile) stays EMBARGOED (network).

### F84. security_scanner file-as-projectPath always misses (NEW P2-021, LIVE)

scan.file-target (projectPath='wiring-sec-scan/vuln.js', an existing
file): discoverSourceFiles returns [basename] (SecurityScannerTool.ts:
202) but the executor resolves it against the FILE path (:124-127),
so .../vuln.js/vuln.js never exists -> missingFiles -> ok:false
'could not scan 1 requested file(s): vuln.js'. A planner passing a
file target always fails. Fix: resolve basenames against dirname when
projectPath is a file, or reject file-targets honestly upfront.

### F85. secrets_scan_repo missing path scans "clean" (P2-004 8th absence-instance, LIVE)

secrets.missing (nonexistent path) -> ok:true, findings:[], scanned
Files:0 — byte-identical shape to secrets.clean (empty dir).
walk() swallows the readdir failure (QualityTools.ts:303), so a
nonexistent repo is indistinguishable from a clean repo. Fix: honest
nonexistent-path error (same guard shape security_scanner already
has at SecurityScannerTool.ts:100-104).

### F86. secrets_scan_repo required:['path'] is decorative; {} maps to the DEFAULT workspace (P2-004 required-vs-execute, pure mapping proof, NEVER scanned live)

execute() reads input?.path||'' with no required check, and
resolveToolPath('') returns the default root without throwing
(QualityTools.ts:285 + utils.ts:82-106). Proven pure in-probe:
emptyPathMapsTo = data/projects/my-workspace (the REAL default
workspace, not the session). So a missing path would silently
become a full default-workspace scan (up to 200 findings),
crossing session boundaries. Same defect class as task_lifecycle
(P2-004) with a session-escape consequence. Architectural
contrast: security_scanner binds to the session root via
ctx.workspaceId (outside-nonexistent leg containment-proven,
F91); both its trunk siblings call resolveToolPath WITHOUT a
workspaceId, so they are projectRoot-bounded, not
session-bounded. Never executed live by rule; mapping proof only.

### F87. Trunk checker partition 2/3; both checkers evidence-hollow; scope preference covers both (P2-019 + P2-018 extensions, static)

isVerificationTool(name,{},false,false,false): exactly
dependency_audit + secrets_scan_repo are task-level checkers; gate
opt-ins change nothing for this trunk; security_scanner never
receipted. Neither checker emits output.url/reportPath/
evidenceLocation (dep_audit: {report}, QualityTools.ts:99,102;
secrets: {findings,scannedFiles}, :346) while the receipt reader
takes evidenceLocation ONLY from those keys -> 5th/6th hollow
shapes (P2-019 broadens from test-run to ALL non-URL checkers).
Both take a `path` arg, and scopeRoot prefers args.path at BOTH
task level (PhaseExecutorTool.ts:1570-1578) and gate level
(:2372-2378) -> MISMATCH #10 nonce-scope extension is
code-indicated for 2 more checkers (P2-018 now covers read_file
live-proven + quality_run/auto_tester/dep_audit/secrets
code-indicated). L5 live gate proof still pending for all four.

### F88. security_scanner findings do not affect ok (presence-as-success shape; verdict-table row; NON-CHECKER, documented constraint)

Pure table: 'scanner findings-present' (ok:true + critical vuln +
riskScore 25) maps to 'passed'. A scan FINDING critical vulns
verdicts passed — the inverse of the P2-004 absence family. Safe
ONLY because the tool is a non-checker (never receipted; V5
ledger-is-checker-only). Documented as a constraint: this tool
must not join the checker allowlist without inverting the
mapping. Not a defect today; no batch.

### F89. Trunk selectability 3/3 rank-1, zero exclusions; sideEffects 3/3 honest (first fully-honest trunk)

SELECTABLE_BY_KEYWORD 3/3, all best-rank-1 on self-name goals
(dep_audit 8.6, secrets 19.5, scanner 13.1); 0/3 router-excluded;
0/3 priority-listed. dep_audit declares [execute] and runs npm
(honest); scanner/secrets declare [] and are read-only (honest:
fixture dirs byte-identical before/after, BOTH runs).
Contrast P2-011 (browser 25/33 empty sideEffects) and P2-020
(testing 2/6 dishonest). No selection-layer or declaration
defect in this trunk.

### F90. Discovery vocabulary split: .env invisible to discovery, visible to explicit files (P2-021, same batch as F84, LIVE)

scan.discover scanned EXACTLY [clean.js, vuln.js] (.env excluded:
not in sourceExtensions, SecurityScannerTool.ts:190-194);
scan.explicit-env scanned .env -> 1 critical (explicit files
bypass the ext filter, :124-127). Undocumented split: discovery
coverage != explicit coverage. Same contract batch as F84
(align-or-document vocabulary + file-target handling).

### F91. Positive controls: containment, math, bounds, ignores (LIVE)

scan.outside-nonexistent -> 'must stay within the active
workspace' via the canonical path (ToolService auto-assigns
session-audit-sess; scanner enforces — session binding WORKS).
scan.seeded-files: 5 vulns (critical 2: SQLi + hardcoded;
high 2: XSS + eval; low 1: validation), riskScore EXACTLY 83
(25x2+15x2+3), summary exact, scannedFiles exact. secrets.seeded:
EXACTLY 4 findings (openai_key 1 + generic 3), scannedFiles 3,
node_modules plant absent (ignore honored). secrets.cap
(maxFindings:1) -> exactly 1 finding. scan.missing/empty-dir
honest (missing list echoed; empty guard preserved from sweep2).
No approval gate fired (low/medium tier); no rate-limit hit.

## Updated counts (Muse branch)

REGISTERED_TOOLS=163 (unchanged, re-verified at boot; probe aborts unless 163)
TRUNK_STORIES=4/19 fully storied (security 3/3 LEVEL-4 + static
verification-compat; L5 live gate proof pending) — files 10/10 +
browser_ui 33/33 + testing_qa 6/6 + security 3/3 = 52 tools
TRUNK_SECURITY=3/3 SELECTABLE rank-1; 13/13 live legs canonical
(7 scanner + 4 secrets + 2 audit), 2x verdict-identical; 7-shape
verdict table; fixtures untouched + removed both runs
ORPHANED=5 (unchanged) | DEAD_MAPPINGS=2 (unchanged) | DUPLICATE=2
CONTRACT_MISMATCHES=11 confirmed (unchanged — F83/F85/F86 are
P2-006/P2-004/P2-010 extensions; F84/F90 are tool-local P2-021;
F88 is a documented non-checker constraint, not a mismatch)
EXECUTABLE_NOT_VERIFIABLE=0 on 4 swept trunks (52/52 verdict-
mappable, safe direction except F88's non-checker
presence-success which never reaches a receipt) + 6
evidence-hollow receipt shapes (browser_run, read_file gate,
quality_run, auto_tester, dependency_audit, secrets_scan_repo)
+ 1 dead-reuse path (MISMATCH #10, now code-indicated for 4
checkers) + skip-blind mapping (F75) + 1 missing-path-as-clean
shape (F85); remaining 15 trunks UNKNOWN
CHECKER_SET=13/14 allowlisted task-level shapes partitioned
(code_reviewer pending in code_understanding trunk)
REAL_JOE_PROVEN=no new UAT (pipeline probes by design, not UI)

## Repair backlog changes (PROPOSED, unactioned)

- NEW WIRING-P2-021 (security_scanner file-target always-misses
  + discovery/explicit vocabulary split: resolve basenames
  against dirname for file targets or reject honestly;
  align-or-document .env/ext coverage).
- EXTENDED WIRING-P2-006 (npm upward escape: explicit
  packageless path audits the ancestor package over the
  network — F83; pre-check package.json/lockfile + pin
  --prefix; not only the default-root defect).
- EXTENDED WIRING-P2-005 (4th instance: audit.empty-dir
  report run-varying notice-noise vs ancestor JSON — F83).
- EXTENDED WIRING-P2-010 (empty-dir variant: same mislabel,
  second setup shape; report sometimes pure noise — F83).
- EXTENDED WIRING-P2-004 (8th absence instance:
  secrets missing-path-as-clean — F85; + decorative-required
  instance: secrets path — F86).
- EXTENDED WIRING-P2-019 (broaden test-run batch to ALL
  non-URL checkers: dep_audit/secrets hollow — F87).
- EXTENDED WIRING-P2-018 (scope fix covers 2 more
  checkers, code-indicated — F87).
- LIFTED nothing; embargoes hold (dep_audit positive leg:
  network; secrets {}: never scan — mapping proof only).

## Corrections to prior checkpoints

- TOOL-dependency_audit row's "NOT_PROBED (fixture-only)"
  is superseded for fast-fail shapes: 2/2 audit legs now
  LEVEL-4 via canonical path (positive leg still embargoed).
- TOOL-security_scanner row's "scan path itself unprobed"
  is superseded: 7/7 scanner legs LEVEL-4 (sweep2 {} honest
  rejection stands as the empty-input leg).
- 013/F77 "adjacent checkers dependency_audit,
  secrets_scan_repo noted statically only" is now FULLY
  partitioned + live-probed (013/F77's code_reviewer note
  still stands — code_understanding trunk next).
- 006 method note on security_scanner {} (session-root
  dependent) stands: {} scans the default root's content
  (whatever it holds); sweep2's rejection was the
  empty-session case, not a universal guard. No live {} leg
  in this checkpoint by rule (session-state-dependent).

## Limits / UNKNOWNs

- 15/19 trunks still unstories; code_understanding=16
  suggested next (holds code_reviewer, the last
  unsurveyed checker, + 5 F74 siblings).
- L5 live gate proof pending for dep_audit/secrets (same
  deferred L5 as quality_run/auto_tester; 4 checkers).
- dep_audit positive leg embargoed (registry network).
- secrets {} never executed (default-workspace scan;
  mapping proof only).
- npm behavior (upward prefix walk) evidenced via
  report content + chain proof, not npm docs.
- audit.empty-dir variance observed across 2 runs only;
  deeper npm-mapping archaeology deferred to repair.
- No Real Joe UAT in this checkpoint.
- NVIDIA areas untouched; NVIDIA worker resumed (CLI-BATCH1
  owner ack observed) — cross-review still pending.
- No model-touching tools in this trunk (no provider legs).

## Reproduction

From api/ with process-only test env:
  $fx='<worktree>\tmp\wiring-audit\fx-security' (auto-created)
  $env:TEMP=$fx\tmp; $env:TMP=$fx\tmp; $env:JOE_TEST_MODE='true';
  $env:OFFLINE_MODE='true'; $env:JWT_SECRET='dummy-test-only-not-a-secret'
  (ensure AUTO_APPROVE_ALL / AUTO_APPROVE_SAFE / ENABLE_AUTH_BYPASS unset)
  .\node_modules\.bin\tsx.cmd ..\tmp\wiring-audit\trunk_security.mts
Expected: exit 0; 3/3 SELECTABLE rank-1; 13/13 legs
(7 scanner + 4 secrets + 2 audit); audit.empty-dir report text
may vary run-to-run (notice-noise vs ancestor JSON, F83) while
ok:false/error/shape stay identical; fixtures removed.
NOTE: redirect to file (pipe flake); system TEMP may be
sandbox-denied; npm legs take ~5-15s each on warm cache.
