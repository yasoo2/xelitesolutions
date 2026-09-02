# Joe Capability Registry

This registry records reusable capabilities proved by the live evaluation. It is updated when a test exposes a general gap; it is not a claim of universal autonomy.

| Capability | Implementation | Selection | Evidence | Known limitation |
| --- | --- | --- | --- | --- |
| Read-only workspace inspection | `IntentParser` + `ProjectPipelineTool` | Explicit read-only contract | Live P01: root listing and README summary completed without writes | Broad unfamiliar requests still need deeper live coverage |
| Explicit file creation and read-back | `file-intent.ts` + `PlanningEngine` + `ToolService` | Named relative file, declared content, optional read-back | Live P02: exact three-line file written and read back | Only bounded explicit file contracts use this fast path |
| Nested file destinations | `file-intent.ts` preserves an explicit folder relationship | Named folder plus “inside it” / equivalent wording | Live P03: `joe-prompt-03/README.txt` created and read back; root remained untouched | More complex path language still belongs to the normal planner |
| Bounded terminal diagnostics | `isBoundedTerminalDiagnosticRequest` + `PlanningEngine` allowlist | Explicit local diagnostic/check request with read-only constraints | Live P04: real `node --version` and `pwd` output appeared in chat and Terminal | The allowlist is deliberately bounded; it does not interpret arbitrary shell text |
| GitHub credential lifecycle | `/github/connect`, `/github/disconnect`, encrypted user secrets | GitHub menu action | Static/API contracts pass; disconnect removes durable and offline credentials | Live connected-state click requires a user-provided valid token |
| GitHub sync telemetry separation | `broadcastTerminalLine` from repo connect route | Repository selection | Sync status appears in Logs/Terminal rather than chat thinking timeline | Full connected-repo live retest is pending token access |
| Self-healing execution boundary | `RepairTicketService` → `SelfFixService` → `SelfFixExecutionService` | Failed phase with trusted context | Permanent failure/success and TypeScript repair checks pass | One repair attempt is intentionally the hard limit |

## Evaluation Rules

- A prompt is passed only when its requested artifact or behavior exists and is independently verified.
- A chat sentence, HTTP success, or Joe's own completion claim is not evidence by itself.
- A failed prompt is recorded before repair; the same prompt is rerun after a general fix.
- Generated runtime artifacts and logs are not source evidence and are not committed unless the test explicitly requires them.
