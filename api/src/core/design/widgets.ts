/**
 * The interactive pieces every blueprint promises and no weak model delivers.
 *
 * Read the blueprints and the same shape appears in each: "a data table with
 * sortable headers … and pagination", "a product grid with filters by category
 * and price", "a results band with animated counters", "a countdown timer that
 * actually counts", "code blocks with a copy button that works", "a table of
 * contents that highlights while scrolling".
 *
 * Every one of those is a promise made to the user on the strength of an
 * instruction, and an instruction is not enforcement. The model writes the
 * headers and no sort, the filter buttons and no filter, the number and no
 * count. The behaviour audit catches a dead control but cannot invent the
 * behaviour it was missing.
 *
 * So they ship as runtime, like the cart, the form validator and the charts. The
 * model writes markup with data attributes; the behaviour is Joe's, it is the
 * same on every page, and it is honest — a countdown that has passed says so
 * rather than freezing at zero.
 */

/** The markup contract, handed to the model alongside the blueprint. */
export function widgetBrief(): string {
    return `INTERACTIVE PIECES — Joe wires these; you write the markup only.

- Sortable table:  <table data-sort-table data-paginate="10"> with a real
  <thead><tr><th>…</th></tr></thead>. Every header becomes sortable, numbers sort
  as numbers, and pagination appears when there are more rows than the page size.
  Add data-no-sort to a header that must not be sortable.

- Filterable grid:  a row of buttons and the grid they control:
    <div data-filter-for="products">
      <button data-filter="*">الكل</button>
      <button data-filter="عود">عود</button>
    </div>
    <div class="grid-3" id="products">
      <div class="card" data-category="عود">…</div>
    </div>
  A card may carry several categories separated by spaces, and data-price="650"
  to be filtered by a <input type="range" data-filter-price="products">.

- Counting number:  <strong class="stat" data-count-to="1240" data-suffix="+">0</strong>
  counts up once when it scrolls into view.

- Countdown:  <div data-countdown="2026-12-31T18:00:00"></div>
  It counts down for real and says the date has passed when it has.

- Code block:  <pre data-copy><code>…</code></pre> gets a working copy button.

- Table of contents:  <nav data-toc="article-id"></nav> builds itself from the
  h2/h3 inside that element and highlights the section you are reading.

Do NOT write JavaScript for any of these. Joe wires them, accessibly, and a
control that does nothing is a defect the browser audit will report.`;
}

