# Muse consultation — QA-FINDING-PROVENANCE-001 (own candidate 49e9aa3e)

AGENT=MUSE
CONSULTATION_ID=QA-FINDING-PROVENANCE-001-MUSE
STATUS=REVIEWED_BY_MUSE
POSITION=SUPPORT_WITH_PRE_INTEGRATION_HARDENING
RECOMMENDATION=APPROVE_WITH_CHANGES
HEAD=49e9aa3ec3deb08d82f7781b98b2419832d4930a
UPDATED=2026-09-29T06:40:00Z

## Intended scope

49e9aa3e is an observability repair, not a QA-verdict change. It fixes durable
evidence loss: lastAudit previously persisted {severity, message} with the
message read from fields findings don't have (empty prose), dropping finding
id and all measured evidence. The candidate (5 files, +223/-4):

- ui-inspection.ts: the mobile_header_fragmented finding carries url
  (origin+pathname only), requestedVw/actualVw, headerBox, and <=10 child
  boxes (tag truncated to 16 chars).
- app-audit.ts: shared compactQaFindings (<=12 findings; id<=120 chars;
  message from detailEn/detail/message/what <=200 chars; evidence<=4 items).
- ReactProjectTool.ts + ProjectRepairTool.ts: both lastAudit writers use the
  shared mapping (replacing two inconsistent ad-hoc maps).
- qa-finding-provenance.test.ts: 6 tests incl. a real-Chromium geometry case.

No threshold changed; the 144px gate and finding triggers are untouched. No
readers added: the diff changes 2 writers + 1 producer + 1 shared function;
lastAudit readers (plan-tools freshness check, BrowserSmartTools 10-min
reuse) are unchanged.

## Test evidence (re-run this cycle on HEAD 49e9aa3e)

qa-finding-provenance 6/6 PASS (12.2s); the Chromium geometry case executed
(3.86s, no skip warning) and asserted measured header, viewports, URL without
query/hash, child boxes, and durable mapping. I agree with Codex's review
(FOCUSED_PASS_WITH_LIMITS): focused green only, no Real Joe UAT, no
integration ACCEPT from tests alone.

## Consultation questions — my actual answers

1. URL path sensitivity: AGREE it is a residual gap. origin+pathname strips
   query/hash (a token in either cannot reach durable evidence), but a secret
   embedded in a PATH segment (/reset/<token>, /invite/<secret>) would persist.
   Current use is Joe-QA'd locally generated preview URLs, so practical risk
   is low; but the helper is generic. Pre-integration hardening: redact long
   opaque path segments (e.g. >24-char single segments) or restrict to known
   preview path shapes. I will implement one of these in a follow-up commit
   before any integration decision.

2. Nested evidence bounds: AGREE with Codex. compactQaFindings caps finding
   count (12), evidence items (4), id (120) and message (200), but NOT each
   nested evidence object's size. The current fragmentedHeader payload is
   small and structurally bounded (~1KB: url + 2 boxes + <=10 child boxes), so
   there is no live blowup; still, the generic `evidence?: any[]` path should
   get a per-item JSON-length cap with a truncation marker. Same follow-up.

3. Tenant isolation: the store is the process-global in-memory project
   registry ((global).joeProjects[key].lastAudit), read only by same-process
   tools (freshness/reuse). This commit changes VALUE shape, not readership:
   no new cross-tenant channel is introduced. Multi-user/multi-instance
   persistence of the whole registry is a known broader architecture item and
   out of scope for this slice; the path-segment hardening in (1) is the part
   that matters before production use.

4. 154px/105px adjudication: YES for future recurrences, NO retroactively.
   A fresh run that trips the finding will now record the exact URL, requested
   vs actual viewport, header box and child boxes needed to compare states —
   that closes the evidence gap that made run-22 undecidable. It cannot prove
   which PAST number was right (preview :5101 is gone). Note the finding only
   persists when the threshold trips, so adjudication requires reproducing the
   failing state, not the passing replay.

## Risks / overlap

- Same quality-evidence area as the CDP-contract test unit; no file conflict
  (test-only vs producer/writer source). No overlap with NVIDIA ACTIVE work.
- Keep the 144px gate intact; do not tune the threshold from the missing-data
  discrepancy.

## Recommendation

APPROVE_WITH_CHANGES: accept the provenance direction and the writer
consolidation; require the two bounded hardening items (opaque path-segment
redaction + per-item evidence size cap, each with a focused test), current
AGENTS gates green, and one fresh Real Joe UI audit exercising a finding
before integration ACCEPT. CLI CRITICAL stays first; this ships after it.
