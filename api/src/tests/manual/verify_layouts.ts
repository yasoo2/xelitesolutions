/**
 * Render EVERY composition and measure it.
 *
 *   npm run verify:layouts
 *
 * Two new archetypes were added because every landing page Joe built came out
 * as the same arrangement — «لم يستخدم التصاميم العالمية». Adding compositions
 * is the easy half; the hard half is that a new arrangement is a new set of
 * surfaces, and a surface is where text stops being readable.
 *
 * `contrast` in particular inverts the page: its hero and its bands are painted
 * with var(--text) and write with var(--bg). Everything the kit knows about
 * buttons, ledes and eyebrows was written for the other way round, so each of
 * those lands on a surface it was never checked against — and in DARK mode the
 * whole inversion flips again. That is four combinations per control, which is
 * exactly the kind of thing a person does not check by reading and a browser
 * settles in a second.
 *
 * What is measured, for all seven, at desktop and phone, in light and dark:
 *   - every visible text node clears WCAG AA against what is actually behind it
 *   - the page does not scroll sideways
 *   - nothing overlaps anything it should not (the overlap panel is deliberate,
 *     so it is checked for STAYING inside the viewport rather than for existing)
 *   - no JavaScript errors
 *
 * Needs Chromium. Set BROWSER_EXECUTABLE_PATH if it is not on the default path.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

import {
    layoutCss, primitivesCss, iconSprite, typographyCss, pickTypePair, surfacePairingCss,
    ownedSurfaces, type Archetype,
} from '../../core/design/layouts';
import { chromeCss } from '../../core/design/chrome';
import { siteNav, siteNavCss } from '../../core/design/site-plan';
import { logoCss } from '../../core/design/logo';
import { bidiCss } from '../../core/design/language';
import { themeCss, lightOverrideCss, revealCss } from '../../core/design/theme';
import {
    uiKitCss, buildPalette, paletteCss, darkTokenBlock, lightTokenBlock,
} from '../../core/design/design-system';
import { auditVisually } from '../../core/quality/visual-audit';
import { reviewHtml } from '../../core/quality/html-qa';

const OUT = fs.mkdtempSync(path.join(os.tmpdir(), 'joe-layouts-'));
const ARCHETYPES: Archetype[] = ['split', 'centered', 'bento', 'editorial', 'showcase', 'overlap', 'contrast'];

const palette = buildPalette('شركة استشارات هندسية');
const typePair = pickTypePair('شركة استشارات هندسية');

/** A body that exercises the classes each archetype actually promises. */
function bodyFor(a: Archetype): string {
    const actions = `<div class="hero-actions">
    <a class="btn" href="#c">ابدأ الآن</a><a class="btn btn-ghost" href="#a">اعرف المزيد</a></div>`;
    const cards = (n: number) => Array.from({ length: n }, (_, i) =>
        `<div class="card"><h3>خدمة ${i + 1}</h3><p>وصف قصير للخدمة التي نقدمها للعملاء.</p></div>`).join('\n');

    const hero =
        a === 'overlap' ? `<section class="hero">
  <div class="wrap"><h1>نصمّم ما يبقى</h1><p class="lede">استشارات هندسية للمشاريع الكبيرة.</p></div>
  <div class="wrap hero-media"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='800'%3E%3Crect width='1600' height='800' fill='%23888'/%3E%3C/svg%3E" alt="مشروع"></div>
  <div class="wrap"><div class="hero-panel"><h2>لماذا نحن</h2><p>خبرة عشرين عامًا في التنفيذ.</p>${actions}</div></div>
</section>`
            : a === 'showcase' ? `<section class="hero">
  <div class="hero-bg"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1600' height='800'%3E%3Crect width='1600' height='800' fill='%23555'/%3E%3C/svg%3E" alt="خلفية"></div>
  <div class="wrap hero-copy"><h1>نصمّم ما يبقى</h1><p class="lede">استشارات هندسية.</p>${actions}</div>
</section>`
                : `<section class="hero aura"><div class="wrap${a === 'split' ? ' hero-split' : ''}">
  <div><h1>نصمّم ما يبقى</h1><p class="lede">استشارات هندسية للمشاريع الكبيرة.</p>${actions}</div>
  ${a === 'split' ? `<div class="hero-media"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='900'%3E%3Crect width='1200' height='900' fill='%23888'/%3E%3C/svg%3E" alt="مشروع"></div>` : ''}
</div></section>`;

    const shape =
        a === 'bento' ? `<div class="bento">${cards(6)}</div>`
            : a === 'editorial' ? `<div class="prose"><p>فقرة طويلة تقرأ في عمود مقاس.</p>
  <figure><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='700'%3E%3Crect width='1200' height='700' fill='%23999'/%3E%3C/svg%3E" alt="صورة"><figcaption>تعليق على الصورة.</figcaption></figure></div>`
                : a === 'showcase' ? `<div class="showcase-grid">${cards(4)}</div>`
                    : a === 'overlap' ? `<div class="stagger">${cards(4)}</div>`
                        : `<div class="grid-3">${cards(3)}</div>`;

    /**
     * Joe's OWN shared site header, not a hand-written stand-in.
     *
     * The current-page link sits on a 12% brand wash and was the one thing this
     * file did not render — so when the audit started parsing color-mix() and
     * began treating that wash as an opaque surface, nothing here noticed and
     * the end-to-end run reported every page of every site at 1.6:1. A harness
     * that renders a simplified header is checking a page nobody ships.
     */
    return siteNav(
        [{ file: 'index.html', kind: 'landing', title: 'الرئيسية', purpose: '' },
         { file: 'about.html', kind: 'landing', title: 'من نحن', purpose: '' },
         { file: 'contact.html', kind: 'landing', title: 'تواصل', purpose: '' }],
        'index.html', 'الرؤية', { isArabic: true, hue: palette.hue },
    ) + `
<main>
${hero}
<section class="section" id="a"><div class="wrap">
  <div class="section-head"><p class="eyebrow">خدماتنا</p><h2>ما نقدّمه</h2>
    <p class="lede">وصف موجز لما تقدّمه الشركة لعملائها.</p></div>
  ${shape}
</div></section>
<section class="section band"><div class="wrap">
  <div class="section-head"><p class="eyebrow">بالأرقام</p><h2>أثرنا</h2>
    <p class="lede">أرقام حقيقية من مشاريع منفّذة.</p></div>
  <div class="grid-3">
    <div class="stat"><span class="stat-value">٢٤٠</span><span class="stat-label">مشروع</span></div>
    <div class="stat"><span class="stat-value">٢٠</span><span class="stat-label">سنة</span></div>
    <div class="stat"><span class="stat-value">٩٨٪</span><span class="stat-label">رضا</span></div>
  </div>
  <div class="hero-actions"><a class="btn" href="#c">تواصل</a>
    <a class="btn btn-ghost" href="#a">التفاصيل</a></div>
</div></section>
<section class="section" id="c"><div class="wrap"><h2>تواصل معنا</h2>
  <p>نص ختامي قصير.</p></div></section>
</main>`;
}

