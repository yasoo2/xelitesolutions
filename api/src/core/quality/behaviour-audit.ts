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

import { AuditEyes, boxOf, evalInPage } from './audit-eyes';

/** What the strip over the outlined element calls it, in his language. */
const KIND_AR: Record<string, string> = {
    menu: 'قائمة', summary: 'مطويّة', submit: 'إرسال', tab: 'تبويب',
    button: 'زر', link: 'رابط', anchor: 'مرساة',
};

export interface BehaviourFinding {
    code: string;
    severity: 'critical' | 'major' | 'minor';
    ar: string;
    en: string;
    hint?: string;
    /** Measured element evidence used by deterministic repairers when available. */
    evidence?: Array<{ sel?: string; label?: string; w?: number; h?: number; width?: number; height?: number; [key: string]: any }>;
}

/**
 *  EVERY CODE `judgeBehaviour` CAN EMIT — declared beside the pushes.
 *
 *  A reader elsewhere has to know which findings came from THIS instrument in
 *  order to decide who can repair them, and the alternative was a second list
 *  in the repair layer that nobody would remember to update. That is the
 *  night's most expensive class — two writers who must agree, maintained
 *  apart, with nothing forcing them. A guard asserts this set equals the
 *  `code:` literals in this file, so a new finding cannot be added silently.
 */
export const BEHAVIOUR_CODES: ReadonlySet<string> = new Set([
    'controls_not_reached', 'dead_anchors', 'dead_controls', 'form_dead_submit',
    'form_no_validation', 'form_reloads', 'js_errors', 'keyboard_unreachable',
    'some_dead_controls',
]);

export interface ControlResult {
    label: string;
    /**
     *  ⛔ THE CONTROL'S OWN NAME, UNDECORATED.
     *
     *  `label` is what the REPORT shows, and callers decorate it with where it
     *  was pressed — «/menu Add serving» off the home route, «الجوّال Add
     *  serving» in the phone-width pass. A repairer looking that string up in
     *  the component sources finds nothing, which is how a repair road can
     *  work on one page and silently do nothing everywhere else.
     *
     *  Rather than teach every reader to undo every prefix that will ever be
     *  invented — a catalogue, and therefore the same defect one iteration
     *  later — the undecorated name travels with the decorated one, and the
     *  evidence carries THIS.
     */
    bare?: string;
    kind: 'button' | 'summary' | 'anchor' | 'submit' | 'tab' | 'menu' | 'link';
    worked: boolean;
    /** What changed, for the report — 'dom', 'open', 'scroll', 'validation', ''. */
    effect: string;
    /** True when this control was discovered after another interaction changed the UI. */
    exploratory?: boolean;
}

