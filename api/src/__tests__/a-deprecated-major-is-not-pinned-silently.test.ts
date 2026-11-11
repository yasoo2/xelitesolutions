import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import type { AddressInfo } from 'net';
import { findReleaseProvidingBin, NpmManagerTool } from '../modules/tools/definitions/SystemTools';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { workspaceService } from '../modules/services/WorkspaceService';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Review r21 (8c5b5be6): findReleaseProvidingBin pinned the newest release
 * whose manifest declares the executable — even one the registry marks
 * deprecated («2.x is no longer supported») — and said nothing about which
 * major it chose. Real npm below, asking a real registry on 127.0.0.1 (the
 * project's own .npmrc points at it), exactly as npm_manager asks.
 */
jest.setTimeout(180_000);
const roots: string[] = [];
let registry: http.Server;
let base = '';

const manifest = (name: string, version: string, extra: Record<string, unknown> = {}) => ({
    name, version, ...extra, dist: { tarball: `${base}/${name}/-/${name}-${version}.tgz`, shasum: '0'.repeat(40) },
});
const PACKAGES: Record<string, () => any> = {
    // 3.x ships no program; every 2.x release is deprecated; 1.x ships it and is not.
    'joe-fixture-major': () => ({
        '3.0.0': manifest('joe-fixture-major', '3.0.0'),
        '2.5.1': manifest('joe-fixture-major', '2.5.1', { bin: { fixture: 'cli.js' }, deprecated: '2.x is no longer supported' }),
        '2.4.0': manifest('joe-fixture-major', '2.4.0', { bin: { fixture: 'cli.js' }, deprecated: '2.x is no longer supported' }),
        '1.4.0': manifest('joe-fixture-major', '1.4.0', { bin: { fixture: 'cli.js' } }),
    }),
    // Only the newest 2.x was deprecated (a broken publish); 2.4.0 is fine.
    'joe-fixture-cli': () => ({
        '3.0.0': manifest('joe-fixture-cli', '3.0.0'),
        '2.5.1': manifest('joe-fixture-cli', '2.5.1', { bin: { fixture: 'cli.js' }, deprecated: 'broken publish, use 2.4.0' }),
        '2.4.0': manifest('joe-fixture-cli', '2.4.0', { bin: { fixture: 'cli.js' } }),
        '1.4.0': manifest('joe-fixture-cli', '1.4.0', { bin: { fixture: 'cli.js' } }),
    }),
    // Every release that ships the program is deprecated.
    'joe-fixture-old': () => ({
        '2.0.0': manifest('joe-fixture-old', '2.0.0'),
        '1.9.0': manifest('joe-fixture-old', '1.9.0', { bin: { fixture: 'cli.js' }, deprecated: 'use joe-fixture-cli' }),
    }),
};

function project(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-deprecated-bin-'));
    roots.push(dir);
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'landing', version: '1.0.0' }));
    fs.writeFileSync(path.join(dir, '.npmrc'), [
        `registry=${base}/`, `cache=${path.join(dir, '.npm-cache')}`, 'update-notifier=false', 'fetch-retries=0', 'audit=false', 'fund=false',
    ].join('\n'));
    return dir;
}

