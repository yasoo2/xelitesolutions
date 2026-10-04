# Wiring audit evidence — live :5000 registry provenance (Muse, 2026-10-04)
EVIDENCE_ID=REGISTRY-PROVENANCE-001
MUSE_HEAD=814dea35a9cb009d9e73f656e918c075a8c4fe4c
NVIDIA_HEAD=a10c71ab14411e682be7a7e4e5ffd07467d960ac (dirty, read-only)
PROBE_UTC=2026-10-04T11:00-11:35Z

## Question
Which source state does the live :5000 runtime's tool registry correspond to?
(:5000 health OK, database LOCAL, version=no-commit-file, uptime 94391s at 10:58Z
=> started ~2026-10-03T08:45Z. Owner/CWD/exact commit still unverified.)

## Method (read-only + local probes; no server started, no network besides GET)
1. GET http://127.0.0.1:5000/api/tools -> 200, count=167, realCount=167, noopCount=0.
   Saved: tmp/lifecycle-review/live5000-tools.json, live5000-toolnames.txt (sorted).
2. tsx probe importing Muse registry (HEAD 814dea35): 163 tools, 71 revived.
   Saved: tmp/lifecycle-review/muse-source-toolnames.txt.
3. tsx probe importing NVIDIA dirty registry (read-only; TEMP redirected to Muse
   tmp; dummy JWT_SECRET process-only): 167 tools, 71 revived.
   Saved: tmp/lifecycle-review/nvidia-dirty-toolnames.txt.
   NOTE: importing the full app graph attempted to append NVIDIA api/logs and was
   EPERM-denied by the sandbox; NVIDIA tree verified untouched except NVIDIA's own
   live edit (see below). No probe output was written outside Muse tmp.

## Results
- MUSE_SOURCE_REGISTERED=163 (all snake_case, all expose execute(), 0 PascalCase).
- NVIDIA_DIRTY_REGISTERED=167 (all snake_case, all expose execute()).
- LIVE_5000_REGISTERED=167.
- DIFF(live5000, nvidia-dirty) sorted names = EMPTY (167/167 identical).
- DIFF(muse-source, nvidia-dirty) = exactly 4 names, all NVIDIA-only:
  bulk_file_generator, generate_image, specification_verification, visual_qa.
- NVIDIA registry.ts mtime 2026-10-03T03:56Z; the three BATCH011 definitions last
  modified 2026-10-03T07:27-08:05Z — all BEFORE the :5000 start (~08:45Z).
  The dirty registration therefore predates the live runtime. Consistent.

## Conclusions
1. LIVE_5000_REGISTRY == NVIDIA_DIRTY_REGISTRY at the full-name-list level
   (LEVEL 3 reachability evidence for these 167 tools on that runtime).
   Exact process CWD/loaded commit still NOT proven (version=no-commit-file).
2. Muse-source 163 vs NVIDIA-dirty 167 is fully explained by the +4 set above.
   No other name drift between the two trees' registries at probe time.
3. CORRECTION of a reviewer hypothesis: NVIDIA's bare `VisualQATool,` entries in
   registry.ts (lines 288-290) are NOT uninstantiated classes — they resolve to
   definition objects with correct snake_case names and working execute().
   An initial PascalCase-name concern was raised and REFUTED by the probe:
   visual_qa/generate_image/bulk_file_generator all serve correctly with execute().
4. SAFETY FLAG (no action taken; ownership: NVIDIA/Codex/human): the three
   BATCH011 tools under HOLD (generate_image free-first/fail-closed contract,
   bulk_file_generator + visual_qa containment) are LIVE and registered on :5000
   (perms: generate_image=[execute,internet]; bulk_file_generator=[write];
   visual_qa=[read,internet]). The HOLD concerned runtime adoption; :5000 appears
   to already run this build. Do NOT stop :5000 without authorization; reconcile
   at the next checkpoint whether :5000 must be rebuilt from a reviewed state.

## Live NVIDIA activity observed (read-only, preserved)
- NVIDIA cycle95 edited api/src/modules/tools/definitions/PhaseExecutorTool.ts at
  2026-10-04T11:08Z (15+/9-, Gap A/B ledger refinement: prose-observation pass
  records 'incomplete'). Tracked-modified count 19 -> 20 during this Muse cycle.
  This is NVIDIA's owned verification lane; Muse takes no action and claims no
  ownership. It ALSO proves the lifecycle monitor's blind spot: log-quiet workers
  can still be editing source (see F6 addendum in the lifecycle review).

## Audit counters touched by this evidence (scoped, not global)
- REGISTERED_TOOLS(Muse source @814dea35)=163
- REGISTERED_TOOLS(NVIDIA dirty @a10c71ab+20M)=167
- REGISTERED_TOOLS(live :5000)=167, name-identical to NVIDIA dirty
- EXECUTABLE_SHAPED (expose execute()): 163/163 Muse, 167/167 NVIDIA dirty
- FULLY_WIRED/PARTIALLY_WIRED/ORPHANED: UNKNOWN (registry presence only)
- REAL_JOE_PROVEN=0 for this evidence (no UI run; :5002 down, verified)
