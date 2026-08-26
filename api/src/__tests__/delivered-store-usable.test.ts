/**
 * WHAT HE ACTUALLY RECEIVED.
 *
 * The routing fix worked — `build scope = system -> api_project + react_project`,
 * real files, a real build, no essays. Then he opened it, and his screenshot
 * shows a store he cannot use:
 *
 *   · every word in ENGLISH — «Owner sign-in», «Add to cart», «All
 *     categories» — for a man who reads nothing but Arabic. He wrote ONE
 *     request in English and the builder took the script of that sentence as
 *     a statement about the person;
 *   · and broken-image icons on every card, because a row in the database
 *     holds «"C:/Users/home/OneDrive/Pictures/Screenshots/rMdx….jpg"» —
 *     quotation marks included — which his own server answered 404 for, in
 *     that very log.
 *
 * The build-time image guard shipped earlier cannot reach the second one:
 * those values arrive from the DATABASE at runtime, long after the files are
 * written.
 */
import fs from 'fs';
import path from 'path';

const REACT = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ReactProjectTool.ts'), 'utf-8');
const API = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'ApiProjectTool.ts'), 'utf-8');
const TPL = () => fs.readFileSync(
    path.join(__dirname, '..', 'modules', 'tools', 'definitions', 'react-app-templates.ts'), 'utf-8');

describe('the interface speaks the user\'s language, not the prompt\'s', () => {
    it('the React builder consumes the shared interface language', () => {
        expect(REACT()).toContain('replyLanguageCode');
    });

    it('and so does the API builder — one rule, both halves of a system', () => {
        expect(API()).toContain('replyLanguageCode');
    });

    it('the real React builder reports both language decisions in its classification line', async () => {
        const { ReactProjectTool } = require('../modules/tools/definitions/ReactProjectTool');
        const request = 'ابنِ صفحة لمقهى';
        const run = async (label: string, language?: string, text = request) => {
            const root = fs.mkdtempSync(path.join(require('os').tmpdir(), `joe-language-${label}-`));
            const sessionId = `delivered-language-${label}-${Date.now()}`;
            try {
                const result: any = await new ReactProjectTool().execute(
                    { request: text, skipInstall: true, root },
                    { sessionId, ...(language ? { language } : {}) },
                );
                expect(result.ok).toBe(true);
                return (result.logs || []).find((line: string) => line.includes('template classification:')) || '';
            } finally {
                fs.rmSync(root, { recursive: true, force: true });
                delete (global as any).joeProjects?.[sessionId];
            }
        };
        expect(await run('english-ui', 'en')).toContain('lang=en (ui=en)');
        expect(await run('no-ui')).toContain('lang=ar (ui=absent)');
        expect(await run('unicode-arabic-fallback', undefined, '\u0750\u08A0\uFB50'))
            .toContain('lang=ar (ui=absent)');
    }, 120000);

    it('the prompt\'s script still decides when the session says nothing', () => {
        // The fallback is intact: a fresh call with no language context keeps
        // the old behaviour rather than defaulting everyone to one language.
        const rule = (uiLang: string, request: string) =>
            (uiLang ? uiLang.toLowerCase().startsWith('ar') : /[؀-ۿ]/.test(request));
        expect(rule('', 'ابنِ متجراً')).toBe(true);
        expect(rule('', 'build a store')).toBe(false);
        expect(rule('ar', 'build a world-class e-commerce platform')).toBe(true);   // his case
        expect(rule('en', 'ابنِ متجراً')).toBe(false);
        expect(rule('ar-SA', 'anything')).toBe(true);
    });
});

