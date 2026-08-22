/**
 * ONE TEMPORARY ROOT FOR THE WHOLE RUN, SO THERE IS SOMETHING TO DELETE.
 *
 * `setup.ts` gives every test file its own empty store and its own empty data
 * directory, for two good reasons written out at length there: the suite was
 * reading the developer's real business profile, and it was reading the LLM
 * router's learned block-list. Both made a test pass on one laptop and fail on
 * another for a reason found nowhere in the diff.
 *
 * The isolation was right. The cleanup was never written. `setup.ts` runs once
 * per TEST FILE, and each run called `mkdtempSync` twice and removed neither —
 * measured here, exactly two directories per file:
 *
 *     $ npx jest --runTestsByPath src/__tests__/ink-on-accent-is-readable.test.ts
 *     BEFORE=5942 AFTER=5944 DELTA=2 for ONE test file
 *
 * At 228 test files that is 456 directories every full run, forever. On the
 * machine that runs this suite in batches all day it reached 28,079, and then
 * the filesystem refused to create another one:
 *
 *     EMLINK: too many links, mkdtemp '/tmp/joe-test-store-XXXXXX'
 *
 * Every one of the nineteen batches failed, with `0 total` tests. Not one
 * assertion ran, and nothing in the diff had anything to do with it.
 *
 * THE SUITE WAS BUILT TO STOP DEPENDING ON THE OPERATOR'S MACHINE, AND BECAME
 * THE LARGEST THING WRITTEN TO IT. A suite whose result depends on how many
 * times it has been run before is not reproducible, and that is the same
 * defect `setup.ts` was written to cure — carried in by the cure.
 *
 * So the run gets ONE root here, every per-file directory is made inside it,
 * and `teardown.ts` removes the root. Per-file isolation is unchanged: each
 * file still gets its own empty pair. What changes is that the run now has a
 * single thing to delete, and deletes it.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

module.exports = async function globalSetup(): Promise<void> {
    // An operator who names the root keeps it: `teardown.ts` deletes only a
    // path matching `joe-test-run-`, so a named root survives the run and its
    // contents can be read afterwards. That is how the fix above was proven —
    // an empty delta means nothing leaked only if something was created, and
    // this is what makes «created» observable without a probe inside the
    // suite. The same guard idiom as setup.ts, for the same reason.
    if (!process.env.JOE_TEST_TMP_ROOT) {
        process.env.JOE_TEST_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-test-run-'));
    }
};