function pageFor(a: Archetype): string {
    return `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${a}</title>
<style>${uiKitCss()}
${typographyCss(typePair)}
${layoutCss(a)}
${chromeCss()}
${siteNavCss()}
${logoCss()}
${themeCss(darkTokenBlock(palette))}
${lightOverrideCss(lightTokenBlock(palette))}
${revealCss()}
${bidiCss()}
${primitivesCss()}
${paletteCss(palette)}
/* THE MODEL'S OWN STYLESHEET comes last, because the base layer is injected at
   the top of the block so anything it wrote still wins. These two rules are what
   a weak model actually writes, and they are what took a contrast hero to
   1.0:1 — white text on a white gradient, a blank screen — and any composition's
   band to 1.04:1. Rendering the archetypes without them was rendering a page
   nobody ships. */
${MODEL_OVERRIDES}
${surfacePairingCss(a)}</style></head>
<body>${iconSprite()}${bodyFor(a)}</body></html>`;
}

/** What a weak model writes over Joe's own surfaces, verbatim in shape. */
const MODEL_OVERRIDES = `
.hero{background:linear-gradient(135deg,#f8fafc,#eef2ff)}
.band{background:#f1f5f9}
section.band{padding-block:72px}
`.trim();

/**
 * Contrast of every visible text node against what is ACTUALLY painted behind
 * it — walking up for the first non-transparent ancestor, because a card on a
 * band inherits its background from neither.
 */