/** One form, actually filled in and actually sent. */
export interface FormResult {
    /** What a human would call it — its heading, its submit button, or its id. */
    label: string;
    fields: number;
    filled: number;
    /** 'submitted' | 'validation' | 'reload' | '' (nothing happened at all). */
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

/**
 * HOW MUCH OF THE APP GETS USED.
 *
 * «المتصفح يقوم بعده تجارب بسيطة فقط … لا اريد فقط حركات بسيطة». It was 14 —
 * a number chosen when the audit had eight seconds and pressed one page. The
 * real limit was never the count; it is TIME, and a budget says so honestly:
 * press everything, in order, until the budget runs out, and report how far
 * it got instead of stopping at an arbitrary fourteenth button.
 */
const MAX_CONTROLS = 40;
const DEFAULT_BUDGET_MS = 60_000;
const SETTLE_MS = 320;
/** Forms are filled for real. This is how many, and how big, per page. */
const MAX_FORMS = 6;
const MAX_FIELDS_PER_FORM = 14;

/** Runs in the page: catalogue everything a visitor could press. */
function findControls(limit: number) {
    const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05;
    };
    const label = (el: Element) => {
        const t = ((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        const aria = el.getAttribute('aria-label') || el.getAttribute('title') || '';
        // The accessible name is the control's identity. Reading all descendant
        // text turns a record opener into a moving sentence containing every
        // field (and makes the same control look new after each re-render).
        // Visible text remains the fallback for controls that have no semantic
        // name of their own.
        if (aria) return aria;
        return t || aria || el.tagName.toLowerCase();
    };

    /**
     * WIPE LAST PAGE'S STAMPS FIRST.
     *
     * A hash route does not reload the document, so every element still carried
     * the `data-joe-ctl` handle from the previous pass — and the dedupe guard
     * below then found nothing at all to press on routes two, three and four.
     * Measured as «10 controls across 4 pages» when it should have been forty.
     */
    document.querySelectorAll('[data-joe-ctl]').forEach(el => el.removeAttribute('data-joe-ctl'));

    const out: Array<{ sel: string; kind: string; label: string; href?: string; ordinal: number; disabled?: boolean }> = [];
    const push = (el: Element, kind: string) => {
        if (out.length >= limit || !vis(el)) return;
        /**
         * A DISABLED CONTROL IS NOT A BROKEN ONE.
         *
         * Measured on his own app: «تصدير CSV» carries `disabled={!rows.length}`
         * and the list was empty, so the click did nothing — correctly — and the
         * probe reported «أزرار لا تستجيب: تصدير CSV». A false blocker about a
         * button doing exactly what it was told is worse than not checking it.
         */
        const dis = (el as HTMLButtonElement).disabled === true || el.getAttribute('aria-disabled') === 'true';
        if (dis) return;
        /**
         * …AND NEITHER IS A TAB THAT IS ALREADY OPEN.
         *
         * «النباتات» is the first tab and the selected one. Pressing it selects
         * what is already selected, nothing changes, and the probe reported it
         * as a dead control. Selecting the current thing IS doing nothing —
         * correctly.
         */
        if (el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true'
            || el.getAttribute('aria-current') === 'page') return;
        /**
         * A hash-router's current route can also appear in a footer, where it
         * does not carry aria-current. Pressing "Visit" while already at
         * #/visit correctly changes nothing; treating that as a dead control
         * made valid multi-page apps fail their own QA.
         */
        const routeHref = el.getAttribute('href') || '';
        const currentHashRoute = window.location.hash || '#/';
        if (kind === 'link' && /^#\//.test(routeHref) && routeHref === currentHashRoute) return;
        /**
         * `aria-pressed` says the same thing in the other vocabulary, and the
         * feed's own filter uses it: «All» is the tab that is already on, so
         * pressing it changes nothing — and the report read «Unresponsive
         * controls: "All"» on a filter that works perfectly.
         */
        if (el.getAttribute('aria-pressed') === 'true') return;
        if (el.hasAttribute('data-joe-ctl')) return;    // claimed by an earlier group
        // A stable per-run handle: index into a list we also stamp on the element.
        const id = `joe-ctl-${out.length}`;
        el.setAttribute('data-joe-ctl', id);
        /**
         *  ⛔ A CONTROL'S IDENTITY IS A STAMP ON THE LIVE DOM, AND A RE-RENDER
         *  ERASES IT. READ THIS BEFORE TRYING TO FIX «not found».
         *
         *  The handle is `[data-joe-ctl="n"]`, written onto the element here
         *  and looked up later. Nothing persists it: a React route change
         *  unmounts the tree, a reload rebuilds the document, and every stamp
         *  is gone. The lookup then returns null and the control is recorded
         *  with `effect: 'not found'`.
         *
         *  Measured on a real store, with the audit's own control table:
         *
         *      WORKED menu   navigation  «منتجات»
         *      DEAD   button not found   «السلة 0»
         *      DEAD   button not found   «أضف إلى السلة»  × 6
         *
         *  Four of twelve pressed — the nav links ran first and took the stamps
         *  with them.
         *
         *  ⛔ TWO REPAIRS WERE TRIED FROM THE SYMPTOM AND BOTH MADE IT WORSE,
         *  because both ADD a re-render:
         *
         *      restore the page between controls   dead 8/12 → 11/12   reverted
         *      goto the collection URL on nav      pressed 4  → 2      reverted
         *
         *  Anything that reloads or re-routes destroys more stamps than it
         *  recovers. A real fix has to RE-STAMP after every change and match
         *  each control to its new element by something stable — not by a
         *  handle that the framework is free to throw away. Six identical
         *  «أضف إلى السلة» buttons mean the label alone is not that thing.
         *
         *  Until then the audit says what is true: it reports these as
         *  UNREACHED, never as pressed-and-dead. See `judgeBehaviour`.
         */
        const controlLabel = label(el);
        const href = (el as HTMLAnchorElement).href;
        // "Plan your visit" can appear in the hero and again in the final
        // call-to-action.  Label + destination identifies their behaviour,
        // not their DOM node.  Keep the occurrence too so a re-render restores
        // the matching control instead of repeatedly pressing the first copy.
        const ordinal = out.filter(candidate => candidate.kind === kind
            && candidate.label === controlLabel && (candidate.href || '') === (href || '')).length;
        out.push({ sel: `[data-joe-ctl="${id}"]`, kind, label: controlLabel, href, ordinal });
    };

    /**
     * MENUS FIRST — «تجريب جميع القوائم».
     *
     * A burger, a dropdown trigger, a disclosure: the controls that HIDE the
     * rest of the interface. Pressing them before anything else is not tidiness
     * — everything behind them is invisible to the probe until they open, so a
     * navigation menu that never opened meant its links were never even
     * catalogued.
     */
        document.querySelectorAll(
        '[aria-haspopup]:not([aria-haspopup="dialog"]), [aria-expanded], .menu-toggle, .nav-toggle, .hamburger, .burger, '
        + '[data-menu], [class*="dropdown"] > button, nav button, header button',
    ).forEach(el => push(el, 'menu'));
    // details/summary — the cheapest correct accordion, and easy to verify.
    document.querySelectorAll('details > summary').forEach(el => push(el, 'summary'));
    // Anything that submits.
    document.querySelectorAll('form button[type="submit"], form input[type="submit"], form button:not([type])').forEach(el => push(el, 'submit'));
    // Tabs and filters announce themselves.
    document.querySelectorAll('[role="tab"], [data-tab], .tab, .filter, [data-filter]').forEach(el => push(el, 'tab'));
    // Ordinary buttons — the cart, the counter, the toggle.
    document.querySelectorAll('button, [role="button"]').forEach(el => {
        if (el.closest('form')) return;                 // already covered as submit
        if (el.getAttribute('aria-haspopup') === 'dialog') return; // inspect dialogs after their row actions
        push(el, 'button');
    });
    // A record/details opener is a stateful dialog, not a site menu. Discover it
    // after row actions so opening it cannot cover controls that are still to be
    // measured on the same screen.
    document.querySelectorAll('[aria-haspopup="dialog"]').forEach(el => push(el, 'button'));
    /**
     * AND THE ROUTES INSIDE THE APP.
     *
     * A hash-router link changes the whole screen without leaving the document
     * — the single most consequential thing a visitor can click — and the probe
     * used to skip every one of them. Only in-app routes: sending the audit to
     * someone else's website mid-build is not a measurement of this build.
     */
    document.querySelectorAll('a[href^="#/"]').forEach(el => push(el, 'link'));
    // In-page navigation (checked without clicking, further down).
    document.querySelectorAll('a[href^="#"]').forEach(el => {
        const h = (el.getAttribute('href') || '').slice(1);
        if (!h || h.startsWith('/')) return;
        push(el, 'anchor');
    });
    return out;
}

/** Runs in the page: catalogue the forms, field by field, for real filling. */
function findForms(o: { maxForms: number; maxFields: number }) {
    const maxForms = o.maxForms, maxFields = o.maxFields;
    // Same reason as the controls above: a hash route keeps the old stamps.
    document.querySelectorAll('[data-joe-form]').forEach(el => el.removeAttribute('data-joe-form'));
    document.querySelectorAll('[data-joe-fld]').forEach(el => el.removeAttribute('data-joe-fld'));
    const forms: Array<{
        sel: string; label: string;
        fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[] }>;
        hasSubmit: boolean; submitSel: string;
    }> = [];
    const vis = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 2 && r.height > 2 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const all = Array.from(document.querySelectorAll('form'));
    for (let i = 0; i < all.length && forms.length < maxForms; i++) {
        const f = all[i] as HTMLFormElement;
        if (!vis(f)) continue;
        const fid = `joe-form-${forms.length}`;
        f.setAttribute('data-joe-form', fid);
        const fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[] }> = [];
        const raw = Array.from(f.querySelectorAll('input,textarea,select'));
        for (const el of raw) {
            if (fields.length >= maxFields) break;
            const h = el as HTMLInputElement;
            const type = (h.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase();
            if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
            if (h.disabled || h.readOnly) continue;
            if (!vis(el)) continue;
            const did = `joe-fld-${forms.length}-${fields.length}`;
            el.setAttribute('data-joe-fld', did);
            const options = el.tagName === 'SELECT'
                ? Array.from((el as HTMLSelectElement).options).map(o => o.value).filter(v => v !== '')
                : [];
            fields.push({ sel: `[data-joe-fld="${did}"]`, tag: el.tagName.toLowerCase(), type, required: h.required === true, options: options.slice(0, 20) });
        }
        const submit = f.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
        let submitSel = '';
        if (submit) { submit.setAttribute('data-joe-sub', fid); submitSel = `[data-joe-sub="${fid}"]`; }
        // Its name, the way a person would say it: the submit's words, a legend,
        // a heading above it, or — last — the id nobody reads.
        const label = ((submit as HTMLElement)?.innerText
            || (f.querySelector('legend,h1,h2,h3,h4') as HTMLElement)?.innerText
            || f.getAttribute('aria-label') || f.getAttribute('name') || f.id || 'form').trim().replace(/\s+/g, ' ').slice(0, 40);
        forms.push({ sel: `[data-joe-form="${fid}"]`, label, fields, hasSubmit: !!submit, submitSel });
    }
    return forms;
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
    /**
     * …AND THE FINGERPRINT IGNORES WHAT THE CAMERA WROTE.
     *
     * Belt and braces for the caret bug above: any screenshot tool that hides
     * the text caret does it by writing `caret-color: transparent !important`
     * into every input's inline style. If one lands between the two snapshots,
     * a button that did nothing looks like a button that changed the DOM.
     * Joe's own streamer no longer does this; a normalised hash means no other
     * camera can either.
     */
    const html = (document.body.innerHTML || '').slice(0, 200000)
        .replace(/caret-color:\s*transparent\s*!important;?\s*/gi, '')
        .replace(/\sstyle="\s*"/gi, '');
    return {
        text: hash(text),
        html: hash(html),
        nodes: document.querySelectorAll('body *').length,
        visible, openDetails, active,
        scroll: Math.round(window.scrollY),
        url: location.href,
        // Digits are how a cart badge, a counter and a total announce themselves.
        // Arabic-Indic digits too: a cart badge on an Arabic page counts
        // «٠ ١ ٢», and `\d` does not match any of them — the click would have
        // looked like it changed nothing.
        digits: hash((text.match(/[0-9٠-٩۰-۹]+/g) || []).join(',')),
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
export async function auditBehaviour(fileUrl: string, opts?: {
    kind?: string;
    watchSessionId?: string;
    onProgress?: (phase: string) => void;
}): Promise<BehaviourAudit> {
    const empty: BehaviourAudit = { ran: false, skipped: '', score: 0, findings: [], controls: [], metrics: {} };
    if (String(process.env.JOE_BEHAVIOUR_AUDIT || '1') === '0') {
        return { ...empty, skipped: 'disabled (JOE_BEHAVIOUR_AUDIT=0)' };
    }
    let chromium: any;
    try { ({ chromium } = require('playwright')); } catch (e: any) {
        return { ...empty, skipped: `playwright unavailable: ${e?.message || e}` };
    }

    let browser: any = null;
    let page: any = null;
    let borrowed = false;
    let borrowError = '';
    const browserManager = require('../../modules/browser/manager');
    if (opts?.watchSessionId) {
        try {
            const session = await browserManager.getBrowserSession(opts.watchSessionId);
            if (session?.page) {
                page = session.page;
                borrowed = true;
                try { browserManager.resumeStreamingIfWatched(opts.watchSessionId); } catch { /* streaming is a bonus */ }
                opts.onProgress?.('watching');
            } else {
                borrowError = 'the Browser panel session opened without a page';
            }
        } catch (e: any) {
            borrowError = String(e?.message || e).slice(0, 300);
        }
        if (borrowError) {
            try { browserManager.noteBrowserFailure(opts.watchSessionId, 'behaviour-audit-borrow', borrowError); } catch { /* diagnostic only */ }
        }
    }
    if (!page) {
        try {
            browser = await chromium.launch(browserManager.getChromiumLaunchOptions());
            opts?.onProgress?.(borrowError ? `private:${borrowError}` : 'private');
        } catch (e: any) {
            return { ...empty, skipped: `browser launch failed: ${e?.message || e}` };
        }
    }

    const controls: ControlResult[] = [];
    const findings: BehaviourFinding[] = [];
    const metrics: Record<string, any> = {};
    const jsErrors: string[] = [];

    let detach = () => { };
    try {
        if (!page) page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        if (borrowed) {
            await page.setViewportSize({ width: 1280, height: 900 }).catch(() => { });
            try { browserManager.setSessionViewport(opts?.watchSessionId || '', 1280, 900); } catch { /* viewport sync is best effort */ }
        }
        await page.addInitScript('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        const onPageError = (e: any) => { if (jsErrors.length < 6) jsErrors.push(String(e?.message || e).slice(0, 140)); };
        const onConsole = (m: any) => {
            if (m.type() !== 'error' || jsErrors.length >= 6) return;
            const t = String(m.text());
            // Chrome reports a missing favicon as a bare "Failed to load resource"
            // with the URL only in the message's location, so the text alone does
            // not identify it — and it was costing every page a critical finding.
            const where = (() => { try { return String(m.location()?.url || ''); } catch { return ''; } })();
            if (/favicon\.ico/i.test(t) || /favicon\.ico/i.test(where)) return;
            jsErrors.push(t.slice(0, 140));
        };
        const onDialog = (d: any) => {
            const kind = (() => { try { return String(d.type()); } catch { return ''; } })();
            return (kind === 'beforeunload' ? d.dismiss() : d.accept('Joe QA')).catch(() => { });
        };
        page.on('pageerror', onPageError);
        page.on('console', onConsole);
        page.on('dialog', onDialog);
        detach = () => {
            try { page.off('pageerror', onPageError); page.off('console', onConsole); page.off('dialog', onDialog); } catch { /* page may be gone */ }
        };
        opts?.onProgress?.('pressing');
        // A page that pops a confirm() on click would hang the audit forever.
        // The same rule as the app audit: answer YES, or every confirm-guarded
        // button is measured as dead. beforeunload alone is dismissed.
        // Same rule as the visual audit: a navigation that failed leaves the
        // browser's own error page on screen, and clicking ITS buttons and
        // reporting a score would be a measurement of nothing.
        let resp: any = null, navError = '';
        try { resp = await page.goto(fileUrl, { waitUntil: 'networkidle', timeout: 20000 }); }
        catch (e: any) { navError = String(e?.message || e).split('\n')[0].slice(0, 120); }
        if (navError || !resp || !resp.ok()) {
            detach();
            if (!borrowed) { try { await page.close(); } catch { } }
            if (browser) { try { await browser.close(); } catch { } }
            return { ...empty, skipped: `could not load ${fileUrl} — ${navError || (resp ? `HTTP ${resp.status()}` : 'no response')}` };
        }
        await page.waitForTimeout(500);

        const probe = await probeControls(page);
        controls.push(...probe.controls);
        Object.assign(metrics, probe.metrics);

        metrics.jsErrors = jsErrors.length;
        opts?.onProgress?.('inspected');
        detach();
        if (!borrowed) { await page.close().catch(() => { }); }
        else {
            try { await page.setViewportSize({ width: 1280, height: 900 }); } catch { }
            try { browserManager.setSessionViewport(opts?.watchSessionId || '', 1280, 900); } catch { }
            opts?.onProgress?.('restored');
        }
    } catch (e: any) {
        detach();
        if (!borrowed && browser) { try { await browser.close(); } catch { } }
        return { ...empty, skipped: `behaviour audit failed: ${e?.message || e}` };
    }
    if (!borrowed && browser) { try { await browser.close(); } catch { } }

    const judged = judgeBehaviour(controls, metrics, jsErrors);
    findings.push(...judged.findings);
    return { ran: true, score: judged.score, findings, controls, metrics };
}

/**
 * PRESS WHAT A VISITOR WOULD PRESS — on a page that is ALREADY OPEN.
 *
 * Split out of auditBehaviour so the React path can use the same definition of
 * «this button does nothing» instead of growing a second one. It matters more
 * than it looks: for months the single-file HTML builder pressed every control
 * before delivery while React projects — the newer and more capable front —
 * were handed over with their buttons never once clicked.
 *
 * It takes a page rather than a URL on purpose, so the clicking can happen in
 * the panel he is watching.
 */
export interface ProbeOptions {
    /**
     * SHOW HIM THE CHECK.
     *
     * With a panel session the pointer travels to each control, the control is
     * outlined in red while it is pressed, and the panel's action list names
     * every step — which is what «لا يوجد موشر وتحديد بالاحمر» was asking for.
     * Without one, the probe behaves exactly as it always did.
     */
    watchSessionId?: string;
    eyes?: AuditEyes;
    /** How many controls at most (default 40) and how long at most (60s). */
    maxControls?: number;
    budgetMs?: number;
    /** Fill and submit the forms for real. On by default. */
    fillForms?: boolean;
    /**
     * A form is exercised ONCE per audit, not once per route.
     *
     * A hash route does not rebuild the document, so the contact form on page
     * two is the SAME form — already filled, already submitted. Re-sending it
     * changes nothing, and «nothing changed» is how this audit says «dead». The
     * caller passes one set for the whole walk and the same form is never
     * accused twice.
     */
    seenForms?: Set<string>;
    /** Called before every visible pointer or input action in strict QA. */
    isEyeOpen?: () => boolean;
    onProgress?: (m: string) => void;
}

export async function probeControls(page: any, opts?: ProbeOptions): Promise<{ controls: ControlResult[]; metrics: Record<string, any>; forms?: FormResult[] }> {
    const controls: ControlResult[] = [];
    const metrics: Record<string, any> = {};
    const eyeIsOpen = () => {
        if (!opts?.isEyeOpen) return true;
        const open = opts.isEyeOpen();
        if (!open) metrics.eyeLost = true;
        return open;
    };
    const eyes = opts?.eyes || new AuditEyes({ watchSessionId: opts?.watchSessionId });
    const limit = Math.max(1, Math.min(200, opts?.maxControls ?? MAX_CONTROLS));
    const deadline = Date.now() + Math.max(4000, opts?.budgetMs ?? DEFAULT_BUDGET_MS);
    {
        /**
         * The functions below are compiled by esbuild before they are handed to
         * the browser, and esbuild names them with a `__name` helper that exists
         * in Node and not in the page. Without this line every evaluate throws
         * «__name is not defined» — which is exactly how the React audit was
         * found pressing zero buttons while reporting that it had run.
         */
        await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        const list: Array<{ sel: string; kind: string; label: string; href?: string; ordinal?: number }> =
            await evalInPage(page, findControls, limit);
        metrics.controlsFound = list.length;

        const controlKey = (c: { kind: string; label: string; href?: string; ordinal?: number }) =>
            `${c.kind}|${c.label}|${c.href || ''}|${c.ordinal ?? 0}`;

        // A CSV download has no DOM footprint. Count the app's real download
        // anchor click as an additional browser-side witness, while retaining
        // Playwright's download event when the browser emits one.
        await page.evaluate(`(() => {
            const w = globalThis;
            w.__joeQaDownloadClicks = 0;
            const proto = HTMLAnchorElement.prototype;
            if (proto.__joeQaWrappedClick) return;
            const original = proto.click;
            const wrapped = function () {
                if (this && this.hasAttribute('download')) w.__joeQaDownloadClicks++;
                return original.call(this);
            };
            proto.click = wrapped;
            proto.__joeQaWrappedClick = true;
        })()`).catch(() => { });

        // Anchors are checked without clicking: the question is whether the
        // destination exists, and a page that scrolls is not proof that it does.
        const anchorTargets: Array<{ label: string; target: string; exists: boolean }> = await page.evaluate(() => {
            const out: Array<{ label: string; target: string; exists: boolean }> = [];
            document.querySelectorAll('a[href^="#"]').forEach(a => {
                const h = (a.getAttribute('href') || '').slice(1);
                // Hash-router paths such as #product/classic-edition are app
                // routes, not in-page section anchors. Keep real section
                // targets (for example #contact) strict and measurable.
                if (!h || h === 'top' || h.includes('/')) return;
                let exists = false;
                try { exists = !!document.getElementById(h) || !!document.querySelector(`[name="${CSS.escape(h)}"]`); } catch { exists = false; }
                out.push({ label: ((a as HTMLElement).innerText || h).trim().slice(0, 40), target: h, exists });
            });
            return out.slice(0, 30);
        });
        metrics.anchors = anchorTargets.length;
        const deadAnchors = anchorTargets.filter(a => !a.exists);
        metrics.deadAnchors = deadAnchors.length;

        let budgetHit = false;
        // Each in-app navigation is a real interaction, but it must not strand
        // the remaining controls on the destination route.  Going "back" is
        // unreliable for hash routers: there may be no browser history entry
        // to restore, leaving later controls absent and falsely reported as
        // unreached.  Return to the exact route we started this probe on.
        const probeStartUrl = page.url();
        for (const c of list) {
            if (c.kind === 'anchor') continue;                       // handled above
            if (Date.now() > deadline) { budgetHit = true; break; }
            let effect = '';
            try {
                // Every route link is judged from the route where it was
                // discovered. A previous React navigation may have completed
                // after the snapshot classified its DOM effect, so restore at
                // the start as well as after a detected navigation.
                if (c.kind === 'link' && page.url() !== probeStartUrl) {
                    await page.goto(probeStartUrl, { waitUntil: 'load', timeout: 5000 }).catch(() => { });
                    await page.waitForSelector('a[href^="#/"]', { timeout: 2500 }).catch(() => { });
                    await page.waitForTimeout(250);
                }
                // React is allowed to replace the node after a previous click.
                // Re-discover the same semantic control before calling it dead;
                // a stale data-joe-ctl selector is not evidence of a bad button.
                let current = c;
                let el = await page.$(current.sel);
                if (!el) {
                    const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
                    const replacement = fresh.find((candidate: any) => controlKey(candidate) === controlKey(c));
                    if (replacement) {
                        current = replacement;
                        el = await page.$(current.sel);
                    }
                }
                if (!el && c.kind === 'link' && c.href) {
                    // React may rebuild the route before our temporary
                    // data-joe-ctl stamp is observed. Recover duplicate CTAs
                    // from their durable semantics instead: destination,
                    // accessible text, and occurrence on the restored route.
                    const hash = (() => { try { return new URL(c.href!).hash; } catch { return ''; } })();
                    if (hash) {
                        const candidates = await page.$$(`a[href=${JSON.stringify(hash)}]`).catch(() => []);
                        const matches: any[] = [];
                        for (const candidate of candidates) {
                            const candidateLabel = await candidate.evaluate((node: Element) => {
                                const aria = node.getAttribute('aria-label') || node.getAttribute('title') || '';
                                const visible = ((node as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
                                return aria || visible || node.tagName.toLowerCase();
                            }).catch(() => '');
                            if (candidateLabel === c.label) matches.push(candidate);
                        }
                        el = matches[c.ordinal ?? 0] || null;
                    }
                }
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
                /**
                 * GIVE THE CONTROL A STATE IN WHICH IT COULD POSSIBLY SHOW.
                 *
                 * «إلى الأعلى» pressed while the page is already at the top does
                 * nothing — not because the handler is missing, but because
                 * there is nothing to undo. The integration sweep caught this as
                 * a score going DOWN after a correct repair: making a mouse-only
                 * tile keyboard-reachable exposed it to the probe, and the probe
                 * then called a working button dead.
                 *
                 * A fair test puts the system where the behaviour can manifest.
                 * A small nudge does that for anything scroll-driven and is
                 * invisible to everything else.
                 */
                if (c.kind === 'button' && /(?:back\s+to\s+top|scroll\s+to\s+top|to\s+top|up|\u0644\u0644\u0623\u0639\u0644\u0649|\u0625\u0644\u0649\s+\u0627\u0644\u0623\u0639\u0644\u0649)/iu.test(c.label)) {
                    await page.evaluate(() => {
                        if (document.documentElement.scrollHeight > window.innerHeight + 160) window.scrollBy(0, 120);
                    }).catch(() => { });
                }
                let reachable = await page.evaluate((sel: string) => {
                    const node = document.querySelector(sel) as HTMLElement | null;
                    if (!node) return false;
                    const r = node.getBoundingClientRect();
                    const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
                    const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
                    const top = document.elementFromPoint(x, y);
                    return r.bottom > 0 && r.top < window.innerHeight &&
                        (top === node || !!top && node.contains(top));
                }, current.sel).catch(() => false);
                // A details dialog can legitimately cover a control discovered
                // on the page beneath it. Close only a visible modal, then
                // re-resolve and re-measure the same semantic control. This is
                // recovery from test state, not a waiver of the reachability
                // check: the control is still reported unreachable if recovery
                // cannot expose it.
                if (!reachable) {
                    const covered = await page.evaluate(() => Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"], .modal-backdrop, .record-modal-backdrop'))
                        .some((el: any) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 4 && r.height > 4 && cs.display !== 'none' && cs.visibility !== 'hidden'; })).catch(() => false);
                    if (covered) {
                        await page.keyboard.press('Escape').catch(() => { });
                        await page.waitForTimeout(180).catch(() => { });
                        const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
                        const replacement = fresh.find((candidate: any) => controlKey(candidate) === controlKey(c));
                        if (replacement) {
                            current = replacement;
                            el = await page.$(current.sel);
                            await el?.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                        }
                        reachable = await page.evaluate((sel: string) => {
                            const node = document.querySelector(sel) as HTMLElement | null;
                            if (!node) return false;
                            const r = node.getBoundingClientRect();
                            const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
                            const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
                            const top = document.elementFromPoint(x, y);
                            return r.bottom > 0 && r.top < window.innerHeight && (top === node || !!top && node.contains(top));
                        }, current.sel).catch(() => false);
                    }
                }
                if (!reachable) {
                    controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'not found' });
                    continue;
                }
                /**
                 * THE POINTER GOES THERE, AND THE ELEMENT IS OUTLINED IN RED.
                 *
                 * This happens BEFORE the `before` snapshot on purpose: whatever
                 * the eyes draw is present in both fingerprints, so it can never
                 * be mistaken for something the click did. (The overlay also
                 * lives outside <body>, which the fingerprint reads — belt and
                 * braces, because a self-check that fakes its own evidence is
                 * worse than no self-check.)
                 *
                 * The mouse that travels is the REAL mouse. A menu that opens on
                 * hover opens here, which is the only reason its items can be
                 * catalogued at all.
                 */
                // Menus can legitimately respond to the pointer before the click:
                // desktop dropdowns often open on hover and deliberately keep the
                // panel open when the click follows. If the audit snapshots only
                // after moving the pointer, that valid hover response disappears
                // from the evidence and the follow-up click is a no-op by design.
                // Capture the pre-pointer state so a real hover transition remains
                // measurable rather than being reported as a dead control.
                const beforePointer = c.kind === 'menu'
                    ? await page.evaluate(snapshot).catch(() => null)
                    : null;
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, current.sel), {
                    note: `${KIND_AR[c.kind] || 'عنصر'}: ${c.label}`.slice(0, 64),
                    moveMouse: true,
                });
                if (c.kind === 'menu') await page.waitForTimeout(220).catch(() => { });
                const afterPointer = c.kind === 'menu'
                    ? await page.evaluate(snapshot).catch(() => null)
                    : null;
                const hoverEffect = c.kind === 'menu' ? changed(beforePointer, afterPointer) : '';
                // Snapshot AFTER scrolling into view. Taken before, the audit's own
                // scroll is indistinguishable from the click's effect, and a cart
                // button that really did increment its badge was reported as
                // "scroll" — a true measurement of the wrong thing.
                const before = await page.evaluate(snapshot).catch(() => null);
                const beforeUrl = page.url();
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                /**
                 * …AND A DOWNLOAD IS AN EFFECT.
                 *
                 * «تصدير CSV» hands the visitor a file and changes not one node
                 * of the page. Judged by the DOM alone it is indistinguishable
                 * from a button wired to nothing.
                 */
                let downloaded = false;
                const onDownload = () => { downloaded = true; };
                page.on('download', onDownload);
                const downloadClicksBefore = await page.evaluate('Number(globalThis.__joeQaDownloadClicks || 0)').catch(() => 0);
                // force:true so an overlay does not turn "covered" into "broken".
                if (!eyeIsOpen()) break;
                await el.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
                await page.waitForTimeout(SETTLE_MS);
                const afterUrl = page.url();
                try { page.off('download', onDownload); } catch { /* page may be gone */ }
                const downloadClicks = await page.evaluate('Number(globalThis.__joeQaDownloadClicks || 0)').catch(() => 0);
                const after = await page.evaluate(snapshot).catch(() => null);
                effect = afterUrl !== beforeUrl
                    ? 'navigation'
                    : downloaded || downloadClicks > downloadClicksBefore
                    ? 'download'
                    : (changed(before, after) || (hoverEffect ? `hover:${hoverEffect}` : ''));
                // A submit that reloads the page proves the form is NOT handled —
                // an unhandled submit is the browser's default, not a feature.
                if (c.kind === 'submit' && effect === 'navigation') effect = 'reload';
                if (effect === 'navigation') {
                    await page.goto(probeStartUrl, { waitUntil: 'load', timeout: 5000 })
                        .catch(() => page.goBack({ timeout: 5000 }))
                        .catch(() => { });
                    await page.waitForSelector('a[href^="#/"]', { timeout: 2500 }).catch(() => { });
                    await page.waitForTimeout(250);
                }
            } catch { /* the control itself is what is under test */ }
            controls.push({ label: c.label, kind: c.kind as any, worked: !!effect && effect !== 'reload', effect });
        }
        metrics.budgetExhausted = budgetHit;

        /**
         * EXPLORE THE STATES THAT THE FIRST CATALOGUE COULD NOT SEE.
         *
         * Menus, tabs, carts, dialogs, filters, and route changes can create
         * new controls after the initial snapshot. A fixed list cannot reach
         * them, even when every click in that list is perfectly real. Keep a
         * bounded frontier, re-catalogue after each interaction, and only add
         * controls whose state-aware identity has not been attempted. This is
         * deterministic and auditable, but it is not a memorised click script.
         */
        const initialKeys = new Set(list.map(controlKey));
        const discoveredKeys = new Set(initialKeys);
        const exploredKeys = new Set<string>();
        const stateKeys = new Set<string>();
        const stateKey = (value: any) => {
            try { return JSON.stringify(value).slice(0, 4000); } catch { return ''; }
        };
        const initialState = await page.evaluate(snapshot).catch(() => null);
        if (initialState) stateKeys.add(stateKey(initialState));
        metrics.statesVisited = stateKeys.size;
        metrics.controlsDiscovered = discoveredKeys.size;
        metrics.exploratoryActions = 0;
        const explorationDeadline = Math.min(deadline, Date.now() + Math.max(6000, Math.min(18_000, (opts?.budgetMs || DEFAULT_BUDGET_MS) / 3)));
        let explorationBudgetHit = false;
        opts?.onProgress?.('exploring');
        for (let turn = 0; turn < 12 && Date.now() < explorationDeadline; turn++) {
            const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
            for (const c of fresh as Array<{ kind: string; label: string; href?: string; ordinal?: number }>) discoveredKeys.add(controlKey(c));
            metrics.controlsDiscovered = discoveredKeys.size;
            const candidate = (fresh as Array<{ sel: string; kind: string; label: string; href?: string }>)
                .filter(c => c.kind !== 'anchor')
                .find(c => !initialKeys.has(controlKey(c)) && !exploredKeys.has(controlKey(c)));
            if (!candidate) break;
            const key = controlKey(candidate);
            exploredKeys.add(key);
            let effect = '';
            try {
                if (!eyeIsOpen()) break;
                const el = await page.$(candidate.sel);
                if (!el) continue;
                await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, candidate.sel), {
                    note: `استكشاف ${KIND_AR[candidate.kind] || 'عنصر'}: ${candidate.label}`.slice(0, 64),
                    tone: 'warn', moveMouse: true,
                });
                const before = await page.evaluate(snapshot).catch(() => null);
                if (!eyeIsOpen()) break;
                await el.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
                await page.waitForTimeout(SETTLE_MS);
                const after = await page.evaluate(snapshot).catch(() => null);
                effect = changed(before, after);
                if (effect === 'navigation') {
                    await page.goBack({ timeout: 5000 }).catch(() => { });
                    await page.waitForTimeout(220);
                }
                const afterState = await page.evaluate(snapshot).catch(() => null);
                if (afterState) stateKeys.add(stateKey(afterState));
                metrics.statesVisited = stateKeys.size;
                metrics.exploratoryActions++;
                controls.push({
                    label: candidate.label,
                    bare: candidate.label,
                    kind: candidate.kind as any,
                    worked: !!effect && effect !== 'reload',
                    effect,
                    exploratory: true,
                });
            } catch { /* discovery continues even when one state is hostile */ }
        }
        if (Date.now() >= explorationDeadline) explorationBudgetHit = true;
        metrics.explorationBudgetExhausted = explorationBudgetHit;

        // Does an empty required form actually refuse? Native validation counts.
        const forms = await page.evaluate(() => {
            const out: Array<{ fields: number; required: number; hasSubmit: boolean; guarded: boolean }> = [];
            document.querySelectorAll('form').forEach(f => {
                const fields = f.querySelectorAll('input,textarea,select').length;
                const required = f.querySelectorAll('[required]').length;
                const submit = f.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
                const hasSubmit = !!submit;
                /**
                 * A DISABLED SUBMIT IS VALIDATION.
                 *
                 * Refusing to see that produced a real false blocker: the feed's
                 * composer keeps «Post» disabled until there is text OR a photo,
                 * which is exactly right — a picture with no caption is a post,
                 * and `required` on the textarea would have FORBIDDEN it. The
                 * audit called it «a form that can be submitted empty» and took
                 * eight points off a build for being correct.
                 */
                const guarded = !!submit && (submit as HTMLButtonElement).disabled === true;
                out.push({ fields, required, hasSubmit, guarded });
            });
            return out;
        }).catch(() => []);
        metrics.forms = forms.length;
        metrics.formsWithoutValidation = forms.filter((f: any) => f.fields > 0 && f.required === 0 && !f.guarded).length;

        // Fake buttons: things wired to a click but unreachable by keyboard.
        // A <div onclick> LOOKS identical to a button and works with a mouse —
        // a keyboard or switch-device user cannot even land on it. Real
        // <button>/<a href> are natively focusable; everything else needs
        // tabindex to exist for the Tab key at all.
        const keyboardUnreachable: string[] = await page.evaluate(() => {
            const out: string[] = [];
            const natively = new Set(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'SUMMARY']);
            document.querySelectorAll('[onclick],[role="button"]').forEach(el => {
                const h = el as HTMLElement;
                if (natively.has(h.tagName)) return;
                if (h.tagName === 'A' && h.hasAttribute('href')) return;
                if (h.hasAttribute('tabindex')) return;
                const cs = getComputedStyle(h);
                if (cs.display === 'none' || cs.visibility === 'hidden') return;
                if (out.length < 6) out.push((h.innerText || h.tagName).trim().slice(0, 40) || h.tagName);
            });
            return out;
        }).catch(() => []);
        metrics.keyboardUnreachable = keyboardUnreachable.length;
        (metrics as any).keyboardUnreachableSamples = keyboardUnreachable;
    }

    /* ---- and now the forms are actually FILLED IN and actually SENT ---- */
    let filled: FormResult[] = [];
    if (opts?.fillForms !== false) {
        try {
            const r = await probeForms(page, {
                eyes, budgetMs: Math.max(6000, deadline - Date.now()), seenForms: opts?.seenForms, isEyeOpen: eyeIsOpen,
            });
            filled = r.forms;
            Object.assign(metrics, r.metrics);
        } catch { /* a form that fights back is a finding, not a crash */ }
    }
    return { controls, metrics, forms: filled };
}

