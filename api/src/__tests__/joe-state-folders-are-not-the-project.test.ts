/**
 * Joe's own state folders inside a project are not the project.
 *
 * Round 21 review (43ca8fa5): the shared list of machine-state folders
 * (shared/utils/project-tree) missed two that Joe itself writes into every
 * project — `.joe-versions`, ten undo snapshots of the whole tree
 * (core/project/versions.ts), and `.checkpoints`, the resumable build state
 * (core/resume/checkpoint.ts) — and two walkers kept private lists of their
 * own. Ten snapshots sort before `server.js` and are ten copies of every file:
 * the layout ai_write_file shows the model filled its list with them and never
 * listed server.js or db.js; a literal text edit rewrote checkpoint JSON beside
 * the page; an export carried every file eleven times.
 * The snapshots are made by Joe's own snapshotProject; only the model call is
 * substituted.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { ProjectEditTool } from '../modules/tools/definitions/ProjectEditTool';
import { archiveProject } from '../core/transfer/project-archive';
import { snapshotProject, listVersions } from '../core/project/versions';
import { workspaceService } from '../modules/services/WorkspaceService';

const WORKSPACE = 'session-joe-state-folders-test';
const ROOT = path.join(path.resolve(workspaceService.externalRoot), WORKSPACE, 'api');
const write = (root: string, rel: string, body: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
};

beforeAll(() => {
    write(ROOT, 'package.json', JSON.stringify({ name: 'api', type: 'module', scripts: { start: 'node server.js' }, dependencies: { express: '^4.21.2' } }));
    write(ROOT, 'server.js', "import { db } from './db.js';\n");
    write(ROOT, 'db.js', 'export const db = {};\n');
    for (let i = 0; i < 15; i++) write(ROOT, `routes/r${String(i).padStart(2, '0')}.js`, 'export default [];\n');
    // Ten undo snapshots, as Joe takes them before every edit and repair.
    for (let i = 0; i < 10; i++) snapshotProject(ROOT, `edit ${i}`);
    write(ROOT, '.checkpoints/2a14e511e204bf1d7cb7935843e44d25.json', '{"sections":{"hero":"احجز جلسة"}}');
});

afterAll(() => {
    fs.rmSync(path.dirname(ROOT), { recursive: true, force: true });
});

test('ten snapshots no longer push server.js and db.js out of the layout the model is shown', async () => {
    expect(listVersions(ROOT)).toHaveLength(10);
    callLLM.mockResolvedValue(JSON.stringify({ name: 'api', type: 'module', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.21.2' } }));
    const result: any = await new AIGeneratorTool().execute(
        { path: 'package.json', description: 'Preserve existing scripts and add a real local test command.', context: 'repair evidence' },
        { engineeringPipeline: true, projectRoot: ROOT, workspaceId: WORKSPACE });
    expect(result.ok).toBe(true);
    const prompt = String(callLLM.mock.calls[0][0]);
    const layout = prompt.slice(prompt.indexOf('VERIFIED PROJECT FILE LAYOUT'));
    for (const file of ['server.js', 'db.js', 'routes/r00.js', 'routes/r14.js', 'package.json']) expect(layout).toContain(`- ${file}`);
    for (const state of ['.joe-versions', '.checkpoints']) expect(layout).not.toContain(state);
});

describe('the walkers that kept their own lists', () => {
    let site = '';
    beforeEach(() => {
        site = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-state-site-'));
        write(site, 'package.json', '{"name":"clinic-site"}');
        write(site, 'src/content.js', "export const content = { cta: 'احجز جلسة' };\n");
        snapshotProject(site, 'before edit');
        write(site, '.checkpoints/5d41402abc4b2a76b9719d911017c592.json', '{"sections":{"cta":"احجز جلسة"}}');
        write(site, '.yarn/releases/yarn-4.5.0.cjs', '// the release yarnPath pins\n');
    });
    afterEach(() => fs.rmSync(site, { recursive: true, force: true }));

    it('a literal text edit changes the page, never Joe\'s checkpoint or a snapshot', async () => {
        const checkpoint = path.join(site, '.checkpoints', '5d41402abc4b2a76b9719d911017c592.json');
        const before = fs.readFileSync(checkpoint, 'utf-8');
        const res: any = await new ProjectEditTool().execute(
            { request: 'غيّر نص زر «احجز جلسة» إلى «احجز موعدك»، ثم اختبر التعديل في المتصفح.', dir: site },
            { sessionId: 'joe-state-literal' },
        );
        delete (global as any).joeProjects?.['joe-state-literal'];
        expect(res.output.touched).toEqual(['src/content.js']);
        expect(fs.readFileSync(path.join(site, 'src', 'content.js'), 'utf-8')).toContain("cta: 'احجز موعدك'");
        expect(fs.readFileSync(checkpoint, 'utf-8')).toBe(before);
    });

    it('an export carries the project once, without Joe\'s state, and keeps the release Yarn pins', () => {
        const archive = archiveProject(site);
        const names = new AdmZip(archive.buffer).getEntries().map(entry => entry.entryName).sort();
        expect(names).toEqual(['.yarn/releases/yarn-4.5.0.cjs', 'joe-project.json', 'package.json', 'src/content.js']);
        expect(archive.files).toBe(3);
    });
});
