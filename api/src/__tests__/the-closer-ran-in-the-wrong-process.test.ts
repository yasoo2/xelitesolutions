/**
 * THE CLOSER WAS WRITTEN FOR THE RIGHT DEFECT AND INSTALLED IN THE WRONG PROCESS.
 *
 * The cost was not a warning anybody could scroll past. The canonical gate
 * reached batch 31 of 32 and stopped — no summary, no verdict, no exit code —
 * and stayed there until it was killed. Twelve files ran alone to find the one
 * that never returned:
 *
 *     vision EXIT:124        (the other eleven: EXIT:0)
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
 * ⛔ `createWorker` DID NOT HANG. All fifteen tests passed first, and a
 * timestamped marker put the worker ready 258 ms after entry. It is a live
 * worker thread after the last assertion — precisely what `teardown.ts` says
 * it exists to prevent, and it says so in its own header.
 *
 * The reason it did not prevent it: `globalTeardown` runs in jest's MAIN
 * process. `shared/ocr.ts` keeps its worker in a module-level singleton, and a
 * test file runs in a WORKER process with its own module registry. So teardown
 * asked the main process to close a worker the main process never created. It
 * found nothing, closed nothing, and returned cleanly.
 *
 * ⛔ AND THE CLASS IS WIDER THAN OCR, in three widening steps:
 *
 *   1. created in a test process, closed in the main one
 *   2. any cleanup registered at a scope that does not contain the resource
 *   3. a handler that exists and is never reached — the same shape as a
 *      stand-down printed to a terminal nobody opens, and as `dead_controls`
 *      reaching a repair door that admits only style ids
 *
 * `--forceExit` would also have made the symptom go away, and would have taken
 * every future leak with it.
 */

import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, ...p), 'utf-8');
const CONFIG = fs.readFileSync(path.join(__dirname, '..', '..', 'jest.config.js'), 'utf-8');
const AFTER_ENV = read('afterEnv.ts');
const TEARDOWN = read('teardown.ts');

describe('what a test process opens, a test process closes', () => {
    it('⛔ POSITIVE — the hook is registered where the singleton lives', () => {
        //  setupFilesAfterEnv runs INSIDE each test process, after the test
        //  framework is installed, so `afterAll` exists and the module it
        //  reaches is the one that was actually created.
        expect(CONFIG).toContain("setupFilesAfterEnv: ['<rootDir>/__tests__/afterEnv.ts']");
        expect(AFTER_ENV).toContain('afterAll(');
        expect(AFTER_ENV).toContain("require('../shared/ocr').shutdownOcr()");
    });

    it('⛔ POSITIVE — and it is awaited, or the process exits before the close lands', () => {
        //  `afterAll(async () => { await … })`. Firing and forgetting would
        //  leave exactly the handle this exists to release.
        expect(AFTER_ENV).toMatch(/afterAll\(async \(\) => \{[\s\S]*await require\('\.\.\/shared\/ocr'\)\.shutdownOcr\(\)/);
    });

    it('⛔ NEGATIVE — a process that never opened the reader is not broken by it', () => {
        //  Most test files never touch OCR. Requiring the module there would
        //  CREATE the singleton this hook exists to destroy, and a cleanup that
        //  allocates is worse than none.
        expect(AFTER_ENV).toContain('catch { /* the reader was never opened in this process */ }');
    });

    it('⛔ NEGATIVE — --forceExit is still refused, everywhere', () => {
        //  It would hide this leak and every future one. `teardown.ts` says so
        //  in its own words and the config must agree with it.
        expect(CONFIG).not.toContain('forceExit');
        expect(TEARDOWN).toContain('`--forceExit` would also make the warning go away');
    });

    it('⛔ NEGATIVE — the global teardown is kept, not replaced', () => {
        //  It still owns the temporary root, and it is still correct for a
        //  singleton that the main process really did create. The repair adds
        //  a scope; it does not move the responsibility.
        expect(CONFIG).toContain("globalTeardown: '<rootDir>/__tests__/teardown.ts'");
        expect(TEARDOWN).toContain('shutdownOcr');
    });
});
