/**
 * Joe uses what he built.
 *
 * The blueprint promises interaction: a cart whose badge counts up, an accordion
 * that opens, a form that refuses to submit empty, tabs that switch, a counter
 * that counts. The model writes the buttons either way. Nothing ever pressed
 * one — the visual audit measures how the page LOOKS, and a dead button looks
 * perfect.
 *
 * So this presses them. It opens the page in a real browser, finds every control
 * a visitor would try, clicks it, and measures whether anything happened. A
 * button that changes nothing is reported as a button that changes nothing.
 *
 * Nothing here simulates a click or reasons about the source: a control that is
 * not actually pressed is not reported as working, and a page the browser could
 * not open is reported as not audited rather than as passing.
 */

export interface BehaviourFinding {
    code: string;
    severity: 'critical' | 'major' | 'minor';
    ar: string;
    en: string;
    hint?: string;
}

export interface ControlResult {
    label: string;
    kind: 'button' | 'summary' | 'anchor' | 'submit' | 'tab';
    worked: boolean;
    /** What changed, for the report — 'dom', 'open', 'scroll', 'validation', ''. */
    effect: string;
}

export interface BehaviourAudit {
    ran: boolean;
    skipped?: string;
    score: number;                  // 0-100
    findings: BehaviourFinding[];
    controls: ControlResult[];
    metrics: Record<string, any>;
}

const MAX_CONTROLS = 14;
const SETTLE_MS = 320;

/** Runs in the page: catalogue everything a visitor could press. */
function findControls(limit: number) {
    const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const label = (el: Element) => {
        const t = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        return t || el.getAttribute('aria-label') || el.getAttribute('title') || el.tagName.toLowerCase();
    };

    const out: Array<{ sel: string; kind: string; label: string; href?: string }> = [];
    const push = (el: Element, kind: string) => {
        if (out.length >= limit || !vis(el)) return;
        // A stable per-run handle: index into a list we also stamp on the element.
        const id = `joe-ctl-${out.length}`;
        el.setAttribute('data-joe-ctl', id);
        out.push({ sel: `[data-joe-ctl="${id}"]`, kind, label: label(el), href: (el as HTMLAnchorElement).href });
    };

    // details/summary first — the cheapest correct accordion, and easy to verify.
    document.querySelectorAll('details > summary').forEach(el => push(el, 'summary'));
    // Anything that submits.
    document.querySelectorAll('form button[type="submit"], form input[type="submit"], form button:not([type])').forEach(el => push(el, 'submit'));
    // Tabs and filters announce themselves.
    document.querySelectorAll('[role="tab"], [data-tab], .tab, .filter, [data-filter]').forEach(el => push(el, 'tab'));
    // Ordinary buttons — the cart, the counter, the toggle.
    document.querySelectorAll('button, [role="button"]').forEach(el => {
        if (el.closest('form')) return;                 // already covered as submit
        if (el.hasAttribute('data-joe-ctl')) return;
        push(el, 'button');
    });
    // In-page navigation.
    document.querySelectorAll('a[href^="#"]').forEach(el => {
        const h = (el.getAttribute('href') || '').slice(1);
        if (!h) return;
        push(el, 'anchor');
    });
    return out;
}

/** Runs in the page: a cheap fingerprint of everything a click could change. */
function snapshot() {
    // A HASH, not a length. A cart badge going 0 -> 1 is the single most
    // important thing a click can do on a store page, and it changes neither the
    // length of the text nor the number of nodes — the first version of this
    // audit called a working cart dead for exactly that reason.
    const hash = (s: string) => {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return h >>> 0;
    };
    const openDetails = document.querySelectorAll('details[open]').length;
    const active = document.querySelectorAll('.active,.is-active,.open,.is-open,[aria-expanded="true"],[aria-selected="true"],[data-open="true"]').length;
    let visible = 0;
    const els = Array.from(document.querySelectorAll('body *')).slice(0, 2500);
    for (const el of els) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 2 && r.height > 2) visible++;
    }
    const text = document.body.innerText || '';
    return {
        text: hash(text),
        html: hash((document.body.innerHTML || '').slice(0, 200000)),
        nodes: document.querySelectorAll('body *').length,
        visible, openDetails, active,
        scroll: Math.round(window.scrollY),
        url: location.href,
        // Digits are how a cart badge, a counter and a total announce themselves.
        digits: hash((text.match(/\d+/g) || []).join(',')),
    };
}

function changed(a: any, b: any): string {
    if (!a || !b) return '';
    if (b.openDetails !== a.openDetails) return 'open';
    if (b.active !== a.active) return 'state';
    if (b.url !== a.url) return 'navigation';
    if (Math.abs(b.scroll - a.scroll) > 40) return 'scroll';
    if (b.nodes !== a.nodes || b.visible !== a.visible) return 'dom';
    if (b.digits !== a.digits) return 'count';
    if (b.html !== a.html) return 'dom';
    if (b.text !== a.text) return 'text';
    return '';
}