/** Every widget, in one script. Vanilla, no dependencies, no network. */
export function widgetRuntime(isArabic: boolean): string {
    const t = isArabic
        ? {
            copy: 'نسخ', copied: 'نُسخ', sortAsc: 'ترتيب تصاعدي', sortDesc: 'ترتيب تنازلي',
            prev: 'السابق', next: 'التالي', page: 'صفحة', of: 'من', noMatch: 'لا نتائج مطابقة.',
            days: 'يوم', hours: 'ساعة', minutes: 'دقيقة', seconds: 'ثانية', passed: 'انتهى الموعد',
            contents: 'المحتويات', showing: 'يُعرض',
        }
        : {
            copy: 'Copy', copied: 'Copied', sortAsc: 'Sort ascending', sortDesc: 'Sort descending',
            prev: 'Previous', next: 'Next', page: 'Page', of: 'of', noMatch: 'Nothing matches.',
            days: 'days', hours: 'hours', minutes: 'minutes', seconds: 'seconds', passed: 'This date has passed',
            contents: 'Contents', showing: 'Showing',
        };

    return `<script>
/* Joe widgets — the interactive pieces the blueprints promise. */
(function () {
  'use strict';
  var T = ${JSON.stringify(t)};
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { }

  /* ---------- sortable + paginated table ---------------------------------- */

  function sortableTable(table) {
    var head = table.tHead && table.tHead.rows[0];
    var body = table.tBodies[0];
    if (!head || !body) return;
    var size = parseInt(table.getAttribute('data-paginate') || '0', 10) || 0;
    var page = 0;
    var rows = Array.prototype.slice.call(body.rows);

    function cell(row, i) { return (row.cells[i] ? row.cells[i].textContent : '').trim(); }
    /* Numbers must sort as numbers: "1,200" after "9" is the classic defect of a
       hand-written sort, and it is what the model produces when it writes one. */
    function asNumber(s) {
      var n = parseFloat(String(s).replace(/[^\\d.eE+-]/g, ''));
      return isFinite(n) ? n : null;
    }
    function numericColumn(i) {
      var seen = 0, num = 0;
      rows.forEach(function (r) { var v = cell(r, i); if (v) { seen++; if (asNumber(v) !== null) num++; } });
      return seen > 0 && num / seen > 0.7;
    }

    function draw() {
      var view = rows.filter(function (r) { return !r.hasAttribute('data-filtered-out'); });
      var pages = size ? Math.max(1, Math.ceil(view.length / size)) : 1;
      if (page >= pages) page = pages - 1;
      body.innerHTML = '';
      var slice = size ? view.slice(page * size, page * size + size) : view;
      slice.forEach(function (r) { body.appendChild(r); });

      var bar = table.parentNode.querySelector('[data-table-pager]');
      if (!size) { if (bar) bar.remove(); return; }
      if (!bar) {
        bar = document.createElement('div');
        bar.setAttribute('data-table-pager', '');
        bar.className = 'joe-pager';
        table.parentNode.insertBefore(bar, table.nextSibling);
      }
      bar.innerHTML = '';
      if (pages < 2) { bar.hidden = true; return; }
      bar.hidden = false;
      var prev = document.createElement('button');
      prev.type = 'button'; prev.textContent = T.prev; prev.disabled = page === 0;
      prev.addEventListener('click', function () { if (page > 0) { page--; draw(); } });
      var info = document.createElement('span');
      info.setAttribute('aria-live', 'polite');
      info.textContent = T.page + ' ' + (page + 1) + ' ' + T.of + ' ' + pages;
      var next = document.createElement('button');
      next.type = 'button'; next.textContent = T.next; next.disabled = page >= pages - 1;
      next.addEventListener('click', function () { if (page < pages - 1) { page++; draw(); } });
      bar.appendChild(prev); bar.appendChild(info); bar.appendChild(next);
    }

    Array.prototype.forEach.call(head.cells, function (th, i) {
      if (th.hasAttribute('data-no-sort')) return;
      th.setAttribute('aria-sort', 'none');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'joe-sort';
      btn.innerHTML = th.innerHTML + '<span aria-hidden="true"></span>';
      btn.setAttribute('aria-label', th.textContent.trim() + ' — ' + T.sortAsc);
      th.innerHTML = '';
      th.appendChild(btn);

      btn.addEventListener('click', function () {
        var asc = th.getAttribute('aria-sort') !== 'ascending';
        Array.prototype.forEach.call(head.cells, function (o) { o.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        btn.setAttribute('aria-label', th.textContent.trim() + ' — ' + (asc ? T.sortDesc : T.sortAsc));
        var numeric = numericColumn(i);
        rows.sort(function (a, b) {
          var x = cell(a, i), y = cell(b, i);
          if (numeric) {
            var nx = asNumber(x), ny = asNumber(y);
            if (nx === null) return 1;
            if (ny === null) return -1;
            return asc ? nx - ny : ny - nx;
          }
          return asc ? x.localeCompare(y, undefined, { numeric: true }) : y.localeCompare(x, undefined, { numeric: true });
        });
        page = 0;
        draw();
      });
    });
    draw();
  }

  /* ---------- filterable grid --------------------------------------------- */

  function filterGroup(group) {
    var targetId = group.getAttribute('data-filter-for');
    var target = document.getElementById(targetId);
    if (!target) return;
    var buttons = Array.prototype.slice.call(group.querySelectorAll('[data-filter]'));
    var range = document.querySelector('[data-filter-price="' + targetId + '"]');
    var empty = null;

    function apply() {
      var active = (group.querySelector('[data-filter][aria-pressed="true"]') || {}).getAttribute
        ? group.querySelector('[data-filter][aria-pressed="true"]').getAttribute('data-filter') : '*';
      var maxPrice = range ? parseFloat(range.value) : null;
      var shown = 0;
      Array.prototype.forEach.call(target.children, function (card) {
        var cats = (card.getAttribute('data-category') || '').split(/\\s+/).filter(Boolean);
        var price = parseFloat(card.getAttribute('data-price'));
        var ok = (active === '*' || cats.indexOf(active) >= 0)
          && (maxPrice === null || isNaN(price) || price <= maxPrice);
        card.hidden = !ok;
        if (ok) shown++;
      });
      if (!empty) {
        empty = document.createElement('p');
        empty.className = 'joe-empty';
        empty.setAttribute('role', 'status');
        empty.textContent = T.noMatch;
        target.parentNode.insertBefore(empty, target.nextSibling);
      }
      empty.hidden = shown > 0;
      var count = group.querySelector('[data-filter-count]');
      if (count) count.textContent = T.showing + ' ' + shown;
    }

    buttons.forEach(function (b) {
      if (!b.hasAttribute('aria-pressed')) b.setAttribute('aria-pressed', b.getAttribute('data-filter') === '*' ? 'true' : 'false');
      b.addEventListener('click', function () {
        buttons.forEach(function (o) { o.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        apply();
      });
    });
    if (range) {
      var out = document.querySelector('[data-filter-price-output="' + targetId + '"]');
      range.addEventListener('input', function () { if (out) out.textContent = range.value; apply(); });
      if (out) out.textContent = range.value;
    }
    if (!group.querySelector('[data-filter][aria-pressed="true"]') && buttons[0]) buttons[0].setAttribute('aria-pressed', 'true');
    apply();
  }

  /* ---------- counting number --------------------------------------------- */

  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count-to'));
    if (!isFinite(target)) return;
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var show = function (v) { el.textContent = prefix + Math.round(v).toLocaleString() + suffix; };
    /* Somebody who asked for less motion gets the number, not an animation. */
    if (reduced) { show(target); return; }
    var started = false;
    var run = function () {
      if (started) return;
      started = true;
      var t0 = 0, DUR = 900;
      var step = function (ts) {
        if (!t0) t0 = ts;
        var p = Math.min(1, (ts - t0) / DUR);
        show(target * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) { run(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { run(); io.disconnect(); } });
    }, { threshold: 0.4 });
    io.observe(el);
  }

  /* ---------- countdown ---------------------------------------------------- */

  function countdown(el) {
    var when = Date.parse(el.getAttribute('data-countdown'));
    if (!isFinite(when)) { el.textContent = ''; return; }
    el.setAttribute('role', 'timer');
    el.setAttribute('aria-live', 'off');
    var units = [['d', T.days], ['h', T.hours], ['m', T.minutes], ['s', T.seconds]];
    el.innerHTML = units.map(function (u) {
      return '<span class="joe-cd-unit"><strong data-cd="' + u[0] + '">0</strong><small>' + u[1] + '</small></span>';
    }).join('');

    function tick() {
      var left = when - Date.now();
      /* A date that has passed says so. Freezing at 00:00:00 is a countdown
         claiming an event is about to start when it finished last year. */
      if (left <= 0) {
        el.innerHTML = '<span class="joe-cd-passed">' + T.passed + '</span>';
        clearInterval(timer);
        return;
      }
      var s = Math.floor(left / 1000);
      var v = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      units.forEach(function (u) {
        var n = el.querySelector('[data-cd="' + u[0] + '"]');
        if (n) n.textContent = String(v[u[0]]);
      });
    }
    tick();
    var timer = setInterval(tick, 1000);
  }

  /* ---------- copy button on a code block ---------------------------------- */

  function copyBlock(pre) {
    if (pre.querySelector('.joe-copy')) return;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'joe-copy';
    btn.textContent = T.copy;
    btn.addEventListener('click', function () {
      var text = (pre.querySelector('code') || pre).textContent;
      var done = function () { btn.textContent = T.copied; setTimeout(function () { btn.textContent = T.copy; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { });
      else {
        var ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { }
        ta.remove();
      }
    });
    pre.style.position = pre.style.position || 'relative';
    pre.appendChild(btn);
  }

  /* ---------- table of contents that follows the reader -------------------- */

  function toc(nav) {
    var src = document.getElementById(nav.getAttribute('data-toc'));
    if (!src) return;
    /* Document sections only. A card, a product tile or a list item carries a
       heading too, and including them turned a 7-section page into a 13-entry
       contents list of product names — a table of contents nobody can navigate
       with. */
    var heads = Array.prototype.slice.call(src.querySelectorAll('h2,h3')).filter(function (h) {
      return !h.closest('.card,[data-product],figure,li,[data-chart],aside,footer,nav');
    });
    if (!heads.length) return;
    var list = document.createElement('ol');
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'sec-' + (i + 1);
      var li = document.createElement('li');
      li.className = h.tagName === 'H3' ? 'joe-toc-sub' : '';
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent.trim();
      li.appendChild(a);
      list.appendChild(li);
    });
    if (!nav.getAttribute('aria-label')) nav.setAttribute('aria-label', T.contents);
    nav.appendChild(list);

    if (!('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Array.prototype.forEach.call(nav.querySelectorAll('a'), function (a) { a.removeAttribute('aria-current'); });
        var a = nav.querySelector('a[href="#' + e.target.id + '"]');
        if (a) a.setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-10% 0px -75% 0px' });
    heads.forEach(function (h) { io.observe(h); });
  }

  /* ---------- go ----------------------------------------------------------- */

  function init() {
    var q = function (sel, fn) { Array.prototype.forEach.call(document.querySelectorAll(sel), function (n) { try { fn(n); } catch (e) { } }); };
    q('table[data-sort-table]', sortableTable);
    q('[data-filter-for]', filterGroup);
    q('[data-count-to]', countUp);
    q('[data-countdown]', countdown);
    q('pre[data-copy]', copyBlock);
    q('[data-toc]', toc);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
</script>`;
}

