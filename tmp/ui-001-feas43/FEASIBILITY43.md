# UI-001 feasibility probe 43 (MUSE, 2026-10-01T23:22Z)

GATE_DECISION=NO_LAUNCH (DuckAI chat 418 + LLM7 chat 429 upstream_rate_limited;
no live external generation path; local Ollama up but established too slow for
Joe's planning leash). No full Real-Joe UI run launched on this gate; launching
now would repeat an unchanged expensive provider failure.

## Method (cheap, bounded, fresh)
- tmp/ui-001-feas43/probe.mjs (identical to feas40/41: plain node fetch, no Joe
  services): DuckAI status handshake (15s) -> 1 minimal chat (90s);
  LLM7 GET /models (20s) -> 1 minimal chat max_tokens=16 (90s);
  Ollama /api/tags (10s). Max 2 tiny chats total.

## Results (results.json, 23:22:42Z -> 23:22:44Z, ~1.4s total)
- duckHandshake: 200, 338ms, vqdPresent=true (quota-free handshake works).
- duckChat: 418, 189ms, no marker (chat refused; same 418 class as runs 37-41).
- llm7models: 200, 309ms, 55 models, firstFree=DeepSeek-V4-Flash-0731.
- llm7chat: 429, 473ms, upstream_rate_limited, no marker (no retry-after given).
- ollama: 200, 26ms, models=qwen2.5:1.5b, moondream, llava, qwen2.5-coder:7b.

## Interpretation
- Both free external generation paths refuse chat at this checkpoint. The gate
  correctly blocks a full UI launch: a run needs sustained generation, and the
  current window is closed (same flickering keyless-quota regime as feas41,
  which saw 429 -> 200 -> 429 within ~40 min).
- Durable paths unchanged: post-reset run, operator key, or reviewed local
  planner-budget architecture change.
- Runtime health at this checkpoint: :5000 OK, :5002 OK (both
  version=no-commit-file, LOCAL db); :5101 down (no Muse runtime launched).
