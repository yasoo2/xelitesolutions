# Arabic authority rework review — independent receipts (Muse, 2026-10-04)

Candidate: D:\Joe\worktrees\codex-readonly-browser-20261004 (detached f40 + dirty copies + arabic delta)
Method: read-only inspection + SHA verify + independent jest reruns with CWD/cache/TEMP
redirected to this scratch dir. No candidate/NVIDIA/main writes, no runtime control.

## SHA pins (candidate-arabic-source.json) — 8/8 MATCH

- api/src/core/intelligence/requested-action.ts = 3BCF65EFA05FDA8D22BF8B166EEBAA123775200E76C6AC6A2A3FFB80B390F9C1
- api/src/core/intelligence/bounded-read-navigation.ts = F59A5154615F88354466368A2D22D0A03322D7AA677B60924AFE3BEFB5854B86
- api/src/core/intelligence/IntentParser.ts = 1D5CB279137A1D89F6D8EF6F4A2C7EDBF3F39A3E05D2527C7DE59E2D8A9DA56A
- api/src/core/orchestrator/PlanningEngine.ts = A170175E4315E0BE4B53BBD0D9DEE6542C2BE75C2CA4B92D0D6728F6D1C5B0FB
- api/src/__tests__/bounded-read-navigation.test.ts = FEC5CD52822A4D88BF7B5655DC58C2383BD535C61CDD8A41EE89F919EFBF34A0
- api/src/__tests__/codex-readonly-browser-live-regression.test.ts = 9BCB4F9C5D987ECEBD62373C78960B15062B4286BF04491A59E4E35EE49453E3
- api/src/__tests__/arabic-authority-constraints.test.ts = F7B333D15CCD5A169FFA883E4893B35DC6C830B80AF234AE6EE04B0B2B5629F2
- api/src/__tests__/requested-action-authority.test.ts = 650C11CCCF6DEE0A8F71FA4AC2FCE78D02F25E59A94BF1758DF9AF763DC9C0DA

## Provenance chain

- manifest baseline == before-arabic copy == baseline copy == LIVE NVIDIA
  requested-action.ts = 91C75403199BC894824CA0EE0CB7DAD59B8A347C095CC0255EE0BE4985BC71AF
- LIVE NVIDIA requested-action-authority.test.ts = 650C11CC... (test unweakened)
- NVIDIA HEAD (read-only): f40f6100e8083bfefeef54eb7812c3690b068048
- Owned source mtimes 15:18:09Z < first v2 gate 15:19:29Z < pins 15:20:55Z
- Patch fidelity: recomputed before->live body == owned patch body,
  DDD05123E8EB63F24D2137859064775FDE7D36595A1BED838A003B0A73DB7309, 49/49 lines
- Type logs byte-identical: B5633A76AA03D47DADCD1FD0D32AE0F910CC83F2AD8E6E969FDCB1B8A0F9C035

## Independent rerun (muse-rerun-arabic69.log)

Test Suites: 1 failed, 3 passed, 4 total
Tests: 1 failed, 68 passed, 69 total
Single failure: 'Recording verb with container and fields' (inherited indicator gap).

## Probes (muse-probe-arabic.log + inline wasf output)

11 observation cases + 3 char-code-verified wasf cases. Key outcomes:
- EN negative-constraints build: affirmative (preserved)
- EN no-file-after-build: deny (new intended behavior)
- AR اشرح فقط / الرد فقط / الرد بدون تنفيذ + build: deny
- AR bare وصف فقط + build: AFFIRMATIVE (F1: detected denial overridden)
- AR diacritized بدون تَنْفِيذ + build: affirmative (R1 pre-existing blind spot)
- Quoted EN/AR denials: non-binding (boundary excludes quote char)
- Empty input: clean no-action. Record case: 'no requested action detected'.

## Files in this dir

- probe-arabic.test.ts / jest.probe-arabic.config.js — 11-case observation probe
- probe-wasf.test.ts / jest.probe-wasf.config.js — wasf verification micro-probe
- muse-rerun-arabic69.log — independent 69-case rerun (UTF-16, Tee-Object)
- muse-probe-arabic.log — probe run (UTF-16, Tee-Object)
- muse-before-live.diff (UTF-16, PS5-mojibake — SUPERSEDED, kept for method record)
- muse-before-live-utf8.diff — canonical recomputed diff (git --output bytes)
- RECEIPTS.md — this file
