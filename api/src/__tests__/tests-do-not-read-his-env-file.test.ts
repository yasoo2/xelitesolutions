import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * 2026-10-22: scoped-planning-prompt passed in the gate and failed 4 tests on
 * the owner's machine at the SAME commit — shared/config.ts loaded his
 * api/.env (LLM_PROVIDER=local, OFFLINE_MODE=true, LOCAL_LLM_*) into Jest.
 * A test's verdict must not depend on whose machine runs it.
 */
describe('tests do not read the developer env file', () => {
    it('importing the config under Jest leaves a .env in the working directory unread', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-env-'));
        fs.writeFileSync(path.join(dir, '.env'), 'JOE_ENV_LEAK_SENTINEL=leaked\nLLM_PROVIDER=local\n');
        const cwd = process.cwd();
        const before = process.env.LLM_PROVIDER;
        try {
            process.chdir(dir);
            jest.isolateModules(() => { require('../shared/config'); });
            expect(process.env.JOE_ENV_LEAK_SENTINEL).toBeUndefined();
            expect(process.env.LLM_PROVIDER).toBe(before);
        } finally {
            process.chdir(cwd);
            delete process.env.JOE_ENV_LEAK_SENTINEL;
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
