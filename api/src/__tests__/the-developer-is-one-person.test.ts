import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';
import jwt from 'jsonwebtoken';
import { config } from '../shared/config';

/**
 * Owner, 2026-10-23: «inside Joe the system doesn't work». In development the
 * UI signs in through /api/auth/dev, which minted a token for a hard-coded id
 * (507f…011), while every request without a token — auth bypass, the eval
 * runner, the extension — acts as config.localUserId. The developer was two
 * people: the UI could not see a single session the rest of Joe created.
 */
describe('the developer is one person', () => {
    const saved = process.env.NODE_ENV;
    afterEach(() => { process.env.NODE_ENV = saved; });

    it('the dev token names the same local owner the auth bypass uses', async () => {
        process.env.NODE_ENV = 'development';
        jest.resetModules();
        const authRoutes = require('../api/routes/auth').default || require('../api/routes/auth');
        const app = express();
        app.use(express.json());
        app.use('/api/auth', authRoutes);
        const server = http.createServer(app);
        await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
        try {
            const port = (server.address() as AddressInfo).port;
            const res = await new Promise<string>((resolve, reject) => {
                const req = http.request({ host: '127.0.0.1', port, path: '/api/auth/dev', method: 'POST' }, r => {
                    let body = ''; r.on('data', c => { body += c; }); r.on('end', () => resolve(body));
                });
                req.on('error', reject); req.end();
            });
            const token = JSON.parse(res).token;
            const payload: any = jwt.verify(token, config.jwtSecret);
            expect(payload.sub).toBe(config.localUserId);
            expect(payload.role).toBe('OWNER');
        } finally { server.close(); }
    });
});
