/**
 * «مع صور نباتات» — AND A NURSERY WITHOUT A PICTURE IS A SPREADSHEET.
 *
 * He asked for photos in his very first sentence. I said twice that I had not
 * built them, which was honest and not enough. Then he asked the real question:
 *
 *     «اريد حلا دائما … هل يمكن بناء نظام يقوم بتصميم الصور ام يمكننا شبك
 *      النظام على مصمم الصور بنانا ام يوجد اداه يمكنها البحث على الصور على
 *      الانترنت وجلبها الى النظام…»
 *
 * The answer is a LADDER, because no single source is always right:
 *
 *   1. the picture the owner chose      — always the most accurate
 *   2. a real licensed photo, searched  — the engine has existed for months
 *   3. a generated picture              — for a name no search can match
 *   4. a DESIGNED card                  — the row's own letter on its own
 *                                         gradient: instant, offline, and
 *                                         never the WRONG picture
 *
 * This file gates rungs 1 and 4 — the two that need no network at all — and
 * the shape of the column they both write into. A build must never fail for
 * want of a photograph, so rung 4 is the floor and it cannot miss.
 */
import { namedEntities } from '../core/design/named-entities';
import { blueprintFromEntity, IMAGE_KEY } from '../core/design/entity-app';
import { blueprintFor } from '../core/design/app-blueprints';
import { fileAppStoreJs, fileRecordsAppJsx, fileTablesAdminJsx, fileTablesAdminCss } from '../modules/tools/definitions/react-app-templates';
import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf-8');

describe('a thing you grow or sell has a picture; an invoice does not', () => {
    it('the plants table carries an image column, the suppliers table does not', () => {
        const m = namedEntities('نظام: النباتات والموردون');
        expect(m[0].fields.map(f => f.key)).toContain('image');
        expect(m[1].fields.map(f => f.key)).not.toContain('image');
    });

    it('and «الفواتير» gets no photograph either', () => {
        const inv = namedEntities('نظام: النباتات والفواتير').find(e => e.key === 'invoices')!;
        expect(inv.fields.map(f => f.key)).not.toContain('image');
    });

    it('the column is recognised by one rule, everywhere', () => {
        for (const k of ['image', 'photo', 'picture', 'img', 'cover_image', 'main_photo']) {
            expect(IMAGE_KEY.test(k)).toBe(true);
        }
        for (const k of ['name', 'imagination', 'photographer', 'price']) {
            expect(IMAGE_KEY.test(k)).toBe(false);
        }
    });

    it('and it never becomes the column that titles the row', () => {
        const bp = blueprintFromEntity(blueprintFor('generic', 'x', true), namedEntities('نظام: النباتات والموردون')[0], true);
        expect(bp.fields.find(f => f.key === 'image')!.type).toBe('image');
        expect(bp.fields.find(f => f.primary)!.key).toBe('name');
    });
});

describe('the owner’s own picture — rung one', () => {
    const store = () => fileAppStoreJs();

    it('a chosen file is shrunk in the browser, not uploaded anywhere', () => {
        const s = store();
        expect(s).toMatch(/export function pickImage\(file, maxEdge\)/);
        expect(s).toMatch(/ctx\.drawImage\(img, 0, 0, w, h\)/);
        expect(s).toMatch(/c\.toDataURL\('image\/jpeg', 0\.72\)/);
        // …at most 480px on the long edge: a 4MB phone photo becomes ~40KB.
        expect(s).toMatch(/var edge = maxEdge \|\| 480;/);
        expect(s).toMatch(/Math\.min\(1, edge \/ Math\.max\(img\.width \|\| 1, img\.height \|\| 1\)\)/);
    });

    it('and it refuses anything that is not an image — with string work, not a regex', () => {
        // A backslash inside this template literal is eaten by the literal, and
        // /^image\// silently became /^image// — a real syntax error that shipped
        // once in this very batch and was caught by the parse gate.
        const s = store();
        expect(s).toMatch(/String\(file\.type \|\| ''\)\.indexOf\('image\/'\) !== 0/);
        // The broken form, and any regex test against the file type at all.
        expect(s).not.toContain('/^image//');
        expect(s).not.toContain('.test(file.type');
    });

    it('the form has a real file input and a way to take the picture back off', () => {
        const jsx = fileRecordsAppJsx(true);
        expect(jsx).toMatch(/<input type="file" accept="image\/\*"/);
        expect(jsx).toMatch(/const data = await pickImage\(file, 480\)/);
        expect(jsx).toContain('أزل الصورة');
    });
});

