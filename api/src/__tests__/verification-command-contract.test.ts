import { isVerificationTool } from '../core/quality/verification-ledger';

describe('conservative executable verification commands', () => {
    test.each([
        'echo jest', 'echo npm test', 'npm test && node deploy.js',
        'npm test; echo done', 'npm test || echo success', 'npm test | cat',
        'npm test > result.txt', 'npm test &', 'npm test\nnode deploy.js',
        'npm run --if-present test', 'npx jest --passWithNoTests', 'npx jest --listTests',
        'npx jest --help', 'node -e "console.log(\'test\')"',
        'node check.js', 'npm test $(node deploy.js)', 'npx eslint --fix .',
        'npm test -- --watch', 'npx playwright install',
        'tsc --init', 'tsc --build --clean', 'jest --clearCache',
        'eslint --print-config src/index.ts', 'jest --unknown-mode',
        'node --test --require ./stateful.js', 'npx playwright test --ui',
    ])('does not certify ambiguous or non-check command: %s', command => {
        expect(isVerificationTool('shell_execute', { command }, true)).toBe(false);
    });
    test.each([
        'npm test', 'npm run test:unit', 'npm run guard:architecture',
        'pnpm run typecheck', 'yarn lint', 'node --test smoke.test.js check.js',
        'npx jest --runInBand src/check.test.ts', 'npx tsc --noEmit',
        'npx vitest run', 'npx playwright test', 'npx eslint src',
    ])('recognizes an explicit verification invocation: %s', command => {
        expect(isVerificationTool('shell_execute', { command })).toBe(true);
    });
});
