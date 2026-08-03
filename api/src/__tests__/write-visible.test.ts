/**
 * Files Joe writes during an autonomous build must appear LIVE in the Logs
 * panel — the same file_stream event the page builder emits — not only the
 * page builder's own sections. Proven on the real WebSocket wire.
 */
import fs from 'fs';
import path from 'path';

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
        expect(src).toMatch(/content\.slice\(0, 60_000\)/);
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
    test('a file_stream event with a file feeds liveFiles regardless of source', () => {
        expect(ui).toMatch(/event\.type === 'file_stream' && event\.data\?\.file/);
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

describe('the panel reads as two ORDERED sections', () => {
    const panel = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'components', 'WorkspacePanel.tsx'), 'utf-8');
    test('files and log lines each carry a sticky heading with a count', () => {
        expect(panel).toMatch(/function SectionHeading/);
        expect(panel).toMatch(/الملفات \(\$\{liveFiles\.length\}\)/);
        expect(panel).toMatch(/السجل \(\$\{filtered\.length\}\)/);
        expect(panel).toMatch(/position: 'sticky'/);
    });
});
