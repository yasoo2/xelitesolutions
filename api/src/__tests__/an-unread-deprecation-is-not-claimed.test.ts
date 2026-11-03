/**
 * Second review of round 21: when `npm view <pkg>@<version> deprecated` could
 * not be read, findReleaseProvidingBin said so in its reason — and project_run
 * told him anyway that it had installed «the newest stable, non-deprecated
 * release». The sentence was fixed text; the evidence was not consulted.
 *
 * The registry answers below are npm's own shapes (handleShellCommand is the
 * one seam every npm call goes through); what is checked is what the release
 * choice and npm_manager hand to the sentence he reads.
 */
import fs from 'fs';
import path from 'path';
import { handleShellCommand } from '../modules/tools/handlers';
import { findReleaseProvidingBin, NpmManagerTool } from '../modules/tools/definitions/SystemTools';

jest.mock('../modules/tools/handlers', () => ({
    ...jest.requireActual('../modules/tools/handlers'),
    handleShellCommand: jest.fn(),
}));
const mocked = handleShellCommand as jest.MockedFunction<typeof handleShellCommand>;

/** 2.0.0 ships the program; whether it is deprecated is answered by `deprecated`. */
function registry(deprecated: { ok: boolean; output?: string; error?: string }) {
    mocked.mockImplementation(async (_command, args) => {
        if (args[0] === 'view' && args[2] === 'versions') return { ok: true, output: JSON.stringify(['1.4.0', '2.0.0']), logs: [] };
        if (args[0] === 'view' && args[2] === 'bin') return { ok: true, output: args[1] === 'joe-fixture-cli@2.0.0' ? JSON.stringify({ fixture: 'cli.js' }) : '', logs: [] };
        if (args[0] === 'view' && args[2] === 'deprecated') return { ...deprecated, logs: [] } as any;
        return { ok: true, output: 'added 1 package', logs: [] };
    });
}

describe('an unread deprecation is not claimed', () => {
    let projectRoot = '';
    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(process.cwd(), '..', '.joe-r22-server-npm-'));
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'landing', version: '1.0.0' }));
    });
    afterEach(() => {
        mocked.mockReset();
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    it('a release whose deprecation could not be read is chosen as unknown, not as non-deprecated', async () => {
        registry({ ok: false, error: 'npm view timed out after 60000ms' });
        const result = await findReleaseProvidingBin(projectRoot, 'joe-fixture-cli', 'fixture', 60_000);
        expect(result.version).toBe('2.0.0');
        expect(result.deprecationKnown).toBe(false);
        expect(result.reason).toBe('joe-fixture-cli@2.0.0 (major 2) is the newest stable release that declares "fixture" (its deprecation status could not be read)');
    });

    it('a release the registry says is not deprecated is known to be so', async () => {
        registry({ ok: true, output: '' });
        const result = await findReleaseProvidingBin(projectRoot, 'joe-fixture-cli', 'fixture', 60_000);
        expect(result.deprecationKnown).toBe(true);
        expect(result.reason).toContain('is the newest stable, non-deprecated release');
    });

    it('npm_manager hands that knowledge to the line he reads', async () => {
        registry({ ok: false, error: 'npm view timed out after 60000ms' });
        const result: any = await new NpmManagerTool().execute({
            command: 'install', packages: ['joe-fixture-cli'], dev: true, cwd: projectRoot, providesBin: 'fixture',
        });
        expect(result.ok).toBe(true);
        expect(result.output.binProvider).toMatchObject({ version: '2.0.0', major: 2, deprecationKnown: false });
    });
});
