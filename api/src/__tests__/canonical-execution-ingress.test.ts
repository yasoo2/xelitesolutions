import http from 'http';

describe('canonical execution ingress', () => {
    it('serves /api/runs and leaves every retired execution route absent', async () => {
        process.env.PERSISTENCE_MODE = 'JSON';
        process.env.OFFLINE_MODE = 'true';
        const { createApp } = await import('../api/app');
        const server = http.createServer(createApp());
        await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const request = (requestPath: string) => new Promise<number>((resolve, reject) => {
            const body = JSON.stringify({ text: 'test', goal: 'test' });
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: requestPath,
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) },
            }, response => {
                response.resume();
                response.once('end', () => resolve(response.statusCode || 0));
            });
            req.once('error', reject);
            req.end(body);
        });

        try {
            const canonical = await request('/api/runs/start');
            expect(canonical).not.toBe(404);

            for (const retired of [
                '/api/run/start',
                '/api/agent',
                '/api/build/project',
                '/api/tools/run',
                '/api/tools/selftest',
            ]) {
                const status = await request(retired);
                expect({ path: retired, status }).toEqual({ path: retired, status: 404 });
            }
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    }, 30_000);
});
