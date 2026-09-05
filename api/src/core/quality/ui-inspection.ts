/**
 * «وفحص ui» — THE PART THE SELF-QA NEVER DID.
 *
 * Joe owns twenty-five browser tools. `browser_contrast_audit` measures WCAG
 * ratios, `browser_a11y_deep` walks landmarks and tab order, and
 * `browser_responsive_check` re-lays the page out at three widths. Every one
 * of them is reachable by the agent — and NONE of them ran during a build's
 * own self-QA, which looked at one width, in one pass, and pressed a few
 * buttons.
 *
 * The measurements those tools perform are re-expressed here so they can run
 * on a page that is ALREADY OPEN — in his panel, where he can watch each
 * failing element get outlined — instead of opening three more browsers. The
 * arithmetic is deliberately the same one the tools use, so a contrast figure
 * from a build and a contrast figure from `browser_contrast_audit` can never
 * disagree.
 *
 * Every number here is measured in a real engine at a real width. Nothing is
 * inferred from the source.
 */
import { AuditEyes, EyeBox, evalInPage } from './audit-eyes';
import type { BehaviourFinding } from './behaviour-audit';

export interface UiInspection {
    findings: BehaviourFinding[];
    metrics: Record<string, any>;
}

/**
 *  THE SMALLEST TOUCHABLE THING, AS ONE NUMBER.
 *
 *  ⛔ There were two. The page measures `r.width < 40 || r.height < 40` and the
 *  finding says «أصغر من 40px» — while the note drawn on HIS panel, over the
 *  boxes, said «أهداف لمس أصغر من 44px». He watches the overlay; the overlay
 *  named a threshold the code does not use.
 *
 *  Neither number is wrong in itself (Apple says 44, Material says 48, WCAG
 *  2.5.8 says 24) — what is wrong is that a thing he READS was maintained
 *  apart from the thing that DECIDES, which is the class that has cost this
 *  repository more than any other. A guard asserts the literal inside the page
 *  function equals this constant, because a function serialised into a browser
 *  cannot reference it.
 */
export const TAP_TARGET_MIN_PX = 40;

/**
 *  THE VIEWPORTS A VISITOR ACTUALLY ARRIVES ON — AND DESKTOP WAS NOT ONE.
 *
 *  ⛔ The line above this one used to say «Desktop last: it is restored», and
 *  the array under it held two widths. The comment described an intent the
 *  code did not have, and the gap was invisible because `metrics.viewports`
 *  APPENDED the restore width afterwards:
 *
 *      metrics.viewports = [...VIEWPORTS.map(…), '1280x900']
 *
 *  So the delivery read «3 viewport(s)» while `measureResponsive` — the only
 *  thing that looks for horizontal scrolling, oversized boxes and unreadable
 *  text — ran at exactly two. **Horizontal scrolling on a desktop screen, the
 *  width he and most visitors are on, could not be detected at all**, and the
 *  number in the report said it had been checked.
 *
 *  Two defects in one line: a width nobody measured, and a count of something
 *  adjacent to what it claimed. The count is now derived from this array and
 *  nothing is appended to it, so the two cannot drift again.
 *
 *  (`mobile_overflow` keeps its id — it is the key the repairer is wired to —
 *  and its text has always carried the width it was measured at, so a desktop
 *  overflow reports «1280px» in the sentence he reads.)
 */
export const VIEWPORTS = [
    { name: 'desktop', ar: 'سطح المكتب', w: 1280, h: 900 },
    { name: 'tablet', ar: 'لوحي', w: 820, h: 1180 },
    { name: 'mobile', ar: 'جوّال', w: 390, h: 844 },
] as const;

export function effectiveViewports(availableWidth: number): Array<{ name: string; ar: string; w: number; h: number }> {
    const cap = Number.isFinite(availableWidth) && availableWidth > 0 ? availableWidth : 1280;
    const supported = VIEWPORTS.filter(v => v.w <= cap).map(v => ({ ...v }));
    if (supported.length) return supported;
    return [{ name: 'available', ar: 'العرض المتاح', w: Math.max(320, Math.floor(cap)), h: 844 }];
}

export async function applyViewportSize(page: any, width: number, height: number): Promise<{ width: number; height: number }> {
    // Persistent browser contexts reject Playwright's viewport setter. That
    // is an instrumentation limitation, not evidence that the app failed its
    // responsive layout. Try the normal API, but keep going to CDP when the
    // borrowed/persistent page refuses it.
    try { await page.setViewportSize({ width, height }); } catch { /* use CDP below */ }
    await page.waitForTimeout(180).catch(() => { });
    let actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; }).catch(() => ({ width: 0, height: 0 }));
    if (Math.abs(Number(actual?.width || 0) - width) <= 2) return actual;
    try {
        const cdp = await page.context().newCDPSession(page);
        // Persistent/headed Chromium can keep the old visible surface unless
        // it is resized before the device metrics are overridden. Without this
        // pair, the audit reported 820px -> 1280px even though the CDP command
        // itself completed successfully.
        await cdp.send('Emulation.setVisibleSize', { width, height }).catch(() => { });
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 1, mobile: width <= 600,
            screenWidth: width, screenHeight: height, dontSetVisibleSize: false,
        });
        await page.waitForTimeout(180).catch(() => { });
        await cdp.detach().catch(() => { });
        actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
    } catch { /* the caller records an instrumentation finding with the measured width */ }
    if (Math.abs(Number(actual?.width || 0) - width) > 2) {
        // A persistent context may apply the metrics one turn late while the
        // page is still painting the previous frame. Give the browser one
        // explicit retry before declaring the instrumentation broken.
        try {
            const retry = await page.context().newCDPSession(page);
            await retry.send('Emulation.setVisibleSize', { width, height }).catch(() => { });
            await retry.send('Emulation.setDeviceMetricsOverride', {
                width, height, deviceScaleFactor: 1, mobile: width <= 600,
                screenWidth: width, screenHeight: height, dontSetVisibleSize: false,
            });
            await page.waitForTimeout(300).catch(() => { });
            actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
            await retry.detach().catch(() => { });
        } catch { /* keep the measured mismatch as evidence */ }
    }
    if (Math.abs(Number(actual?.width || 0) - width) > 2) {
        await page.setViewportSize({ width, height }).catch(() => { });
        await page.waitForTimeout(240).catch(() => { });
        actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
    }
    return actual;
}

