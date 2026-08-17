import fs from 'fs';
import os from 'os';
import path from 'path';
import { handleShellCommand } from '../modules/tools/handlers';
import { NpmManagerTool, reconcileNpmManifest, extractNpmInvalidVersionEvidence, selectStableNpmVersion, npmInstallTimeoutMs } from '../modules/tools/definitions/SystemTools';

jest.mock('../modules/tools/handlers', () => ({
    ...jest.requireActual('../modules/tools/handlers'),
    handleShellCommand: jest.fn(),
}));

const mockedHandleShellCommand = handleShellCommand as jest.MockedFunction<typeof handleShellCommand>;

describe('npm install timeout contract', () => {
    const previous = process.env.JOE_NPM_INSTALL_TIMEOUT_MS;

    afterEach(() => {
        if (previous === undefined) delete process.env.JOE_NPM_INSTALL_TIMEOUT_MS;
        else process.env.JOE_NPM_INSTALL_TIMEOUT_MS = previous;
    });

    it('allows ordinary dependency bootstraps the same five minutes as shell npm commands', () => {
        delete process.env.JOE_NPM_INSTALL_TIMEOUT_MS;
        expect(npmInstallTimeoutMs()).toBe(300_000);
    });

    it('keeps explicit npm deadlines bounded', () => {
        process.env.JOE_NPM_INSTALL_TIMEOUT_MS = '1';
        expect(npmInstallTimeoutMs()).toBe(15_000);
        process.env.JOE_NPM_INSTALL_TIMEOUT_MS = '999999';
        expect(npmInstallTimeoutMs()).toBe(600_000);
    });
});

describe('npm manifest reconciliation', () => {
    let root = '';

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-npm-manifest-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('removes only npm-invalid dependency keys produced from prose', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'evidence-board',
            dependencies: {
                express: '^4.18.0',
                'node:sqlite or JSON file fallback': '^5.0.2',
            },
        }));

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(true);
        expect(result.changed).toBe(true);
        expect(result.removedDependencies).toEqual(['dependencies.node:sqlite or JSON file fallback']);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        expect(manifest.dependencies).toEqual({ express: '^4.18.0' });
    });

    it('does not alter a valid manifest', () => {
        const original = {
            name: 'evidence-board',
            scripts: { start: 'node src/index.js' },
            dependencies: { express: '^4.18.0' },
        };
        fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify(original)}\n`);

        const result = reconcileNpmManifest(root);

        expect(result).toMatchObject({ ok: true, changed: false, removedDependencies: [] });
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(`${JSON.stringify(original)}\n`);
    });

    it('normalizes a deterministic uppercase local package name', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'EvidenceBoard',
            scripts: { start: 'node src/index.js' },
        }));

        const result = reconcileNpmManifest(root);

        expect(result).toMatchObject({
            ok: true,
            changed: true,
            renamedPackage: { from: 'EvidenceBoard', to: 'evidenceboard' },
        });
        expect(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name).toBe('evidenceboard');
    });

    it('slugifies a human project label before bounded dependency bootstrap', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'TaskFlow AI',
            scripts: { start: 'node src/server.js' },
            dependencies: { express: '^4.17.1' },
        }));

        const result = reconcileNpmManifest(root);

        expect(result).toMatchObject({
            ok: true,
            changed: true,
            renamedPackage: { from: 'TaskFlow AI', to: 'taskflow-ai' },
        });
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
        expect(manifest.name).toBe('taskflow-ai');
        expect(manifest.scripts.start).toBe('node src/server.js');
        expect(manifest.dependencies).toEqual({ express: '^4.17.1' });
    });

    it('blocks scripts that recursively invoke themselves instead of running npm forever', () => {
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
            name: 'evidence-board',
            scripts: {
                start: 'node src/index.js',
                build: 'npm run build',
                test: 'npm run test',
            },
        }));

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.recursiveScripts).toEqual(['build', 'test']);
        expect(result.error).toBe('recursive_npm_scripts:build,test');
    });

    it('recovers an ETARGET dependency from registry evidence and retries install', async () => {
        const projectRoot = fs.mkdtempSync(path.join(process.cwd(), '..', '.joe-npm-etarget-'));
        try {
            fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
                name: 'registry-recovery',
                dependencies: { '@scope/widget': '^4.18.0' },
            }));
            const calls: string[][] = [];
            mockedHandleShellCommand.mockImplementation(async (_command, args) => {
                calls.push(args);
                if (args[0] === 'install' && calls.filter(call => call[0] === 'install').length === 1) {
                    return {
                        ok: false,
                        error: 'npm error code ETARGET\\nnpm error notarget No matching version found for @scope/widget@^4.18.0.',
                        output: '',
                        logs: [],
                    };
                }
                if (args[0] === 'view') {
                    return {
                        ok: true,
                        output: JSON.stringify(['4.17.0', '4.19.0', '5.0.0', '5.1.0-beta.1']),
                        logs: [],
                    };
                }
                return { ok: true, output: 'install ok', logs: [] };
            });

            const result: any = await new NpmManagerTool().execute({ command: 'install', cwd: projectRoot });

            expect(result.ok).toBe(true);
            expect(calls).toEqual([
                ['install'],
                ['view', '@scope/widget', 'versions', '--json'],
                ['install'],
            ]);
            const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
            expect(manifest.dependencies['@scope/widget']).toBe('^4.19.0');
            expect(result.logs.join('\\n')).toMatch(/npm\.etarget_retry=registry-verified-version/);
        } finally {
            mockedHandleShellCommand.mockReset();
            fs.rmSync(projectRoot, { recursive: true, force: true });
        }
    });

    it('extracts only package/version evidence and rejects unrelated npm failures', () => {
        expect(extractNpmInvalidVersionEvidence('npm error code ETARGET\\nnpm error notarget No matching version found for @prisma/client@^4.18.0.')).toEqual({
            packageName: '@prisma/client',
            requestedSpec: '^4.18.0',
        });
        expect(extractNpmInvalidVersionEvidence('npm error code ERESOLVE unable to resolve dependency tree')).toBeNull();
        expect(selectStableNpmVersion(JSON.stringify(['4.17.0', '4.19.0', '5.0.0', '5.1.0-beta.1']), '^4.18.0')).toBe('4.19.0');
        expect(selectStableNpmVersion(JSON.stringify(['4.17.0', '4.19.0']), '^4.0.0')).toBe('4.19.0');
    });

    it('reports malformed JSON instead of rewriting it', () => {
        const malformed = '{"name":"broken",';
        fs.writeFileSync(path.join(root, 'package.json'), malformed);

        const result = reconcileNpmManifest(root);

        expect(result.ok).toBe(false);
        expect(result.changed).toBe(false);
        expect(result.error).toMatch(/^invalid_package_json:/);
        expect(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(malformed);
    });
});
