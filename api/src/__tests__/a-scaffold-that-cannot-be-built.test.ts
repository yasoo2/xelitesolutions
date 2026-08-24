/**
 *  A SCAFFOLD THAT CANNOT BE BUILT IS NOT A SCAFFOLD.
 *
 *  Measured live, sixteen minutes into a real run on his machine:
 *
 *      Failed phase: Final Testing and Deployment
 *      error during build:
 *      Could not resolve entry module "index.html".
 *
 *  The project the pipeline had written: docs, node_modules, package.json,
 *  src, vite.config.js — and no index.html. Vite cannot build without one,
 *  and nothing between the scaffold and the last phase asked whether it
 *  was there. He watched all sixteen minutes of it.
 *
 *  The reproduction is exact — I ran the failing build myself in the
 *  directory Joe left behind, and the error above is its verbatim output,
 *  not the transcript's summary of it.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { completeTheEntryPoint } from '../core/agents/scaffold-entry';

let dir = '';
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-')); });
afterEach(() => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* windows holds handles */ } });

const write = (rel: string, body: string) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body, 'utf-8');
};
const VITE_PKG = JSON.stringify({ name: 'x', scripts: { build: 'vite build' } });

describe('it completes what the toolchain requires', () => {
    //  POSITIVE — his exact case: a Vite project, one entry module, no HTML.
    it('writes the index.html a Vite project cannot build without', () => {
        write('package.json', VITE_PKG);
        write('vite.config.js', 'export default {}');
        write('src/main.jsx', 'console.log(1)');

        const r = completeTheEntryPoint(dir);

        expect(r.missing).toBe(false);
        expect(r.wrote).toBe('index.html');
        const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf-8');
        expect(html).toContain('src="/src/main.jsx"');
        expect(html).toContain('id="root"');
    });

    //  POSITIVE — the entry it points at is the one that is actually there.
    it.each(['main.tsx', 'main.ts', 'index.jsx'])('points at src/%s when that is the entry', (entry) => {
        write('package.json', VITE_PKG);
        write('src/' + entry, '');
        expect(completeTheEntryPoint(dir).wrote).toBe('index.html');
        expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf-8')).toContain('src="/src/' + entry + '"');
    });

    //  POSITIVE — a config alone is enough of a declaration; no script needed.
    it('recognises a Vite project from its config file', () => {
        write('package.json', JSON.stringify({ name: 'x' }));
        write('vite.config.ts', 'export default {}');
        write('src/main.ts', '');
        expect(completeTheEntryPoint(dir).wrote).toBe('index.html');
    });
});

describe('it refuses rather than guesses', () => {
    //  NEGATIVE — no entry module at all. Writing an index.html pointing at a
    //  file that does not exist would turn one honest failure into a
    //  mysterious one.
    it('fails loudly when there is nothing to point an entry at', () => {
        write('package.json', VITE_PKG);
        write('vite.config.js', 'export default {}');

        const r = completeTheEntryPoint(dir);

        expect(r.missing).toBe(true);
        expect(r.wrote).toBe('');
        expect(r.reason).toContain('index.html');
        expect(r.reason).toContain('no single entry module');
    });

    //  NEGATIVE — two candidates is a guess, and a guess here is a wrong
    //  application that builds.
    it('fails loudly when the entry is ambiguous', () => {
        write('package.json', VITE_PKG);
        write('src/main.jsx', '');
        write('src/main.tsx', '');

        const r = completeTheEntryPoint(dir);

        expect(r.missing).toBe(true);
        expect(r.reason).toContain('ambiguous');
        expect(fs.existsSync(path.join(dir, 'index.html'))).toBe(false);
    });
});

describe('it stays out of the way of everything else', () => {
    //  NEGATIVE — a project that already has its entry is untouched, byte for
    //  byte. A guard that rewrites a file it did not need to is a guard that
    //  destroys work.
    it('does not touch an index.html that is already there', () => {
        write('package.json', VITE_PKG);
        write('src/main.jsx', '');
        write('index.html', '<!doctype html><title>his own</title>');

        const r = completeTheEntryPoint(dir);

        expect(r).toEqual({ missing: false, reason: '', wrote: '' });
        expect(fs.readFileSync(path.join(dir, 'index.html'), 'utf-8')).toContain('his own');
    });

    //  NEGATIVE — a Node service has no index.html and must never be failed
    //  for the absence of one.
    it.each([
        ['an express service', JSON.stringify({ name: 'api', scripts: { start: 'node server.js' } })],
        ['a library', JSON.stringify({ name: 'lib', scripts: { build: 'tsc -p .' } })],
        ['no scripts at all', JSON.stringify({ name: 'x' })],
    ])('%s is not a Vite project and is left alone', (_why, pkg) => {
        write('package.json', pkg);
        write('src/main.js', '');
        expect(completeTheEntryPoint(dir)).toEqual({ missing: false, reason: '', wrote: '' });
        expect(fs.existsSync(path.join(dir, 'index.html'))).toBe(false);
    });

    //  NEGATIVE — an author who declared their own entry has answered the
    //  question, and this file does not answer it again.
    it('respects an explicit rollup input', () => {
        write('package.json', VITE_PKG);
        write('vite.config.js', 'export default { build: { rollupOptions: { input: "app/entry.html" } } }');
        expect(completeTheEntryPoint(dir)).toEqual({ missing: false, reason: '', wrote: '' });
    });

    //  NEGATIVE — «vitest» contains «vite», and a test runner is not a build.
    it('is not fooled by a script that merely contains the letters', () => {
        write('package.json', JSON.stringify({ name: 'x', scripts: { test: 'vitest run' } }));
        write('src/main.js', '');
        expect(completeTheEntryPoint(dir)).toEqual({ missing: false, reason: '', wrote: '' });
    });
});