/** What a value should be, given the field's own declared type. */
function valueFor(type: string, tag: string): string {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    switch (type) {
        case 'email': return 'joe.qa@example.com';
        case 'tel': return '0555123456';
        case 'number': case 'range': return '3';
        case 'date': return iso;
        case 'month': return iso.slice(0, 7);
        case 'week': return `${today.getFullYear()}-W20`;
        case 'time': return '12:30';
        case 'datetime-local': return `${iso}T12:30`;
        case 'password': return 'JoeQa!2468';
        case 'url': return 'https://example.com';
        case 'color': return '#3b82f6';
        case 'textarea': return 'رسالة اختبار من فحص الجودة الذاتي في جو — Joe self-QA test message.';
        default: return tag === 'textarea' ? 'Joe self-QA test message' : 'Joe QA';
    }
}

/**
 * FILL THE FORM. SEND IT. SAY WHAT HAPPENED.
 *
 * «وتعبئه النماذج» — and until now the audit COUNTED forms. It counted their
 * fields, counted the required ones, and never typed a character into any of
 * them. So a contact form wired to nothing, an «add vendor» screen whose POST
 * 500s, and a sign-in that silently swallows the password all measured
 * identically to a working one.
 *
 * Every field is filled by its declared type through the real keyboard and
 * the real select, the real submit button is pressed, and the outcome is one
 * of four honest answers: it went through, it correctly refused, it reloaded
 * the page (which loses the message), or absolutely nothing happened.
 */
