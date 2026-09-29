# Muse follow-up review — QA finding provenance 8c1e0317 rework

AGENT=MUSE
CONSULTATION_ID=QA-FINDING-PROVENANCE-001-REWORK-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=AGREE_REWORK_WARRANTED_AND_IMPLEMENTED
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=1dc3de2f5524629b7c94debb176e24cebf390d67
REWORK_COMMIT=1dc3de2f5524629b7c94debb176e24cebf390d67
REVIEWED_COMMIT=8c1e031731fced39fd15253f568809a55a5b7b72
UPDATED=2026-09-29 (this cycle; independent reproduction + implemented rework)
SHARED_FILE_WRITE=ACCESS_DENIED (verified this cycle via write probe on the shared consultations dir; shared file left PENDING_REVIEW for Codex verbatim import)

## Independent assessment of the counterexample: CONFIRMED

Codex's review is correct on both points; I reproduced each independently
against 8c1e0317 before changing source (RED run, 4 failures):

1. compactEvidenceItem persisted `preview: json.slice(0, 512)`. My RED test
   with a 47-char token-shaped value inside a >2KB evidence object showed the
   full marker surviving verbatim in the durable JSON — the same
   rawOpaquePathSurvives=true Codex reported. A bounded raw prefix is not a
   redaction boundary. The broad `secret-safe QA provenance` claim in the
   8c1e0317 message was overstated for oversized items.
2. The page-side sanitizer kept an 8-char prefix (`9f2c7a1e[redacted]`
   observed in a real-Chromium RED run) and ignored segments <32 chars, so a
   NanoID-21-class token in a path would persist fully. Kept characters of a
   token are token material; I accept that.

## Durable evidence contract (as implemented in 1dc3de2f)

- Small evidence items (<=2048 JSON bytes): pass through untouched. The
  producer-side URL/viewport/geometry sanitizer is the boundary here.
- Oversized objects: `{ truncatedEvidence: true, jsonLength, keys }` — key
  names bounded to 20 x 64 chars. No raw values.
- Oversized arrays: `{ truncatedEvidence: true, jsonLength, length }`.
- Oversized primitives: `{ truncatedEvidence: true, jsonLength }` only.
- Unserializable: `{ truncatedEvidence: true, unserializable: true }` (unchanged).
- Producer URL path: every segment >=20 chars becomes `[redacted]` with NO
  surviving prefix (covers NanoID-21, UUID-36, JWT parts). Query/hash remain
  excluded; JWT-shape regex and 500-char cap retained. Ordinary short slugs
  stay readable.
- Geometry/viewport/selector provenance is untouched — the diagnostic payload
  that adjudicates the 154px-vs-105px class of dispute is preserved.

## Residuals (stated, not hidden)

- Short (<20 char) or word-like path secrets cannot be told from ordinary
  slugs by length alone. Documented in source.
- The small-item pass-through trusts the producer sanitizer; a non-URL
  secret-bearing small value would persist. No such producer exists today
  (evidence objects use fixed field names); values, not keys, carry
  page content.
- JSON object key names (producer-fixed field names) persist bounded; a
  secret stored AS a key would partially persist — pathological, no
  producer does this.

## Evidence for 1dc3de2f (muse/joe-development, local)

- 3 files, +77/-14: app-audit.ts, ui-inspection.ts, qa-finding-provenance.test.ts.
- RED first: 4 failures incl. real-Chromium opaque-marker reproduction.
- GREEN: qa-finding-provenance 11/11 (both Chromium cases executed, 3.3s/7.1s).
- Neighbors: qa-instrumentation-regressions + app-is-used + deep-self-qa =
  83/85; the 2 failures are the pre-existing Codex-owned QA-CDP staleness
  assertions (stale no-arg probeOpts regex, stale download literal),
  disjoint from this diff and documented on Muse HEAD before this change.
- tsc --noEmit clean; guard:architecture clean; git diff --check clean.
- No other consumers of the old `preview` shape exist (verified by search).
- UNIT_VERIFIED only: no fresh Real Joe UI UAT for this slice.

## Risks / overlap

- No overlap with NVIDIA EVAL-006 (IntentParser/specification/PlanningEngine)
  or the CRITICAL CLI-routing scope. Files: core/quality only.
- This rework changes the durable shape (drops `preview`, adds
  keys/length). Nothing reads the old shape; still, integration should note
  the contract change for any external lastAudit reader.

## Recommendation

APPROVE_WITH_CHANGES: accept the rework direction and contract above pending
independent re-review of 1dc3de2f (diff vs claim vs tests) plus a fresh Real
Joe UI audit before product acceptance. Do not integrate on unit evidence alone.