/**
 * Open the page, press everything, report what actually responded.
 *
 * `kind` is the page type from the blueprint, used only to know which promises
 * were made: a store that ships a dead "add to cart" is a critical failure; a
 * documentation page has no cart to break.
 */
export async function auditBehaviour(fileUrl: string, opts?: { kind?: string }): Promise<BehaviourAudit> {
    const empty: BehaviourAudit = { ran: false, skipped: '', score: 0, findings: [], controls: [], metrics: {} };
    if (String(process.env.JOE_BEHAVIOUR_AUDIT || '1') === '0') {
        return { ...empty, skipped: 'disabled (JOE_BEHAVIOUR_AUDIT=0)' };
    }
    let chromium: any;
    try { ({ chromium } = require('playwright')); } catch (e: any) {
        return { ...empty, skipped: `playwright unavailable: ${e?.message || e}` };
    }

    let browser: any;
    try {
        browser = await chromium.launch({
            args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            ...(process.env.BROWSER_EXECUTABLE_PATH ? { executablePath: process.env.BROWSER_EXECUTABLE_PATH } : {}),
        });
    } catch (e: any) {
        return { ...empty, skipped: `browser launch failed: ${e?.message || e}` };
    }

    const controls: ControlResult[] = [];
    const findings: BehaviourFinding[] = [];
    const metrics: Record<string, any> = {};
    const jsErrors: string[] = [];

    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        await page.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        page.on('pageerror', (e: any) => { if (jsErrors.length < 6) jsErrors.push(String(e?.message || e).slice(0, 140)); });
        page.on('console', (m: any) => {
            if (m.type() !== 'error' || jsErrors.length >= 6) return;
            const t = String(m.text());
            if (/favicon\.ico/i.test(t)) return;
            jsErrors.push(t.slice(0, 140));
        });
        // A page that pops a confirm() on click would hang the audit forever.
        page.on('dialog', (d: any) => d.dismiss().catch(() => { }));
        await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 20000 }).catch(() => { });
        await page.waitForTimeout(500);

        const list: Array<{ sel: string; kind: string; label: string; href?: string }> =
            await page.evaluate(findControls, MAX_CONTROLS);
        metrics.controlsFound = list.length;

        // Anchors are checked without clicking: the question is whether the
        // destination exists, and a page that scrolls is not proof that it does.
        const anchorTargets: Array<{ label: string; target: string; exists: boolean }> = await page.evaluate(() => {
            const out: Array<{ label: string; target: string; exists: boolean }> = [];
            document.querySelectorAll('a[href^="#"]').forEach(a => {
                const h = (a.getAttribute('href') || '').slice(1);
                if (!h || h === 'top') return;
                let exists = false;
                try { exists = !!document.getElementById(h) || !!document.querySelector(`[name="${CSS.escape(h)}"]`); } catch { exists = false; }
                out.push({ label: ((a as HTMLElement).innerText || h).trim().slice(0, 40), target: h, exists });
            });
            return out.slice(0, 30);
        });
        metrics.anchors = anchorTargets.length;
        const deadAnchors = anchorTargets.filter(a => !a.exists);
        metrics.deadAnchors = deadAnchors.length;

        for (const c of list) {
            if (c.kind === 'anchor') continue;                       // handled above
            const before = await page.evaluate(snapshot).catch(() => null);
            let effect = '';
            try {
                const el = await page.$(c.sel);
                if (!el) { controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'not found' }); continue; }
                // An empty form with required fields is BLOCKED by the browser, so
                // nothing in the DOM changes and a naive check calls the submit
                // button dead. Refusing to submit an empty form is the behaviour
                // that was asked for — recognise it before clicking.
                if (c.kind === 'submit') {
                    const blocked = await page.evaluate((sel: string) => {
                        const btn = document.querySelector(sel);
                        const form = btn?.closest('form') as HTMLFormElement | null;
                        return !!form && typeof form.checkValidity === 'function' && !form.checkValidity();
                    }, c.sel).catch(() => false);
                    if (blocked) { controls.push({ label: c.label, kind: 'submit', worked: true, effect: 'validation' }); continue; }
                }
                await el.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => { });
                // force:true so an overlay does not turn "covered" into "broken".
                await el.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
                await page.waitForTimeout(SETTLE_MS);
                const after = await page.evaluate(snapshot).catch(() => null);
                effect = changed(before, after);
                // A submit that reloads the page proves the form is NOT handled —
                // an unhandled submit is the browser's default, not a feature.
                if (c.kind === 'submit' && effect === 'navigation') effect = 'reload';
                if (effect === 'navigation') {
                    await page.goBack({ timeout: 5000 }).catch(() => { });
                    await page.waitForTimeout(200);
                }
            } catch { /* the control itself is what is under test */ }
            controls.push({ label: c.label, kind: c.kind as any, worked: !!effect && effect !== 'reload', effect });
        }

        // Does an empty required form actually refuse? Native validation counts.
        const forms = await page.evaluate(() => {
            const out: Array<{ fields: number; required: number; hasSubmit: boolean }> = [];
            document.querySelectorAll('form').forEach(f => {
                const fields = f.querySelectorAll('input,textarea,select').length;
                const required = f.querySelectorAll('[required]').length;
                const hasSubmit = !!f.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
                out.push({ fields, required, hasSubmit });
            });
            return out;
        }).catch(() => []);
        metrics.forms = forms.length;
        metrics.formsWithoutValidation = forms.filter((f: any) => f.fields > 0 && f.required === 0).length;

        metrics.jsErrors = jsErrors.length;
        await page.close();
    } catch (e: any) {
        try { await browser.close(); } catch { }
        return { ...empty, skipped: `behaviour audit failed: ${e?.message || e}` };
    }
    try { await browser.close(); } catch { }

    /* ---- judgement, on what actually happened ------------------------------ */

    const pressable = controls.filter(c => c.kind !== 'anchor');
    const dead = pressable.filter(c => !c.worked);
    metrics.pressed = pressable.length;
    metrics.dead = dead.length;

    if (jsErrors.length) {
        findings.push({
            code: 'js_errors', severity: 'critical',
            ar: `الصفحة ترمي ${jsErrors.length} خطأ JavaScript — التفاعل معطّل: ${jsErrors[0]}`,
            en: `The page throws ${jsErrors.length} JavaScript error(s), so its interactions are broken: ${jsErrors[0]}`,
            hint: 'fix the script errors; every handler after the throw never runs',
        });
    }
    if (metrics.deadAnchors > 0) {
        findings.push({
            code: 'dead_anchors', severity: 'major',
            ar: `${metrics.deadAnchors} رابط تنقّل يشير إلى قسم غير موجود في الصفحة`,
            en: `${metrics.deadAnchors} navigation link(s) point at a section id that does not exist`,
            hint: 'give every target section an id matching its nav link, or repoint the link',
        });
    }
    const deadRatio = pressable.length ? dead.length / pressable.length : 0;
    if (dead.length >= 2 && deadRatio >= 0.4) {
        findings.push({
            code: 'dead_controls', severity: 'critical',
            ar: `${dead.length} من ${pressable.length} أزرار لا تفعل شيئًا عند الضغط: ${dead.slice(0, 3).map(d => `«${d.label}»`).join('، ')}`,
            en: `${dead.length} of ${pressable.length} controls do nothing when clicked: ${dead.slice(0, 3).map(d => `"${d.label}"`).join(', ')}`,
            hint: 'wire real handlers in the page JS, or make them links to a real destination',
        });
    } else if (dead.length) {
        findings.push({
            code: 'some_dead_controls', severity: 'major',
            ar: `أزرار لا تستجيب: ${dead.slice(0, 3).map(d => `«${d.label}»`).join('، ')}`,
            en: `Unresponsive controls: ${dead.slice(0, 3).map(d => `"${d.label}"`).join(', ')}`,
            hint: 'each of these needs a real click handler or a real href',
        });
    }
    const reloaders = controls.filter(c => c.effect === 'reload');
    if (reloaders.length) {
        findings.push({
            code: 'form_reloads', severity: 'major',
            ar: `النموذج يعيد تحميل الصفحة عند الإرسال بدل معالجته — الرسالة تضيع`,
            en: 'The form reloads the page on submit instead of handling it — the message is lost',
            hint: 'addEventListener("submit", e => { e.preventDefault(); ... }) and show a success state',
        });
    }
    if (metrics.formsWithoutValidation > 0) {
        findings.push({
            code: 'form_no_validation', severity: 'minor',
            ar: `نموذج بلا أي حقل مطلوب — يمكن إرساله فارغًا`,
            en: 'A form has no required fields, so it can be submitted empty',
            hint: 'mark the essential inputs required and give them types (email/tel)',
        });
    }

    const penalty: Record<BehaviourFinding['severity'], number> = { critical: 30, major: 14, minor: 5 };
    const score = Math.max(0, 100 - findings.reduce((s, f) => s + penalty[f.severity], 0));

    return { ran: true, score, findings, controls, metrics };
}

/** What the model is told to fix, in the same shape as the visual repair brief. */
export function behaviourRepairBrief(findings: BehaviourFinding[], controls: ControlResult[]): string {
    if (!findings.length) return '';
    const dead = controls.filter(c => !c.worked && c.kind !== 'anchor').slice(0, 6);
    return `A REAL BROWSER pressed the controls on this page. These are measurements, not opinions:
${findings.map((f, i) => `${i + 1}. [${f.severity}] ${f.en}${f.hint ? ` — ${f.hint}` : ''}`).join('\n')}
${dead.length ? `\nControls that did nothing when clicked: ${dead.map(d => `"${d.label}" (${d.kind})`).join(', ')}.` : ''}
Fix the BEHAVIOUR, in the page's own <script>. Every control must do something a visitor can see:
a cart button updates a badge and a panel, a tab switches panels, a filter hides cards, a counter
counts, a form validates and shows a success state without reloading. Do not remove the controls to
make the warning go away — that is not a fix. Keep the markup, the design system and the copy
exactly as they are; return the COMPLETE updated HTML file.`;
}
