/**
 * «انت عملت قالب ولكن انا اريد جو يمتلك مهارة في تصميم أي موقع مهما كان
 * المطلوب من أي بروميت» — and by the fishing law he was right: the design
 * lift produced the same bytes for every request. A floor is not a skill.
 *
 * Skill is a READER. The prompt's own design language — ground, hex, gold,
 * logo place, dropdown, corners, motion, photos, footer, rhythm — is parsed
 * as SHAPES of two languages (never business domains), obeyed at real seams,
 * and said out loud. The gate below is the law's own test: directives change
 * the bytes; silence changes nothing.
 */
import fs from 'fs';
import path from 'path';
import { readDesignDirectives, directivesCss, hexToHue } from '../core/design/design-directives';

const SRC = path.join(__dirname, '..');
const read = (...p: string[]) => fs.readFileSync(path.join(SRC, ...p), 'utf-8');

describe('the reader hears the design language of both tongues', () => {
    it('reads a fully-specified Arabic brief', () => {
        const d = readDesignDirectives('ابنِ موقعاً لمقهى بخلفية داكنة ولمسة ذهبية، الشعار في المنتصف، قائمة منسدلة، زوايا كبسولية، بدون صور وبدون حركات، تذييل بسيط');
        expect(d.ground).toBe('dark');
        expect(d.goldAccent).toBe(true);
        expect(d.logoPosition).toBe('center');
        expect(d.navDropdown).toBe(true);
        expect(d.corners).toBe('pill');
        expect(d.photos).toBe('off');
        expect(d.motion).toBe('off');
        expect(d.footer).toBe('minimal');
        expect(d.spoken.length).toBeGreaterThanOrEqual(7);
    });

    it('reads the same wishes in English', () => {
        const d = readDesignDirectives('a landing page, dark theme, logo centered, dropdown navigation, sharp corners, no photos, minimal footer', false);
        expect(d.ground).toBe('dark');
        expect(d.logoPosition).toBe('center');
        expect(d.navDropdown).toBe(true);
        expect(d.corners).toBe('sharp');
        expect(d.photos).toBe('off');
        expect(d.footer).toBe('minimal');
    });

    it('a typed hex is the most precise colour language there is', () => {
        expect(readDesignDirectives('موقع بلون #1e90ff').hex).toBe('#1e90ff');
        expect(hexToHue('#ff0000')).toBe(0);
        expect(hexToHue('#00ff00')).toBe(120);
        expect(hexToHue('#00f')).toBe(240);
        expect(hexToHue('nonsense')).toBeNull();
    });

    it('فخم implies air — and gold only when he named no colour himself', () => {
        const lux = readDesignDirectives('موقع فخم لدار عطور');
        expect(lux.density).toBe('airy');
        expect(lux.goldAccent).toBe(true);
        const luxBlue = readDesignDirectives('موقع فخم بألوان زرقاء لدار عطور');
        expect(luxBlue.goldAccent).toBeUndefined();
    });

    it('THE FISHING TEST: silence produces no directives and no CSS', () => {
        const d = readDesignDirectives('ابنِ موقعاً لمقهى مختص اسمه «كِفاح»');
        expect(d.spoken).toHaveLength(0);
        expect(directivesCss(d)).toBe('');
    });

    it('and two different briefs produce different CSS bytes', () => {
        const a = directivesCss(readDesignDirectives('موقع بزوايا كبسولية وتصميم فخم'));
        const b = directivesCss(readDesignDirectives('موقع بزوايا حادة مضغوط بدون حركات'));
        expect(a).not.toBe(b);
        expect(a).toMatch(/999px/);
        expect(b).toMatch(/animation:none/);
    });
});

describe('the brand names the folder — diacritics never cut the name', () => {
    it('«كِفاح» slugs whole: the kasra is dropped, not turned into a hyphen', () => {
        const { PROJECT_SLUG_FOR_TEST } = require('../modules/tools/definitions/ReactProjectTool');
        expect(PROJECT_SLUG_FOR_TEST('كِفاح')).toBe('كفاح');           // shipped as «react-ك-فاح»
        expect(PROJECT_SLUG_FOR_TEST('قهوة مختصة')).toBe('قهوة-مختصة'); // spaces still hyphenate
    });
    it('and the generated app derives its live-row slugs with REAL unicode classes', () => {
        // Inside a template literal `\p` cooks to a bare `p`, so the emitted
        // regex was `[^p{L}p{N}]+` — a broken class masked by the baked-slug
        // branch. The template must carry the DOUBLE escape.
        const src = fs.readFileSync(path.join(SRC, 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
        expect(src).toContain('replace(/\\\\p{M}+/gu');
        expect(src).toContain('[^\\\\p{L}\\\\p{N}]+/gu');
    });
});

describe('each directive is obeyed at a real seam', () => {
    const R = () => read('modules', 'tools', 'definitions', 'ReactProjectTool.ts');

    it('the builder reads the directives and says what it read', () => {
        const r = R();
        expect(r).toMatch(/const directives = readDesignDirectives\(request, isAr\)/);
        expect(r).toMatch(/design directives: \$\{directives\.spoken\.join/);
    });
    it('a dark ground becomes the page default, not an OS opinion', () => {
        expect(R()).toMatch(/he asked for a dark ground/);
        expect(R()).toMatch(/directives\.ground === 'dark'/);
    });
    it('a typed hex re-derives the whole palette through the AA fitter', () => {
        expect(R()).toMatch(/paletteForHue\(hue\)/);
    });
    it('«بدون صور» gates the photo fetch itself', () => {
        expect(R()).toMatch(/directives\.photos !== 'off'/);
    });
    it('the directives CSS is appended last, where later rules win', () => {
        expect(R()).toMatch(/fileBaseCss\(family\) \+ directivesCss\(directives\)/);
    });
    it('the navbar folds overflow into a NATIVE details menu when asked', () => {
        const r = R();
        expect(r).toMatch(/const fold = content\.navDropdown && links\.length > 4;/);
        expect(r).toMatch(/<details className="nav-more">/);
    });
    it('the minimal footer is the brand and the year, because he said so', () => {
        expect(R()).toMatch(/if \(content\.footerMinimal\) \{/);
    });
    it('and the flags ride into content.js, so an edit later still sees them', () => {
        const r = R();
        for (const key of ['headerLayout:', 'navDropdown:', 'defaultDark:', 'footerMinimal:', 'moreLabel:']) {
            expect(r).toContain(key);
        }
    });
});
