#!/usr/bin/env bash
#  THE GATE, ON THE MACHINE JOE ACTUALLY RUNS ON.
#
#  `scripts/gate.sh` batches because one jest process does not survive the
#  whole suite. This batches for a second reason measured here: a single run
#  takes about nine minutes and this environment stops a command before it
#  finishes, so a whole-suite invocation never reports at all — three times in
#  a row, with the work done and the number lost.
#
#  ⛔ AND IT REFUSES TO CALL AN EMPTY RUN A PASS. A batch that printed no
#  summary contributed ZERO tests, and «0 failed» over 0 run is the shape this
#  repository has been bitten by more than any other. The file count and the
#  test count are both carried, and a shortfall fails the gate by name.
set -u
cd "$(dirname "$0")/.." || exit 1
cd api || exit 1

BATCH="${GATE_BATCH:-100}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

mapfile -t FILES < <(ls -1 src/__tests__/*.test.ts | sort)
TOTAL_FILES=${#FILES[@]}
echo "GATE_FILES:$TOTAL_FILES"

#  ⛔ Nothing on port 5002, or suites that bind it fail for a reason that has
#  nothing to do with the code. Measured: five suites red in the full run and
#  green in isolation, because Joe was listening.
if command -v netstat >/dev/null 2>&1 && netstat -ano 2>/dev/null | grep -q ":5002.*LISTENING"; then
    echo "GATE_PORT_5002:BUSY — stop Joe before gating"
    echo "GATE:FAIL"
    exit 1
fi

echo "== tsc =="
npx tsc --noEmit
TSC=$?
echo "GATE_TSC_EXIT:$TSC"

SUITES_PASS=0; SUITES_FAIL=0; TESTS_PASS=0; TESTS_FAIL=0; TESTS_SKIP=0
FILES_COVERED=0; JEST_EXIT=0; N=0

for ((i = 0; i < TOTAL_FILES; i += BATCH)); do
    N=$((N + 1))
    CHUNK=("${FILES[@]:i:BATCH}")
    LOG="$WORK/log-$N"
    printf '\n-- batch %d · %d files\n' "$N" "${#CHUNK[@]}"
    npx jest --runTestsByPath "${CHUNK[@]}" >"$LOG" 2>&1
    RC=$?
    [ "$RC" -ne 0 ] && JEST_EXIT=$RC

    SUM="$(grep -E '^Tests:' "$LOG" | tail -1)"
    SUI="$(grep -E '^Test Suites:' "$LOG" | tail -1)"
    if [ -z "$SUM" ]; then
        #  A batch that says nothing has proven nothing.
        echo "GATE_BATCH_${N}_SILENT: no summary — treating as failure"
        SUITES_FAIL=$((SUITES_FAIL + ${#CHUNK[@]}))
        JEST_EXIT=1
        continue
    fi
    echo "  $SUI"
    echo "  $SUM"
    FILES_COVERED=$((FILES_COVERED + ${#CHUNK[@]}))
    #  ⛔ AN ABSENT NUMBER IS ZERO, NOT AN EMPTY STRING.
    #
    #  «Test Suites: 140 passed, 140 total» has no «failed» in it at all, so
    #  the sed printed nothing and `$((X + ))` was a syntax error that killed
    #  the loop after one batch. The gate then reported 140 of 398 files and
    #  said GATE:FAIL with a shortfall — which is the one thing it got right,
    #  and the reason it is written this way: a run that covers less than the
    #  whole suite must never look like a pass.
    #  ⛔ AND `echo 0` AS A FALLBACK WAS ITSELF THE NEXT DEFECT. It appends a
    #  SECOND line, so a batch that really did report 140 came back as «140\n0»
    #  and the arithmetic saw two operands. The default belongs INSIDE the
    #  substitution, where an empty result becomes 0 and a real one is left
    #  alone — one value, always.
    num() {
        local n
        n="$(sed -n "s/.*[^0-9]\\([0-9]\\+\\) $1.*/\\1/p" <<<"$2" | head -1)"
        printf '%s' "${n:-0}"
    }
    SUITES_PASS=$((SUITES_PASS + $(num passed "$SUI")))
    SUITES_FAIL=$((SUITES_FAIL + $(num failed "$SUI")))
    TESTS_PASS=$((TESTS_PASS + $(num passed "$SUM")))
    TESTS_FAIL=$((TESTS_FAIL + $(num failed "$SUM")))
    TESTS_SKIP=$((TESTS_SKIP + $(num skipped "$SUM")))
    grep -E '^FAIL' "$LOG" | sed 's/^/  /'
done

echo
echo "Test Suites: ${SUITES_FAIL:-0} failed, ${SUITES_PASS:-0} passed"
echo "Tests:       ${TESTS_FAIL:-0} failed, ${TESTS_SKIP:-0} skipped, ${TESTS_PASS:-0} passed"
echo "GATE_FILES_COVERED:$FILES_COVERED of $TOTAL_FILES"
echo "GATE_TSC_EXIT:$TSC"
echo "GATE_JEST_EXIT:$JEST_EXIT"

if [ "$FILES_COVERED" -ne "$TOTAL_FILES" ]; then
    echo "GATE_SHORTFALL: $((TOTAL_FILES - FILES_COVERED)) file(s) never ran"
    echo "GATE:FAIL"; exit 1
fi
if [ "$TSC" -ne 0 ] || [ "$JEST_EXIT" -ne 0 ] || [ "${TESTS_FAIL:-0}" -ne 0 ]; then
    echo "GATE:FAIL"; exit 1
fi
echo "GATE:PASS"
