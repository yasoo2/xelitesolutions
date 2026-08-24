/**
 *  A LOG NOBODY WROTE DOWN CANNOT BE SHOWN AGAIN.
 *
 *  The preview came back the moment something asked the server for it — the
 *  built directory had been on disk all along. The logs did not, and the
 *  reason was worse than a missing question. Measured on his own store:
 *
 *      grep 6a8c1ef9433c894099603359 run-evidence.json   →  0
 *      grep 6a8c0be84bb5104928e21f46 run-evidence.json   →  0
 *      grep 6a8c269c433c89409960335d run-evidence.json   →  0
 *
 *  Not one of the sessions in the row at the bottom of his screen had a single
 *  recorded event. The lines he watches were broadcast to a socket and then
 *  forgotten, so nothing on this machine could restore them.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const DIR = path.join(os.tmpdir(), 'joe-session-log-test-' + process.pid);

beforeEach(() => {
    fs.rmSync(DIR, { recursive: true, force: true });
    fs.mkdirSync(DIR, { recursive: true });
    process.env.JOE_CHAT_STORE_DIR = DIR;
    (global as any).joeSessionLogs = {};
    jest.resetModules();
});

afterAll(() => {
    delete process.env.JOE_CHAT_STORE_DIR;
    delete (global as any).joeSessionLogs;
    fs.rmSync(DIR, { recursive: true, force: true });
});

const load = () => require('../core/session/session-log-store');

describe('what the panel would have drawn is what is kept', () => {
    it('a step line is recorded under its own session', () => {
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'step_started', data: { name: 'scaffold_project' }, ts: new Date(2026, 7, 24, 9, 1, 2).getTime() });
        expect(s.sessionLogLines('sess-a')).toEqual(['[09:01:02] Step Started: scaffold_project']);
    });

    it('…and never under another one', () => {
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'step_done', data: {}, ts: 1 });
        expect(s.sessionLogLines('sess-b')).toEqual([]);
    });

    it('an event that draws nothing is not recorded', () => {
        //  The negative that keeps the store from becoming a copy of the wire.
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'heartbeat', data: { n: 1 }, ts: 1 });
        expect(s.sessionLogLines('sess-a')).toEqual([]);
    });

    it('an event with no session belongs to nobody', () => {
        const s = load();
        s.recordSessionEvent('', { type: 'step_done', data: {}, ts: 1 });
        s.recordSessionEvent(undefined, { type: 'step_done', data: {}, ts: 1 });
        expect(Object.keys((global as any).joeSessionLogs)).toEqual([]);
    });

    it('the build\u2019s own voice is kept line by line', () => {
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'terminal_output', id: 'panel-terminal', data: 'npm install\nadded 42 packages', ts: new Date(2026, 7, 24, 9, 0, 0).getTime() });
        expect(s.sessionLogLines('sess-a')).toEqual(['[09:00:00] npm install', '[09:00:00] added 42 packages']);
    });

    it('a long session keeps its newest lines and drops its oldest', () => {
        const s = load();
        for (let i = 0; i < s.MAX_LINES_PER_SESSION + 20; i += 1) {
            s.recordSessionEvent('sess-a', { type: 'text', data: { text: 'line ' + i }, ts: 1000 });
        }
        const lines = s.sessionLogLines('sess-a');
        expect(lines).toHaveLength(s.MAX_LINES_PER_SESSION);
        expect(lines[lines.length - 1]).toContain('line ' + (s.MAX_LINES_PER_SESSION + 19));
        expect(lines[0]).toContain('line 20');
    });

    it('what it hands back cannot be edited from outside', () => {
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'step_done', data: {}, ts: 1 });
        s.sessionLogLines('sess-a').push('forged');
        expect(s.sessionLogLines('sess-a')).toHaveLength(1);
    });
});

describe('it survives the restart, and never half-written', () => {
    it('lines written before a restart are there after it', async () => {
        const s = load();
        s.recordSessionEvent('sess-a', { type: 'run_finished', data: {}, ts: new Date(2026, 7, 24, 10, 0, 0).getTime() });
        //  The write is debounced; wait past it rather than reaching inside.
        await new Promise(r => setTimeout(r, 1800));
        expect(fs.existsSync(path.join(DIR, 'joe-session-logs.json'))).toBe(true);

        //  A fresh process: empty memory, same disk.
        (global as any).joeSessionLogs = {};
        jest.resetModules();
        const again = load();
        again.loadSessionLogs();
        expect(again.sessionLogLines('sess-a')).toEqual(['[10:00:00] Run Finished']);
    });

    it('the file it writes is always parseable', async () => {
        //  run-evidence.json on his machine is currently NOT: a second copy of
        //  its tail sits after the closing bracket, and the reader that trips
        //  over it returns nothing for every session at once.
        const s = load();
        for (let i = 0; i < 30; i += 1) s.recordSessionEvent('sess-' + i, { type: 'step_done', data: {}, ts: 1 });
        await new Promise(r => setTimeout(r, 1800));
        const raw = fs.readFileSync(path.join(DIR, 'joe-session-logs.json'), 'utf-8');
        expect(() => JSON.parse(raw)).not.toThrow();
    });

    it('a corrupt file on disk is an empty log, never a crash', () => {
        fs.writeFileSync(path.join(DIR, 'joe-session-logs.json'), '{"a":1}]]garbage', 'utf-8');
        (global as any).joeSessionLogs = {};
        jest.resetModules();
        const s = load();
        expect(() => s.loadSessionLogs()).not.toThrow();
        expect(s.sessionLogLines('sess-a')).toEqual([]);
    });
});
