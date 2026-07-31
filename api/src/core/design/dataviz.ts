/**
 * Charts a dashboard can actually show.
 *
 * `imageBudget('dashboard')` is 0 — a dashboard has no photographs, so every
 * visual on it is something the model has to draw. A weak model cannot draw an
 * SVG chart from data, so «لوحة تحكم» came out as empty boxes with numbers in
 * them, and the blueprint's "two charts drawn with inline SVG from real in-page
 * data" went unmet on every build.
 *
 * So the charts ship as runtime, like the cart and the form validator. The model
 * writes the numbers; Joe draws them.
 *
 * The visual rules here are not taste. They come from the data-visualisation
 * method and several of them contradict what a model would produce unprompted:
 *
 *   - A bar chart of nominal categories (months, products, regions) is ONE hue,
 *     not one colour per bar. Colouring nominal bars by their value spends the
 *     identity channel re-encoding what bar length already shows — the rainbow
 *     bar chart is the single most common generated-dashboard mistake.
 *   - Part-to-whole is a stacked bar, not a donut.
 *   - A categorical palette is used only when the series ARE the subject, is
 *     taken from the documented validated set rather than derived from the
 *     page's brand hue (a derived hue cannot stay validated), is assigned in
 *     fixed order, never cycled, and is capped.
 *   - Two or more series always get a legend; identity is never colour alone.
 *   - Every chart carries a table of its own numbers, so nothing is gated behind
 *     seeing colour at all.
 */

/**
 * The documented categorical slots, light and dark.
 *
 * NOT derived from the page's brand hue. A generated hue set cannot be validated
 * once and stay valid across 360 possible brands, and the whole point of a fixed
 * order is that it is the colour-vision-safety mechanism. Capped at four: past
 * that, adjacent hues stop being separable for a colour-blind reader.
 */
const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'];
const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500'];

/** The markup contract, handed to the model alongside the blueprint. */
export function chartBrief(): string {
    return `CHARTS — Joe draws them; you supply the numbers.

    <figure data-chart="bar" data-labels="يناير,فبراير,مارس,أبريل"
            data-values="120,180,140,220" data-title="المبيعات الشهرية" data-unit="ألف ر.س"></figure>

- data-chart is one of:
    bar     comparing magnitude across categories (the usual choice)
    line    a trend over time
    share   part-to-whole (a stacked bar — do NOT ask for a pie or a donut)
    spark   a tiny trend line for inside a stat tile
    meter   one ratio against a limit (needs data-value and data-max)
- data-labels and data-values are comma-separated and MUST be the same length.
- For more than one series on a line chart, repeat data-values with a semicolon
  between series and give data-series="اسم,اسم":
    data-values="10,20,30;14,18,26" data-series="٢٠٢٤,٢٠٢٥"
  Four series maximum. Past four, colours stop being distinguishable.
- Use REAL numbers for this business, not 1,2,3.
- Do NOT write any SVG, any chart JavaScript, or a chart library. Joe draws the
  chart, its axis, its legend, its hover tooltips and a table of the same numbers
  underneath for anyone who cannot see it.
- A single headline number is NOT a chart — write it as a stat card with the
  number in an element carrying class="stat" and put a data-chart="spark" beside
  it if there is a trend.`;
}

