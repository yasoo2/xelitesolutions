import fs from 'fs';
import os from 'os';
import path from 'path';
import { executionEngine } from '../kernel/ExecutionEngine';
import { installProgressProbe } from '../shared/network-install-timeouts';

/**
 * Review r21 (d04229f1): the install progress probe lstat-ed files and
 * stopped after 200 000 of them — always the same ones, in the same order.
 * An install writing outside that subset (a big project, a shared cache)
 * looked idle and was killed after five silent minutes.
 *
 * The temp projects below are real. One folder in the first test stands in
 * for 200 001 installed files: its listing is served from memory, because
 * writing that many files would take this machine minutes — the probe is
 * still asked the same questions of the filesystem either way.
 */
const roots: string[] = [];
const tmp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-install-subset-')); roots.push(d); return d; };
afterEach(() => jest.restoreAllMocks());
afterAll(() => { for (const r of roots) fs.rmSync(r, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

describe('an install writing past any subset is not idle', () => {
    jest.setTimeout(60_000);

    it('a write after 200 001 installed files is progress', async () => {
        const dir = tmp();
        const early = path.join(dir, 'node_modules', 'aaa-early');
        const big = path.join(dir, 'node_modules', 'zzz-big');
        fs.mkdirSync(early, { recursive: true });
        fs.mkdirSync(big, { recursive: true });
        fs.writeFileSync(path.join(early, 'index.js'), 'module.exports = 1;');
        // Installed an hour ago: this install's writes are what comes next.
        const anHourAgo = new Date(Date.now() - 3600_000);
        for (const at of [path.join(early, 'index.js'), early, big, path.dirname(big)]) fs.utimesSync(at, anHourAgo, anHourAgo);
        const installed = Array.from({ length: 200_001 }, (_, i) => ({
            name: `f${i}.js`, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false,
        }));
        const readdir = fs.promises.readdir.bind(fs.promises);
        const lstat = fs.promises.lstat.bind(fs.promises);
        jest.spyOn(fs.promises, 'readdir').mockImplementation((async (at: any, options: any) =>
            path.resolve(String(at)) === big ? installed : readdir(at, options)) as any);
        jest.spyOn(fs.promises, 'lstat').mockImplementation((async (at: any, options: any) =>
            path.dirname(path.resolve(String(at))) === big ? { size: 1, mtimeMs: anHourAgo.getTime() } : lstat(at, options)) as any);

        const probe = installProgressProbe(dir, []);
        const first = await probe();
        expect(await probe()).toBe(first); // nothing written: the same mark
        fs.writeFileSync(path.join(early, 'package.json'), '{"name":"aaa-early"}');
        expect(await probe()).not.toBe(first);
    });

    it('a tarball that keeps growing in place, deep in a folder, keeps a silent install alive', async () => {
        const dir = tmp();
        // Silent; creates one file deep inside node_modules, then only appends to it, for
        // six idle bounds after the creation — only the growing file says it is alive.
        const writer = [
            '-e',
            `const fs=require('fs'),p=require('path');const d=p.join(${JSON.stringify(dir)},'node_modules','.staging','pkg-1a2b','package');`
            + `fs.mkdirSync(d,{recursive:true});const f=p.join(d,'big.tgz');fs.writeFileSync(f,'');let i=0;`
            + `const t=setInterval(()=>{fs.appendFileSync(f,'x'.repeat(1024));if(++i>=24){clearInterval(t);process.exit(0);}},250);`,
        ];
        const r = await executionEngine.runArgvStreaming('node', writer, {
            cwd: dir, timeout: 40_000, idleTimeout: 1000, idleProgress: installProgressProbe(dir, []),
        }).done;
        expect(r).toEqual({ ok: true, exitCode: 0 });
        expect(fs.statSync(path.join(dir, 'node_modules', '.staging', 'pkg-1a2b', 'package', 'big.tgz')).size).toBe(24 * 1024);
    });

    it('each install owns its probe: a write in one project is not progress of another', async () => {
        const a = tmp();
        const b = tmp();
        const probeA = installProgressProbe(a, []);
        const probeB = installProgressProbe(b, []);
        const [a0, b0] = [await probeA(), await probeB()];
        fs.mkdirSync(path.join(a, 'node_modules', 'react'), { recursive: true });
        fs.writeFileSync(path.join(a, 'node_modules', 'react', 'index.js'), 'x');
        expect(await probeA()).not.toBe(a0);
        expect(await probeB()).toBe(b0);
    });
});