export async function probeForms(
    page: any,
    opts?: { eyes?: AuditEyes; budgetMs?: number; maxForms?: number; seenForms?: Set<string>; isEyeOpen?: () => boolean },
): Promise<{ forms: FormResult[]; metrics: Record<string, any> }> {
    const eyes = opts?.eyes || new AuditEyes({});
    const deadline = Date.now() + Math.max(4000, opts?.budgetMs ?? 30_000);
    const out: FormResult[] = [];
    const metrics: Record<string, any> = { formsFilled: 0, fieldsFilled: 0, formsDeadSubmit: 0, formsValidated: 0, formsReloaded: 0 };
    const eyeIsOpen = () => {
        if (!opts?.isEyeOpen) return true;
        const open = opts.isEyeOpen();
        if (!open) metrics.eyeLost = true;
        return open;
    };

    let forms: any[] = [];
    try {
        forms = await evalInPage(page, findForms, { maxForms: opts?.maxForms ?? MAX_FORMS, maxFields: MAX_FIELDS_PER_FORM }) || [];
    } catch (e: any) {
        // Never silent: a probe that cannot see the forms must say so, or the
        // report claims «0 forms» about a page full of them.
        metrics.formsError = String(e?.message || e).slice(0, 120);
        return { forms: out, metrics };
    }
    metrics.formsSeen = forms.length;

    for (const f of forms) {
        if (Date.now() > deadline) break;
        // Its identity, not its position: the same form on a second route is
        // the same form, and it has already been filled in and sent.
        const key = `${f.label}|${f.fields.map((x: any) => x.type).join(',')}`;
        if (opts?.seenForms) {
            if (opts.seenForms.has(key)) { metrics.formsRepeated = (metrics.formsRepeated || 0) + 1; continue; }
            opts.seenForms.add(key);
        }
        let filledCount = 0;
        if (!eyeIsOpen()) break;
        await eyes.say(page, `تعبئة النموذج: ${f.label}`);
        for (const fld of f.fields) {
            if (Date.now() > deadline) break;
            if (!eyeIsOpen()) break;
            try {
                const el = await page.$(fld.sel);
                if (!el) continue;
                await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, fld.sel), { note: `${fld.type}`, tone: 'warn', moveMouse: true });
                if (fld.tag === 'select') {
                    if (!fld.options.length) continue;
                    await el.selectOption(fld.options[0], { timeout: 2000 });
                } else if (fld.type === 'checkbox' || fld.type === 'radio') {
                    await el.check({ timeout: 2000, force: true });
                } else {
                    // A real fill: the page's own input/change handlers run.
                    await el.fill(valueFor(fld.type, fld.tag), { timeout: 2500 });
                }
                filledCount++;
            } catch { /* one stubborn field must not lose the whole form */ }
        }
        metrics.fieldsFilled += filledCount;
        if (filledCount) metrics.formsFilled++;

        // …and sent, through the button a visitor would press.
        let effect = '';
        try {
            const before = await page.evaluate(snapshot).catch(() => null);
            const stillInvalid = await page.evaluate((sel: string) => {
                const form = document.querySelector(sel) as HTMLFormElement | null;
                return !!form && typeof form.checkValidity === 'function' && !form.checkValidity();
            }, f.sel).catch(() => false);
            if (f.submitSel) {
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, f.submitSel), { note: `إرسال: ${f.label}`, moveMouse: true });
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                if (!eyeIsOpen()) break;
                const sub = await page.$(f.submitSel);
                await sub?.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
            } else {
                await page.evaluate((sel: string) => {
                    const form = document.querySelector(sel) as HTMLFormElement | null;
                    if (form) (form.requestSubmit ? form.requestSubmit() : form.submit());
                }, f.sel).catch(() => { });
            }
            await page.waitForTimeout(650);
            const after = await page.evaluate(snapshot).catch(() => null);
            effect = changed(before, after);
            if (effect === 'navigation') {
                effect = 'reload';
                await page.goBack({ timeout: 5000 }).catch(() => { });
                await page.waitForTimeout(250);
            } else if (!effect && stillInvalid) {
                // The browser refused it — which is the behaviour that was asked
                // for, not a dead form.
                effect = 'validation';
            } else if (effect) {
                effect = 'submitted';
            }
        } catch { /* the form is what is under test */ }

        if (effect === 'submitted') { /* counted by presence in the list */ }
        else if (effect === 'validation') metrics.formsValidated++;
        else if (effect === 'reload') metrics.formsReloaded++;
        else if (f.fields.length) metrics.formsDeadSubmit++;
        out.push({ label: f.label, fields: f.fields.length, filled: filledCount, effect });
    }
    return { forms: out, metrics };
}

