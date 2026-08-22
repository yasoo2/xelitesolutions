#!/usr/bin/env bash
#
#  THE GATE, WHERE IT ACTUALLY RUNS.
#
#  GitHub Actions is off on this account. Measured before this script was
#  written: every workflow run in this repository ends within two to six
#  seconds, with no step executed and no log to download — on `main` as well
#  as on branches, for days. So the red and yellow marks on the pull requests
#  were never verdicts. Nothing had been measured.
#
#  A check that cannot run must not display a result, and a gate that lives
#  only on one machine is not a gate — it is that machine's opinion. The real
#  gate was already being run by hand, in two places, by two different
#  scripts that neither agreed on their output nor existed in this
#  repository. One of them reported the LAST batch's test count as the whole
#  run's total, and a correct batch was nearly stopped over the number that
#  came out of it.
#
#  This is that gate, versioned, identical for everyone, and printing its
#  aggregate rather than its tail.
#
#      bash scripts/gate.sh
#
#  WHAT IT COVERS, AND WHAT IT DOES NOT.
#
#  Covered — the blocking steps of `.github/workflows/ci.yml`'s `verify`
#  job, in its order: install, type-check api, type-check web, build api,
#  build web, jest. Every one of them reaches the verdict; a step that
#  prints an exit code and is not counted is decoration.
#
#  NOT covered, deliberately and by name:
#    · `npm audit` (ci.yml's «Dependency audit» job) — it reads the network,
#      and a gate that fails because a registry is slow teaches people to
#      re-run it until it passes.
#    · the «Live harnesses» job — it needs Chromium and a provider key, and
#      those runs are published as raw evidence per batch instead.
#    · `web lint` — ci.yml itself marks it reported-not-blocking.
#
#  The first draft of this file claimed it ran «the same checks ci.yml
#  declares» while skipping the web type-check and the api build. That claim
#  was caught in review, not by the script. A gate that overstates its own
#  reach is the same defect as a gate that does not run: both answer a
#  question they never asked. So the list above is exhaustive, and anything
#  added to ci.yml has to be added here or named here as excluded.
#
#  Every number it prints carries the command that produced it. Nothing here
#  interprets a result: a failing step keeps its own exit code, and the last
#  line is the whole verdict.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
#
#  THE MACHINE IS NOT MINE.
#
#  Measured on the other agent's box, on a commit this gate calls green
#  here: five suites reported «A jest worker process ... signal=SIGTERM»,
#  and the run summarised as «5 failed, 221 passed» with «3621 passed,
#  3621 total» — five suites dead and NOT ONE failing assertion, because
#  the workers were killed before their tests could run.
#
#  The cause was in this file. It ran the whole suite in parallel with a
#  4 GB heap per worker, on a box that has been batching for days precisely
#  because it cannot afford that — and it silently discarded the operator's
#  own NODE_OPTIONS while doing it. A tool written on generous hardware and
#  run on narrow hardware produces a red that means nothing, and a false red
#  is worse than no guard at all: it trains the eye to ignore red.
#
#  So the two knobs that decide whether the run fits in memory are settable,
#  the operator's NODE_OPTIONS is honoured when they set one, and both are
#  printed with the verdict — a number is not a measurement without the
#  conditions that produced it.
#
#      GATE_JEST_WORKERS=2 GATE_NODE_HEAP=1536 bash scripts/gate.sh
#
#  Precedence, and it was measured the wrong way round first: asking for
#  GATE_NODE_HEAP=1536 printed 8192, because an inherited NODE_OPTIONS won.
#  The knob a person reaches for deliberately outranks the one their shell
#  happens to carry — so an explicit GATE_NODE_HEAP wins, an inherited
#  NODE_OPTIONS is honoured when no heap is named, and the default is last.
if [ -n "${GATE_NODE_HEAP:-}" ]; then
    JEST_NODE_OPTIONS="--max-old-space-size=$GATE_NODE_HEAP"
else
    JEST_NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
