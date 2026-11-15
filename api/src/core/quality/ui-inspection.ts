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
import { pauseBrowserCaptureForPage } from '../../modules/browser/manager';
import { PNG } from 'pngjs';

export interface UiInspection {
    findings: BehaviourFinding[];
    metrics: Record<string, any>;
    /**
     * What was measured: 'complete', or 'partial: …' (time ran out, a width the browser would not take),
     * 'skipped: …' (Chrome's own error page), 'failed: …'. Design v3 §3.2.
     */
    status: string;
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

export function effectiveViewports(_availableWidth: number): Array<{ name: string; ar: string; w: number; h: number }> {
    // QA emulates devices; it is not limited by the panel's current canvas.
    // Always attempt the complete matrix and report an instrumentation failure
    // if a browser truly cannot apply one of these sizes.
    return VIEWPORTS.map(v => ({ ...v }));
}

// Device metrics belong to the CDP session that applies them. Detaching that
// session can restore the preceding viewport a moment later, which made a
// desktop -> tablet -> phone audit measure 390px as 820px. Keep one session
// attached for the lifetime of the Playwright page; the WeakMap releases it
// with the page and avoids a cross-run global browser state.
const viewportCdpSessions = new WeakMap<object, any>();
// Once a page needs CDP emulation, CDP remains its sole viewport owner. Mixing
// Playwright's setter with a second protocol session makes the two controllers
// restore each other's previous metrics one task later (390 -> 1280, followed
// by 1280 -> 390). The page is weakly held, so this ownership cannot leak past
// the browser page lifetime.
const viewportCdpOwnedPages = new WeakSet<object>();

async function getViewportCdpSession(page: any): Promise<any> {
    const known = viewportCdpSessions.get(page);
    if (known) {
        try {
            await known.send('Runtime.evaluate', { expression: '1', returnByValue: true });
            return known;
        } catch (error: any) {
            viewportCdpSessions.delete(page);
            await known.detach?.().catch(() => { });
            console.warn(`[BrowserQA][viewport] replaced detached CDP session: ${String(error?.message || error).slice(0, 160)}`);
        }
    }
    const created = await page.context().newCDPSession(page);
    // Clear inherited emulation once. Clearing before every transition races
    // the live frame capture and can snap tablet/phone measurements back to
    // the context's 1280px default between applying and reading the viewport.
    await created.send('Emulation.clearDeviceMetricsOverride').catch(() => { });
    viewportCdpSessions.set(page, created);
    return created;
}

async function applyViewportSizeUnlocked(page: any, width: number, height: number): Promise<{ width: number; height: number }> {
    // Persistent browser contexts reject Playwright's viewport setter. That
    // is an instrumentation limitation, not evidence that the app failed its
    // responsive layout. Try the normal API, but keep going to CDP when the
    // borrowed/persistent page refuses it.
    // A previous override is replaced on the persistent CDP session below.
    // Do not clear it here: the live screenshot loop may capture between clear
    // and set, restoring the context's desktop dimensions during measurement.
    let actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; }).catch(() => ({ width: 0, height: 0 }));
    const matchesRequestedViewport = () => Math.abs(Number(actual?.width || 0) - width) <= 2
        && Math.abs(Number(actual?.height || 0) - height) <= 2;
    if (!viewportCdpOwnedPages.has(page)) {
        try { await page.setViewportSize({ width, height }); } catch (error: any) {
            console.warn(`[BrowserQA][viewport] page setter ${width}x${height}: ${String(error?.message || error).slice(0, 160)}`);
        }
        await page.waitForTimeout(180).catch(() => { });
        actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; }).catch(() => ({ width: 0, height: 0 }));
        if (matchesRequestedViewport()) return actual;
    }
    // A persistent Playwright profile owns the viewport at context level. In
    // that mode page.setViewportSize can resolve while the visible document
    // remains at its previous width. Prefer the context setter when exposed,
    // then measure the document again before falling back to CDP emulation.
    try {
        const context = page.context?.();
        if (!viewportCdpOwnedPages.has(page) && typeof context?.setViewportSize === 'function') {
            await context.setViewportSize({ width, height });
            await page.waitForTimeout(180).catch(() => { });
            actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
        }
    } catch (error: any) {
        console.warn(`[BrowserQA][viewport] context setter ${width}x${height}: ${String(error?.message || error).slice(0, 160)}`);
    }
    if (matchesRequestedViewport()) return actual;
    try {
        const cdp = await getViewportCdpSession(page);
        viewportCdpOwnedPages.add(page);
        // Persistent/headed Chromium can keep the old visible surface unless
        // it is resized before the device metrics are overridden. Without this
        // pair, the audit reported 820px -> 1280px even though the CDP command
        // itself completed successfully.
        await cdp.send('Emulation.setVisibleSize', { width, height }).catch(() => { });
        await cdp.send('Emulation.setDeviceMetricsOverride', {
            width, height, deviceScaleFactor: 1, mobile: false,
            screenWidth: width, screenHeight: height, dontSetVisibleSize: false,
        });
        await page.waitForTimeout(180).catch(() => { });
        actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
    } catch (error: any) {
        console.warn(`[BrowserQA][viewport] CDP setter ${width}x${height}: ${String(error?.message || error).slice(0, 160)}`);
    }
    if (!matchesRequestedViewport()) {
        // A persistent context may apply the metrics one turn late while the
        // page is still painting the previous frame. Give the browser one
        // explicit retry before declaring the instrumentation broken.
        try {
            const retry = await getViewportCdpSession(page);
            // A screenshot can restore Playwright's metrics while this CDP
            // session still caches the requested dimensions. Repeating the
            // same command then does nothing; clear that stale override once
            // while frame capture is paused, before reapplying and measuring.
            await retry.send('Emulation.clearDeviceMetricsOverride');
            for (let attempt = 0; attempt < 10; attempt++) {
                await retry.send('Emulation.setVisibleSize', { width, height }).catch(() => { });
                await retry.send('Emulation.setDeviceMetricsOverride', {
                    width, height, deviceScaleFactor: 1, mobile: false,
                    screenWidth: width, screenHeight: height, dontSetVisibleSize: false,
                });
                await page.waitForTimeout(200).catch(() => { });
                actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
                if (matchesRequestedViewport()) return actual;
            }
        } catch (error: any) {
            console.warn(`[BrowserQA][viewport] CDP retry ${width}x${height}: ${String(error?.message || error).slice(0, 160)}`);
        }
    }
    if (!matchesRequestedViewport()) {
        // Do not detach this session or call Playwright's setter here. Detaching
        // restores the old metrics asynchronously; invoking both controllers is
        // exactly what made the requested and measured widths trade places.
        try {
            const finalCdp = await getViewportCdpSession(page);
            // The streamed headed surface can acknowledge the protocol command
            // one frame before window.innerWidth changes. Poll the document and
            // reassert the same metrics within a bounded window; measuring the
            // immediately preceding size is not a responsive test.
            for (let attempt = 0; attempt < 10; attempt++) {
                await finalCdp.send('Emulation.setVisibleSize', { width, height }).catch(() => { });
                await finalCdp.send('Emulation.setDeviceMetricsOverride', {
                    width, height, deviceScaleFactor: 1, mobile: false,
                    screenWidth: width, screenHeight: height, dontSetVisibleSize: false,
                });
                await page.waitForTimeout(200).catch(() => { });
                actual = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight }; });
                if (matchesRequestedViewport()) return actual;
            }
        } catch (error: any) {
            console.warn(`[BrowserQA][viewport] fresh-session recovery ${width}x${height}: ${String(error?.message || error).slice(0, 160)}`);
        }
        console.warn(`[BrowserQA][viewport] remained ${Number(actual?.width || 0)}x${Number(actual?.height || 0)} after requesting ${width}x${height}`);
    }
    return actual;
}

export async function applyViewportSize(page: any, width: number, height: number): Promise<{ width: number; height: number }> {
    const release = await pauseBrowserCaptureForPage(page);
    try {
        return await applyViewportSizeUnlocked(page, width, height);
    } finally {
        release();
    }
}

/** Keep the live-frame capture paused until the resized document is measured. */
async function measureAtViewport<T>(
    page: any,
    width: number,
    height: number,
    measure: (actual: { width: number; height: number }) => Promise<T>,
): Promise<T> {
    const release = await pauseBrowserCaptureForPage(page);
    try {
        const actual = await applyViewportSizeUnlocked(page, width, height);
        return await measure(actual);
    } finally {
        release();
    }
}

/* ---------------------------------------------------------------- contrast */

