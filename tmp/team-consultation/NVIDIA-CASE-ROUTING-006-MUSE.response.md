# MUSE INDEPENDENT REVIEW — NVIDIA-CASE-ROUTING-006

AGENT=MUSE
CONSULTATION_ID=NVIDIA-CASE-ROUTING-006-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=APPROVE_EXACT_DIFF_WITH_INTEGRATION_CONDITIONS
RECOMMENDATION=APPROVE
EXACT_SOURCE=0fc277e12c1a015e5ee1f6275fde890a5fdac451
BASE=635b19f84b8ca6690403c8c64a2faaa2607a0768
CANDIDATE_WORKTREE=D:/Joe/worktrees/codex-nvidia-case-contract-20261002
MUSE_HEAD=a31af2c0
UPDATED=2026-10-02T00:05:00Z
SHARED_FILE_WRITE=DENIED_BY_SANDBOX_POLICY
NOTE=Shared consultation file could not be written from this sandbox
  (absolute path outside workspace). Codex: import this response verbatim
  without inventing position. Shared STATUS remains PENDING_REVIEW until import.

## Exact diff verified

`git diff 635b19f8..0fc277e1 --stat`: 2 files, 79 insertions, 1 deletion.
Candidate tree clean (`## codex/nvidia-case-contract`, no dirty entries).
No other files changed. No worker files touched by this review.

Source hunk (`api/src/core/llm/intelligent-router.ts`, +6/-1):

```ts
const { provider: selectedProvider, ... } = context.modelConfig;
const cfgProvider = String(selectedProvider).toLowerCase() === 'nvidia'
  ? 'nvidia' : selectedProvider;
```

Test file (`api/src/__tests__/nvidia-case-contract.test.ts`, new, 74 lines):
3 circuit-stop cases (nvidia/NVIDIA/Nvidia) + 3 Ultra-option cases.

## Root cause (independently confirmed from source)

Pre-fix, the selected-provider branch had a case contract split:

- Entry gate (line 1597): `String(cfgProvider).toLowerCase() === 'nvidia'`
  (case-insensitive) — `NVIDIA`/`Nvidia` ENTER the strict path.
- Downstream strict checks use exact case `cfgProvider === 'nvidia'`:
  auth stop (1622), local-brain exclusion (1624, `!==`), quota stop
  (1634), circuit stop (1638), Ultra options (1782), failure stops and
  no-fallback messaging (1850/1863/1870/1871/1875).

So a mixed-case selection passed the gate but failed every downstream
strict check and silently substituted the free mesh (llm7) — exactly the
C1 finding from my BACKEND-SYNC-001 635 review. The one-line
normalization at the branch entry closes all of these at once.

Corroborating facts checked in the exact candidate source:

- `canonicalProvider()` lowercases, so `providerCircuitKey` and
  `providerAllowedByCost` were ALREADY case-insensitive — the fix
  comment is accurate and the circuit key in the test matches the
  router's key at line 1604 regardless of input case.
- No other `context.modelConfig.provider` read exists in the router;
  the single destructure at line 1577 feeds every downstream use.
- `VENDOR_BASE` lookup (1736) already lowercases; model IDs untouched.
- `String(undefined)` → `'undefined'` ≠ nvidia, so non-NVIDIA and
  undefined providers pass through byte-identical. Other-provider
  behavior cannot change.
- Only cosmetic downstream effect: telemetry/log labels now record
  canonical `nvidia` instead of the raw mixed-case spelling.

## Independent test evidence (rerun by Muse, not cited)

Command (candidate api dir, own cache+temp under muse-worktree/tmp,
read-only use of the candidate's node_modules junction; no source touched):

`jest src/__tests__/nvidia-case-contract.test.ts
  src/__tests__/provider-continuity.test.ts`
RESULT: Test Suites 2 passed, Tests 27 passed (6 new + 21 retained).

RED direction verified by code-path analysis on the exact base: with
provider=`NVIDIA`, pre-fix line 1638 evaluates false, no throw occurs,
and execution falls through to mesh substitution — the precise behavior
the new test forbids (`rejects.toThrow('provider circuit is cooling
down or probing')` + `llm7Provider.chatComplete not called`). This
matches the recorded RED receipt (1PASS/2FAIL on parent); the candidate
worktree was not mutated to re-demonstrate RED.

Not rerun: full tsc / 10-gate matrix / web build on exact 0fc (change
is a trivially type-safe string normalization; owner receipts
type0/gates10-10/APIbuild0/webbuild0 cited, not independently
reproduced this cycle).

## Proposal errors / simpler alternatives

No material error found. Alternatives considered and rejected:

- Lowercasing at each downstream check: larger diff, same effect, more
  drift risk. Single-point normalization is the minimal correct shape.
- Lowercasing ALL providers at entry: broader behavior change, would
  alter telemetry identity for every provider. Scoped-to-NVIDIA is safer.

## Overlap with existing work

None. No overlap with Muse branches (redactor, verification, wiring
lanes) or with the 56f no-tool helper lane (different file, different
contract). NVIDIA cost/routing consultation remains separately pending
and is not prejudged here.

## Conflict / regression risks

Minimal. 6-line hunk + additive test-only file. No contract, schema,
API, UI, or persistence change. Strict-stop semantics are extended to
mixed-case input, never weakened: selected NVIDIA still stops (never
falls back, never substitutes paid routing) in all three case variants.

## Maintainability / security impact

Positive, small. Removes a case-sensitivity trap future edits could
reintroduce downstream. Security posture unchanged-to-better: the
permitted-selection-must-stop invariant now holds regardless of
provider-name casing; no paid fallback, no key handling change, no
new network path (tests assert fetch/OpenAI-create uncalled on the
cooling path).

## Required tests (status)

- New 6-case contract: PASS (independently rerun).
- Retained 21 provider-continuity cases: PASS (independently rerun).
- Full typecheck / 10 mandatory gates / builds on exact 0fc: OWNER
  RECEIPTS cited, not rerun by Muse this cycle.

## Real Joe UAT

Not run, still REQUIRED before any runtime adoption: reviewed loading
of the exact 0fc API (+ already-reviewed 635 UI bytes) onto official
5002, real NVIDIA activation, then multiple materially different fresh
prompts. No live vendor output is claimed by this review.

## Remaining integration conditions (not code changes)

1. NVIDIA independent review of exact 0fc (cost/routing consultation).
2. Exact-source gates/builds bound to 0fc accepted by audit.
3. Safe runtime adoption with provenance binding (no blind restart).
4. Real 5002 multi-prompt UAT incl. mixed-case NVIDIA selection.
5. No main merge/push until 1–4 complete.

## Verdict

The exact 0fc diff correctly and minimally resolves the genuine C1
mixed-case NVIDIA routing defect I raised. RECOMMENDATION=APPROVE for
the exact diff; integration remains gated on the conditions above. No
authorization to load 5002 or merge main is inferred from this review.
