import fs from 'fs';
import path from 'path';

const readWeb = (...parts: string[]) => fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'web', 'src', ...parts),
    'utf8',
);

describe('live chat socket recovery', () => {
    it('never abandons reconnecting and waits for the live channel before starting a run', () => {
        const socket = readWeb('services', 'socket.ts');
        const composer = readWeb('components', 'CommandComposer.tsx');

        expect(socket).not.toContain('max_reconnect_attempts_exceeded');
        expect(socket).toContain('async ensureConnected(timeoutMs = 3000)');
        expect(socket).toContain('connectAttempts = 0;');
        expect(composer).toMatch(/await SocketService\.ensureConnected\(\);\s*const res = await fetch\(`\$\{API\}\/runs\/start`/);
    });
});
