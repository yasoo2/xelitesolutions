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
#  aggregate rather than its tail. It runs the same checks `.github/ci.yml`
#  declares, in the same order, and answers in numbers that can be copied
#  into a report as they stand.
#
#      bash scripts/gate.sh
#
#  Every number it prints carries the command that produced it. Nothing here
#  interprets a result: a failing step keeps its own exit code, and the last
#  line is the whole verdict.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HEAP="${GATE_NODE_HEAP:-4096}"

say() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

# ---------------------------------------------------------------- 1. deps
say "dependencies"
if [ ! -d "$ROOT/api/node_modules" ]; then
    echo "$ npm --prefix api ci --no-audit --no-fund"
    npm --prefix "$ROOT/api" ci --no-audit --no-fund || npm --prefix "$ROOT/api" install --no-audit --no-fund
else
    echo "api/node_modules present — skipping install"
fi

# ---------------------------------------------------------------- 2. types
say "type-check — api"
echo "$ npx tsc --noEmit"
( cd "$ROOT/api" && npx tsc --noEmit )
TSC_EXIT=$?
echo "GATE_TSC_EXIT:$TSC_EXIT"

# ------------------------------------------------------------- 3. web build
#
#  `joe-ui-shell.test.ts` asserts that web/dist/index.html exists, because a
#  server with nothing to serve is a real failure in production. In a fresh
#  clone it is also the state before anyone has built anything, so the suite
#  would open on a red that says nothing about the change under test. CI
#  builds the web bundle before running the suite; so does this.
#
say "web bundle"
if [ ! -f "$ROOT/web/dist/index.html" ]; then
    [ -d "$ROOT/web/node_modules" ] || npm --prefix "$ROOT/web" ci --no-audit --no-fund || npm --prefix "$ROOT/web" install --no-audit --no-fund
    echo "$ npm --prefix web run build"
    npm --prefix "$ROOT/web" run build
    echo "GATE_WEB_BUILD_EXIT:$?"
else
    echo "web/dist/index.html present — skipping build"
fi

# ---------------------------------------------------------------- 4. suite
say "jest — the whole suite"
JEST_LOG="$(mktemp -t joe-gate-jest.XXXXXX)"
echo "$ NODE_OPTIONS=--max-old-space-size=$HEAP npx jest"
( cd "$ROOT/api" && NODE_OPTIONS="--max-old-space-size=$HEAP" npx jest "$@" 2>&1 | tee "$JEST_LOG" | grep -E '^(PASS|FAIL|Tests:|Test Suites:)' )
JEST_EXIT=${PIPESTATUS[0]}
echo "GATE_JEST_EXIT:$JEST_EXIT"

# -------------------------------------------------------------- 5. verdict
#
#  THE TAIL IS NOT THE TOTAL. Jest's own summary already aggregates a single
#  run, so it is quoted here verbatim rather than recomputed — and the suite
#  count IS the covered-file count, which is the number that separates «zero
#  failures» from «zero tests ran».
#
say "verdict"
grep -E '^(Test Suites|Tests):' "$JEST_LOG" || echo "no jest summary — the run produced none, which is itself the finding"
echo "GATE_TSC_EXIT:$TSC_EXIT"
echo "GATE_JEST_EXIT:$JEST_EXIT"
echo "jest log kept at: $JEST_LOG"

if [ "$TSC_EXIT" -eq 0 ] && [ "$JEST_EXIT" -eq 0 ]; then
    echo "GATE:PASS"
    exit 0
fi
echo "GATE:FAIL"
exit 1
