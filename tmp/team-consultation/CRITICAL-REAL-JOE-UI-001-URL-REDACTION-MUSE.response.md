# Muse consultation response — CRITICAL-REAL-JOE-UI-001 URL log redaction
AGENT=MUSE
CONSULTATION_ID=CRITICAL-REAL-JOE-UI-001-URL-REDACTION-MUSE
PROPOSAL=D:\Joe\coordination\team\proposals\CRITICAL-REAL-JOE-UI-001-ACCEPTANCE-LOOP.md
HEAD=873010b32c75bf223b32d2426ec6ec7674429d27
PARENT_HEAD=be283ac391e92cd1304edbc6642e08adb7c7d487
TRACKED_TREE=CLEAN after commit 873010b3 (2 files: web/src/utils/redactUrl.ts, api/src/__tests__/browser-stream-token-redaction.test.ts)
UNTRACKED=PRESERVED (scratch/UAT/cache under tmp/; nothing deleted; this response added)
UPDATED=2026-09-29 (this cycle; independent inspection and implementation at HEAD 873010b3)
SHARED_FILE_WRITE=ACCESS_DENIED (expected per prior cycles; shared file left PENDING_REVIEW for verbatim import)

## POSITION (Muse's own, from independent source/test inspection this cycle)

### 1. Codex's userinfo finding is CORRECT: AGREE
- Read my own helper at be283ac3: redactCredentialsFromUrl never touches
  parsed.username/parsed.password, so wss://user:pass@host/ passes the
  password through. Codex's synthetic probe result (userinfoSecretPresent=true)
  matches this source trace.
- Independently reproduced with my own focused tests (not Codex's probe):
  3 new userinfo tests failed pre-fix (3 failed / 9 passed), all pass post-fix.
- Nuance my RED run surfaced: a JWT-shaped password was ALREADY caught by the
  JWT sweep (observed https://oauth2:[redacted]@joe.example/api pre-fix), so
  the live gap was non-JWT passwords plus every username. The fix closes both.

### 2. The helper contract should be GENERIC: redact both username and password
- A password in userinfo is credential-bearing by meaning, always.
- The username must also go: token-as-username is a real basic-auth pattern
  (https://TOKEN@host, https://oauth2:TOKEN@host). Keeping the username while
  redacting the password would still leak those tokens.
- The alternative (keep "identifier-like" usernames) would need an allowlist
  of safe usernames — a closed vocabulary, exactly what the mission forbids.
  Fail closed: redact both.
- Diagnosability is preserved: the marker keeps the shape (userinfo present,
  password part present or not) and host/path/query/fragment handling is
  unchanged. Session identity for diagnosis comes from sessionId, not userinfo.
- Deliberately NOT narrowed: narrowing the documented contract while callers
  can pass any URL would push the same leak to the next caller.

### 3. Fix implemented this cycle (commit 873010b3, 2 files, +60/-7)
- Parsed path: when parsed.username || parsed.password, both set to
  [redacted] (password left empty when absent, preserving the shape). The
  existing percent-encoding restore step already covers the marker.
- Fallback path (parser rejects input): new //userinfo@ regex redacts
  protocol-relative/malformed userinfo. It requires the // prefix, so bare
  emails can never match (pinned by a negative test).
- Docstrings in helper and test updated to state the userinfo rule.
- No-connection-impact proof: ModernBrowserStream.tsx:371 logs the redacted
  value, :372 still constructs new WebSocket(wsUrl) from the raw URL. The
  redacted string is log-only; extending it cannot break the connection.

### 4. Overlap, risks, alternatives
- Overlap: none. Touched area is web/src/utils + one api test; no contact
  with NVIDIA's claimed EVAL-006/PlanningEngine/IntentParser/memory scope or
  its active SelfFix/UAT work, and no other agent owns this helper.
- Risk accepted: the fallback regex over-redacts contrived non-URL text
  containing //x@y. That matches this helper's documented fail-closed
  philosophy (a hidden non-secret is harmless; a leaked secret is not).
- Risk checked: URLs without userinfo are byte-identical before/after
  (existing test still green), so no log churn for the common case.
- Alternative "redact password only": REJECTED (token-as-username leak above).

## RECOMMENDATION
APPROVE the generic-contract direction: userinfo (both positions) is now
redacted with focused negative/positive pins. This unit still needs
INDEPENDENT review before any integration; it does not by itself close C07
(NVIDIA's harness-side console redaction is NVIDIA's owned scope) and
CRITICAL-REAL-JOE-UI-001 MUST STAY OPEN (no fresh Real Joe UI PASS exists).

## TESTS (this cycle, observed)
- Focused: api/src/__tests__/browser-stream-token-redaction.test.ts
  pre-fix 3 failed/9 passed (RED), post-fix 12/12 passed (GREEN).
  Runner: jest --runInBand --no-cache --runTestsByPath, process-only dummy
  JWT_SECRET, JOE_TEST_MODE=true, OFFLINE_MODE=true, workspace-local
  TEMP/TMP and cacheDirectory (sandbox denies default OS temp realpath).
- web tsc -b: exit 0.
- git diff --check: exit 0.
- Push to origin/muse/joe-development: BLOCKED (sandbox schannel
  SEC_E_NO_CREDENTIALS, no GitHub credentials); commit 873010b3 is local-only.

## EVIDENCE PATHS
- Commit: 873010b3 on muse/joe-development (local; parent be283ac3)
- Source: web/src/utils/redactUrl.ts, web/src/components/ModernBrowserStream.tsx:371-372
- Test: api/src/__tests__/browser-stream-token-redaction.test.ts (12 tests)
