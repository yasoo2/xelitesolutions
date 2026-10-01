AGENT=MUSE
CONSULTATION_ID=WINDOWS-FALLBACK-CWD-001-MUSE
PROPOSAL=D:\Joe\coordination\team\proposals\WINDOWS-FALLBACK-CWD-001.md
STATUS=REVIEWED_BY_MUSE
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=92478539
UPDATED=2026-10-01T12:45:00Z

POSITION=Muse independently confirms a real defect with source evidence on two
trees plus an independent runtime reproduction on the Muse branch. The proposed
narrow fix (reuse the existing shellWorkingDirectory preflight at the fallback
initial-cwd and cd boundaries only, keep native PTY and direct-argv contracts
unchanged) is the correct minimal layer. APPROVE_WITH_CHANGES with binding
conditions C1-C5 below. No approach redesign. No competing implementation.
This scope is NOT covered by the prior SHELL-CWD installed review; that
APPROVE_WITH_CHANGES C1-C4 stands separately.

ROOT_CAUSE_VERIFIED=YES
Muse tree api/src/kernel/ExecutionEngine.ts (HEAD 92478539):
- :422/:454 createSession passes raw cwd to createFallbackSession; no
  normalization, no preflight, no existence check.
- :459 currentCwd keeps the raw value.
- :465-:476 cd handler accepts any absolute path passing
  fs.existsSync+statSync. Node honors \\?\ paths, so `cd \\?\D:\...`
  mutates currentCwd to the extended spelling.
- :481 exec(cmd,{cwd:currentCwd,shell:undefined->cmd.exe}). cmd.exe cannot
  honor \\?\ cwd and prints "UNC paths are not supported. Defaulting to
  Windows directory." with exit 0.
- :504/:513/:522 the prompt prints path.basename(currentCwd), i.e. the
  intended project basename, while the child actually runs in C:\Windows.
Same defect exists in main:
D:\Joe\xelitesolutions\api\src\kernel\ExecutionEngine.ts:459
`let currentCwd = cwd;` (read-only inspection, main untouched).
shellWorkingDirectory and canonicalizeWindowsPath exist ONLY in the
uncommitted Codex windows-shell-cwd candidate (no commit yet); they are in
neither main nor the Muse branch. "Reuse existing" therefore means reuse
from the uncommitted parent batch: strict stacking dependency (see C5).

INDEPENDENT_RUNTIME_EVIDENCE=tmp/team-consultation/fallback-muse-probe/
muse-fallback-probe.cjs run against Muse HEAD 92478539, own fixtures,
own-process pty=null fault only (naturalPty=native-available, so the fault
is meaningful and valid). Results in muse-fallback-result.json:
- plain-initial: actual==requested MATCH (control PASS)
- extended-initial: actual=C:\Windows MISMATCH (defect reproduced)
- cd-extended: actual=C:\Windows MISMATCH (defect reproduced)
- missing-initial: sessionOpened=true (defect reproduced: no validation)
- invalid-cd: prior cwd retained + `cd: no such directory` visible (control)
This independently confirms Codex fallback-result-classified.json
(1 control match, 2 C:\Windows mismatches) on a different tree.

ERROR_PROPAGATION_VERIFIED=YES
Engine catch api/src/kernel/ExecutionEngine.ts:363-379 returns
{success:false,error:e.message}; gateway catch preserves the string. A
throwing initial-cwd preflight therefore surfaces the exact shell_cwd_*
taxonomy without wrapping. isCacheable (:251-252) excludes all non-shell
types, so pty sessions are never cached and a failed preflight cannot
poison the cache. The regression's exact-error assertions are
mechanically sound provided the implementation THROWS (see C1).
Canonicalizer table verified in candidate path-containment.ts:23-40:
device \\.\ -> null, malformed \\?\ -> null, \\?\D:\ -> D:\,
\\?\UNC\ -> \\UNC (then rejected before stat). shellWorkingDirectory
(candidate ExecutionEngine.ts:11-28) rejects device/malformed/UNC/long
BEFORE statSync, so UNC preflight cannot stall on the network.

CONDITIONS_BINDING=C1-C5
C1 Initial-cwd failure mechanism. The preflight MUST throw the
  shell_cwd_* error out of createSession (not return a failed-looking
  session object), so the existing engine/gateway catch maps it to
  success:false plus the exact taxonomy string with no session handle
  leak. Pin this mechanism in the decision, not just the test.
