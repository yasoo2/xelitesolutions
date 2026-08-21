/**
 * Files Joe writes during an autonomous build must appear LIVE in the Logs
 * panel — the same file_stream event the page builder emits — not only the
 * page builder's own sections. Proven on the real WebSocket wire.
 */
import fs from 'fs';
import path from 'path';
import { acceptPanelEventOnce, panelEventSessionId } from '../../../web/src/lib/panel-event-ownership';

describe('write_file — visible in the live Logs panel', () => {
    const src = fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'SystemTools.ts'), 'utf-8');

    test('write_file emits a file_stream event, not only a diff', () => {
        // The diff (for the HTML preview) stays; a file_stream is ADDED.
        expect(src).toMatch(/type: 'file_stream'/);
        expect(src).toMatch(/label: 'written to disk'/);
        expect(src).toMatch(/done: true/);
    });

    test('the streamed chunk is capped like the page builder caps its own', () => {
        expect(src).toMatch(/safeContent\.slice\(0, 60_000\)/);
    });

    test('the live view never breaks the write (best-effort broadcast)', () => {
        // The file_stream broadcast is wrapped so a failing socket cannot throw
        // after the file is already on disk.
        const at = src.indexOf("type: 'file_stream'");
        const before = src.slice(Math.max(0, at - 200), at);
        expect(before).toMatch(/try\s*\{/);
    });
});

describe('the Logs panel consumes file_stream for any file', () => {
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'JoeIDELayout.tsx'), 'utf-8');
    const ownership = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'lib', 'panel-event-ownership.ts'), 'utf-8');
    test('a file_stream event with a file feeds liveFiles regardless of source', () => {
        expect(ui).toMatch(/event\.type === 'file_stream' && event\.data\?\.file/);
    });
    test('ownership accepts nested session ids and deduplicates one event across envelopes', () => {
        expect(ownership).toContain('event?.data?.data?.sessionId');
        expect(ownership).toContain('event?.eventId');
        expect(ownership).toContain('event?.data?.eventId');
        expect(ui).toContain('acceptPanelEventOnce');
        expect(ui).toContain('panelEventSessionId(event)');
    });

    test('foreign-session events are rejected while the same wrapped event is accepted once', () => {
        const activeSession = 'run-current';
        const foreignEvent = { data: { data: { sessionId: 'run-foreign', eventId: 'evt-foreign', type: 'terminal_output' } } };
        expect(panelEventSessionId(foreignEvent)).toBe('run-foreign');
        expect(panelEventSessionId(foreignEvent)).not.toBe(activeSession);

        const seen = new Map<string, Set<string>>();
        const firstEnvelope = { data: { data: { sessionId: activeSession, eventId: 'evt-1', type: 'terminal_output' } } };
        const secondEnvelope = { data: { sessionId: activeSession, eventId: 'evt-1', type: 'terminal_output' } };
        expect(acceptPanelEventOnce(firstEnvelope, seen)).toBe(true);
        expect(acceptPanelEventOnce(secondEnvelope, seen)).toBe(false);
    });
});

/**
 * THE FIELD REPORT: «شاشة اللوجز تفتح لكن لا تعرض اللوجز والملفات التي تبنى
 * بشكل صحيح ومرتب».
 *
 * Two causes, both locked here. The project builders wrote every file
 * without ever announcing one, so the panel's file list stayed empty on a
 * React or API build; and the panel ignored `terminal_output` — the channel
 * every builder narrates through — so it showed four generic lines while the
 * real build stream went only to the Terminal tab.
 */
describe('project builders announce every file they write', () => {
    for (const tool of ['ReactProjectTool', 'ApiProjectTool']) {
        test(`${tool} emits file_stream for each written file`, () => {
            const src = fs.readFileSync(
                path.join(__dirname, '..', 'modules', 'tools', 'definitions', `${tool}.ts`), 'utf-8');
            const at = src.indexOf('for (const [rel, body] of Object.entries(files))');
            expect(at).toBeGreaterThan(0);
            const loop = src.slice(at, at + 900);
            expect(loop).toMatch(/writeFileSync/);
            expect(loop).toMatch(/type: 'file_stream'/);
            expect(loop).toMatch(/file: rel/);
            expect(loop).toMatch(/chunk: body/);
            expect(loop).toMatch(/done: true/);
            // A dead socket must never break a file that is already on disk.
            expect(loop).toMatch(/try\s*\{[\s\S]*broadcast[\s\S]*\}\s*catch/);
        });
    }
});