const CONTRAST_PROBE = `(function () {
  /* [r,g,b,a] in 0-255 channels, or null when the string names no colour.
     color(srgb …) channels are 0-1 — reading them as 0-255 turns white into
     black — and Chromium resolves every color-mix() to that form, which this
     kit uses constantly. Skipping them, which this function used to do, is not
     neutral either: it quietly reports a pass. */
  function toRgb(c) {
    var s = String(c);
    var srgb = s.match(/color\\(\\s*srgb\\s+([^)]+)\\)/i);
    if (srgb) {
      var q = srgb[1].replace('/', ' ').split(/\\s+/).filter(Boolean).map(parseFloat);
      return [(q[0] || 0) * 255, (q[1] || 0) * 255, (q[2] || 0) * 255, q[3] === undefined ? 1 : q[3]];
    }
    var m = s.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    var p = m[1].replace('/', ' ').split(/[,\\s]+/).filter(Boolean).map(parseFloat);
    return [p[0] || 0, p[1] || 0, p[2] || 0, p[3] === undefined ? 1 : p[3]];
  }
  function opaque(c) { return !!c && c[3] >= 0.995; }
  function lum(rgb) {
    var a = [rgb[0], rgb[1], rgb[2]].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  /**
   * What is actually painted behind this element.
   *
   * Returns null when the answer is a GRADIENT or a PHOTOGRAPH, because there
   * is no single colour to compare against and a checker that guesses one
   * invents defects. This exact bug made the first run of this file report
   * every band heading as 1.05:1 — the band is a linear-gradient, its
   * backgroundColor is transparent, so the walk sailed past it and measured
   * white text against the white BODY. Twenty-one findings, none of them real.
   * Verify the instrument before believing it.
   */
  function behind(el) {
    /* A translucent layer is paint ON a surface, not the surface. The current
       nav link sits on a 12% brand wash; stopping there compares the text
       against a colour nothing on the page is painted with, and reports a link
       everyone can read at 1.6:1. Layers are collected going up and composited
       coming back down — which is what the compositor itself does. */
    var layers = [];
    for (var n = el; n && n !== document.documentElement; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        /* A photograph is unknowable. A COLOUR gradient is not: its darkest stop
           is the worst case a reader can land on, which is what the shipping
           audit compares against — and skipping it here is how this probe missed
           a ghost button sitting at 1.6:1 on a brand gradient across six of the
           seven compositions. An instrument that skips is not neutral; it is
           quietly reporting a pass. */
        if (cs.backgroundImage.indexOf('url(') >= 0) return null;
        /* \\( — a single backslash here is eaten by the TEMPLATE LITERAL this
           script lives in, so the emitted regex becomes rgba?([^)]+), whose
           parens are a capture group rather than a literal bracket. It still
           matched, just not the whole colour, and every gradient band silently
           became unmeasurable: 252 skipped nodes reported as a clean pass. */
        var stops = cs.backgroundImage.match(/rgba?\\([^)]+\\)|color\\(\\s*srgb[^)]+\\)/gi) || [];
        var solid = [];
        for (var k = 0; k < stops.length; k++) { var c = toRgb(stops[k]); if (opaque(c)) solid.push(c); }
        if (!solid.length) return null;
        solid.sort(function (a, b) { return lum(a) - lum(b); });
        layers.push(solid[0]);
        break;
      }
      /* A ::before or ::after carrying a background is painted BETWEEN this text
         and the colour the walk is about to find. The showcase hero does exactly
         this — a photograph in an absolutely positioned child and a dark scrim in
         ::after, neither of which is an ancestor background — so the walk reached
         the white body and called white-on-photograph a 1.05:1 failure.
         Only a pseudo that COVERS the box counts. The kit's shaped section edge
         is a 44px sliver at the top of a 700px section; treating that as opaque
         made three quarters of every page unmeasurable, which is a checker that
         has stopped checking. */
      var box = n.getBoundingClientRect();
      for (var i = 0; i < 2; i++) {
        var pe = getComputedStyle(n, i ? '::after' : '::before');
        if (!pe || pe.content === 'none') continue;
        /* PAINT, not merely a declared colour. toRgb now parses rgba(0,0,0,0)
           into a value instead of returning null, so a bare truthiness test
           reads every fully transparent pseudo-element as opaque — which took the
           unmeasurable count from 12 to 252 and turned this probe into a
           rubber stamp. Alpha is the whole question here. */
        var peBg = toRgb(pe.backgroundColor);
        var peHasPaint = (pe.backgroundImage && pe.backgroundImage !== 'none') || (peBg && peBg[3] > 0.004);
        if (!peHasPaint) continue;
        var pw = parseFloat(pe.width), ph = parseFloat(pe.height);
        if (!isFinite(pw) || !isFinite(ph)) return null;          // cannot tell — do not guess
        if (pw >= box.width * 0.9 && ph >= box.height * 0.9) return null;
      }
      var bc = toRgb(cs.backgroundColor);
      if (bc && bc[3] > 0.004) { layers.push(bc); if (opaque(bc)) break; }
    }
    if (!layers.length || !opaque(layers[layers.length - 1])) {
      var body = toRgb(getComputedStyle(document.body).backgroundColor);
      layers.push(opaque(body) ? body : [255, 255, 255, 1]);
    }
    var out = [255, 255, 255];
    for (var j = layers.length - 1; j >= 0; j--) {
      var al = layers[j][3], L = layers[j];
      out = [0, 1, 2].map(function (ch) { return L[ch] * al + out[ch] * (1 - al); });
    }
    return out;
  }
  var bad = [], unmeasurable = 0;
  var els = document.querySelectorAll('h1,h2,h3,h4,p,a,span,li,button,.btn,.eyebrow,.lede,.stat-label,.stat-value,figcaption');
  Array.prototype.forEach.call(els, function (el) {
    if (!el.textContent || !el.textContent.trim()) return;
    if (el.querySelector('h1,h2,h3,h4,p,a,span,li')) return;   // measure the leaf that holds the text
    var r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    var cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.5) return;
    var fg = toRgb(cs.color); if (!fg) return;
    var bg = behind(el);
    if (!bg) { unmeasurable++; if (window.__skips) window.__skips.push(el.tagName.toLowerCase() + '.' + String(el.className).slice(0,30) + ' | ' + el.textContent.trim().slice(0,18)); return; }
    var a = lum(fg), b = lum(bg);
    var ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    // AA is 4.5 for body text, 3.0 for large text (>=24px, or >=18.66px bold).
    var size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
    var need = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
    if (ratio + 0.05 < need) {
      bad.push({ tag: el.tagName.toLowerCase(), cls: el.className && String(el.className).slice(0, 40),
                 text: el.textContent.trim().slice(0, 22), ratio: Math.round(ratio * 100) / 100, need: need });
    }
  });
  return { bad: bad, unmeasurable: unmeasurable };
})()`;

