/**
 * FIELD HYGIENE + DURABILITY.
 *
 * (A) The [RAW-HTTP] line printed EVERY header of EVERY request — the
 *     user's full JWT included, which then landed in every log they
 *     shared. Headers are now opt-in (JOE_HTTP_DEBUG=1) and credentials
 *     are redacted even then.
 * (B) JSON-mode sessions/messages lived in RAM only: every update-joe
 *     restart erased every conversation while the boot log promised disk
 *     persistence. chat-store makes the promise true.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('the HTTP log never carries credentials', () => {
    it('the unconditional full-header dump is gone', () => {
        const app = read('api', 'app.ts');
        expect(app).not.toContain('[RAW-HTTP]');
        expect(app).toContain("JOE_HTTP_DEBUG || '') === '1'");
        expect(app).toContain("h.authorization = '[REDACTED]'");
        expect(app).toContain("h.cookie = '[REDACTED]'");
    });
    it('the chat stores are restored at app construction', () => {
        expect(read('api', 'app.ts')).toContain('loadChatStores()');
    });
});

describe('chat-store — conversations survive the restart', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-store-'));
    beforeAll(() => { process.env.JOE_CHAT_STORE_DIR = tmp; });
    afterAll(() => { delete process.env.JOE_CHAT_STORE_DIR; fs.rmSync(tmp, { recursive: true, force: true }); });

    it('flush → wipe → load restores sessions and messages', () => {
        const { flushChatStores, loadChatStores } = require('../api/chat-store');
        const g: any = global as any;
        g.mockSessions = [{ _id: 's1', title: 'محادثة الصور' }];
        g.mockMessages = [
            { _id: 'm1', sessionId: 's1', role: 'user', content: 'حلل هذه الصوره' },
            { _id: 'm2', sessionId: 's1', role: 'assistant', content: 'وصف المشهد الساحلي…' },
        ];
        flushChatStores();
        g.mockSessions = []; g.mockMessages = [];   // the "restart"
        loadChatStores();
        expect(g.mockSessions.map((s: any) => s._id)).toEqual(['s1']);
        expect(g.mockMessages.map((m: any) => m._id)).toEqual(['m1', 'm2']);
    });

    it('the persisted message store stays bounded (newest survive)', () => {
        const { flushChatStores, loadChatStores } = require('../api/chat-store');
        const g: any = global as any;
        g.mockSessions = [];
        g.mockMessages = Array.from({ length: 4100 }, (_, i) => ({ _id: `m${i}`, sessionId: 's', role: 'user', content: `n${i}` }));
        flushChatStores();
        g.mockMessages = [];
        loadChatStores();
        expect(g.mockMessages.length).toBe(4000);
        expect(g.mockMessages[g.mockMessages.length - 1]._id).toBe('m4099');
        g.mockMessages = []; g.mockSessions = [];
    });

    it('a live process never has its state clobbered by load', () => {
        const { loadChatStores } = require('../api/chat-store');
        const g: any = global as any;
        g.mockSessions = [{ _id: 'live' }];
        loadChatStores();
        expect(g.mockSessions[0]._id).toBe('live');
        g.mockSessions = [];
    });
});

describe('every store mutation schedules a persist', () => {
    const cases: Array<[string[], number]> = [
        [['api', 'routes', 'run.ts'], 1],
        [['modules', 'services', 'AgentLoopService.ts'], 1],
        [['api', 'controllers', 'sessionController.ts'], 5],
    ];
    for (const [file, min] of cases) {
        it(`${file.join('/')} persists after mutating`, () => {
            const src = read(...file);
            expect((src.match(/persistChatStores\(\)/g) || []).length).toBeGreaterThanOrEqual(min);
        });
    }
});
