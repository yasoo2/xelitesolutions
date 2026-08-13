/**
 * THE DESIGN ITSELF, MEASURED — NOT JUST ITS ACCESSIBILITY.
 *
 * «حتى يخرج بنتيجه مبهره»
 *
 * Everything the audit measured until now answers «does it work»: contrast,
 * tap targets, dead buttons, overflow. All necessary, and all of it can be
 * perfect on a page nobody would call good. A build that scores 96/100 and
 * still looks like a form from 2004 has passed every test that was asked and
 * failed the only one that matters to him.
 *
 * These five ask «is there a SYSTEM here» — and each one is a count, taken in
 * a real browser from computed styles, not an opinion:
 *
 *   1. TYPE SCALE. A page with four font sizes has a hierarchy. A page with
 *      fourteen has a pile. Designers pick a scale and stay on it; generated
 *      CSS drifts, one `font-size: 13px` at a time.
 *   2. SPACING RHYTHM. The same argument in the other axis. Vertical gaps
 *      drawn from a scale read as rhythm; twenty-six distinct margins read as
 *      noise, and the eye can tell without knowing why.
 *   3. LINE LENGTH. Text at 120 characters per line is measurably harder to
 *      read; typography has held 45–85 for a century.
 *   4. COLOUR DISCIPLINE. Distinct text colours. Three is a system, eleven is
 *      an accident.
 *   5. HIERARCHY. The ratio between the largest heading and body text. Under
 *      1.5 there is no visual hierarchy at all — everything shouts equally,
 *      which is the same as nothing shouting.
 *
 * Every finding carries the offenders, so the loop can aim at them: the
 * selectors of the oddest sizes, the widest text blocks. And every threshold
 * here is deliberately generous — this reports a page with NO system, never a
 * page with a system it happens to disagree with.
 */

export interface DesignFinding {
    code: string;
    severity: 'critical' | 'major' | 'minor';
    ar: string;
    en: string;
    data?: any[];
}

export interface DesignReport {
    findings: DesignFinding[];
    metrics: Record<string, any>;
}

/**
 * Runs in the PAGE. No imports, no closures over anything outside — this
 * function is serialised and evaluated inside the browser.
 */
export function measureDesign(): any {
    const selOf = (el: Element): string => {
        const id = (el as HTMLElement).id;
        if (id) return '#' + id;
        const cls = String(el.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean)[0];
        return el.tagName.toLowerCase() + (cls ? '.' + cls : '');
    };
    const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const cs = getComputedStyle(el);
        return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };

    const all = Array.from(document.querySelectorAll('body *')) as HTMLElement[];
    const textEls = all.filter(el => {
        if (!visible(el)) return false;
        return Array.from(el.childNodes).some(n => n.nodeType === 3 && (n.textContent || '').trim().length > 1);
    });

    /* 1 ── the type scale ─────────────────────────────────────────────────── */
    const sizeCount = new Map<number, number>();
    const sizeExample = new Map<number, string>();
    for (const el of textEls) {
        const px = Math.round(parseFloat(getComputedStyle(el).fontSize) || 0);
        if (!px) continue;
        sizeCount.set(px, (sizeCount.get(px) || 0) + 1);
        if (!sizeExample.has(px)) sizeExample.set(px, selOf(el));
    }
    // A size used once or twice is a stray; a scale is what things are BUILT on.
    const sizes = [...sizeCount.entries()].sort((a, b) => b[0] - a[0]);
    const strays = sizes.filter(([, n]) => n <= 2).map(([px]) => ({
        sel: sizeExample.get(px) || '', px, uses: sizeCount.get(px) || 0,
    }));

    /* 2 ── the spacing rhythm ─────────────────────────────────────────────── */
    const gaps = new Map<number, number>();
    for (const el of all) {
        if (!visible(el)) continue;
        const cs = getComputedStyle(el);
        for (const v of [cs.marginTop, cs.marginBottom, cs.paddingTop, cs.paddingBottom]) {
            const px = Math.round(parseFloat(v) || 0);
            if (px <= 0 || px > 200) continue;
            gaps.set(px, (gaps.get(px) || 0) + 1);
        }
    }

    /* 3 ── line length ────────────────────────────────────────────────────── */
    const longLines: Array<{ sel: string; chars: number; px: number }> = [];
    for (const el of textEls) {
        const txt = (el.textContent || '').trim();
        if (txt.length < 120) continue;
        const cs = getComputedStyle(el);
        const px = Math.round(parseFloat(cs.fontSize) || 16);
        const w = el.getBoundingClientRect().width;
        // ~0.5em per character is the usual average for latin and arabic alike.
        const chars = Math.round(w / (px * 0.5));
        if (chars > 95 && longLines.length < 8) longLines.push({ sel: selOf(el), chars, px });
    }

    /* 4 ── colour discipline ──────────────────────────────────────────────── */
    const colours = new Map<string, number>();
    for (const el of textEls) {
        const c = getComputedStyle(el).color;
        if (!c) continue;
        colours.set(c, (colours.get(c) || 0) + 1);
    }

    /* 5 ── hierarchy ──────────────────────────────────────────────────────── */
    const headingPx = (() => {
        const h = document.querySelector('h1') || document.querySelector('h2');
        return h ? Math.round(parseFloat(getComputedStyle(h).fontSize) || 0) : 0;
    })();
    const bodyPx = (() => {
        const p = textEls.find(el => /^(P|LI|SPAN|DIV)$/.test(el.tagName));
        return p ? Math.round(parseFloat(getComputedStyle(p).fontSize) || 0) : 16;
    })();

    return {
        sizes: sizes.length,
        straySizes: strays.slice(0, 8),
        gaps: gaps.size,
        longLines,
        colours: colours.size,
        headingPx,
        bodyPx,
        ratio: bodyPx ? Math.round((headingPx / bodyPx) * 100) / 100 : 0,
        textNodes: textEls.length,
    };
}

