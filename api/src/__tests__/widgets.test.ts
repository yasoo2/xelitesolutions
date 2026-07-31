/**
 * The interactive pieces the blueprints promise.
 *
 * "a data table with sortable headers … and pagination", "a product grid with
 * filters by category and price", "a results band with animated counters", "a
 * countdown timer that actually counts", "code blocks with a copy button that
 * works", "a table of contents that highlights while scrolling" — every one of
 * those was a promise resting on an instruction, and the model writes the
 * headers without the sort and the buttons without the filter.
 *
 * The behaviour is verified in a real browser. These cover the rules and the
 * honesty guarantees.
 */

import { widgetBrief, widgetRuntime, widgetCss, usesWidgets } from '../core/design/widgets';

describe('usesWidgets', () => {
    it.each([
        ['<table data-sort-table>', true],
        ['<div data-filter-for="x">', true],
        ['<strong data-count-to="10">', true],
        ['<div data-countdown="2030-01-01">', true],
        ['<pre data-copy>', true],
        ['<nav data-toc="a">', true],
        ['<div class="card"><h3>plain</h3></div>', false],
        ['', false],
    ])('%s -> %s', (html, expected) => expect(usesWidgets(html)).toBe(expected));

    it('means an unused widget costs the page nothing', () => {
        expect(usesWidgets('<html><body><h1>a landing page</h1></body></html>')).toBe(false);
    });
});

describe('the markup contract handed to the model', () => {
    const brief = widgetBrief();

    it('names every widget the runtime wires', () => {
        for (const a of ['data-sort-table', 'data-paginate', 'data-filter-for', 'data-category',
            'data-count-to', 'data-countdown', 'data-copy', 'data-toc']) {
            expect(brief).toContain(a);
        }
    });

    it('forbids the model writing the JavaScript itself', () => {
        expect(brief).toMatch(/Do NOT write JavaScript for any of these/i);
    });

    it('warns that a dead control is a reported defect', () => {
        expect(brief.replace(/\s+/g, ' ')).toMatch(/a control that does nothing is a defect the browser audit will report/i);
    });
});

describe('the table sorts the way a hand-written sort does not', () => {
    const rt = widgetRuntime(true);

    it('sorts numbers as numbers, not as strings', () => {
        // "1,200" sorting before "9" is the classic defect of a model-written
        // sort, and currency and separators are exactly what a price column has.
        expect(rt).toContain('function asNumber');
        expect(rt).toContain('function numericColumn');
        expect(rt).toMatch(/parseFloat\(String\(s\)\.replace\(/);
    });

    it('decides numeric by the column, not by the first cell', () => {
        expect(rt).toContain('num / seen > 0.7');
    });

    it('sorts text with a locale-aware comparison', () => {
        expect(rt).toContain('localeCompare');
    });

    it('announces the sort state to a screen reader', () => {
        expect(rt).toContain("setAttribute('aria-sort'");
        expect(rt).toContain("'ascending'");
        expect(rt).toContain("'descending'");
    });

    it('makes the header a real button, not a click handler on a th', () => {
        expect(rt).toContain("createElement('button')");
        expect(rt).toContain("btn.type = 'button'");
    });

    it('announces the page change in a live region', () => {
        expect(rt).toContain("info.setAttribute('aria-live', 'polite')");
    });
});

describe('the filter', () => {
    const rt = widgetRuntime(true);

    it('uses aria-pressed rather than a class nobody can hear', () => {
        expect(rt).toContain("setAttribute('aria-pressed'");
    });

    it('supports a card belonging to several categories', () => {
        expect(rt).toContain("(card.getAttribute('data-category') || '').split(");
    });

    it('says so when nothing matches instead of showing an empty grid', () => {
        expect(rt).toContain('T.noMatch');
        expect(rt).toContain("setAttribute('role', 'status')");
    });
});

describe('the counter respects the reader', () => {
    const rt = widgetRuntime(true);

    it('shows the number outright when reduced motion is asked for', () => {
        expect(rt).toContain('if (reduced) { show(target); return; }');
    });

    it('counts only once, when it comes into view', () => {
        expect(rt).toContain('IntersectionObserver');
        expect(rt).toContain('io.disconnect()');
    });

    it('still works where IntersectionObserver does not exist', () => {
        expect(rt).toContain("if (!('IntersectionObserver' in window)) { run(); return; }");
    });
});

describe('the countdown is honest about a date that has passed', () => {
    const ar = widgetRuntime(true);
    const en = widgetRuntime(false);

    it('says the date has passed rather than freezing at zero', () => {
        // A countdown stuck at 00:00:00 claims an event is about to start when
        // it finished last year.
        expect(ar).toContain('T.passed');
        expect(ar).toContain('انتهى الموعد');
        expect(en).toContain('This date has passed');
        expect(ar).toContain('clearInterval(timer)');
    });

    it('refuses an unparseable date instead of rendering NaN', () => {
        expect(ar).toContain("if (!isFinite(when)) { el.textContent = ''; return; }");
    });
});

describe('the table of contents lists sections, not every card', () => {
    const rt = widgetRuntime(true);

    it('skips headings inside repeated components', () => {
        // Including them turned a 7-section page into a 13-entry list of
        // product names — found by counting the entries in a real browser.
        expect(rt).toContain("h.closest('.card,[data-product],figure,li,[data-chart],aside,footer,nav')");
    });

    it('gives a heading an id when it has none, so the link can land', () => {
        expect(rt).toContain("if (!h.id) h.id = 'sec-'");
    });

    it('marks the current section with aria-current', () => {
        expect(rt).toContain("setAttribute('aria-current', 'true')");
    });
});

describe('the runtime as a whole', () => {
    const rt = widgetRuntime(true);

    it('is self-contained: no dependency, no network', () => {
        expect(rt.startsWith('<script>')).toBe(true);
        expect(rt).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|\bimport\s|\brequire\s*\(/);
        expect(rt).not.toMatch(/https?:\/\//);
        expect(rt).not.toMatch(/jquery|lodash|datatables/i);
    });

    it('never lets one broken widget take the others down', () => {
        expect(rt).toContain('try { fn(n); } catch (e) { }');
    });

    it('speaks the language of the page', () => {
        expect(rt).toContain('لا نتائج مطابقة');
        expect(widgetRuntime(false)).toContain('Nothing matches.');
    });
});

describe('the widget styling', () => {
    const css = widgetCss();

    it('has balanced braces', () => {
        expect((css.match(/\{/g) || []).length).toBe((css.match(/\}/g) || []).length);
    });

    it('styles state from the accessible attribute, not a parallel class', () => {
        expect(css).toContain('[aria-sort="ascending"]');
        expect(css).toContain('[data-filter][aria-pressed="true"]');
        expect(css).toContain('a[aria-current]');
    });

    it('uses logical properties throughout, so nothing is mirrored in Arabic', () => {
        expect(css).toContain('inset-inline-end');
        expect(css).toContain('border-inline-start');
        expect(css).toContain('text-align:start');
        expect(css).not.toMatch(/(margin|padding)-(left|right)\s*:/);
    });

    it('keeps the copy button reachable without a mouse', () => {
        expect(css).toContain('.joe-copy:focus-visible');
        expect(css).toContain('@media (hover:none)');
    });
});
