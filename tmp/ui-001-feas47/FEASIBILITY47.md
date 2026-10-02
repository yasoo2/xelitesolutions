# UI-001 feasibility probe 47 (MUSE, 2026-10-02T00:10-00:18Z)

GATE_DECISION=LAUNCH (LLM7 chat 200 + marker 4/4 incl. live-generation nonce
proof; strongest gate yet). Run42 launched back-to-back (SEND ~2 min after
gate); the window closed again mid-planning (LLM7 429 by ~00:20Z).
See ../uat-critical-ui-run42/RESULT42.md.

## Method (cheap, bounded, fresh)
- tmp/ui-001-feas47/probe.mjs (same as feas40-46: plain node fetch, no Joe
  services): DuckAI status handshake (15s) -> optional 1 minimal chat (90s);
  LLM7 GET /models (20s) -> optional 1 minimal chat max_tokens=16 (90s);
  Ollama /api/tags (10s).
- nonce.mjs (new this batch): one LLM7 chat with a fresh random code to
  discriminate live generation from cached echo.

## Results
- run1 (results-run1.json, 00:10:48Z): duckHandshake 200+vqd, duckChat 418,
  llm7models 200/55/firstFree=DeepSeek-V4-Flash-0731, llm7chat 200 + FEAS-OK
  (22.6s), ollama 200/4 models.
- run2 (results-run2.json, 00:11:37Z): same shape; llm7chat 200 + FEAS-OK in
  173ms with byte-identical body -> cache suspicion -> nonce discriminator.
- nonce (llm7-nonce-check.json): fresh code echoed, 200, CONTAINS_NONCE=true
  -> LIVE generation proven (3/3).
- gate (results-gate.json, ~00:18Z, just before SEND): llm7chat 200 + marker
  in 550ms (4/4). PowerShell TLS attempt at the same endpoint failed with a
  connection error (client-stack artifact, not endpoint state).

## Interpretation (with hindsight from run42)
- The gate was CORRECT to launch; the flicker is minute-tight and
  bidirectional: 200 (00:18Z) -> 429 (00:20Z, retry 2412s -> same ~01:00Z
  reset as run41's math).
- Quota rides the margin: future gates should use ONE minimal chat
  immediately before SEND. Next launch only post-~01:00Z with a single-chat
  back-to-back gate, a working key, or a reviewed local planner path.
