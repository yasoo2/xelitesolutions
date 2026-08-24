import fs from 'fs';
import os from 'os';
import path from 'path';
import { pruneMissingFontResources } from '../core/design/font-resources';

function fixture() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-font-contract-'));
    const cssPath = path.join(root, 'src', 'styles', 'app.css');
    fs.mkdirSync(path.dirname(cssPath), { recursive: true });
    return { root, cssPath };
}

describe('generated font resources are honest before build', () => {
    let root = '';
    afterEach(() => {
        if (root) fs.rmSync(root, { recursive: true, force: true });
        root = '';
    });

    test('removes a missing invented face but keeps a real face and remote import', () => {
        const f = fixture();
        root = f.root;
        fs.mkdirSync(path.join(root, 'src', 'styles', 'fonts'), { recursive: true });
        fs.writeFileSync(path.join(root, 'src', 'styles', 'fonts', 'cairo-400-latin.woff2'), 'real font');
        const css = [
            '@font-face{font-family:Cairo;src:url("./fonts/zqvorn-000.woff2") format("woff2")}',
            '@font-face{font-family:Cairo;src:url("./fonts/cairo-400-latin.woff2") format("woff2")}',
            '@import url("https://fonts.example.invalid/cairo.css");',
        ].join('\n');

        const result = pruneMissingFontResources(css, f.cssPath, root);

        expect(fs.existsSync(path.join(root, 'src', 'styles', 'fonts', 'zqvorn-000.woff2'))).toBe(false);
        expect(result.removed).toEqual(['./fonts/zqvorn-000.woff2']);
        expect(result.css).not.toContain('zqvorn-000.woff2');
        expect(result.css).toContain('cairo-400-latin.woff2');
        expect(result.css).toContain('https://fonts.example.invalid/cairo.css');
    });

    test('a real face is never removed and the missing-face check is not vacuous', () => {
        const f = fixture();
        root = f.root;
        const real = path.join(root, 'src', 'styles', 'fonts', 'qelvani-400.woff2');
        fs.mkdirSync(path.dirname(real), { recursive: true });
        fs.writeFileSync(real, 'real font');
        const css = '@font-face{font-family:Qelvani;src:url(./fonts/qelvani-400.woff2)}';

        const result = pruneMissingFontResources(css, f.cssPath, root);

        expect(fs.existsSync(real)).toBe(true);
        expect(result.removed).toEqual([]);
        expect(result.css).toContain('qelvani-400.woff2');

        // Mutation guard: if the existence check were disabled, the same
        // negative fixture would be accepted and this assertion would fail.
        const missing = pruneMissingFontResources(
            '@font-face{font-family:Qelvani;src:url(./fonts/qelvani-000.woff2)}',
            f.cssPath,
            root,
        );
        expect(missing.removed).toEqual(['./fonts/qelvani-000.woff2']);
        expect(missing.css).not.toContain('qelvani-000.woff2');
    });
});
