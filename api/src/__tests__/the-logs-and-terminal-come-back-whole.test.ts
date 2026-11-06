/**
 * A reopened conversation shows its whole log once, and its terminal shows the
 * commands Joe ran. Measured on 2026-11-05 on the clinic: 93 lines on one
 * load, «No logs yet» on the next; 142 of 500 restored lines doubled; the
 * Terminal tab an empty shell after dozens of commands.
 */
import fs from 'fs';
import path from 'path';
import { mergeLogSources } from '../core/session/log-line';
import { recordSessionEvent, sessionTerminal, MAX_TERMINAL_PER_SESSION } from '../core/session/session-log-store';
import { mergeRestoredLogs } from '../../../web/src/lib/log-restore';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', '..', '..', ...p), 'utf8');

describe('the logs and the terminal come back whole', () => {
    //  The store writes its file in the background: never into the checkout.
    beforeAll(() => { process.env.JOE_CHAT_STORE_DIR = fs.mkdtempSync(path.join(require('os').tmpdir(), 'joe-logs-')); });

    it('the server sends one log, not the session log and the run record both', () => {
        const session = ['[22:13:29] ▶ engine_file_search', '[22:13:30] Step Done', '[22:13:39] Step Done'];
        const evidence = ['[21:01:00] an older run', '[22:13:29] ▶ engine_file_search', '[22:13:30] Step Done', '[22:13:40] Step Done'];
        expect(mergeLogSources(session, evidence)).toEqual(['[21:01:00] an older run', ...session]);
        expect(mergeLogSources([], evidence)).toEqual(evidence);
    });

    it('a line that really repeats keeps every copy', () => {
        const session = ['[1] Step Done', '[2] Step Done'];
        const evidence = ['[0] Step Done', '[1] Step Done', '[2] Step Done'];
        expect(mergeLogSources(session, evidence)).toEqual(['[0] Step Done', '[1] Step Done', '[2] Step Done']);
    });

    it('the panel keeps the record when a live line beat it, without doubling the overlap', () => {
        const restored = ['[22:19:42] engine_file_read client/src/pages/Reports.jsx', '[22:19:43] Step Done'];
        const live = ['[22:19:43] Step Done', '[22:19:44] ▶ engine_file_write'];
        expect(mergeRestoredLogs(restored, live)).toEqual([...restored, '[22:19:44] ▶ engine_file_write']);
        expect(mergeRestoredLogs(restored, [])).toEqual(restored);
        expect(mergeRestoredLogs([], live)).toEqual(live);
    });

    it('the panel merges instead of keeping whichever came first', () => {
        const layout = read('web', 'src', 'components', 'JoeIDELayout.tsx');
        expect(layout).toMatch(/setLogs\(prev => capLogs\(mergeRestoredLogs\(lines, prev\)\)\)/);
        expect(layout).not.toMatch(/setLogs\(prev => \(prev\.length \? prev : capLogs\(lines\)\)\)/);
        // A background session's log grows by the same rule as the visible one.
        const archive = layout.slice(layout.indexOf("event.type === 'terminal_output' || event.type === 'log'"), layout.indexOf("event.type === 'build_status'"));
        expect(archive).toMatch(/logTextFor\(event/);
    });

    it('a session keeps what its terminal printed, past a restart of Joe, bounded', () => {
        const id = `sess-terminal-${Date.now()}`;
        recordSessionEvent(id, { type: 'terminal_output', ts: 1, data: 'joe-app-3904577852 $ npm install\r\n' });
        recordSessionEvent(id, { type: 'terminal_output', ts: 2, data: 'added 65 packages in 17s\r\n' });
        recordSessionEvent(id, { type: 'step_started', ts: 3, data: { name: 'engine:file_write' } });
        expect(sessionTerminal(id)).toBe('joe-app-3904577852 $ npm install\r\nadded 65 packages in 17s\r\n');
        recordSessionEvent(id, { type: 'terminal_output', ts: 4, data: 'x'.repeat(MAX_TERMINAL_PER_SESSION + 10) });
        expect(sessionTerminal(id).length).toBe(MAX_TERMINAL_PER_SESSION);
        expect(sessionTerminal('another-session')).toBe('');
        // It is part of what is written to disk (the store's own file).
        const store = read('api', 'src', 'core', 'session', 'session-log-store.ts');
        expect(store).toMatch(/interface SessionLog \{ lines: string\[\]; at: number; terminal\?: string; \}/);
        expect(read('api', 'src', 'api', 'controllers', 'sessionController.ts')).toMatch(/terminal = sessionTerminal\(sessionId\) \|\| terminal;/);
    });

    it('the workspace route returns the terminal\'s record and the page seeds it', () => {
        const controller = read('api', 'src', 'api', 'controllers', 'sessionController.ts');
        expect(controller).toMatch(/mergeLogSources\(sessionLogLines\(sessionId\), evidenceLines\)/);
        expect(controller).toMatch(/res\.json\(\{ preview, logs: [^}]*terminal \}\)/);
        expect(read('web', 'src', 'components', 'JoeIDELayout.tsx')).toMatch(/SocketService\.seedTerminalHistory\(asked, data\.terminal\)/);
        expect(read('web', 'src', 'services', 'socket.ts')).toMatch(/seedTerminalHistory\(sessionId: string, text: string\) \{\s*const runtime = getSessionRuntime\(sessionId\);\s*if \(runtime\.terminalHistory \|\| !text\) return false;/);
    });
});
