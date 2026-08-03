/**
 * PER-DISH PHOTOS through the REAL image pipeline — no network, per the
 * suite's ban (setup.ts fails any test that touches it).
 *
 * Only two seams are stubbed: the archive layer (photo-sources
 * .searchAllSources) answers with deterministic candidates, and global.fetch
 * serves REAL PNG bytes (pwa.iconPng) for their URLs. Everything between the
 * seams runs for real: marker parsing, the relevance gate, the download
 * plumbing, the dimension check on the actual bytes, the file landing in the
 * artifact store, the copy into the project's public/, the credits.
 *
 * This is the lock that would have caught the hero-probe defect this batch
 * fixed: resolveImages replaces a marker with a BARE local URL and hardens
 * the surrounding <img> — so a probe that floats the marker in a <div> gets
 * loose text back and no photo, ever. The probes now live inside src
 * attributes, and this suite proves them against the real replacement.
 * The full-network version (real HTTP archive, real npm build, real browser)
 * lives in src/tests/manual/verify_dish_photos.ts.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

const ARCHIVE = 'http://stub-archive.test';

jest.mock('../core/design/photo-sources', () => {
    const actual = jest.requireActual('../core/design/photo-sources');
    return {
        ...actual,
        searchAllSources: jest.fn(async (query: string) => {
            // The salad's archives come back empty — its neighbours must keep
            // their photos while it falls back to a clean text row.
            if (/salad/i.test(query)) {
                return { candidates: [], outcomes: [{ provider: 'stub-archive', ok: false, count: 0, reason: 'nothing for this subject' }] };
            }
            return {
                candidates: [{
                    url: `http://stub-archive.test/photo/${encodeURIComponent(query)}.png`,
                    title: query,                      // identical title → passes the REAL relevance gate
                    tags: [],
                    creator: `Photographer ${query.split(' ')[0]}`,
                    license: 'CC BY 2.0',
                    landing: `http://stub-archive.test/landing/${encodeURIComponent(query)}`,
                    provider: 'stub-archive',
                }],
                outcomes: [{ provider: 'stub-archive', ok: true, count: 1 }],
            };
        }),
    };
});

describe('per-dish photos — the REAL pipeline against a stub archive', () => {
    let artifactDir: string;
    let projDir: string;
    let guardFetch: any;

    beforeAll(() => {
        const { iconPng } = require('../core/design/pwa');
        const png: Buffer = iconPng(640, '#b45a2b');   // a real 640px PNG — passes the real dimension gate
        guardFetch = (global as any).fetch;
        (global as any).fetch = async (url: any) => {
            if (!String(url).startsWith(ARCHIVE)) return guardFetch(url);   // anything else still trips the network ban
            return {
                ok: true, status: 200,
                headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
                arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
            };
        };
        artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cards-art-'));
        projDir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cards-proj-'));
    });
    afterAll(() => {
        (global as any).fetch = guardFetch;
        fs.rmSync(artifactDir, { recursive: true, force: true });
        fs.rmSync(projDir, { recursive: true, force: true });
    });

    it('one batched call: 2 dishes get REAL copied photos, the empty-archive dish maps to null IN PLACE', async () => {
        const { fetchCardImages } = require('../modules/tools/definitions/ReactProjectTool');
        const r = await fetchCardImages({
            subjects: ['grilled kebab platter', 'garden salad plate', 'lentil soup bowl'],
            projDir, hue: 20, artifactDir,
        });
        expect(r.images).toHaveLength(3);
        expect(r.images[0]).toBeTruthy();
        expect(r.images[1]).toBeNull();                // not shifted onto the soup's photo
        expect(r.images[2]).toBeTruthy();
        for (const img of [r.images[0]!, r.images[2]!]) {
            const onDisk = path.join(projDir, 'public', img.src);
            expect(fs.existsSync(onDisk)).toBe(true);
            expect(fs.statSync(onDisk).size).toBeGreaterThan(500);   // real PNG bytes were downloaded and copied
        }
        expect(r.credits).toHaveLength(2);
        expect(r.credits.every((c: any) => c.license === 'CC BY 2.0')).toBe(true);
        expect(r.note).toContain('2/3');
    });

    it('the hero probe survives the REAL marker replacement (marker inside src, URL parsed back out)', async () => {
        const { fetchHeroImage } = require('../modules/tools/definitions/ReactProjectTool');
        const h = await fetchHeroImage({ subject: 'charcoal grill restaurant interior', projDir, hue: 20, artifactDir });
        expect(h.image).toBeTruthy();
        expect(fs.existsSync(path.join(projDir, 'public', h.image!.src))).toBe(true);
        expect(h.credits).toHaveLength(1);
    });

    it('the avatar slot rides the same batched call — a real portrait lands in public/', async () => {
        const { fetchCardImages } = require('../modules/tools/definitions/ReactProjectTool');
        const r = await fetchCardImages({
            subjects: ['smiling woman customer portrait'],
            projDir, hue: 20, artifactDir, slot: 'avatar', label: 'portrait',
        });
        expect(r.images[0]).toBeTruthy();
        expect(fs.existsSync(path.join(projDir, 'public', r.images[0]!.src))).toBe(true);
        expect(r.note).toContain('1/1 real portrait photos');
    });

    it('mergeCredits: one licence line per source across hero + dishes', () => {
        const { mergeCredits } = require('../modules/tools/definitions/ReactProjectTool');
        const a = [{ creator: 'A', license: 'CC BY', source: 'https://x/1' }];
        const b = [
            { creator: 'A', license: 'CC BY', source: 'https://x/1' },
            { creator: 'B', license: 'CC0', source: 'https://x/2' },
        ];
        expect(mergeCredits(a, b)).toHaveLength(2);
        expect(mergeCredits(undefined, b)).toHaveLength(2);
        expect(mergeCredits(a, undefined)).toHaveLength(1);
    });
});

describe('the offline scaffold ships clean rows and a conditional thumb', () => {
    let root: string;
    beforeAll(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-cards-off-')); });
    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
        delete (global as any).joeProjects?.['card-off'];
    });

    it('skipInstall: every dish serializes img: null and Menu.jsx renders the thumb conditionally', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمطعم مشاوي', skipInstall: true, root }, { sessionId: 'card-off' });
        expect(res.ok).toBe(true);
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect((content.match(/img: null/g) || []).length).toBeGreaterThanOrEqual(6);  // the whole Arabic menu + both testimonials
        expect(content).not.toContain('img: undefined');
        expect(content).not.toContain('photoSubject');   // internal search hint, never shipped to the visitor
        const menu = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Menu.jsx'), 'utf-8');
        expect(menu).toContain('m.img ?');
        expect(menu).toContain('loading="lazy"');
        const quotes = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Testimonials.jsx'), 'utf-8');
        expect(quotes).toContain('t.img ?');
        expect(quotes).toContain('quote-avatar');
        const { transformSync } = require('esbuild');
        expect(() => transformSync(menu, { loader: 'jsx' })).not.toThrow();
        expect(() => transformSync(quotes, { loader: 'jsx' })).not.toThrow();
    });

    it('«ضف صورة» — the surgical editor lands a REAL photo in content.js, row by row', async () => {
        const { iconPng } = require('../core/design/pwa');
        const png: Buffer = iconPng(640, '#2b6ab4');
        const guardFetch = (global as any).fetch;
        (global as any).fetch = async (url: any) => {
            if (!String(url).startsWith('http://stub-archive.test')) return guardFetch(url);
            return {
                ok: true, status: 200,
                headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
                arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength),
            };
        };
        const prevArtifacts = process.env.ARTIFACT_DIR;
        process.env.ARTIFACT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-imgedit-art-'));
        try {
            const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
            const { ProjectEditTool } = require('../modules/tools/definitions/ProjectEditTool');
            const scaffolded: any = await new ReactProjectTool().execute(
                { request: 'ابنِ موقع react لمطعم مشاوي', skipInstall: true, root }, { sessionId: 'img-edit' });
            const dir = scaffolded.output.path;
            const contentOf = () => fs.readFileSync(path.join(dir, 'src', 'content.js'), 'utf-8');
            expect(contentOf()).toContain('heroImage: null');

            // [1] the hero — heroImage: null flips to a real copied photo
            const hero: any = await new ProjectEditTool().execute({ request: 'ضف صورة للواجهة الرئيسية' }, { sessionId: 'img-edit' });
            expect(hero.ok).toBe(true);
            expect(hero.output.touched).toContain('src/content.js');
            const heroM = contentOf().match(/heroImage: \{ src: '(images\/[^']+)'/);
            expect(heroM).toBeTruthy();
            expect(fs.existsSync(path.join(dir, 'public', heroM![1]))).toBe(true);
            expect(contentOf()).toContain('stub-archive.test');       // the licence line rode along

            // [2] a NAMED dish — only that row changes, its neighbours stay null
            const dish: any = await new ProjectEditTool().execute({ request: 'ضف صورة لطبق مشاوي مشكلة' }, { sessionId: 'img-edit' });
            expect(dish.ok).toBe(true);
            const after = contentOf();
            expect(after).toMatch(/\{ name: 'مشاوي مشكلة',[^\n]*?img: \{ src: 'images\//);
            expect((after.match(/img: null/g) || []).length).toBe(5);  // 3 other dishes + 2 testimonials untouched
            expect(((global as any).joeProjects['img-edit'].history || []).length).toBeGreaterThanOrEqual(2);

            // [3] archives empty → an HONEST refusal, nothing changed
            const none: any = await new ProjectEditTool().execute({ request: 'add a photo of garden salad to the hero' }, { sessionId: 'img-edit' });
            expect(none.ok).toBe(true);
            expect(String(none.output.message)).toMatch(/no suitable licensed photo/);
            expect(contentOf()).toBe(after);

            // [4] «تراجع» restores the recorded bytes — the dish loses its photo again
            const undo: any = await new ProjectEditTool().execute({ request: 'تراجع عن آخر تعديل' }, { sessionId: 'img-edit' });
            expect(String(undo.output.message)).toContain('↩️');
            const reverted = contentOf();
            expect(reverted).toMatch(/\{ name: 'مشاوي مشكلة',[^\n]*?img: null/);
        } finally {
            (global as any).fetch = guardFetch;
            fs.rmSync(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
            if (prevArtifacts === undefined) delete process.env.ARTIFACT_DIR; else process.env.ARTIFACT_DIR = prevArtifacts;
            delete (global as any).joeProjects?.['img-edit'];
        }
    });

    it('content.js serializes isArabic, and the Footer credits label follows the language', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'build a react site for a grill restaurant', skipInstall: true, root }, { sessionId: 'card-off' });
        expect(res.ok).toBe(true);
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain('isArabic: false');
        const footer = fs.readFileSync(path.join(res.output.path, 'src', 'components', 'Footer.jsx'), 'utf-8');
        expect(footer).toContain("'Image credits: '");
        expect(footer).toContain("'مصادر الصور: '");
    });
});
