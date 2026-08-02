/**
 * The File Explorer location audit. In local single-user mode the panel showed
 * "system-fallback / Empty Directory" with no way to understand or change where
 * files go. Root causes, now fixed and guarded here:
 *   - getActiveRoot() ignored a chosen local folder → choosing did nothing;
 *   - the choice was never persisted → lost on every restart;
 *   - the default folder was named "system-fallback" (internal jargon).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

describe('local build location: effective, persistent, clearly named', () => {
    let projectsDir: string;
    let make: () => any;

    beforeEach(() => {
        projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-loc-'));
        process.env.EXTERNAL_PROJECTS_DIR = projectsDir;
        // Fresh instance each time so persistence is proven via disk, not memory.
        const { WorkspaceService } = require('../modules/services/WorkspaceService');
        make = () => new WorkspaceService();
    });
    afterEach(() => {
        delete process.env.EXTERNAL_PROJECTS_DIR;
        fs.rmSync(projectsDir, { recursive: true, force: true });
    });

    test('the default is "my-workspace", never "system-fallback"', () => {
        const root = make().getActiveRoot();
        expect(path.basename(root)).toBe('my-workspace');
        expect(root).not.toMatch(/system-fallback/);
    });

    test('choosing a folder takes effect AND a write lands there', async () => {
        const svc = make();
        const chosen = path.join(projectsDir, 'user-choice');
        await svc.setActiveRoot(chosen);
        expect(path.resolve(svc.getActiveRoot())).toBe(path.resolve(chosen));
        fs.writeFileSync(path.join(svc.getActiveRoot(), 'x.txt'), '1');
        expect(fs.existsSync(path.join(chosen, 'x.txt'))).toBe(true);
    });

    test('the choice persists across a restart (new instance reads it from disk)', async () => {
        const chosen = path.join(projectsDir, 'persisted');
        await make().setActiveRoot(chosen);
        expect(path.resolve(make().getActiveRoot())).toBe(path.resolve(chosen));
        // The persistence file exists.
        expect(fs.existsSync(path.join(projectsDir, '.joe-local-root.json'))).toBe(true);
    });

    test('reset restores the clean default and persists that too', () => {
        const svc = make();
        svc.resetToSystem();
        expect(path.basename(svc.getActiveRoot())).toBe('my-workspace');
        expect(path.basename(make().getActiveRoot())).toBe('my-workspace');
    });

    test('an explicit workspace id is isolated from the local root', () => {
        const wsRoot = make().getActiveRoot('64b2f0000000000000000abc');
        expect(wsRoot).toContain('64b2f0000000000000000abc');
    });
});

describe('the /project/root route reports whether it is the default', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'api', 'routes', 'project.ts'), 'utf-8');
    test('it returns isDefault so the UI can say "you can change it"', () => {
        expect(src).toMatch(/isDefault = path\.basename\(activeRoot\) === 'my-workspace'/);
        expect(src).toMatch(/res\.json\(\{ path: activeRoot, name: path\.basename\(activeRoot\), isDefault \}\)/);
    });
});
