/**
 * Build checkpoints: an interrupted build's accepted sections survive and are
 * reused; a finished or expired build's are not; and no request can ever
 * borrow another request's sections.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { checkpointKey, loadCheckpoint, saveCheckpointSection, clearCheckpoint } from '../core/resume/checkpoint';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cp-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const REQ = 'ابنِ موقعاً لمطعم الأصالة مع قائمة طعام وحجوزات';

describe('build checkpoints', () => {
    test('a saved section is loaded back verbatim', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        saveCheckpointSection(dir, key, REQ, 'hero', '<section id="hero">مرحبا</section>', 'البطل');
        const cp = loadCheckpoint(dir, key);
        expect(cp).not.toBeNull();
        expect(cp!.sections.hero).toBe('<section id="hero">مرحبا</section>');
        expect(cp!.titles.hero).toBe('البطل');
    });

    test('sections accumulate across saves — a build dying at section 7 keeps 1..6', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        for (let i = 1; i <= 6; i++) {
            saveCheckpointSection(dir, key, REQ, `sec-${i}`, `<section id="sec-${i}">${i}</section>`, `قسم ${i}`);
        }
        const cp = loadCheckpoint(dir, key)!;
        expect(Object.keys(cp.sections)).toHaveLength(6);
        expect(cp.sections['sec-4']).toContain('>4<');
    });

    test('a DIFFERENT request never sees another build\'s sections', () => {
        const keyA = checkpointKey('s1', REQ, 'restaurant');
        const keyB = checkpointKey('s1', 'ابنِ لوحة تحكم لمتجر إلكتروني', 'dashboard');
        saveCheckpointSection(dir, keyA, REQ, 'hero', '<section id="hero">مطعم</section>', 'x');
        expect(keyA).not.toBe(keyB);
        expect(loadCheckpoint(dir, keyB)).toBeNull();
    });

    test('the same request in a DIFFERENT session gets its own checkpoint', () => {
        expect(checkpointKey('session-1', REQ, 'restaurant'))
            .not.toBe(checkpointKey('session-2', REQ, 'restaurant'));
    });

    test('clearCheckpoint removes it — a finished build leaves nothing behind', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        saveCheckpointSection(dir, key, REQ, 'hero', '<section></section>', 'x');
        expect(loadCheckpoint(dir, key)).not.toBeNull();
        clearCheckpoint(dir, key);
        expect(loadCheckpoint(dir, key)).toBeNull();
    });

    test('an expired checkpoint (>6h) is discarded AND deleted from disk', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        saveCheckpointSection(dir, key, REQ, 'hero', '<section></section>', 'x');
        const file = path.join(dir, '.checkpoints', `${key}.json`);
        const cp = JSON.parse(fs.readFileSync(file, 'utf-8'));
        cp.ts = Date.now() - 7 * 60 * 60 * 1000;
        fs.writeFileSync(file, JSON.stringify(cp));
        expect(loadCheckpoint(dir, key)).toBeNull();
        expect(fs.existsSync(file)).toBe(false);
    });

    test('a corrupt checkpoint is surfaced and preserved; saving never overwrites it', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        const file = path.join(dir, '.checkpoints', `${key}.json`);
        const corruptBytes = '{broken json';
        fs.mkdirSync(path.join(dir, '.checkpoints'), { recursive: true });
        fs.writeFileSync(file, corruptBytes, 'utf-8');
        const failed = loadCheckpoint(dir, key) as any;
        expect(failed).toEqual(expect.objectContaining({ status: 'failed', reason: expect.any(String) }));
        expect(fs.readFileSync(file, 'utf-8')).toBe(corruptBytes);
        saveCheckpointSection(dir, key, REQ, 'hero', '<section>x</section>', 'x');
        expect(fs.readFileSync(file, 'utf-8')).toBe(corruptBytes);
        expect(loadCheckpoint(dir, key)).toEqual(expect.objectContaining({ status: 'failed' }));
    });

    test('a valid empty checkpoint is distinct from missing and accepts a first section', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        const missingKey = checkpointKey('s1', REQ, 'dashboard');
        const file = path.join(dir, '.checkpoints', `${key}.json`);
        fs.mkdirSync(path.join(dir, '.checkpoints'), { recursive: true });
        fs.writeFileSync(file,
            JSON.stringify({ v: 1, key, requestPreview: '', ts: Date.now(), sections: {}, titles: {} }), 'utf-8');
        const empty = loadCheckpoint(dir, key) as any;
        expect(empty).toEqual(expect.objectContaining({ status: 'empty', sections: {}, titles: {} }));
        expect(loadCheckpoint(dir, missingKey)).toBeNull();
        expect(empty).not.toBeNull();
        saveCheckpointSection(dir, key, REQ, 'hero', '<section>x</section>', 'x');
        expect(loadCheckpoint(dir, key)!.sections.hero).toBe('<section>x</section>');
    });

    test('no .tmp files are left behind by the atomic write', () => {
        const key = checkpointKey('s1', REQ, 'restaurant');
        saveCheckpointSection(dir, key, REQ, 'hero', '<section>x</section>', 'x');
        const files = fs.readdirSync(path.join(dir, '.checkpoints'));
        expect(files.some(f => f.endsWith('.tmp'))).toBe(false);
    });
});
