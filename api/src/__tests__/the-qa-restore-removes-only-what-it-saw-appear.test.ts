/**
 * THE QA'S RESTORE REMOVES ONLY WHAT IT SAW APPEAR, AND HEARS A SERVER ON EITHER LOCALHOST.
 *
 * The adversarial review of 2026-11-12 drove the real functions:
 *
 *   An app with a database (data/app.db, -wal, -shm) and 2,100 photos in
 *   uploads/. The walk stops at 2,000 data files, so the snapshot saw the
 *   database and 1,997 photos. The server closed the database cleanly, its
 *   -wal and -shm files went away, the next walk slid by two — and the two
 *   photos it now saw, never in the snapshot, were removed as files «the QA
 *   made the app create». The owner's own photos.
 *
 *   A server bound to ::1 alone (a dev server that ignores HOST, a
 *   listen(port, 'localhost') that resolves to IPv6) was reported gone from
 *   http://localhost:PORT in milliseconds, and files were written back under it.
 */
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { addressIsFree, restoreAppData, snapshotAppData, discardSnapshot } from '../core/quality/qa-leaves-no-trace';

const PHOTOS = 2100;

describe('a walk that stopped at its cap', () => {
    let root: string;
    beforeAll(async () => {
        root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-qa-cap-'));
        await fs.promises.mkdir(path.join(root, 'data'), { recursive: true });
        await fs.promises.mkdir(path.join(root, 'uploads'), { recursive: true });
        for (const f of ['app.db', 'app.db-wal', 'app.db-shm']) await fs.promises.writeFile(path.join(root, 'data', f), `x-${f}`);
        for (let i = 1; i <= PHOTOS; i++) await fs.promises.writeFile(path.join(root, 'uploads', `img-${String(i).padStart(4, '0')}.jpg`), `photo ${i}`);
    }, 300_000);
    afterAll(async () => { await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

    it('removes none of the owner\'s files when the database\'s journal files went away', async () => {
        const snap = await snapshotAppData(root);
        expect(snap.complete).toBe(false);
        //  The server closed the database cleanly: its journal files are gone.
        await fs.promises.rm(path.join(root, 'data', 'app.db-wal'));
        await fs.promises.rm(path.join(root, 'data', 'app.db-shm'));
        const r = await restoreAppData(snap);
        await discardSnapshot(snap);
        expect(r.removed).toEqual([]);
        const photos = await fs.promises.readdir(path.join(root, 'uploads'));
        expect(photos.length).toBe(PHOTOS);
    }, 300_000);

    it('still puts back a file it saw and the QA changed', async () => {
        const db = path.join(root, 'data', 'app.db');
        await fs.promises.writeFile(db, 'owner');
        const snap = await snapshotAppData(root);
        await fs.promises.writeFile(db, 'owner + a QA record');
        const r = await restoreAppData(snap);
        await discardSnapshot(snap);
        expect(await fs.promises.readFile(db, 'utf8')).toBe('owner');
        expect(r.restored.map(f => f.replace(/\\/gu, '/'))).toContain('data/app.db');
        expect(r.removed).toEqual([]);
    }, 300_000);
});

describe('a walk that saw every data file', () => {
    it('removes a file the QA made the app create, as before', async () => {
        const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'joe-qa-whole-'));
        try {
            await fs.promises.mkdir(path.join(root, 'data'), { recursive: true });
            await fs.promises.writeFile(path.join(root, 'data', 'db.json'), '{"items":[]}');
            const snap = await snapshotAppData(root);
            expect(snap.complete).toBe(true);
            await fs.promises.writeFile(path.join(root, 'data', 'qa-upload.png'), 'made by the QA');
            const r = await restoreAppData(snap);
            await discardSnapshot(snap);
            expect(r.removed.map(f => f.replace(/\\/gu, '/'))).toEqual(['data/qa-upload.png']);
            expect(fs.existsSync(path.join(root, 'data', 'qa-upload.png'))).toBe(false);
        } finally {
            await fs.promises.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
        }
    }, 120_000);
});

describe('a server on localhost', () => {
    it('is heard on ::1 as well as on 127.0.0.1', async () => {
        const server = net.createServer(s => s.destroy());
        const listening = await new Promise<boolean>(resolve => {
            server.once('error', () => resolve(false));
            server.listen(0, '::1', () => resolve(true));
        });
        if (!listening) return;   // no IPv6 on this machine: nothing to hear
        const port = (server.address() as net.AddressInfo).port;
        const url = `http://localhost:${port}/`;
        try {
            expect(await addressIsFree(url, 600)).toBe(false);
        } finally {
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
        expect(await addressIsFree(url, 600)).toBe(true);
    }, 60_000);
});