fi
WORKERS_ARG=()
[ -n "${GATE_JEST_WORKERS:-}" ] && WORKERS_ARG=(--maxWorkers="$GATE_JEST_WORKERS")

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- 1. deps
say "dependencies"
#  CI installs from the lockfile into an empty machine every time; this
#  reuses whatever is on disk. That is a real difference and it is labelled
#  rather than hidden — a reused tree can be stale or hand-edited, and a
#  report that says «reused» lets a reader weigh the number accordingly.
#  GATE_DEPS=clean forces the lockfile install when the difference matters.
if [ "${GATE_DEPS:-}" = "clean" ] || [ ! -d "$ROOT/api/node_modules" ]; then
    echo "$ npm --prefix api ci --no-audit --no-fund"
    npm --prefix "$ROOT/api" ci --no-audit --no-fund || npm --prefix "$ROOT/api" install --no-audit --no-fund
    echo "GATE_DEPS:clean"
else
    echo "GATE_DEPS:reused — api/node_modules already on disk (GATE_DEPS=clean to reinstall)"
fi

# ---------------------------------------------------------------- 2. types
say "type-check — api"
echo "$ npx tsc --noEmit"
( cd "$ROOT/api" && npx tsc --noEmit )
TSC_EXIT=$?
echo "GATE_TSC_EXIT:$TSC_EXIT"

say "type-check — web"
if [ -d "$ROOT/web/node_modules" ] || npm --prefix "$ROOT/web" ci --no-audit --no-fund; then
    echo "$ npm --prefix web run type-check"
    npm --prefix "$ROOT/web" run type-check
    WEB_TSC_EXIT=$?
else
    WEB_TSC_EXIT=1
fi
echo "GATE_WEB_TSC_EXIT:$WEB_TSC_EXIT"

# --------------------------------------------------------------- 3. api build
#
#  esbuild bundles what actually ships. A file can type-check and still fail
#  to bundle — an import that only resolves under ts paths, a package the
#  bundler cannot externalise — so the build is its own question.
#
say "build — api"
echo "$ npm --prefix api run build"
npm --prefix "$ROOT/api" run build
API_BUILD_EXIT=$?
echo "GATE_API_BUILD_EXIT:$API_BUILD_EXIT"

# ------------------------------------------------------------- 3. web build
#
#  `joe-ui-shell.test.ts` asserts that web/dist/index.html exists, because a
#  server with nothing to serve is a real failure in production. In a fresh
#  clone it is also the state before anyone has built anything, so the suite
#  would open on a red that says nothing about the change under test. CI
#  builds the web bundle before running the suite; so does this.
#
#
#  IT IS BUILT EVERY TIME, ON PURPOSE.
#
#  The first draft skipped the build when web/dist/index.html already
#  existed. That turns the presence of a FILE into evidence about the
#  SOURCE: an hour-old bundle, built before the change under test, would
#  satisfy it — and joe-ui-shell would then pass against a page nobody had
#  rebuilt. CI has no such shortcut, and a gate that is cheaper than CI in
#  exactly the place where staleness hides is not the same gate.
#
say "build — web"
echo "$ npm --prefix web run build"
npm --prefix "$ROOT/web" run build
WEB_BUILD_EXIT=$?
echo "GATE_WEB_BUILD_EXIT:$WEB_BUILD_EXIT"

