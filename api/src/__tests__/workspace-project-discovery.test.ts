import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildProbeList, detectStart, isLoopbackPortOpen, launchabilityError, launchPrerequisiteError, resolveRunnableProject } from '../modules/tools/definitions/ProjectRunTool';

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

    it('resolves a named latest project in a continuation request', () => {
        const science = path.join(root, 'react-science-museum-00f00d5b');
        fs.mkdirSync(science, { recursive: true });
        fs.writeFileSync(path.join(science, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }));
        const result = resolveRunnableProject(root, 'افتح آخر مشروع Science Museum بنيته واقرأ ملفاته أولاً');
        expect(result.cwd).toBe(science);
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
        /**
         * The guarantee is real and worth keeping: a project server that binds
         * to ::1 must not be reported dead. What is NOT allowed is failing
         * because the HOST has no IPv6 loopback — this suite ran red in a
         * container with «listen EAFNOSUPPORT: address family not supported
         * ::1», a verdict about the machine rather than about the code.
         *
         * The repository already settled this with the missing-interpreter
         * check: a probe that cannot run SKIPS and says so; it never invents a
         * failure.
         */
        const server = require('net').createServer();
        const bound = await new Promise<boolean>(resolve => {
            server.once('error', (err: any) => {
                const noIpv6 = err?.code === 'EAFNOSUPPORT' || err?.code === 'EADDRNOTAVAIL'
                    || err?.code === 'EINVAL' || err?.code === 'ENOTSUP';
                if (!noIpv6) throw err;
                resolve(false);
            });
            server.listen(0, '::1', () => resolve(true));
        });
        if (!bound) {
            console.log('  ⏭️  IPv6 loopback unavailable on this host — the ::1 probe is skipped, not failed');
            return;
        }
        const port = server.address().port;
        try {
            await expect(isLoopbackPortOpen(port, 300)).resolves.toBe(true);
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    });

    it('recognizes a TypeScript project without package.json only when tsconfig and an entrypoint exist', () => {
        const project = path.join(root, 'typescript-service');
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'tsconfig.json'), '{"compilerOptions":{"target":"ES2022"}}');
        fs.writeFileSync(path.join(project, 'src', 'index.ts'), 'import { createServer } from "node:http"; createServer((_req, res) => res.end("ok")).listen(4300);');

        const resolved = resolveRunnableProject(root, 'شغّل المشروع باسم typescript-service');
        expect(resolved.cwd).toBe(project);
        expect(resolved.matched).toBe(true);
        expect(detectStart(project, 4300)).toMatchObject({ kind: 'tsx-entry', expectPort: 4300, forced: false });
        expect(detectStart(project, 4300).command).toContain('src/index.ts');
    });

    it('does not treat tsconfig without a conventional entrypoint as runnable', () => {
        const project = path.join(root, 'typescript-incomplete');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(project, 'tsconfig.json'), '{}');
        const resolved = resolveRunnableProject(root, 'شغّل المشروع باسم typescript-incomplete');
        expect(resolved.cwd).toBeNull();
        expect(resolved.matched).toBe(false);
    });

    it('rejects npm start when its declared runtime target is missing', () => {
        const project = path.join(root, 'broken-start');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { start: 'node index.js' } }));
        const detected = detectStart(project, 4300);
        expect(launchabilityError(project, detected)).toContain('runtime target is missing');
    });

    it('rejects a JavaScript target that cannot prove a server listen', () => {
        const project = path.join(root, 'not-a-server');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { start: 'node src/index.js' } }));
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'src', 'index.js'), 'print("this is not a Node server")');
        const detected = detectStart(project, 4300);
        expect(launchabilityError(project, detected)).toContain('no observable server listen');
    });

    it('accepts a Node target with observable HTTP listen evidence', () => {
        const project = path.join(root, 'valid-server');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ scripts: { start: 'node src/index.js' } }));
        fs.mkdirSync(path.join(project, 'src'), { recursive: true });
        fs.writeFileSync(path.join(project, 'src', 'index.js'), 'require("http").createServer((_req, res) => res.end("ok")).listen(process.env.PORT || 4300);');
        const detected = detectStart(project, 4300);
        expect(launchabilityError(project, detected)).toBeNull();
    });

    it('keeps Vite prerequisite validation separate from runtime target validation', () => {
        const project = path.join(root, 'react-لوحة-مهامي');
        const detected = detectStart(project, 4300);
        expect(launchabilityError(project, detected)).toBeNull();
        expect(launchPrerequisiteError(project, detected)).toBe('vite');
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

    it('node:-prefixed builtins are never reported as missing npm dependencies', () => {
        // npm forbids «:» in package names, and builtinModules omits the
        // prefix-only modules (node:sqlite, node:test) — so the generated API,
        // which opens its database with require('node:sqlite'), was refused
        // with a dependency nobody could ever install.
        const project = path.join(root, 'api-sqlite-service');
        fs.mkdirSync(project, { recursive: true });
        fs.writeFileSync(path.join(project, 'package.json'),
            JSON.stringify({ name: 'api-sqlite-service', scripts: { start: 'node server.js' } }));
        fs.writeFileSync(path.join(project, 'server.js'),
            "const { DatabaseSync } = require('node:sqlite');\nconst t = require('node:test');\nconsole.log('ok');\n");
        const detected = detectStart(project, 4310);
        expect(launchPrerequisiteError(project, detected)).toBeNull();
    });
});
