/**
 * JOE'S RECOVERY COPIES OF THE OWNER'S DATA ARE NEVER THE MODEL'S TO READ (design v13.3 §5b step 2, §12.6 row 10).
 *
 * A 2T verification keeps every version of the app's data files it saw change in
 * `<JOE_DATA_DIR>/qa-recovery/…`, outside every workspace root. The engine's file tools refuse that folder by
 * name too, so a root moved up, a copied folder or a link can never put the owner's records into a prompt:
 * read, write, edit refuse it; list and search never show it, not even as a skipped folder.
 */
import fs from 'fs';
import path from 'path';
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

jest.setTimeout(120_000);

const OWNER_RECORD = 'owner-only-record-7f3a';
let fx: FileToolsFixture;
const savedDataDir = process.env.JOE_DATA_DIR;
beforeAll(() => {
    fx = fileToolsFixture('recovery');
    fx.put('src/app.js', 'export const a = 1;\n');
    //  A recovery folder where a root moved up would meet it, holding the owner's record.
    fx.put('qa-recovery/ws/0123456789abcdef/run-1/1/data/store.json', JSON.stringify([{ name: OWNER_RECORD }]));
    fx.put('nested/QA-Recovery/x/data/db.json', JSON.stringify([{ name: OWNER_RECORD }]));
});
afterAll(() => {
    if (savedDataDir === undefined) delete process.env.JOE_DATA_DIR; else process.env.JOE_DATA_DIR = savedDataDir;
    fx.cleanup();
});

const refused = /recovery copies of the app's data \(qa-recovery\)/u;

describe('the recovery folder is refused by name', () => {
    it('read, write and edit refuse a path through it', async () => {
        const read = await fx.run('engine_file_read', { path: 'qa-recovery/ws/0123456789abcdef/run-1/1/data/store.json' });
        expect(read.ok).toBe(false);
        expect(read.error).toMatch(refused);
        expect(JSON.stringify(read)).not.toContain(OWNER_RECORD);
        const upper = await fx.run('engine_file_read', { path: 'nested/QA-Recovery/x/data/db.json' });
        expect(upper.error).toMatch(refused);
        const write = await fx.run('engine_file_write', { path: 'qa-recovery/planted.txt', content: 'x\n' });
        expect(write.error).toMatch(refused);
        expect(fx.exists('qa-recovery/planted.txt')).toBe(false);
        const edit = await fx.run('engine_file_edit', { path: 'nested/qa-recovery/x/data/db.json', old_text: OWNER_RECORD, new_text: 'y' });
        expect(edit.error).toMatch(refused);
        const listInside = await fx.run('engine_file_list', { path: 'qa-recovery' });
        expect(listInside.error).toMatch(refused);
        const searchInside = await fx.run('engine_file_search', { pattern: OWNER_RECORD, path: 'qa-recovery' });
        expect(searchInside.error).toMatch(refused);
    });

    it('a list of the project never shows it, and a search never finds what is in it', async () => {
        const list = await fx.run('engine_file_list', { depth: 6 });
        expect(list.ok).toBe(true);
        expect(JSON.stringify(list.output)).toContain('src/');
        expect(JSON.stringify(list.output).toLowerCase()).not.toContain('qa-recovery');
        const search = await fx.run('engine_file_search', { pattern: OWNER_RECORD });
        expect(String(search.output ?? '') + String(search.error ?? '')).not.toContain('store.json');
        expect(JSON.stringify(search)).not.toMatch(/db\.json|store\.json/u);
        const plain = await fx.run('engine_file_search', { pattern: 'export const a' });
        expect(JSON.stringify(plain.output)).toContain('src/app.js');
    });
});

describe('the recovery folder is refused by place', () => {
    it('a project folder inside <JOE_DATA_DIR>/qa-recovery is refused', async () => {
        //  The data folder put inside the workspace: the worst case of a root moved up.
        const dataDir = path.join(fx.workspace, 'joe-data');
        const inside = path.join(dataDir, 'qa-recovery', 'ws', 'key', 'run-1', '1');
        fs.mkdirSync(inside, { recursive: true });
        fs.writeFileSync(path.join(inside, 'store.json'), OWNER_RECORD);
        process.env.JOE_DATA_DIR = dataDir;
        try {
            const r = await fx.run('engine_file_read', { path: 'store.json' }, { ...fx.context, projectRoot: inside });
            expect(r.error).toMatch(refused);
            expect(JSON.stringify(r)).not.toContain(OWNER_RECORD);
        } finally {
            delete process.env.JOE_DATA_DIR;
        }
    });

    it('an ordinary project file still reads', async () => {
        const r = await fx.run('engine_file_read', { path: 'src/app.js' });
        expect(r.ok).toBe(true);
        expect(JSON.stringify(r.output)).toContain('export const a = 1;');
    });
});
