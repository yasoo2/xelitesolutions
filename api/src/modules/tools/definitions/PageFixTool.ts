/**
 * browser_page_fix — «ولاي صفحة»: repairing a page Joe does NOT own.
 *
 * browser_ui_fix mends a project on disk, because Joe has its source. For any
 * other address — a client's live site, a page someone sent him, a system built
 * by somebody else — there is no source to edit, and pretending otherwise would
 * be the emptiest kind of lie: a report saying «fixed» about a server Joe cannot
 * write to.
 *
 * What is honest AND useful is this:
 *
 *   1. measure the page's real defects in a real browser
 *   2. compute a CSS patch that answers them
 *   3. INJECT it live so he SEES the before and the after in his own panel
 *   4. measure again with the patch applied — the improvement is a number
 *   5. save the patch as a real .css file he can hand to whoever owns the site
 *
 * Nothing is claimed about the remote server. The patch is a deliverable, the
 * preview is a demonstration, and both say exactly what they are.
 */
import fs from 'fs';
import path from 'path';
import { BaseTool } from '../base';
import { ToolPermission, ToolExecutionResult } from '../types';
import { broadcast, broadcastThinkingDetail } from '../../../api/ws';
import { parseHex, contrastRatio, fixForeground } from '../../../core/quality/ui-repair';

/** What a live page is measured for — each one answerable by CSS alone. */
interface PageIssues {
    horizontalScroll: boolean;
    overflowWidth: number;
    smallTargets: number;
    lowContrast: Array<{ selector: string; color: string; background: string; ratio: number }>;
    unsizedImages: number;
    /** The unsized ones WITH the ratio the browser actually loaded them at. */
    unsized: Array<{ src: string; w: number; h: number }>;
    eagerImages: number;
    title: string;
}