describe('the designed card — rung four, the floor that cannot miss', () => {
    const store = () => fileAppStoreJs();

    it('every row has a picture even with no file, no network and no model', () => {
        const s = store();
        expect(s).toMatch(/export function cardFor\(name, brandHue\)/);
        expect(s).toMatch(/data:image\/svg\+xml,' \+ encodeURIComponent\(svg\)/);
        expect(s).toMatch(/export function imageOf\(row, key, nameKey, brandHue\)/);
    });

    it('the same name is always the same colour, and different names differ', () => {
        const s = store();
        expect(s).toMatch(/function hueOf\(text\)/);
        expect(s).toMatch(/h = \(h \* 31 \+ s\.charCodeAt\(i\)\) % 360;/);
    });

    it('and the row’s own letter is escaped before it becomes markup', () => {
        expect(store()).toMatch(/replace\(\/&\/g, '&amp;'\)\.replace\(\/</);
    });
});

describe('and the picture is SHOWN, never printed', () => {
    it('the list draws a thumbnail and keeps it out of the text meta', () => {
        const jsx = fileRecordsAppJsx(true);
        expect(jsx).toMatch(/<img className="row-pic" loading="lazy"/);
        expect(jsx).toMatch(/src=\{imageOf\(row, imageField\.key, primary\.key\)\}/);
        // A base64 photo in a definition list is four thousand characters of noise.
        expect(jsx).toMatch(/fields\.filter\(f => f\.type !== 'image' && f\.key !== primary\.key/);
    });

    it('and out of the CSV, which is meant to open in a spreadsheet', () => {
        expect(fileRecordsAppJsx(true)).toMatch(/toCsv\(fields\.filter\(f => f\.type !== 'image'\), visible\)/);
    });

    it('the administration table draws it too, instead of a base64 novel', () => {
        const t = fileTablesAdminJsx([{ key: 'plants', ar: 'النباتات', en: 'plants',
            fields: [{ key: 'name', type: 'TEXT', required: true, ar: 'الاسم', en: 'name' },
                { key: 'image', type: 'TEXT', ar: 'الصورة', en: 'photo' }] }] as any, true);
        expect(t).toMatch(/const IMAGE_COL = \/\(\^\|_\)\(image\|photo\|picture\|img\)\$\//);
        expect(t).toMatch(/<img className="tbl-pic"/);
        expect(t).toMatch(/await pickImage\(file, 480\)/);
    });

    it('and both surfaces are styled, with the thumbnail contained', () => {
        const css = read('modules', 'tools', 'definitions', 'react-app-templates.ts');
        expect(css).toMatch(/\.row-pic\{width:88px;height:66px;flex:none;object-fit:cover/);
        expect(css).toMatch(/\.pic-preview\{width:112px;height:84px;object-fit:cover/);
        expect(css).toMatch(/\.tbl-pic\{width:52px;height:40px;object-fit:cover/);
        // The file input is a control a thumb can hit.
        expect(css).toMatch(/\.pic-acts input\[type=file\]\{[^}]*min-height:44px/);
        expect(fileTablesAdminCss()).not.toContain('`');
    });
});

describe('and the server accepts a picture as data', () => {
    const A = () => read('modules', 'tools', 'definitions', 'ApiProjectTool.ts');

    it('the text cap does not refuse every photo', () => {
        const a = A();
        expect(a).toMatch(/var cap = \/\(\^\|_\)\(image\|photo\|picture\|img\)\$\/\.test\(f\.key\) \? 800000 : 500;/);
        expect(a).toMatch(/String\(v\)\.length > cap/);
    });

    it('and the body limit does not either — 100kb refused every row with one', () => {
        expect(A()).toMatch(/app\.use\(express\.json\(\{ limit: '4mb' \}\)\);/);
    });
});
