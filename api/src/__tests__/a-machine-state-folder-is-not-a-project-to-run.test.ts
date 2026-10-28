import fs from 'fs';
import os from 'os';
import path from 'path';
import { MACHINE_STATE_DIRECTORIES } from '../shared/utils/project-tree';
import { reconcileMissingRuntimeTarget, resolveRunnableProject } from '../modules/tools/definitions/ProjectRunTool';

/**
 * Review r21 (group 3 #3): project_run kept its own skip list for the folders
 * it walks (node_modules, .git, dist, build, coverage, .next), apart from the
 * shared one in shared/utils/project-tree.ts — so a folder the shared list
 * learns (a virtualenv, __pycache__, Joe's own state) was still a «project»
 * here. Both of project_run's walkers now read the shared list; the test
 * reads the list too, so a name added there is held here without editing it.
 */
const roots: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-run-walkers-')); roots.push(d); return d; };
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

describe('a machine-state folder is not a project to run', () => {
    it('the workspace scan skips every folder the shared list names', () => {
        const workspace = tmp();
        for (const name of MACHINE_STATE_DIRECTORIES) {
            fs.mkdirSync(path.join(workspace, name), { recursive: true });
            fs.writeFileSync(path.join(workspace, name, 'index.html'), '<h1>generated report</h1>');
        }
        const real = path.join(workspace, 'clinic-site');
        fs.mkdirSync(real);
        fs.writeFileSync(path.join(real, 'package.json'), JSON.stringify({ name: 'clinic-site', scripts: { start: 'node server.js' } }));
        expect(resolveRunnableProject(workspace)).toEqual({ cwd: real, candidates: [real], matched: true });
    });

    it('a server file inside machine state is never taken for the app\'s entry', () => {
        const cwd = tmp();
        fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify({ name: 'api', scripts: { start: 'node app.js' } }));
        for (const name of [...MACHINE_STATE_DIRECTORIES].filter(n => !n.startsWith('.'))) {
            fs.mkdirSync(path.join(cwd, name), { recursive: true });
            fs.writeFileSync(path.join(cwd, name, 'server.js'), "require('http').createServer(() => {}).listen(3000);");
        }
        const result = reconcileMissingRuntimeTarget(cwd, 'runtime target is missing: app.js');
        expect(result).toEqual({ repaired: false, message: 'no existing server entrypoint evidence found' });
        expect(JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')).scripts.start).toBe('node app.js');
    });
});
