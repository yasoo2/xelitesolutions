/**
 *  A WRITE IN PLACE, WITH NO LOCK, CAN LEAVE TWO DOCUMENTS IN ONE FILE.
 *
 *  Found on his machine while chasing why a reopened session showed no logs:
 *
 *      node -e "JSON.parse(readFileSync('api/data/db/run-evidence.json'))"
 *      → Unexpected non-whitespace character after JSON at position 769746
 *
 *  A complete JSON document, and then a second copy of its own tail sitting
 *  after the closing bracket. writeFile truncates and then streams, and two
 *  overlapping writes leave the shorter payload followed by the remains of
 *  the longer one. Nothing here stopped them overlapping.
 *
 *  Every read of that store threw, so every question asked of it answered
 *  with an exception — including the one the Logs panel needed.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

//  Its own directory, made before the store is imported. A guard that
//  writes into the live data/db races every suite that reads it — which
//  is exactly what this guard did on its first gate run, failing itself
//  and taking write-visible down with it.
const DB = path.join(os.tmpdir(), 'joe-jsondb-guard-' + process.pid);
fs.mkdirSync(DB, { recursive: true });

import { JsonStore } from '../shared/lib/jsondb';
const NAME = 'jsondb-guard-' + process.pid;
const FILE = path.join(DB, NAME + '.json');

interface Row { id?: string; _id?: string; n?: number; pad?: string }

afterEach(() => {
    for (const f of fs.existsSync(DB) ? fs.readdirSync(DB) : []) {
        if (f.startsWith(NAME)) { try { fs.unlinkSync(path.join(DB, f)); } catch { /* ignore */ } }
    }
});

afterAll(() => {
    fs.rmSync(DB, { recursive: true, force: true });
});

describe('a store keeps what it was given', () => {
    it('writes and reads back', async () => {
        const store = new JsonStore<Row>(NAME, DB);
        await store.create({ id: 'a', n: 1 });
        expect((await store.find({ id: 'a' })).map(r => r.n)).toEqual([1]);
    });
});

describe('…and never leaves half of two documents behind', () => {
    it('overlapping writes still leave a parseable file', async () => {
        //  The reproduction: a long payload and a short one, started together.
        //  Before the fix this is precisely how a valid document ended up with
        //  another document's tail glued to it.
        const store = new JsonStore<Row>(NAME, DB);
        const long = Array.from({ length: 400 }, (_, i) => ({ id: 'L' + i, n: i, pad: 'x'.repeat(200) }));
        const short = [{ id: 'S', n: 1 }];
        await Promise.all([
            ...long.map(r => store.create(r as Row)),
            store.create(short[0] as Row),
        ]);
        const raw = fs.readFileSync(FILE, 'utf-8');
        expect(() => JSON.parse(raw)).not.toThrow();
        expect(Array.isArray(JSON.parse(raw))).toBe(true);
    });

    it('no temporary file is left lying next to it', async () => {
        const store = new JsonStore<Row>(NAME, DB);
        await store.create({ id: 'a', n: 1 });
        const strays = fs.readdirSync(DB).filter(f => f.startsWith(NAME) && f.includes('.tmp'));
        expect(strays).toEqual([]);
    });
});

describe('a file that cannot be parsed is an empty store, not an exception', () => {
    it('reading damaged JSON returns nothing instead of throwing', async () => {
        const store = new JsonStore<Row>(NAME, DB);
        await store.create({ id: 'a', n: 1 });
        //  The exact shape found on disk: a whole document, then a fragment.
        fs.writeFileSync(FILE, '[{"id":"a"}]\n{"id":"a"}]', 'utf-8');
        await expect(store.find({})).resolves.toEqual([]);
    });

    it('…and the damaged file is kept aside, never destroyed', async () => {
        //  It is the only evidence of how it happened. An empty store is
        //  recoverable; a deleted one is not.
        const store = new JsonStore<Row>(NAME, DB);
        await store.create({ id: 'a', n: 1 });
        fs.writeFileSync(FILE, '[{"id":"a"}]garbage', 'utf-8');
        await store.find({});
        const kept = fs.readdirSync(DB).filter(f => f.startsWith(NAME) && f.includes('.corrupt-'));
        expect(kept.length).toBe(1);
        expect(fs.readFileSync(path.join(DB, kept[0]), 'utf-8')).toContain('garbage');
    });

    it('…and the store works again immediately afterwards', async () => {
        const store = new JsonStore<Row>(NAME, DB);
        fs.writeFileSync(FILE, 'not json at all', 'utf-8');
        await store.find({});
        await store.create({ id: 'b', n: 2 });
        expect((await store.find({ id: 'b' })).map(r => r.n)).toEqual([2]);
    });
});
