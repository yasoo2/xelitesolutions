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
| `model.ts` | The local model through the managed Ollama transport, or a named provider through the router's strict custom route. |
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