describe('a picture address from the database cannot break a card', () => {
    /**
     * The guard exactly as it is generated into the app — regex-free on
     * purpose. The first version used patterns, and every backslash in them
     * was collapsed by the template literal that writes the file: the store
     * shipped `/^(data:|https?://)/` and would not parse. The syntax gate
     * caught it; this keeps it caught.
     */
    const webImage = (raw: any) => {
        let v = String(raw ?? '').trim();
        while (v && (v[0] === '"' || v[0] === "'")) v = v.slice(1);
        while (v && (v[v.length - 1] === '"' || v[v.length - 1] === "'")) v = v.slice(0, -1);
        v = v.trim();
        if (!v) return '';
        const low = v.toLowerCase();
        if (low.indexOf('data:') === 0 || low.indexOf('http://') === 0
            || low.indexOf('https://') === 0 || low.indexOf('//') === 0) return v;
        const BACKSLASH = String.fromCharCode(92);
        if (low.indexOf('file:') === 0) return '';
        if (v.indexOf(BACKSLASH) >= 0) return '';
        if (v.length > 2 && v[1] === ':') return '';
        for (const root of ['/home/', '/users/', '/root/', '/var/', '/tmp/', '/mnt/']) {
            if (low.indexOf(root) === 0) return '';
        }
        return v;
    };

    it('refuses his exact row, quotation marks and all', () => {
        expect(webImage('"C:/Users/home/OneDrive/Pictures/Screenshots/rMdxgLDt1aCSm5wlwOc9wfydlWaylEfbvu3of2u3.jpg"')).toBe('');
    });

    it.each(['C:\\Users\\home\\a.png', 'file:///C:/x.jpg', '/home/user/a.jpg', '/Users/y/b.png', 'D:/c.webp'])
        ('refuses %s', (bad) => { expect(webImage(bad)).toBe(''); });

    it.each([
        ['https://cdn.example.com/a.jpg', 'https://cdn.example.com/a.jpg'],
        ['/images/a.jpg', '/images/a.jpg'],
        ['./a.png', './a.png'],
        ['data:image/png;base64,AA', 'data:image/png;base64,AA'],
        ['"https://cdn.example.com/a.jpg"', 'https://cdn.example.com/a.jpg'],   // quotes stripped, address kept
    ])('keeps %s', (input, want) => { expect(webImage(input)).toBe(want); });

    it('and empty stays empty — the card shows its placeholder', () => {
        expect(webImage('')).toBe('');
        expect(webImage(null)).toBe('');
        expect(webImage(undefined)).toBe('');
    });

    it('the generated card really uses it', () => {
        const tpl = TPL();
        expect(tpl).toMatch(/const webImage = \(raw\) => \{/);
        // …and it stays regex-free: a pattern here does not survive the
        // template literal that generates this file. `indexOf` and character
        // comparisons only — no `/…/` anywhere between these two lines.
        const from = tpl.indexOf('const webImage = (raw) => {');
        const helper = tpl.slice(from, tpl.indexOf('  return v;', from));
        expect(helper).toContain('String.fromCharCode(92)');
        expect(helper).not.toContain('.test(');
        expect(helper).not.toContain('/^');
        //  ⛔ THE CLAIM IS THAT THE SANITISED VALUE IS WHAT THE CARD USES.
        //
        //  This pinned one spelling of it: the ternary that chose between the
        //  image and an empty div. The store draws a designed card when there
        //  is no photo now, so the same value reaches the same <img> through
        //  an || instead of a ?, and the guard went red while the thing it
        //  names -- the raw address never being used -- was untouched.
        //
        //  Both halves are asserted below, on the card itself: the sanitiser
        //  IS what feeds the src, and the raw value is NOT. That is the claim,
        //  and it survives whichever operator carries it.
        expect(tpl).toMatch(/<img src=\{webImage\(p\.image\)/);
        // …and the STORE card no longer renders the raw value. (The social
        // feed's `p.image` is a data URI the app itself made from an upload —
        // a different value with a different provenance, deliberately left.)
        const card = tpl.slice(tpl.indexOf('className="product"'), tpl.indexOf('className="product"') + 600);
        expect(card).not.toMatch(/<img src=\{p\.image\}/);
        expect(card).toMatch(/webImage\(p\.image\)/);
    });
});
