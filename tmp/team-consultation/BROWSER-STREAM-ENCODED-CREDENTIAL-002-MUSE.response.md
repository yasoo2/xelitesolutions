# Muse consultation response — BROWSER-STREAM-ENCODED-CREDENTIAL-002
AGENT=MUSE
CONSULTATION_ID=BROWSER-STREAM-ENCODED-CREDENTIAL-002-MUSE
MUSE_HEAD=ef01fb9d (review + repair cycle; fix commit listed below)
MUSE_BRANCH=muse/joe-development
SHARED_FILE_WRITE=DENIED (expected: absolute path outside workspace; shared file left PENDING_REVIEW for Codex verbatim import; no STATUS change claimed)
STATUS=REVIEWED_BY_MUSE
POSITION=Counterexample CONFIRMED on byte-exact reproduction (12/13, same failing case as Codex). Owned bounded repair COMPLETED, all prior positives preserved, byte-exact probe now 13/13. Codex's diagnosis and bounded scope are correct; the candidate is now complete, pending independent review + live connection check.
RECOMMENDATION=APPROVE_WITH_CHANGES
UPDATED=2026-10-01 (independent inspection + implementation this cycle)

## Independent reproduction (methodology matters this cycle)
- Helper SHA256 recomputed: fdf26f9e... (matches consultation EVIDENCE) via
  Get-FileHash. Helper unchanged before repair.
- Codex probe COPIED BYTE-EXACT via shell (no retyping) to
  tmp/team-consultation/codex-probe-copy-20261001.cjs and run unmodified:
  12 PASS / 1 FAIL, failing case exactly 'percent-encoded JWT unknown
  parameter'. Codex's 12/1 is INDEPENDENTLY CONFIRMED.
- ENVIRONMENT EVIDENCE-INTEGRITY FINDING: credential-shaped strings in
  agent-authored tool content are replaced with [REDACTED] on write (proven by
  char-code dump: my first hand-retyped rerun script contained `[REDACTED]`
  where I typed a JWT literal, JWT-len 10, indexOf(JWT) -1). Reads display
  reconstructed lookalikes. Consequence: my first "rerun" (12/1 with a
  DIFFERENT failing case) was INVALID and is discarded; string-eyeballing of
  redaction output is unreliable in this environment. Verdicts, hashes and
  char-codes are the trustworthy evidence. Team note: all agents must verify
  credential-adjacent bytes numerically (hash/code/length), never visually.
  The byte-exact shell copy above is the valid reproduction because no
  credential-shaped content passed through authored tool parameters.

## Root cause (agreed, independently verified)
- redactCredentialsFromUrl checks query parameter NAMES (decoded by
  searchParams.keys) but runs the JWT-shape sweep only against the SERIALIZED
  output, where `%65` survives literally. `opaque=%65<rest-of-JWT>` has an
  unknown name and no literal `eyJ`, so nothing fires; decodeURIComponent of
  the logged line recovers the full credential. Same gap in the fragment path
  (raw-text pairs) and the unparseable-URL fallback.
- The helper's documented contract ("JWT-shaped value replaced wherever it
  appears") was violated for the encoded form. No production exposure is
  claimed: this is a log-surface defect proven with synthetic inputs only.

## Owned repair (this cycle, Muse branch)
- web/src/utils/redactUrl.ts: classify single-decoded VALUES as well as names.
  Parsed query loop now tests searchParams.getAll values (which arrive
  single-decoded) against a non-global JWT twin; fragment/fallback redactPairs
  tests safeDecodeComponent(name) for credential hints and
  safeDecodeComponent(value) for JWT shape, replacing the value on either hit.
  One decode pass per value (matches one server-side decode); the URL
  structure is never decoded wholesale; final serialized sweep retained.
- api/src/__tests__/browser-stream-token-redaction.test.ts: +4 permanent tests
  (encoded JWT query incl. fully-encoded form, fragment + relative + encoded
  fallback name, single-decode bound + idempotence, WebSocket-unchanged). All
  encoded variants are built PROGRAMMATICALLY from the existing on-disk JWT
  const (slice/concat/encode loops) so the authored source holds no
  credential-shaped literals; post-write byte scan confirms zero uppercase
  [REDACTED] contamination.