/**
 *  TOLD ONLY, AND EVERY TOLD LINE TRUE (design 2026-11-15 ui-inspection-revival-v3).
 *
 *  Two rounds of design showed that refusing a delivery on visual judgement
 *  keeps meeting pages it gets wrong. So every finding this file writes is
 *  TOLD — to the owner with the delivery, to the builder as advice — and never
 *  refuses (browser-mend.ts INSPECTOR_TOLD), except `no_viewport_meta`. And a
 *  told line must be true: where a lens is not reliable it says nothing.
 *
 *  Colour is read here as a walk of the page (which elements hold words, what
 *  colour the words are, how faded their ancestors make them, whether they
 *  belong to a disabled control) and then judged on the PAINT, in Node
 *  (paintBackgrounds): the background is what the screen shows around the
 *  words, never what the styles say it ought to be.
 */
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
  /**
   * The effective background as the STYLES name it — or NOTHING, when they
   * name a photograph.
   *
   * Measured on Joe's own build: white hero copy over a radial-gradient band
   * came back as «1.05:1», because this walk read backgroundColor only and
   * the gradient lives in backgroundImage. A photo behind text named by CSS is
   * SKIPPED and said to be skipped, never scored. Since v3 this is only the
   * first gate: what is judged is the paint (paintBackgrounds), and this
   * estimate is kept beside it as evidence.
   */
  var effBg = function (el: any): any[] | null {
    var node = el, layers: any[] = [];
    while (node) {
      var st = getComputedStyle(node);
      // A photograph or a gradient without an opaque, parseable stop cannot
      // be reduced to one honest background colour, so report it as skipped.
      if (st.backgroundImage && st.backgroundImage !== 'none') {
        if (/url\(/i.test(st.backgroundImage)) return null;
        //  Array.from, not Array.prototype.slice.call: matchAll is an iterator with no length, and slicing
        //  it gave [] — every gradient was «skipped», however even its paint (v3 §3.1 judges the paint).
        var stops = Array.from(st.backgroundImage.matchAll(/rgba?\([^)]+\)|color\(\s*srgb[^)]+\)/gi))
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
  //  Faded-out content is judged by the opacity of every ancestor (below), so
  //  only what is not laid out or not shown at all is left out here.
  var visible = function (el: any) {
    var r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  // Keep each measured offender addressable in source. Colours and text prove
  // a defect, but the builder also needs to know which selector to change.
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
  var doc = document.documentElement;
  var picked: any[] = [], checked = 0, skipped = 0;
  var els: any[] = Array.prototype.slice.call(document.querySelectorAll('p,span,a,li,h1,h2,h3,h4,h5,h6,button,label,td,th,div,strong,em,small,b'), 0, 6000);
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var tns = Array.prototype.filter.call(el.childNodes, function (n: any) { return n.nodeType === 3 && (n.textContent || '').trim().length > 1; });
    if (!tns.length || !visible(el)) continue;
    //  The product of opacities up the tree: «opacity:.6» on a row fades every word in it.
    var op = 1, hidden = false;
    for (var n: any = el; n && n !== doc; n = n.parentElement) {
      var ns = getComputedStyle(n);
      op *= parseFloat(ns.opacity);
      if (ns.display === 'none' || ns.visibility === 'hidden' || (n.getAttribute && n.getAttribute('aria-hidden') === 'true')) hidden = true;
    }
    if (hidden || op < 0.05) continue;
    checked++;
    var st = getComputedStyle(el);
    var fg = parse(st.color); if (fg[3] === 0) continue;
    var ink = [fg[0], fg[1], fg[2], fg[3]];
    var bgc = effBg(el);
    if (!bgc) { skipped++; continue; }          // a photo the styles name: unmeasurable
    var measuredBg = bgc;
    // Alpha text is composited over the styles' background for the estimate kept as evidence.
    if (fg[3] < 0.995) {
      fg = [0, 1, 2].map(function (channel: number) { return fg[channel] * fg[3] + measuredBg[channel] * (1 - fg[3]); }) as any;
    }
    //  THE ARITHMETIC AND THE VERDICT LEFT THIS FUNCTION — see judgeContrast.
    var size = parseFloat(st.fontSize) || 16, bold = (parseInt(st.fontWeight, 10) || 400) >= 700;
    //  A disabled control is SAID to be unavailable by its faded words: not a reading problem.
    var lab = el.closest('label'), labelled = lab && (lab.control || lab.querySelector('input,select,textarea,button'));
    var disabled = !!(el.matches(':disabled') || el.closest('[disabled],[aria-disabled="true"],fieldset:disabled') || (labelled && labelled.disabled));
    var control = !!(el.closest('a[href],button,[role="button"],[role="tab"],summary') || lab);
    var r = el.getBoundingClientRect();
    picked.push({
      el: el, control: control, disabled: disabled, ink: ink, op: op,
      cssFg: [fg[0], fg[1], fg[2]], cssBg: [measuredBg[0], measuredBg[1], measuredBg[2]],
      size: size, bold: bold, text: String(tns[0].textContent || '').trim().slice(0, 40),
      x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height),
    });
  }
  //  The words of controls first, then the rest; capped, so a 3000-row table cannot hold the walk.
  picked.sort(function (a: any, b: any) { return (b.control ? 1 : 0) - (a.control ? 1 : 0); });
  picked = picked.slice(0, 300);
  //  Named only once picked: a selector counts siblings, and doing that for 6000 cells of a
  //  2500-row table took longer than the whole inspection is allowed (measured: en-big-table, 45 s).
  picked.forEach(function (p: any) { p.sel = selectorFor(p.el); });
  //  The elements stay in the page for the paint step (never found again by index).
  (window as any).__joeInspectSamples = picked.map(function (p: any) { return p.el; });
  var samples = picked.map(function (p: any, k: number) {
    return {
      k: k, control: p.control, disabled: p.disabled, ink: p.ink, op: p.op, cssFg: p.cssFg, cssBg: p.cssBg,
      size: p.size, bold: p.bold, text: p.text, x: p.x, y: p.y, width: p.width, height: p.height, sel: p.sel,
    };
  });
  return { checked: checked, skipped: skipped, samples: samples };
}

/* ---- the paint: in-page helpers (each self-contained: a function sent to the page closes over nothing) ---- */

/**
 *  Measured (P096 at 390): Chromium photographs a right-to-left page that is
 *  wider than the screen from the wrong side — the header is not in the
 *  picture. Nothing is judged from such a photograph.
 */
function paintRtlWide() {
  return getComputedStyle(document.documentElement).direction === 'rtl'
    && Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0) > window.innerWidth + 2;
}

function paintEyeOverlay(hide: boolean) {
  var h: any = document.getElementById('joe-audit-eye');
  if (!h) return;
  if (hide) { h.setAttribute('data-was', h.style.display || ''); h.style.display = 'none'; }
  else { h.style.display = h.getAttribute('data-was') || ''; h.removeAttribute('data-was'); }
}

function paintSampleTops() {
  return ((window as any).__joeInspectSamples || []).map(function (el: any) { var r = el.getBoundingClientRect(); return r.top + window.scrollY; });
}

function paintScrollTo(y: number) {
  //  instant: a page with `scroll-behavior: smooth` animates scrollTo, and the words would be read mid-scroll
  window.scrollTo({ left: 0, top: y, behavior: 'instant' as any });
  return { x: window.scrollX, y: window.scrollY };
}

