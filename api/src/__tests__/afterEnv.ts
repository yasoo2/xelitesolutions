/**
 * CLOSE IT IN THE PROCESS THAT OPENED IT.
 *
 * `globalTeardown` already calls `shutdownOcr()`. It runs in jest's MAIN
 * process. `shared/ocr.ts` keeps its tesseract worker in a module-level
 * singleton, and a test file runs in a WORKER process with its own module
 * registry — so teardown asks the main process to close a worker the main
 * process never created. It finds nothing, closes nothing, returns cleanly,
 * and the child stays alive holding a MESSAGEPORT.
 *
 * ⛔ THE CLOSER WAS WRITTEN FOR THE RIGHT DEFECT AND INSTALLED IN THE WRONG
 * PROCESS — and the cost was not a warning. The canonical gate stalled at
 * batch 31 of 32 with no summary, no verdict and no exit code, and stayed
 * that way until it was killed. Measured, on the tree:
 *
 *     $ npx jest src/__tests__/vision.test.ts
 *     Tests: 15 passed, 15 total
 *     Jest did not exit one second after the test run has completed.
 *
 *     $ npx jest src/__tests__/vision.test.ts --detectOpenHandles
 *     ●  WORKER,MESSAGEPORT
 *        at createWorker  (shared/ocr.ts:81)
 *        at spawnWorker   (tesseract.js/src/worker/node/spawnWorker.js:12)
 *
 * `createWorker` did NOT hang — all fifteen tests passed first, and a
 * timestamped marker put the worker ready 258 ms after entry. It is a live
 * worker after the last assertion, which is exactly what `teardown.ts` says it
 * exists to prevent.
 *
 * `setupFilesAfterEnv` runs INSIDE each test process, after the test framework
 * is installed, so `afterAll` is available and the singleton it reaches is the
 * one that was actually created. `--forceExit` would also make the symptom go
 * away, and would take every future leak with it.
 *
 * ⛔ AND THE CLASS IS BIGGER THAN OCR: **what else is created in a test process
 * and closed in the main one?** `globalTeardown` believes it closes exactly one
 * resource today; every worker, browser or socket added later has the same gap
 * by construction.
 */

afterAll(async () => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        await require('../shared/ocr').shutdownOcr();
    } catch { /* the reader was never opened in this process */ }
});
