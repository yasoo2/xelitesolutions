# Muse wiring-audit addendum — browser family on exact f40 (read-only)

AGENT=MUSE
SLICE_ID=CYCLE-BROWSER-WIRING-F40-ADDENDUM-002
STATUS=EVIDENCE_READY
DATE=2026-10-04
SOURCE_REV=f40f6100e8083bfefeef54eb7812c3690b068048 (NVIDIA main, committed bytes via git show/grep; live dirty lane untouched)
MUSE_HEAD=ffdef7f7809832a3a7d796973d11e049883fa2ea
BASE=tmp/wiring-browser-f40/FINDINGS.md @ d1e2f53d (PRESERVED unmodified)
DETAIL=tmp/wiring-browser-f40/ADDENDUM-20261004-002.md
SHARED_WRITE=DENIED (standing: absolute path outside workspace; fallback stands for verbatim import)

## What this is

A same-lane addendum to the committed Muse browser slice (B1-B3), NOT a
competing slice. A re-derivation pass found the committed slice before
publishing and reconciled instead of overwriting: base stays canonical.

## Independently re-verified (all hold)

- R1: B1 visual_qa orphan, B2 rate-limit dead branch (:73-78 def vs :788
  effectiveName call — base caught what this pass missed), B3 stale
  NEEDS_BUILT_URL entries + resolution-chain proof (sanitize → unknown).
- R2: scope reconciled — base 32 = 29 core + 3 adjacent; 29-core recount
  matches exactly. Base totals adopted, no competing counts.

## Genuine deltas (new evidence)

- D1: F5 web_search fork pinned — TOOL_ALIASES → search_api vs dispatch →
  browser_run; sanitized plans and direct calls diverge. NVIDIA decision owed.
- D2: engine action-map quantified — 24 tools via classifyBrowserIntent on
  the live looksBrowser path; engine reach 27/29 core (only action + vision
  picker-only). Refines, not contradicts, base's deterministic framing.
- D3: browser_open/get_state/snapshot = direct-executeTool-only shadow paths;
  7-name → browser_run set re-verified (:529 trio confirmed); comment nit.
- D4: positives pinned — verification fail-fresh, rate buckets, internet
  permission, orchestrator serialization, narrow consent/my-browser paths.

## Standing re-confirm (this cycle, read-only)

- Candidate requested-action.ts 3BCF65EF == pin, zero drift; F1 RED logged
  7:20 PM, no amended bytes/pins/consultation. APPROVE_WITH_CHANGES + F1 stands.
- NVIDIA HEAD f40f6100; 17 tracked dirty preserved; no writes/interruption.
- No UAT attempted (Codex-owned after integration). No UI PASS claimed.

## What was NOT claimed

No runtime execution, no Real Joe UAT, no all-tools count, no integration
authorization, no F1 implementation. Base + addendum await second-agent review.