/* ---- judgement, on what actually happened ------------------------------ */

/** The verdict, kept separate so both audits reach it by the same road. */
export function judgeBehaviour(
    controls: ControlResult[],
    metrics: Record<string, any>,
    jsErrors: string[] = [],
): { score: number; findings: BehaviourFinding[] } {
    const findings: BehaviourFinding[] = [];
    /**
     *  ⛔ A CONTROL THAT WAS NEVER PRESSED IS NOT A CONTROL THAT DID NOTHING.
     *
     *  Measured by running this audit against a store I had opened and pressed
     *  by hand — the cart badge went 0 -> 1, the drawer showed «الإجمالي 200»,
     *  the order form was there. The audit's own control table said:
     *
     *      DEAD button effect=not found  label=«السلة 0»
     *      DEAD button effect=not found  label=«أضف إلى السلة»   × 6
     *
     *  and the finding it published said «8 من 12 أزرار لا تفعل شيئاً عند
     *  الضغط» — about buttons it never pressed. `not found` means the element
     *  was gone when the click was attempted: the nav links had been pressed
     *  first, the route had moved, and the shop's own controls were no longer
     *  on the page.
     *
     *  ⛔ THE CLASS IS THE MOST EXPENSIVE ONE HERE, BECAUSE IT IS A FALSE
     *  STATEMENT ABOUT A MEASUREMENT: «I pressed it and nothing happened» when
     *  nothing was pressed at all. It made Joe refuse to deliver a working
     *  store, which is worse than a wrong number — it withholds finished work
     *  and gives the owner a reason that is not true.
     *
     *  So the two are separated. A control that could not be reached is
     *  reported as unreachable, and never counted among those that did
     *  nothing. The audit still says it, loudly, because a control the test
     *  could not reach is a real gap in the evidence — it is simply a
     *  different gap from a dead button.
     */
    const pressable = controls.filter(c => c.kind !== 'anchor' && c.effect !== 'not found');
    const unreachable = controls.filter(c => c.kind !== 'anchor' && c.effect === 'not found');
    const dead = pressable.filter(c => !c.worked);
    metrics.pressed = pressable.length;
    metrics.dead = dead.length;
    metrics.unreachable = unreachable.length;

    if (unreachable.length) {
        findings.push({
            code: 'controls_not_reached', severity: 'minor',
            ar: `لم أصل إلى ${unreachable.length} من ${controls.length} زرّاً لأجرّبه: ${unreachable.slice(0, 3).map(d => `«${d.label}»`).join('، ')} — اختفت من الصفحة قبل الضغط، ولا أدّعي أنّها معطوبة`,
            en: `${unreachable.length} of ${controls.length} controls were gone before I could press them: ${unreachable.slice(0, 3).map(d => `"${d.label}"`).join(', ')} — not pressed, so not judged`,
            hint: 'the route moved while the audit was pressing; these were never tested',
        });
    }

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
            /**
             *  ⛔ THE LABELS, AS DATA — so a repairer can FIND the control.
             *
             *  This finding named its offenders inside a sentence and nowhere
             *  else, so anything wanting to repair them had to parse prose to
             *  learn which button was dead. That is the shape that gave `min:`
             *  a pass mark for matching a digit: reading a claim's WORDS
             *  instead of its evidence. `app-audit` already forwards an
             *  `evidence` array when one exists; this fills it.
             */
            evidence: dead.slice(0, 8).map(d => ({ label: d.bare || d.label, kind: d.kind })),
        });
    } else if (dead.length) {
        findings.push({
            code: 'some_dead_controls', severity: 'major',
            ar: `أزرار لا تستجيب: ${dead.slice(0, 3).map(d => `«${d.label}»`).join('، ')}`,
            en: `Unresponsive controls: ${dead.slice(0, 3).map(d => `"${d.label}"`).join(', ')}`,
            hint: 'each of these needs a real click handler or a real href',
            //  Same reason as `dead_controls` above: the offenders as data.
            evidence: dead.slice(0, 8).map(d => ({ label: d.bare || d.label, kind: d.kind })),
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
    /**
     * A FORM THAT WAS FILLED IN AND SENT, AND NOTHING HAPPENED.
     *
     * This is the finding the old audit could not produce at all: it never
     * typed into a field, so «submit does nothing» and «submit works» were the
     * same measurement. It is separate from `dead_controls` on purpose — an
     * empty form's submit button correctly refuses, and that is not this.
     */
    if ((metrics.formsDeadSubmit || 0) > 0) {
        findings.push({
            code: 'form_dead_submit', severity: 'critical',
            ar: `${metrics.formsDeadSubmit} نموذج عُبِّئ بالكامل وأُرسل ولم يحدث شيء إطلاقاً — لا رسالة نجاح ولا خطأ`,
            en: `${metrics.formsDeadSubmit} form(s) were filled in completely and submitted, and nothing happened at all — no success state, no error`,
            hint: 'handle the submit event: send the data, then show a success or an error the visitor can see',
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
    if ((metrics.keyboardUnreachable || 0) > 0) {
        const samples = ((metrics as any).keyboardUnreachableSamples || []).slice(0, 3).map((s: string) => `«${s}»`).join('، ');
        findings.push({
            code: 'keyboard_unreachable', severity: 'major',
            ar: `${metrics.keyboardUnreachable} عنصر قابل للنقر لا يصله زر Tab إطلاقًا${samples ? `: ${samples}` : ''} — مستخدم لوحة المفاتيح لا يستطيع تشغيله`,
            en: `${metrics.keyboardUnreachable} clickable element(s) the Tab key can never reach${samples ? `: ${samples}` : ''} — unusable by keyboard`,
            hint: 'use a real <button>, or add tabindex="0" plus a keydown handler for Enter/Space',
        });
    }

    const penalty: Record<BehaviourFinding['severity'], number> = { critical: 30, major: 14, minor: 5 };
    return { score: Math.max(0, 100 - findings.reduce((s, f) => s + penalty[f.severity], 0)), findings };
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
