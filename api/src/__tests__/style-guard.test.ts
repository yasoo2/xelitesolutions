/**
 * Style guard: a model-written section keeps its styling to itself.
 * Global rules die, everything else is scoped to the section's #id, inline
 * landmines are defused — and a clean section passes through untouched.
 */
import { guardSectionStyles } from '../core/design/style-guard';

describe('style-guard', () => {
    test(':root redeclaration inside a section is removed and reported', () => {
        const r = guardSectionStyles(
            '<section id="hero"><style>:root{--tint:#f00}.card{padding:8px}</style><h2>x</h2></section>', 'hero');
        expect(r.html).not.toContain('--tint:#f00');
        expect(r.html).toContain('#hero .card{padding:8px}');
        expect(r.actions).toContain('dropped-root-redeclaration');
        expect(r.notesAr.some(n => /:root/.test(n))).toBe(true);
    });

    test('body/html/* rules are dropped — they cannot be scoped', () => {
        const r = guardSectionStyles(
            '<section id="menu"><style>body{margin:0}html{font-size:18px}*{box-sizing:content-box}.ok{color:red}</style></section>', 'menu');
        expect(r.html).not.toContain('margin:0');
        expect(r.html).not.toContain('font-size:18px');
        expect(r.html).not.toContain('content-box');
        expect(r.html).toContain('#menu .ok{color:red}');
        expect(r.actions).toEqual(expect.arrayContaining(['dropped-global:body', 'dropped-global:html', 'dropped-global:*']));
    });

    test('tag selectors are confined to the section, not the page', () => {
        const r = guardSectionStyles('<section id="faq"><style>p{line-height:2}h2:hover{color:blue}</style></section>', 'faq');
        expect(r.html).toContain('#faq p{line-height:2}');
        expect(r.html).toContain('#faq h2:hover{color:blue}');
    });

    test('a bare .section selector (ALL sections) becomes this section only', () => {
        const r = guardSectionStyles('<section id="hero"><style>.section{background:black}</style></section>', 'hero');
        expect(r.html).toContain('#hero{background:black}');
        expect(r.html).not.toMatch(/[^#\w]\.section\{/);
    });

    test('selector lists are scoped member by member', () => {
        const r = guardSectionStyles('<section id="x"><style>.a, .b{gap:4px}</style></section>', 'x');
        expect(r.html).toContain('#x .a, #x .b{gap:4px}');
    });

    test('rules inside @media are scoped too', () => {
        const r = guardSectionStyles(
            '<section id="hero"><style>@media (max-width:600px){.grid{display:block}body{margin:0}}</style></section>', 'hero');
        expect(r.html).toContain('#hero .grid{display:block}');
        expect(r.html).not.toContain('margin:0');
        expect(r.html).toContain('@media (max-width:600px)');
    });

    test('@keyframes are renamed per section and their animation references follow', () => {
        const r = guardSectionStyles(
            '<section id="hero"><style>@keyframes fadeIn{from{opacity:0}to{opacity:1}}.h{animation: fadeIn 1s ease}</style></section>', 'hero');
        expect(r.html).toContain('@keyframes fadeIn-hero');
        expect(r.html).toContain('animation: fadeIn-hero 1s ease');
    });

    test('inline position:fixed becomes relative', () => {
        const r = guardSectionStyles('<div style="position:fixed;top:0">شريط</div>', 'hero');
        expect(r.html).toContain('position:relative');
        expect(r.actions).toContain('inline-fixed-position');
    });

    test('a giant fixed inline width becomes max-width:100%', () => {
        const r = guardSectionStyles('<div style="width:1200px;padding:4px">x</div>', 'hero');
        expect(r.html).toContain('max-width:100%');
        expect(r.html).not.toContain('width:1200px');
    });

    test('a NORMAL inline width is left alone', () => {
        const r = guardSectionStyles('<img style="width:320px" src="a.jpg">', 'hero');
        expect(r.html).toContain('width:320px');
        expect(r.actions).not.toContain('inline-huge-width');
    });

    test('a runaway z-index is capped', () => {
        const r = guardSectionStyles('<div style="z-index:99999">x</div>', 'hero');
        expect(r.html).toContain('z-index:10');
    });

    test('a clean section passes through byte-identical', () => {
        const clean = '<section id="hero"><h2>مرحبا</h2><p style="color:var(--ink)">نص</p></section>';
        const r = guardSectionStyles(clean, 'hero');
        expect(r.html).toBe(clean);
        expect(r.actions).toHaveLength(0);
        expect(r.notesAr).toHaveLength(0);
    });

    test('a style block that becomes empty is removed entirely', () => {
        const r = guardSectionStyles('<section id="a"><style>body{margin:0}</style><p>x</p></section>', 'a');
        expect(r.html).not.toContain('<style>');
    });

    test('every action carries an Arabic note for the build log', () => {
        const r = guardSectionStyles(
            '<section id="s"><style>:root{--x:1}body{margin:0}</style><div style="position:fixed">x</div></section>', 's');
        expect(r.actions.length).toBeGreaterThanOrEqual(3);
        expect(r.notesAr.length).toBeGreaterThanOrEqual(3);
        for (const n of r.notesAr) expect(n).toMatch(/[؀-ۿ]/);
    });
});