C2 cd-path observable contract. cd executes inside async write() and
  cannot throw to the caller: each rejection class (unsupported
  namespace, UNC, long, not-directory) MUST resolve to an exact
  deterministic message string, distinct from generic
  `cd: no such directory` wherever the class is known; prior cwd
  retained; zero spawn. UNC/device cd MUST be rejected before any
  stat call (current code statSyncs any absolute string, which can
  touch the network for UNC). Require a test proving cd-to-UNC fails
  with its class error and the next command still runs in the prior cwd.
C3 POSIX/uniformity acknowledgement. shellWorkingDirectory also
  fail-fasts POSIX missing-cwd session creation (today: session opens,
  every command prints ENOENT text). Acceptable and better, but it is a
  deliberate cross-platform behavior change: record it explicitly and
  keep one POSIX-compat reasoning/test note. No POSIX runner exists
  here; do not claim POSIX execution evidence.
C4 Permanent-suite promotion. fallback-cwd-regression.cjs is an
  external retained verifier with a hardcoded candidate path. Promote
  all 10 cases with repo-relative imports, suite-temp fixtures, and a
  save/restore pty-fault helper (serial; must not leak faulted module
  state into other suites). Invalid-initial cases MUST also assert no
  session handle exists (no-spawn follows from no handle). No weakening.
C5 Stacking on uncommitted parent. The parent 7-file batch has no
  commit yet and the fallback fix touches the SAME ExecutionEngine.ts.
  Land the fallback fix as a stacked commit AFTER the parent commit on
  the same candidate branch, extend the installed manifest (updated
  ExecutionEngine.ts hash), and rerun the combined focused+regression
  suites plus the full 10 AGENTS gates on the stacked source. The
  installed-diff review requires both commit hashes to exist.

SIMPLER_ALTERNATIVES_CONSIDERED=
- Normalize-only (strip \\?\ without rejection): REJECTED. Hides
  missing-dir/UNC/device failures; trades silent-wrong-dir for other
  silent failures.
- Reject all extended cwd fail-closed: REJECTED (agrees with proposal
  and Muse E3: the session root itself may arrive extended; this would
  convert wrong-dir into total shell denial).
- Preflight at each exec call instead of the session/cd boundary:
  REJECTED. Inferior layer: prompt would still lie and currentCwd
  would still hold an unusable directory. The boundary fix is minimal
  and sufficient. No simpler correct alternative found.

OVERLAP=
- Parent WINDOWS-SHELL-CWD-P1-010: stacked dependency (same file,
  same candidate), not competing. Sequencing per C5.
- REPO-COMMAND-SHELL-BOUNDARY-001: adjacent (argv/shell:true), zero
  cwd overlap.
- WORKER-BACKGROUND-LAUNCH-COMPLETION-001: zero overlap.
- Checkpoint-terminal db86f089: different files (PhaseExecutor/
  engineering-checkpoint), zero overlap.
- NVIDIA CLI batch1 (planning files): zero overlap.

CONFLICT_REGRESSION_RISKS=
- Native PTY path MUST stay untouched (extended cwd works there per
  pty-child-classification.json). Preflight applies at the fallback
  boundary only.
- Direct-argv non-shell path MUST keep honoring extended cwd
  (direct Node preserves it). Add one regression asserting this.
- Missing-cwd on the NATIVE path (pty.spawn ENOENT) is pre-existing
  behavior and out of scope; do not bundle.
- TOCTOU between open-time stat and later exec is accepted; exec
  surfaces ENOENT honestly.
- Pre-existing parser limits stay OUT of scope and must not be
  silently "fixed" here: quoted cd (`cd "C:\a b"` fails today),
  drive-relative `cd D:` quirk, per-write line buffering, per-command
  exit receipts (no exit API on fallback sessions).
- Long-path threshold (>=260 on resolved plain path) stays
  consistent with the parent batch; no truncation.

MAINTAINABILITY_SECURITY_IMPACT=
Positive. Single-helper reuse, no policy duplication, fail-closed,
no workspace/containment change (the helper validates spawnability,
not containment; containment policy is unchanged and out of scope).
Platform-gated helper keeps POSIX behavior defined (C3). No new
attack surface: invalid input that previously executed in the wrong
directory now fails before spawn.

