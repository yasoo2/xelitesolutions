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
#
#  AND IT RUNS IN BATCHES, BECAUSE ONE PROCESS DOES NOT SURVIVE THE SUITE.
#
#  Measured twice on the other agent's box — and the second time was AFTER
#  this file had already been «fixed» for that box:
#
#      $ GATE_JEST_WORKERS=1 GATE_NODE_HEAP=2048 bash scripts/gate.sh
#      Test Suites: 139 failed, 88 passed, 227 total
#      Tests:       1674 passed, 1674 total
#      «A jest worker process (pid=349740) was terminated by another
#       process: signal=SIGTERM, exitCode=null»
#
#  A hundred and thirty-nine suites dead and NOT ONE failing assertion. The
#  knobs added after the first false red were a knob, not a fix: they let an
#  operator ask for less parallelism, and the run died anyway, because what
#  does not fit is ONE jest process carrying 227 suites — not the worker
#  count. A fix aimed at the wrong quantity is indistinguishable from no fix
#  at all, and this one cost that operator a second false red to discover.
#
#  So the gate now does what he was already doing by hand — which is the
#  thing this file exists to stop him doing by hand. It batches.
#
#  And because batching is precisely how a run silently covers less than the
#  whole suite, the denominator is no longer read out of jest's own summary.
#  It is `jest --listTests`, taken before anything runs, and a run whose
#  batches do not add up to that number FAILS with the shortfall named. The
#  old check — «did jest print a summary at all» — could not see the run
#  above: it printed a perfectly well-formed summary about a suite that had
#  largely been killed.
#
#      GATE_BATCH=12     test files per jest process (0 = one process, no batching)
#
#  Twelve is not a taste. It is the size that box has been surviving on for
#  days, and a gate's default belongs on the NARROWEST machine that has to
#  run it: a wide machine can afford nineteen extra process starts, and no
#  machine can afford a green that was never measured.
#
say "jest — the whole suite"
SCOPE="full"
[ "$#" -gt 0 ] && SCOPE="partial (selector: $*)"
echo "GATE_SCOPE:$SCOPE"
echo "GATE_NODE_OPTIONS:$JEST_NODE_OPTIONS"
echo "GATE_JEST_WORKERS:${GATE_JEST_WORKERS:-jest default}"

GATE_WORK="$(mktemp -d -t joe-gate.XXXXXX)"
JEST_LOG="$GATE_WORK/jest.log"
: > "$JEST_LOG"

#  THE DENOMINATOR COMES FROM JEST, BEFORE ANYTHING RUNS.
#
#  `--listTests` applies the project's own testMatch and the same selector
#  the run will use, so this is the file list jest itself would have run —
#  not a glob written here that could drift from jest.config.js.
TESTS_LIST="$GATE_WORK/files.txt"
echo "$ npx jest --listTests ${*:-}"
( cd "$ROOT/api" && npx jest --listTests "$@" 2>"$GATE_WORK/list.err" ) | sort > "$TESTS_LIST"
FILES_TOTAL="$(wc -l < "$TESTS_LIST" | tr -d ' ')"
echo "GATE_FILES_LISTED:$FILES_TOTAL"
if [ "$FILES_TOTAL" -eq 0 ]; then
    echo "GATE:FAIL — jest resolved no test files, so there is nothing to measure"
    sed -n '1,20p' "$GATE_WORK/list.err" 2>/dev/null
    exit 1
fi

#  Reads one number out of a jest summary line («139 failed, 88 passed, 227
#  total») and yields 0 when the line, or that word in it, is absent — a
#  batch that died before printing anything must contribute zero, not break
#  the arithmetic.
num_of() {
    local v=""
    v="$(printf '%s' "${1:-}" | grep -oE "[0-9]+ $2" | head -1 | grep -oE '^[0-9]+')" || v=""
    printf '%s' "${v:-0}"
}

BATCH="${GATE_BATCH:-12}"
[ "$BATCH" -eq 0 ] && BATCH="$FILES_TOTAL"
split -l "$BATCH" -d -a 3 "$TESTS_LIST" "$GATE_WORK/batch-"
echo "GATE_BATCH:$BATCH files per jest process"

SUITES_SEEN=0; SUITES_FAILED=0; TESTS_SEEN=0; TESTS_FAILED=0
BATCH_N=0; BATCHES_NONZERO=0; JEST_EXIT=0

