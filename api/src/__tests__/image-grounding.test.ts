/**
 * No image may point at a file that is not there.
 *
 * A build the user reported requested three images that all 404'd:
 *
 *   /artifacts/joe-…/software%20developer%7D%7D   → "software developer}}"
 *   /artifacts/joe-…/avatar-programming%7D%7D     → "avatar-programming}}"
 *   /artifacts/joe-…/xelite-solutions-logo.png    → invented by the model
 *
 * The first two are a marker that lost its opening brace somewhere upstream, so
 * the sweep that replaces unresolved `{{IMAGE:…}}` did not recognise them. The
 * third no marker logic was ever going to catch. All three reached the browser
 * as broken images — which is precisely what the user saw and reported.
 *
 * So this check does not reason about marker syntax at all. It asks the only
 * question that settles it: is the file there?
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { groundImageSrcs } from '../core/design/images';

let dir: string;
beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-img-'));
    fs.writeFileSync(path.join(dir, 'real-photo.jpg'), 'x');
});

const img = (src: string, alt = 'صورة') => `<img src="${src}" alt="${alt}">`;

describe('an image that would 404 never ships', () => {
    it.each([
        ['a marker that lost its brace', 'software developer}}'],
        ['a mangled avatar marker', 'avatar-programming}}'],
        ['a filename the model invented', 'xelite-solutions-logo.png'],
        ['an empty src', ''],
    ])('replaces %s', (_what, src) => {
        const r = groundImageSrcs(img(src), dir, 214);
        expect(r.fixed).toBe(1);
        expect(r.html).toMatch(/src="data:image\/svg\+xml/);
        expect(r.html).not.toContain(`src="${src}"`);
    });

    it('keeps a file that is actually on disk', () => {
        const r = groundImageSrcs(img('real-photo.jpg'), dir, 214);
        expect(r.fixed).toBe(0);
        expect(r.html).toContain('src="real-photo.jpg"');
    });

    it('keeps a data URI and a remote address', () => {
        // Joe does not emit remote URLs; rewriting someone's deliberate CDN
        // link would be worse than the problem this solves.
        for (const src of ['data:image/png;base64,AAAA', 'https://cdn.example.com/a.jpg', '//cdn.example.com/b.jpg']) {
            expect(groundImageSrcs(img(src), dir, 214).fixed).toBe(0);
        }
    });

    it('refuses a path that climbs out of the artifact directory', () => {
        // Present on disk is not the same as legitimately ours.
        const r = groundImageSrcs(img('../../../etc/hostname'), dir, 214);
        expect(r.fixed).toBe(1);
    });

    it('ignores a query string when looking for the file', () => {
        expect(groundImageSrcs(img('real-photo.jpg?v=123'), dir, 214).fixed).toBe(0);
    });

    it('uses the alt text as the subject of the replacement', () => {
        // The alt says what the picture was FOR, which is the best subject
        // available for the gradient standing in for it.
        const r = groundImageSrcs(img('gone.png', 'فريق العمل'), dir, 214);
        expect(r.fixed).toBe(1);
        expect(decodeURIComponent(r.html)).toContain('فريق العمل');
    });

    it('names what it replaced instead of fixing it silently', () => {
        const r = groundImageSrcs(img('avatar}}') + img('gone.png'), dir, 214);
        expect(r.fixed).toBe(2);
        expect(r.broken).toEqual(['avatar}}', 'gone.png']);
    });

    it('leaves a page with no images completely alone', () => {
        const src = '<main><h1>عنوان</h1><p>نص</p></main>';
        const r = groundImageSrcs(src, dir, 214);
        expect(r.html).toBe(src);
        expect(r.fixed).toBe(0);
    });
});

describe('markup only — never a string inside a script', () => {
    /**
     * A store's cart runtime BUILDS markup in JavaScript. The first version of
     * this repair swept the whole document and rewrote that string literal,
     * dropping a multi-line data URI into the middle of an expression.
     * Measured end to end: "Unexpected string" on every page of every store,
     * the whole runtime dead — from the repair meant to stop shipping broken
     * pages. Seven criticals, caused entirely by the fix.
     */
    it('leaves an <img> built inside a script completely alone', () => {
        const page = `<body><img src="gone.png" alt="a">`
            + `<script>var h = '<img src="' + item.image + '" alt="x">'; render(h);</script></body>`;
        const r = groundImageSrcs(page, dir, 214);
        expect(r.fixed).toBe(1);                                  // the real one
        expect(r.html).toContain(`var h = '<img src="' + item.image + '" alt="x">'`);
    });

    it('leaves a src mentioned inside a style block alone', () => {
        const page = `<style>.a{background:url(gone.png)}</style><img src="gone.png" alt="a">`;
        const r = groundImageSrcs(page, dir, 214);
        expect(r.fixed).toBe(1);
        expect(r.html).toContain('background:url(gone.png)');
    });

    it('keeps the rest of the document byte for byte', () => {
        const page = `<body><p>نص</p><img src="gone.png" alt="a"><p>نص آخر</p></body>`;
        const r = groundImageSrcs(page, dir, 214);
        expect(r.html.startsWith('<body><p>نص</p><img ')).toBe(true);
        expect(r.html.endsWith('alt="a"><p>نص آخر</p></body>')).toBe(true);
    });
});
