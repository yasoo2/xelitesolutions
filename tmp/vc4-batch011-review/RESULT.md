# vc4 BATCH-011 wiring verification — RESULT (Muse cycle 181)

## Question
Did NVIDIA cycle-81's live BATCH-011 edits (registry + catalogue + MEANS) actually wire
visual_qa / generate_image / bulk_file_generator end-to-end (registered under tool names,
catalogued, resolvable)?

## Method
- Base: `git archive 02a37c9b api` (NVIDIA repo, read-only).
- Overlay: FULL dirty api/src snapshot (12 tracked-dirty + 16 untracked .ts, see manifest.json
  for per-file sha256) copied read-only for measurement only (vc3 precedent). Nothing written back.
- node_modules junctioned from Muse api/node_modules (disclosed).
- Probe: tmp/probe-batch011/vc4-tree/api/src/__tests__/vc4-batch011-registry.test.ts (8 asserts,
  Muse-authored, overlay-only). Ran with cache/TMP redirected to Muse workspace.
- Live pins at probe time: registry.ts 185D5844.., plan-tools.ts EED5FA00... — both re-verified
  UNCHANGED after the run, so the verdict binds to current NVIDIA dirty bytes for these files.

## Result
- Run 1: 7/8 (my expectation wrong on one `how` label: 'generate image' resolves via the NORMALISED
  branch, which fires before MEANS by documented order; target was correct).
- Run 2 (corrected expectation, openly): 8/8 PASS, JEST_EXIT=0, 18.0s.
- Registry log line: "Registered 167 tools (71 revived)" = 163 (e8) + 1 SpecTool + 3 F2 tools.
- Catalogue: 43 entries (40 + 3), 0 dupes (static count, catalogue-count.py).
- NVIDIA cycle-81 independently reports "registry now 167 tools (+3)" — cross-confirmed.

## Verdict
BATCH-011 wiring direction VERIFIED on overlay bytes (see BATCH011-STATUS-001-MUSE.response.md
for conditions: dirty-only, per-tool contract review owed, audit counts need touch-up at commit).

## Files
- vc4-result.json: jest JSON receipt (run 2).
- manifest.json: overlay provenance (base SHA + 28 file hashes).
- (vc4-run2.log, builder + census scripts: tmp/probe-batch011/, preserved untracked in workspace)