const MEASURE = () => {
    const out: any = {
        horizontalScroll: document.documentElement.scrollWidth > window.innerWidth + 2,
        overflowWidth: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
        smallTargets: 0, lowContrast: [], unsizedImages: 0, unsized: [], eagerImages: 0,
        title: document.title || '',
    };
    const controls = Array.from(document.querySelectorAll('a, button, [role="button"], input[type="submit"]')) as HTMLElement[];
    out.smallTargets = controls.filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44);
    }).length;

    const imgs = Array.from(document.images) as HTMLImageElement[];
    const unsized = imgs.filter(i => !i.getAttribute('width') && !i.getAttribute('height'));
    out.unsizedImages = unsized.length;
    // The intrinsic ratio is knowable ONLY here, in the browser that loaded the
    // file. Carrying it out is what lets the patch reserve the right space.
    out.unsized = unsized
        .filter(i => i.naturalWidth > 0 && i.naturalHeight > 0 && i.currentSrc)
        .slice(0, 12)
        .map(i => ({ src: i.currentSrc, w: i.naturalWidth, h: i.naturalHeight }));
    out.eagerImages = imgs.filter((i, idx) => idx > 0 && i.loading !== 'lazy').length;

    // Text whose colour does not stand out from what is behind it. Sampled
    // from real rendered elements — the only place this is knowable.
    const seen = new Set<string>();
    const nodes = Array.from(document.querySelectorAll('p, span, a, li, h1, h2, h3, td, label, small')) as HTMLElement[];
    for (const el of nodes.slice(0, 400)) {
        if (!(el.textContent || '').trim()) continue;
        const cs = getComputedStyle(el);
        let bgEl: HTMLElement | null = el;
        let bg = 'rgba(0, 0, 0, 0)';
        while (bgEl && bg === 'rgba(0, 0, 0, 0)') { bg = getComputedStyle(bgEl).backgroundColor; bgEl = bgEl.parentElement; }
        const key = `${cs.color}|${bg}|${el.tagName}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.lowContrast.push({ selector: el.tagName.toLowerCase(), color: cs.color, background: bg, ratio: 0 });
        if (out.lowContrast.length > 40) break;
    }
    return out;
};

/** Keeps `aspect-ratio: 1200 / 800` readable as `3 / 2`. */
function gcd(a: number, b: number): number { return b ? gcd(b, a % b) : Math.abs(a); }

/** rgb(a) → hex, so the shared colour maths can take it. */
function rgbToHex(raw: string): string | null {
    const m = String(raw || '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
    if (!m) return null;
    return '#' + [1, 2, 3].map(i => Number(m[i]).toString(16).padStart(2, '0')).join('');
}

export class PageFixTool extends BaseTool {
    name = 'browser_page_fix';
    version = '1.0.0';
    description = 'Open ANY web page, measure its real UI defects (horizontal overflow, tiny tap targets, unreadable contrast, unsized/eager images), build a CSS patch that fixes them, apply it live in the browser panel so the difference is visible, measure again, and save the patch as a file.';
    tags = ['browser', 'ui', 'css', 'repair', 'accessibility', 'responsive'];

    inputSchema = {
        type: 'object' as const,
        properties: {
            url: { type: 'string' as const, description: 'The page to repair' },
            sessionId: { type: 'string' as const },
        },
        required: ['url'],
    };
    get parameters() { return this.inputSchema; }
    outputSchema = { type: 'object' as const };

    permissions: ToolPermission[] = ['internet', 'write'];
    sideEffects: ToolPermission[] = ['write'];
    rateLimitPerMinute = 10;
    auditFields = ['url'];
    mockSupported = false;

    async execute(input: any, context?: any): Promise<ToolExecutionResult> {
        const logs: string[] = [];
        const sessionId = context?.sessionId || input?.sessionId;
        const raw = String(input?.url || input?.link || '').trim();
        if (!raw) return { ok: false, error: 'no_url', logs } as any;
        const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;

        const { getBrowserSession, withBrowserConcurrency } = require('../../browser/manager');
        const { PANEL_BROWSER_SID } = require('./BrowserSmartTools');
        const { detectChallenge, waitForHumanToClear } = require('../../browser/challenge');

        try { broadcast({ type: 'panel_focus', sessionId, data: { panel: 'browser', reason: 'page_fix' } } as any); } catch { /* UI optional */ }

        return await withBrowserConcurrency(async () => {
            const s = await getBrowserSession(PANEL_BROWSER_SID);
            const page = s.page;
            if (sessionId) broadcastThinkingDetail(sessionId, `🔎 أفتح الصفحة وأقيس عيوبها أمامك: ${url}`);
            await page.goto(url, { waitUntil: 'load', timeout: 45_000 });
            await page.waitForTimeout(600);

            // A human check is handed to the human — the same rule everywhere.
            const wall = await detectChallenge(page);
            if (wall) {
                const handoff = await waitForHumanToClear(page, wall, {
                    sessionId: PANEL_BROWSER_SID,
                    onNote: (m: string) => { if (sessionId) broadcastThinkingDetail(sessionId, m); },
                });
                if (!handoff.cleared) {
                    return { ok: false, error: 'human_check_not_cleared', output: { message: `🙋 ${wall.message} لم يُستكمل التحقّق، فتوقّفت.` }, logs } as any;
                }
                await page.waitForTimeout(400);
            }

            // ── 1: measure, on a phone-sized viewport where overflow shows ──
            const desktop = page.viewportSize();
            await page.setViewportSize({ width: 390, height: 844 });
            await page.waitForTimeout(400);
            const before: PageIssues = await page.evaluate(MEASURE);

            // Contrast is computed HERE, with the same maths the source repairs
            // use, so a page and a project are judged by one standard.
            const failing = before.lowContrast
                .map(c => {
                    const fg = parseHex(rgbToHex(c.color) || '');
                    const bg = parseHex(rgbToHex(c.background) || '') || [255, 255, 255] as [number, number, number];
                    if (!fg) return null;
                    const ratio = contrastRatio(fg, bg);
                    return ratio < 4.5 ? { ...c, ratio, fixed: fixForeground(fg, bg, 4.5) } : null;
                })
                .filter(Boolean) as Array<any>;

            logs.push(`page_fix: overflow=${before.overflowWidth}px small=${before.smallTargets} contrast=${failing.length} unsized=${before.unsizedImages}`);

            // ── 2: the patch, written from what was actually measured ──
            const parts: string[] = [
                `/* رقعة جو لـ ${url}`,
                `   مقيسة على عرض 390 بكسل، ${new Date().toLocaleString()} */`,
                '',
            ];
            const applied: string[] = [];
            const skipped: string[] = [];
            // A patch for a site you do not own is an OVERRIDE sheet: the page's
            // own `p.faint {…}` outranks a bare `p {…}` no matter how late it
            // loads, so every rule here is marked important on purpose. That is
            // also why the rules below are as narrow as the measurement allows.
            if (before.horizontalScroll) {
                parts.push('/* تمرير أفقي: الصفحة أوسع من الشاشة بـ ' + before.overflowWidth + ' بكسل */',
                    'html, body { max-width: 100% !important; overflow-x: hidden !important; }',
                    'img, video, canvas, svg, iframe { max-width: 100% !important; height: auto !important; }',
                    'table, pre, code { max-width: 100% !important; overflow-x: auto !important; }',
                    'p, h1, h2, h3, li, td { overflow-wrap: anywhere !important; }', '');
                applied.push(`منعتُ التمرير الأفقي (كانت الصفحة أوسع بـ ${before.overflowWidth} بكسل)`);
            }
            if (before.smallTargets > 0) {
                parts.push(`/* ${before.smallTargets} هدف لمس أصغر من 44 بكسل */`,
                    'a, button, [role="button"], input[type="submit"] { min-width: 44px !important; min-height: 44px !important; }', '');
                applied.push(`وسّعتُ ${before.smallTargets} هدف لمس إلى 44 بكسل`);
            }
            if (failing.length) {
                // A tag whose OTHER instances read fine must not be repainted
                // wholesale — that would break readable text to mend unreadable
                // text. Those are named for the owner instead of forced here.
                const healthy = new Set(before.lowContrast
                    .filter(c => !failing.some(f => f.color === c.color && f.background === c.background))
                    .map(c => c.selector));
                const byTag = new Map<string, string>();
                for (const f of failing) {
                    if (healthy.has(f.selector)) { if (!skipped.includes(f.selector)) skipped.push(f.selector); continue; }
                    const hex = '#' + (f.fixed as number[]).map((v: number) => Math.round(v).toString(16).padStart(2, '0')).join('');
                    if (!byTag.has(f.selector)) byTag.set(f.selector, hex);
                }
                if (byTag.size) {
                    parts.push(`/* ${byTag.size} لون نصّ دون 4.5:1 */`);
                    for (const [sel, hex] of byTag) parts.push(`${sel} { color: ${hex} !important; }`);
                    parts.push('');
                    applied.push(`رفعتُ تباين ${byTag.size} نوعاً من النصوص إلى 4.5:1`);
                }
            }
            // Layout shift: an image with no declared size occupies nothing until
            // it arrives, then shoves the page. `attr()` cannot be used outside
            // `content`, so the ratio is taken from what the browser really
            // loaded — measured, per image, and written as a rule that works.
            const ratioRules: string[] = [];
            for (const img of before.unsized || []) {
                let tail = '';
                try { tail = new URL(img.src).pathname.split('/').filter(Boolean).pop() || ''; } catch { tail = ''; }
                if (!tail || /["\\]/.test(tail)) continue;
                const g = gcd(img.w, img.h) || 1;
                ratioRules.push(`img[src$="${tail}"] { aspect-ratio: ${img.w / g} / ${img.h / g}; }`);
            }
            if (ratioRules.length) {
                parts.push(`/* ${before.unsizedImages} صورة بلا أبعاد معلنة — تسبّب قفز التخطيط عند وصولها.`,
                    `   النِسَب أدناه مقيسة من الصور نفسها كما حمّلها المتصفّح. */`,
                    ...ratioRules, '');
                applied.push(`حجزتُ مساحة ${ratioRules.length} صورة بنسبتها الحقيقية لمنع قفز التخطيط`);
            }
            const patch = parts.join('\n');

            if (!applied.length) {
                await page.setViewportSize(desktop || { width: 1280, height: 900 });
                return {
                    ok: true,
                    output: {
                        message: `🔎 قِستُ ${url} على عرض جوّال — ولم أجد عيباً تصلحه CSS.\n`
                            + '   لا تمرير أفقي، ولا أهداف لمس صغيرة، ولا نصّ دون حدّ التباين.',
                        url, before, applied: [], patch: '',
                    },
                    logs,
                } as any;
            }

            // ── 3: apply it live, so the difference is SEEN, not described ──
            if (sessionId) broadcastThinkingDetail(sessionId, '🎨 أطبّق الرقعة أمامك الآن — انظر الفرق في اللوحة');
            await page.addStyleTag({ content: patch });
            await page.waitForTimeout(1800);

            // ── 4: measure again, with the patch on the page ──
            const after: PageIssues = await page.evaluate(MEASURE);
            await page.setViewportSize(desktop || { width: 1280, height: 900 });

            // ── 5: hand him the file ──
            let file = '';
            try {
                const dir = path.join(process.cwd(), 'data', 'artifacts');
                fs.mkdirSync(dir, { recursive: true });
                const name = `joe-fix-${String(new URL(url).hostname).replace(/[^a-z0-9.-]/gi, '')}-${Date.now()}.css`;
                file = path.join(dir, name);
                fs.writeFileSync(file, patch, 'utf-8');
            } catch { /* the patch is in the message either way */ }

            const message = [
                `🛠️ أصلحتُ واجهة الصفحة — والفرق مقيس ومعروض أمامك:`,
                ``,
                `   🔗 ${url}`,
                `   تمرير أفقي: ${before.overflowWidth}px ← ${after.overflowWidth}px`,
                `   أهداف لمس صغيرة: ${before.smallTargets} ← ${after.smallTargets}`,
                ``,
                `🔧 ما فعلته:`,
                ...applied.map(a => `   • ${a}`),
                ``,
                // Said plainly rather than left out: a stylesheet cannot add
                // loading="lazy", and pretending it could would be the same lie
                // this tool exists to avoid.
                before.eagerImages > 0
                    ? `ℹ️ و ${before.eagerImages} صورة تُحمّل فوراً — هذه لا تُعالَج بـ CSS، تحتاج loading="lazy" في HTML الموقع.`
                    : '',
                skipped.length
                    ? `ℹ️ وتركتُ ${skipped.join('، ')} كما هي: بعض نصوصها مقروء وبعضها لا، وتلوينها كلها كان سيفسد السليم منها.`
                    : '',
                before.eagerImages > 0 || skipped.length ? `` : '',
                `⚠️ بصراحة: هذه الصفحة ليست ملكك، فلا أستطيع تعديل خادمها.`,
                `   ما تراه الآن هو الرقعة مطبَّقة حيّاً في متصفّحك — وهذا ملفها جاهز`,
                `   لتسليمه لمن يملك الموقع:`,
                file ? `   📄 ${file}` : '   (تعذّر حفظ الملف — الرقعة كاملة أدناه)',
                ``,
                '```css',
                patch.slice(0, 1800),
                '```',
            ].join('\n');

            return { ok: true, output: { message, url, before, after, applied, patch, file }, logs } as any;
        });
    }
}
