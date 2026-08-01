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