/* ---------------------------------------------------------------- contrast */

function measureContrast() {
  var parse = function (c: any): any[] {
    var raw = String(c || '');
    // Chromium serializes color-mix() as color(srgb ...), while older CSS
    // keeps rgb()/rgba(). Both forms are real computed colours and must not be
    // silently treated as transparent or black by the quality gate.
    var srgb = raw.match(/color\(\s*srgb\s+([^)]+)\)/i);
    if (srgb) {
      var sp = srgb[1].replace('/', ' ').split(/\s+/).filter(Boolean).map(function (s: string) {
        return parseFloat(s.replace('%', '')) / (/%$/.test(s) ? 100 : 1);
      });
      return [(sp[0] || 0) * 255, (sp[1] || 0) * 255, (sp[2] || 0) * 255, sp[3] === undefined ? 1 : sp[3]];
    }
    var m = raw.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0];
    var p = m[1].replace('/', ' ').split(/[,\s]+/).filter(Boolean).map(function (s: string) {
      var n = parseFloat(s.replace('%', ''));
      return /%$/.test(s) ? n / 100 : n;
    });
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
  };
  var lum = function (r: any, g: any, b: any) {
    var a = [r, g, b].map(function (v: any) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  };
  var ratio = function (f: any, b: any) {
    var L1 = lum(f[0], f[1], f[2]), L2 = lum(b[0], b[1], b[2]);
    var hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  };
  /**
   * The effective background — or NOTHING, when it cannot honestly be reduced
   * to one colour.
   *
   * Measured on Joe's own build: white hero copy over a radial-gradient band
   * came back as «1.05:1», because this walk reads backgroundColor only and
   * the gradient lives in backgroundImage. Reporting a 1.05 that is really
   * fine is exactly the false blocker he was shown before. A photo or a
   * gradient behind text is unmeasurable from computed styles, so it is
   * SKIPPED and said to be skipped, never scored.
   */
  var effBg = function (el: any): any[] | null {
    var node = el, layers: any[] = [];
    while (node) {
      var st = getComputedStyle(node);
      // A photograph or a gradient without an opaque, parseable stop cannot
      // be reduced to one honest background colour, so report it as skipped.
      if (st.backgroundImage && st.backgroundImage !== 'none') {
        if (/url\(/i.test(st.backgroundImage)) return null;
        var stops = Array.prototype.slice.call(st.backgroundImage.matchAll(/rgba?\([^)]+\)|color\(\s*srgb[^)]+\)/gi))
          .map(function (m: any) { return parse(m[0]); })
          .filter(function (x: any[]) { return x[3] >= 0.995; });
        if (stops.length) {
          stops.sort(function (a: any[], b: any[]) { return lum(a[0], a[1], a[2]) - lum(b[0], b[1], b[2]); });
          layers.push(stops[0]);
          break;
        }
        return null;
      }
      var bg = parse(st.backgroundColor);
      if (bg[3] >= 0.995) { layers.push(bg); break; }
      if (bg[3] > 0.004) layers.push(bg);
      node = node.parentElement;
    }
    var out = [255, 255, 255];
    for (var i = layers.length - 1; i >= 0; i--) {
      var alpha = layers[i][3];
      out = [0, 1, 2].map(function (channel: number) {
        return layers[i][channel] * alpha + out[channel] * (1 - alpha);
      });
    }
    return [out[0], out[1], out[2], 1];
  };
  var visible = function (el: any) {
    var r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0.1;
  };
  // Keep each measured offender addressable in source. Colours and text prove
  // a defect, but the repairer also needs to know which selector to change.
  var selectorFor = function (el: any) {
    var parts: string[] = [];
    var node: any = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = String(node.tagName || '').toLowerCase();
      if (!tag) break;
      var id = String(node.id || '');
      var part = /^[A-Za-z][\w-]*$/.test(id) ? tag + '#' + id : tag;
      if (part === tag) {
        var classes = String(node.className && typeof node.className === 'string' ? node.className : '')
          .split(/\s+/).filter(function (c: string) { return /^[A-Za-z][\w-]*$/.test(c); }).slice(0, 2);
        if (classes.length) part += '.' + classes.join('.');
      }
      var same = node.parentElement ? Array.prototype.filter.call(node.parentElement.children, function (s: any) { return s.tagName === node.tagName; }) : [];
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  var samples: any[] = [], checked = 0, skipped = 0;
  var els: any[] = Array.prototype.slice.call(document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,button,label,td,th,div'));
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var own = Array.prototype.some.call(el.childNodes, function (n: any) { return n.nodeType === 3 && (n.textContent || '').trim().length > 1; });
    var txt = own ? (el.textContent || '').trim() : '';
    if (!txt || txt.length < 2 || !visible(el)) continue;
    checked++;
    var st = getComputedStyle(el);
    var fg = parse(st.color); if (fg[3] === 0) continue;
    var bgc = effBg(el);
    if (!bgc) { skipped++; continue; }          // a gradient or a photo: unmeasurable
    var measuredBg = bgc;
    // Alpha text is composited over the measured background before judging.
    if (fg[3] < 0.995) {
      fg = [0, 1, 2].map(function (channel: number) { return fg[channel] * fg[3] + measuredBg[channel] * (1 - fg[3]); }) as any;
    }
    //  THE ARITHMETIC AND THE VERDICT LEFT THIS FUNCTION — see judgeContrast.
    //  What a browser can do and Node cannot is READ the page: which elements
    //  hold text, what colour they and their ancestors are, whether a gradient
    //  makes the background unmeasurable. That stays here. Whether 4.53:1 is
    //  a failure is arithmetic against a published table, and arithmetic
    //  written inside `page.evaluate` is arithmetic nothing can test.
    var size = parseFloat(st.fontSize) || 16, bold = (parseInt(st.fontWeight, 10) || 400) >= 700;
    var r = el.getBoundingClientRect();
    samples.push({
      text: txt.slice(0, 40), fg: [fg[0], fg[1], fg[2]], bg: [measuredBg[0], measuredBg[1], measuredBg[2]],
      size: size, bold: bold,
      x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height),
      sel: selectorFor(el),
    });
    if (checked > 400) break;
  }
  return { checked: checked, skipped: skipped, samples: samples };
}