/** The chart renderer. Vanilla, no dependencies, no network. */
export function chartRuntime(isArabic: boolean): string {
    const t = isArabic
        ? { table: 'عرض الأرقام', hide: 'إخفاء الأرقام', category: 'الفئة', value: 'القيمة', of: 'من', noData: 'لا توجد بيانات لعرضها.' }
        : { table: 'Show the numbers', hide: 'Hide the numbers', category: 'Category', value: 'Value', of: 'of', noData: 'No data to plot.' };

    return `<script>
/* Joe charts — real SVG from real numbers. */
(function () {
  'use strict';
  var T = ${JSON.stringify(t)};
  var LIGHT = ${JSON.stringify(SERIES_LIGHT)};
  var DARK = ${JSON.stringify(SERIES_DARK)};
  var NS = 'http://www.w3.org/2000/svg';

  function dark() {
    try {
      var d = document.documentElement.getAttribute('data-theme');
      if (d === 'dark') return true;
      if (d === 'light') return false;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (e) { return false; }
  }
  function series(i) { var p = dark() ? DARK : LIGHT; return p[i % p.length]; }
  /* A single series wears the PAGE's brand, so one chart does not arrive from a
     different design system than the page around it. */
  function brand() {
    try { return getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || LIGHT[0]; }
    catch (e) { return LIGHT[0]; }
  }
  function ink(name, fallback) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
    catch (e) { return fallback; }
  }

  function el(tag, attrs, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, String(attrs[k]));
    if (text !== undefined) n.textContent = String(text);
    return n;
  }
  function nums(s) {
    return String(s || '').split(',').map(function (x) { return parseFloat(String(x).replace(/[^0-9.eE+-]/g, '')); })
      .filter(function (x) { return isFinite(x); });
  }
  function parts(s) { return String(s || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
  function fmt(n) {
    var a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\\.0$/, '') + 'M';
    if (a >= 1000) return Math.round(n).toLocaleString();
    return String(Math.round(n * 100) / 100);
  }
  /* Axis ticks land on clean numbers, not on the raw maximum. */
  function niceMax(v) {
    if (v <= 0) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var f = v / mag;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
  }

  /* One tooltip element, reused; hit targets are bigger than the marks. */
  var tip;
  function showTip(host, x, y, html) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'joe-chart-tip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.innerHTML = html;
    tip.hidden = false;
    var r = host.getBoundingClientRect();
    tip.style.left = (r.left + window.scrollX + x) + 'px';
    tip.style.top = (r.top + window.scrollY + y) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function tableFor(fig, labels, rows, names, unit) {
    var wrap = document.createElement('div');
    wrap.className = 'joe-chart-table';
    wrap.hidden = true;
    var html = '<table><thead><tr><th scope="col">' + T.category + '</th>' +
      rows.map(function (_, i) { return '<th scope="col">' + (names[i] || T.value) + (unit ? ' (' + unit + ')' : '') + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    labels.forEach(function (lab, i) {
      html += '<tr><th scope="row">' + lab + '</th>' + rows.map(function (r) { return '<td>' + (r[i] === undefined ? '' : fmt(r[i])) + '</td>'; }).join('') + '</tr>';
    });
    wrap.innerHTML = html + '</tbody></table>';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'joe-chart-toggle';
    btn.textContent = T.table;
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', function () {
      wrap.hidden = !wrap.hidden;
      btn.setAttribute('aria-expanded', String(!wrap.hidden));
      btn.textContent = wrap.hidden ? T.table : T.hide;
    });
    fig.appendChild(btn);
    fig.appendChild(wrap);
  }

  function legendFor(fig, names) {
    if (names.length < 2) return;      /* one series: the title already names it */
    var l = document.createElement('div');
    l.className = 'joe-chart-legend';
    l.innerHTML = names.map(function (n, i) {
      return '<span><i style="background:' + series(i) + '"></i>' + n + '</span>';
    }).join('');
    fig.appendChild(l);
  }

  /* An Arabic page reads right-to-left, and so must its charts: the value axis
     belongs on the right and the first category on the right. Drawing the plot
     left-to-right inside an RTL document was the most visible defect in the
     first render — the axis ended up on the wrong side of every chart. */
  function rtl() {
    try { return (document.documentElement.getAttribute('dir') || getComputedStyle(document.documentElement).direction) === 'rtl'; }
    catch (e) { return false; }
  }

  function frame(fig, w, h, title) {
    var svg = el('svg', { viewBox: '0 0 ' + w + ' ' + h, role: 'img', 'aria-label': title || '' });
    /* Width and height come from CSS per chart type. Setting width="100%" here
       let a 120x34 sparkline stretch to the full container and become 300px
       tall — a viewBox scales both axes together. */
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    /* The plot is authored left-to-right and mirrored as a whole for RTL, so
       every geometry calculation below stays readable. Text is un-mirrored
       individually, otherwise the numerals come out backwards. */
    if (rtl()) svg.setAttribute('transform', 'scale(-1,1)');
    return svg;
  }

  /* Text inside a mirrored plot has to be flipped back around its own anchor. */
  function label(svg, attrs, text) {
    var n = el('text', attrs, text);
    if (rtl()) n.setAttribute('transform', 'translate(' + (2 * Number(attrs.x)) + ',0) scale(-1,1)');
    svg.appendChild(n);
    return n;
  }

  function drawBar(fig, labels, rows, names, opts) {
    var W = 640, H = 260, PAD_B = 34, PAD_L = 46, PAD_T = 14, PAD_R = 10;
    var svg = frame(fig, W, H, opts.title);
    var flat = rows.reduce(function (a, r) { return a.concat(r); }, []);
    var max = niceMax(Math.max.apply(null, flat.concat([0])));
    var plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    var gridInk = ink('--border', '#e5e7eb'), textInk = ink('--text-muted', '#6b7280');

    /* Recessive hairline gridlines, and the ticks that carry the values that are
       not directly labelled. */
    for (var g = 0; g <= 4; g++) {
      var y = PAD_T + plotH - (plotH * g / 4);
      svg.appendChild(el('line', { x1: PAD_L, y1: y, x2: W - PAD_R, y2: y, stroke: gridInk, 'stroke-width': 1 }));
      label(svg, { x: PAD_L - 8, y: y + 4, 'text-anchor': 'end', fill: textInk, 'font-size': 11 }, fmt(max * g / 4));
    }

    var band = plotW / labels.length;
    var n = rows.length;
    /* Bars are capped, never filling the slot — the leftover band is air. */
    var bw = Math.min(24, Math.max(6, (band - 10) / n - 2));
    var maxIdx = flat.indexOf(Math.max.apply(null, flat));

    labels.forEach(function (lab, i) {
      var groupW = bw * n + 2 * (n - 1);
      var x0 = PAD_L + band * i + (band - groupW) / 2;
      rows.forEach(function (row, s) {
        var v = row[i] || 0;
        var bh = Math.max(0, (v / max) * plotH);
        var x = x0 + s * (bw + 2);          /* 2px surface gap between neighbours */
        var y = PAD_T + plotH - bh;
        /* 4px rounded data-end, square at the baseline. */
        var r = Math.min(4, bw / 2, bh);
        var d = 'M' + x + ' ' + (PAD_T + plotH) + ' V' + (y + r) +
                ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y +
                ' H' + (x + bw - r) + ' Q' + (x + bw) + ' ' + y + ' ' + (x + bw) + ' ' + (y + r) +
                ' V' + (PAD_T + plotH) + ' Z';
        var p = el('path', { d: d, fill: n === 1 ? brand() : series(s) });
        p.addEventListener('mouseenter', function () {
          showTip(svg, x + bw / 2, y - 8, '<strong>' + lab + '</strong><br>' + (n > 1 ? names[s] + ': ' : '') + fmt(v) + (opts.unit ? ' ' + opts.unit : ''));
        });
        p.addEventListener('mouseleave', hideTip);
        svg.appendChild(p);

        /* Label selectively: the extreme only, never a number on every bar. */
        if (n === 1 && i * 1 === maxIdx) {
          label(svg, { x: x + bw / 2, y: y - 6, 'text-anchor': 'middle', fill: ink('--text', '#111827'), 'font-size': 12, 'font-weight': 700 }, fmt(v));
        }
      });
      label(svg, { x: PAD_L + band * i + band / 2, y: H - 12, 'text-anchor': 'middle', fill: textInk, 'font-size': 11 }, lab);
    });
    fig.appendChild(svg);
  }

  function drawLine(fig, labels, rows, names, opts) {
    var W = 640, H = 260, PAD_B = 34, PAD_L = 46, PAD_T = 14, PAD_R = 14;
    var svg = frame(fig, W, H, opts.title);
    var flat = rows.reduce(function (a, r) { return a.concat(r); }, []);
    var max = niceMax(Math.max.apply(null, flat.concat([0])));
    var plotW = W - PAD_L - PAD_R, plotH = H - PAD_T - PAD_B;
    var gridInk = ink('--border', '#e5e7eb'), textInk = ink('--text-muted', '#6b7280');
    var surface = ink('--surface', '#ffffff');

    for (var g = 0; g <= 4; g++) {
      var y = PAD_T + plotH - (plotH * g / 4);
      svg.appendChild(el('line', { x1: PAD_L, y1: y, x2: W - PAD_R, y2: y, stroke: gridInk, 'stroke-width': 1 }));
      label(svg, { x: PAD_L - 8, y: y + 4, 'text-anchor': 'end', fill: textInk, 'font-size': 11 }, fmt(max * g / 4));
    }
    var step = labels.length > 1 ? plotW / (labels.length - 1) : 0;
    var xAt = function (i) { return PAD_L + step * i; };
    var yAt = function (v) { return PAD_T + plotH - (v / max) * plotH; };

    rows.forEach(function (row, s) {
      var color = rows.length === 1 ? brand() : series(s);
      var d = row.map(function (v, i) { return (i ? 'L' : 'M') + xAt(i) + ' ' + yAt(v); }).join(' ');
      /* A single series gets a 10% wash under it; several would muddy each other. */
      if (rows.length === 1) {
        svg.appendChild(el('path', {
          d: d + ' L' + xAt(row.length - 1) + ' ' + (PAD_T + plotH) + ' L' + xAt(0) + ' ' + (PAD_T + plotH) + ' Z',
          fill: color, 'fill-opacity': 0.1,
        }));
      }
      svg.appendChild(el('path', { d: d, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
      row.forEach(function (v, i) {
        /* 2px ring in the surface colour keeps a marker legible where lines cross. */
        var c = el('circle', { cx: xAt(i), cy: yAt(v), r: 4, fill: color, stroke: surface, 'stroke-width': 2 });
        c.addEventListener('mouseenter', function () {
          showTip(svg, xAt(i), yAt(v) - 10, '<strong>' + labels[i] + '</strong><br>' + (rows.length > 1 ? names[s] + ': ' : '') + fmt(v) + (opts.unit ? ' ' + opts.unit : ''));
        });
        c.addEventListener('mouseleave', hideTip);
        svg.appendChild(c);
      });
      /* Direct-label the endpoint, which is where a trend is read. */
      label(svg, {
        x: xAt(row.length - 1), y: yAt(row[row.length - 1]) - 12, 'text-anchor': rtl() ? 'start' : 'end',
        fill: ink('--text', '#111827'), 'font-size': 12, 'font-weight': 700,
      }, fmt(row[row.length - 1]));
    });

    labels.forEach(function (lab, i) {
      if (labels.length > 8 && i % 2) return;      /* never overlap axis labels */
      label(svg, { x: xAt(i), y: H - 12, 'text-anchor': 'middle', fill: textInk, 'font-size': 11 }, lab);
    });
    fig.appendChild(svg);
  }

  /* Part-to-whole is a stacked bar. A donut of many slices cannot be compared by
     eye, which is why the method does not have one. */
  function drawShare(fig, labels, values, opts) {
    var W = 640, H = 74, PAD = 2;
    var svg = frame(fig, W, H, opts.title);
    var total = values.reduce(function (a, b) { return a + b; }, 0) || 1;
    var surface = ink('--surface', '#ffffff');
    var x = 0;
    values.forEach(function (v, i) {
      var w = Math.max(0, (v / total) * W - PAD);
      var g = el('g', {});
      var rect = el('rect', { x: x, y: 10, width: w, height: 34, rx: 4, fill: series(i) });
      g.appendChild(rect);
      /* Only label inside when the text genuinely fits. */
      var pct = Math.round((v / total) * 100) + '%';
      if (w > 46) {
        var lt = el('text', { x: x + w / 2, y: 32, 'text-anchor': 'middle', fill: '#fff', 'font-size': 12, 'font-weight': 700 }, pct);
        if (rtl()) lt.setAttribute('transform', 'translate(' + (2 * (x + w / 2)) + ',0) scale(-1,1)');
        g.appendChild(lt);
      }
      var xi = x, wi = w;
      g.addEventListener('mouseenter', function () { showTip(svg, xi + wi / 2, 4, '<strong>' + labels[i] + '</strong><br>' + fmt(v) + ' — ' + pct); });
      g.addEventListener('mouseleave', hideTip);
      svg.appendChild(g);
      x += w + PAD;                      /* 2px surface gap between segments */
    });
    svg.appendChild(el('rect', { x: 0, y: 10, width: W, height: 34, rx: 4, fill: 'none', stroke: surface, 'stroke-width': 0 }));
    fig.appendChild(svg);
  }

  function drawSpark(fig, values, opts) {
    var W = 120, H = 34;
    var svg = frame(fig, W, H, opts.title);
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var span = (max - min) || 1;
    var step = values.length > 1 ? (W - 6) / (values.length - 1) : 0;
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + (3 + step * i) + ' ' + (H - 4 - ((v - min) / span) * (H - 10)); }).join(' ');
    svg.appendChild(el('path', { d: d, fill: 'none', stroke: brand(), 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    var lx = 3 + step * (values.length - 1), ly = H - 4 - ((values[values.length - 1] - min) / span) * (H - 10);
    svg.appendChild(el('circle', { cx: lx, cy: ly, r: 3, fill: brand(), stroke: ink('--surface', '#fff'), 'stroke-width': 2 }));
    fig.appendChild(svg);
  }

  function drawMeter(fig, value, max, opts) {
    /* A narrow viewBox on purpose. At 640 wide inside a ~200px KPI card the
       12px label scaled down to about four pixels — legible in the fixture and
       unreadable on the dashboard it was built for. */
    var W = 240, H = 44;
    var svg = frame(fig, W, H, opts.title);
    var pct = Math.max(0, Math.min(1, max ? value / max : 0));
    svg.appendChild(el('rect', { x: 0, y: 22, width: W, height: 14, rx: 7, fill: ink('--border', '#e5e7eb') }));
    svg.appendChild(el('rect', { x: 0, y: 22, width: Math.max(8, W * pct), height: 14, rx: 7, fill: brand() }));
    /* Anchored inside the box, not on its edge — at x=W with text-anchor:end the
       label was clipped by the viewBox in the first render. */
    label(svg, { x: W - 2, y: 14, 'text-anchor': 'end', fill: ink('--text', '#111827'), 'font-size': 13, 'font-weight': 700 },
      fmt(value) + ' ' + T.of + ' ' + fmt(max));
    fig.appendChild(svg);
  }

  function render(fig) {
    if (fig.getAttribute('data-drawn')) return;
    var type = (fig.getAttribute('data-chart') || 'bar').toLowerCase();
    var labels = parts(fig.getAttribute('data-labels'));
    var raw = String(fig.getAttribute('data-values') || '');
    var rows = raw.split(';').map(nums).filter(function (r) { return r.length; });
    var names = parts(fig.getAttribute('data-series'));
    var title = fig.getAttribute('data-title') || '';
    var unit = fig.getAttribute('data-unit') || '';
    var opts = { title: title, unit: unit };

    /* A meter is specified by data-value and data-max, not by a value list —
       requiring data-values would have made every meter render "no data", which
       is exactly what the first render showed. */
    if (type === 'meter' && !rows.length && fig.getAttribute('data-value') !== null) rows = [[parseFloat(fig.getAttribute('data-value')) || 0]];
    if (!rows.length) { fig.textContent = T.noData; fig.setAttribute('data-drawn', '1'); return; }
    /* Four is the cap; a fifth hue stops being separable under colour blindness. */
    rows = rows.slice(0, 4);
    if (!names.length) names = rows.map(function (_, i) { return 'S' + (i + 1); });
    /* Labels and values must line up; pad rather than mis-plot. */
    var len = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    while (labels.length < len) labels.push(String(labels.length + 1));
    labels = labels.slice(0, len);

    if (title) {
      var cap = document.createElement('figcaption');
      cap.textContent = title;
      fig.insertBefore(cap, fig.firstChild);
    }

    try {
      if (type === 'line') drawLine(fig, labels, rows, names, opts);
      else if (type === 'share') drawShare(fig, labels, rows[0], opts);
      else if (type === 'spark') drawSpark(fig, rows[0], opts);
      else if (type === 'meter') drawMeter(fig, parseFloat(fig.getAttribute('data-value')) || rows[0][0] || 0, parseFloat(fig.getAttribute('data-max')) || 100, opts);
      else drawBar(fig, labels, rows, names, opts);
    } catch (e) { fig.textContent = T.noData; }

    if (type === 'share') legendFor(fig, labels.slice(0, rows[0].length));
    else legendFor(fig, names);
    if (type !== 'spark' && type !== 'meter') tableFor(fig, labels, rows, names, unit);
    fig.setAttribute('data-drawn', '1');
  }

  function all() { Array.prototype.forEach.call(document.querySelectorAll('[data-chart]'), render); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', all);
  else all();
  /* Dark mode is a different set of steps, not an automatic flip — redraw. */
  try {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () {
      Array.prototype.forEach.call(document.querySelectorAll('[data-chart][data-drawn]'), function (f) {
        f.innerHTML = ''; f.removeAttribute('data-drawn'); render(f);
      });
    });
  } catch (e) { }
})();
</script>`;
}

