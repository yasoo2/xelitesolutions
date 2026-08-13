/**
 * Jest was in devDependencies for a long time with no config and no test script,
 * and the single test file that existed imported a directory layout that had not
 * existed for months — it would have failed on its first import if anything had
 * ever run it.
 *
 * This config runs the real suite. It is deliberately narrow: unit tests over
 * deterministic modules, no network, no browser, no LLM. The things that need a
 * browser (visual audit, behaviour audit) or a provider are exercised by the
 * manual scripts under src/tests, which is where they belong — a test that needs
 * Chromium and an API key is not a test that can gate a commit.
 */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    rootDir: 'src',
    testMatch: ['**/__tests__/**/*.test.ts'],
    setupFiles: ['<rootDir>/__tests__/setup.ts'],
    // Closes the shared OCR worker after the last test. Without it the run
    // ends on «a worker process has failed to exit gracefully», which is a
    // warning people learn to scroll past — and a known leak that is always
    // there hides the next one, which will not be known.
    globalTeardown: '<rootDir>/__tests__/teardown.ts',
    // The suite must not reach the network. Anything that tries is a bug in the
    // test, not a flaky environment.
    testTimeout: 10000,
    clearMocks: true,
    collectCoverageFrom: [
        'core/design/**/*.ts',
        'core/quality/**/*.ts',
        'core/orchestrator/promptNormalizer.ts',
        'modules/tools/utils.ts',
    ],
    transform: {
        // The production build is esbuild with no type-checking, so making the
        // tests type-check as well would fail on unrelated files. Tests are
        // checked by `npx tsc --noEmit` like everything else.
        '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
    },
};
