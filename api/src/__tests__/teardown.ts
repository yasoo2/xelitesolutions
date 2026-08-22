/**
 * CLOSE WHAT THE SUITE OPENED, INSTEAD OF FORCING THE PROCESS DOWN.
 *
 * Every run ended with «a worker process has failed to exit gracefully … Try
 * running with --detectOpenHandles». It is a warning people learn to scroll
 * past, and that is exactly why it matters: a known leak that is always there
 * hides the next one, which will not be known.
 *
 * The offender is the shared reader. `shared/ocr.ts` builds ONE tesseract
 * worker for the whole process and never closes it — correct for a
 * long-running server, where the reader is meant to be reused, and wrong for a
 * test run, where it is a worker THREAD still alive after the last assertion.
 *
 * So the suite closes it. `--forceExit` would also make the warning go away,
 * and would take every future leak with it.
 *
 * AND REMOVE WHAT THE SUITE WROTE TO THE MACHINE.
 *
 * `globalSetup.ts` makes one temporary root per run and every per-file store
 * and data directory is created inside it. Deleting the root here is the whole
 * cleanup — see globalSetup.ts for the 28,079 directories that made it
 * necessary, and for why the per-file isolation is kept.
 */
module.exports = async function globalTeardown(): Promise<void> {
    try {
        const { shutdownOcr } = require('../shared/ocr');
        await shutdownOcr();
    } catch { /* the reader was never opened in this run */ }

    const root = process.env.JOE_TEST_TMP_ROOT;
    // Only ever a directory this run created, and only under the system temp
    // directory: a teardown that can be pointed at an arbitrary path by an
    // environment variable is a rm -rf waiting for a typo.
    if (root && root.startsWith(require('os').tmpdir()) && /joe-test-run-/.test(root)) {
        require('fs').rmSync(root, { recursive: true, force: true });
    }
};
