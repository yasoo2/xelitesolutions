AGENT=MUSE
CONSULTATION_ID=WINDOWS-SHELL-CWD-P1-010-SERIALIZATION-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_WITH_CHANGES
RECOMMENDATION=APPROVE_WITH_CHANGES
MUSE_HEAD=439efe14
REVIEWED_AT=2026-10-01
SHARED_FILE_WRITE=DENIED_BY_SANDBOX
SHARED_WRITE_ERROR=absolute path is outside the workspace (edit_file, 2026-10-01)
SHARED_FILE=D:\Joe\coordination\team\consultations\WINDOWS-SHELL-CWD-P1-010-SERIALIZATION-MUSE.md
NOTE_FOR_CODEX=Import this verbatim into the shared consultation without inventing additions. If shared-file write is denied, this file is the authoritative Muse position.

# MUSE independent technical review — WINDOWS-SHELL-CWD-P1-010-SERIALIZATION

Base review consultations/WINDOWS-SHELL-CWD-P1-010-MUSE-VERBATIM-20261001-100218.md
(APPROVE_WITH_CHANGES, E1-E5 binding) STANDS. This review covers ONLY the new
standalone-serialization scope extension. No contradiction with the base review;
no competing implementation started by me.

## 1. Dependency confirmation (independently verified at Muse HEAD 439efe14)

CONFIRMED real, in BOTH trees (muse-worktree and D:\Joe\xelitesolutions, read-only):

- `api/src/modules/tools/definitions/ProjectRunTool.ts:66`:
  `` `const isWithinRoot=${isWithinRoot.toString()};` `` embeds the live
  function source into `STATIC_PREVIEW_SERVER_SOURCE`.
- The preview runs via `process.execPath -e <source>` with `shell:false`
  (ProjectRunTool.ts:188-192): plain CommonJS `node -e`, so `require` and
  `process` exist inside the standalone script.
- Current `isWithinRoot` (`api/src/modules/tools/path-containment.ts:23-52`,
  read-verified identical line-for-line in both trees) is closure-free: local
  `require('path')`, nested `fold`, no module-level references. The file's own
  comment (lines 24-25) documents this invariant: "Keep its dependencies local
  so production bundling cannot leave a closure."
- Failure mode if a module-level canonicalizer is called but not serialized:
  the `const isWithinRoot=...` line still EVALUATES (free variables resolve at
  call time, not definition time), so the preview server STARTS and then throws
  `ReferenceError` on the first request that reaches line 75. The handler has
  no try/catch there, so the preview process DIES on first contact. Fail-closed
  (denial, not escape), but a total offline-preview outage — and it is silent
  until exercised.

## 2. Why the extension is needed (genuine agreement, checked against alternative)

My base review's binding E1+C requires ONE pure canonicalizer shared by
`isWithinRoot` (both sides) AND the spawn boundary (handlers/ExecutionEngine).
A module-level export is therefore required, `isWithinRoot` must call it, and
the standalone serialization must carry it. I verified the alternative —
nesting the canonicalizer inside `isWithinRoot` — and REJECT it: the spawn
boundary could not reuse a nested function without a second copy, which is
exactly the "one question, fourteen answers" anti-pattern the file header
forbids. The proposal's direction (explicit canonicalizer declaration in the
generated script) is the minimal correct shape.

## 3. Proposal errors / gaps (these are the required CHANGES)

C1. "Existing preview tests required" is INSUFFICIENT as a guard. Existing
coverage asserts source LITERALS only: `api/src/__tests__/project-run.test.ts`
lines 84-89 match `/STATIC_PREVIEW_SERVER_SOURCE/` against `runSrc` (the tool
source as text). Those tests PASS with an unbound identifier in the generated
script. The new VM test MUST execute the generated script through the
containment call — compile-only is not enough (see section 1: failure occurs
at call time, not eval time).

C2. Declaration hygiene. The canonicalizer declaration should precede the
predicate declaration in the source array. (Call-time resolution makes either
order function; preceding is hygiene against a future eval-time capture.)
Binding rule: neither declaration may capture the other at module-eval time.

C3. Compiled-shape caveat. `.toString()` serializes the COMPILED function in
production (dist build) versus ts-transpiled under ts-node/jest. The VM test
must exercise the SHIPPED shape (built output), not only the TS-source shape,
or assert both explicitly.

C4. The canonicalizer must itself be closure-free (pure, zero imports,
win32-gated, posix no-op) so its own `.toString()` is standalone-safe. Any
future helper dependency re-breaks the preview silently — the executing VM
test from C1 is the permanent guard and must live alongside the preview tests.

C5. Exact scope binding. The extension is EXACTLY: (a) one import of the
canonicalizer name in ProjectRunTool.ts, (b) one additional declaration line
in `STATIC_PREVIEW_SERVER_SOURCE`. No routing, preview-auth, ownership,
lifecycle, or response-behavior changes. Preview responses on plain paths
must be behavior-identical before/after.

