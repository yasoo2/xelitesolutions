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
    { name: 'mobile', ar: 'جوّال', w: 390, h: 844 },
    { name: 'tablet', ar: 'لوحي', w: 820, h: 1180 },
    { name: 'desktop', ar: 'سطح المكتب', w: 1280, h: 900 },
] as const;

/* ---------------------------------------------------------------- contrast */

function measureContrast() {
  var parse = function (c: any): any[] {
    var m = String(c || '').match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 0];
    var p = m[1].split(',').map(function (s: string) { return parseFloat(s); });
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
    var node = el;
    while (node) {
      var st = getComputedStyle(node);
      if (st.backgroundImage && st.backgroundImage !== 'none') return null;
      var bg = parse(st.backgroundColor);
      if (bg[3] > 0) return bg;
      node = node.parentElement;
    }
    return [255, 255, 255, 1];
  };
  var visible = function (el: any) {
    var r = el.getBoundingClientRect(), st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && parseFloat(st.opacity) > 0.1;
  };
  var seen: any = {}, fails: any[] = [], checked = 0, skipped = 0;
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
    var rt = ratio(fg, bgc);
    var size = parseFloat(st.fontSize) || 16, bold = (parseInt(st.fontWeight, 10) || 400) >= 700;
    var min = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (rt < min) {
      var key = txt.slice(0, 30) + rt.toFixed(2);
      if (!seen[key]) {
        seen[key] = 1;
        var r = el.getBoundingClientRect();
        fails.push({
          text: txt.slice(0, 40), ratio: Math.round(rt * 100) / 100, need: min,
          x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height),
        });
      }
    }
    if (checked > 400) break;
  }
  return { checked: checked, skipped: skipped, fails: fails.slice(0, 12) };
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
  var unlabelled: any[] = [];
  q('input,select,textarea').forEach(function (f: any) {
    var t = (f.getAttribute('type') || '').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'image' || t === 'reset') return;
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.getAttribute('title') || f.getAttribute('placeholder')) return;
    if (f.id && document.querySelector('label[for="' + CSS.escape(f.id) + '"]')) return;
    if (f.closest('label')) return;
    var r = f.getBoundingClientRect();
    if (!(r.width > 2 && r.height > 2)) return;
    if (unlabelled.length < 8) { unlabelled.push({ name: f.getAttribute('name') || f.tagName.toLowerCase(), x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height), label: 'no label' }); }
  });
  if (unlabelled.length) issues.push({ code: 'inputs_without_labels', severity: 'major', count: unlabelled.length, sample: unlabelled[0].name });
  return { issues: issues, hasNav: hasNav, focusables: q('a[href], button, input, select, textarea, [tabindex]').length, altBoxes: boxes, labelBoxes: unlabelled };
}

/* -------------------------------------------------------------- responsive */

