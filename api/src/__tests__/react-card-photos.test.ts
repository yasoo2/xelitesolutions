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
            // THREE candidates per query, like a real archive — the variant
            // machinery (a subject asked N times gets N different photos)
            // needs more than one hit to skip into.
            const candidates = [0, 1, 2].map(i => ({
                url: `http://stub-archive.test/photo/${encodeURIComponent(query)}-${i}.png`,
                // preview renditions for the byte-diet cases: a good one, and
                // a deliberately tiny one that must FALL BACK to the full file
                preview: /previewcase/.test(query) ? `http://stub-archive.test/photo/${encodeURIComponent(query)}-${i}-preview.png`
                    : /tinyprev/.test(query) ? `http://stub-archive.test/photo/${encodeURIComponent(query)}-${i}-tiny.png` : undefined,
                title: query,                      // identical title → passes the REAL relevance gate
                tags: [],
                creator: `Photographer ${query.split(' ')[0]}`,
                license: 'CC BY 2.0',
                landing: `http://stub-archive.test/landing/${encodeURIComponent(query)}-${i}`,
                provider: 'stub-archive',
            }));
            return { candidates, outcomes: [{ provider: 'stub-archive', ok: true, count: candidates.length }] };
        }),
    };
});

describe('per-dish photos — the REAL pipeline against a stub archive', () => {
    let artifactDir: string;
    let projDir: string;
    let guardFetch: any;
    const fetched: string[] = [];

    beforeAll(() => {
        const { iconPng } = require('../core/design/pwa');
        const png: Buffer = iconPng(640, '#b45a2b');   // a real 640px PNG — passes the real dimension gate
        const tiny: Buffer = iconPng(320, '#b45a2b');  // too small for the card gate — must be rejected
        guardFetch = (global as any).fetch;
        (global as any).fetch = async (url: any) => {
            if (!String(url).startsWith(ARCHIVE)) return guardFetch(url);   // anything else still trips the network ban
            fetched.push(String(url));
            const body = /-tiny\.png$/.test(String(url)) ? tiny : png;
            return {
                ok: true, status: 200,
                headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'image/png' : null) },
                arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
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

    it('the SAME subject asked twice gets two DIFFERENT photos — the variant machinery', async () => {
        const { fetchCardImages } = require('../modules/tools/definitions/ReactProjectTool');
        const r = await fetchCardImages({
            subjects: ['handmade leather bag', 'handmade leather bag'],
            projDir, hue: 20, artifactDir, slot: 'card', label: 'product',
        });
        expect(r.images[0]).toBeTruthy();
        expect(r.images[1]).toBeTruthy();
        expect(r.images[0]!.src).not.toBe(r.images[1]!.src);   // four cards never share one picture
        for (const img of r.images) expect(fs.existsSync(path.join(projDir, 'public', img!.src))).toBe(true);
    });

    it('BYTE DIET: the archive PREVIEW is fetched first and suffices when it passes the gates', async () => {
        const { fetchCardImages } = require('../modules/tools/definitions/ReactProjectTool');
        fetched.length = 0;
        const r = await fetchCardImages({ subjects: ['previewcase roast platter'], projDir, hue: 20, artifactDir });
        expect(r.images[0]).toBeTruthy();
        expect(fetched.some(u => u.endsWith('-preview.png'))).toBe(true);
        expect(fetched.some(u => /-0\.png$/.test(u))).toBe(false);       // the full file was never needed
    });

    it('…and a too-small preview FALLS BACK to the full file, same gates', async () => {
        const { fetchCardImages } = require('../modules/tools/definitions/ReactProjectTool');
        fetched.length = 0;
        const r = await fetchCardImages({ subjects: ['tinyprev grill tray'], projDir, hue: 20, artifactDir });
        expect(r.images[0]).toBeTruthy();
        const tinyAt = fetched.findIndex(u => u.endsWith('-tiny.png'));
        const fullAt = fetched.findIndex(u => /-0\.png$/.test(u));
        expect(tinyAt).toBeGreaterThanOrEqual(0);
        expect(fullAt).toBeGreaterThan(tinyAt);                          // preview tried FIRST, full rescued it
        const onDisk = path.join(projDir, 'public', r.images[0]!.src);
        const { iconPng } = require('../core/design/pwa');
        expect(fs.statSync(onDisk).size).toBe(iconPng(640, '#b45a2b').length);   // the 640px file is what shipped
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
            expect((after.match(/img: null/g) || []).length).toBe(9);  // 3 other dishes + 4 products + 2 testimonials untouched
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

            // [5] REPLACE: a new subject swaps the hero photo and the orphan file is deleted
            const oldHeroSrc = contentOf().match(/heroImage: \{ src: '(images\/[^']+)'/)![1];
            const swap: any = await new ProjectEditTool().execute({ request: 'غير صورة الواجهة الى صورة قهوة عربية' }, { sessionId: 'img-edit' });
            expect(swap.ok).toBe(true);
            const newHeroSrc = contentOf().match(/heroImage: \{ src: '(images\/[^']+)'/)![1];
            expect(newHeroSrc).not.toBe(oldHeroSrc);
            expect(fs.existsSync(path.join(dir, 'public', newHeroSrc))).toBe(true);
            expect(fs.existsSync(path.join(dir, 'public', oldHeroSrc))).toBe(false);   // no orphan ships

            // [6] REMOVE a named dish photo: the row goes back to null, its file leaves,
            //     the hero's photo and the credits stay
            await new ProjectEditTool().execute({ request: 'ضف صورة لطبق حلو البيت' }, { sessionId: 'img-edit' });
            const dishSrc = contentOf().match(/\{ name: 'حلو البيت',[^\n]*?img: \{ src: '(images\/[^']+)'/)![1];
            const rm: any = await new ProjectEditTool().execute({ request: 'احذف صورة طبق حلو البيت' }, { sessionId: 'img-edit' });
            expect(rm.ok).toBe(true);
            expect(String(rm.output.message)).toContain('🗑️');
            expect(contentOf()).toMatch(/\{ name: 'حلو البيت',[^\n]*?img: null/);
            expect(fs.existsSync(path.join(dir, 'public', dishSrc))).toBe(false);
            expect(contentOf()).toMatch(/heroImage: \{ src: /);
            expect(contentOf()).toContain('stub-archive.test');    // credits stay while photos remain

            // [7] removing the LAST photo empties the credits — no licence line for
            //     pictures that left
            const rmHero: any = await new ProjectEditTool().execute({ request: 'احذف صورة الواجهة' }, { sessionId: 'img-edit' });
            expect(rmHero.ok).toBe(true);
            const bare = contentOf();
            expect(bare).toContain('heroImage: null');
            expect(bare).not.toContain('stub-archive.test');
            expect(fs.existsSync(path.join(dir, 'public', newHeroSrc))).toBe(false);

            // [8] nothing left to remove → an honest answer, no write
            const rmNone: any = await new ProjectEditTool().execute({ request: 'احذف صورة الواجهة' }, { sessionId: 'img-edit' });
            expect(String(rmNone.output.message)).toMatch(/لا توجد صورة/);
            expect(contentOf()).toBe(bare);

            // [9] «ضف طبق …» — a whole new row arrives WITH a real fetched photo
            const addRow: any = await new ProjectEditTool().execute({ request: 'ضف طبق كنافة بالقشطة بسعر 30' }, { sessionId: 'img-edit' });
            expect(addRow.ok).toBe(true);
            const withRow = contentOf();
            const rowM = withRow.match(/\{ name: 'كنافة بالقشطة', desc: '[^']+', price: '30 ر\.س', img: \{ src: '(images\/[^']+)'/);
            expect(rowM).toBeTruthy();
            expect(fs.existsSync(path.join(dir, 'public', rowM![1]))).toBe(true);
            expect(withRow).toContain('stub-archive.test');   // its licence line rode along
        } finally {
            (global as any).fetch = guardFetch;
            fs.rmSync(process.env.ARTIFACT_DIR!, { recursive: true, force: true });
            if (prevArtifacts === undefined) delete process.env.ARTIFACT_DIR; else process.env.ARTIFACT_DIR = prevArtifacts;
            delete (global as any).joeProjects?.['img-edit'];
        }
    });

    it('a store scaffolds PRODUCT CARDS (photos, prices, CTA) — not abstract tiers', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const res: any = await new ReactProjectTool().execute(
            { request: 'ابنِ موقع react لمتجر عطور', skipInstall: true, root }, { sessionId: 'card-off' });
        expect(res.ok).toBe(true);
        const compDir = path.join(res.output.path, 'src', 'components');
        expect(fs.existsSync(path.join(compDir, 'Products.jsx'))).toBe(true);
        expect(fs.existsSync(path.join(compDir, 'Pricing.jsx'))).toBe(false);
        const products = fs.readFileSync(path.join(compDir, 'Products.jsx'), 'utf-8');
        expect(products).toContain('p.img ?');
        expect(products).toContain('product-price');
        const { transformSync } = require('esbuild');
        expect(() => transformSync(products, { loader: 'jsx' })).not.toThrow();
        const content = fs.readFileSync(path.join(res.output.path, 'src', 'content.js'), 'utf-8');
        expect(content).toContain('منتجاتنا');
        expect((content.match(/img: null/g) || []).length).toBeGreaterThanOrEqual(6);  // 4 products + 2 testimonials, offline-clean
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
