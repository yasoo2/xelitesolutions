/**
 * A PATH ON HIS LAPTOP, SHIPPED INSIDE AN APPLICATION.
 *
 *     GET /project-preview/6a72…/%22C:/Users/home/OneDrive/Pictures/
 *         Screenshots/rMdxgLDt1aCSm5wlwOc9wfydlWaylEfbvu3of2u3.jpg%22   404
 *
 * The `src` in the delivered build was
 * `"C:/Users/home/OneDrive/Pictures/Screenshots/rMdx….jpg"` — quotation marks
 * included. Pages had been protected by groundImageSrcs for months; React
 * projects had nothing, and every image there is still a plain string in
 * `content` until the moment the files are written.
 */
import fs from 'fs';
import path from 'path';
import {
    gradientPlaceholder,
    isUnservableImageSrc,
    safeImageSrc,
    sanitizeContentImages,
    unquoteSrc,
} from '../core/design/images';

const HIS = '"C:/Users/home/OneDrive/Pictures/Screenshots/rMdxgLDt1aCSm5wlwOc9wfydlWaylEfbvu3of2u3.jpg"';
const GRAD = gradientPlaceholder('hero', 200);

describe('an address a visitor could never fetch', () => {
    it('recognises his, exactly', () => {
        expect(isUnservableImageSrc(unquoteSrc(HIS))).toBe(true);
        expect(safeImageSrc(HIS, GRAD).src).toBe(GRAD);
    });

    it.each([
        'C:\\Users\\home\\a.png',
        'c:/users/home/a.png',
        'D:/photos/c.webp',
        'file:///C:/x.jpg',
        '\\\\nas\\share\\a.jpg',
        'images\\x.png',
        '/home/user/a.jpg',
        '/Users/younes/b.png',
        '/root/c.gif',
        '/var/tmp/d.jpg',
    ])('refuses %s', (bad) => {
        expect(isUnservableImageSrc(bad)).toBe(true);
    });

    it.each([
        '/artifacts/images/hero.jpg',
        '/hero.jpg',
        'images/x.png',
        './a.jpg',
        '../shared/a.jpg',
        'https://images.example.com/x.jpg',
        'http://localhost:5002/artifacts/a.jpg',
        '//cdn.example.com/a.png',
        'data:image/svg+xml;base64,AAA',
    ])('leaves %s alone', (good) => {
        expect(isUnservableImageSrc(good)).toBe(false);
        expect(safeImageSrc(good, GRAD).src).toBe(good);
    });

    it('strips the quotes it was quoted with — literal and encoded', () => {
        expect(unquoteSrc('"/artifacts/a.jpg"')).toBe('/artifacts/a.jpg');
        expect(unquoteSrc("'/artifacts/a.jpg'")).toBe('/artifacts/a.jpg');
        expect(unquoteSrc('%22C:/x.jpg%22')).toBe('C:/x.jpg');
        expect(unquoteSrc('  `/a.jpg`  ')).toBe('/a.jpg');
    });

    it('an unquoted good address survives the unquoting', () => {
        expect(unquoteSrc('/artifacts/images/a.jpg')).toBe('/artifacts/images/a.jpg');
        expect(safeImageSrc('"/artifacts/a.jpg"', GRAD)).toEqual(
            { src: '/artifacts/a.jpg', changed: true, why: 'quoted' });
    });

    it('and an empty one becomes the gradient rather than a broken image', () => {
        expect(safeImageSrc('', GRAD).src).toBe(GRAD);
        expect(safeImageSrc('   ', GRAD).src).toBe(GRAD);
    });
});

describe('the whole content object is cleaned, at every depth', () => {
    const build = () => ({
        brand: 'متجري',
        heroImage: { src: HIS, alt: 'الواجهة' },
        menu: [
            { name: 'قهوة', img: { src: 'C:\\Users\\home\\coffee.jpg', alt: 'قهوة' } },
            { name: 'شاي', img: { src: '/artifacts/images/tea.jpg', alt: 'شاي' } },
        ],
        team: [{ name: 'يونس', img: { src: '  "/home/user/me.png"  ', alt: 'يونس' } }],
        products: [{ img: { src: 'https://example.com/bag.jpg', alt: 'كيس' } }],
    });

    it('replaces only what cannot be served', () => {
        const c = build();
        const notes = sanitizeContentImages(c, 200);
        expect(notes).toHaveLength(3);
        expect(c.heroImage.src.startsWith('data:image/svg')).toBe(true);
        expect(c.menu[0].img.src.startsWith('data:image/svg')).toBe(true);
        expect(c.team[0].img.src.startsWith('data:image/svg')).toBe(true);
        expect(c.menu[1].img.src).toBe('/artifacts/images/tea.jpg');
        expect(c.products[0].img.src).toBe('https://example.com/bag.jpg');
    });

    it('says WHY, so the build can tell the user instead of shipping a gradient in silence', () => {
        const notes = sanitizeContentImages(build(), 200);
        expect(notes.some(n => /local path: C:/.test(n))).toBe(true);
    });

    it('a clean content object is left untouched and reports nothing', () => {
        const c = { heroImage: { src: '/artifacts/a.jpg', alt: 'x' } };
        expect(sanitizeContentImages(c, 200)).toEqual([]);
        expect(c.heroImage.src).toBe('/artifacts/a.jpg');
    });

    it('survives nulls, missing images and odd shapes', () => {
        expect(() => sanitizeContentImages(null, 200)).not.toThrow();
        expect(() => sanitizeContentImages({ a: undefined, b: [null, { img: null }] }, 200)).not.toThrow();
        expect(() => sanitizeContentImages({ deep: { a: { b: { c: { d: { e: { f: {} } } } } } } }, 200)).not.toThrow();
    });
});

describe('the React builder applies it before it writes anything', () => {
    const SRC = () => fs.readFileSync(
        path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');

    it('calls the sanitizer', () => {
        expect(SRC()).toMatch(/sanitizeContentImages\(content, \(palette as any\)\.hue \?\? 260\)/);
    });

    it('after the photographs are resolved, and before the files are written', () => {
        const src = SRC();
        const photos = src.indexOf('buildNavLinks();', src.indexOf('resolveImages'));
        const call = src.indexOf('sanitizeContentImages(content');
        const write = src.indexOf("'src/content.js': fileContentJs(content)");
        expect(photos).toBeGreaterThan(0);
        expect(call).toBeGreaterThan(photos);
        expect(call).toBeLessThan(write);
    });

    it('and tells the user what it replaced', () => {
        expect(SRC()).toMatch(/عنوان صورة كان يشير إلى ملف على جهازك/);
    });
});