for BATCH_FILE in "$GATE_WORK"/batch-*; do
    BATCH_N=$((BATCH_N + 1))
    BLOG="$GATE_WORK/log-$BATCH_N"
    mapfile -t BATCH_PATHS < "$BATCH_FILE"
    printf '\n-- batch %d/%d · %d files\n' "$BATCH_N" \
        "$(( (FILES_TOTAL + BATCH - 1) / BATCH ))" "${#BATCH_PATHS[@]}"

    #  THE EXIT CODE COMES FROM JEST, NOT FROM THE PIPE — AND IT SAYS SO.
    #
    #  This used to read `JEST_EXIT=${PIPESTATUS[0]}` after a SUBSHELL. That
    #  array holds one element there — the subshell's own status — so the
    #  line said «jest's exit» and delivered «whatever the pipeline
    #  returned». It worked, but only because `pipefail` happened to be set
    #  at the top of the file: measured, `( false | tee | grep -q "" )` gives
    #  1 with pipefail and 0 without. Anyone deleting one word from a `set`
    #  line three screens away would have flipped every verdict in this file
    #  to green, silently.
    #
    #  Jest's own status is captured directly. The formatting pipe cannot
    #  speak for it, and no distant option decides whether the gate can fail.
    RC_FILE="$GATE_WORK/rc-$BATCH_N"
    #  `--runTestsByPath` takes the listed paths literally. Passed as bare
    #  positionals they would be regexes, and a path is full of characters a
    #  regex reads as instructions.
    ( cd "$ROOT/api" && { NODE_OPTIONS="$JEST_NODE_OPTIONS" npx jest --runTestsByPath \
            "${WORKERS_ARG[@]}" "${BATCH_PATHS[@]}" 2>&1; echo "$?" > "$RC_FILE"; } \
        | tee "$BLOG" | grep -E '^(PASS|FAIL|Tests:|Test Suites:)' )
    BATCH_EXIT="$(cat "$RC_FILE" 2>/dev/null || echo 1)"
    cat "$BLOG" >> "$JEST_LOG"
    echo "GATE_BATCH_${BATCH_N}_EXIT:$BATCH_EXIT"
    [ "$BATCH_EXIT" -ne 0 ] && { BATCHES_NONZERO=$((BATCHES_NONZERO + 1)); JEST_EXIT=1; }

    B_SUITES="$(grep -E '^Test Suites:' "$BLOG" | tail -1)"
    B_TESTS="$(grep -E '^Tests:' "$BLOG" | tail -1)"
    SUITES_SEEN=$((   SUITES_SEEN   + $(num_of "$B_SUITES" total) ))
    SUITES_FAILED=$(( SUITES_FAILED + $(num_of "$B_SUITES" failed) ))
    TESTS_SEEN=$((    TESTS_SEEN    + $(num_of "$B_TESTS"  total) ))
    TESTS_FAILED=$((  TESTS_FAILED  + $(num_of "$B_TESTS"  failed) ))
done

# -------------------------------------------------------------- 5. verdict
#
#  THE TAIL IS NOT THE TOTAL — and with batches there is no tail that could
#  even pretend to be. Every number below is a sum over every batch, printed
#  beside the command and the conditions that produced it.
#
say "verdict"
echo "Test Suites: $SUITES_FAILED failed, $((SUITES_SEEN - SUITES_FAILED)) passed, $SUITES_SEEN total"
echo "Tests:       $TESTS_FAILED failed, $((TESTS_SEEN - TESTS_FAILED)) passed, $TESTS_SEEN total"
echo "GATE_SCOPE:$SCOPE"
echo "GATE_NODE_OPTIONS:$JEST_NODE_OPTIONS"
echo "GATE_JEST_WORKERS:${GATE_JEST_WORKERS:-jest default}"
echo "GATE_BATCH:$BATCH"
echo "GATE_BATCHES_RUN:$BATCH_N"
echo "GATE_BATCHES_NONZERO:$BATCHES_NONZERO"
echo "GATE_FILES_LISTED:$FILES_TOTAL"
echo "GATE_SUITES_REPORTED:$SUITES_SEEN"
echo "GATE_TSC_EXIT:$TSC_EXIT"
echo "GATE_WEB_TSC_EXIT:$WEB_TSC_EXIT"
echo "GATE_API_BUILD_EXIT:$API_BUILD_EXIT"
echo "GATE_WEB_BUILD_EXIT:$WEB_BUILD_EXIT"
echo "GATE_JEST_EXIT:$JEST_EXIT"
echo "jest log kept at: $JEST_LOG"

#  ZERO FAILURES IS NOT ZERO TESTS — AND A WELL-FORMED SUMMARY IS NOT
#  COVERAGE. The run that prompted this check printed «227 total» while 139
#  of those suites had been killed before executing an assertion. The only
#  number that cannot be produced by a dead worker is the one taken before
#  the workers existed: the file list. If the batches do not add up to it,
#  something was not measured, and the gate says which.
if [ "$SUITES_SEEN" -ne "$FILES_TOTAL" ]; then
    echo "GATE:FAIL — $SUITES_SEEN of $FILES_TOTAL listed test files reached a verdict; $((FILES_TOTAL - SUITES_SEEN)) were never reported on"
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
