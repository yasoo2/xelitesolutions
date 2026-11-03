import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { workspaceService } from '../modules/services/WorkspaceService';
import { ProjectRunTool, ProjectStopTool } from '../modules/tools/definitions/ProjectRunTool';
import { executionFirewall } from '../orchestration/AgentExecutionFirewall';

/**
 * Eval round 14, 2026-10-24 (P001): the scaffolded package.json said
 * «dev: node src/index.js», a file that never existed, so project_run refused
 * the missing target and the delivery gate had no address for a correct
 * static site. The project's own start is still tried first; only when it
 * cannot run is the build-free site served — by the strict server on loopback.
 */
jest.setTimeout(120_000);
const roots: string[] = [];
const get = (url: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
    http.get(url, res => { let body = ''; res.on('data', c => { body += c; }); res.on('end', () => resolve({ status: res.statusCode || 0, body })); }).on('error', reject);
});

describe('project_run serves a static site when its start cannot run', () => {
    const tool = new ProjectRunTool();
    const context = { sessionId: 'static-e2e-session', workspaceId: 'w', userId: 'u' };
    // Stop through project_stop (the tree kill Joe itself uses): a plain
    // process.kill returns before Windows releases the server's cwd, and the
    // folder cannot be removed while a process still sits in it.
    afterAll(async () => {
        await executionFirewall.runInContext('static-site-e2e-stop', () => new ProjectStopTool().execute({}, context)).catch(() => undefined);
        for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
    });

    it('the P001 shape gets a loopback address that serves the page', async () => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-static-'));
        roots.push(workspace);
        jest.spyOn(workspaceService, 'getActiveRoot').mockReturnValue(workspace);
        const dir = path.join(workspace, 'clinic-landing-ar');
        fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'clinic', type: 'module', scripts: { dev: 'node src/index.js' } }));
        fs.writeFileSync(path.join(dir, 'src', 'index.html'), '<!doctype html><title>عيادة</title><link rel="stylesheet" href="styles.css"><h1>clinic</h1>');
        fs.writeFileSync(path.join(dir, 'src', 'styles.css'), 'h1{}');

        const res: any = await executionFirewall.runInContext('static-site-e2e', () =>
            tool.execute({ cwd: dir }, context));
        expect(res.ok).toBe(true);
        expect(res.output.kind).toBe('static-site');
        expect(String(res.output.url)).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
        const page = await get(res.output.url);
        expect(page.status).toBe(200);
        expect(page.body).toContain('clinic');
        expect((await get(res.output.url + 'styles.css')).status).toBe(200);
        expect((await get(res.output.url + 'package.json')).status).toBe(404);
    });
});
