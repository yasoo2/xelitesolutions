# Brief: make one group of red Jest suites green — honestly

You are fixing part of a red test gate in `yasoo2/xelitesolutions` (the "Joe" agent platform).
You work in your OWN git worktree (you were started with worktree isolation). Other agents are
fixing other groups in parallel in other worktrees; a coordinator will review and merge your commits.

## Facts already established (do not re-derive)

- `bash scripts/gate.sh` on `main` @ `917c70e`: `Test Suites: 70 failed, 427 passed, 497 total`,
  `Tests: 160 failed, 6398 passed, 6558 total`. Every one of the 70 suites also fails when run ALONE,
  and every failure is a real assertion (`expect(...)` or a TypeError on a null result). None is a
  missing browser, database, port or a timeout. So: no "environment" excuses in your group.
- Each failing test was bisected over the first-parent chain from `add39dc8` (2026-08-28, last recorded
  green gate) to `917c70e`. Your task file lists, per test, the culprit commit (the first commit at which
  it is red) and the raw failure text at `917c70e`.
- The verification-ledger cluster is already fixed on your base commit (`4324f0ea`). The routing /
  intent-classifier cluster (commit `fa810595` and friends) is the coordinator's; if a test of yours turns
  out to depend on routing (PlanningEngine / IntentParser / intent-classifier / buildIntent / clarify),
  do not change those files — report it.

## Setup (once)

```bash
cd <your worktree root>
ln -s /home/user/xelitesolutions/api/node_modules api/node_modules
ln -s /home/user/xelitesolutions/web/node_modules web/node_modules   # only if a test reads web/ and needs it
cd api && NODE_OPTIONS=--use-openssl-ca npx jest --runTestsByPath src/__tests__/<suite>.test.ts
```

The machine has 4 cores shared by five workers. Run only your own suites, never the whole gate. If you
see "Exceeded timeout", rerun that one file alone with `--runInBand` before drawing any conclusion.

## Read first

`CLAUDE.md` at the repo root, sections 2 and 3 (the owner's laws and the measurement rules). They bind
you. In short: no fake code, no value planted to turn a test green, no test-only branch in production code
(`NODE_ENV === 'test'` and the like), no rule keyed on a closed list of known words/products (law 4: the
request is the reference, not a catalogue), every guard needs a positive AND a negative case, and every
guard you change must be proven non-vacuous by breaking it on purpose and watching it fail for the
intended reason.

## For each failing test in your task file

1. Read the test, including its narrative comment — it records WHY the guard exists (usually a real
   live failure the owner saw).
2. Read the culprit commit: `git show <culprit> --stat`, its message, and `git show <culprit> -- <file>`
   for the code the test reads. Understand what the commit meant to do.
3. Decide, and write down which:
   - **(R) regression** — the protected behaviour was lost as a side effect. Fix the production code so
     the guard holds again, while keeping the culprit's intended change and its own tests green.
   - **(P) pinned text, invariant intact** — the test pins source text that was refactored, and the
     invariant it protects still holds in the new code (verify by reading the new code path, not by
     assuming). Update the test to the new code. Keep the guard's intent and strength; if it is cheap to
     assert the behaviour instead of the spelling, prefer that. Never loosen to `toBeDefined`, never
     delete an assertion, never `skip`.
   - **(X) conflict** — the culprit deliberately changed behaviour in a way that contradicts the guard
     (e.g. a newer live requirement vs an older one). Do NOT flip the test to match. Stop on that test and
     report it with both sides quoted; the coordinator decides.
4. Prove non-vacuity for every guard you touched or every code fix you made, using the tool:
   ```bash
   python3 /tmp/claude-0/-home-user-xelitesolutions/4f04c649-b866-5556-be72-fb3fc47a0cfc/scratchpad/mutate.py \
       <label> <absolute path of the PRODUCTION file to break> <old.txt> <new.txt> [<old2.txt> <new2.txt> ...] \
       src/__tests__/<suite>.test.ts -t '<test name regex>'
   ```
   `old.txt` holds the exact text to replace (must occur exactly once), `new.txt` the broken version.
   It runs jest in your checkout's `api/`, prints the ✓/✕ and Expected/Received lines, restores the file
   and prints `sha256 identical`. The mutation must break the INVARIANT (the behaviour), not just the
   spelling the test greps for — e.g. for a pinned "guard runs before X" test, move the guard after X.
   Keep the raw output for your report.
5. Make sure each invariant you touched has both a positive and a negative case in the suite; add the
   missing one if needed (and prove it too).

## Finish

- Run every suite in your group together; all must pass:
  `NODE_OPTIONS=--use-openssl-ca npx jest --runTestsByPath <all your suites>` — keep the raw
  `Test Suites:` and `Tests:` lines.
- Also run `npx tsc --noEmit` in `api/` if you changed any production `.ts` (expect exit 0).
- Commit in your worktree (do NOT push). One commit per logical fix is ideal. English message:
  what was red, culprit, root cause, decision (R/P), the mutation evidence lines. End every message with:
  ```
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CSeapUrWatvdumdAwyPuqV
  ```
  No model name anywhere in commits or code.
- Do not edit test files outside your group. Production files may be shared with other agents
  (e.g. `ReactProjectTool.ts`, `app-blueprints.ts`): keep your edits minimal and local.
- Do not touch generated projects, `docs/agent-mail/`, PR #82, or `main`.

## Report back (this is all the coordinator sees)

1. Worktree path, branch name, and the list of your commit hashes.
2. A table: suite · test · culprit · decision (R/P/X) · one-line root cause · files changed.
3. For each R/P: the raw mutation lines (the ✕ line and Expected/Received) and the `sha256 identical` line.
4. Every (X) conflict, with the quoted test intent and the quoted culprit intent.
5. The final raw `Test Suites:` / `Tests:` lines for your group, and the tsc exit code.
Be exact; do not summarise a result you did not run.
