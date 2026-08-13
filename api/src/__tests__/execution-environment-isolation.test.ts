import fs from 'fs';
import path from 'path';
import { executionEngine } from '../kernel/ExecutionEngine';

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'kernel', 'ExecutionEngine.ts'), 'utf8');

describe('execution environment isolation', () => {
    it('does not leak an inherited npm installation target into a spawned command', async () => {
        const script = [
            "const own = Object.prototype.hasOwnProperty.call(process.env, 'npm_config_prefix');",
            "const cache = Object.prototype.hasOwnProperty.call(process.env, 'npm_config_cache');",
            'process.stdout.write(JSON.stringify({ own, cache }));',
        ].join(' ');

        const result = await executionEngine.runArgv(process.execPath, ['-e', script], {
            env: {
                npm_config_prefix: '/poisoned/api-prefix',
                NPM_CONFIG_CACHE: '/poisoned/cache',
            },
            timeout: 10_000,
        });

        expect(result.ok).toBe(true);
        expect(JSON.parse(String(result.output))).toEqual({ own: false, cache: false });
    });

    it('uses the same sanitizer after all environment merges and in every spawn route', () => {
        expect(engineSource).toContain('function isolatedExecutionEnv');
        expect(engineSource).toContain('/^npm_config_(prefix|cache)$/i');
        expect(engineSource.match(/env: isolatedExecutionEnv\((?:options|rest)\.env\)/g)?.length).toBeGreaterThanOrEqual(5);
        expect(engineSource).toContain('env: { ...isolatedExecutionEnv(options.env), TERM:');
    });
});
