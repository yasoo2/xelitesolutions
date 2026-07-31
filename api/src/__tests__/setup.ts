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