/** Pictures on screen are given up to 2 s to arrive; what is still loading is returned (its box). */
async function paintPendingPictures() {
  var onScreen = function (im: any) { var r = im.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight && r.width > 0; };
  var imgs: any[] = Array.prototype.slice.call(document.images).filter(onScreen);
  await Promise.race([
    Promise.all(imgs.map(function (im: any) { return im.complete ? Promise.resolve() : im.decode().catch(function () { /* a broken picture is not waited for */ }); })),
    new Promise(function (resolve) { setTimeout(resolve, 2000); }),
  ]);
  return Array.prototype.slice.call(document.images).filter(function (im: any) { return onScreen(im) && !(im.complete && im.naturalWidth > 0); })
    .map(function (im: any) { var r = im.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
}

/** Which samples are wholly on this screen, hit-test to themselves, and where their words are. */
function paintSamplesOnScreen(pending: number[][]) {
  return ((window as any).__joeInspectSamples || []).map(function (el: any, k: number) {
    var tn = Array.prototype.find.call(el.childNodes, function (n: any) { return n.nodeType === 3 && (n.textContent || '').trim().length > 1; });
    if (!tn) return null;
    var rg = document.createRange(); rg.selectNodeContents(tn);
    var lines = Array.prototype.slice.call(rg.getClientRects()).filter(function (x: any) { return x.width >= 2 && x.height >= 2; }).slice(0, 3)
      .map(function (x: any) { return { l: x.left, t: x.top, r: x.right, b: x.bottom }; });
    if (!lines.length) return null;
    var L = lines[0];
    if (L.t < 0 || L.b > window.innerHeight || L.l < 0 || L.r > window.innerWidth) return null;
    var hit = document.elementFromPoint((L.l + L.r) / 2, (L.t + L.b) / 2);
    if (!hit || !(hit === el || el.contains(hit))) return null;
    var under = (pending || []).some(function (p: number[]) { return !(p[2] < L.l || p[0] > L.r || p[3] < L.t || p[1] > L.b); });
    var st = getComputedStyle(el), bg = st.backgroundColor.match(/rgba?\(([^)]+)\)/), b = el.getBoundingClientRect();
    var own = bg && (bg[1].split(',').length < 4 || parseFloat(bg[1].split(',')[3]) >= 0.995) && st.backgroundImage === 'none'
      ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null;
    //  a sample still fading or sliding in (or inside something that is) is photographed between two states
    var moving = false;
    for (var m: any = el; m && m !== document.documentElement && !moving; m = m.parentElement) {
      if (m.getAnimations && m.getAnimations().some(function (a: any) { return a.playState === 'running'; })) moving = true;
    }
    return { k: k, lines: lines, own: own, under: under, moving: moving };
  });
}

function paintForgetSamples() {
  delete (window as any).__joeInspectSamples;
}

/** WCAG's linearised channel, once per value: the paint reads tens of thousands of pixels a screen. */
const LINEAR: Float64Array = (() => {
    const t = new Float64Array(256);
    for (let v = 0; v < 256; v++) { const x = v / 255; t[v] = x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return t;
})();
const lumRgb = (r: number, g: number, b: number) => 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];

/** One photograph of the viewport, as pixels; through the CDP session when it owns the viewport (a Playwright screenshot would restore Playwright's own size). */
async function photograph(page: any): Promise<PNG> {
    if (viewportCdpOwnedPages.has(page)) {
        const cdp = await getViewportCdpSession(page);
        const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        return PNG.sync.read(Buffer.from(String(shot?.data || ''), 'base64'));
    }
    return PNG.sync.read(await page.screenshot({ type: 'png' }));
}

interface PaintResult { bg?: number[]; fg?: number[]; ratio?: number; unmeasured?: string }

/**
 *  COLOUR ON THE PAINT, at the current width (design v3 §3.1).
 *
 *  Visits the screens that hold samples — the words of controls first —
 *  waits for the pictures on each, hides the eye overlay, takes one
 *  photograph, and for each sample wholly on screen whose centre hit-tests to
 *  itself reads the median pixel of a 3 px ring around its line boxes (inside
 *  its own box when it has an opaque background of its own). Judged only when
 *  the ring is ONE colour and no picture still loading overlaps it; a photo, a
 *  gradient or glass that is not even is «not measured» — never a guess. The
 *  ink is the text colour blended by the opacity of every ancestor, and its
 *  words must be visible in the photograph.
 */
async function paintBackgrounds(
    page: any, samples: any[], deadline: number, maxStops: number, vw: number,
): Promise<{ results: Map<number, PaintResult>; cut: '' | 'time' | 'width' }> {
    const results = new Map<number, PaintResult>();
    let cut: '' | 'time' | 'width' = '';
    if (!samples.length) return { results, cut };
    if (Date.now() > deadline) return { results, cut: 'time' };
    if (await evalInPage(page, paintRtlWide)) {
        for (const s of samples) results.set(s.k, { unmeasured: 'a right-to-left page wider than the screen cannot be photographed in place' });
        return { results, cut };
    }
    const vh = Math.max(1, Number(await evalInPage(page, function () { return window.innerHeight; })) || 900);
    const start = await evalInPage(page, function () { return { x: window.scrollX, y: window.scrollY }; });
    await evalInPage(page, paintEyeOverlay, true);
    try {
        const tops: number[] = await evalInPage(page, paintSampleTops);
        const stopOf = (y: number) => Math.max(0, Math.floor(y / vh) * vh);
        const ctlStops = new Set(tops.filter((_y, k) => samples[k] && samples[k].control).map(stopOf));
        const stops = [...new Set(tops.map(stopOf))]
            .sort((a, b) => (Number(ctlStops.has(b)) - Number(ctlStops.has(a))) || a - b)
            .slice(0, maxStops);
        for (const y of stops) {
            if (Date.now() > deadline) { cut = 'time'; break; }
            await evalInPage(page, paintScrollTo, y);
            const pending = await evalInPage(page, paintPendingPictures);
            const onScreen: any[] = await evalInPage(page, paintSamplesOnScreen, pending);
            const todo = (onScreen || []).filter(v => v && !results.has(v.k));
            if (!todo.length) continue;
            if (Date.now() > deadline) { cut = 'time'; break; }
            const png = await photograph(page);
            const width = Number(await evalInPage(page, function () { return window.innerWidth; })) || 0;
            //  The photograph must be of THIS width: a capture that put another size back is not evidence.
            if (Math.abs(width - vw) > 2) { cut = 'width'; break; }
            const scale = png.width / Math.max(1, width);
            const W = png.width, H = png.height, D = png.data;
            //  the pixel under a CSS point, as one integer (0xRRGGBB), or -1 off the photograph
            const at = (x: number, yy: number): number => {
                const X = Math.round(x * scale), Y = Math.round(yy * scale);
                if (X < 0 || Y < 0 || X >= W || Y >= H) return -1;
                const o = (W * Y + X) << 2;
                return (D[o] << 16) | (D[o + 1] << 8) | D[o + 2];
            };
            const rgbOf = (p: number) => [(p >> 16) & 255, (p >> 8) & 255, p & 255];
            for (const v of todo) {
                const s = samples[v.k];
                if (!s) continue;
                if (v.under) { results.set(v.k, { unmeasured: 'a picture behind it had not arrived' }); continue; }
                if (v.moving) { results.set(v.k, { unmeasured: 'it was moving or fading when photographed' }); continue; }
                //  the ring, each pixel keyed by its luminance (then its colour), so one numeric sort orders it
                const keys: number[] = [];
                for (const L of v.lines) for (let yy = Math.floor(L.t - 3); yy <= Math.ceil(L.b + 3); yy++) for (let x = Math.floor(L.l - 3); x <= Math.ceil(L.r + 3); x++) {
                    if (x >= L.l && x <= L.r && yy >= L.t && yy <= L.b) continue;
                    if (v.own && (x < v.own.l || x > v.own.r || yy < v.own.t || yy > v.own.b)) continue;
                    const p = at(x, yy); if (p < 0) continue;
                    keys.push(Math.floor(lumRgb((p >> 16) & 255, (p >> 8) & 255, p & 255) * 1e6) * 16777216 + p);
                }
                if (keys.length < 30) { results.set(v.k, { unmeasured: 'too little background around it' }); continue; }
                const ring = Float64Array.from(keys).sort();
                const pick = (q: number) => rgbOf(ring[Math.floor(q)] % 16777216);
                const lo = pick(ring.length * 0.1), mid = pick(ring.length / 2), hi = pick(ring.length * 0.9);
                //  a picture, a gradient or a pattern: one number would be a guess — not judged
                if (contrastRatio(lo, hi) > 1.25) { results.set(v.k, { unmeasured: 'the background behind it is not one colour' }); continue; }
                const ink: number[] = Array.isArray(s.ink) ? s.ink : [0, 0, 0, 1];
                const a = Math.max(0, Math.min(1, Number(ink[3] ?? 1) * Number(s.op ?? 1)));
                const want = [0, 1, 2].map(c => ink[c] * a + mid[c] * (1 - a));
                //  the words must be in the photograph: some pixels inside the line boxes close to the ink AND
                //  apart from the background. Close to the ink alone proves nothing when ink and background are
                //  alike — a photograph of the wrong place (P041: dark words, dark page behind a gold button
                //  read mid-scroll) passed it. Words that cannot be told from their background are not judged.
                const apart = Math.abs(want[0] - mid[0]) + Math.abs(want[1] - mid[1]) + Math.abs(want[2] - mid[2]);
                if (apart < 12) { results.set(v.k, { unmeasured: 'its words cannot be told from the background in the photograph' }); continue; }
                let inBox = 0, near = 0;
                for (const L of v.lines) for (let yy = Math.ceil(L.t); yy < Math.floor(L.b); yy++) for (let x = Math.ceil(L.l); x < Math.floor(L.r); x++) {
                    const p = at(x, yy); if (p < 0) continue;
                    inBox++;
                    const r = (p >> 16) & 255, g = (p >> 8) & 255, b = p & 255;
                    const toInk = Math.abs(r - want[0]) + Math.abs(g - want[1]) + Math.abs(b - want[2]);
                    const toBg = Math.abs(r - mid[0]) + Math.abs(g - mid[1]) + Math.abs(b - mid[2]);
                    if (toInk <= 30 && toBg >= apart / 2) near++;
                }
                if (!inBox || near / inBox < 0.01) { results.set(v.k, { unmeasured: 'its words are not in the photograph' }); continue; }
                results.set(v.k, { bg: mid, fg: want.map(Math.round), ratio: Math.round(contrastRatio(want, mid) * 100) / 100 });
            }
        }
    } finally {
        await evalInPage(page, paintEyeOverlay, false).catch(() => { });
        await evalInPage(page, function (p: any) { window.scrollTo({ left: Number(p && p.x) || 0, top: Number(p && p.y) || 0, behavior: 'instant' as any }); }, start || { x: 0, y: 0 }).catch(() => { });
    }
    return { results, cut };
}

/** The colour lens at one width: the walk, the paint, and what may be judged (never a disabled control, never «not measured»). */
async function colourAtThisWidth(page: any, vw: number, deadline: number): Promise<{ checked: number; skipped: number; disabled: number; samples: ContrastSample[]; cut: string; why: Record<string, number> }> {
    const raw: any = await evalInPage(page, measureContrast);
    const samples: any[] = Array.isArray(raw?.samples) ? raw.samples : [];
    let paint: { results: Map<number, PaintResult>; cut: string } = { results: new Map(), cut: '' };
    try {
        paint = await paintBackgrounds(page, samples, deadline, vw >= 1000 ? 10 : 12, vw);
    } finally {
        await evalInPage(page, paintForgetSamples).catch(() => { });
    }
    const judged: ContrastSample[] = [];
    let unmeasured = Number(raw?.skipped || 0), disabled = 0;
    //  Why each sample was not judged, counted: «not measured» is said, never hidden.
    const why: Record<string, number> = {};
    if (unmeasured) why['a photograph the styles name'] = unmeasured;
    for (const s of samples) {
        const p = paint.results.get(s.k);
        if (!p || p.unmeasured || !p.fg || !p.bg) {
            unmeasured++;
            const reason = p?.unmeasured || 'not on any screen visited';
            why[reason] = (why[reason] || 0) + 1;
            continue;
        }
        if (s.disabled) { disabled++; continue; }
        judged.push({
            text: s.text, fg: p.fg, bg: p.bg, size: s.size, bold: s.bold,
            x: s.x, y: s.y, width: s.width, height: s.height, sel: s.sel, vw,
        });
    }
    return { checked: Number(raw?.checked || 0), skipped: unmeasured, disabled, samples: judged, cut: paint.cut, why };
}

/**
 *  WCAG 2.1 RELATIVE LUMINANCE — in Node, where a published number can check it.
 *
 *  ⛔ This arithmetic lived inside `page.evaluate`, and the only thing guarding
 *  it was a test asserting the SOURCE TEXT contained
 *  `0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]`. That is a spell-check, not
 *  a measurement: the coefficients could be right and the branch above them
 *  wrong, and nothing would know.
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
 *  HAND: the old rule was `c.fails.length >= 4 ? 'major' : 'minor'` — counted,
 *  and nothing else — so 1.16:1, text nobody can read, came out `minor`.
 *  Many failures, OR one that is far past the line. 3:1 is WCAG's own floor
 *  for the largest, boldest text on a page. (Since v3 the line is told either
 *  way; the severity says how loudly.)
 */
export function contrastSeverity(
    fails: Array<{ ratio: number }>,
): 'critical' | 'major' | 'minor' {
    if (!fails || !fails.length) return 'minor';
    const worst = Math.min(...fails.map(f => Number(f.ratio) || 0));
    if (worst < 3) return 'critical';
    return fails.length >= 4 ? 'major' : 'minor';
}

export interface ContrastSample {
    text: string; fg: number[]; bg: number[]; size: number; bold: boolean;
    x: number; y: number; width: number; height: number;
    /** Safe selector for the source-addressable measured offender. */
    sel?: string;
    /** The width the sample was painted at. */
    vw?: number;
}

/**
 *  Judge what the page reported. The dedup and the caps are here rather than
 *  in the page for the same reason the arithmetic is: they decide what he is
 *  told, and what he is told must be testable.
 */
export function judgeContrast(
    samples: ContrastSample[] | undefined,
): Array<{ text: string; ratio: number; need: number; fg: number[]; bg: number[]; sel: string; x: number; y: number; width: number; height: number; vw?: number }> {
    const seen = new Set<string>();
    const fails: any[] = [];
    for (const s of samples || []) {
        if (!s || !Array.isArray(s.fg) || !Array.isArray(s.bg)) continue;
        const rt = contrastRatio(s.fg, s.bg);
        const need = requiredRatio(Number(s.size) || 16, !!s.bold);
        if (rt >= need) continue;
        const rounded = Math.round(rt * 100) / 100;
        //  «worst 4.5:1, needs 4.5:1» would be a sentence that contradicts itself.
        if (rounded >= need) continue;
        //  Same key the page used: the text and the ratio. Two different
        //  elements reading «Read more» at the same ratio are one complaint.
        const key = String(s.text).slice(0, 30) + rounded.toFixed(2);
        if (seen.has(key)) continue;
        seen.add(key);
        fails.push({
            text: s.text, ratio: rounded, need, fg: s.fg.slice(0, 3), bg: s.bg.slice(0, 3), sel: s.sel || '',
            x: s.x, y: s.y, width: s.width, height: s.height, ...(s.vw ? { vw: s.vw } : {}),
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
  var doc = document.documentElement;
  //  What a screen reader cannot reach is not part of the outline it reads.
  var gone = function (el: any) {
    for (var n: any = el; n && n !== doc; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return true;
      if (n.getAttribute && (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert'))) return true;
    }
    return false;
  };
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
  //  Focusable means a keyboard can land on it: a disabled control or tabindex="-1" cannot.
  var hiddenFocus = q('[aria-hidden="true"] a[href], [aria-hidden="true"] button, [aria-hidden="true"] input')
    .filter(function (e: any) { return !e.disabled && e.getAttribute('tabindex') !== '-1'; }).length;
  if (hiddenFocus) issues.push({ code: 'aria_hidden_focusable', severity: 'major', count: hiddenFocus });
  var levels = q('h1,h2,h3,h4,h5,h6').filter(function (h: any) { return !gone(h); }).map(function (h: any) { return parseInt(h.tagName[1], 10); });
  for (var i = 1; i < levels.length; i++) {
    if (levels[i] - levels[i - 1] > 1) { issues.push({ code: 'heading_skip', severity: 'minor', sample: 'h' + levels[i - 1] + ' ← h' + levels[i] }); break; }
  }
  // An image with no alt is invisible to a screen reader and to a search engine.
  var noAlt: any[] = [], boxes: any[] = [];
  q('img').forEach(function (im: any) {
    if (im.getAttribute('alt') !== null) return;
    var r = im.getBoundingClientRect();
    if (!(r.width > 4 && r.height > 4) || gone(im)) return;
    if (noAlt.length < 8) { noAlt.push((im.currentSrc || im.src || 'img').split('/').pop().slice(0, 34)); boxes.push({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'no alt' }); }
  });
  if (noAlt.length) issues.push({ code: 'images_without_alt', severity: 'major', count: noAlt.length, sample: noAlt[0] });
  // A field nobody named is a field nobody can fill with a screen reader.
  var unlabelled: any[] = [], placeholderOnly: string[] = [];
  q('input,select,textarea').forEach(function (f: any) {
    var t = (f.getAttribute('type') || '').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' || t === 'reset') return;
    var r = f.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2) || gone(f)) return;
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title')) return;
    if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return;
    if (f.labels && f.labels.length) return;
    if (f.closest('label')) return;
    /**
     *  ⛔ A PLACEHOLDER IS NOT A LABEL, AND IT IS NOT NOTHING EITHER.
     *
     *  A browser does fall back to the placeholder for the accessible name, so
     *  a screen reader says something. What it costs is different and
     *  specific — **the hint disappears the moment you type**. And it sits
     *  AFTER every way of naming a field, because a placeholder alongside a
     *  label is the recommended pattern, not a defect.
     */
    if (f.getAttribute('placeholder')) {
      if (placeholderOnly.length < 8) {
        placeholderOnly.push(f.getAttribute('name') || f.getAttribute('placeholder') || f.tagName.toLowerCase());
      }
      return;
    }
    if (unlabelled.length < 8) { unlabelled.push({ name: f.getAttribute('name') || f.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'no label' }); }
  });
  if (unlabelled.length) issues.push({ code: 'inputs_without_labels', severity: 'major', count: unlabelled.length, sample: unlabelled[0].name });
  if (placeholderOnly.length) issues.push({ code: 'placeholder_as_label', severity: 'minor', count: placeholderOnly.length, sample: placeholderOnly[0] });
  return { issues: issues, hasNav: hasNav, focusables: q('a[href], button, input, select, textarea, [tabindex]').length, altBoxes: boxes, labelBoxes: unlabelled };
}

/* -------------------------------------------------------------- responsive */

/**
 *  ONE WIDTH, AS A VISITOR MEETS IT (design v3 §3).
 *
 *  Every lens here says a thing only when it is true for a visitor:
 *    · overflow — the page really scrolls sideways AND words or a control
 *      beyond the edge come on screen when it is panned (the browser's own
 *      hit test), never a card border that pokes out;
 *    · reach — a control a visitor cannot bring on screen at all, after
 *      panning the page and hit-testing its centre; never under «…», an
 *      animation, a box moved by buttons beside it, or a slide track;
 *    · tap targets, small text and the header — on a phone, and only what is
 *      painted: a closed drawer's links, hidden or parked content are not on
 *      the phone.
 *  Capped (≤ 1500 candidates per lens, ≤ 4000 nodes for clipping) so a huge
 *  page cannot hold the walk.
 */
function measureResponsive(vw: number) {
  var actualVw = Math.round(window.innerWidth || document.documentElement.clientWidth || 0);
  var measuredVw = actualVw > 0 ? actualVw : vw;
  var vh = window.innerHeight || 0;
  var doc = document.documentElement, body: any = document.body;
  var scrollW = Math.max(doc.scrollWidth, (body && body.scrollWidth) || 0);
  var CAP = 1500;
  var phone = measuredVw <= 480;
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
  //  where to find it again: its selector, and which of that selector's matches it is
  var nthOf = function (el: any, s: string) {
    try { return Array.prototype.indexOf.call(document.querySelectorAll(s), el); } catch (e) { return -1; }
  };
  var identity = function (t: any) { if (!t || t === 'none') return true; try { return new DOMMatrixReadOnly(t).isIdentity; } catch (e) { return false; } };
  //  not content: hidden, faded out, sr-only-collapsed, or a panel parked beyond an edge (a closed drawer)
  var gone = function (el: any) {
    for (var n: any = el; n && n !== doc; n = n.parentElement) {
      var s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse' || parseFloat(s.opacity) < 0.05) return 'hidden';
      if (n.getAttribute && (n.getAttribute('aria-hidden') === 'true' || n.hasAttribute('inert'))) return 'hidden';
      if (n === body) break;
      var b = n.getBoundingClientRect();
      if (((s.clip && s.clip !== 'auto') || (s.clipPath && s.clipPath !== 'none')) && (b.width < 2 || b.height < 2)) return 'collapsed';
      if ((s.overflowX !== 'visible' || s.overflowY !== 'visible') && (b.width < 2 || b.height < 2)) return 'collapsed';
      var moved = s.position === 'fixed' || s.position === 'absolute' || !identity(s.transform);
      if (moved && (b.right <= 1 || b.left >= measuredVw - 1 || b.bottom <= 1 && s.position === 'fixed')) return 'parked';
    }
    return '';
  };
  var inFixed = function (el: any) {
    for (var m: any = el; m && m !== body; m = m.parentElement) if (getComputedStyle(m).position === 'fixed') return m;
    return null;
  };
  var ownsWords = function (el: any) { return Array.prototype.some.call(el.childNodes, function (n: any) { return n.nodeType === 3 && (n.textContent || '').trim().length > 0; }); };
  var hx = getComputedStyle(doc).overflowX, bx = body ? getComputedStyle(body).overflowX : 'visible';
  var pageCanPan = !/hidden|clip/.test(hx !== 'visible' ? hx : bx);
  var rtl = getComputedStyle(doc).direction === 'rtl';
  var sx0 = window.scrollX, sy0 = window.scrollY;
  //  every scroll instant: `scroll-behavior: smooth` turns scrollTo into an animation, and a position read
  //  right after it is the old one (measured on P041) — the pan and the reach would be judged on nothing
  var jump = function (x: number, y: number) { window.scrollTo({ left: x, top: y, behavior: 'instant' as any }); };

  /* ---- 1. does the page really scroll sideways, and what comes on screen when it does ---- */
  jump(rtl ? -100000 : 100000, sy0);
  var panned = Math.abs(window.scrollX - sx0);
  jump(sx0, sy0);
  if (panned > 2 && body) {
    var off = function (b: any) { return rtl ? b.left < -2 : b.right > measuredVw + 2; };
    var beyond: any[] = [];
    var all: any[] = Array.prototype.slice.call(body.querySelectorAll('*'), 0, 6000);
    for (var i = 0; i < all.length && beyond.length < 12; i++) {
      var el = all[i], b = el.getBoundingClientRect();
      if (!(b.width > 0 && b.height > 0) || !off(b)) continue;
      if (b.width > measuredVw + 4 && wide.length < 6) {
        var wcls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).filter(Boolean).join('.');
        wide.push(wcls ? el.tagName.toLowerCase() + '.' + wcls : el.tagName.toLowerCase());
      }
      var isCtl = el.matches('a[href],button,input,select,textarea,[role="button"],canvas,svg,iframe,video,img');
      if (!isCtl && !ownsWords(el)) continue;
      //  words, not boxes: a card whose border pokes out is not «content off the screen»; its words must be
      if (!isCtl) {
        var wordsOff = Array.prototype.some.call(el.childNodes, function (n: any) {
          if (n.nodeType !== 3 || !(n.textContent || '').trim()) return false;
          var rg = document.createRange(); rg.selectNodeContents(n);
          return Array.prototype.some.call(rg.getClientRects(), function (q: any) { return q.width > 1 && off(q); });
        });
        if (!wordsOff) continue;
      }
      if (gone(el) || inFixed(el)) continue;
      var bsel = selectorFor(el);
      beyond.push({ el: el, text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30), sel: bsel, nth: nthOf(el, bsel) });
    }
    //  proof, not inference: pan the page and ask the browser what is now under the item's centre
    var seen: any[] = [];
    jump(rtl ? -100000 : 100000, sy0);
    for (var k = 0; k < beyond.length; k++) {
      var e = beyond[k].el, pr = e.getBoundingClientRect();
      var cy = pr.top + Math.min(pr.height, 20) / 2;
      if (cy < 0 || cy > vh) { jump(window.scrollX, window.scrollY + pr.top - vh / 2); pr = e.getBoundingClientRect(); cy = pr.top + Math.min(pr.height, 20) / 2; }
      var cx = Math.max(1, Math.min(measuredVw - 1, pr.left + pr.width / 2));
      var hit = document.elementFromPoint(cx, cy);
      if (hit && (hit === e || e.contains(hit))) seen.push(beyond[k]);
    }
    jump(sx0, sy0);
    seen.slice(0, 8).forEach(function (it: any) {
      var r0 = it.el.getBoundingClientRect();
      wideEvidence.push({ sel: it.sel, nth: it.nth, text: it.text, label: 'off the screen', w: Math.round(r0.width), h: Math.round(r0.height) });
      boxes.push({ x: Math.max(0, Math.round(r0.left)), y: Math.round(r0.top), width: Math.min(measuredVw, Math.round(r0.width)), height: Math.round(r0.height), label: 'off the screen' });
    });
  }

  /* ---- 2. tap targets on a phone (the label's box for a checkbox/radio; whole pixels) ---- */
  var tiny = 0, tinyBoxes: any[] = [], tinyNames: string[] = [], tinyEvidence: any[] = [];
  if (phone) Array.prototype.slice.call(document.querySelectorAll('a[href],button,input,select,[role="button"]'), 0, CAP).forEach(function (el: any) {
    /**
     * A LINK INSIDE A SENTENCE IS NOT A TAP TARGET.
     *
     * WCAG's target-size rule exempts a control whose size is determined by
     * the text it sits in — «اقرأ سياستنا هنا» is 19px tall because the line
     * is, and padding it to 44px would break the paragraph.
     */
    if (el.tagName === 'A' && /^inline$/.test(getComputedStyle(el).display)) return;
    if (el.tagName === 'INPUT' && /^hidden$/i.test(el.type)) return;
    var box = el.getBoundingClientRect();
    if (el.tagName === 'INPUT' && /^(checkbox|radio)$/i.test(el.type)) {
      var lab = el.closest('label') || (el.id && document.querySelector('label[for="' + CSS.escape(el.id) + '"]'));
      if (lab) box = lab.getBoundingClientRect();
    }
    var r = { width: Math.round(box.width), height: Math.round(box.height) };
    if (!(r.width > 0 && r.height > 0) || gone(el)) return;
    if (r.width < 40 || r.height < 40) {
      tiny++;
      if (tinyBoxes.length < 8) {
        var tsel = selectorFor(el);
        tinyBoxes.push({ x: Math.round(box.left), y: Math.round(box.top), width: r.width, height: r.height, label: 'tap target < 40px' });
        tinyEvidence.push({ sel: tsel, nth: nthOf(el, tsel), label: 'tap target < 40px', w: r.width, h: r.height });
        var cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).filter(Boolean).join('.');
        var say = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 20);
        tinyNames.push(el.tagName.toLowerCase() + (cls ? '.' + cls : '') + (say ? ' «' + say + '»' : '') + ' ' + r.width + 'x' + r.height);
      }
    }
  });
  /**
   *  ⛔ TEXT THAT IS CUT OFF BY THE BOX IT LIVES IN.
   *
   *  A visitor sees «This sentence is far too lo» and the rest is gone.
   *  Narrow on purpose, because a wrong line here is expensive:
   *    · the element must own its text, so a slider clipping its children
   *      is not accused of clipping a sentence
   *    · overflow must actually be hidden or clipped — a scrollable box shows
   *      the rest when you scroll it
   *    · `text-overflow: ellipsis` and a line clamp are EXCLUDED: a designer
   *      who asked for «…» chose truncation and said so on screen
   *    · an animated box (a ticker) moves its words into view
   *    · a text LINE BOX must cross the box's edge — not a child's margin
   */
  var clipped = 0, clippedEvidence: any[] = [], clippedBoxes: any[] = [];
  Array.prototype.slice.call(document.querySelectorAll('body *'), 0, 4000).forEach(function (el: any) {
    if (clippedEvidence.length >= 8) return;
    var ownsText = Array.prototype.some.call(el.childNodes, function (n: any) {
      return n.nodeType === 3 && (n.textContent || '').trim().length > 4;
    });
    if (!ownsText) return;
    // Accessible labels deliberately use a one-pixel clipped box. Their text
    // is available to assistive technology, not visually cut off from a visitor.
    if (el.classList.contains('sr-only') || el.classList.contains('visually-hidden') || el.getAttribute('aria-hidden') === 'true') return;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    var ox = cs.overflowX, oy = cs.overflowY;
    var hidesX = ox === 'hidden' || ox === 'clip';
    var hidesY = oy === 'hidden' || oy === 'clip';
    if (!hidesX && !hidesY) return;
    if (String(cs.textOverflow || '') === 'ellipsis') return;
    var clamp = String((cs as any).webkitLineClamp || 'none');
    if (clamp && clamp !== 'none') return;
    if (el.getAnimations && el.getAnimations({ subtree: true }).length) return;
    var cutX = hidesX && el.scrollWidth > el.clientWidth + 2;
    var cutY = hidesY && el.scrollHeight > el.clientHeight + 2;
    if (!cutX && !cutY) return;
    if (gone(el)) return;
    var r = el.getBoundingClientRect(), crosses = false;
    Array.prototype.forEach.call(el.childNodes, function (n: any) {
      if (n.nodeType !== 3 || crosses) return;
      var rg = document.createRange(); rg.selectNodeContents(n);
      Array.prototype.forEach.call(rg.getClientRects(), function (q: any) {
        if ((hidesX && (q.right > r.right + 2 || q.left < r.left - 2)) || (hidesY && (q.bottom > r.bottom + 2 || q.top < r.top - 2))) crosses = true;
      });
    });
    if (!crosses) return;
    clipped++;
    var txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    clippedEvidence.push({ sel: selectorFor(el), label: 'text cut off', text: txt, w: Math.round(r.width), h: Math.round(r.height) });
    clippedBoxes.push({ x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'text cut off' });
  });

  /* ---- small text on a phone: only elements that own words and are painted ---- */
  var smallFonts = 0;
  if (phone) Array.prototype.slice.call(document.querySelectorAll('p,span,li,a,td'), 0, CAP).forEach(function (el: any) {
    if (!ownsWords(el)) return;
    var fs = parseFloat(getComputedStyle(el).fontSize || '16');
    if (!(fs && fs < 12)) return;
    var b = el.getBoundingClientRect();
    if (!(b.width > 0 && b.height > 0) || gone(el)) return;
    smallFonts++;
  });

  /* ---- the header as painted, on a phone ---- */
  var fragmentedHeader: any = null;
  if (phone) {
    //  the page's banner: the first visible header that is not an article's or a section's own
    var banner: any = Array.prototype.slice.call(document.querySelectorAll('header, [role="banner"]')).filter(function (h: any) {
      return !h.closest('article,section,aside') && !gone(h) && h.getBoundingClientRect().height > 2;
    })[0];
    if (banner) {
      var bannerBox = banner.getBoundingClientRect();
      //  painted where it stands: inside the banner's band and inside every clipping box around it
      var placed = function (el: any) {
        var b = el.getBoundingClientRect();
        if (b.width < 2 || b.height < 2 || gone(el)) return null;
        if (b.top >= bannerBox.bottom - 1 || b.bottom <= bannerBox.top + 1) return null;
        var mx = b.left + b.width / 2, my = b.top + b.height / 2, inScroller = false;
        for (var a: any = el.parentElement; a && a !== doc; a = a.parentElement) {
          var ac = getComputedStyle(a);
          if (/auto|scroll/.test(ac.overflowX)) inScroller = true;
          if (ac.overflowX !== 'visible' || ac.overflowY !== 'visible') {
            var ab = a.getBoundingClientRect();
            if (mx < ab.left || mx > ab.right || my < ab.top || my > ab.bottom) return null;
          }
          if (a === banner) break;
        }
        return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, inScroller: inScroller };
      };
      var items: any[] = [];
      Array.prototype.slice.call(banner.querySelectorAll('a,button,input,select,[role="button"],img,svg,h1,h2,h3,h4,h5,h6,span,p,strong,b,div,li,label'), 0, CAP).forEach(function (el: any) {
        var isCtl = el.matches('a,button,input,select,[role="button"],img,svg');
        if (!isCtl && !ownsWords(el)) return;
        var at = placed(el);
        if (at) items.push(at);
      });
      items.sort(function (a: any, b: any) { return a.top - b.top; });
      var bands: any[] = [];
      items.forEach(function (it: any) {
        var last = bands[bands.length - 1];
        if (last && it.top < last.bottom - 2) last.bottom = Math.max(last.bottom, it.bottom);
        else bands.push({ top: it.top, bottom: it.bottom });
      });
      var rows = bands.length;
      //  off the screen and not in a box the visitor can swipe
      var offscreenControls = Array.prototype.slice.call(banner.querySelectorAll('a[href],button,[role="button"]')).filter(function (control: any) {
        var at = placed(control);
        return !!at && !at.inScroller && (at.left < -2 || at.right > measuredVw + 2);
      }).length;
      //  «fragments into 1 rows» is not true: a header of one row is not fragmented
      if (rows >= 2 && (bannerBox.height > 144 || rows >= 3 || offscreenControls > 0)) {
        fragmentedHeader = {
          sel: selectorFor(banner), label: 'fragmented mobile header',
          w: Math.round(bannerBox.width), h: Math.round(bannerBox.height), rows: rows, offscreenControls: offscreenControls,
        };
      }
    }
  }

  /* ---- words and controls a visitor cannot bring on screen at all ---- */
  var lost: any[] = [];
  //  a clipping box a visitor is MEANT to see past by other means: «…», an animation, its own buttons, a slide track
  var managed = function (clip: any) {
    var cs = getComputedStyle(clip);
    if (cs.textOverflow === 'ellipsis') return 'ellipsis';
    if (clip.getAnimations && clip.getAnimations({ subtree: true }).length) return 'animated';
    var par = clip.parentElement;
    if (par && Array.prototype.some.call(par.querySelectorAll('button,[role="button"]'), function (bt: any) { return !clip.contains(bt); })) return 'moved by buttons beside it';
    for (var t: any = clip.firstElementChild; t; t = t.nextElementSibling) {
      var ts = getComputedStyle(t);
      if (!identity(ts.transform) || ts.transform !== 'none' && t.children.length >= 2) return 'slide track';
    }
    return '';
  };
  var cands: any[] = Array.prototype.slice.call(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role="button"],[role="tab"]'), 0, CAP);
  for (var j = 0; j < cands.length && lost.length < 8; j++) {
    var c = cands[j], cb = c.getBoundingClientRect();
    if (cb.width < 2 || cb.height < 2) continue;
    var cx2 = cb.left + cb.width / 2, why = '', by = '';
    for (var n2: any = c.parentElement; n2 && n2 !== body && n2 !== doc; n2 = n2.parentElement) {
      var s2 = getComputedStyle(n2);
      if (/auto|scroll/.test(s2.overflowX)) break;
      var clipsX = /hidden|clip/.test(s2.overflowX) || (s2.clipPath && s2.clipPath !== 'none');
      if (!clipsX) continue;
      var nb = n2.getBoundingClientRect();
      if (cx2 < nb.left - 1 || cx2 > nb.right + 1) { if (managed(n2)) { why = ''; break; } why = 'clipped'; by = selectorFor(n2); break; }
    }
    if (!why) {
      var fixedAnc = inFixed(c);
      var outR = cb.right > measuredVw + 2 && cx2 > measuredVw, outL = cb.left < -2 && cx2 < 0;
      if (outR || outL) {
        if (fixedAnc) { why = 'fixed'; by = selectorFor(fixedAnc); }
        else if (!pageCanPan) why = 'viewport does not pan';
        else if (outL !== rtl) why = 'before the start edge';
      }
    }
    if (!why || gone(c)) continue;
    var lsel = selectorFor(c);
    lost.push({ el: c, sel: lsel, nth: nthOf(c, lsel), text: (c.textContent || c.value || c.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30), how: why, by: by });
  }
  //  the visitor's own test: pan the page (if it pans), then ask what is under the centre
  var unreachable: any[] = [];
  lost.forEach(function (it: any) {
    var e2 = it.el, r2 = e2.getBoundingClientRect();
    jump(window.scrollX, window.scrollY + r2.top - vh / 2);
    if (pageCanPan) { r2 = e2.getBoundingClientRect(); jump(window.scrollX + (r2.left - (measuredVw - r2.width) / 2), window.scrollY); }
    r2 = e2.getBoundingClientRect();
    var ux = r2.left + r2.width / 2, uy = r2.top + r2.height / 2;
    var uhit = (ux >= 0 && ux <= measuredVw && uy >= 0 && uy <= vh) ? document.elementFromPoint(ux, uy) : null;
    if (!(uhit && (uhit === e2 || e2.contains(uhit)))) unreachable.push({ sel: it.sel, nth: it.nth, text: it.text, how: it.how, by: it.by });
    jump(sx0, sy0);
  });
  jump(sx0, sy0);

  return {
    requestedVw: vw, actualVw: actualVw,
    scrollW: scrollW, panPx: Math.round(panned), pageCanPan: pageCanPan, rtl: rtl,
    overflowX: panned > 2 && wideEvidence.length > 0, wide: wide, wideEvidence: wideEvidence, boxes: boxes,
    tiny: tiny, tinyBoxes: tinyBoxes, tinyNames: tinyNames, tinyEvidence: tinyEvidence, smallFonts: smallFonts,
    clipped: clipped, clippedEvidence: clippedEvidence, clippedBoxes: clippedBoxes,
    unreachable: unreachable,
    fragmentedHeader: fragmentedHeader,
    hasViewportMeta: !!document.querySelector('meta[name="viewport"]'),
  };
}

