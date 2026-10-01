# UI-001 feasibility probe 40 (MUSE, 2026-10-01T15:01Z)

GATE_DECISION=LAUNCH (direct LLM7 chat 200 + FEAS-OK at 15:01:12Z; first live
external-provider success this week). Run40 launched on that gate; the window
closed mid-run (LLM7 429 by ~15:08Z). See ../uat-critical-ui-run40/RESULT40.md.

## Method (cheap, bounded, fresh)
- tmp/ui-001-feas40/probe.mjs (plain node fetch, no Joe services): DuckAI
  status handshake (15s) -> optional 1 minimal chat (90s); LLM7 GET /models
  (20s) -> optional 1 minimal chat max_tokens=16 (90s); Ollama /api/tags (10s).
- Max 2 tiny chats total, same anonymous/keyless endpoints Joe uses.
- No Ollama generation smoke: SMOKE-OK already proven twice (FEAS38, run39
  warm); local planning-scale generation is established as too slow for the
  leash, so another smoke cannot change the decision.

## Results (results.json, 15:01:05Z -> 15:01:12Z, 7s total)
- duckHandshake: 200, 919ms, vqdPresent=true (quota-free handshake works).
- duckChat: 418, 319ms, no marker (chat refused; same 418 as run37/run39).
- llm7models: 200, 431ms, 67 models, firstFree=DeepSeek-V4-Flash-0731.
- llm7chat: 200, 4816ms, contains FEAS-OK. FIRST direct external-provider
  generation success observed by Muse this week.
- ollama: 200, 350ms, models=qwen2.5:1.5b, moondream, llava, qwen2.5-coder:7b.

## Interpretation (with hindsight from run40)
- The gate was CORRECT to launch: a real 200 generation 6 min before SEND is
  the strongest pre-launch signal available, far stronger than SMOKE-OK.
- The window was minutes wide: LLM7 flipped 200 -> 429 "~35572s retry" between
  15:01Z and ~15:08Z. Keyless quota is exhausted to the margin and flickers.
- Lesson: probe-then-launch must be back-to-back (it was: SEND 15:07:00Z, ~6
  min after probe), and even then a mid-run close is possible. The durable
  paths remain: post-reset run (~01:00Z Oct 2), operator key, or a reviewed
  local planner-budget architecture change.
- New cheap checks established for future cycles: DuckAI v1/status handshake
  (quota-free liveness) and LLM7 /models + one minimal chat (flicker detector).
  Previous "no cheap check" note for DuckAI chat is PARTIALLY superseded:
  handshake liveness is cheap; chat success still needs a real (tiny) call.