# ---------------------------------------------------------------- 4. suite
#
#  A NARROWED RUN IS NOT A VERDICT.
#
#  Arguments are forwarded so a single file can be exercised while a fix is
#  being written — and that is exactly how «zero failures» starts meaning
#  «almost nothing ran». `bash scripts/gate.sh --testPathPatterns=x` used to
#  end in the same GATE:PASS as the whole suite. It cannot any more: a run
#  that was given a selector is reported as PARTIAL and never as PASS, no
#  matter how green it is.
#
say "jest — the whole suite"
SCOPE="full"
[ "$#" -gt 0 ] && SCOPE="partial (selector: $*)"
echo "GATE_SCOPE:$SCOPE"
JEST_LOG="$(mktemp -t joe-gate-jest.XXXXXX)"
echo "GATE_NODE_OPTIONS:$JEST_NODE_OPTIONS"
echo "GATE_JEST_WORKERS:${GATE_JEST_WORKERS:-jest default}"
echo "$ NODE_OPTIONS=$JEST_NODE_OPTIONS npx jest ${WORKERS_ARG[*]:-}"
#
#  THE EXIT CODE COMES FROM JEST, NOT FROM THE PIPE — AND IT SAYS SO.
#
#  This used to read `JEST_EXIT=${PIPESTATUS[0]}` after a SUBSHELL. That
#  array holds one element there — the subshell's own status — so the line
#  said «jest's exit» and delivered «whatever the pipeline returned». It
#  worked, but only because `pipefail` happened to be set at the top of the
#  file: measured, `( false | tee | grep -q "" )` gives 1 with pipefail and
#  0 without. Anyone deleting one word from a `set` line three screens away
#  would have flipped every verdict in this file to green, silently.
#
#  Jest's own status is captured directly now. The formatting pipe cannot
#  speak for it, and no distant option decides whether the gate can fail.
#
JEST_RC_FILE="$(mktemp -t joe-gate-rc.XXXXXX)"
( cd "$ROOT/api" && { NODE_OPTIONS="$JEST_NODE_OPTIONS" npx jest "${WORKERS_ARG[@]}" "$@" 2>&1; echo "$?" > "$JEST_RC_FILE"; } \
    | tee "$JEST_LOG" | grep -E '^(PASS|FAIL|Tests:|Test Suites:)' )
JEST_EXIT="$(cat "$JEST_RC_FILE" 2>/dev/null || echo 1)"
rm -f "$JEST_RC_FILE"
echo "GATE_JEST_EXIT:$JEST_EXIT"

# -------------------------------------------------------------- 5. verdict
#
#  THE TAIL IS NOT THE TOTAL. Jest's own summary already aggregates a single
#  run, so it is quoted here verbatim rather than recomputed — and the suite
#  count IS the covered-file count, which is the number that separates «zero
#  failures» from «zero tests ran».
#
say "verdict"
SUITES="$(grep -E '^Test Suites:' "$JEST_LOG" | tail -1)"
grep -E '^(Test Suites|Tests):' "$JEST_LOG" \
    || echo "no jest summary — the run produced none, which is itself the finding"
echo "GATE_SCOPE:$SCOPE"
echo "GATE_NODE_OPTIONS:$JEST_NODE_OPTIONS"
echo "GATE_JEST_WORKERS:${GATE_JEST_WORKERS:-jest default}"
echo "GATE_TSC_EXIT:$TSC_EXIT"
echo "GATE_WEB_TSC_EXIT:$WEB_TSC_EXIT"
echo "GATE_API_BUILD_EXIT:$API_BUILD_EXIT"
echo "GATE_WEB_BUILD_EXIT:$WEB_BUILD_EXIT"
echo "GATE_JEST_EXIT:$JEST_EXIT"
echo "jest log kept at: $JEST_LOG"

#  ZERO FAILURES IS NOT ZERO TESTS. An exit code of 0 is also what a run
#  that matched nothing returns, so the summary line has to exist before it
#  is believed.
if [ -z "$SUITES" ]; then
    echo "GATE:FAIL — jest printed no summary, so nothing was measured"
    exit 1
fi

if [ "$TSC_EXIT" -ne 0 ] || [ "$WEB_TSC_EXIT" -ne 0 ] \
   || [ "$API_BUILD_EXIT" -ne 0 ] || [ "$WEB_BUILD_EXIT" -ne 0 ] \
   || [ "$JEST_EXIT" -ne 0 ]; then
    echo "GATE:FAIL"
    exit 1
fi

if [ "$SCOPE" != "full" ]; then
    echo "GATE:PARTIAL — green, but a selector was given: this is not a gate result"
    exit 2
fi
echo "GATE:PASS"
exit 0