/**
 * Content must influence composition, not merely copy and colour. An image
 * workflow rendered as the same narrow records form plus thumbnail rows is a
 * measurable mismatch: the image is the primary object, so the interface must
 * expose an image-led workspace and gallery semantics even while it is empty.
 */
function measureContentComposition() {
  var imagePicker = document.querySelector('input[type="file"][accept*="image"]');
  var imageLedWorkspace = document.querySelector('.media-workspace,[data-composition="gallery"],[data-layout="media-studio"]');
  var gallery = document.querySelector('.media-gallery,[data-gallery-contract="media"],[role="grid"][data-content="media"],main [aria-label*="gallery" i]');
  return {
    hasImageWorkflow: !!imagePicker,
    hasImageLedWorkspace: !!imageLedWorkspace,
    hasGalleryContract: !!gallery,
    panelCount: document.querySelectorAll('.panel,.card,[class*="card"]').length,
  };
}

/** How long the inspection may take when the caller names no deadline (app-audit names this one). */
export const UI_INSPECTION_BUDGET_MS = 30_000;

/** Why a visitor cannot reach a control, in his language. */
const REACH_AR: Record<string, string> = {
    clipped: 'مقصوص داخل صندوقه',
    fixed: 'داخل شريط ثابت يخرج عن الشاشة',
    'viewport does not pan': 'والصفحة لا تتحرك جانبياً',
    'before the start edge': 'قبل حافة البداية',
};