describe('the Logs panel shows the build it is watching', () => {
    const ui = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'JoeIDELayout.tsx'), 'utf-8');

    test('terminal_output feeds the log — taken from ONE id, so no quadruple lines', () => {
        expect(ui).toMatch(/event\.type === 'terminal_output'/);
        expect(ui).toMatch(/event\.id === 'panel-terminal'/);
        expect(ui).not.toMatch(/Optional: Add terminal output to logs/);
    });
    test('the Arabic stage narration lands in the log too', () => {
        expect(ui).toMatch(/event\.type === 'thinking_detail' && event\.data\?\.detail/);
    });
    test('ANSI colour codes never reach the DOM', () => {
        expect(ui).toMatch(/replace\(\/\\x1B\\\[\[0-9;\]\*\[A-Za-z\]\/g, ''\)/);
    });
    test('a long build cannot grow the tab out of memory', () => {
        expect(ui).toMatch(/MAX_LOG_LINES = \d+/);
        expect(ui).toMatch(/capLogs\(/);
    });
});

/**
 * The headings used to be Arabic literals in the component, and this test
 * pinned the literals. Then the panel was translated and the literals moved
 * into i18n — which broke the pin without breaking anything a user sees.
 *
 * A pin that only knows one spelling of a sentence is guarding the sentence,
 * not the behaviour. What matters is that each section still carries a sticky
 * heading whose count comes from the list it heads. So the pin now follows the
 * count to its source, and — because the words live in a catalogue now — also
 * checks BOTH locales still carry the placeholder. That is something the old
 * hard-coded assertion could not check at all.
 */
describe('the panel reads as two ORDERED sections', () => {
    const webSrc = path.join(__dirname, '..', '..', '..', 'web', 'src');
    const panel = fs.readFileSync(path.join(webSrc, 'components', 'WorkspacePanel.tsx'), 'utf-8');
    const i18n = fs.readFileSync(path.join(webSrc, 'i18n.ts'), 'utf-8');

    test('files and log lines each carry a sticky heading with a count', () => {
        expect(panel).toMatch(/function SectionHeading/);
        expect(panel).toMatch(/t\(\s*'wsFilesCount'\s*,\s*\{\s*n:\s*liveFiles\.length\s*\}\s*\)/);
        expect(panel).toMatch(/t\(\s*'wsLogCount'\s*,\s*\{\s*n:\s*filtered\.length\s*\}\s*\)/);
        expect(panel).toMatch(/position: 'sticky'/);
    });

    test('every locale keeps the count in the heading it translates', () => {
        for (const key of ['wsFilesCount', 'wsLogCount']) {
            const spellings = [...i18n.matchAll(new RegExp(`${key}:\\s*'([^']*)'`, 'g'))].map(m => m[1]);
            // one per locale — a heading that exists in only one language is a
            // heading that renders as its own key for everyone else.
            expect(spellings.length).toBeGreaterThanOrEqual(2);
            for (const spelling of spellings) expect(spelling).toContain('{{n}}');
        }
    });
});

/**
 * ONE LINE, ONE MESSAGE.
 *
 * Every builder used to fan the same terminal line out to four ids, because
 * any of those tabs might be the one in front of the user. The field log
 * shows the bill: four `[WS] Broadcast type=terminal_output` entries and
 * four `websocket.outbound.sent` records for a single 58-byte line — on
 * every line of every build. The addressing now travels INSIDE the message.
 */
describe('the terminal stream is sent once, not four times', () => {
    const ws = fs.readFileSync(path.join(__dirname, '..', 'api', 'ws.ts'), 'utf-8');

    test('a single helper owns the addressing', () => {
        expect(ws).toContain('export function broadcastTerminalLine');
        const at = ws.indexOf('export function broadcastTerminalLine');
        const body = ws.slice(at, ws.indexOf('\n}', at));
        expect(body).toContain("id: 'panel-terminal'");      // unchanged for anything filtering on id
        expect(body).toContain('ids');                        // …and the full address list rides along
        expect((body.match(/broadcast\(/g) || []).length).toBe(1);
    });

    test('NO builder fans a line out by hand any more', () => {
        const files = ['ReactProjectTool', 'ApiProjectTool', 'ImportProjectTool', 'WebPageBuilderTool']
            .map(f => path.join(__dirname, '..', 'modules', 'tools', 'definitions', `${f}.ts`))
            .concat([path.join(__dirname, '..', 'modules', 'services', 'ToolService.ts')]);
        for (const f of files) {
            const src = fs.readFileSync(f, 'utf-8');
            expect(src).not.toContain("'local', 'default', 'panel-terminal'");
            expect(src).toContain('broadcastTerminalLine');
        }
    });

    test('the terminal panel reads the address list, so no tab loses a line', () => {
        const panel = fs.readFileSync(
            path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'terminal', 'EnterpriseTerminalPanel.tsx'), 'utf-8');
        expect(panel).toContain('Array.isArray(msg.ids) && msg.ids.includes(activeTabId)');
        expect(panel).toContain("msg.id === 'joe-agent'");    // the autonomous stream still shows
    });
});
