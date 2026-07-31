/**
 * The chart runtime.
 *
 * `imageBudget('dashboard')` is 0 — a dashboard has no photographs, so every
 * visual on it is drawn, and a weak model cannot draw an SVG chart from data.
 * «لوحة تحكم» came out as boxes with numbers in them.
 *
 * The rendering is verified in a real browser and by looking at the screenshot,
 * which is where the RTL mirroring, the stretched sparkline and the collapsed
 * card grid were all found. What is checked here is the part that is a rule
 * rather than a pixel: the visualisation decisions a model gets wrong.
 */

import { chartBrief, chartRuntime, chartCss, needsCharts, CATEGORICAL } from '../core/design/dataviz';

describe('needsCharts', () => {
    it('ships with the page kinds that have data and no photographs', () => {
        expect(needsCharts('dashboard')).toBe(true);
        expect(needsCharts('app')).toBe(true);
        for (const k of ['store', 'landing', 'restaurant', 'blog', 'portfolio']) {
            expect(needsCharts(k)).toBe(false);
        }
    });
});

describe('the categorical palette', () => {
    it('is the documented set, not derived from the page brand', () => {
        // A hue generated from whatever brand the build happened to pick cannot
        // stay validated across 360 possible brands, and the fixed ORDER is the
        // colour-vision-safety mechanism.
        expect(CATEGORICAL.light).toEqual(['#2a78d6', '#eb6834', '#1baf7a', '#eda100']);
        expect(CATEGORICAL.dark).toEqual(['#3987e5', '#d95926', '#199e70', '#c98500']);
    });

    it('is capped at four slots', () => {
        // Past four, adjacent hues stop being separable under colour blindness.
        expect(CATEGORICAL.light).toHaveLength(4);
        expect(CATEGORICAL.dark).toHaveLength(4);
    });

    it('has a distinct step per mode rather than reusing one set', () => {
        expect(CATEGORICAL.dark).not.toEqual(CATEGORICAL.light);
        expect(CATEGORICAL.light.every(c => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
        expect(CATEGORICAL.dark.every(c => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    });
});

describe('the markup contract handed to the model', () => {
    const brief = chartBrief();

    it('names every chart type the runtime can draw', () => {
        for (const type of ['bar', 'line', 'share', 'spark', 'meter']) expect(brief).toContain(type);
    });

    it('forbids a pie or a donut, because part-to-whole is a stacked bar', () => {
        expect(brief).toMatch(/do NOT ask for a pie or a donut/i);
    });

    it('forbids the model drawing its own SVG or pulling in a chart library', () => {
        expect(brief).toMatch(/Do NOT write any SVG, any chart JavaScript, or a chart library/i);
    });

    it('caps the series count in the instruction, not only in the code', () => {
        expect(brief).toMatch(/Four series maximum/i);
    });

    it('says a single headline number is not a chart', () => {
        expect(brief).toMatch(/A single headline number is NOT a chart/i);
    });

    it('asks for the business\'s real numbers', () => {
        expect(brief).toMatch(/Use REAL numbers/i);
    });
});

describe('the runtime applies the visualisation rules a model gets wrong', () => {
    const rt = chartRuntime(true);

    it('gives a single-series bar chart ONE hue — the page brand — not one colour per bar', () => {
        // Colouring nominal bars by their value spends the identity channel
        // re-encoding what bar length already shows. The rainbow bar chart is
        // the single most common generated-dashboard mistake.
        expect(rt).toContain("fill: n === 1 ? brand() : series(s)");
    });

    it('caps the series at four before drawing anything', () => {
        expect(rt).toContain('rows.slice(0, 4)');
    });

    it('shows a legend for two or more series and none for one', () => {
        expect(rt).toContain('if (names.length < 2) return;');
    });

    it('labels selectively rather than putting a number on every mark', () => {
        // The extreme on a bar chart, the endpoint on a line.
        expect(rt).toContain('maxIdx');
        expect(rt).toMatch(/row\[row\.length - 1\]/);
    });

    it('rounds the axis to clean numbers instead of the raw maximum', () => {
        expect(rt).toContain('function niceMax');
    });

    it('draws a 4px rounded data-end that is square at the baseline', () => {
        expect(rt).toContain('var r = Math.min(4, bw / 2, bh)');
    });

    it('caps bar thickness so the band keeps some air', () => {
        expect(rt).toContain('Math.min(24,');
    });

    it('uses a 2px line with round joins and a ringed marker', () => {
        expect(rt).toContain("'stroke-width': 2");
        expect(rt).toContain("'stroke-linejoin': 'round'");
        expect(rt).toMatch(/r: 4, fill: color, stroke: surface, 'stroke-width': 2/);
    });

    it('washes a single-series area at 10%, and does not wash several', () => {
        expect(rt).toContain("'fill-opacity': 0.1");
        expect(rt).toContain('if (rows.length === 1) {');
    });

    it('mirrors the whole plot on an Arabic page', () => {
        // Drawing a chart left-to-right inside an RTL document put the value
        // axis on the wrong side of every chart — the most visible defect in
        // the first render.
        expect(rt).toContain('function rtl()');
        expect(rt).toContain("'transform', 'scale(-1,1)'");
        // …and un-mirrors the text, or the numerals come out backwards.
        expect(rt).toContain('function label(');
    });

    it('ships a table of the same numbers with every chart', () => {
        // The light palette carries a contrast WARN, which obliges a table view
        // or visible labels — this is that relief, and it also means nothing is
        // gated behind seeing colour at all.
        expect(rt).toContain('function tableFor');
        expect(rt).toContain('scope="row"');
        expect(rt).toContain('aria-expanded');
    });

    it('marks each chart as an image with a name', () => {
        expect(rt).toContain("role: 'img'");
        expect(rt).toContain("'aria-label': title");
    });

    it('ships a hover tooltip, which an SVG chart should have by default', () => {
        expect(rt).toContain('function showTip');
        expect(rt).toContain("addEventListener('mouseenter'");
    });

    it('redraws on a colour-scheme change, because dark is its own steps', () => {
        expect(rt).toContain("matchMedia('(prefers-color-scheme: dark)')");
        expect(rt).toContain("removeAttribute('data-drawn')");
    });

    it('never sets width="100%" on the svg, which stretched a sparkline', () => {
        // A viewBox scales both axes together, so a 120x34 sparkline given
        // width:100% became 300px tall inside its stat card.
        expect(rt).not.toContain("width: '100%'");
    });

    it('is self-contained: no dependency, no network, no chart library', () => {
        expect(rt.startsWith('<script>')).toBe(true);
        expect(rt).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|\bimport\s|\brequire\s*\(/);
        expect(rt).not.toMatch(/https?:\/\/(?!www\.w3\.org)/);
        expect(rt).not.toMatch(/d3|chart\.js|highcharts|echarts/i);
    });

    it('never throws into the page when the data is unusable', () => {
        expect(rt).toContain('T.noData');
        expect(rt).toContain('try {');
    });

    it('speaks the language of the page', () => {
        expect(rt).toContain('عرض الأرقام');
        expect(chartRuntime(false)).toContain('Show the numbers');
    });
});

describe('the chart styling', () => {
    const css = chartCss();

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('sizes each chart type by aspect ratio rather than a fixed height', () => {
        expect(css).toContain('aspect-ratio:640/260');
        expect(css).toContain('aspect-ratio:120/34');
    });

    it('is built on the palette tokens', () => {
        expect(css).toContain('var(--surface)');
        expect(css).toContain('var(--border)');
    });

    it('uses logical properties so it is not mirrored in Arabic', () => {
        expect(css).toContain('margin-inline-end');
        expect(css).toContain('text-align:start');
        expect(css).not.toMatch(/margin-(left|right)\s*:/);
    });
});