beforeAll(async () => {
    registry = http.createServer((req, res) => {
        const name = decodeURIComponent(String(req.url || '').split('?')[0].replace(/^\//, ''));
        const versions = PACKAGES[name]?.();
        if (!versions) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not_found"}'); }
        const latest = Object.keys(versions)[0];
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ _id: name, name, 'dist-tags': { latest }, versions,
            time: Object.fromEntries(Object.keys(versions).map(v => [v, '2026-10-01T00:00:00.000Z'])) }));
    });
    await new Promise<void>(resolve => registry.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(registry.address() as AddressInfo).port}`;
});
afterAll(async () => {
    registry.closeAllConnections?.();
    await new Promise<void>(resolve => registry.close(() => resolve()));
    for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
});

const find = (dir: string, pkg: string) => executionFirewall.runInContext(`deprecated-bin-${pkg}`,
    () => findReleaseProvidingBin(dir, pkg, 'fixture', 60_000));

describe('a deprecated major is not pinned silently', () => {
    it('passes over a major that is deprecated throughout, and names the major it chose', async () => {
        const result = await find(project(), 'joe-fixture-major');
        expect(result.version).toBe('1.4.0');
        expect(result.major).toBe(1);
        expect(result.reason).toBe('joe-fixture-major@1.4.0 (major 1) is the newest stable, non-deprecated release that declares "fixture"; every 2.x release is deprecated; 3.0.0 declares no "fixture"');
    });

    it('a deprecated newest release does not cost the whole major', async () => {
        const result = await find(project(), 'joe-fixture-cli');
        expect(result.version).toBe('2.4.0');
        expect(result.major).toBe(2);
        expect(result.skippedDeprecated).toEqual(['2.5.1']);
        expect(result.reason).toBe('joe-fixture-cli@2.4.0 (major 2) is the newest stable, non-deprecated release that declares "fixture"; skipped deprecated 2.5.1; 3.0.0 declares no "fixture"');
    });

    it('installs nothing when only deprecated releases declare the program, and says so', async () => {
        const result = await find(project(), 'joe-fixture-old');
        expect(result.version).toBeUndefined();
        expect(result.error).toBe('npm_only_deprecated_releases_declare_executable:joe-fixture-old:fixture:1.9.0');
    });
});

describe('project_run says which release and major it installed', () => {
    const sessionId = 'deprecated-major-run';
    afterAll(async () => {
        for (const session of [sessionId, `${sessionId}-unread`]) {
            await executionFirewall.runInContext('deprecated-major-stop', () =>
                new ProjectStopTool().execute({}, { sessionId: session, workspaceId: 'w', userId: 'u' })).catch(() => undefined);
        }
        jest.restoreAllMocks();
    });

    /** project_run on a vite project whose script program is undeclared; npm_manager answers `binProvider`. */
    async function runWith(binProvider: Record<string, unknown>, session: string) {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-deprecated-run-'));
        roots.push(root);
        fs.mkdirSync(path.join(root, 'src'));
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'landing', scripts: { dev: 'vite', build: 'vite build' } }));
        fs.writeFileSync(path.join(root, 'vite.config.js'), "import { defineConfig } from 'vite';\nexport default defineConfig({});");
        fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>Landing</title><h1>Landing</h1><script type="module" src="/src/main.js"></script>');
        fs.writeFileSync(path.join(root, 'src', 'main.js'), "document.title = 'Landing';");
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(root);
        // npm_manager's answer for the providesBin install (its registry choice is the real-npm test above);
        // what it puts on disk is a vite that serves the page on the port it is given.
        const inputs: any[] = [];
        jest.spyOn(NpmManagerTool.prototype, 'execute').mockImplementation(async (input: any) => {
            inputs.push(input);
            const pkg = path.join(root, 'node_modules', 'vite');
            fs.mkdirSync(path.join(pkg, 'bin'), { recursive: true });
            fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'vite', version: '5.4.21', bin: { vite: 'bin/vite.js' } }));
            fs.writeFileSync(path.join(pkg, 'bin', 'vite.js'), [
                "const http = require('http'); const fs = require('fs');",
                "const at = process.argv.indexOf('--port'); const port = Number(at > 0 ? process.argv[at + 1] : process.env.PORT);",
                "http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/html' }); s.end(fs.readFileSync('index.html')); }).listen(port, '127.0.0.1');",
            ].join('\n'));
            const bin = path.join(root, 'node_modules', '.bin');
            fs.mkdirSync(bin, { recursive: true });
            fs.writeFileSync(path.join(bin, 'vite.cmd'), '@node "%~dp0\\..\\vite\\bin\\vite.js" %*\r\n');
            fs.writeFileSync(path.join(bin, 'vite'), '#!/bin/sh\nexec node "$(dirname "$0")/../vite/bin/vite.js" "$@"\n', { mode: 0o755 });
            return { ok: true, output: { output: 'added 1 package', binProvider }, logs: [] } as any;
        });
        const result: any = await executionFirewall.runInContext(`deprecated-major-run-${session}`, () =>
            new ProjectRunTool().execute({ cwd: root }, { sessionId: session, workspaceId: 'w', userId: 'u' }));
        jest.restoreAllMocks();
        return { result, inputs };
    }

    it('the vite it had to install is named with its major, and the app then runs', async () => {
        const reason = 'vite@5.4.21 (major 5) is the newest stable, non-deprecated release that declares "vite"; skipped deprecated 6.0.0';
        const { result, inputs } = await runWith({ version: '5.4.21', major: 5, reason, deprecationKnown: true, skippedDeprecated: ['6.0.0'] }, sessionId);
        expect(inputs).toHaveLength(1);
        expect(inputs[0]).toMatchObject({ packages: ['vite'], providesBin: 'vite' });
        expect(result.logs).toContain(`project_run: ${reason}`);
        expect(result.logs).toContain('✅ Installed vite@5.4.21 (major 5): the newest stable, non-deprecated release that declares vite. Skipped deprecated: 6.0.0.');
        expect(result.ok).toBe(true);
    });

    it('a release whose deprecation could not be read is not called non-deprecated (second review of round 21)', async () => {
        const reason = 'vite@5.4.21 (major 5) is the newest stable release that declares "vite" (its deprecation status could not be read)';
        const { result } = await runWith({ version: '5.4.21', major: 5, reason, deprecationKnown: false, skippedDeprecated: [] }, `${sessionId}-unread`);
        expect(result.logs).toContain(`project_run: ${reason}`);
        expect(result.logs).toContain('✅ Installed vite@5.4.21 (major 5): the newest stable release that declares vite; whether it is deprecated could not be read.');
        expect(result.logs.join('\n')).not.toMatch(/non-deprecated release that declares vite/);
        expect(result.ok).toBe(true);
    });
});
