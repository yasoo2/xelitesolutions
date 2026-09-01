import fs from 'fs';
import path from 'path';

describe('Windows terminal sessions', () => {
    test('start PowerShell without a user profile that can block automation', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '..', 'kernel', 'ExecutionEngine.ts'), 'utf-8');
        expect(source).toMatch(/powershell.*NoLogo.*NoProfile.*NoExit/s);
    });
});