/** Styling for the figures, legend, tooltip and table view. */
export function chartCss(): string {
    return `
/* Charts */
[data-chart]{display:block;margin:0;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--radius);padding:var(--space-4)}
[data-chart] figcaption{font-weight:700;font-size:var(--step-0);margin-block-end:var(--space-3);color:var(--text)}
[data-chart="spark"]{border:0;background:none;padding:0;max-width:140px}
[data-chart="spark"] svg{aspect-ratio:120/34}
[data-chart="meter"]{border:0;background:none;padding:0}
[data-chart="meter"] svg{aspect-ratio:240/44}
/* Height is set per type; a viewBox scales BOTH axes, so a 120x34 sparkline
   given width:100% stretched to the container and became 300px tall. */
[data-chart] svg{display:block;overflow:visible;width:100%;height:auto}
[data-chart="bar"] svg,[data-chart="line"] svg{aspect-ratio:640/260}
[data-chart="share"] svg{aspect-ratio:640/74}
.joe-chart-legend{display:flex;flex-wrap:wrap;gap:var(--space-4);margin-block-start:var(--space-3);
  font-size:var(--step--1);color:var(--text-muted)}
.joe-chart-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-inline-end:6px}
.joe-chart-toggle{margin-block-start:var(--space-3);background:none;border:0;padding:0;
  color:var(--text-muted);font-size:var(--step--1);text-decoration:underline;cursor:pointer}
.joe-chart-toggle:hover{color:var(--brand)}
.joe-chart-table{margin-block-start:var(--space-3);overflow-x:auto}
.joe-chart-table table{width:100%;border-collapse:collapse;font-size:var(--step--1)}
.joe-chart-table th,.joe-chart-table td{padding:var(--space-2) var(--space-3);text-align:start;
  border-block-end:1px solid var(--border);color:var(--text)}
.joe-chart-table thead th{color:var(--text-muted);font-weight:600}
.joe-chart-tip{position:absolute;transform:translate(-50%,-100%);background:var(--text);color:var(--surface);
  padding:6px 10px;border-radius:var(--radius);font-size:12px;line-height:1.4;pointer-events:none;
  white-space:nowrap;z-index:9998;box-shadow:var(--shadow-md)}
.joe-chart-tip[hidden]{display:none}`;
}

/** Is a chart runtime worth shipping with this page? */
export function needsCharts(kind: string): boolean {
    return kind === 'dashboard' || kind === 'app';
}

/** Exported for the palette test — these must stay the documented values. */
export const CATEGORICAL = { light: SERIES_LIGHT, dark: SERIES_DARK };