function measureResponsive(vw: number) {
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
    if (r.width > vw + 4 && r.height > 0 && wide.length < 6) {
      var cls = (el.getAttribute('class') || '').split(/\s+/).slice(0, 2).filter(Boolean).join('.');
      wide.push(cls ? el.tagName.toLowerCase() + '.' + cls : el.tagName.toLowerCase());
      wideEvidence.push({ sel: selectorFor(el), label: 'wider than the screen', w: Math.round(r.width), h: Math.round(r.height) });
      boxes.push({ x: Math.max(0, Math.round(r.left)), y: Math.round(r.top), width: Math.min(vw, Math.round(r.width)), height: Math.round(r.height), label: 'wider than the screen' });
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
  var smallFonts = 0;
  Array.prototype.slice.call(document.querySelectorAll('p,span,li,a,td'), 0, 1500).forEach(function (el: any) {
    var fs = parseFloat(getComputedStyle(el).fontSize || '16');
    if (fs && fs < 12) smallFonts++;
  });
  return {
    scrollW: scrollW, overflowX: scrollW > vw + 2, wide: wide, wideEvidence: wideEvidence, boxes: boxes,
    tiny: tiny, tinyBoxes: tinyBoxes, tinyNames: tinyNames, tinyEvidence: tinyEvidence, smallFonts: smallFonts,
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
    opts?: { eyes?: AuditEyes; restore?: { width: number; height: number }; onViewport?: (w: number, h: number) => void },
): Promise<UiInspection> {
    const findings: BehaviourFinding[] = [];
    const metrics: Record<string, any> = {};
    const eyes = opts?.eyes;

    /* ---- colours ------------------------------------------------------- */
    try {
        const c: any = await evalInPage(page, measureContrast);
        metrics.contrastChecked = c.checked;
        metrics.contrastUnmeasurable = c.skipped;
        metrics.contrastFails = c.fails.length;
        if (c.fails.length) {
            metrics.contrastWorst = c.fails.map((f: any) => `${f.ratio}:1 «${f.text}»`).slice(0, 3);
            await eyes?.mark(page, c.fails.map((f: any) => ({ x: f.x, y: f.y, width: f.width, height: f.height, label: `${f.ratio}:1` })), {
                note: `تباين ضعيف: ${c.fails.length} عنصر`, tone: 'warn', holdMs: 1200,
            });
            findings.push({
                code: 'low_contrast', severity: c.fails.length >= 4 ? 'major' : 'minor',
                ar: `${c.fails.length} نص لا يجتاز تباين WCAG AA (الأسوأ ${c.fails[0].ratio}:1 والمطلوب ${c.fails[0].need}:1): «${c.fails[0].text}»`,
                en: `${c.fails.length} text element(s) fail WCAG AA contrast (worst ${c.fails[0].ratio}:1, needs ${c.fails[0].need}:1): "${c.fails[0].text}"`,
                hint: 'darken the text or lighten its background until the ratio clears 4.5:1',
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
    let mobileTinyNames: string[] = [];
    let overflowEvidence: any[] = [];
    let mobileTinyEvidence: any[] = [];
    for (const vp of VIEWPORTS) {
        try {
            await page.setViewportSize({ width: vp.w, height: vp.h });
            opts?.onViewport?.(vp.w, vp.h);
            await page.waitForTimeout(420);
            await eyes?.say(page, `فحص العرض ${vp.w}px — ${vp.ar}`);
            const r: any = await evalInPage(page, measureResponsive, vp.w);
            perWidth[vp.name] = { overflowX: r.overflowX, wide: r.wide, tiny: r.tiny, smallFonts: r.smallFonts };
            hasViewportMeta = hasViewportMeta && !!r.hasViewportMeta;
            if (r.overflowX && !overflowAt) {
                overflowAt = `${vp.w}px${r.wide.length ? ` — ${r.wide.join('، ')}` : ''}`;
                overflowEvidence = Array.isArray(r.wideEvidence) ? r.wideEvidence.slice(0, 8) : [];
                await eyes?.mark(page, r.boxes, { note: `تمرير أفقي على ${vp.w}px`, holdMs: 1200 });
            }
            if (vp.name === 'mobile') {
                mobileTiny = r.tiny; mobileFonts = r.smallFonts; mobileTinyNames = r.tinyNames || [];
                mobileTinyEvidence = Array.isArray(r.tinyEvidence) ? r.tinyEvidence.slice(0, 8) : [];
                if (r.tinyBoxes?.length) await eyes?.mark(page, r.tinyBoxes, { note: 'أهداف لمس أصغر من 44px', tone: 'warn', holdMs: 1000 });
            }
        } catch { /* one width failing must not lose the others */ }
    }
    //  Only what was actually measured. The restore width used to be added
    //  here, which is how a count of two became a report of three.
    metrics.viewports = VIEWPORTS.map(v => `${v.w}x${v.h}`);
    metrics.perWidth = perWidth;
    if (opts?.restore) {
        try {
            await page.setViewportSize(opts.restore);
            opts?.onViewport?.(opts.restore.width, opts.restore.height);
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
    if (overflowAt) {
        findings.push({
            code: 'mobile_overflow', severity: 'major',
            ar: `تمرير أفقي على ${overflowAt} — المحتوى يخرج خارج الشاشة`,
            en: `Horizontal scrolling at ${overflowAt} — content spills off the screen`,
            hint: 'give the offending element max-width:100% and let the grid wrap',
            evidence: overflowEvidence,
        });
    }
    if (mobileTiny > 0) {
        findings.push({
            code: 'mobile_tap_targets', severity: mobileTiny >= 6 ? 'major' : 'minor',
            // Named, not counted: «6 targets» is a number nobody can act on.
            ar: `${mobileTiny} هدف لمس أصغر من 40px على الجوّال — يصعب ضغطه بالإصبع${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join('، ')}` : ''}`,
            en: `${mobileTiny} tap target(s) under 40px on a phone — hard to hit with a thumb${mobileTinyNames.length ? `: ${mobileTinyNames.slice(0, 3).join(', ')}` : ''}`,
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
    metrics.mobileTinyNames = mobileTinyNames;
    metrics.uiFindings = findings.length;
    return { findings, metrics };
}

/** Every box the inspection wants outlined — used by the proofs to count them. */
export type { EyeBox };