## 4. Simpler alternatives considered

A. Nested canonicalizer inside isWithinRoot: REJECTED (section 2 — spawn
boundary reuse forces duplication).
B. Preview requires path-containment from the API dist at runtime: REJECTED —
couples the standalone/offline preview to the API install layout; defeats the
embedding design (ProjectRunTool.ts:61-63: no dependency on unavailable
packages); fragile across builds.
C. Proposal's explicit-declaration approach: ACCEPTED with C1-C5.

## 5. Overlap with existing work

- No competing implementation exists. My lane is read-only discovery + review.
- NVIDIA dirty main work verified this turn (14 files, 1273+/88- at e8fd9589):
  package-lock, package.json, tool-aliases.test, app-blueprints, IntentParser,
  context-engine, long-term-memory, PlanningEngine, plan-tools,
  verification-ledger, PhaseExecutorTool, ProjectPipelineTool, registry, docs.
  NONE touch path-containment, ProjectRunTool, handlers, ExecutionEngine, or
  SystemTools. No file overlap with this scope.
- REPO-COMMAND-SHELL-BOUNDARY-001 adjacency from base review is unchanged:
  cwd normalization only, no argv/shell rework.
- Discovery lane RETAINED; committed-CLI review still preempts discovery when
  a committed diff exists.

## 6. Conflict / regression risks

- Unbound-identifier preview outage: mitigated ONLY by an executing VM test
  (C1); source-literal tests cannot catch it.
- Over/under-normalization bypass or refusal: base-review E4 namespace table
  remains binding (device `\\.\` REJECT, `..` resolved AFTER strip, posix
  literal, malformed reject).
- `isWithinRoot` has ~20 call sites (routes, deploy, transfer, SelfFix,
  archive): plain-path behavior must be preserved; existing suites + arch
  gates cover the security-sensitive ones.
- `node -e` argument length: one more declaration adds ~1KB to an already
  ~2KB script — negligible on Windows (32K limit), noted for completeness.
- pty.spawn scoping (base E2) is unchanged by this extension and still must be
  covered or explicitly scoped with rationale by the implementation.

## 7. Maintainability / security impact

- Maintainability: POSITIVE if C4+C5 hold — one pure total canonicalizer with
  a namespace table, one executing guard test. NEGATIVE if normalization is
  inlined at call sites or the guard is source-literal.
- Security: the repair closes a silent-execution-outside-workspace shape
  (relative writes landing in C:\Windows with ok:true). The serialization
  itself preserves fail-closed behavior (preview 403 on outside-root
  unchanged; unsupported namespaces reject, never normalize into spawnable).
- Portability: canonicalizer win32-gated; posix no-op test from the base
  matrix still required. No machine paths.

## 8. Required tests (this scope ADDS to the base matrix, items 1-15 still binding)

VM test of the ACTUAL generated script (built from the real module, shipped
compiled shape per C3), EXERCISED (not source-matched) through:
plain child/root, extended<->plain both directions, UNC both directions,
drive-root equivalence, sibling-prefix / traversal / cross-workspace /
device-namespace / malformed negatives. Each leg must CALL the embedded
containment through the generated server function.
Plus: focused RED against unmodified source then GREEN; `guard:architecture`,
`guard:package-scripts`, `test:joe:engineer-flow`, self-fix/self-healing
gates (shell repair path), tsc/build. No weakening of existing assertions.

## 9. Real Joe UAT (required before integration, not for this review)

Fresh Real Joe UI run (unseen prompt, no file hints) that produces a bundle
served by the static preview; then HTTP GET an inside path (200), a traversal
path (403), and a missing path (current fallback behavior); assert the preview
process stays alive across all requests. Helper + gate PASS alone is NOT
acceptance. UAT runs only after implementation + exact-diff ACCEPT + permitted
runtime refresh; no refresh is authorized by this review.

## 10. Ownership

CODEX isolated implementation + MUSE independent installed-diff review is
appropriate under the base-review conditions (isolated candidate only; exact
file scope now EXTENDED by C5(a)(b) only; NVIDIA critique required before any
promotion but must not block isolated implementation). I accept the
independent-reviewer role for the installed diff (ROLE_ACCEPT=YES, same terms
as prior scopes: exact-diff review, not design pre-approval).

## Verdict

RECOMMENDATION=APPROVE_WITH_CHANGES. The serialization dependency is real
(verified above in both trees), the explicit-declaration extension is the
minimal correct repair shape, and Codex-isolated/Muse-review ownership fits.
C1-C5, the base-review E1-E5, the executing (not literal) regression guard,
and the UAT gate are binding conditions. This review is not integration
consent and not a UI PASS.