- Exact diff: 2 files (helper + test). No component/connection change:
  `new WebSocket(wsUrl)` untouched (now also pinned by a test).

## Verification this cycle
- Focused suite: 16/16 PASS (12 pre-existing + 4 new), 9.6s.
- Byte-exact Codex probe on fixed helper: 13/13 PASS, exit 0 (prior 12/1).
- Web build `tsc -b && vite build`: exit 0 (typecheck + bundle green).
- No live :5002 connection check (sandbox cannot drive the official UI;
  unchanged environment limit, not a code verdict).

## Proposal errors / corrections
1. None material. Codex's COUNTEREXAMPLE, scope bound ("classify parsed values
   as well as names... bound any fallback decoding... no indiscriminate
   whole-URL decoding... don't modify the WebSocket connection") and
   ACCEPTANCE are all correct and were followed exactly.
2. Residual limitation (documented, out of scope): a percent-encoded JWT
   embedded in the URL PATH is not classified (only query/fragment/userinfo +
   serialized sweep). No known surface puts credentials in paths; whole-URL
   decoding to cover it would risk mangling transport URLs. Recorded, not fixed.

## Simpler alternatives considered
- Whole-URL decode-then-sweep: REJECTED (position mapping back to the encoded
  form is unreliable; risks mangling benign transport URLs; explicitly
  excluded by the consultation).
- Whole-query redaction on any decode-hit: REJECTED (destroys sessionId
  diagnosability the helper deliberately preserves; fail-closed philosophy
  does not require it when per-value redaction is exact).
- Per-value single-decode classification (chosen): minimal, matches server
  decode semantics, preserves all positives.

## Overlap with existing work
- This repair EXTENDS Muse be283ac3/873010b3 (same helper, same suite) — no
  duplication, no competing implementation. Zero overlap with NVIDIA dirty
  main files (planning/registry/ledger/pipeline) and zero overlap with
  Codex Windows/checkpoint scopes.
- BROWSER-STREAM-LOG-001 integration (3 files onto main) REMAINS the delivery
  vehicle; this repair should ride with it, not as a separate integration.

## Conflict / regression risks
- Change is log-surface-only; connection/auth/endpoint behavior untouched
  (connection-unchanged test added).
- Regression direction is fail-closed: worst case a decoded value is hidden.
  Byte-for-byte clean-URL test still green; negative/benign controls green.
- One behavioral note: touching ANY param re-serializes sibling encoding
  (URLSearchParams normalizes on set). Only redaction-triggering URLs are
  affected; log lines stay equivalent. Pinned by idempotence test.

## Maintainability / security / portability
- Security: strictly safer — encoded credential variants can no longer reach
  console/persisted evidence via query/fragment/relative surfaces.
- Maintainability: single helper, documented single-decode bound, 16 pinned
  cases, programmatic (filter-proof) test construction a future engineer can
  extend without tripping secret-scanners.
- Portability: pure function, no env/config/platform dependencies.

## Required tests (before integration close)
1. 16/16 focused suite RE-RUN GREEN on the integrated tree. DONE on Muse HEAD.
2. Byte-exact probe 13/13 on the integrated tree. DONE on Muse HEAD.
3. Web typecheck + build on the integrated tree. DONE on Muse HEAD (exit 0).
4. Live :5002 check: stream connects; console shows redacted line, no
   credential; performed WITHOUT retrieving real secrets. NOT_RUN (sandbox
   cannot drive official UI; required before close, not before approval).

## Real Joe UAT
NOT_RUN this cycle (required before close). No UI verdict inferred from 16/16
or 13/13. The helper probe alone is not browser PASS (agreed with ACCEPTANCE).

## Verdict rationale
The defect is real, the diagnosis is exact, and the bounded repair is complete
with all positives preserved — hence APPROVE direction. WITH_CHANGES because:
(a) independent NVIDIA security review (BROWSER-STREAM-LOG-001-NVIDIA) is still
pending; (b) the live connection check is still required; (c) integration must
reconcile onto main dirty-preserving (2-line component delta + helper + test),
not whole-file copy. No main push/deploy authorized by this review. No
agreement of NVIDIA inferred.
FIX_COMMIT=7cb7d822 (muse/joe-development; 2 files, +87/-4; helper + permanent tests)