/**
 *  WCAG 2.1 RELATIVE LUMINANCE — in Node, where a published number can check it.
 *
 *  ⛔ This arithmetic lived inside `page.evaluate`, and the only thing guarding
 *  it was a test asserting the SOURCE TEXT contained
 *  `0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]`. That is a spell-check, not
 *  a measurement: the coefficients could be right and the branch above them
 *  wrong, and nothing would know. `low_contrast` is REPAIRABLE, so a threshold
 *  that is wrong by a little does not merely misreport — it sends the repairer
 *  to change the colours of a page that was already correct.
 *
 *  Now it is a function, and its tests are the published values: black on
 *  white is 21:1, white on white is 1:1, #767676 on white is 4.54 and passes,
 *  #777777 on white is 4.48 and fails. Those numbers come from the W3C's own
 *  examples, not from this repository.
 */
export function relativeLuminance(rgb: number[]): number {
    const a = [rgb[0], rgb[1], rgb[2]].map(v => {
        const x = Number(v) / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

/** The WCAG contrast ratio between two colours. Order does not matter. */
export function contrastRatio(fg: number[], bg: number[]): number {
    const L1 = relativeLuminance(fg);
    const L2 = relativeLuminance(bg);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

/**
 *  What AA asks of THIS text. 18pt is 24px, and 14pt bold is 18.66px — the
 *  two boundaries in the specification, written as the specification writes
 *  them rather than rounded to something tidier.
 */
export function requiredRatio(sizePx: number, bold: boolean): number {
    return (sizePx >= 24 || (sizePx >= 18.66 && bold)) ? 3 : 4.5;
}

/**
 *  HOW BAD IS IT — asked of the WORST ratio, not of how many there are.
 *
 *  ⛔ FOUND BY RUNNING THE REAL AUDIT AGAINST A PAGE WITH DEFECTS PLANTED BY
 *  HAND, which is the only way it could have been found: every unit test in
 *  the suite agreed with the old rule, because the old rule was
 *
 *      severity: c.fails.length >= 4 ? 'major' : 'minor'
 *
 *  Counted, and nothing else. The planted page returned:
 *
 *      low    low_contrast   2 text element(s) fail WCAG AA (worst 1.16:1)
 *
 *  **1.16:1 is text nobody can read** — near-white on white — and it came out
 *  `minor`, which maps to `low`, which is not in `blockers` (severity `high`),
 *  so the build is delivered as fine. Meanwhile four elements at 4.4:1 —
 *  barely under the line, readable by almost everyone — would be `major`.
 *
 *  The count is a fact about how widespread it is. It is not a fact about how
 *  bad it is, and severity is a claim about how bad it is. Both matter, so
 *  both count: many failures, OR one that is far past the line.
 *
 *  3:1 is the boundary chosen because it is not invented here — it is WCAG's
 *  own floor for the largest, boldest text on a page. Anything below it fails
 *  for every size at every weight, and no reader is helped by it.
 */
export function contrastSeverity(
    fails: Array<{ ratio: number }>,
): 'critical' | 'major' | 'minor' {
    if (!fails || !fails.length) return 'minor';
    const worst = Math.min(...fails.map(f => Number(f.ratio) || 0));
    //  Below WCAG's floor for even the largest text: unreadable, whatever it
    //  is. One of these is worse for him than a dozen near-misses.
    if (worst < 3) return 'critical';
    return fails.length >= 4 ? 'major' : 'minor';
}

export interface ContrastSample {
    text: string; fg: number[]; bg: number[]; size: number; bold: boolean;
    x: number; y: number; width: number; height: number;
    /** Safe selector for the source-addressable measured offender. */
    sel?: string;
}

/**
 *  Judge what the page reported. The dedup and the caps are here rather than
 *  in the page for the same reason the arithmetic is: they decide what he is
 *  told, and what he is told must be testable.
 */
export function judgeContrast(
    samples: ContrastSample[] | undefined,
): Array<{ text: string; ratio: number; need: number; fg: number[]; bg: number[]; sel: string; x: number; y: number; width: number; height: number }> {
    const seen = new Set<string>();
    const fails: any[] = [];
    for (const s of samples || []) {
        if (!s || !Array.isArray(s.fg) || !Array.isArray(s.bg)) continue;
        const rt = contrastRatio(s.fg, s.bg);
        const need = requiredRatio(Number(s.size) || 16, !!s.bold);
        if (rt >= need) continue;
        const rounded = Math.round(rt * 100) / 100;
        //  Same key the page used: the text and the ratio. Two different
        //  elements reading «Read more» at the same ratio are one complaint.
        const key = String(s.text).slice(0, 30) + rounded.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        fails.push({
            text: s.text, ratio: rounded, need, fg: s.fg.slice(0, 3), bg: s.bg.slice(0, 3), sel: s.sel || '',
            x: s.x, y: s.y, width: s.width, height: s.height,
        });
    }
    //  Worst first, so `fails[0]` in the sentence he reads is the worst one
    //  and not merely the first one down the page.
    fails.sort((a, b) => a.ratio - b.ratio);
    return fails.slice(0, 12);
}

/* ------------------------------------------------------------------- a11y  */

function measureA11y() {
  var q = function (s: string): any[] { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var issues: any[] = [];
  if (!document.querySelector('main, [role="main"]')) issues.push({ code: 'no_main', severity: 'minor' });
  // NOT a finding: a single-view app has no navigation to landmark, and
  // charging every one of Joe's own app shells three points for the absence of
  // a menu it does not need is noise, not a defect. Reported as a fact only.
  var hasNav = !!document.querySelector('nav, [role="navigation"]');
  var ids: any = {}; q('[id]').forEach(function (e: any) { ids[e.id] = (ids[e.id] || 0) + 1; });
  var dups = Object.keys(ids).filter(function (k: string) { return ids[k] > 1; });
  if (dups.length) issues.push({ code: 'duplicate_ids', severity: 'major', sample: dups.slice(0, 4).join(', ') });
  var posTab = q('[tabindex]').filter(function (e: any) { return parseInt(e.getAttribute('tabindex') || '0', 10) > 0; }).length;
  if (posTab) issues.push({ code: 'positive_tabindex', severity: 'minor', count: posTab });
  var hiddenFocus = q('[aria-hidden="true"] a, [aria-hidden="true"] button, [aria-hidden="true"] input').length;
  if (hiddenFocus) issues.push({ code: 'aria_hidden_focusable', severity: 'major', count: hiddenFocus });
  var levels = q('h1,h2,h3,h4,h5,h6').map(function (h: any) { return parseInt(h.tagName[1], 10); });
  for (var i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) { issues.push({ code: 'heading_skip', severity: 'minor', sample: 'h' + levels[i - 1] + ' ← h' + levels[i] }); break; }
  }
  // An image with no alt is invisible to a screen reader and to a search engine.
  var noAlt: any[] = [], boxes: any[] = [];
  q('img').forEach(function (im: any) {
    if (im.getAttribute('alt') !== null) return;
    var r = im.getBoundingClientRect();
    if (!(r.width > 4 && r.height > 4)) return;
    if (noAlt.length < 8) { noAlt.push((im.currentSrc || im.src || 'img').split('/').pop().slice(0, 34)); boxes.push({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'no alt' }); }
  });
  if (noAlt.length) issues.push({ code: 'images_without_alt', severity: 'major', count: noAlt.length, sample: noAlt[0] });
  // A field nobody named is a field nobody can fill with a screen reader.
  var unlabelled: any[] = [], placeholderOnly: string[] = [];
  q('input,select,textarea').forEach(function (f: any) {
    var t = (f.getAttribute('type') || '').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' || t === 'reset') return;
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) return;
    if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return;
    if (f.closest('label')) return;
    /**
     *  ⛔ A PLACEHOLDER IS NOT A LABEL, AND IT IS NOT NOTHING EITHER.
     *
     *  This line used to `return` on `placeholder`, so a form whose fields
     *  are named only by their grey hint text passed silently — and that is
     *  the commonest form on the web, including the ones Joe writes.
     *
     *  But it is not the same defect as a field with NO name: a browser does
     *  fall back to the placeholder for the accessible name, so a screen
     *  reader says something. What it costs is different and specific — **the
     *  hint disappears the moment you type**, so anyone who looks away, or
     *  makes a mistake, or comes back to check, is staring at a box with no
     *  idea what belongs in it.
     *
     *  ⛔ AND IT SITS HERE, NOT THREE LINES EARLIER, WHICH IS WHERE I FIRST
     *  PUT IT. Before `label[for=…]` and `closest('label')` had been asked,
     *  **a field with a perfectly good visible label was reported as
     *  hint-only** — and a placeholder ALONGSIDE a label is not a defect, it
     *  is the recommended pattern. Caught by repairing the planted page by
     *  hand and watching the audit keep complaining about the thing I had
     *  just fixed, which is the negative case this whole method is for.
     *
     *  Two different costs are two findings. Folding them into one would
     *  either understate the field with no name or overstate this, and a
     *  report that overstates is one he learns to skim.
     */
    if (f.getAttribute('placeholder')) {
      var rp = f.getBoundingClientRect();
      if (rp.width > 2 && rp.height > 2 && placeholderOnly.length < 8) {
        placeholderOnly.push(f.getAttribute('name') || f.getAttribute('placeholder') || f.tagName.toLowerCase());
      }
      return;
    }
    var r = f.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2)) return;
    if (unlabelled.length < 8) { unlabelled.push({ name: f.getAttribute('name') || f.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'no label' }); }
  });
  if (unlabelled.length) issues.push({ code: 'inputs_without_labels', severity: 'major', count: unlabelled.length, sample: unlabelled[0].name });
  if (placeholderOnly.length) issues.push({ code: 'placeholder_as_label', severity: 'minor', count: placeholderOnly.length, sample: placeholderOnly[0] });
  return { issues: issues, hasNav: hasNav, focusables: q('a[href], button, input, select, textarea, [tabindex]').length, altBoxes: boxes, labelBoxes: unlabelled };
}

/* -------------------------------------------------------------- responsive */

function measureResponsive(vw: number) {
  var actualVw = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
  var measuredVw = actualVw > 0 ? actualVw : vw;
  var doc = document.documentElement;
  var scrollW = Math.max(doc.scrollWidth, (document.body && document.body.scrollWidth) || 0);
  var wide: any[] = [], boxes: any[] = [], wideEvidence: any[] = [];
  var selectorFor = function (el: any) {
    var parts: string[] = [];
    var node: any = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      var tag = String(node.tagName || '').toLowerCase();
      if (!tag) break;
      var id = String(node.id || '');
      var part = /^[A-Za-z][\w-]*$/.test(id) ? tag + '#' + id : tag;
      if (part === tag) {
        var classes = String(node.className && typeof node.className === 'string' ? node.className : '')
          .split(/\s+/).filter(function (c: string) { return /^[A-Za-z][\w-]*$/.test(c); }).slice(0, 2);
        if (classes.length) part += '.' + classes.join('.');
      }
      var same = node.parentElement ? Array.prototype.filter.call(node.parentElement.children, function (s: any) { return s.tagName === node.tagName; }) : [];
      if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(node) + 1) + ')';
      parts.unshift(part);
      if (node.id) break;
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  Array.prototype.slice.call(document.querySelectorAll('body *'), 0, 4000).forEach(function (el: any) {
    var r = el.getBoundingClientRect();
    if (r.width > measuredVw + 4 && r.height > 0 && wide.length < 6) {
      var cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).filter(Boolean).join('.');
      wide.push(cls ? el.tagName.toLowerCase() + '.' + cls : el.tagName.toLowerCase());
      wideEvidence.push({ sel: selectorFor(el), label: 'wider than the screen', w: Math.round(r.width), h: Math.round(r.height) });
      boxes.push({ x: Math.max(0, Math.round(r.left)), y: Math.round(r.top), width: Math.min(measuredVw, Math.round(r.width)), height: Math.round(r.height), label: 'wider than the screen' });
    }
  });
  var tiny = 0, tinyBoxes: any[] = [], tinyNames: string[] = [], tinyEvidence: any[] = [];
  Array.prototype.slice.call(document.querySelectorAll('a[href],button,input,select,[role="button"]')).forEach(function (el: any) {
    var r = el.getBoundingClientRect();
    /**
     * A LINK INSIDE A SENTENCE IS NOT A TAP TARGET.
     *
     * WCAG's target-size rule exempts a control whose size is determined by
     * the text it sits in — «اقرأ سياستنا هنا» is 19px tall because the line
     * is, and padding it to 44px would break the paragraph. Counting those was
     * the difference between a real finding and six of them.
     */
    if (el.tagName === 'A' && /^inline$/.test(getComputedStyle(el).display)) return;
    if (r.width > 0 && r.height > 0 && (r.width < 40 || r.height < 40)) {
      tiny++;
      if (tinyBoxes.length < 8) {
        tinyBoxes.push({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'tap target < 40px' });
        tinyEvidence.push({ sel: selectorFor(el), label: 'tap target < 40px', w: Math.round(r.width), h: Math.round(r.height) });
        var cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).filter(Boolean).join('.');
        var say = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 20);
        tinyNames.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (say ? ' «' + say + '»' : '') + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      }
    }
  });
  /**
   *  ⛔ TEXT THAT IS CUT OFF BY THE BOX IT LIVES IN.
   *
   *  Found by running the real audit over a page with eleven defects planted
   *  by hand: nine were caught, and this was one of the two that were not.
   *  Nothing structural can see it — the element is present, visible, has its
   *  full text in the DOM, and passes contrast, alt, label and heading checks.
   *  **A visitor sees «This sentence is far too lo» and the rest is gone.**
   *
   *  It belongs at this level rather than in the a11y pass because truncation
   *  is a function of WIDTH: a card title that fits at 1280 and is cut at 390
   *  is the commonest form of it, and this loop is the only place that looks
   *  at the page more than once.
   *
   *  Narrow on purpose, because a wrong complaint here is expensive:
   *    · the element must own its text, so a slider clipping its children
   *      is not accused of clipping a sentence
   *    · overflow must actually be hidden or clipped — a scrollable box shows
   *      the rest when you scroll it, and that is a different question
   *    · `text-overflow: ellipsis` is EXCLUDED: a designer who asked for «…»
   *      chose truncation and said so on screen. This finding is for text
   *      that vanishes without a word.
   */
  var clipped = 0, clippedEvidence: any[] = [], clippedBoxes: any[] = [];
  Array.prototype.slice.call(document.querySelectorAll('body *'), 0, 4000).forEach(function (el: any) {
    if (clippedEvidence.length >= 8) return;
    var ownsText = Array.prototype.some.call(el.childNodes, function (n: any) {
      return n.nodeType === 3 && (n.textContent || '').trim().length > 4;
    });
    if (!ownsText) return;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    var ox = cs.overflowX, oy = cs.overflowY;
    var hidesX = ox === 'hidden' || ox === 'clip';
    var hidesY = oy === 'hidden' || oy === 'clip';
    if (!hidesX && !hidesY) return;
    if (String(cs.textOverflow || '') === 'ellipsis') return;
    var cutX = hidesX && el.scrollWidth > el.clientWidth + 2;
    var cutY = hidesY && el.scrollHeight > el.clientHeight + 2;
    if (!cutX && !cutY) return;
    clipped++;
    var r = el.getBoundingClientRect();
    var txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    clippedEvidence.push({ sel: selectorFor(el), label: 'text cut off', text: txt, w: Math.round(r.width), h: Math.round(r.height) });
    clippedBoxes.push({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'text cut off' });
  });

  var smallFonts = 0;
  Array.prototype.slice.call(document.querySelectorAll('p,span,li,a,td'), 0, 1500).forEach(function (el: any) {
    var fs = parseFloat(getComputedStyle(el).fontSize || '16');
    if (fs && fs < 12) smallFonts++;
  });
  var fragmentedHeader: any = null;
  if (measuredVw <= 480) {
    var banner: any = document.querySelector('header, [role="banner"]');
    if (banner) {
      var bannerBox = banner.getBoundingClientRect();
      var layout: any = banner.querySelector(':scope > div') || banner;
      var visibleChildren = Array.prototype.slice.call(layout.children).filter(function (child: any) {
        var box = child.getBoundingClientRect();
        var style = getComputedStyle(child);
        return box.width > 2 && box.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      var rows = Array.from(new Set(visibleChildren.map(function (child: any) {
        return Math.round(child.getBoundingClientRect().top / 8) * 8;
      }))).length;
      var offscreenControls = Array.prototype.slice.call(banner.querySelectorAll('a[href],button,[role="button"]')).filter(function (control: any) {
        var box = control.getBoundingClientRect();
        return box.width > 2 && box.height > 2 && (box.left < -2 || box.right > measuredVw + 2);
      }).length;
      if (bannerBox.height > 144 || rows >= 3 || offscreenControls > 0) {
        fragmentedHeader = {
          sel: selectorFor(layout), label: 'fragmented mobile header',
          w: Math.round(bannerBox.width), h: Math.round(bannerBox.height), rows: rows, offscreenControls: offscreenControls,
        };
      }
    }
  }
  return {
    requestedVw: vw, actualVw: actualVw,
    scrollW: scrollW, overflowX: scrollW > measuredVw + 2, wide: wide, wideEvidence: wideEvidence, boxes: boxes,
    tiny: tiny, tinyBoxes: tinyBoxes, tinyNames: tinyNames, tinyEvidence: tinyEvidence, smallFonts: smallFonts,
    clipped: clipped, clippedEvidence: clippedEvidence, clippedBoxes: clippedBoxes,
    fragmentedHeader: fragmentedHeader,
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
  };
}

/**
 * Look at the page the way a reviewer looks at it: at the colours, at the
 * structure, and at two widths that are not the one it was designed on.
 *
 * `restore` is the viewport to put back when the walk is over — on a borrowed
 * panel page that is the user's own browser and it MUST come back unchanged.
 */
export async function inspectUi(
    page: any,
    opts?: { eyes?: AuditEyes; restore?: { width: number; height: number }; onViewport?: (w: number, h: number) => void; beforeViewport?: (w: number, h: number) => void },
): Promise<UiInspection> {
    const findings: BehaviourFinding[] = [];
    const metrics: Record<string, any> = {};
    const eyes = opts?.eyes;

    /* ---- colours ------------------------------------------------------- */
    try {
        const raw: any = await evalInPage(page, measureContrast);
        //  The page reports what it SAW; the verdict is reached here, where a
        //  published contrast value can check it.
        const c = { checked: raw.checked, skipped: raw.skipped, fails: judgeContrast(raw.samples) };
        metrics.contrastChecked = c.checked;
        metrics.contrastUnmeasurable = c.skipped;
        metrics.contrastFails = c.fails.length;
        if (c.fails.length) {
            metrics.contrastWorst = c.fails.map((f: any) => `${f.ratio}:1 «${f.text}»`).slice(0, 3);
            await eyes?.mark(page, c.fails.map((f: any) => ({ x: f.x, y: f.y, width: f.width, height: f.height, label: `${f.ratio}:1` })), {
                note: `تباين ضعيف: ${c.fails.length} عنصر`, tone: 'warn', holdMs: 1200,
            });
            findings.push({
                code: 'low_contrast', severity: contrastSeverity(c.fails),
                ar: `${c.fails.length} نص لا يجتاز تباين WCAG AA (الأسوأ ${c.fails[0].ratio}:1 والمطلوب ${c.fails[0].need}:1): «${c.fails[0].text}»`,
                en: `${c.fails.length} text element(s) fail WCAG AA contrast (worst ${c.fails[0].ratio}:1, needs ${c.fails[0].need}:1): "${c.fails[0].text}"`,
                hint: 'darken the text or lighten its background until the ratio clears 4.5:1',
                // The repair loop needs the exact selector and measured colour
                // pair. Without this, Joe can describe the failure but cannot
                // make the evidence-bound source change it promises.
                evidence: c.fails.slice(0, 24),
            });
        }
    } catch { /* colours are one lens, never the whole check */ }

    /* ---- structure ----------------------------------------------------- */
    try {
        const a: any = await evalInPage(page, measureA11y);
        metrics.focusables = a.focusables;
        metrics.hasNav = a.hasNav;
        metrics.a11yIssues = a.issues.length;
        const say: Record<string, { ar: string; en: string; hint: string }> = {
            no_main: { ar: 'لا توجد منطقة محتوى رئيسية <main> — التنقّل بقارئ الشاشة أصعب', en: 'No <main> landmark — screen-reader navigation is harder', hint: 'wrap the page body in <main>' },
            duplicate_ids: { ar: 'معرّفات id مكرّرة — تكسر الروابط و aria', en: 'Duplicate element ids — they break anchors and aria', hint: 'make every id unique' },
            positive_tabindex: { ar: 'tabindex موجب يفسد ترتيب التنقّل بلوحة المفاتيح', en: 'A positive tabindex breaks keyboard tab order', hint: 'use tabindex="0" and let the DOM order decide' },
            aria_hidden_focusable: { ar: 'عنصر تفاعلي داخل aria-hidden — يُركَّز عليه ولا يُقرأ', en: 'A focusable control inside aria-hidden — reachable but unreadable', hint: 'remove aria-hidden or take the control out of it' },
            heading_skip: { ar: 'ترتيب العناوين يتخطّى مستوى', en: 'Heading levels skip a step', hint: 'go down one level at a time' },
            images_without_alt: { ar: 'صور بلا نص بديل', en: 'Images with no alt text', hint: 'every <img> needs alt="" or a real description' },
            placeholder_as_label: {
                ar: 'حقول لا اسم لها غير النص الرمادي بداخلها — يختفي أول ما يكتب المستخدم فلا يعود يعرف ما المطلوب',
                en: 'Fields named only by their placeholder — the hint vanishes on the first keystroke, so nobody can check what belongs there',
                hint: 'add a visible <label for="…">; keep the placeholder for an example, not for the name',
            },
            inputs_without_labels: { ar: 'حقول إدخال بلا اسم يقرؤه أحد', en: 'Form fields with no accessible name', hint: 'add a <label for> or an aria-label' },
        };
        if (a.altBoxes?.length) await eyes?.mark(page, a.altBoxes, { note: 'صور بلا نص بديل', tone: 'warn', holdMs: 900 });
        if (a.labelBoxes?.length) await eyes?.mark(page, a.labelBoxes, { note: 'حقول بلا تسمية', tone: 'warn', holdMs: 900 });
        for (const i of a.issues) {
            const t = say[i.code];
            if (!t) continue;
            const n = i.count ? ` (${i.count})` : '';
            const s = i.sample ? `: ${i.sample}` : '';
            findings.push({ code: `a11y_${i.code}`, severity: i.severity, ar: `${t.ar}${n}${s}`, en: `${t.en}${n}${s}`, hint: t.hint });
        }
    } catch { /* structure is one lens too */ }

    /* ---- widths -------------------------------------------------------- */
    const perWidth: Record<string, any> = {};
    let overflowAt = '';
    let mobileTiny = 0, mobileFonts = 0, hasViewportMeta = true;
    let fragmentedHeader: any = null;
    let clippedAt = '', clippedCount = 0, clippedEvidence: any[] = [];
    let mobileTinyNames: string[] = [];
    let overflowEvidence: any[] = [];
    let mobileTinyEvidence: any[] = [];
    const viewportFailures: Array<{ requested: number; actual: number }> = [];
    const measuredViewports: string[] = [];
    let availableWidth = 1280;
    let openingViewport = { width: 1280, height: 900 };
    try {
        const initial = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
        if (Number(initial?.width) > 0) {
            availableWidth = Number(initial.width);
            openingViewport = { width: Number(initial.width), height: Math.max(240, Number(initial.height || 900)) };
        }
    } catch { /* use the full desktop matrix when the opening width cannot be observed */ }
    const viewports = effectiveViewports(availableWidth);
    for (const vp of viewports) {
        try {
            opts?.beforeViewport?.(vp.w, vp.h);
            await applyViewportSize(page, vp.w, vp.h);
            opts?.onViewport?.(vp.w, vp.h);
            await page.waitForTimeout(420);
            await eyes?.say(page, `فحص العرض ${vp.w}px — ${vp.ar}`);
            const r: any = await evalInPage(page, measureResponsive, vp.w);
            const actualVw = Number(r.actualVw || 0);
            if (!actualVw || Math.abs(actualVw - vp.w) > 2) {
                viewportFailures.push({ requested: vp.w, actual: actualVw });
                perWidth[vp.name] = { requested: vp.w, actual: actualVw, instrumentationFailed: true };
                continue;
            }
            measuredViewports.push(`${vp.w}x${vp.h}`);
            perWidth[vp.name] = { requested: vp.w, actual: actualVw, overflowX: r.overflowX, wide: r.wide, tiny: r.tiny, smallFonts: r.smallFonts };
            hasViewportMeta = hasViewportMeta && !!r.hasViewportMeta;
            if (r.overflowX && !overflowAt) {
                overflowAt = `${vp.w}px${r.wide.length ? ` — ${r.wide.join('، ')}` : ''}`;
                overflowEvidence = Array.isArray(r.wideEvidence) ? r.wideEvidence.slice(0, 8) : [];
                await eyes?.mark(page, r.boxes, { note: `تمرير أفقي على ${vp.w}px`, holdMs: 1200 });
            }
            //  The NARROWEST width that cuts text is the one worth naming:
            //  it is where he will see it first, and a page cut at 390 and
            //  fine at 1280 is the commonest shape of this defect.
            if (r.clipped && !clippedAt) {
                clippedAt = `${vp.w}px`;
                clippedCount = r.clipped;
                clippedEvidence = Array.isArray(r.clippedEvidence) ? r.clippedEvidence.slice(0, 8) : [];
                if (r.clippedBoxes?.length) await eyes?.mark(page, r.clippedBoxes, { note: `نص مقصوص على ${vp.w}px`, tone: 'warn', holdMs: 1100 });
            }
            if (vp.name === 'mobile') {
                mobileTiny = r.tiny; mobileFonts = r.smallFonts; mobileTinyNames = r.tinyNames || [];
                mobileTinyEvidence = Array.isArray(r.tinyEvidence) ? r.tinyEvidence.slice(0, 8) : [];
                if (r.tinyBoxes?.length) await eyes?.mark(page, r.tinyBoxes, { note: `أهداف لمس أصغر من ${TAP_TARGET_MIN_PX}px`, tone: 'warn', holdMs: 1000 });
                if (r.fragmentedHeader) fragmentedHeader = r.fragmentedHeader;
            }
        } catch { /* one width failing must not lose the others */ }
    }
    //  Only what was actually measured. The restore width used to be added
    //  here, which is how a count of two became a report of three.
    metrics.viewports = measuredViewports;
    metrics.perWidth = perWidth;
    if (opts?.restore) {
        try {
            opts?.beforeViewport?.(openingViewport.width, openingViewport.height);
            await applyViewportSize(page, openingViewport.width, openingViewport.height);
            opts?.onViewport?.(openingViewport.width, openingViewport.height);
            await page.waitForTimeout(250);
        } catch { /* the caller owns the page; a failed restore is reported by it */ }
    }

    if (!hasViewportMeta) {
        findings.push({
            code: 'no_viewport_meta', severity: 'critical',
            ar: 'لا يوجد وسم viewport — الصفحة لن تتكيّف مع الجوّال إطلاقاً',
            en: 'No <meta name="viewport"> — the page cannot adapt to a phone at all',
            hint: '<meta name="viewport" content="width=device-width, initial-scale=1">',
        });
    }
    if (viewportFailures.length) {
        const detail = viewportFailures.map(v => `${v.requested}px->${v.actual || '?'}px`).join(', ');
        findings.push({
            code: 'viewport_emulation_failed', severity: 'major',
            ar: `تعذر تطبيق مقاسات الاختبار فعلياً (${detail}) — لا أنسب نتائج الهاتف إلى التطبيق قبل إصلاح أداة القياس`,
            en: `Viewport emulation did not apply (${detail}) — mobile findings were not attributed to the app`,
            hint: 'repair the browser viewport instrumentation, then rerun the same responsive checks',
            evidence: viewportFailures,
        });
    }
    if (overflowAt) {
        findings.push({
            code: 'mobile_overflow', severity: 'major',
            ar: `تمرير أفقي على ${overflowAt} — المحتوى يخرج خارج الشاشة`,
            en: `Horizontal scrolling at ${overflowAt} — content spills off the screen`,
            hint: 'give the offending element max-width:100% and let the grid wrap',
            evidence: overflowEvidence,
        });
    }
    if (clippedCount > 0) {
        findings.push({
            code: 'text_clipped', severity: 'major',
            ar: `${clippedCount} عنصر نصّه مقصوص داخل صندوقه على عرض ${clippedAt} — الكلام موجود في الصفحة ولا يُرى${clippedEvidence[0]?.text ? `: «${clippedEvidence[0].text}»` : ''}`,
            en: `${clippedCount} element(s) have their text cut off by their own box at ${clippedAt} — the words are in the page and cannot be read${clippedEvidence[0]?.text ? `: "${clippedEvidence[0].text}"` : ''}`,
            hint: 'let the box grow, wrap the text, or add text-overflow: ellipsis so the cut is at least visible',
            evidence: clippedEvidence,
        } as any);
    }
    if (mobileTiny > 0) {
        findings.push({
            code: 'mobile_tap_targets', severity: mobileTiny >= 6 ? 'major' : 'minor',
            // Named, not counted: «6 targets» is a number nobody can act on.
            ar: `${mobileTiny} هدف لمس أصغر من ${TAP_TARGET_MIN_PX}px على الجوّال — يصعب ضغطه بالإصبع${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join('، ')}` : ''}`,
            en: `${mobileTiny} tap target(s) under ${TAP_TARGET_MIN_PX}px on a phone — hard to hit with a thumb${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join(', ')}` : ''}`,
            hint: 'min-height:44px and min-width:44px on buttons and nav links',
            evidence: mobileTinyEvidence,
        });
    }
    if (mobileFonts > 0) {
        findings.push({
            code: 'mobile_small_text', severity: 'minor',
            ar: `${mobileFonts} عنصر بخط أصغر من 12px على الجوّال`,
            en: `${mobileFonts} element(s) render below 12px on a phone`,
            hint: 'never go under 12px for body copy',
        });
    }
    if (fragmentedHeader) {
        findings.push({
            code: 'mobile_header_fragmented', severity: 'major',
            ar: `رأس الصفحة على الجوّال متشظٍ إلى ${fragmentedHeader.rows} صفوف وارتفاعه ${fragmentedHeader.h}px، وعناصره الخارجة عن العرض: ${fragmentedHeader.offscreenControls || 0}`,
            en: `The mobile header fragments into ${fragmentedHeader.rows} rows, is ${fragmentedHeader.h}px tall, and has ${fragmentedHeader.offscreenControls || 0} off-screen control(s)`,
            hint: 'keep brand and utility action on one row, and put navigation in one compact scrollable row',
            evidence: [fragmentedHeader],
        });
    }
    metrics.mobileTinyNames = mobileTinyNames;
    metrics.uiFindings = findings.length;
    return { findings, metrics };
}

/** Every box the inspection wants outlined — used by the proofs to count them. */
export type { EyeBox };
