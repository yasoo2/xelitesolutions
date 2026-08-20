/**
 * The env panel's second design: the whole file in one table, custom names
 * behind a narrow gate, and deletion as a first-class edit. These pins hold
 * the three promises that make a free key field survivable:
 *   1. process-steering names are refused BY NAME, forever;
 *   2. a name that announces a credential is served masked and write-only;
 *   3. reading and removing keys never touches comments or other lines.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    customKeyProblem,
    validateCustomValue,
    isSecretLikeName,
    FORBIDDEN_CUSTOM_KEYS,
} from '../core/config/envRegistry';

describe('custom env keys face the narrow gate', () => {
    test('a well-shaped application name passes', () => {
        expect(customKeyProblem('STRIPE_WEBHOOK_URL')).toBeNull();
        expect(customKeyProblem('MY_FLAG_2')).toBeNull();
    });

    test('process-steering names are refused by name', () => {
        for (const key of ['NODE_OPTIONS', 'LD_PRELOAD', 'PATH', 'PYTHONPATH', 'JOE_UPDATE_SCRIPT', 'GIT_SSH_COMMAND']) {
            expect(FORBIDDEN_CUSTOM_KEYS.has(key)).toBe(true);
            expect(customKeyProblem(key)).toMatch(/يوجّه/);
        }
    });

    test('malformed names are refused by shape', () => {
        for (const key of ['lowercase', '1STARTS_WITH_DIGIT', 'HAS SPACE', 'HAS-DASH', '', 'A'.repeat(66)]) {
            expect(customKeyProblem(key)).not.toBeNull();
        }
    });

    test('values refuse the newline injection and the oversize blob', () => {
        expect(validateCustomValue('plain value with spaces')).toBeNull();
        expect(validateCustomValue('two\nlines')).toMatch(/سطراً/);
        expect(validateCustomValue('x'.repeat(2001))).toMatch(/أطول/);
    });

    test('a credential-announcing name is treated as a secret', () => {
        for (const key of ['STRIPE_API_KEY', 'WEBHOOK_SECRET', 'MY_TOKEN', 'DB_PASSWORD', 'GITHUB_PAT', 'PRIVATE_SIGNING_SEED']) {
            expect(isSecretLikeName(key)).toBe(true);
        }
        for (const key of ['STRIPE_WEBHOOK_URL', 'FEATURE_FLAG', 'REGION', 'MONKEY_COUNT']) {
            expect(isSecretLikeName(key)).toBe(false);
        }
    });
});

describe('the .env file is read and pruned without collateral damage', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'envfile-'));
    const cwdBefore = process.cwd();
    let envFile: typeof import('../core/config/envFile');

    beforeAll(() => {
        process.chdir(dir);
        jest.resetModules();
        envFile = require('../core/config/envFile');
    });
    afterAll(() => {
        process.chdir(cwdBefore);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    test('readEnvEntries parses assignments, honors quoting, skips comments', () => {
        fs.writeFileSync(path.join(dir, '.env'), [
            '# a comment the panel must never touch',
            'PLAIN=hello',
            'QUOTED="a value with spaces"',
            "SINGLE='keep #this'",
            'TRAILING=value # trailing comment',
            '# DISABLED=not-active',
            'PLAIN=overridden',
            '',
        ].join('\n'));
        const entries = envFile.readEnvEntries();
        const byKey = Object.fromEntries(entries.map(e => [e.key, e.value]));
        expect(byKey.PLAIN).toBe('overridden');           // last assignment wins, like dotenv
        expect(byKey.QUOTED).toBe('a value with spaces');
        expect(byKey.SINGLE).toBe('keep #this');
        expect(byKey.TRAILING).toBe('value');
        expect(byKey.DISABLED).toBeUndefined();
    });

    test('removeEnvKeys deletes only the named assignments and keeps a backup', () => {
        const file = path.join(dir, '.env');
        fs.writeFileSync(file, ['# heading', 'KEEP=1', 'DROP=2', 'ALSO_KEEP=3'].join('\n'));
        const result = envFile.removeEnvKeys(['DROP', 'NEVER_EXISTED']);
        expect(result.removed).toEqual(['DROP']);
        expect(result.backup).toBeTruthy();
        const after = fs.readFileSync(file, 'utf-8');
        expect(after).toContain('# heading');
        expect(after).toContain('KEEP=1');
        expect(after).toContain('ALSO_KEEP=3');
        expect(after).not.toContain('DROP=2');
        expect(fs.readFileSync(String(result.backup), 'utf-8')).toContain('DROP=2');
    });

    test('removing a key that is not there changes nothing and makes no backup', () => {
        const file = path.join(dir, '.env');
        fs.writeFileSync(file, 'ONLY=1');
        const result = envFile.removeEnvKeys(['GHOST']);
        expect(result.removed).toEqual([]);
        expect(result.backup).toBeNull();
        expect(fs.readFileSync(file, 'utf-8')).toBe('ONLY=1');
    });
});