/** Judge the measurements. Generous thresholds: this reports NO system. */
export function judgeDesign(m: any): DesignReport {
    const findings: DesignFinding[] = [];
    if (!m || !m.textNodes) return { findings, metrics: m || {} };

    if (m.sizes > 9) {
        findings.push({
            code: 'type_scale_drift', severity: 'minor',
            ar: `${m.sizes} حجم خطّ مختلف على الصفحة — لا سُلَّم طباعي، والتسلسل يضيع`,
            en: `${m.sizes} distinct font sizes on the page — no type scale, so hierarchy reads as noise`,
            data: m.straySizes,
        });
    }
    if (m.gaps > 16) {
        findings.push({
            code: 'spacing_drift', severity: 'minor',
            ar: `${m.gaps} مسافة رأسية مختلفة — الإيقاع مفقود، والعين تراه دون أن تعرف السبب`,
            en: `${m.gaps} distinct vertical spacings — no rhythm; the eye reads it as noise`,
        });
    }
    if (Array.isArray(m.longLines) && m.longLines.length) {
        findings.push({
            code: 'line_too_long', severity: 'minor',
            ar: `${m.longLines.length} فقرة يتجاوز سطرها ٩٥ حرفاً (${m.longLines[0].chars}) — أصعب في القراءة بقياس معروف منذ قرن`,
            en: `${m.longLines.length} paragraph(s) run past 95 characters per line (${m.longLines[0].chars}) — measurably harder to read`,
            data: m.longLines,
        });
    }
    if (m.colours > 8) {
        findings.push({
            code: 'colour_drift', severity: 'minor',
            ar: `${m.colours} لون نصّ مختلف — هذا ليس نظام ألوان`,
            en: `${m.colours} distinct text colours — that is not a colour system`,
        });
    }
    if (m.headingPx && m.bodyPx && m.ratio < 1.5) {
        findings.push({
            code: 'flat_hierarchy', severity: 'minor',
            ar: `أكبر عنوان ${m.headingPx}px والنصّ ${m.bodyPx}px (نسبة ${m.ratio}) — لا تسلسل بصري، كل شيء يصرخ بالتساوي`,
            en: `Largest heading ${m.headingPx}px against ${m.bodyPx}px body (ratio ${m.ratio}) — no visual hierarchy`,
        });
    }
    return { findings, metrics: m };
}

/** Measure a live page and judge it. Never throws — design is additive. */
export async function auditDesign(page: any): Promise<DesignReport> {
    try {
        const m = await page.evaluate(measureDesign);
        return judgeDesign(m);
    } catch {
        return { findings: [], metrics: {} };
    }
}
