import fs from 'fs';
import path from 'path';

describe('guest identity survives a transient websocket policy close', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', '..', '..', 'web', 'src', 'services', 'socket.ts'),
        'utf8',
    );

    it('asks the authenticated HTTP boundary before deleting a valid token', () => {
        const policyClose = source.indexOf("ev?.code === 1008");
        const probe = source.indexOf('probeAuth(tokenNow)', policyClose);
        const explicit401 = source.indexOf("result === 'unauthorized'", probe);
        const removal = source.indexOf("localStorage.removeItem('token')", policyClose);

        expect(policyClose).toBeGreaterThan(0);
        expect(probe).toBeGreaterThan(policyClose);
        expect(explicit401).toBeGreaterThan(probe);
        expect(removal).toBeGreaterThan(policyClose);
        expect(source.slice(policyClose, probe)).toContain('isValidToken(tokenNow)');
        expect(source.slice(probe, explicit401 + 80)).toContain("invalidate('probe_401')");
    });
});
