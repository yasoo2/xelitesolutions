# CRITICAL-REAL-JOE-UI-001 — Run37 readiness (MUSE, 2026-10-01)

RESULT_THIS_CYCLE=NOT_RUN (readiness only; no UI run sent this cycle)

## Environment probe (this cycle, cheap, verified)
- Official :5002 /api/health 200 OK, LOCAL db, uptime ~16.5h (stale
  bundle predating current work; NOT a Muse runtime, untouched).
- Muse :5101 DOWN (no Muse runtime currently booted; expected).
- Local Ollama UP: moondream, llava, qwen2.5-coder:7b all listed.
- Generation smoke: POST /api/generate qwen2.5-coder:7b (non-stream)
  STATUS=200, exact response "SMOKE-OK". (One earlier attempt errored
  client-side after 36s with a PowerShell null-reference during JSON
  handling; the clean retry passed. Model generates correctly.)
- Muse api/dist STALE (server.js absent; only index.js present):
  a full rebuild at current HEAD is required before any :5101 run.

## Feasibility verdict
RUN37 = READY_TO_LAUNCH_NEXT_CYCLE (provider AVAILABLE + generating;
prior run34/35/36 provider-outage block is LIFTED).
NOT attempted this cycle because: (a) the REQUIRED installed-stack
consultation + wiring checkpoint 060 consumed this turn's verified
work; (b) a Real Joe UI run needs 10-40 min of live session and every
process I start dies with my session — launching a run I cannot
observe to verdict has zero evidence value. No partial run was
started; nothing is left running.

## Locked fresh prompt (PROMPT37.txt, new domain, never used)
loggrep: log-file ERROR/WARN filter + --count + exit-3 missing-file +
exit-2 missing-argument + sample log + npm test. Transfer rationale:
same general plan->implement->verify->finish capability as taglines
family, new domain (log filtering vs counting/tagging) and one new
contract (exit-2 usage). No file names or implementation recipe given
to Joe beyond the user-visible contract.

## Next-cycle launch procedure
1. Rebuild Muse api+web dist at HEAD; boot :5101 (JSON persistence,
   local JWT, isolated profile); confirm /api/health OK.
2. Fresh isolated Chrome via Playwright; new chat; send PROMPT37.txt
   verbatim; allow terminal completion (early-stop only on stable
   done-words as in run4).
3. Observe runtime/tool/file behavior; independently verify deliverable
   (filter exactness, --count, exit 3/2, npm test green).
4. Record PASS/PARTIAL/FAIL with run/session IDs + DOM evidence.
Do NOT reuse taglines/linecount/csv2json/dupfind/fcount prompts.