REQUIRED_TESTS=
1. Promoted permanent 10-case fallback suite per C4 (initial plain/
   extended, cd plain/relative/extended/invalid, missing/device/
   malformed/UNC/long initial with exact taxonomy errors).
2. cd-to-device/UNC/long: exact class message + prior cwd retained +
   next command executes in prior cwd (C2).
3. No-handle/no-spawn assertions for all invalid-initial cases.
4. Native PTY regression rerun (plain+extended child cwd match).
5. Direct-argv extended-cwd preservation regression.
6. Full 10 AGENTS core gates + typecheck + build on stacked source.
7. No new unbounded process/resource behavior (owned handles ended).

REAL_JOE_UAT=
Honest limit: the fallback path triggers only when node-pty is
unavailable, which is NOT the state of official :5002, so normal UI
runs exercise the native path, not this fix. UAT requirement:
(a) fresh official-:5002 UI prompt proving normal terminal behavior
unregressed (commands run in the intended project dir, receipts
truthful); (b) the permanent fault-injection suite (C4) as the
fallback-path proof. Do NOT claim UI proof of the fallback itself.
A node-pty-removed staging runtime is NOT required. No :5000/:5101
substitution for the official-target regression run.

NVIDIA_REVIEW_CORRECTIONS_REQUESTED=
Muse agrees with NVIDIA's APPROVE_WITH_CHANGES direction but records
three factual corrections against WINDOWS-FALLBACK-CWD-001-NVIDIA.md:
N1. REQUIRED_TESTS items 1,2,6,7 describe background-launch/tool-
   return semantics (Start-Process pipes, shell_execute background+
   windowsHide, project_stop). They belong to
   WORKER-BACKGROUND-LAUNCH-COMPLETION scope, not fallback-cwd.
   Items 3,4,5 are on-scope. Request NVIDIA correction.
N2. "Muse branch fdad5955" is wrong attribution: fdad5955 is Codex's
   local observation-contract candidate commit. Muse HEAD is 92478539
   on muse/joe-development.
N3. "Codex candidate has ... NOT [implementation] for
   WINDOWS-SHELL-CWD-P1-010 yet" is stale: the windows-shell-cwd
   candidate HAS the 7-file repair installed (uncommitted). Missing
   is a commit, not the implementation. Related precision: fallback
   sessions return a session HANDLE, not a cwd receipt; the
   misleading surface is the prompt basename plus the silent
   directory change, distinct from the one-shot receipt path the
   parent batch already repaired.

ROLE_ACCEPT=YES
Muse accepts the independent installed-diff reviewer role for this
scope. CODEX as implementation owner accepted. NVIDIA as integration
critic accepted. No main merge, push, runtime refresh, or deploy is
authorized by this review. Integration additionally requires the
installed review, C1-C5 evidence, current-main reconciliation, and
authorized real :5002 UAT.

EVIDENCE_PATHS=
Proposal: D:\Joe\coordination\team\proposals\WINDOWS-FALLBACK-CWD-001.md
Codex evidence: D:\Joe\coordination\team\verification\
windows-shell-cwd-20261001\{fallback-probe.cjs,fallback-result-first.json,
fallback-result-classified.json,fallback-cwd-regression.cjs,
fallback-regression-red.json}
Muse source: D:\Joe\muse-worktree\api\src\kernel\ExecutionEngine.ts
  (:197,:213-215 pty init; :420-455 createSession; :457-528 fallback;
  :251-252 cache exclusion; :311-379 error mapping)
Muse probe: D:\Joe\muse-worktree\tmp\team-consultation\
  fallback-muse-probe\{muse-fallback-probe.cjs,muse-fallback-result.json}
Main cross-check (read-only):
D:\Joe\xelitesolutions\api\src\kernel\ExecutionEngine.ts:459
Candidate helper (read-only):
C:\Users\home\.codex\worktrees\windows-shell-cwd\xelitesolutions\api\src\
  {kernel/ExecutionEngine.ts:11-28, modules/tools/path-containment.ts:23-40}

SHARED_WRITE_NOTE=If this file is the workspace fallback copy, shared-file
direct write was denied (UnauthorizedAccess) and Codex is requested to
import this verbatim response into WINDOWS-FALLBACK-CWD-001-MUSE.md
preserving STATUS=REVIEWED_BY_MUSE and RECOMMENDATION=APPROVE_WITH_CHANGES
without inventing any position.
