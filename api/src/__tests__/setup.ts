/**
 * Environment the suite needs before any module is imported.
 *
 * shared/config throws on import when JWT_SECRET is missing — which is correct
 * for the server and fatal for a test run, so it is set here rather than in
 * every test file. Nothing else is faked: the modules under test read real
 * files, do real maths, and are given real inputs.
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-only-secret-not-used-anywhere-else';
process.env.PERSISTENCE_MODE = 'JSON';
process.env.MOCK_DB = 'true';
process.env.NODE_ENV = 'test';

/**
 * THE SUITE WAS READING THE DEVELOPER'S REAL BUSINESS PROFILE.
 *
 * `business-profile` stores to `data/db/business-profile.json` under the
 * process's cwd, which for `npm test` is this package — the same file Joe
 * writes when the owner says «احفظ بيانات عملي». So every test that scaffolds
 * a site silently inherited whatever business happened to be saved on the
 * machine, and a suite could pass on one laptop and fail on another for a
 * reason found nowhere in the diff.
 *
 * It surfaced the honest way: a fix to the profile parser made a stored
 * profile richer — an address was extracted where the whole sentence used to
 * be swallowed into the brand — and «a location is never advertised without a
 * real saved address» went red. The assertion was right, the behaviour was
 * right, and the test was reading a file it had no business reading.
 *
 * Each run now gets its own empty store. Tests that WANT a profile write one
 * through the module's own API, into this directory, and it goes away with the
 * process.
 */
if (!process.env.JOE_CHAT_STORE_DIR) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os'), fsx = require('fs'), p = require('path');
    process.env.JOE_CHAT_STORE_DIR = fsx.mkdtempSync(p.join(os.tmpdir(), 'joe-test-store-'));
}

/**
 * …AND THE SAME DISEASE ONE DIRECTORY UP.
 *
 * `data/` under the cwd also holds what the LLM router LEARNED on this machine:
 * `llm7-blocked.json` records every model the gateway refused. In a sandbox
 * with no gateway that file grows to cover the entire preferred list — and the
 * provider's candidate list then comes back EMPTY, so three resilience tests
 * failed with «unknown error» on a machine that had once run live, and passed
 * on a fresh checkout.
 *
 * The rule is the same one the profile taught: a unit test reads its own
 * inputs, never the operator's history.
 */
if (!process.env.JOE_DATA_DIR) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const os = require('os'), fsx = require('fs'), p = require('path');
    process.env.JOE_DATA_DIR = fsx.mkdtempSync(p.join(os.tmpdir(), 'joe-test-data-'));
}

/**
 * Importing the router pulls in every LLM provider, and each one announces at
 * construction that it has no API key. That is correct behaviour and expected
 * here, but a run that prints warnings trains everyone to ignore the output —
 * so exactly those lines are dropped and nothing else is. A real warning from
 * code under test still reaches the console.
 */
const EXPECTED_AT_IMPORT = /^\[[A-Za-z]+\].*(No (valid )?API key|Provider initialized|not configured)/;
for (const level of ['warn', 'info', 'log'] as const) {
    const real = console[level].bind(console);
    console[level] = (...args: any[]) => {
        if (typeof args[0] === 'string' && EXPECTED_AT_IMPORT.test(args[0])) return;
        real(...args);
    };
}

// A unit test that reaches the network is a broken unit test. Fail loudly
// instead of hanging or, worse, quietly depending on somebody's connection.
const realFetch = global.fetch;
(global as any).fetch = (...args: any[]) => {
    const url = String(args[0] ?? '');
    throw new Error(
        `The test suite made a network request to ${url}. Unit tests must not use the network — ` +
        `stub the source, or move the check to a manual script under src/tests.`,
    );
};
(global as any).__realFetch = realFetch;