interface Check { name: string; pass: boolean; got: unknown }

async function main() {
    // Through Joe's own HTML repair first — a built page never reaches a browser
    // without it, so measuring the raw composition measures a page nobody ships.
    for (const a of ARCHETYPES) {
        fs.writeFileSync(path.join(OUT, `${a}.html`), reviewHtml(pageFor(a), true, { ownedSurfaces: ownedSurfaces(a) }).html, 'utf-8');
    }

    let chromium: any;
    try { ({ chromium } = require('playwright-core')); }
    catch { console.error('playwright-core is not installed — cannot verify.'); process.exit(2); }

    const exe = process.env.BROWSER_EXECUTABLE_PATH || '/opt/pw-browsers/chromium';
    const browser = await chromium.launch(fs.existsSync(exe) ? { executablePath: exe } : {});
    const checks: Check[] = [];
    const add = (name: string, pass: boolean, got: unknown = '') => checks.push({ name, pass, got });
    let unmeasured = 0;
    let joeUnmeasured = 0;

    const viewports = [
        { label: 'desktop', width: 1280, height: 900 },
        { label: 'phone', width: 390, height: 780 },
    ];

    for (const a of ARCHETYPES) {
        for (const scheme of ['light', 'dark'] as const) {
            for (const vp of viewports) {
                const ctx = await browser.newContext({
                    viewport: { width: vp.width, height: vp.height }, colorScheme: scheme,
                });
                const page = await ctx.newPage();
                const errs: string[] = [];
                page.on('pageerror', (e: Error) => errs.push(e.message));
                await page.goto('file://' + path.join(OUT, `${a}.html`));
                await page.waitForTimeout(250);

                const tag = `${a}/${scheme}/${vp.label}`;

                await page.evaluate(() => { (window as any).__skips = []; });
                const probe = await page.evaluate(CONTRAST_PROBE) as { bad: any[]; unmeasurable: number };
                add(`${tag}: every text node clears AA`, probe.bad.length === 0, probe.bad.slice(0, 4));
                unmeasured += probe.unmeasurable;
                if (process.env.SHOW_SKIPS && probe.unmeasurable) console.log(`  skips ${tag}:`, (await page.evaluate(() => (window as any).__skips)).slice(0,6));

                const hScroll = await page.evaluate(() => {
                    const de = document.documentElement, before = window.scrollX;
                    window.scrollTo(de.scrollWidth, 0);
                    const moved = Math.abs(window.scrollX - before);
                    window.scrollTo(before, 0);
                    return moved;
                });
                add(`${tag}: no sideways scroll`, hScroll === 0, hScroll);

                // Nothing may sit outside the viewport. The overlap panel is
                // pulled UP on purpose; being pulled out of the page is not.
                const escaped = await page.evaluate(() => {
                    const out: string[] = [];
                    document.querySelectorAll('main *').forEach(el => {
                        const r = el.getBoundingClientRect();
                        if (r.width < 2 || r.height < 2) return;
                        if (r.left < -2 || r.right > window.innerWidth + 2) out.push(el.className || el.tagName);
                    });
                    return out.slice(0, 3);
                });
                add(`${tag}: nothing escapes the viewport`, escaped.length === 0, escaped);

                add(`${tag}: no JS errors`, errs.length === 0, errs);

                if (scheme === 'light' && vp.label === 'desktop') {
                    await page.screenshot({ path: path.join(OUT, `${a}.png`), fullPage: false });
                }
                await ctx.close();
            }
        }
    }
    await browser.close();

    /**
     * JOE'S OWN AUDIT, ON THE SAME PAGES.
     *
     * The probe above is an independent instrument written for this file. The
     * audit is the one that actually ships and whose findings drive the repair
     * loop. Running both over identical pages is the only way to notice the
     * audit drifting — and it is how the false CRITICAL on every showcase page
     * was found: the audit walked up for a background colour, sailed past a
     * photograph held in an absolutely positioned child and a scrim in ::after,
     * reached the white body, and reported white-on-photograph as 1.05:1.
     *
     * Two instruments that disagree mean one of them is wrong. Neither is
     * allowed to be the one that ships.
     */
    for (const a of ARCHETYPES) {
        const url = 'file://' + path.join(OUT, `${a}.html`);
        try {
            const v = await auditVisually(url, { screenshotDir: OUT, name: `audit-${a}` });
            if (!v.ran) { add(`${a}: Joe's audit ran`, false, v.skipped); continue; }
            const contrast = v.findings.filter(f => f.code === 'contrast');
            add(`${a}: Joe's audit reports no contrast failure either`,
                contrast.length === 0, contrast.map(f => f.en));
            add(`${a}: Joe's audit finds nothing critical`,
                !v.findings.some(f => f.severity === 'critical'),
                v.findings.filter(f => f.severity === 'critical').map(f => f.en));
            joeUnmeasured += Number(v.metrics?.contrastUnmeasurable) || 0;
        } catch (e: any) {
            add(`${a}: Joe's audit ran`, false, String(e?.message || e));
        }
    }

    let failed = 0;
    for (const c of checks) {
        if (c.pass) continue;
        failed++;
        console.log(`✗ ${c.name} — ${JSON.stringify(c.got)}`);
    }
    console.log(`\n${checks.length - failed}/${checks.length} passed across ${ARCHETYPES.length} archetypes.`);
    // Said out loud, because "0 failures" over a set that silently skipped half
    // the page is the kind of green that hides everything.
    console.log(`${unmeasured} text node(s) sat on a gradient or a photograph and could not be measured here,`);
    console.log(`${joeUnmeasured} likewise in Joe's own audit — both instruments say so rather than guessing.`);
    console.log(`Screenshots in ${OUT}`);
    process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
