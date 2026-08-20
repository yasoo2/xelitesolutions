# Live Evidence 038 — separate diagnosis

## Diagnosis

The raw run evidence and the API log identify a provider-availability failure before the engineering pipeline could write and verify the requested app. The relevant log lines are:

```text
[AgentOrchestrator] Node project_pipeline failed: ## ⚠️ Stopped before writing because evidence is incomplete
[OpenAI] Chat Failed: OpenAI compatible gateway error: Insufficient credits
[IntelligentRouter] OpenAI (Direct) failed or timed out: OpenAI compatible gateway error: Insufficient credits
[SessionController] Auto-renamed session ... (Offline: true)
```

The generated preview shown in the browser was a generic static landing page, while Joe reported `finalVerified=false`, `liveUrl=null`, `done/total=0/8`, and `Project Setup (tasks: 0/3)`. The diagnosis is therefore a provider-failure/offline-fallback contract gap: the run did not reach a verified engineering phase, and the fallback artifact must not be treated as the requested WeatherGo application.

## Proposed next investigation (not yet implemented)

Before changing code, the provider routing and offline fallback contract must be inspected and covered by a regression. The desired behavior is either a clearly surfaced, structured provider blocker before creating a misleading deliverable, or a verified alternate provider path capable of carrying out the engineering pipeline. No generated WeatherGo files are to be edited manually.

This diagnosis is separate from the preceding raw-evidence record and is based only on the logged failure and visible run decision.