/** Styling for the widgets, on the palette tokens. */
export function widgetCss(): string {
    return `
/* Sortable table */
.joe-sort{background:none;border:0;padding:0;font:inherit;color:inherit;cursor:pointer;display:inline-flex;
  align-items:center;gap:6px;width:100%;text-align:start}
.joe-sort:hover{color:var(--brand)}
[aria-sort] .joe-sort span::after{content:"↕";opacity:.35;font-size:.85em}
[aria-sort="ascending"] .joe-sort span::after{content:"↑";opacity:1;color:var(--brand)}
[aria-sort="descending"] .joe-sort span::after{content:"↓";opacity:1;color:var(--brand)}
.joe-pager{display:flex;align-items:center;gap:var(--space-4);justify-content:center;
  margin-block-start:var(--space-4);font-size:var(--step--1);color:var(--text-muted)}
.joe-pager button{padding:var(--space-2) var(--space-4);border:1px solid var(--border);background:var(--surface);
  color:var(--text);border-radius:var(--radius);cursor:pointer}
.joe-pager button:hover:not(:disabled){border-color:var(--brand);color:var(--brand)}
.joe-pager button:disabled{opacity:.45;cursor:not-allowed}
.joe-pager[hidden]{display:none}

/* Filters */
[data-filter]{padding:var(--space-2) var(--space-4);border:1px solid var(--border);background:var(--surface);
  color:var(--text-muted);border-radius:var(--radius-pill);cursor:pointer;font:inherit}
[data-filter]:hover{color:var(--text);border-color:var(--brand)}
[data-filter][aria-pressed="true"]{background:var(--brand);border-color:var(--brand);color:var(--on-brand);font-weight:600}
.joe-empty{color:var(--text-muted);text-align:center;padding:var(--space-12) 0}
.joe-empty[hidden]{display:none}

/* Countdown */
[data-countdown]{display:flex;gap:var(--space-4);flex-wrap:wrap}
.joe-cd-unit{display:flex;flex-direction:column;align-items:center;min-width:64px;padding:var(--space-3);
  background:var(--surface);border:1px solid var(--border);border-radius:var(--radius)}
.joe-cd-unit strong{font-size:var(--step-3);line-height:1;font-variant-numeric:tabular-nums}
.joe-cd-unit small{color:var(--text-muted);font-size:var(--step--1);margin-block-start:4px}
.joe-cd-passed{color:var(--text-muted);font-size:var(--step-0)}

/* Copy button */
.joe-copy{position:absolute;inset-block-start:var(--space-3);inset-inline-end:var(--space-3);
  padding:4px 10px;font-size:var(--step--1);border:1px solid var(--border);background:var(--surface);
  color:var(--text-muted);border-radius:var(--radius);cursor:pointer;opacity:0;transition:opacity .15s ease}
pre:hover .joe-copy,.joe-copy:focus-visible{opacity:1}
@media (hover:none){.joe-copy{opacity:1}}

/* Table of contents */
[data-toc] ol{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-2)}
[data-toc] a{color:var(--text-muted);text-decoration:none;font-size:var(--step--1);
  border-inline-start:2px solid transparent;padding-inline-start:var(--space-3);display:block}
[data-toc] a:hover{color:var(--text)}
[data-toc] a[aria-current]{color:var(--brand);border-inline-start-color:var(--brand);font-weight:600}
[data-toc] .joe-toc-sub a{padding-inline-start:var(--space-6)}`;
}

/** Is any widget actually used on this page? */
export function usesWidgets(html: string): boolean {
    return /data-sort-table|data-filter-for|data-count-to|data-countdown|data-copy|data-toc/i.test(html);
}
