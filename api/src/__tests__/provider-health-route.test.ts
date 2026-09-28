import express from 'express';
import http from 'http';
import jwt from 'jsonwebtoken';
import providerRoutes from '../api/routes/providers';
import { config } from '../shared/config';
import {
    providerCircuitKey,
    recordProviderCircuitFailure,
    resetProviderContinuityForTests,
} from '../core/llm/provider-continuity';

describe('read-only local provider health', () => {
    let server: http.Server;
    let port: number;
    const key = providerCircuitKey('Local (Auto)');

    beforeAll(async () => {
        const app = express();
        app.use('/api/providers', providerRoutes);
        server = http.createServer(app);
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        port = typeof address === 'object' && address ? address.port : 0;
    });

    afterAll(async () => {
        await new Promise<void>(resolve => server.close(() => resolve()));
    });

    beforeEach(() => resetProviderContinuityForTests());

    async function health(token?: string): Promise<{ status: number; body: any }> {
        return new Promise((resolve, reject) => {
            const request = http.get({
                hostname: '127.0.0.1', port, path: '/api/providers/health/local',
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            }, response => {
                let body = '';
                response.on('data', chunk => { body += chunk; });
                response.on('end', () => resolve({ status: response.statusCode || 0, body: JSON.parse(body) }));
            });
            request.on('error', reject);
        });
    }

    it('requires authentication and exposes no credential or circuit key', async () => {
        expect((await health()).status).toBe(401);
        expect((await health('invalid-token')).status).toBe(401);
        const token = jwt.sign({ sub: 'health-test', role: 'USER' }, config.jwtSecret);
        const response = await health(token);
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ provider: 'local', blocked: false });
        expect(JSON.stringify(response.body)).not.toContain(key);
        expect(Object.keys(response.body).sort()).toEqual(['blocked', 'checkedAt', 'provider']);
    });

    it('reports the same cooldown and recovery-eligible state as the router without probing', async () => {
        const token = jwt.sign({ sub: 'health-test', role: 'USER' }, config.jwtSecret);
        const now = Date.now();
        recordProviderCircuitFailure(key, { status: 429, headers: { 'retry-after': '40' } }, now);
        const blocked = await health(token);
        expect(blocked.body).toMatchObject({ provider: 'local', blocked: true, state: 'RATE_LIMITED' });
        expect(blocked.body.retryAt).toBe(now + 40_000);

        resetProviderContinuityForTests();
        recordProviderCircuitFailure(key, { status: 429, headers: { 'retry-after': '1' } }, now - 2_000);
        const recoverable = await health(token);
        expect(recoverable.body).toMatchObject({ provider: 'local', blocked: false, state: 'RATE_LIMITED' });
        expect(recoverable.body.retryAt).toBe(now - 1_000);
    });
});
