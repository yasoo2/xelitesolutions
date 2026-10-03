# Muse audit evidence — MEANS-map full enumeration (cycle 234, 2026-10-03)

AGENT=MUSE
CONSULTATION_ID=C234-MEANS-MAP-001-MUSE
SECONDARY_ID=CRITICAL-JOE-DEEP-CAPABILITY-WIRING-AUDIT
MUSE_HEAD=9df7dd8e9185245e69e7b24ab2a509a4e2a702a5 (tracked clean before work; zero Joe source delta)
MUSE_BRANCH=muse/joe-development
SHARED_FILE_WRITE=NOT_ATTEMPTED (established sandbox denial pattern; collector archives this fallback; no STATUS change claimed)
POSITION=SEE_BELOW (100/100 keys enumerated at runtime; 0 dangling; 5/123 gap tools MEANS-visible; 2 benign shadows; 2 new first-match-wins misroutes needing owner disposition; no repair per audit-first)
RECOMMENDATION=ACCEPT_EVIDENCE_AND_ASSIGN_OWNER (F-C234-1/F-C234-2 to NVIDIA plan-tools scope or Codex-coordinated batch after NVIDIA lands; Muse stays reviewer)
NO_AGREEMENT_IMPLIED=YES

## Evidence

- Probe: tmp/c234-means/means-probe.mts (committed, read-only, executes no tools)
- Result: tmp/c234-means/probe-result.json (100 keys x direct + contains)
- Findings: tmp/c234-means/FINDINGS.md
- Runtime: tsx, synthetic process-local JWT_SECRET + MOCK_DB=true, TEMP redirected.
  Registry at import: 163 tools (71 revived); 21 permission-defaulted + 2
  rate-limit-defaulted (names preserved in FINDINGS.md appendix).

## Counts

MEANS_KEYS=100 DISTINCT_TARGETS=27 DANGLING=0
DIRECT_HIT=98/100 (how=meaning) CONTAINS_HIT=98/100
GAP_VISIBLE_VIA_MEANS=5: docker_manager, kubernetes_ops, terraform_manager,
github_actions, ci_generate_pipeline (all verified in c233 123-gap list).
118/123 gap tools have NO means route.

## New findings (not repaired; audit-first)

- F-C234-1: "my react native setup" -> react_project (web) instead of
  mobile_builder. Cause: contains-branch first-match-wins, 'react' (:149)
  precedes 'react native' (:155) in Object.entries order (:249-253).
- F-C234-2: "my github actions setup" -> github_repo_manager instead of
  github_actions. Cause: 'github' (:128) precedes 'github actions' (:159).
- M-1 (benign): bash -> terminal_manager via alias (ToolService.ts:245),
  shadowing MEANS bash->shell_execute (:134). Contains path still reaches
  shell_execute.
- M-2 (benign): "github actions" direct resolves via normalised, same target.

## Overlap / ownership

- plan-tools.ts is in NVIDIA's active dirty scope. No Muse repair proposed.
  Suggested: NVIDIA implementation owner when its plan-tools work lands;
  Muse independent reviewer. No JOE-* shared file touched (hold respected).

## Related verification this cycle (same HEAD, exact bytes)

- prose-verification-final-gate + verification-command-contract: 41/41 PASS (46s).
- Zero source drift 7cdf0f98..HEAD (api/ + web/): c230 verification stands.
- NVIDIA bytes: ledger/visual/bulk hashes match B2 provenance (no drift);
  image file post-a10 edits already covered by later review; permanent repo
  containment pins still absent (0 generate_image/bulk/visual_qa refs in
  NVIDIA __tests__; names identical to Muse tree).
- Runtime: :5002 connection refused (official UI DOWN); :5000 OK/LOCAL/API-only.
  Real Joe UI retest remains BLOCKED; no substitute claimed.
