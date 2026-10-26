/**
 * A project's file layout, as shown to the model and to the parser, is the
 * files someone wrote — never the caches and state that tools and Joe keep
 * inside the project.
 *
 * P101 (run500, 2026-10-26): the layout ai_write_file sends as import evidence
 * walked the API builder's own `.npm-cache`, filled its 180-entry cap with
 * sha512 hash paths (28.9k chars), never listed server.js or db.js, and the
 * prompt overflowed the local window: «Local inference returned HTTP 400».
 * Only the model call is substituted; the walk, the filesystem and the prompt
 * builder are the real code.
 */
import fs from 'fs';
import path from 'path';

const callLLM = jest.fn();
jest.mock('../core/llm', () => ({ callLLM: (...a: any[]) => callLLM(...a) }));

import { AIGeneratorTool } from '../modules/tools/definitions/AIGeneratorTool';
import { listJavaScriptSources } from '../core/quality/js-syntax-check';
import { workspaceService } from '../modules/services/WorkspaceService';

const ROOT = path.join(path.resolve(workspaceService.externalRoot), 'session-layout-machine-state-test', 'api');
const write = (rel: string, body: string) => {
    const file = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
};

beforeAll(() => {
    write('package.json', JSON.stringify({ name: 'api', type: 'module', scripts: { start: 'node server.js' }, dependencies: { express: '^4.21.2' } }));
    write('server.js', "import { db } from './db.js';\n");
    write('db.js', 'export const db = {};\n');
    write('routes/patients.js', 'export default [];\n');
    // More cache entries than the layout's cap, sorted before every real file.
    for (let i = 0; i < 200; i++) {
        const hash = (i.toString(16).padStart(4, '0') + 'ab'.repeat(62));
        write(`.npm-cache/_cacache/content-v2/sha512/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash.slice(4)}`, 'x');
    }
    write('.npm-cache/_cacache/index-v5/aa/bb/cached.js', 'not a source\n');
    write('.engineering-checkpoints/2a14e511e204bf1d7cb7935843e44d25.json', '{}');
    write('.joe/state.js', 'not a source\n');
    write('__pycache__/x.js', 'not a source\n');
});

afterAll(() => {
    fs.rmSync(path.dirname(ROOT), { recursive: true, force: true });
});

test('the layout shown to the model lists the project files, not the caches inside the project', async () => {
    callLLM.mockResolvedValue(JSON.stringify({ name: 'api', type: 'module', scripts: { start: 'node server.js', test: 'node --test' }, dependencies: { express: '^4.21.2' } }));
    const result: any = await new AIGeneratorTool().execute(
        { path: 'package.json', description: 'Preserve existing scripts and add a real local test command.', context: 'repair evidence' },
        { engineeringPipeline: true, projectRoot: ROOT, workspaceId: 'session-layout-machine-state-test' });
    expect(result.ok).toBe(true);
    const prompt = String(callLLM.mock.calls[0][0]);
    const layout = prompt.slice(prompt.indexOf('VERIFIED PROJECT FILE LAYOUT'));
    for (const file of ['server.js', 'db.js', 'routes/patients.js', 'package.json']) expect(layout).toContain(`- ${file}`);
    for (const state of ['.npm-cache', '_cacache', '.engineering-checkpoints', '.joe/', '__pycache__']) expect(layout).not.toContain(state);
    // The repair brief stays the size of the project, not of its cache.
    expect(prompt.length).toBeLessThan(4000);
});

test('the parser reads the sources someone wrote, never a cache or Joe state that happens to end in .js', () => {
    expect(listJavaScriptSources(ROOT).sort()).toEqual(['db.js', 'routes/patients.js', 'server.js']);
});
