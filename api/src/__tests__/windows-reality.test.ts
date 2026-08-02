/**
 * The Windows-reality audit: Joe's pipeline runs on the user's real laptop —
 * Windows, weak CPU, slow npm. Three Linux-flavored assumptions were leaking:
 * a flat 30s shell timeout that killed npm install mid-run, an auto build
 * check aimed at the workspace ROOT instead of the generated project's dir,
 * and quoted echo markers (cmd.exe echoes the quotes literally).
 */
import fs from 'fs';
import path from 'path';

const sysTools = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8');
const phaseExec = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'PhaseExecutorTool.ts'), 'utf-8');
const selfFix = fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'services', 'SelfFixService.ts'), 'utf-8');

describe('shell timeouts match reality', () => {
    test('package managers and build tools get a long default; explicit timeouts always win', () => {
        expect(sysTools).toMatch(/isLongRunner \? 300000 : 30000/);
        expect(sysTools).toMatch(/input\?\.timeout \?\? \(isLongRunner/);
        expect(sysTools).toMatch(/npm\|npx\|yarn\|pnpm/);
    });

    test('the long-runner detector catches compound commands too (install && build)', () => {
        const re = /&&\s*\(npm\|npx\|yarn\|pnpm\)/;
        expect(sysTools).toMatch(/&&\\s\*\(npm\|npx\|yarn\|pnpm\)/);
    });
});

describe('the auto build check is honest about WHERE and WHETHER', () => {
    test('it derives the project dir from the plan-written package.json', () => {
        expect(phaseExec).toMatch(/package\\\.json/);
        expect(phaseExec).toMatch(/projectDir \? \{ cwd: projectDir \} : \{\}/);
    });

    test('no package.json written → honest skip, not a fake failure', () => {
        expect(phaseExec).toMatch(/skipped honestly/);
    });

    test('missing build script is not a failure (--if-present), and the echo marker is unquoted for cmd.exe', () => {
        expect(phaseExec).toMatch(/npm run --if-present build/);
        expect(phaseExec).toMatch(/\|\| echo BUILD_CHECK_FAILED/);
        expect(phaseExec).not.toMatch(/echo "BUILD_CHECK_FAILED"/);
    });
});

describe('dependency self-fix survives a weak machine', () => {
    test('long timeout, no audit noise, optional build script', () => {
        expect(selfFix).toMatch(/npm install --no-audit --no-fund && npm run --if-present build/);
        expect(selfFix).toMatch(/timeout: 600000/);
    });
});
