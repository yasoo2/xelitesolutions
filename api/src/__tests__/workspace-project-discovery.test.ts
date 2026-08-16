import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildProbeList, detectStart, isLoopbackPortOpen, launchPrerequisiteError, resolveRunnableProject } from '../modules/tools/definitions/ProjectRunTool';

describe('workspace project discovery for project_run', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-workspace-'));
        for (const name of ['react-لوحة-مهامي', 'react-لوحة-مهامي-d0bb', 'react-مدار-الحجوزات']) {
            const dir = path.join(root, name);
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
        }
    });

    afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

    it('selects the stable named project rather than a generated retry copy', () => {
        const result = resolveRunnableProject(root, 'شغّل مشروع «لوحة مهامي» القائم');
        expect(result.cwd).toBe(path.join(root, 'react-لوحة-مهامي'));
        expect(result.matched).toBe(true);
    });

    it('selects an explicitly named folder from the ordinary unquoted Arabic chat command', () => {
        const result = resolveRunnableProject(
            root,
            'شغّل المشروع الموجود داخل مساحة العمل باسم react-لوحة-مهامي. لا تنشئ مشروعاً جديداً.'
        );
        expect(result.cwd).toBe(path.join(root, 'react-لوحة-مهامي'));
        expect(result.matched).toBe(true);
    });

    it('matches a planner name to a truncated scaffold folder without guessing another project', () => {
        const generated = path.join(root, 'Joe-System-Validation-and-Nexus-Developm');
        fs.mkdirSync(generated, { recursive: true });
        fs.writeFileSync(path.join(generated, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));
        const result = resolveRunnableProject(root, '"Joe System Validation and Nexus Development"');
        expect(result.cwd).toBe(generated);
        expect(result.matched).toBe(true);
    });

    it('does not let a short folder name swallow a sentence that merely contains it', () => {
        // The prefix rule that finds a truncated scaffold must not revive the
        // unbounded reverse match it replaced: `api` is a prefix of nothing a
        // reader would call a project name.
        const short = path.join(root, 'api');
        fs.mkdirSync(short, { recursive: true });
        fs.writeFileSync(path.join(short, 'package.json'), JSON.stringify({ scripts: { start: 'node server.js' } }));
        const result = resolveRunnableProject(root, '"api gateway for the freight platform"');
        expect(result.cwd).toBeNull();
        expect(result.matched).toBe(false);
    });

    it('refuses to guess when a workspace contains several projects and no name was supplied', () => {
        const result = resolveRunnableProject(root, 'شغّل المشروع الموجود في مساحة العمل');
        expect(result.cwd).toBeNull();
        expect(result.candidates).toHaveLength(3);
        expect(result.matched).toBe(false);
    });

    it('uses the sole project below a workspace automatically', () => {
        fs.rmSync(path.join(root, 'react-لوحة-مهامي-d0bb'), { recursive: true, force: true });
        fs.rmSync(path.join(root, 'react-مدار-الحجوزات'), { recursive: true, force: true });
        const result = resolveRunnableProject(root, 'شغّل المشروع الموجود في مساحة العمل');
        expect(result.cwd).toBe(path.join(root, 'react-لوحة-مهامي'));
        expect(result.matched).toBe(true);
    });

    it('excludes pre-existing common ports from post-launch discovery', () => {
        expect(buildProbeList(4300, false, [3000, 5173])).toEqual([4300, 5174, 3001, 4173, 8080, 8000]);
        expect(buildProbeList(4300, true, [3000, 5173])).toEqual([4300]);
    });

    it('detects a project server bound to the IPv6 loopback address', async () => {
        const server = require('net').createServer();
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '::1', () => resolve());
        });
        const port = server.address().port;
        try {
            await expect(isLoopbackPortOpen(port, 300)).resolves.toBe(true);
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    it('reports absent Vite dependencies before detached startup and its 45-second port wait', () => {
        const project = path.join(root, 'react-لوحة-مهامي');
        const detected = detectStart(project, 4300);
        expect(launchPrerequisiteError(project, detected)).toBe('vite');

        const viteBin = path.join(project, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');
        fs.mkdirSync(path.dirname(viteBin), { recursive: true });
        fs.writeFileSync(viteBin, 'placeholder');
        expect(launchPrerequisiteError(project, detected)).toBeNull();
    });
});
