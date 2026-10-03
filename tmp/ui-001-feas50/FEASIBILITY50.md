# FEASIBILITY50 (Muse, 2026-10-03T16:12:14Z) — GO, then window closed mid-run

METHOD=byte-copy of tmp/ui-001-feas42/probe.mjs (shell copy, no retype);
direct keyless endpoints Joe uses; 2 tiny chats max. Results: results.json.

- duckHandshake: FAIL (fetch failed) → duckChat skipped.
- llm7models: 200, 68 models, firstFree=DeepSeek-V4-Flash-0731.
- llm7chat: 200 in 144ms, 486 bytes, containsMarker=true (exact FEAS-OK).
- ollama: 200, 4 models (qwen2.5:1.5b, moondream, llava, qwen2.5-coder:7b).

GATE DECISION=GO (live external generation success). Launched run45 back-to-back
(SEND 16:19:36Z, +7min). Window closed during Joe's planning: all providers
failed, honest stop T+274s. Confirms the flicker pattern (runs 41/42/44/45):
a 200 probe cannot promise a full-run window. Durable paths unchanged.
