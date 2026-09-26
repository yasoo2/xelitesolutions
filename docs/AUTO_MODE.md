# Auto routing and provider continuity

Joe's existing router selects an eligible provider while preserving the request's
messages, tools and execution context. Provider availability is an external
dependency: Auto mode cannot guarantee that a free service will answer or that an
available model will produce a correct application.

## Cost policy

The server defaults to `AI_COST_POLICY=free_only`. A request, prompt or model
configuration cannot enable paid fallback. Only an operator setting
`AI_COST_POLICY=allow_paid` permits a paid route; configuring a key alone does not.

Under `free_only`:

- Local inference must use a loopback endpoint.
- OpenRouter must use a model whose name ends in `:free`.
- Groq, Gemini, Cerebras, Mistral and Hugging Face require an operator's explicit
  free-account attestation in `AI_FREE_PROVIDERS`, a comma-separated list of their
  lowercase provider names. This setting does not create a free tier or verify a
  vendor's billing configuration. Leave it empty unless that account is known to
  be free under its configured limits.
- The existing keyless LLM7, DuckAI and Pollinations routes remain eligible.
  A keyed or overridden LLM7 endpoint, a paid DeepSeek key and unknown custom
  endpoints are excluded. No provider account is registered automatically.

## Failure and recovery

Quota and rate-limit memory belongs to a provider credential, across models.
Re-selecting a model does not bypass the provider's cooldown. Environment keys
share the same circuit between direct and automatic routing; custom credentials
are scoped to their owner and workspace. Circuit identifiers use a process-only
HMAC and do not expose credentials.

Failures are classified as `RATE_LIMITED`, `QUOTA_EXHAUSTED`, `AUTH_FAILED` or
`TEMPORARILY_UNAVAILABLE`. Joe honors a provider's `Retry-After` header or supported
reset message. Without one, fallback cooldowns are one minute for transient/rate
failures, thirty minutes for quota exhaustion and five minutes for authentication
failure. These are retry policies, not claims about vendor quota reset times.

The router continues to another cost-eligible provider with the same context.
After cooldown, one request may probe the provider; concurrent requests cannot
start another probe while that transport remains unresolved. Recovery requests
have a bounded deadline. A direct provider health check observes the same policy
and cannot certify that provider using another provider's answer.

Gemini stops model fallback after a quota/rate-limit response; Gemini and
OpenRouter disable hidden SDK retries. Failure receipts redact known credentials.
If every eligible route fails, Joe reports the limitation instead of silently
enabling a paid provider.

The circuit store is bounded and in memory. It resets with the API process and
is not a cross-server quota ledger. Successful routing is separate from build,
browser and user acceptance gates.

## Verification

`provider-continuity.test.ts` checks routing, policy, isolation, cooldown and probe
ownership. `free-provider-adapter-resilience.test.ts` checks Gemini/OpenRouter
transport behavior. These controlled tests do not establish live provider
availability; real Joe UI replay is recorded separately in the evaluation log.
