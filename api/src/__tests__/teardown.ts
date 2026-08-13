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
 */
module.exports = async function globalTeardown(): Promise<void> {
    try {
        const { shutdownOcr } = require('../shared/ocr');
        await shutdownOcr();
    } catch { /* the reader was never opened in this run */ }
};
