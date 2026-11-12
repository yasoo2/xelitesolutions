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

## The user's code never sees Joe's secrets

Joe's own process holds `JWT_SECRET`, the Mongo address, the model providers' keys, `ADMIN_EMAIL`/`ADMIN_PASSWORD` and `SECRETS_MASTER_KEY`. Code the model wrote (a preview, the app's tests, an install, a build, an imported repository) must not inherit them, so the rule is the kernel's default and not a habit of each caller:

- **Every spawn route** of `kernel/ExecutionEngine.ts` builds the child's environment with `isolatedExecutionEnv` → `projectEnvironment` (`shared/child-environment.ts`): Joe's environment **without** every secret (by name: `KEY`, `TOKEN`, `SECRET`, `PASSWORD`, `AUTH`, `MONGO`, `DATABASE`…, `ADMIN_EMAIL|USER|USERNAME|NAME`, `SMTP_*`, `STRIPE_*`, `SENTRY_DSN`, a data store's `*_URL|URI|DSN`; by value: an address with a password, a token-shaped value) and **without** the settings of Joe's own process (`PORT`, `NODE_ENV`, `JOE_*`, npm's description of how Joe was started), then the caller's own values.
- **An inherited copy is still removed.** A caller that spreads the whole of `process.env` hands every secret back as an "override"; a secret whose value is exactly Joe's own is removed again. A value the caller chose (a generated API's own `API_JWT_SECRET`, the app's `PORT`) is kept.
- **The machine's settings stay** (`MACHINE_ENV`): `PATH`, `PATHEXT`, `SystemRoot`, `TEMP`, the user profile, `ProgramFiles*`, `NODE_OPTIONS`, `NODE_EXTRA_CA_CERTS`, `PYTHONPATH`, the proxy variables (with their credentials), npm's registry, CA and registry token (`NODE_AUTH_TOKEN`, `NPM_TOKEN`, `//host/:_authToken`), `SSH_AUTH_SOCK`, `GIT_ASKPASS`, `SSH_ASKPASS`, `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`, the locale and `TZ`. The known price: a registry token reaches an install script, as on any developer's machine.
- **`CHILD_SETTINGS`** (`CI=1`, `FORCE_COLOR=0`, `HOST=127.0.0.1`, npm's non-interactive settings) are not added by the kernel; the engine's shell and the previews ask for them through `childEnvironment()`, which returns kernel-only overrides (`undefined` = remove), never a full environment.
- **The only way out** is the execution option `joeInfrastructure: true`. Only the files in `JOE_INFRASTRUCTURE_SITES` may pass it, and `the-users-code-never-sees-joes-secrets.test.ts` fails on any other file that names it.
- **What the user sees change:** an app that silently ran on Joe's `DATABASE_URL`, `MONGO_URI` or `JWT_SECRET` now fails at boot as it would on any clean machine, and `project_run` reports the app's own boot error in the chat. The app must carry its own configuration.
- **A dev server listens on this machine only.** `dev_server_start` (WebDevelopmentTools) gave vite, the vite config it writes, and `serve` the address `0.0.0.0`; all three now get `previewBindHost()`: `127.0.0.1`, or — only on the production Linux host that owns it — `172.18.0.1`, the Docker-bridge address the shipped nginx dials for `/preview/<port>/` (`infra/nginx/conf.d/app.conf`).

Every caller of the kernel's routes, as of this change (paths under `api/src`):

| Caller | Class | Why |
|---|---|---|
| `modules/tools/definitions/GitTools.ts` | Joe infrastructure | git push/fetch/pull/clone with the owner's GitHub token; the askpass helper reads it from the environment |
| `modules/tools/definitions/GitLocalWorkflowTool.ts` | Joe infrastructure | git on the owner's repository with his identity and credential settings |
| `modules/services/DeployManager.ts` (both calls) | Joe infrastructure | Joe deploying Joe: pull, build, restart of Joe's own API |
| `api/routes/ping-deploy.ts` (both calls) | Joe infrastructure | the same deploy, from the deploy ping |
| `api/routes/system.ts` (`git fetch` of Joe's repository, the updater) | Joe infrastructure | the updater restarts Joe with Joe's settings |
| `api/routes/admin.ts` (the backup script) | Joe infrastructure | Joe's own maintenance: the backup of Joe's database |
| `core/quality/ensure-chromium.ts` | Joe infrastructure | installs Joe's own Chromium where Joe's Playwright settings say |
| `modules/tools/definitions/EngineAndroidTool.ts` | Joe infrastructure | the adb bridge to the owner's phone (adb's own keys and server settings) |
| `modules/tools/definitions/EngineShellTools.ts` (shell_run, shell_start) | user code | the model's commands in the project |
| `modules/tools/definitions/EngineShellTools.ts` (taskkill, process query, version probes) | safe default | Joe's own helper commands; none needs a secret |
| `modules/tools/definitions/ProjectRunTool.ts` (preview start, static preview server) | user code | starts and serves the project |
| `modules/tools/definitions/ProjectRunTool.ts` (taskkill, pid and port probes) | safe default | system queries; no secret needed |
| `modules/tools/definitions/WebDevelopmentTools.ts` | user code | the project's dev server |
| `modules/tools/definitions/ApiProjectTool.ts`, `ReactProjectTool.ts`, `ProjectRepairTool.ts` (`node server.js`) | user code | boots the generated server |
| `modules/tools/definitions/ProjectEditTool.ts` (npm install, build) | user code | the project's install and build scripts |
| `modules/tools/definitions/ImportProjectTool.ts` (`npm test`) | user code | an imported third-party repository's own tests |
| `modules/tools/definitions/ImportProjectTool.ts` (`git clone`) | safe default | a clone of the address the user gave; an authenticated clone goes through GitTools |
| `modules/tools/definitions/ImageStudioTool.ts` | user code | scripts run inside the project against its own data |
| `modules/tools/definitions/DeployProjectTool.ts` (build, start, localtunnel, zip) | user code | the project's build and start commands |
| `modules/tools/definitions/PythonExecutionTool.ts`, `core/quality/python-runtime.ts`, `OrionBusinessFoundationTool.ts` | user code | Python the model wrote, and the project's Python tests |
| `modules/tools/definitions/DeadCodeTool.ts` | user code | a tool that loads the project's configuration |
| `modules/tools/definitions/ErrorRecoveryTool.ts` (`npm install <module>`) | user code | a package's install scripts |
| `modules/tools/definitions/SystemTools.ts` (background command, grep/find) | user code | the model's own command line; searches need no secret |
| `modules/tools/handlers.ts` (shell tool) | user code | the model's own command line |
| `modules/tools/definitions/InfrastructureTools.ts`, `DockerManagerTool.ts`, `VideoActionTool.ts`, `ArchiveFilesTool.ts`, `RepoSelfCodingTools.ts` | safe default | model-driven docker, ffmpeg, archive and check commands; none plainly needs Joe's secret |
| `modules/tools/definitions/EngineDeviceTools.ts` (desktop PowerShell, desktop host) | safe default | Joe's desktop scripts read no Joe setting, and a program they open for the owner must not inherit Joe's secrets |
| `core/quality/terminal-audit.ts`, `terminal-session.ts`, `log-doctor.ts` | user code | the project's install, build and test commands |
| `core/quality/js-syntax-check.ts` | safe default | `node --check` of a project file |
| `modules/terminal/terminal-kernel.ts` (the terminal, one-off commands) | user code | whatever is typed in the project's terminal |
| `api/routes/project.ts`, `api/routes/packages.ts` | user code | clone/install commands for a project from the API |
| `api/routes/git.ts` | safe default | local git status/add/blame/log; no credential involved |
| `api/routes/admin.ts` (`docker ps`, `systemctl is-active`) | safe default | status queries |
| `modules/services/BinaryService.ts` | safe default | `which`/`file` probes |
| `modules/services/IsolatedProjectRuntimeService.ts` | separate route | the isolated guest builds its own fixed environment and never used Joe's |
| `api/index.ts` (`reapPreviousLife`) | not a spawn of code | process listing at boot |

"Safe default" means the same clean environment as user code, for a command of Joe's own that needs no secret.

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
