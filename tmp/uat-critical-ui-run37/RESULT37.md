# CRITICAL-REAL-JOE-UI-001 — Run 37 (MUSE, 2026-10-01): BLOCKED (provider outage, 8th consecutive)

RESULT: BLOCKED — all LLM providers failed at the planning phase (runs 29/30/31/32/33/34/35/37;
run36 was feasibility-only, no run sent).
Joe's behavior was CORRECT: bounded (~5.4 min after SEND), honest, terminal, zero
invented plan, zero substitute files. The verification-contract repair class was
NOT exercised (0 phases ran) — no regression signal, no PASS signal.
CRITICAL-REAL-JOE-UI-001 stays PENDING.

## Setup
- Source: D:\Joe\muse-worktree @ 9159c8a9, api dist rebuilt this cycle at HEAD
  (esbuild 5.8mb, 4.8s). Zero api/src+web/src drift 3b70b255..9159c8a9, so the
  running bundle matches HEAD. "Registered 163 tools (71 revived)".
- API: http://127.0.0.1:5101 (PORT=5101, PERSISTENCE_MODE=JSON, run-local
  JWT_SECRET), /api/health 200 {"status":"OK","database":"LOCAL"} before SEND.
  PID 25564. cwd = run37 dir (run-local data/projects). Boot ~6 min (integrity check).
- Browser: isolated Chrome via Playwright (real chrome.exe), fresh run37profile,
  headless, guest login, new chat (no context carryover).
- Prompt: PROMPT37.txt (loggrep ERROR/WARN filter CLI — unseen domain: exact-order
  filtering, --count mode, exit 3 missing-file, exit 2 missing-arg, 12-line sample;
  written last cycle, never used in implementation, tells Joe no filenames).
  Materially different from run35 fcount, run34 dupfind, run33 csvsum,
  run32 wordfreq and run4b taglines.
- Sandbox notes: system temp blocked (EPERM); driver + API ran with TEMP/TMP
  redirected to workspace tmp. PowerShell Invoke-WebRequest unusable here
  (null-reference); all HTTP evidence via curl.exe. Direct Ollama smoke passed
  (SMOKE-OK exact, ~20s), yet Joe's planner still timed out Local (see cause).

## Run
- SEND 2026-10-01T12:21:15Z (button-click). Settled T+324s (early-stop
  terminal-phrase), "Run Finished", 9 steps, 3:21. Zero bad HTTP responses.
- Joe stopped at planning: "Planning stopped honestly — No valid engineering
  plan was produced ... Joe did not create a project or template as a
  substitute."
- Provider cause (api-5101.err, Joe's own IntelligentRouter): LLM7 keyless 429
  "Daily token quota exceeded. Retry after 45517 seconds" (~12.6h); Local
  (Auto) TIMEOUT x2 (brain then PAUSED 10m); DuckAI 429 rate limited;
  Pollinations/DeepSeek TEMPORARILY_UNAVAILABLE (skipped). Final: "CRITICAL:
  All LLM providers failed ... Returning honest error."
- Local-timeout nuance: preflight logged "local_ready_after_warmup" and my
  direct Ollama smoke passed in ~20s, but Joe's planner generation exceeded
  Joe's local timeout twice. Cold CPU latency vs planner timeout budget is the
  operative mismatch, not a dead model.
- Workspace .../data/projects/7b6fe83974e2ceeea3bd7275 on disk: 0 entries —
  the no-substitute claim is true on disk, not just in prose.
- Routing-voice observation (no artifact, no failure): before planning, Joe
  wrote "I did not recognise ... «js command-line tool» ... I am going to
  build a generic structure instead — a presentation page". Fourth consecutive
  preservation of this voice (runs 33/34/35/37); the CLI-recognition gap
  (M03/C06 family) needs a planning-capable run to test, not a
  prompt-specific patch now.
- Independent verification (verify-run37.cjs): entry-exists FAIL (expected —
  nothing built); searches run-local + workspace projects roots, fresh-only
  (180 min). VERIFY37 exit 1 with exactly the honest-stop signature.

## Current general-contract state (source evidence, same HEAD)
- Unchanged from run35: the run4b failure class (planner-emitted
  `shell_execute` smoke run rejected by the phase gate) is currently handled
  by plan-tools.ts sanitizer rewrite (shellSmokeWithoutCheckerContract →
  output-existence observation), NOT by gate execution of the smoke command.
  The underlying capability — execute a legitimate runtime smoke verification
  and use its result — remains unimplemented; changing the gate is a
  verification-domain architecture change needing proposal + consultations +
  ownership, not a unilateral Muse patch.
- No NEW source repair was attempted this cycle: with 0 phases runnable, any
  gate change would be unverifiable end-to-end. Correct next step remains a
  provider-capable UI run, then the coordinated gate decision.

## Evidence files
- PROMPT37.txt, FEASIBILITY37.md, driver-run37.cjs, verify-run37.cjs, run37-out.txt
- r37-01-login.png, r37-02-after-login.png, r37-03-prompt-filled.png,
  r37-04-timeline.log, r37-05-t*.png, r37-06-latest-dom.txt,
  r37-07-final.png, r37-08-final-dom.txt
- api-5101.out / api-5101.err (PID 25564; router CRITICAL lines quoted above)
- smoke-payload.json (direct Ollama SMOKE-OK evidence)
