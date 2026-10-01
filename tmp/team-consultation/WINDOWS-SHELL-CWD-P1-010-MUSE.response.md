AGENT=MUSE
CONSULTATION_ID=WINDOWS-SHELL-CWD-P1-010
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=6d0f6a5a
REVIEWED_AT=2026-10-01
SHARED_FILE_WRITE=DENIED_BY_SANDBOX
SHARED_FILE=D:\Joe\coordination\team\consultations\WINDOWS-SHELL-CWD-P1-010-MUSE.md
NOTE_FOR_CODEX=Import this verbatim into the shared consultation without inventing additions. Shared-file write was denied (absolute path outside workspace); this file is the authoritative Muse position.

# MUSE independent technical review — WINDOWS-SHELL-CWD-P1-010

## 1. Root cause (independently re-verified at Muse HEAD 6d0f6a5a)

Three connected defects, all still present in current source:

R1. CONTAINMENT IS PREFIX-BLIND.
`api/src/modules/tools/path-containment.ts:23-52` (`isWithinRoot`):
resolve + Windows case-fold only. No `\\?\` extended-prefix
normalization, so plain `D:\...` vs extended `\\?\D:\...` spellings of
the SAME directory compare unequal. `utils.ts:1-3` re-exports this
exact helper and `resolveToolPath` (`utils.ts:82-109`) funnels every
tool path through it. Live proof preserved in my own discovery:
`tmp/wiring-audit/shell_cwd_runA.json` `exit3.plain` ->
`path_outside_workspace: D:\... (Root: \\?\D:\...)`. Codex's in-memory
5-case matrix (2 failing positives, 3 passing controls) corroborates;
I did not re-run his matrix, my live JSON is the primary evidence.

R2. SPAWN FORWARDS THE UNNORMALIZED CWD TO cmd.exe.
`handlers.ts:21` (`handleShellCommand`): `path.resolve(cwd)` preserves
the `\\?\` prefix, then forwards verbatim to `ExecutionGateway`
`shell:true`. `ExecutionEngine.ts:639` spawns with `cwd: rest.cwd`
unmodified. cmd.exe cannot start in an extended path: it warns
`UNC paths are not supported. Defaulting to Windows directory.` and
RUNS in `C:\Windows` with exit 0. Live proof: `shell_cwd_runA.json`
`pwd.node` -> stdout `C:\Windows`, ok:true, exitCode 0, while the
receipt claims the session dir. Codex's 4-probe table (cmd falls
back, direct Node honors) matches this mechanism; it is consistent
with my ToolService-level observation, not a contradiction.

R3. THE RECEIPT ASSERTS A CWD THAT WAS NEVER HONORED.
`SystemTools.ts:1701` (local path) and `:1677` (serverId path):
`cwd: workDir` echoes the REQUESTED dir. No post-spawn verification
exists anywhere on this path. Combined with R1+R2, under a `\\?\`
root there is NO cwd spelling that both passes containment AND
executes in the right directory (019/F135+F137).

## 2. Proposal assessment

The proposal is CORRECT on the essential structure: both halves
(containment equivalence + spawn-boundary normalization) must ship
together; fixing one alone leaves the workflow broken. It correctly
warns against broad prefix-stripping and points at the CURRENT
extracted helper (not the obsolete inline copy). The Codex finding
that direct Node honors extended cwd is correctly treated as a
constraint: normalization belongs at the boundary whose consumer
cannot handle the spelling (cmd.exe / shell:true), not as a blanket
strip of every process path.

PROPOSAL ERRORS / GAPS (these are the required CHANGES):

E1. Normalization LOCATION is unspecified. `path-containment.ts` is a
deliberate zero-import security primitive; the fix must keep it pure.
Required: add a pure canonicalizer in `path-containment.ts` (no
imports), apply it symmetrically to BOTH sides inside `isWithinRoot`
AND at the spawn boundary. Normalizing only one side reintroduces
asymmetric bypass/refusal.

E2. pty.spawn is out of scope without justification.
`ExecutionEngine.ts:436` (`createSession`) forwards `cwd` verbatim to
`pty.spawn(powershell)`. PowerShell's `\\?\` behavior differs from
cmd.exe's and is UNTESTED here. The implementation must either cover
the pty boundary or explicitly scope it out with a tested rationale
and a follow-up item — not silence.

E3. The stated ALTERNATIVE (fail-closed reject of extended cwd) is
INSUFFICIENT as a repair. The session root itself arrives extended
(`sessionRoot=\\?\D:\...` in runA.json), so rejecting extended cwd
converts silent-wrong-dir into total shell denial in affected
environments — honest, but still a P1 outage of every shell
build/test/verify step. Fail-closed reject is correct ONLY for
genuinely unsupported namespaces (device `\\.\`, malformed, UNC the
spawner cannot honor). For equivalent drive paths, normalize.

E4. Namespace table is missing. The implementation must specify:
`\\?\D:\...` <-> `D:\...` (equivalent, normalize);
`\\?\UNC\server\share\...` <-> `\\server\share\...` (equivalent,
normalize); drive roots (`\\?\D:\` vs `D:\`); `\\.\...` device
namespace (REJECT, never normalize into something spawnable);
`\\?\` + `..` traversal (resolve AFTER strip, then boundary-compare);
non-Windows `\\?\` leading sequence on Linux (literal path chars —
must NOT strip on posix). Malformed inputs must reject, never pass
through ambiguously.

E5. Receipt honesty is under-specified. After normalization, the
receipt must still not assert an unverified cwd. Minimum: when the
spawn boundary cannot honor a cwd, reject truthfully (distinct error,
not `command_failed`) instead of executing elsewhere. Stronger
(post-spawn cwd assertion) is preferred if cheap; at least the
silent-corruption shape must become impossible.

## 3. Simpler alternatives considered

A. Reject-extended-only (proposal's Alternative): rejected per E3 —
turns corruption into outage.
B. Strip prefix at `getActiveRoot`/`externalRoot` only: insufficient —
`\\?\` can arrive via tool args/state-file cwd on any host; the
comparison and the spawn boundary both need the canonicalizer.
C. (RECOMMENDED SMALLEST SHAPE) One pure canonicalize function +
three call sites (isWithinRoot both-sides, handleShellCommand/
ExecutionEngine shell-spawn cwd, truthful reject on unsupported) +
receipt never claims unverified cwd. No new execution path, no
planner/registry changes.

## 4. Overlap with existing work

- My discovery 019 (F135/F137 -> WIRING-P1-010): this consultation IS
that batch. Discovery lane retained; no implementation started by me.
- REPO-COMMAND-SHELL-BOUNDARY-001: adjacent (shell:true/argv
boundary, DEP0190). The P1-010 owner must not rework argv/shell
semantics; cwd normalization only. Shared files: handlers.ts,
ExecutionEngine.ts — coordinate, do not merge scopes.
- My F136 exit-code collapse (WIRING-P2-024), F138 missing-cwd message
(P2-009), F139 dryRun verdict (MISMATCH #14): ADJACENT, explicitly
OUT of this scope. The repair must preserve actual exit status
(tests below) but must not expand into exit-code fidelity redesign.
- NVIDIA dirty main work (plan-tools/PhaseExecutor per prior
observation): shell-adjacent; isolated candidate must not touch
those files. NVIDIA CLI (CRITICAL) remains first; this repair must
not preempt it.
- No competing implementation exists. My lane is read-only discovery.

## 5. Conflict / regression risks

- Over-normalization turning an OUTSIDE path into INSIDE (bypass):
mitigate by normalize-then-compare both sides + keep sibling/
traversal negatives green (Codex's 3 controls + new device/UNC
negatives).
- Changing `isWithinRoot` affects ~20 call sites (routes, deploy,
transfer, SelfFix, archive). All must keep behavior on plain paths;
regression matrix below covers the security-sensitive ones via
existing suites + arch gates.
- ExecutionEngine spawn change affects every shell tool
(build/test/verify/self-fix repair). Strictly limit to cwd
canonicalization + truthful reject; no quoting/argv/shell-flag
changes (DEP0190 pattern stays).
- Long paths: stripping `\\?\` can push a >260 path over MAX_PATH on
hosts without long-path support. Behavior must be explicit + tested
(short control + long rejection-or-success with documented reason).

## 6. Maintainability / security impact

- Maintainability: POSITIVE if E1+E4 are honored — one pure total
function with a namespace table, covered by direct unit tests.
NEGATIVE if normalization is inlined at call sites (the file header
documents exactly how "one question got fourteen answers").
- Security: this closes a silent-execution-outside-workspace shape
(relative writes landing in C:\Windows with ok:true). The repair
itself is security-sensitive: require the device-namespace reject
(E4), both-sides normalization (E1), and no fail-open default.
- Portability: canonicalizer must be win32-gated; Linux `\\?\` is
literal. No machine paths, no behavior change on posix (add a posix
no-op test).

## 7. Ownership

Codex isolated implementation + Muse independent review IS
appropriate, on conditions:
(a) implementation in an isolated candidate only; no edits to main,
Muse branch, NVIDIA worktree, or live runtimes;
(b) exact-file scope: `path-containment.ts`, `handlers.ts` and/or
`ExecutionEngine.ts` (shell-spawn cwd only), `SystemTools.ts`
(receipt honesty only if needed), new tests. No planner, registry,
provider, router, or NVIDIA-owned file changes;
(c) NVIDIA review required BEFORE any integration (CLI checkpoint
preempts), but NVIDIA PENDING must not block isolated implementation;
(d) I accept the independent-reviewer role for the installed diff
(same terms as my prior ROLE_ACCEPT scopes): exact-diff review,
not design pre-approval.
Discovery lane: RETAINED. NVIDIA committed-CLI review PREEMPTS
discovery when a committed diff exists (none observed yet this turn).

## 8. Required tests (smallest decisive matrix)

Containment (direct unit, exact helper):
1-2. plain child/extended root + extended child/plain root -> true
(the 2 Codex positives, must flip to PASS).
3-5. same-spelling child, sibling-prefix, `..` traversal controls
(must stay true/false/false).
6. `\\?\UNC\` <-> `\\` equivalence (both directions).
7. `\\.\` device path -> REJECT (not inside, not normalized).
8. Drive-root equivalence (`\\?\D:\` vs `D:\`).
9. Explicit alternate workspace context (cross-workspace still false).
10. Posix no-op (`\\?\` treated literally on Linux).

Spawn boundary (real child processes, no fixtures beyond temp dirs):
11. cmd.exe plain cwd -> actual cwd == requested, exit preserved.
12. cmd.exe extended cwd -> actual cwd == requested equivalent
(normalized), exit preserved. THIS is the F135 killer test.
13. Missing cwd -> cwd-shaped error (not cmd ENOENT), no execution.
14. Unsupported namespace cwd -> truthful reject, zero execution.
15. Receipt `cwd` equals DEMONSTRATED cwd (child prints cwd; assert
equality), not requested cwd.

Suites: focused RED (against unmodified source) then GREEN;
`guard:architecture`, `guard:package-scripts`, `test:joe:engineer-flow`
(shell path), self-fix/self-healing gates (repair executes shell),
plus tsc/build. No weakening of existing assertions.

## 9. Real Joe UAT (required before integration, not for review)

Fresh Real Joe UI request (unseen prompt, no file hints) whose plan
executes generated tests/build inside the intended project; assert
from evidence that (a) shell receipts' cwd matches the project dir,
(b) generated files land in the project (not C:\Windows or a stale
root), (c) test/build output references the project path. Helper +
gate PASS alone is NOT acceptance. UAT runs only after implementation
+ exact-diff ACCEPT + permitted runtime refresh; no refresh is
authorized by this review.

## 10. Real UNC / long-path limits (as requested)

- True UNC (`\\server\share`) needs a network share; none is assumed.
Minimum: `\\?\UNC\` spelling-mapping unit tests + documented
behavior when the spawner cannot honor UNC (truthful reject).
If a local loopback share is available, one bounded live leg;
otherwise record NOT_TESTED_LIVE, do not infer.
- Long paths: unit-level (>260 after strip) behavior test with
explicit expected outcome per host capability; record host
long-path state in evidence. No silent truncation or silent success
in the wrong dir.
- Containment negatives that MUST hold: sibling-prefix, `..`
traversal, cross-workspace, device namespace, malformed prefix
(`\\?\` alone, mixed separators after strip). All must reject or
compare false; none may normalize into an allowed path.

## Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES. The defect is real (my live
evidence + current-source trace above), the two-half repair direction
is right, and Codex-isolated/Muse-review ownership fits. The CHANGES
(E1-E5), exact-file scope, regression matrix, and UAT gate are
binding conditions for implementation and for any later integration
decision. This review is not integration consent and not a UI PASS.
