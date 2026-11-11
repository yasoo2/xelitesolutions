# Joe's agent engine

Joe's first engine builds a project from a planner, special tools and fixed
templates. When the generated code has a defect, the only remedy in that
chain is to ask the same model the same question again. That is because
nothing in it lets the model look at what it wrote.

This engine works the way Codex, Claude Code and Manus work. One model drives
a short, fixed list of general tools in a loop:

```
read → write → run → look (terminal output, the served page, a screenshot) → fix
```

A run is delivered only when Joe's delivery checks pass.

## Parts

| File | What it does |
|---|---|
| `types.ts` | The contracts every part shares. |
| `loop.ts` | `runEngine`: ask the model, run the tools it called, show it what happened, repeat. |
| `context.ts` | The conversation. Append-only, observations bounded with the full text saved, deterministic compaction. |
| `plan.ts` | `plan_update` and the run's requirement ledger. Seeded from the request; an item the request named can never be dropped. |
| `finish.ts` | `task_finish`: a claim handed to the verifier. A refuted claim goes back to the model. |
| `model.ts` | The local model through the managed Ollama transport, a named provider through the router's strict custom route, or Claude through `anthropic.ts`. `engineBrain` builds the run's model and the reader its checks use. |
| `anthropic.ts` | Claude through the official SDK: native tool use, prompt caching, thinking replayed unchanged, every call behind the budget guard. |
| `budget.ts` | The money guard: published prices, a spend ledger on disk, a total and a per-run budget. |
| `toolcalls.ts` | Reads native tool calls, and calls a small model writes as text. |
| `prompt.ts` | The standing instructions. Byte-stable, so a server can reuse the prefix. |
| `workspace.ts` | Containment: every model-given path is resolved inside the run's project folder. |
| `select.ts` | Which engine builds a run's project. |
| `tools/` | The model-facing tools. Each calls a registered `engine_*` ToolService tool. |
| `verify.ts`, `seed.ts` | The delivery checks and the requirement reading, both through Joe's existing gates. |

## The tools the model sees

The list is fixed for the whole run. A tool appearing or disappearing mid-run
breaks the prompt cache and leaves earlier calls naming a tool that is gone.

| Tool | Does |
|---|---|
| `plan_update` | Steps and progress on the requirement ledger. |
| `file_read`, `file_write`, `file_edit`, `file_list`, `file_search` | Files inside the project folder. Edits are exact-snippet replacements behind a syntax gate. |
| `shell_run` | A command that ends: install, build, test. |
| `shell_start`, `shell_logs`, `shell_stop` | Servers and watchers. `shell_start` returns the address that actually answered. |
| `browser_open`, `browser_act`, `browser_screenshot` | The served page: text, element refs, console errors, failed requests, a screenshot. Only addresses this run served, or that the request named. |
| `task_finish` | Claim the work is done; Joe's checks decide. |

Every action goes through `ToolService.executeTool` (AGENTS.md). Approval,
ownership, cancellation and the boot gate's Single Execution Authority all
apply.

## Rules the engine keeps

- **No step cap.** A run ends on delivery, cancel, the deadline, or a *measured* lack of progress, and it says which. Measured means:
  - the same failing call made four times;
  - eight steps with nothing changed, after two warnings;
  - a model that stops calling tools.
- **Failures stay in the conversation**, so a retry always carries the failure it retries.
- **Every prompt is the previous prompt plus what happened since.** A server can resume from the state it already computed, which matters most for hybrid models whose recurrent state cannot be rewound.
- **Runtime facts are observed, never guessed.** The address a browser opens is the one a server of this run printed, never `localhost:5173` by default.
- **Done is a claim.** `task_finish` runs the same gates the first engine's delivery runs, plus an acceptance check that judges every requested item against the source.

## Turning it on

The engine is off by default. A build goes to it when either is set:

- the run's context carries `engine: 'agent'`;
- the deployment sets `JOE_ENGINE=agent`.

Model selection:

- `JOE_ENGINE_PROVIDER` / `JOE_ENGINE_MODEL` name a provider and model explicitly. The key comes from that provider's usual variable.
- Without them, the engine uses the local model Joe is configured with (`LOCAL_LLM_MODEL` on the managed endpoint).
- `JOE_ENGINE_THINKING=off` turns the model's thinking off.
- `JOE_ENGINE_VISION` forces screenshots on or off. Without it, the local model is asked once whether it takes images.
- `JOE_ENGINE_CONTEXT_TOKENS` overrides the window the engine budgets for.

### Claude (a paid model)

`JOE_ENGINE_PROVIDER=anthropic` with `JOE_ENGINE_MODEL` (`claude-haiku-5-5`, `claude-sonnet-5-5` or `claude-opus-5-5`). The run does not start without all of:

- `JOE_ENGINE_ANTHROPIC_KEY_FILE`: a file outside the repository holding `ANTHROPIC_API_KEY=...` (or `JOE_ENGINE_ANTHROPIC_API_KEY` itself). The connector never reads `ANTHROPIC_API_KEY` from the environment, and the deployment must not set it: the router and other paid paths read that name, and they spend outside this budget. For the same reason the engine does not need `AI_COST_POLICY=allow_paid`, which opens every paid path in Joe.
- `JOE_ENGINE_BUDGET_USD`: dollars for all runs together, kept in `<JOE_DATA_DIR>/engine-spend.json` (or `JOE_ENGINE_LEDGER`). The ledger survives restarts; a ledger that exists but cannot be read stops spending.
- a published price for the model in `budget.ts`.

Optional: `JOE_ENGINE_RUN_BUDGET_USD` (default 3), `JOE_ENGINE_MAX_TOKENS` (default 32000), `JOE_ENGINE_EFFORT` (low … max), `JOE_ENGINE_CACHE_TTL=1h`, `JOE_ENGINE_THINKING=off`.

Before each call the guard holds the call's worst case (the whole prompt at the dearest input rate plus every output token allowed). The call is made only if that fits what is left of both budgets; afterwards the held amount is replaced by what the API billed. A run that cannot afford its next call ends with `ENGINE_BUDGET_EXHAUSTED`, and its `result.json` records `costUsd`. Haiku 5.5's window defaults to 90,000 tokens because a request over 100,000 prompt tokens is billed at five times the price.
