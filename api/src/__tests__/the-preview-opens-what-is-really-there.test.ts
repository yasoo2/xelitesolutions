/**
 * The Preview tab, opened on a conversation or after a reload, shows the
 * project's running server, else its built page, else nothing — never the
 * «No built project» 404 for a project that is live elsewhere or not built yet.
 */
import fs from 'fs';
import path from 'path';
import { previewForSession } from '../api/session-preview';

const project = (extra: Record<string, any> = {}) => ({ dir: 'D:/x/joe-app-1', type: 'agent', updatedAt: 1793906163788, ...extra });

describe('the preview opens what is really there', () => {
    it('opens the project\'s own server when it is live', async () => {
        const p = await previewForSession('s1', project({ live: { url: 'http://127.0.0.1:4300/', port: 4300, pid: 1 } }), {
            portOpen: async port => port === 4300,
            builtPage: () => null,
        });
        expect(p?.url).toBe('http://127.0.0.1:4300/');
        expect(p?.live).toBe(true);
    });

    it('does not open a live address whose server has stopped', async () => {
        const p = await previewForSession('s1', project({ live: { url: 'http://127.0.0.1:4300/', port: 4300, pid: 1 } }), {
            portOpen: async () => false,
            builtPage: () => null,
        });
        expect(p).toBeNull();
    });

    it('opens the built page when dist/index.html exists', async () => {
        const p = await previewForSession('s1', project(), { portOpen: async () => false, builtPage: () => 'D:/x/joe-app-1/dist/index.html' });
        expect(p?.url).toMatch(/\/project-preview\/s1\/index\.html\?v=1793906163788$/);
        expect(p?.live).toBeUndefined();
    });

    it('gives no URL for a project with no page yet: the clinic mid-build', async () => {
        const p = await previewForSession('6aeccfc1b88236986fce9f90', project(), { portOpen: async () => true, builtPage: () => null });
        expect(p).toBeNull();
    });

    it('never opens a host the record names that is not this machine', async () => {
        const p = await previewForSession('s1', project({ live: { url: 'http://evil.example:4300/', port: 4300 } }), { portOpen: async () => true, builtPage: () => null });
        expect(p).toBeNull();
    });

    it('gives no page for an API-only project', async () => {
        const p = await previewForSession('s1', project({ type: 'api', live: { url: 'http://127.0.0.1:4300/', port: 4300 } }), { portOpen: async () => true, builtPage: () => 'x' });
        expect(p).toBeNull();
    });

    it('the workspace route asks this, not the folder alone', () => {
        const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'controllers', 'sessionController.ts'), 'utf8');
        const body = source.slice(source.indexOf('export async function sessionWorkspace'), source.indexOf('async function executeScreenshotRead'));
        expect(body).toMatch(/previewForSession\(/);
        expect(body).not.toMatch(/url:\s*publicUrlFor\('\/project-preview\//);
    });
});