/**
 *  THE PAGE'S OWN ADDRESS, READ IN THE PAGE (design v3 §3.2, R2).
 *
 *  Measured: right after a refused goto `page.url()` still names the app and
 *  an evaluate throws «Execution context was destroyed»; 600 ms later both say
 *  `chrome-error://chromewebdata/`. Every line measured on Chrome's own error
 *  page was a line about a page nobody built.
 */
async function pageHref(page: any): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return String(await evalInPage(page, function () { return location.href; }) || '');
        } catch (error: any) {
            if (!/Execution context was destroyed|navigat/i.test(String(error?.message || error))) return '';
            await Promise.resolve().then(() => page.waitForTimeout(300)).catch(() => { });
        }
    }
    return '';
}

/**
 * Look at the page the way a reviewer looks at it: at the colours, at the
 * structure, and at the widths it was not designed on — and tell what is
 * true (design v3: told only; `no_viewport_meta` alone refuses).
 *
 * `restore` asks for the viewport to be put back when the walk is over — on a
 * borrowed panel page that is the user's own browser and it MUST come back
 * unchanged; it is put back in a `finally`, whatever happened. `deadline` is a
 * time (ms since the epoch): every step checks it before it starts, the lines
 * found before it are kept, and the status says what was not measured.
 */
export async function inspectUi(
    page: any,
    opts?: { eyes?: AuditEyes; restore?: { width: number; height: number }; onViewport?: (w: number, h: number) => void; deadline?: number },
): Promise<UiInspection> {
    const findings: BehaviourFinding[] = [];
    const metrics: Record<string, any> = {};
    const eyes = opts?.eyes;
    const startedAt = Date.now();
    const deadline = Number(opts?.deadline) > 0 ? Number(opts?.deadline) : startedAt + UI_INSPECTION_BUDGET_MS;
    const over = () => Date.now() > deadline;
    let status = 'complete';
    const partial = (why: string) => { if (status === 'complete') status = `partial: ${why}`; };

    // Capture URL and viewport for QA evidence persistence (CRITICAL-REAL-JOE-UI-001).
    // Playwright's page.url() is a string, not a promise: a `.catch` on it threw,
    // and that throw silenced this whole inspection in every real walk (v3 §1).
    const pageUrl = await Promise.resolve().then(() => page.url()).then((u: unknown) => String(u || 'unknown'), () => 'unknown');

    //  R2: the page is the app — never Chrome's own error page.
    const href = await pageHref(page);
    if (/^chrome-error:/i.test(href)) {
        return { findings: [], metrics: { url: pageUrl, href }, status: 'skipped: the browser shows its own error page' };
    }

    /**
     * Enrich a finding with URL and viewport metadata for QA evidence persistence.
     * This addresses CRITICAL-REAL-JOE-UI-001: QA evidence persistence gap.
     */
    function enrichFinding(finding: BehaviourFinding, viewport?: { name: string; w: number; h: number; requested: number; actual: number }): BehaviourFinding {
        const enriched = { ...finding } as BehaviourFinding;
        const baseEvidence = finding.evidence;
        const viewportMetadata = viewport ? {
            name: viewport.name,
            requestedWidth: viewport.requested,
            actualWidth: viewport.actual,
            height: viewport.h
        } : undefined;

        if (Array.isArray(baseEvidence)) {
            enriched.evidence = baseEvidence.map((item: unknown) => {
                if (item && typeof item === 'object') {
                    return { ...(item as Record<string, any>), url: pageUrl, viewport: viewportMetadata } as any;
                }
                return { url: pageUrl, viewport: viewportMetadata, ...(item as Record<string, any>) } as any;
            }) as any;
        } else if (baseEvidence && typeof baseEvidence === 'object') {
            enriched.evidence = {
                ...(baseEvidence as Record<string, any>),
                url: pageUrl,
                viewport: viewportMetadata
            } as any;
        } else {
            enriched.evidence = [{
                url: pageUrl,
                viewport: viewportMetadata
            }] as any;
        }
        return enriched;
    }

    let availableWidth = 1280;
    let openingViewport = { width: 1280, height: 900 };
    let openingScroll = { x: 0, y: 0 };
    try {
        const initial = await evalInPage(page, function () { return { width: window.innerWidth, height: window.innerHeight, x: window.scrollX, y: window.scrollY }; });
        if (Number(initial?.width) > 0) {
            availableWidth = Number(initial.width);
            openingViewport = { width: Number(initial.width), height: Math.max(240, Number(initial.height || 900)) };
        }
        openingScroll = { x: Number(initial?.x) || 0, y: Number(initial?.y) || 0 };
    } catch { /* use the full desktop matrix when the opening width cannot be observed */ }

    try {
        /* ---- structure ----------------------------------------------------- */
        if (!over()) try {
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
                findings.push(enrichFinding({ code: `a11y_${i.code}`, severity: i.severity, ar: `${t.ar}${n}${s}`, en: `${t.en}${n}${s}`, hint: t.hint }, undefined));
            }
        } catch { /* structure is one lens, never the whole check */ }

        /* ---- request-shaped composition ---------------------------------- */
        if (!over()) try {
            const composition: any = await evalInPage(page, measureContentComposition);
            metrics.composition = composition;
            if (composition.hasImageWorkflow && (!composition.hasImageLedWorkspace || !composition.hasGalleryContract)) {
                findings.push(enrichFinding({
                    code: 'generic_image_composition', severity: 'major',
                    ar: 'واجهة الصور تستخدم تركيب السجلات العام بدل مساحة بصرية يقودها المعرض — تغيير الألوان وحده لا يصنع تصميماً جديداً',
                    en: 'The image workflow uses the generic records composition instead of a gallery-led visual workspace — changing colours alone is not a new design',
                    hint: 'use a media-specific editor/gallery composition and keep images as the primary visual hierarchy',
                    evidence: [{ hasImageLedWorkspace: composition.hasImageLedWorkspace, hasGalleryContract: composition.hasGalleryContract, panelCount: composition.panelCount }],
                }, undefined));
            }
        } catch { /* composition is a quality lens, not permission to lose the rest */ }

        /* ---- widths (and colour at the desktop and the phone) ------------- */
        const perWidth: Record<string, any> = {};
        let mobileTiny = 0, mobileFonts = 0, hasViewportMeta = true;
        let fragmentedHeader: any = null;
        let clippedAt = '', clippedWidth = 0, clippedCount = 0, clippedEvidence: any[] = [];
        let mobileTinyNames: string[] = [];
        let mobileTinyEvidence: any[] = [];
        const overflowAtWidth: Array<{ w: number; r: any }> = [];
        const unreachableAtWidth: Array<{ w: number; items: any[] }> = [];
        const colour = { checked: 0, skipped: 0, disabled: 0, samples: [] as ContrastSample[] };
        const viewportFailures: Array<{ requested: number; actual: number }> = [];
        const measuredViewports: string[] = [];
        const viewports = effectiveViewports(availableWidth);
        for (const vp of viewports) {
            if (over()) { partial(`time ran out before ${vp.w}px`); break; }
            try {
                const measured = await measureAtViewport(page, vp.w, vp.h, async actual => {
                    opts?.onViewport?.(Number(actual.width), Number(actual.height));
                    await page.waitForTimeout(420);
                    await eyes?.say(page, `فحص العرض ${vp.w}px — ${vp.ar}`);
                    if (over()) return { actual, responsive: null as any, colour: null as any };
                    const out: any = { actual, responsive: await evalInPage(page, measureResponsive, vp.w), colour: null };
                    const applied = Math.abs(Number(out.responsive?.actualVw || 0) - vp.w) <= 2;
                    //  Colour at the desktop and at the phone: a pale nav that only a phone shows is a phone's problem.
                    if (vp.name !== 'tablet' && applied && !over()) {
                        try { out.colour = await colourAtThisWidth(page, vp.w, deadline); } catch { /* colour is one lens */ }
                    }
                    return out;
                });
                const r: any = measured.responsive;
                if (!r) { partial(`time ran out before ${vp.w}px`); break; }
                const actualVw = Number(r.actualVw || 0);
                if (!actualVw || Math.abs(actualVw - vp.w) > 2) {
                    viewportFailures.push({ requested: vp.w, actual: actualVw });
                    perWidth[vp.name] = { requested: vp.w, actual: actualVw, instrumentationFailed: true };
                    partial(`the browser would not take ${vp.w}px`);
                    continue;
                }
                measuredViewports.push(`${vp.w}x${vp.h}`);
                perWidth[vp.name] = {
                    requested: vp.w, actual: actualVw, overflowX: r.overflowX, panPx: r.panPx, wide: r.wide, tiny: r.tiny, smallFonts: r.smallFonts,
                    unreachable: Array.isArray(r.unreachable) ? r.unreachable.length : 0, clipped: r.clipped || 0,
                };
                hasViewportMeta = hasViewportMeta && !!r.hasViewportMeta;
                if (r.overflowX) overflowAtWidth.push({ w: vp.w, r });
                if (Array.isArray(r.unreachable) && r.unreachable.length) unreachableAtWidth.push({ w: vp.w, items: r.unreachable.slice(0, 8) });
                //  The NARROWEST width that cuts text is the one worth naming:
                //  it is where he will see it first. The widths run 1280 → 390,
                //  so a narrower width that cuts too takes the place.
                if (r.clipped && clippedAt && vp.w < clippedWidth) clippedAt = '';
                if (r.clipped && !clippedAt) {
                    clippedAt = `${vp.w}px`;
                    clippedWidth = vp.w;
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
                const painted = measured.colour;
                if (painted) {
                    colour.checked += painted.checked;
                    colour.skipped += painted.skipped;
                    colour.disabled += painted.disabled;
                    colour.samples.push(...painted.samples);
                    perWidth[vp.name].contrastJudged = painted.samples.length;
                    perWidth[vp.name].contrastUnmeasured = painted.skipped;
                    perWidth[vp.name].contrastUnmeasuredWhy = painted.why;
                    if (painted.cut === 'time') partial(`time ran out measuring colour at ${vp.w}px`);
                    if (painted.cut === 'width') partial(`the browser would not keep ${vp.w}px while photographing`);
                    const here = judgeContrast(painted.samples);
                    if (here.length) {
                        await eyes?.mark(page, here.map((f: any) => ({ x: f.x, y: f.y, width: f.width, height: f.height, label: `${f.ratio}:1` })), {
                            note: `تباين ضعيف: ${here.length} عنصر`, tone: 'warn', holdMs: 1200,
                        });
                    }
                }
            } catch { /* one width failing must not lose the others */ }
        }
        //  Only what was actually measured. The restore width used to be added
        //  here, which is how a count of two became a report of three.
        metrics.viewports = measuredViewports;
        metrics.perWidth = perWidth;

        /* ---- colours: the 1280 and 390 samples, judged together ----------- */
        const raw: any = colour;
        //  The page reports what it SAW and the paint what is ON the screen; the
        //  verdict is reached here, where a published contrast value can check it.
        const c = { checked: raw.checked, skipped: raw.skipped, fails: judgeContrast(raw.samples) };
        metrics.contrastChecked = c.checked;
        metrics.contrastUnmeasurable = c.skipped;
        metrics.contrastDisabledSkipped = raw.disabled;
        metrics.contrastFails = c.fails.length;
        if (c.fails.length) {
            metrics.contrastWorst = c.fails.map((f: any) => `${f.ratio}:1 «${f.text}»`).slice(0, 3);
            findings.push(enrichFinding({
                code: 'low_contrast', severity: contrastSeverity(c.fails),
                ar: `${c.fails.length} نص لا يجتاز تباين WCAG AA (الأسوأ ${c.fails[0].ratio}:1 والمطلوب ${c.fails[0].need}:1): «${c.fails[0].text}»`,
                en: `${c.fails.length} text element(s) fail WCAG AA contrast (worst ${c.fails[0].ratio}:1, needs ${c.fails[0].need}:1): "${c.fails[0].text}"`,
                hint: 'darken the text or lighten its background until the ratio clears 4.5:1',
                // The exact selector and the PAINTED colour pair: what the builder is advised to change.
                evidence: c.fails.slice(0, 24),
            }, undefined));
        }

        if (!hasViewportMeta) {
            findings.push(enrichFinding({
                code: 'no_viewport_meta', severity: 'critical',
                ar: 'لا يوجد وسم viewport — الصفحة لن تتكيّف مع الجوّال إطلاقاً',
                en: 'No <meta name="viewport"> — the page cannot adapt to a phone at all',
                hint: '<meta name="viewport" content="width=device-width, initial-scale=1">',
            }, undefined));
        }
        if (viewportFailures.length) {
            //  The instrument, not the app: app-audit turns this into the inspection's status (v3 §3.2).
            const detail = viewportFailures.map(v => `${v.requested}px->${v.actual || '?'}px`).join(', ');
            findings.push(enrichFinding({
                code: 'viewport_emulation_failed', severity: 'major',
                ar: `تعذر تطبيق مقاسات الاختبار فعلياً (${detail}) — لا أنسب نتائج الهاتف إلى التطبيق قبل إصلاح أداة القياس`,
                en: `Viewport emulation did not apply (${detail}) — mobile findings were not attributed to the app`,
                hint: 'repair the browser viewport instrumentation, then rerun the same responsive checks',
                evidence: viewportFailures,
            }, undefined));
        }
        //  The NARROWEST width where the page really pans and words come on screen (not «the first width measured»).
        const overflow = overflowAtWidth.slice().sort((a, b) => a.w - b.w)[0];
        if (overflow) {
            const r = overflow.r;
            const overflowAt = `${overflow.w}px${Array.isArray(r.wide) && r.wide.length ? ` — ${r.wide.join('، ')}` : ''}`;
            if (r.boxes?.length) await eyes?.mark(page, r.boxes, { note: `تمرير أفقي على ${overflow.w}px`, holdMs: 1200 });
            findings.push(enrichFinding({
                code: 'mobile_overflow', severity: 'major',
                ar: `تمرير أفقي على ${overflowAt} — المحتوى يخرج خارج الشاشة`,
                en: `Horizontal scrolling at ${overflowAt} — content spills off the screen`,
                hint: 'give the offending element max-width:100% and let the grid wrap',
                evidence: Array.isArray(r.wideEvidence) ? r.wideEvidence.slice(0, 8) : [],
            }, undefined));
        }
        const lost = unreachableAtWidth.slice().sort((a, b) => a.w - b.w)[0];
        if (lost) {
            const u = lost.items;
            findings.push(enrichFinding({
                code: 'content_unreachable', severity: 'major',
                ar: `على عرض ${lost.w}px لا يصل الزائر إلى ${u.length} عنصر: «${u[0].text}» — ${REACH_AR[u[0].how] || u[0].how}`,
                en: `At ${lost.w}px a visitor cannot reach ${u.length} element(s): "${u[0].text}" — ${u[0].how}`,
                hint: 'let the box wrap or scroll, or give the visitor another way to the control (a menu, a scrollable row)',
                evidence: u,
            } as any, undefined));
        }
        if (clippedCount > 0) {
            findings.push(enrichFinding({
                code: 'text_clipped', severity: 'major',
                ar: `${clippedCount} عنصر نصّه مقصوص داخل صندوقه على عرض ${clippedAt} — الكلام موجود في الصفحة ولا يُرى${clippedEvidence[0]?.text ? `: «${clippedEvidence[0].text}»` : ''}`,
                en: `${clippedCount} element(s) have their text cut off by their own box at ${clippedAt} — the words are in the page and cannot be read${clippedEvidence[0]?.text ? `: "${clippedEvidence[0].text}"` : ''}`,
                hint: 'let the box grow, wrap the text, or add text-overflow: ellipsis so the cut is at least visible',
                evidence: clippedEvidence,
            } as any, undefined));
        }
        if (mobileTiny > 0) {
            findings.push(enrichFinding({
                code: 'mobile_tap_targets', severity: mobileTiny >= 6 ? 'major' : 'minor',
                // Named, not counted: «6 targets» is a number nobody can act on.
                ar: `${mobileTiny} هدف لمس أصغر من ${TAP_TARGET_MIN_PX}px على الجوّال — يصعب ضغطه بالإصبع${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join('، ')}` : ''}`,
                en: `${mobileTiny} tap target(s) under ${TAP_TARGET_MIN_PX}px on a phone — hard to hit with a thumb${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join(', ')}` : ''}`,
                hint: 'min-height:44px and min-width:44px on buttons and nav links',
                evidence: mobileTinyEvidence,
            }, undefined));
        }
        if (mobileFonts > 0) {
            findings.push(enrichFinding({
                code: 'mobile_small_text', severity: 'minor',
                ar: `${mobileFonts} عنصر بخط أصغر من 12px على الجوّال`,
                en: `${mobileFonts} element(s) render below 12px on a phone`,
                hint: 'never go under 12px for body copy',
            }, undefined));
        }
        if (fragmentedHeader) {
            findings.push(enrichFinding({
                code: 'mobile_header_fragmented', severity: 'major',
                ar: `رأس الصفحة على الجوّال متشظٍ إلى ${fragmentedHeader.rows} صفوف وارتفاعه ${fragmentedHeader.h}px، وعناصره الخارجة عن العرض: ${fragmentedHeader.offscreenControls || 0}`,
                en: `The mobile header fragments into ${fragmentedHeader.rows} rows, is ${fragmentedHeader.h}px tall, and has ${fragmentedHeader.offscreenControls || 0} off-screen control(s)`,
                hint: 'keep brand and utility action on one row, and put navigation in one compact scrollable row',
                evidence: [fragmentedHeader],
            }, undefined));
        }
        metrics.mobileTinyNames = mobileTinyNames;
    } catch (error: any) {
        status = `failed: ${String(error?.message || error).slice(0, 160)}`;
    } finally {
        //  Put back whatever happened — the caller's page, at its own size and scroll.
        if (opts?.restore) {
            try {
                const actual = await applyViewportSize(page, openingViewport.width, openingViewport.height);
                opts?.onViewport?.(Number(actual.width), Number(actual.height));
                await page.waitForTimeout(250);
            } catch { /* the caller owns the page; a failed restore is reported by it */ }
        }
        await evalInPage(page, function (p: any) { window.scrollTo({ left: Number(p && p.x) || 0, top: Number(p && p.y) || 0, behavior: 'instant' as any }); }, openingScroll).catch(() => { });
    }
    metrics.uiFindings = findings.length;
    metrics.ms = Date.now() - startedAt;
    metrics.status = status;
    return { findings, metrics, status };
}

/** Every box the inspection wants outlined — used by the proofs to count them. */
export type { EyeBox };
