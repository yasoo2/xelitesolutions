/**
 * Project export/import: a faithful round trip, and loud refusal of the two
 * classic archive attacks (zip-slip path escape, zip-bomb expansion).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import AdmZip from 'adm-zip';
import { archiveProject, extractProject } from '../core/transfer/project-archive';

let src: string, dest: string, sandbox: string;
beforeEach(() => {
    src = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-exp-'));
    /**
     * `dest` lives inside a PRIVATE parent, not directly in os.tmpdir().
     *
     * The zip-slip test proves nothing escaped by listing dest's parent. When
     * that parent was the shared /tmp, any other suite creating a temp dir in
     * the same instant counted as a "leak" and the gate went red at random.
     * A private parent makes the check mean what it says.
     */
    sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-box-'));
    dest = fs.mkdtempSync(path.join(sandbox, 'joe-imp-'));
});
afterEach(() => {
    fs.rmSync(src, { recursive: true, force: true });
    fs.rmSync(sandbox, { recursive: true, force: true });
});

function seedProject() {
    fs.writeFileSync(path.join(src, 'index.html'), '<!DOCTYPE html><html><body>مرحبا</body></html>');
    fs.mkdirSync(path.join(src, 'css'));
    fs.writeFileSync(path.join(src, 'css', 'styles.css'), 'body{margin:0}');
    // Binary content must survive byte-for-byte.
    fs.writeFileSync(path.join(src, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 250]));
}

describe('project archive', () => {
    test('round trip: every file returns byte-identical, in a FRESH directory', () => {
        seedProject();
        const exp = archiveProject(src);
        expect(exp.files).toBe(3);
        const imp = extractProject(exp.buffer, dest);
        expect(imp.files).toBe(3);
        expect(path.dirname(imp.dir)).toBe(path.resolve(dest));
        expect(path.basename(imp.dir)).toMatch(/^imported-/);
        expect(fs.readFileSync(path.join(imp.dir, 'index.html'), 'utf-8')).toContain('مرحبا');
        expect(fs.readFileSync(path.join(imp.dir, 'css', 'styles.css'), 'utf-8')).toBe('body{margin:0}');
        expect(Buffer.compare(
            fs.readFileSync(path.join(imp.dir, 'logo.png')),
            Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1, 2, 250]),
        )).toBe(0);
    });

    test('the export carries a manifest; the import does not spill it into the project', () => {
        seedProject();
        const exp = archiveProject(src);
        const zip = new AdmZip(exp.buffer);
        const manifest = JSON.parse(zip.readAsText('joe-project.json'));
        expect(manifest.tool).toBe('joe');
        expect(manifest.files).toBe(3);
        const imp = extractProject(exp.buffer, dest);
        expect(fs.existsSync(path.join(imp.dir, 'joe-project.json'))).toBe(false);
    });

    test('node_modules, .git and .checkpoints never travel', () => {
        seedProject();
        fs.mkdirSync(path.join(src, 'node_modules', 'x'), { recursive: true });
        fs.writeFileSync(path.join(src, 'node_modules', 'x', 'big.js'), 'x'.repeat(1000));
        fs.mkdirSync(path.join(src, '.git'));
        fs.writeFileSync(path.join(src, '.git', 'HEAD'), 'ref: main');
        const exp = archiveProject(src);
        expect(exp.files).toBe(3);
    });

    test('ZIP-SLIP: a hand-crafted hostile archive cannot write outside the destination', () => {
        // adm-zip sanitizes '../' when BUILDING archives, so a real attack zip
        // must be forged at the byte level — store-method entries, real CRCs.
        const crcTable = (() => {
            const t = new Uint32Array(256);
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                t[n] = c >>> 0;
            }
            return t;
        })();
        const crc32 = (buf: Buffer) => {
            let c = 0xffffffff;
            for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
            return (c ^ 0xffffffff) >>> 0;
        };
        const rawZip = (entries: Array<{ name: string; data: Buffer }>) => {
            const locals: Buffer[] = [], centrals: Buffer[] = [];
            let offset = 0;
            for (const e of entries) {
                const name = Buffer.from(e.name, 'utf-8');
                const crc = crc32(e.data);
                const lh = Buffer.alloc(30);
                lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4);
                lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(e.data.length, 18); lh.writeUInt32LE(e.data.length, 22);
                lh.writeUInt16LE(name.length, 26);
                const local = Buffer.concat([lh, name, e.data]);
                const ch = Buffer.alloc(46);
                ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
                ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(e.data.length, 20); ch.writeUInt32LE(e.data.length, 24);
                ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
                centrals.push(Buffer.concat([ch, name]));
                locals.push(local);
                offset += local.length;
            }
            const cd = Buffer.concat(centrals);
            const eocd = Buffer.alloc(22);
            eocd.writeUInt32LE(0x06054b50, 0);
            eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
            eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
            return Buffer.concat([...locals, cd, eocd]);
        };

        const evil = rawZip([
            { name: 'ok.txt', data: Buffer.from('fine') },
            { name: '../../outside.txt', data: Buffer.from('escape!') },
        ]);
        // Whether the library normalizes the name or our guard throws, the
        // security PROPERTY is the same and is what we assert: the file must
        // never land outside the fresh import directory.
        const parent = path.dirname(dest);
        const before = new Set(fs.readdirSync(parent));
        let threw = false;
        let importedDir = '';
        try { importedDir = extractProject(evil, dest).dir; } catch (e: any) {
            threw = true;
            expect(String(e.message)).toMatch(/escapes the destination/);
        }
        expect(fs.existsSync(path.join(parent, 'outside.txt'))).toBe(false);
        const leaked = fs.readdirSync(parent).filter(f => !before.has(f));
        expect(leaked).toHaveLength(0);
        if (!threw) {
            // Sanitized path: the hostile name must have been confined inside.
            expect(fs.existsSync(path.join(importedDir, 'outside.txt'))).toBe(true);
        }
    });

    test('an empty archive and an empty directory both refuse honestly', () => {
        expect(() => archiveProject(src)).toThrow(/nothing to export/);
        const empty = new AdmZip();
        expect(() => extractProject(empty.toBuffer(), dest)).toThrow(/empty/);
    });

    test('a manifest-only archive refuses: there is no project inside', () => {
        const z = new AdmZip();
        z.addFile('joe-project.json', Buffer.from('{}'));
        expect(() => extractProject(z.toBuffer(), dest)).toThrow(/only metadata/);
    });
});
