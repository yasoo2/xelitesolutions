/**
 * «npm error could not determine executable to run» — AND THE HEALER STOPPED.
 *
 * P001-landing-ar (run500, run-1792978079710). Phase 2 of the plan ran
 *
 *     npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p
 *
 * The registry's latest was tailwindcss@4.3.3, whose manifest declares no
 * executable at all, so npx could not run it — while the plan's own next
 * files (tailwind.config.js, the @tailwind directives) were written for the
 * release that had one. No file was named, so self-fix answered "General
 * phase failure has no evidence-bound repair file" and the build ended 1/5.
 *
 * The class: a plan calls `npx <tool>` and the release the install fetched no
 * longer ships that executable. The evidence is on disk (the installed
 * manifest's `bin`) and in the registry (which release declares it). The cure
 * installs the newest release whose manifest declares the executable, and the
 * phase is rerun; nothing is guessed from a catalogue of package names.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { handleShellCommand } from '../modules/tools/handlers';
import { NpmManagerTool } from '../modules/tools/definitions/SystemTools';
import { SelfFixService } from '../modules/services/SelfFixService';
import { RepairTicketService } from '../modules/services/RepairTicketService';

jest.mock('../modules/tools/handlers', () => ({
    ...jest.requireActual('../modules/tools/handlers'),
    handleShellCommand: jest.fn(),
}));

const mockedHandleShellCommand = handleShellCommand as jest.MockedFunction<typeof handleShellCommand>;

// The words npm printed in P001, warnings first, exactly as the task error held them.
const P001_ERROR = [
    'npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:',
    'npm warn allow-scripts   esbuild@0.21.5 (install: (install scripts present))',
    'npm warn allow-scripts',
    'npm warn allow-scripts Run `npm approve-scripts --allow-scripts-pending` to review, or `npm approve-scripts <pkg>` to allow.',
    'npm error could not determine executable to run',
].join('\n');

function makeProject(parent: string, installedManifest: Record<string, unknown>, declared: Record<string, unknown>) {
    const root = path.join(parent, 'dental-clinic-landing');
    fs.mkdirSync(path.join(root, 'node_modules', 'tailwindcss'), { recursive: true });
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'dental-clinic-landing', ...declared }));
    fs.writeFileSync(path.join(root, 'node_modules', 'tailwindcss', 'package.json'), JSON.stringify({ name: 'tailwindcss', ...installedManifest }));
    return root;
}

function ticketFor(command: string, cwd: string) {
    return RepairTicketService.build({
        phase: { phaseNumber: 2, name: 'UI Polish & Mobile Responsiveness' },
        phaseResult: {
            ok: false,
            error: P001_ERROR,
            output: {
                status: 'partial',
                results: [{ task: 'Install Tailwind CSS and configure it', tool: 'shell_execute', ok: false, error: P001_ERROR, args: { command, cwd } }],
            },
        },
        projectName: 'dental-clinic-landing',
    } as any);
}

const P001_COMMAND = 'npm install -D tailwindcss postcss autoprefixer && npx tailwindcss init -p';

describe('an executable the installed release no longer ships', () => {
    let workspace = '';

    beforeEach(() => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-npx-bin-'));
    });

    afterEach(() => {
        fs.rmSync(workspace, { recursive: true, force: true });
    });

    it('is repaired by installing the release that declares it, not stopped for want of a file (P001)', () => {
        const root = makeProject(workspace, { version: '4.3.3' }, { devDependencies: { tailwindcss: '^4.3.3' } });

        const plan = SelfFixService.plan(ticketFor(P001_COMMAND, root));

        expect(plan.allowed).toBe(true);
        expect(plan.strategy).toBe('dependency_fix');
        expect(plan.suggestedTool).toBe('npm_manager');
        expect(plan.suggestedInput).toEqual({
            command: 'install',
            packages: ['tailwindcss'],
            dev: true,
            cwd: path.resolve(root),
            providesBin: 'tailwindcss',
        });
        expect(plan.reason).toContain('tailwindcss@4.3.3 declares no "tailwindcss" executable');
    });

    it("follows the plan's own cd into the project, and never out of the recorded cwd", () => {
        const root = makeProject(workspace, { version: '4.3.3' }, { dependencies: { tailwindcss: '^4.3.3' } });

        const plan = SelfFixService.plan(ticketFor(`cd dental-clinic-landing && ${P001_COMMAND}`, workspace));
        expect(plan.suggestedInput).toMatchObject({ cwd: path.resolve(root), dev: false, providesBin: 'tailwindcss' });

        // `cd ..` climbs out of the recorded cwd: not followed, so nothing installed is found there.
        const escaped = SelfFixService.plan(ticketFor(`cd .. && cd ${path.basename(workspace)} && ${P001_COMMAND}`, root));
        expect(escaped.suggestedInput).toMatchObject({ cwd: path.resolve(root) });
    });

    it('is not this failure when the installed release does declare the executable', () => {
        const root = makeProject(workspace, { version: '3.4.19', bin: { tailwind: 'lib/cli.js', tailwindcss: 'lib/cli.js' } }, { devDependencies: { tailwindcss: '^3.4.19' } });

        const plan = SelfFixService.plan(ticketFor(P001_COMMAND, root));

        expect(plan.suggestedInput?.providesBin).toBeUndefined();
    });

    it('does not pin a package the project never declared', () => {
        const root = makeProject(workspace, { version: '4.3.3' }, { devDependencies: { vite: '^5.0.0' } });

        const plan = SelfFixService.plan(ticketFor(P001_COMMAND, root));

        expect(plan.suggestedInput?.providesBin).toBeUndefined();
    });
});

describe('npm_manager installs the release whose manifest declares the executable', () => {
    let projectRoot = '';

    beforeEach(() => {
        projectRoot = fs.mkdtempSync(path.join(process.cwd(), '..', '.joe-npm-bin-'));
        fs.writeFileSync(path.join(projectRoot, 'package.json'), JSON.stringify({
            name: 'dental-clinic-landing',
            devDependencies: { tailwindcss: '^4.3.3' },
        }));
    });

    afterEach(() => {
        mockedHandleShellCommand.mockReset();
        fs.rmSync(projectRoot, { recursive: true, force: true });
    });

    function registry(binByVersion: Record<string, string>) {
        const calls: string[][] = [];
        mockedHandleShellCommand.mockImplementation(async (_command, args) => {
            calls.push(args);
            if (args[0] === 'view' && args[2] === 'versions') {
                return { ok: true, output: JSON.stringify(['3.4.17', '3.4.19', '4.0.0', '4.3.3', '4.3.4-beta.1']), logs: [] };
            }
            if (args[0] === 'view' && args[2] === 'bin') {
                return { ok: true, output: binByVersion[args[1]] || '', logs: [] };
            }
            // Not deprecated: npm prints nothing.
            if (args[0] === 'view' && args[2] === 'deprecated') return { ok: true, output: '', logs: [] };
            return { ok: true, output: 'install ok', logs: [] };
        });
        return calls;
    }

    it('probes the newest release of each major, newest first, and pins the first that declares it', async () => {
        const calls = registry({ 'tailwindcss@3.4.19': JSON.stringify({ tailwind: 'lib/cli.js', tailwindcss: 'lib/cli.js' }) });

        const result: any = await new NpmManagerTool().execute({
            command: 'install', packages: ['tailwindcss'], dev: true, cwd: projectRoot, providesBin: 'tailwindcss',
        });

        expect(result.ok).toBe(true);
        expect(calls.slice(0, 5)).toEqual([
            ['view', 'tailwindcss', 'versions', '--json'],
            ['view', 'tailwindcss@4.3.3', 'bin', '--json'],
            ['view', 'tailwindcss@3.4.19', 'bin', '--json'],
            ['view', 'tailwindcss@3.4.19', 'deprecated', '--json'],
            ['install', 'tailwindcss@^3.4.19', '-D'],
        ]);
        expect(result.logs.join('\n')).toContain('npm.bin_provider=tailwindcss@^3.4.19 declares tailwindcss');
        // The chosen major is said, not left to be inferred from a version string.
        const reason = 'tailwindcss@3.4.19 (major 3) is the newest stable, non-deprecated release that declares "tailwindcss"; 4.3.3 declares no "tailwindcss"';
        expect(result.logs.join('\n')).toContain(reason);
        expect(result.output.binProvider).toEqual({ version: '3.4.19', major: 3, reason, deprecationKnown: true, skippedDeprecated: [] });
    });

    it('installs nothing when no published release declares it', async () => {
        const calls = registry({});

        const result: any = await new NpmManagerTool().execute({
            command: 'install', packages: ['tailwindcss'], dev: true, cwd: projectRoot, providesBin: 'tailwindcss',
        });

        expect(result.ok).toBe(false);
        expect(result.error).toBe('npm_no_release_declares_executable:tailwindcss:tailwindcss');
        expect(calls.some(call => call[0] === 'install')).toBe(false);
    });

    it('an ordinary install is untouched', async () => {
        const calls = registry({});

        const result: any = await new NpmManagerTool().execute({ command: 'install', packages: ['tailwindcss'], dev: true, cwd: projectRoot });

        expect(result.ok).toBe(true);
        expect(calls[0]).toEqual(['install', 'tailwindcss', '-D']);
        expect(calls.some(call => call[0] === 'view')).toBe(false);
    });
});
