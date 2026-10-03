# Cycle 230 — redactor generalization: class-based credential redaction (Muse lane)

SOURCE_HEAD=be674904 (muse/joe-development, tracked clean at start)
DATE_UTC=2026-10-03
SCOPE=Muse-owned redactor lane only. Zero NVIDIA-scope edits. Codex c226
condition work (401d436c wrapper) untouched; this change is additive rules.

## 1. Root cause (RED evidence)

`redactSecretsFromString` enumerated a few short spellings (JWT, sk-, ghp_,
Bearer, ?token/?password/?key, x-worker-key, 4 named vars). Every synonym
leaked verbatim into logs, stored tool inputs, error messages and telemetry
hashes: `password=hunter2`, `secret: blueberry`, `api_key=...`,
`{"password": "..."}`, `?access_token=...`, `mongodb://u:pass@host` —
15/15 new transfer tests failed on the pre-fix code (44/44 existing passed).

## 2. Fix (GREEN): meaning-based, two tiers + two mechanisms

File: `api/src/shared/utils/redaction.ts` (+~90 lines, no new imports).

- TIER-1 (unambiguous cues: password|passwd|secret|api_key|private_key|
  client_secret): any non-trivial value redacts. Numerics, null-literals
  (`true/false/null/none/...`), empty quotes and `{{SECRET:...}}`
  placeholders are kept.
- TIER-2 (ambiguous cues: token|auth|bearer|credential|csrf|key): value must
  be secret-shaped (digit-bearing or 16+ chars); numerics, literals, UUIDs,
  keyboard names (`Enter`, `ArrowLeft`) are kept.
- Shared guards: cue must not be the tail (`monkey`) or head (`tokenizer`,
  `author`, `authentication`) of a longer word; camel humps (`accessToken`)
  and snake/kebab prefixes (`access_token`, `_csrf`) count as compounds;
  quoted JSON names supported; trailing punctuation preserved; output is
  idempotent (re-redacting is a byte no-op).
- RULE B: query/matrix params generalized (`[?&;]` + full cue set).
  Identical output for the 3 previously covered params.
- RULE C: URI userinfo passwords (`://user:PASS@host`). Ports can never
  match (a literal `@` is required).

Known pinned over-redaction (fail-closed, deliberate): `password: required`
redacts, because it is shape-identical to a real password.

## 3. Verification on exact final source

- `redact-secrets-from-string.test.ts`: 60/60 (30 pre-existing + 30 new:
  15 redact-transfer + 13 intact-negative + idempotency + agreement).
- `rejected-command-redaction.test.ts`: 17/17 (exact-shape pins unchanged).
- Neighbors + contract group (7 suites): 133/133
  (local-backend-evidence, diagnostic-test-report, ui-verification-evidence,
  prose-verification-contract, verification-contract-conformance,
  smoke-verification-rewrite, verification-ledger).
- `tsc --noEmit`: exit 0.
- Extra non-enumerated probe (10 cases: refresh_token, sessionToken,
  spaced/JSON/single-quote forms, `;` params, hyphenated bearer): 10/10 +
  idempotent. Scratch: `tmp/c230-redact-probe/probe.mts` (untracked).
- Pre-fix RED was observed (15 failed / 44 passed); the plural-suffix
  capture bug and the `[REDACTED]]` idempotency bug were both caught by
  tests before commit, not after.

AGENTS.md 10-gate matrix: not applicable (no architecture/planner/phase/
repair/self-fix/ToolService/package-script/workspace-path change).

## 4. Documented residuals (not defects-in-hiding)

- Vendor-sigil bearer tokens (Stripe/AWS/Slack/GitHub-app/GitLab/npm/PyPI
  shapes), PEM bodies, digitless short mixed tokens, numeric OTP/PINs:
  measured as out of scope. Follow-up recipe: cue-adjacent entropy rule,
  not per-vendor enumeration. No per-vendor regex was added this cycle.
- Web-side parity (`web/src/utils/redactUrl.ts`) not assessed this cycle.
- Real Joe UI UAT: BLOCKED (:5002/:5101 down, :5000 API-only). No UI claim.

## 5. Coordination state observed this cycle

- NVIDIA HEAD still a10c71ab; BATCH2-VERIFY provenance hashes for
  verification-ledger.ts, VisualQATool.ts, BulkFileGeneratorTool.ts match
  current dirty bytes exactly (no drift; that review stays current-scoped).
- Received-reviews index: 135 entries (unchanged since cycle 229). Newest 5
  consultations are all Muse responses or REVIEWED files; no new
  PENDING_REVIEW request for Muse exists.
- Runtime: :5000 OK (uptime ~36000s, no-commit-file, API-only, not a UI
  substitute); :5002/:5101 connection refused. No process started/stopped.
