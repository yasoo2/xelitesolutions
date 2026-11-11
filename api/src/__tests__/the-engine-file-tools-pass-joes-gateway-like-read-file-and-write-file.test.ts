/**
 * THE ENGINE'S FILE TOOLS PASS JOE'S GATEWAY THE WAY read_file AND write_file DO.
 *
 * With the owner's bypass off, as on a server Joe shares with other users,
 * ToolService judges each call's risk before it runs (classifyToolRisk).
 * read_file is low risk and write_file medium, whatever the file holds. A
 * name the classifier does not know is judged by the words in its input, so
 * a server file that says «shutdown», a read of src/shutdown.js or a search
 * for «sudo» reads as a critical command and waits for the owner's approval
 * of every risk: on a server, the engine could not write an ordinary
 * graceful-shutdown handler. The engine's file tools carry read_file's and
 * write_file's risk instead.
 */
import { fileToolsFixture, type FileToolsFixture } from './fixtures/engine-file-tools';

// The session record lives in the database, which the test runner cannot
// reach; the owner below is the fixture's own (fileToolsFixture('gate')).
jest.mock('../modules/services/session-identity', () => ({
    __esModule: true,
    normalizeId: (v: any) => String(v ?? '').trim(),
    resolveSessionIdentity: async () => ({ userId: 'eng-files-owner-gate', workspaceId: 'eng-files-gate' }),
}));

jest.setTimeout(180_000);

const saved = { autoAll: process.env.AUTO_APPROVE_ALL, autoSafe: process.env.AUTO_APPROVE_SAFE };
let fx: FileToolsFixture;
beforeAll(() => {
    fx = fileToolsFixture('gate');
    // The server's setting: no bypass, and only safe calls approved on their own.
    process.env.ENABLE_AUTH_BYPASS = 'false';
    delete process.env.AUTO_APPROVE_ALL;
    delete process.env.AUTO_APPROVE_SAFE;
    fx.put('src/shutdown.js', 'export function shutdown(server) { server.close(); }\n');
    fx.put('scripts/setup.sh', 'sudo apt-get install -y nodejs\n');
});
afterAll(() => {
    fx.cleanup();
    if (saved.autoAll === undefined) delete process.env.AUTO_APPROVE_ALL; else process.env.AUTO_APPROVE_ALL = saved.autoAll;
    if (saved.autoSafe === undefined) delete process.env.AUTO_APPROVE_SAFE; else process.env.AUTO_APPROVE_SAFE = saved.autoSafe;
});

const SERVER = "import { shutdown } from './shutdown.js';\nprocess.on('SIGTERM', () => shutdown(server));\n";

describe('risk is read_file\'s and write_file\'s, never a word in the file', () => {
    it('the gate is on here: a high-risk tool still waits for the owner\'s approval', async () => {
        const r = await fx.run('delete_file', { path: 'project/src/shutdown.js' });
        expect([r.ok, r.error, r.output?.risk]).toEqual([false, 'approval_required', 'high']);
        expect(fx.exists('src/shutdown.js')).toBe(true);
    });

    it('write_file writes a file that says shutdown without an approval', async () => {
        const r = await fx.run('write_file', { path: 'project/legacy.js', content: SERVER });
        expect(r.error).not.toBe('approval_required');
        // write_file trims the content it is given; the words are what matter here.
        expect(fx.text('legacy.js').trimEnd()).toBe(SERVER.trimEnd());
    });

    it('so does file_write; file_edit, file_read, file_list and file_search pass whatever words their input holds', async () => {
        const write = await fx.run('engine_file_write', { path: 'src/server.js', content: SERVER });
        const edit = await fx.run('engine_file_edit', { path: 'src/server.js', old_text: 'shutdown(server));', new_text: 'shutdown(server)); // sudo is never needed' });
        const read = await fx.run('engine_file_read', { path: 'src/shutdown.js' });
        const list = await fx.run('engine_file_list', { pattern: '**/shutdown*' });
        const search = await fx.run('engine_file_search', { pattern: 'sudo' });
        expect([write, edit, read, list, search].map(r => [r.ok, r.error ?? null]))
            .toEqual([[true, null], [true, null], [true, null], [true, null], [true, null]]);
        expect(fx.text('src/server.js')).toContain('shutdown(server)); // sudo is never needed\n');
        expect(read.output.text).toContain('     1\texport function shutdown(server)');
        expect(list.output.text).toContain('src/shutdown.js');
        expect(search.output.text).toContain('scripts/setup.sh:1: sudo apt-get install -y nodejs');
    });
});
