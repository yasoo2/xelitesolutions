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
import { applyViewportSize } from './ui-inspection';
import { showsSignInForm, signInThroughPage, type SignInAccount } from './sign-in';
import { casesFor, fillValueFor, markupFieldOf, meaningOf, type FieldCase, type QaField } from './qa-field-cases';
import { intentOf, judgeIntent, readControlState, readFacts, type ControlState, type IntentRead, type PageFacts } from './qa-control-intent';

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
    'controls_not_reached', 'forms_not_reached', 'dead_anchors', 'dead_controls', 'form_dead_submit',
    'form_no_validation', 'form_reloads', 'js_errors', 'keyboard_unreachable',
    'some_dead_controls', 'semantic_input_validation', 'form_persistence_unproven',
    'qa_created_record_not_deletable', 'order_not_kept',
    'markup_executes', 'markup_drawn', 'field_accepts_invalid', 'field_rejects_valid', 'field_case_minor',
    'control_missed_its_job', 'control_job_unseen',
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
    /** Stable occurrence among controls with the same role, name and destination. */
    instance?: number;
    /** Route and viewport in which this evidence was measured. */
    context?: string;
    /** Durable destination evidence for links and in-page anchors. */
    href?: string;
}

/** One form, actually filled in and actually sent. */
export interface FormResult {
    /** What a human would call it — its heading, its submit button, or its id. */
    label: string;
    fields: number;
    filled: number;
    /** 'submitted' | 'validation' | 'refused' | 'reload' | '' (nothing happened at all). */
    effect: string;
    /** Route and viewport where this form was actually exercised. */
    scope?: string;
    /** Semantic fields whose declared type and invalid-value rejection were exercised. */
    semanticFieldsTested?: number;
    /** What it made was found again after a reload (qa-product-profile.ts journeys). */
    persisted?: boolean;
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
/** Keep semantic input validation from being starved by a large control surface. */
const FORM_QA_RESERVE_MS = 20_000;
/** Exploratory presses on one screen, at most: enough to open a menu and try each of its items. */
const MAX_EXPLORATION_TURNS = 30;
/** How far past its deadline a form is still filled, so it is never sent half filled. */
const FILL_GRACE_MS = 6000;

/** A second forms pass added to the first: counts summed, lists joined (a form a press revealed). */
function addFormMetrics(into: Record<string, any>, more: Record<string, any>): void {
    for (const [k, v] of Object.entries(more || {})) {
        if (typeof v === 'number') into[k] = Number(into[k] || 0) + v;
        else if (Array.isArray(v)) into[k] = [...(Array.isArray(into[k]) ? into[k] : []), ...v];
        else if (!(k in into)) into[k] = v;
    }
}

/**
 * A download can be the whole result of a control.  Both the baseline walk and
 * the state-exploration walk use this observer: a button revealed after a form
 * submission must be measured by the same contract as one visible at first.
 */
function observeDownload(page: any) {
    let state: 'none' | 'pending' | 'succeeded' | 'failed' = 'none';
    const onDownload = (download: any) => {
        state = 'pending';
        Promise.resolve(download.failure()).then(error => {
            state = error ? 'failed' : 'succeeded';
        }).catch(() => { state = 'failed'; });
    };
    page.on('download', onDownload);
    return {
        succeeded: () => state === 'succeeded',
        failed: () => state === 'failed',
        stop: () => { try { page.off('download', onDownload); } catch { /* page may be gone */ } },
    };
}

/**
 * A CALL, A MAIL, A MESSAGE HANDED TO THE PHONE'S OWN APP IS AN EFFECT.
 *
 * The ladder, 2026-11-07, L001 (a pharmacy's welcome card): «Call us» opened
 * `tel:` — exactly right — and changed not one node of the page, because a
 * browser with no dialler hands the number on and stays where it is. The
 * probe called it unresponsive, and the builder spent half an hour rewriting
 * a correct button. Chromium says what happened, in its console: «Failed to
 * launch 'tel:…' because the scheme does not have a registered handler».
 */
export const HANDOFF_SCHEME = /Failed to launch '((?:tel|mailto|sms|whatsapp|geo|maps|facetime|tg|viber|skype|intent):[^']*)'/i;
/** Headless Chromium says it otherwise: a request to the scheme, at once aborted (measured). */
export const HANDOFF_URL = /^(?:tel|mailto|sms|whatsapp|geo|maps|facetime|tg|viber|skype|intent):/i;

/**
 * …and after one hand-off Chromium launches no other in that page, silently:
 * measured, «Call us» then «Email us» showed a request for tel: and nothing at
 * all for mailto:. The page's own Navigation API still announces every
 * navigation it starts, before the browser decides, so the page is asked too.
 */
/*
 * The hand-off is recorded and then held back: a browser with no dialler
 * leaves the page «leaving» after it (beforeunload fired, the next press
 * reaches nothing, a reload does not lift it — all measured), while a phone
 * opens its dialler and keeps the page. Held back, the page stays as a phone
 * would keep it, and every other control is still pressed.
 */
const ARM_HANDOFF = `(() => { const w = window; w.__joeHandoff = '';
  if (w.__joeHandoffArmed) return; w.__joeHandoffArmed = true;
  try { w.navigation && w.navigation.addEventListener('navigate', e => { const u = String((e && e.destination && e.destination.url) || '');
    if (/^(?:tel|mailto|sms|whatsapp|geo|maps|facetime|tg|viber|skype|intent):/i.test(u)) { w.__joeHandoff = u; try { if (e.cancelable) e.preventDefault(); } catch (y) { } } }); } catch (x) { } })();`;

function observeHandoff(page: any) {
    let target = '';
    const onConsole = (m: any) => {
        const hit = String(m?.text?.() || '').match(HANDOFF_SCHEME);
        if (hit) target = hit[1];
    };
    const onRequest = (r: any) => {
        const u = String(r?.url?.() || '');
        if (HANDOFF_URL.test(u)) target = u;
    };
    page.on('console', onConsole);
    page.on('request', onRequest);
    return {
        /** Before the press: the page listens, and forgets an earlier hand-off. */
        arm: () => page.evaluate(ARM_HANDOFF).catch(() => undefined),
        target: async () => target || String(await page.evaluate('window.__joeHandoff || ""').catch(() => '') || ''),
        stop: () => {
            try { page.off('console', onConsole); } catch { /* page may be gone */ }
            try { page.off('request', onRequest); } catch { /* page may be gone */ }
        },
    };
}

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

    const out: Array<{ sel: string; kind: string; label: string; href?: string; ordinal: number; disabled?: boolean; stateful?: boolean; language?: boolean }> = [];
    /**
     * A LANGUAGE SWITCH RENAMES EVERY OTHER CONTROL.
     *
     * The hard exam, 2026-11-05, H01: a clinic whose top bar holds «English» and
     * «العربية» ahead of its sidebar. The walk pressed «العربية» third; every
     * label on the page changed language, and «Patients», «Appointments»,
     * «Invoices» … were sought by their English names on an Arabic page —
     * «22 of 34 controls were gone before I could press them», a blocking
     * finding about a clinic whose every screen worked. A reload keeps the
     * chosen language, so restoring the page did not bring them back.
     *
     * A control that names a language (or sits in a language group) is marked
     * here and pressed after every other control of its pass.
     */
    const LANGUAGE_NAME = /^(?:english|arabic|العربية|عربي|عربى|الإنجليزية|الانجليزية|إنجليزي|انجليزي|en|ar|fr|de|es|tr|ع|français|francais|español|espanol|deutsch|türkçe|turkce|italiano|português|portugues|русский|中文|(?:en|ar)\s*[|/]\s*(?:en|ar|ع))$/iu;
    const isLanguageSwitch = (el: Element, text: string) => LANGUAGE_NAME.test(text.replace(/🌐/gu, '').trim())
        || el.hasAttribute('data-lang') || el.hasAttribute('hreflang')
        || !!el.closest('[aria-label*="language" i], [aria-label*="لغة"], [class*="lang-switch"], [class*="language-switch"], [data-lang-switch]');
    /**
     * …AND THE LANGUAGE THE PAGE IS ALREADY IN IS ALREADY ON.
     *
     * The rerun of H01, 2026-11-05: the clinic marked its current language
     * with a class («on»), not with aria-pressed, and «English» pressed on an
     * English page changed nothing — «Unresponsive controls: "English"» about
     * a switch doing exactly what it should. A language control that names
     * the document's own language, or carries an «active / on / selected /
     * current» mark, is the one already on.
     */
    const LANGUAGE_CODE: Array<[RegExp, string]> = [
        [/^(?:english|en|الإنجليزية|الانجليزية|إنجليزي|انجليزي)$/iu, 'en'], [/^(?:arabic|ar|العربية|عربي|عربى|ع)$/iu, 'ar'],
        [/^(?:français|francais|fr)$/iu, 'fr'], [/^(?:español|espanol|es)$/iu, 'es'], [/^(?:deutsch|de)$/iu, 'de'], [/^(?:türkçe|turkce|tr)$/iu, 'tr'],
    ];
    const languageIsCurrent = (el: Element, text: string) => {
        const pageLang = String(document.documentElement.getAttribute('lang') || '').toLowerCase().split('-')[0];
        const code = LANGUAGE_CODE.find(([re]) => re.test(text.replace(/🌐/gu, '').trim()))?.[1] || String(el.getAttribute('data-lang') || el.getAttribute('hreflang') || '').toLowerCase().split('-')[0];
        if (code && pageLang && code === pageLang) return true;
        return /(?:^|\s)(?:active|is-active|on|selected|current)(?:\s|$)/u.test(String(el.getAttribute('class') || '')) || el.getAttribute('aria-current') === 'true';
    };
    const push = (el: Element, kind: string) => {
        if (out.length >= limit || !vis(el)) return;
        const controlLabel = label(el);
        /**
         * Session exit and destructive mutations are scenario boundaries, not
         * safe blind clicks. Pressing Sign out first erased every protected
         * control before the audit reached it; pressing Delete can erase the
         * owner's account or user data. Authentication is proved separately,
         * while deletion belongs in a seeded create/delete scenario that can
         * restore its own record.
         */
        if (/^(?:sign\s*out|log\s*out|logout|تسجيل\s*الخروج|خروج)$/iu.test(controlLabel)
            || /^(?:delete|remove|حذف|إزالة)(?:\s|$)/iu.test(controlLabel)) return;
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
        if (kind === 'link' && routeHref) {
            try {
                const destination = new URL(routeHref, window.location.href);
                const current = new URL(window.location.href);
                const destinationHash = destination.hash || '';
                const currentHash = current.hash || '';
                if (destination.origin === current.origin
                    && destination.pathname.replace(/\/+$/, '') === current.pathname.replace(/\/+$/, '')
                    && destination.search === current.search
                    && destinationHash === currentHash) return;
            } catch { /* malformed links are judged by the normal probe */ }
        }
        /**
         * `aria-pressed` says the same thing in the other vocabulary, and the
         * feed's own filter uses it: «All» is the tab that is already on, so
         * pressing it changes nothing — and the report read «Unresponsive
         * controls: "All"» on a filter that works perfectly.
         */
        if (el.getAttribute('aria-pressed') === 'true') return;
        /**
         * …AND THE SAME SAID BY A CLASS, AMONG ITS SIBLINGS.
         *
         * The ladder, 2026-11-09 (L150, a kanban board): «الكل», the All filter,
         * carried class="active" and no aria-pressed; pressing it changed
         * nothing — correctly — and the board was refused for «Unresponsive
         * controls: "الكل"». A control whose class marks it the current choice
         * (active, selected, current), with siblings of its own kind beside it
         * (a filter, tab or segment group), is the one already on.
         */
        if (/(?:^|\s)(?:active|is-active|selected|is-selected|current|is-current)(?:\s|$)/u.test(String(el.getAttribute('class') || ''))
            && !!el.parentElement && Array.from(el.parentElement.children).some(s => s !== el && s.tagName === el.tagName)) return;
        if (isLanguageSwitch(el, controlLabel) && languageIsCurrent(el, controlLabel)) return;
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
        const href = (el as HTMLAnchorElement).href;
        // "Plan your visit" can appear in the hero and again in the final
        // call-to-action.  Label + destination identifies their behaviour,
        // not their DOM node.  Keep the occurrence too so a re-render restores
        // the matching control instead of repeatedly pressing the first copy.
        const ordinal = out.filter(candidate => candidate.kind === kind
            && candidate.label === controlLabel && (candidate.href || '') === (href || '')).length;
        const stateful = kind === 'menu' || kind === 'summary' || kind === 'tab'
            || el.hasAttribute('aria-expanded') || el.hasAttribute('aria-haspopup')
            || el.hasAttribute('data-menu') || el.hasAttribute('data-filter');
        const language = isLanguageSwitch(el, controlLabel) || undefined;
        out.push({ sel: `[data-joe-ctl="${id}"]`, kind, label: controlLabel, href, ordinal, stateful, language });
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
    // Ordinary buttons — the cart, the counter, the toggle.
    document.querySelectorAll('button, [role="button"]').forEach(el => {
        if (el.closest('form')) return;                 // already covered as submit
        // The state-aware calculator audit below changes values before it
        // presses Reset. A baseline click while the calculator is already at
        // its defaults cannot visibly change anything and is not a fair test.
        if (el.closest('[data-qa-calculator]')) return;
        if (el.matches('[role="tab"], [data-tab], .tab, .filter, [data-filter]')) return;
        if (el.getAttribute('aria-haspopup') === 'dialog') return; // inspect dialogs after their row actions
        push(el, 'button');
    });
    // A record/details opener is a stateful dialog, not a site menu. Discover it
    // after row actions so opening it cannot cover controls that are still to be
    // measured on the same screen.
    document.querySelectorAll('[aria-haspopup="dialog"]').forEach(el => push(el, 'button'));
    // Tabs and filters can replace the whole working surface without changing
    // the URL. Test the controls on the current surface first, then switch it.
    // Frontier discovery will catalogue controls revealed by each new tab.
    document.querySelectorAll('[role="tab"], [data-tab], .tab, .filter, [data-filter]').forEach(el => push(el, 'tab'));
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
    // Controls in transient surfaces must be pressed before any navigation or
    // state reset removes the surface that made them discoverable.
    return out.sort((a, b) => {
        const transient = (item: any) => Number(!!document.querySelector(item.sel)?.closest(
            '[role="dialog"], [role="status"], [aria-live], .modal, .popover, .drawer'));
        return transient(b) - transient(a);
    });
}

/** Runs in the page: catalogue the forms, field by field, for real filling. */
function findForms(o: { maxForms: number; maxFields: number }) {
    const maxForms = o.maxForms, maxFields = o.maxFields;
    // Same reason as the controls above: a hash route keeps the old stamps.
    document.querySelectorAll('[data-joe-form]').forEach(el => el.removeAttribute('data-joe-form'));
    document.querySelectorAll('[data-joe-fld]').forEach(el => el.removeAttribute('data-joe-fld'));
    const forms: Array<{
        sel: string; label: string;
        fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[]; name: string; pattern: string; min: string; max: string; minLength: number; maxLength: number; step: string; inputMode: string }>;
        hasSubmit: boolean; submitSel: string; expectsPersistence: boolean; noValidate: boolean; placesOrder?: boolean;
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
        const fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[]; name: string; pattern: string; min: string; max: string; minLength: number; maxLength: number; step: string; inputMode: string }> = [];
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
            const labelledBy = h.id ? document.querySelector(`label[for="${CSS.escape(h.id)}"]`) : null;
            const name = [h.name, h.id, h.getAttribute('aria-label'), h.getAttribute('placeholder'), labelledBy?.textContent, h.closest('label')?.textContent]
                .filter(Boolean).join(' ').trim().slice(0, 160);
            fields.push({
                sel: `[data-joe-fld="${did}"]`, tag: el.tagName.toLowerCase(), type,
                required: h.required === true, options: options.slice(0, 20), name,
                pattern: h.getAttribute('pattern') || '',
                //  Its own limits: what a tester tries past (qa-field-cases.ts).
                min: h.getAttribute('min') || '', max: h.getAttribute('max') || '',
                minLength: Number(h.getAttribute('minlength') || 0), maxLength: Number(h.getAttribute('maxlength') || 0),
                step: h.getAttribute('step') || '', inputMode: h.getAttribute('inputmode') || '',
            });
        }
        const submit = f.querySelector('button[type="submit"],input[type="submit"],button:not([type])');
        let submitSel = '';
        if (submit) { submit.setAttribute('data-joe-sub', fid); submitSel = `[data-joe-sub="${fid}"]`; }
        // Its name, the way a person would say it: the submit's words, a legend,
        // a heading above it, or — last — the id nobody reads.
        const label = ((submit as HTMLElement)?.innerText
            || (f.querySelector('legend,h1,h2,h3,h4') as HTMLElement)?.innerText
            || f.getAttribute('aria-label') || f.getAttribute('name') || f.id || 'form').trim().replace(/\s+/g, ' ').slice(0, 40);
        const persistenceContext = [
            label, f.getAttribute('aria-label'), f.getAttribute('name'), f.id, f.className, f.getAttribute('action'),
        ].filter(Boolean).join(' ');
        /*
         * ⛔ THIS RUNS IN THE PAGE: IT CALLS NOTHING OF JOE'S.
         *
         * Since 2026-09-23 this line called expectsPersistentRecord — a function
         * of this module, which the page never receives (page.evaluate sends
         * findForms as text). Every findForms threw «expectsPersistentRecord is
         * not defined», probeForms returned «0 forms» with the error in a metric
         * nobody read, and not one form was filled on any delivery for seven
         * weeks (measured 2026-11-10 on L451: 74 controls, 0 fields). The same
         * rule, written out here; expectsPersistentRecord below keeps it for Node.
         */
        const signsIn = /\b(?:sign[ -]?in|log[ -]?in|login|authenticate)\b|سج[ّ]?ل\s+الدخول|تسجيل\s+الدخول|دخول\s+(?:الحساب|إلى\s+الحساب)/i.test(persistenceContext);
        const expectsPersistence = !signsIn && /\b(?:add|create|save|order|register|book|reserve|new record)\b|أضف|اضف|إنشاء|انشاء|حفظ|طلب|تسجيل|حجز|احجز/i.test(persistenceContext);
        /*
         * A shop's checkout places an order: its proof is the order confirmed and the
         * cart emptied. An order kept where the shopper can see it again (a «my
         * orders» list) is better, and its absence is told — never refused: a store
         * with no server has nowhere to keep it, and a real one keeps it on the
         * server, out of the page.
         */
        const placesOrder = /checkout|place (?:the |your |an )?order|confirm (?:the |your )?order|complete (?:the |your )?(?:order|purchase)|pay now|\bpay\b|purchase|\bbuy\b|إتمام الطلب|اتمام الطلب|تأكيد الطلب|أكد الطلب|ادفع|الدفع|شراء|اشتر/i.test(persistenceContext);
        forms.push({ sel: `[data-joe-form="${fid}"]`, label, fields, hasSubmit: !!submit, submitSel, expectsPersistence, noValidate: f.noValidate === true, placesOrder });
    }
    return forms;
}

/**
 * Whether a nav item names the page it is on: its words (without «ال», «the») are in the page's
 * title or main heading, or it is «Home» / «الرئيسية» on the start page.
 */
export function namesCurrentPage(label: string, pageNames: string, url = ''): boolean {
    const norm = (s: string) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/u)
        .filter(Boolean).map(w => w.replace(/^(?:ال|وال|بال|لل)(?=[\u0600-\u06FF]{2,})/u, '').replace(/^the$/u, '')).filter(Boolean);
    const words = norm(label);
    if (!words.length || words.length > 4) return false;
    let start = false;
    try { const u = new URL(url); start = (u.pathname === '/' || /\/index\.html?$/i.test(u.pathname)) && (!u.hash || u.hash === '#' || u.hash === '#/'); } catch { /* no address */ }
    if (start && /^(?:home|homepage|main|الرئيسية|الصفحة الرئيسية|رئيسية|الرئيسيه)$/iu.test(String(label).trim())) return true;
    const page = new Set(norm(pageNames));
    return words.every(w => page.has(w));
}

/** A control that moves a visitor forward first (0), one that takes something away last (2). */
export function forwardRank(label: string): number {
    const s = String(label || '').trim().toLowerCase();
    if (/checkout|proceed|continue|\bnext\b|place (?:the |your )?order|confirm|book now|reserve|\bbuy\b|إتمام|اتمام|متابعة|تابع|التالي|اطلب|تأكيد|احجز|اشتر/iu.test(s)) return 0;
    if (/remove|delete|decrease|\bclear\b|empty|reset|log ?out|sign ?out|حذف|إزالة|ازالة|مسح|إفراغ|افراغ|إنقاص|انقاص|خروج/iu.test(s) || /^(?:-|−|–|×|✕|✖)$/u.test(s)) return 2;
    return 1;
}

/** Whether two addresses are one document (only what follows «#» differs): a jump between them loads nothing. */
export function sameDocumentUrl(a: string, b: string): boolean {
    try {
        const x = new URL(String(a || '')), y = new URL(String(b || ''));
        return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search && (!!x.hash || !!y.hash);
    } catch { return false; }
}

/** Runs in the page: the words of the page's own text (what a submit adds is what is not among them). Self-contained. */
export function pageTokens(): string[] {
    const out = new Set<string>();
    for (const t of String(document.body?.innerText || '').split(/[\s،؛,;:()[\]{}«»"'|—–]+/)) if (t) out.add(t);
    return Array.from(out).slice(0, 30_000);
}

/**
 * Runs in the page: the marks of a record that was not on the page before —
 * in a new row, item or card outside any form and any passing message: a
 * word with a digit (an order number «MC-MHA8ZQ», «#1042», a date, a time),
 * never a bare price, count or percentage. Letters with digits first. Self-contained.
 */
export function newRecordTokens(before: string[]): string[] {
    const known = new Set(before || []);
    const noise = '[role="status"],[role="alert"],[aria-live],.toast,.flash,.snackbar,.notice,form,script,style,template';
    const out: string[] = [];
    const rows = Array.from(document.querySelectorAll('li,tr,article,[role="listitem"],[role="row"],.card,.item,.entry,.record,[data-item],[data-id],[data-row]'));
    for (const el of rows) {
        if (el.closest(noise)) continue;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        for (const t of String((el as HTMLElement).innerText || '').split(/[\s،؛,;:()[\]{}«»"'|—–]+/)) {
            if (t.length < 4 || known.has(t) || out.includes(t)) continue;
            if (!/[0-9٠-٩]/.test(t) || /^[-+]?[0-9٠-٩.,٫٬]+%?$/.test(t)) continue;
            out.push(t);
        }
    }
    const lettered = (t: string) => /[A-Za-z\u0600-\u06FF]/.test(t) ? 1 : 0;
    return out.sort((a, b) => lettered(b) - lettered(a)).slice(0, 12);
}

/** Runs in the page: each visible form, by its fields and its button. Self-contained. */
export function visibleFormPrints(): string[] {
    return Array.from(document.querySelectorAll('form'))
        .filter(f => { const r = (f as HTMLElement).getBoundingClientRect(); return r.width > 2 && r.height > 2; })
        .map(f => Array.from((f as HTMLFormElement).elements)
            .map(e => String((e as HTMLInputElement).name || e.id || (e as HTMLInputElement).type || e.tagName))
            .join(',') + '|' + String(((f.querySelector('[type="submit"],button:not([type="button"])') as HTMLElement | null)?.innerText) || '').trim());
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
        // These handles belong to Joe's instrument, not the application.
        .replace(/\sdata-joe-(?:ctl|form|fld|sub|qbox|qa-[\w-]+)="[^"]*"/gi, '')
        .replace(/\sstyle="\s*"/gi, '');
    return {
        text: hash(text),
        html: hash(html),
        nodes: document.querySelectorAll('body *').length,
        visible, openDetails, active,
        // A theme switch is a user-visible state change even when the app
        // correctly keeps its text, node count, and route intact. The old
        // fingerprint missed `data-theme` and `aria-pressed`, then reported
        // a working accessibility control as dead.
        theme: document.documentElement.getAttribute('data-theme') || '',
        pressed: hash(Array.from(document.querySelectorAll('[aria-pressed]'))
            .map(el => `${el.getAttribute('aria-label') || el.textContent || ''}:${el.getAttribute('aria-pressed') || ''}`)
            .join('|')),
        scroll: Math.round(window.scrollY),
        url: location.href,
        // Digits are how a cart badge, a counter and a total announce themselves.
        // Arabic-Indic digits too: a cart badge on an Arabic page counts
        // «٠ ١ ٢», and `\d` does not match any of them — the click would have
        // looked like it changed nothing.
        digits: hash((text.match(/[0-9٠-٩۰-۹]+/g) || []).join(',')),
        /**
         * …AND WHAT THE VISIBLE FIELDS HOLD.
         *
         * The exam, 2026-11-07 (P076, a warehouse dashboard): the first «تعديل»
         * put the form in edit mode; every later «تعديل» loaded another row
         * into the SAME form — same heading, same scroll, only the values
         * changed — and five working buttons were «unresponsive», four
         * refusals, 88 minutes. A value is what a person reads in a field.
         */
        fields: hash(Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea')).slice(0, 300).map(node => {
            const f = node as HTMLInputElement;
            const r = f.getBoundingClientRect();
            if (r.width <= 2 || r.height <= 2) return '';
            return `${f.name || f.id}:${f.type === 'checkbox' || f.type === 'radio' ? String(f.checked) : String(f.value)}`;
        }).join('|')),
    };
}

function changed(a: any, b: any): string {
    if (!a || !b) return '';
    if (b.theme !== a.theme || b.pressed !== a.pressed) return 'state';
    if (b.openDetails !== a.openDetails) return 'open';
    if (b.active !== a.active) return 'state';
    if (b.url !== a.url) return 'navigation';
    if (Math.abs(b.scroll - a.scroll) > 40) return 'scroll';
    if (b.nodes !== a.nodes || b.visible !== a.visible) return 'dom';
    if (b.digits !== a.digits) return 'count';
    if (b.fields !== a.fields) return 'fields';
    if (b.html !== a.html) return 'dom';
    if (b.text !== a.text) return 'text';
    return '';
}

/** A visible, form-local refusal proves the submit path responded safely. */
export function isVisibleFormRefusal(text: string): boolean {
    const said = String(text || '');
    /*
     * …and a form telling its visitor what is missing or wrong refused him too. L160 (2026-11-10):
     * «Create booking» answered «Car is required» (no car could be chosen yet), the QA read it as
     * «submitted», looked for the booking, and refused the delivery for one never made.
     */
    if (/\b(?:is|are) required\b|\brequired field|\bmust (?:be|contain|have|include|match)\b|\bplease (?:enter|select|choose|fill|provide|correct|add|pick)\b|\binvalid\b|\bnot (?:a )?valid\b|\b(?:cannot|can't|can not) be (?:empty|blank|in the past|before|after)\b|\btoo (?:short|long|many|few)\b|\b(?:select|choose|pick) an? \w+ first\b|مطلوب|إلزامي|الزامي|يجب أن|يجب ان|يرجى|الرجاء|من فضلك|غير صالح|غير صحيح|لا يمكن أن يكون|قصير جد|طويل جد|اختر .{0,20}أولاً/iu.test(said)) return true;
    return /\b(?:unauthori[sz]ed|forbidden|access denied|permission denied|invalid (?:email|password|credentials)|please sign[ -]?in|sign[ -]?in (?:to continue|required)|could not save|unable to save)\b|لم\s+يُ?حفظ|سج[ّ]?ل\s+الدخول|غير\s+صحيح(?:ة)?|لا\s+تملك\s+صلاحية|تعذ[ّ]?ر|مرفوض|خطأ/i.test(String(text || ''));
}

/** A newly visible local success or error is proof that submit reached the product. */
export function hasNewVisibleFormFeedback(before: string, after: string): boolean {
    return String(after || '').trim().length > 0 && String(after || '').trim() !== String(before || '').trim();
}
/** Only a data-creation form, not sign-in, should be required to create a durable row. */
export function expectsPersistentRecord(context: string): boolean {
    const text = String(context || '');
    const authentication = /\b(?:sign[ -]?in|log[ -]?in|login|authenticate)\b|سج[ّ]?ل\s+الدخول|تسجيل\s+الدخول|دخول\s+(?:الحساب|إلى\s+الحساب)/i;
    if (authentication.test(text)) return false;
    return /\b(?:add|create|save|order|register|book|reserve|new record)\b|أضف|اضف|إنشاء|انشاء|حفظ|طلب|تسجيل|حجز|احجز/i.test(text);
}

async function formFeedback(page: any, selector: string): Promise<string> {
    return page.evaluate((sel: string) => {
        const form = document.querySelector(sel) as HTMLElement | null;
        if (!form) return '';
        const scope = form.closest('[role="dialog"],section,article') || form.parentElement || form;
        const visible = (el: Element) => {
            const rect = (el as HTMLElement).getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        return Array.from(scope.querySelectorAll('[role="alert"],[role="status"],[aria-live],.error,.err,.auth-error,.notice,.feedback,[data-error],[data-status]'))
            .filter(visible)
            .map(el => (el as HTMLElement).innerText.trim())
            .filter(Boolean)
            .join('\n')
            .slice(0, 1200);
    }, selector).catch(() => '');
}

/**
 * ⛔ A REFUSAL THE QA ASKED FOR IS NOT A FAULT OF THE PRODUCT.
 *
 * The forms pass sends a form empty, and sends wrong values on purpose; a
 * product that answers 400 / 409 / 422 is doing its job, and the browser still
 * writes «Failed to load resource: 400» in its console. Measured on L451 the
 * first time the forms ran (2026-11-10): «3 console errors, 3 failed requests
 * — 400 /api/v1/projects», two blocking findings about the server refusing
 * exactly what it should. The pass marks the window; the audit's listeners
 * (app-audit onConsole / onResponse) let those refusals pass.
 */
export function expectRefusal(page: any, ms: number): void {
    try { page.__joeQaRefusalUntil = Math.max(Number(page.__joeQaRefusalUntil || 0), Date.now() + ms); } catch { /* a frozen page object */ }
}

/** A refusal inside a window the QA opened: 400, 409 or 422, while the QA was sending what should be refused. */
export function isExpectedRefusal(page: any, status: number, url = '', method = ''): boolean {
    if (Date.now() > Number(page?.__joeQaRefusalUntil || 0)) return false;
    if (status === 400 || status === 409 || status === 422) return true;
    if (status === 404 && /^(?:POST|PUT|PATCH|DELETE)$/i.test(method)) return true;
    //  «No such user» for a username the QA made up: a 404 the product gave a write the QA sent (watchRefusals).
    return status === 404 && !!url && !!page?.__joeQaRefusedUrls?.has?.(url);
}

/**
 * The writes the page sends while the QA works, counted: those the product took
 * (2xx) and those it refused (4xx). A refused write is remembered by its address
 * so its console line is known as the same refusal (isExpectedRefusal).
 */
export function watchWrites(page: any): { saved: () => number; refused: () => number; stop: () => void } {
    let saved = 0;
    let refused = 0;
    let origin = '';
    try { origin = new URL(String(page.url())).origin; } catch { origin = ''; }
    const on = (response: any) => {
        try {
            const method = String(response?.request?.()?.method?.() || '').toUpperCase();
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
            const at = String(response.url());
            if (origin && new URL(at).origin !== origin) return;
            const status = Number(response.status());
            if (status >= 200 && status < 300) { if (method !== 'DELETE') saved++; return; }
            if (status >= 400 && status < 500) {
                refused++;
                if (!page.__joeQaRefusedUrls) page.__joeQaRefusedUrls = new Set<string>();
                page.__joeQaRefusedUrls.add(at);
            }
        } catch { /* a response that cannot be read wrote nothing we know of */ }
    };
    try { page.on('response', on); } catch { /* a page without events */ }
    return { saved: () => saved, refused: () => refused, stop: () => { try { page.off('response', on); } catch { /* gone */ } } };
}

/** What one free-text field is sent with: it must come back as the text it was (probeForms). */
export const MARKUP_PROBE = '<b>qa</b><img src=x onerror="window.__joeQaXss=1">';
/** The major cases a form is sent with, at most: each costs a submit and a wait. */
export const MAX_SUBMITTED_CASES_PER_FORM = 3;

/**
 * One case typed into one field the way a visitor types it (a number field
 * refuses letters at the keyboard; a maxlength cuts what is typed), then left:
 * refused when the field would not take it, did not keep it, or marks itself
 * invalid; accepted when it kept it and holds it valid.
 */
async function tryCaseAtInput(page: any, el: any, sel: string, value: string): Promise<{ rejected: boolean; accepted: boolean; unknown: boolean }> {
    /*
     * A field already marked invalid before this value was typed says nothing about this value.
     * L162 (2026-11-10, the second live check): an earlier wrong case was sent, the store marked
     * «الاسم الكامل» invalid and kept the mark until the next submit; the Arabic name typed after
     * it was «refused» — field_rejects_valid on an Arabic store's name, a blocking refusal.
     */
    const wasMarked = await page.evaluate((s: string) => (document.querySelector(s) as HTMLElement | null)?.getAttribute('aria-invalid') === 'true', sel).catch(() => false);
    let typed = true;
    try { await el.fill(value, { timeout: 1500 }); } catch { typed = false; }
    await page.evaluate((s: string) => { (document.querySelector(s) as HTMLElement | null)?.blur(); }, sel).catch(() => { });
    const state = await page.evaluate((s: string) => {
        const x = document.querySelector(s) as HTMLInputElement | null;
        if (!x) return null;
        return {
            value: String(x.value ?? ''),
            valid: typeof x.checkValidity === 'function' ? x.checkValidity() : true,
            marked: x.getAttribute('aria-invalid') === 'true',
        };
    }, sel).catch(() => null);
    if (!state) return { rejected: false, accepted: false, unknown: true };
    const kept = typed && state.value === value;
    //  The value itself refused (not typed, not kept, invalid by its own constraints) is known whatever the mark says.
    if (!typed || !kept || !state.valid) return { rejected: true, accepted: false, unknown: false };
    if (wasMarked && state.marked) return { rejected: false, accepted: false, unknown: true };
    return { rejected: state.marked, accepted: !state.marked, unknown: false };
}

/** Each field back to the valid value it was given: a sent case, or a saved form, may have changed or cleared it. */
async function refillValid(page: any, values: Map<string, { kind: 'fill' | 'select' | 'check'; value: string }>): Promise<void> {
    for (const [sel, v] of values) {
        const el = await page.$(sel).catch(() => null);
        if (!el) continue;
        if (v.kind === 'select') await el.selectOption(v.value, { timeout: 1500 }).catch(() => { });
        else if (v.kind === 'check') await el.check({ timeout: 1500, force: true }).catch(() => { });
        else await el.fill(v.value, { timeout: 1500 }).catch(() => { });
    }
}

/**
 * Every record the QA itself made and the product kept — found by the QA's
 * nonce in its text, never a visitor's — removed through its own delete
 * control. A product that asks «are you sure?» is answered yes for these.
 * Returns how many were removed.
 */
export async function deleteOwnRecords(page: any, needle: string, max = 4): Promise<number> {
    if (!needle || needle.length < 5) return 0;
    let removed = 0;
    const accept = (dialog: any) => { dialog.accept().catch(() => { }); };
    try { page.on('dialog', accept); } catch { /* a page without dialogs */ }
    try {
        for (let i = 0; i < max; i++) {
            const count = () => page.evaluate((n: string) => Array.from(document.querySelectorAll('li,tr,[role="listitem"],[role="row"],[data-item],[data-row],.row,.item,.card,.entry,article'))
                .filter(el => !el.closest('form') && (el as HTMLElement).innerText.includes(n)).length, needle).catch(() => 0);
            const before = await count();
            if (!before) break;
            const sel = await page.evaluate(({ n, i }: { n: string; i: number }) => {
                const isDelete = (el: Element) => /delete|remove|حذف|إزالة/i.test([el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLElement).innerText].filter(Boolean).join(' '));
                const target = (Array.from(document.querySelectorAll('button,[role="button"],a')) as HTMLElement[]).filter(isDelete).find(el => {
                    const record = el.closest('li,tr,[data-item],[data-row],.row,.item,.card,.entry,article');
                    return !!record && (record as HTMLElement).innerText.includes(n);
                });
                if (!target) return '';
                target.setAttribute('data-joe-qa-own-delete', String(i));
                return `[data-joe-qa-own-delete="${i}"]`;
            }, { n: needle, i }).catch(() => '');
            if (!sel) break;
            await page.$(sel).then((el: any) => el?.click({ timeout: 2500, force: true, noWaitAfter: true })).catch(() => { });
            const until = Date.now() + 2000;
            let after = before;
            while (after >= before && Date.now() < until) { await page.waitForTimeout(150); after = await count(); }
            if (after >= before) break;
            removed++;
        }
    } finally {
        try { page.off('dialog', accept); } catch { /* the page may be gone */ }
    }
    return removed;
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
    let formEvidence: FormResult[] = [];
    const jsErrors: string[] = [];

    let detach = () => { };
    try {
        if (!page) page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        if (borrowed) {
            await applyViewportSize(page, 1280, 900);
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
        formEvidence = probe.forms || [];

        metrics.jsErrors = jsErrors.length;
        opts?.onProgress?.('inspected');
        detach();
        if (!borrowed) { await page.close().catch(() => { }); }
        else {
            try { await applyViewportSize(page, 1280, 900); } catch { }
            try { browserManager.setSessionViewport(opts?.watchSessionId || '', 1280, 900); } catch { }
            opts?.onProgress?.('restored');
        }
    } catch (e: any) {
        detach();
        if (!borrowed && browser) { try { await browser.close(); } catch { } }
        return { ...empty, skipped: `behaviour audit failed: ${e?.message || e}` };
    }
    if (!borrowed && browser) { try { await browser.close(); } catch { } }

    const judged = judgeBehaviour(controls, metrics, jsErrors, formEvidence);
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
     * Restore the route before each baseline control after the first action.
     * Responsive passes use this so a menu, edit action, or theme switch cannot
     * remove a later control before that control receives its own phone/tablet
     * test. Every control is still really pressed at that viewport.
     */
    isolateBaselineControls?: boolean;
    /**
     * ⛔ A CONTROL PRESSED ON THE DESKTOP IS CHECKED, NOT PRESSED AGAIN, AT ANOTHER WIDTH.
     *
     * The owner, 2026-11-10: «ويكون أسرع». Measured on L451: 66 s of a 108 s
     * walk went to the tablet and phone passes pressing again — a reload
     * before each — the very controls the desktop walk had pressed. What a
     * narrower screen can break is reaching the control (covered by a sticky
     * header, pushed off screen); that is still measured for every one of
     * these labels, and a control only this width shows (the ☰ menu, a bottom
     * bar) is still pressed and explored.
     */
    reachOnly?: Set<string>;
    /**
     * ⛔ A DESTINATION PROVEN ONCE IS NOT TRAVELLED AGAIN FROM EVERY SCREEN.
     *
     * The owner, 2026-11-10: «ويكون أسرع». Measured on L451: the bar's «Projects»,
     * «Wiki», «Settings» were pressed on every one of twelve screens — a page
     * left and the screen reloaded each time — 93 navigations in one walk. A
     * link whose destination this walk already reached by a press is checked
     * within reach here, not travelled again; the walk shares the set.
     */
    pressedHrefs?: Set<string>;
    /**
     * ⛔ …NOR A BUTTON THAT ALREADY TOOK THE WALK TO ITS SCREEN.
     *
     * L160 (2026-11-10, a car rental admin): «Summary», «Cars», «Bookings»,
     * «Customers» were buttons that set the address's #view. The walk pressed
     * them on every screen and in every exploration turn — «Summary» nine
     * times on one screen — and walked none of the screens they open, because
     * only links were read as screens. A button whose press landed on another
     * address of the product is recorded (metrics.landedOn: the walk walks that
     * screen, app-audit learnRoutes) and, like a travelled link, is checked
     * within reach on the other screens, not pressed again. The walk shares it.
     */
    travelled?: Set<string>;
    /** Reapply the borrowed-panel layout size after any isolating reload. */
    baselineViewport?: { width: number; height: number };
    /**
     * The account the audit signed in with: a restore that lands on the
     * sign-in form signs in again, so a product that loses its session on a
     * reload (said once, as `session_lost_on_reload`) still has every control
     * behind its sign-in measured, not reported «gone» (sign-in.ts).
     */
    signIn?: SignInAccount;
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
    /** Stable route/viewport identity for form evidence. */
    formScope?: string;
    /** Route identity used when correlating this evidence with a tested control. */
    formContext?: string;
    /** Called before every visible pointer or input action in strict QA. */
    isEyeOpen?: () => boolean;
    onProgress?: (m: string) => void;
}

export async function probeControls(page: any, opts?: ProbeOptions): Promise<{ controls: ControlResult[]; metrics: Record<string, any>; forms?: FormResult[] }> {
    const controls: ControlResult[] = [];
    const metrics: Record<string, any> = {};
    // Retain form evidence after the bounded control pass completes.
    let filled: FormResult[] = [];
    const eyeIsOpen = () => {
        if (!opts?.isEyeOpen) return true;
        const open = opts.isEyeOpen();
        if (!open) metrics.eyeLost = true;
        return open;
    };
    const eyes = opts?.eyes || new AuditEyes({ watchSessionId: opts?.watchSessionId });
    const limit = Math.max(1, Math.min(200, opts?.maxControls ?? MAX_CONTROLS));
    const totalBudgetMs = Math.max(4000, opts?.budgetMs ?? DEFAULT_BUDGET_MS);
    // Button exploration is useful, but a quality run that never reaches its
    // forms cannot prove the input contract the user relies on. Reserve a
    // bounded slice for real field filling and semantic invalid-value checks.
    const controlBudgetMs = opts?.fillForms === false
        ? totalBudgetMs
        : Math.max(4000, totalBudgetMs - Math.min(FORM_QA_RESERVE_MS, Math.floor(totalBudgetMs / 3)));
    const deadline = Date.now() + controlBudgetMs;
    //  The forms' own slice: what the controls left, PLUS the reserve kept for them (it was never given:
    //  forms were handed «deadline − now» from the controls' own deadline, 6 s at most once they ran).
    const formsDeadline = deadline + (totalBudgetMs - controlBudgetMs);
    /** The forms this probe has tried: the caller's set across a walk, or its own (a form is filled once). */
    const seenFormsHere: Set<string> = opts?.seenForms || new Set<string>();
    {
        /**
         * The functions below are compiled by esbuild before they are handed to
         * the browser, and esbuild names them with a `__name` helper that exists
         * in Node and not in the page. Without this line every evaluate throws
         * «__name is not defined» — which is exactly how the React audit was
         * found pressing zero buttons while reporting that it had run.
         */
        await page.evaluate('globalThis.__name = globalThis.__name || (function (f) { return f; });').catch(() => { });
        const found: Array<{ sel: string; kind: string; label: string; href?: string; ordinal?: number; language?: boolean }> =
            await evalInPage(page, findControls, limit);
        //  A language switch renames every other control: pressed last (findControls).
        const list = [...found.filter(c => !c.language), ...found.filter(c => c.language)];
        metrics.controlsFound = list.length;
        //  Where a probe's time goes, part by part (said by the walk for each width; the owner asked it to be faster).
        let phaseLast = Date.now();
        metrics.phaseMs = {};
        const phase = (name: string) => { const now = Date.now(); metrics.phaseMs[name] = (metrics.phaseMs[name] || 0) + (now - phaseLast); phaseLast = now; };

        const controlKey = (c: { kind: string; label: string; href?: string; ordinal?: number }) =>
            `${c.kind}|${c.label}|${c.href || ''}|${c.ordinal ?? 0}`;
        const semanticControlKey = (c: { kind: string; label: string; href?: string }) =>
            `${c.kind}|${c.label}|${c.href || ''}`;
        const replacementFor = (fresh: any[], original: any) =>
            // Equivalent to: const replacement = fresh.find(candidate =>
            // controlKey(candidate) === controlKey(c)); keep the semantic
            // fallback below because React may shift duplicate ordinals.
            fresh.find((candidate: any) => controlKey(candidate) === controlKey(original))
            // Row deletion can shift duplicate ordinals. An equivalent live
            // control with the same role, name and destination is still the
            // same behaviour and is better evidence than an obsolete stamp.
            || fresh.find((candidate: any) => semanticControlKey(candidate) === semanticControlKey(original));
        const handleLabel = (handle: any) => handle?.evaluate((node: Element) => {
            const aria = node.getAttribute('aria-label') || node.getAttribute('title') || '';
            const visible = ((node as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
            return aria || visible || node.tagName.toLowerCase();
        }).catch(() => '');
        const stableHandle = async (original: any, handle: any) => {
            // Framework re-renders may remove Joe's temporary stamp and reuse
            // the same selector on another node between observation and click.
            // Re-check the accessible identity at the last possible moment.
            if (handle && await handleLabel(handle) === original.label) return handle;
            const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
            const replacement = replacementFor(fresh, original);
            return replacement ? page.$(replacement.sel) : null;
        };

        // Anchors are checked without clicking: the question is whether the
        // destination exists, and a page that scrolls is not proof that it does.
        const anchorTargets: Array<{ label: string; target: string; exists: boolean; present?: boolean }> = await page.evaluate(() => {
            const out: Array<{ label: string; target: string; exists: boolean; present?: boolean }> = [];
            document.querySelectorAll('a[href^="#"]').forEach(a => {
                const h = (a.getAttribute('href') || '').slice(1);
                // Hash-router paths such as #product/classic-edition are app
                // routes, not in-page section anchors. Keep real section
                // targets (for example #contact) strict and measurable.
                if (!h || h === 'top' || h.includes('/')) return;
                let exists = false;
                let present = false;
                try {
                    const target = document.getElementById(h) || document.querySelector(`[name="${CSS.escape(h)}"]`);
                    present = !!target;
                    if (target) {
                        const rect = target.getBoundingClientRect();
                        let visible = rect.width > 2 && rect.height > 2;
                        let node: Element | null = target;
                        while (visible && node) {
                            const style = getComputedStyle(node);
                            visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
                            node = node.parentElement;
                        }
                        exists = visible;
                    }
                } catch { exists = false; }
                out.push({ label: ((a as HTMLElement).innerText || h).trim().slice(0, 40), target: h, exists, present });
            });
            return out.slice(0, 30);
        });
        metrics.anchors = anchorTargets.length;
        const deadAnchors = anchorTargets.filter(a => !a.exists);
        metrics.deadAnchors = deadAnchors.length;
        // In-page links are verified by resolving their destination rather than
        // by clicking and disturbing the rest of the control walk. Preserve
        // that real measurement in the same evidence stream as pressed controls
        // so acceptance gates can prove a specifically requested CTA.
        const anchorControls = anchorTargets.map((anchor, instance) => ({
            label: anchor.label,
            kind: 'anchor' as const,
            worked: anchor.exists,
            effect: anchor.exists ? 'target' : '',
            instance,
            href: `#${anchor.target}`,
        }));
        controls.push(...anchorControls);

        let budgetHit = false;
        let attemptedControls = 0;
        /** Whether the last control of the walk was really pressed (an Escape after it closes what it opened). */
        let lastWasPressed = false;
        let baselineMayBeDirty = false;
        /** Whether a press of this walk took something away (remove, decrease, clear, delete): what vanished after it is the walk's doing. */
        let tookAway = false;
        // Each in-app navigation is a real interaction, but it must not strand
        // the remaining controls on the destination route.  Going "back" is
        // unreliable for hash routers: there may be no browser history entry
        // to restore, leaving later controls absent and falsely reported as
        // unreached.  Return to the exact route we started this probe on.
        const probeStartUrl = page.url();
        //  The start's text, by which a jump inside the document is known to have drawn the start again (restoreProbeStart).
        const probeStartText = await page.evaluate(snapshot).then((s: any) => s?.text).catch(() => null);
        //  The forms the start shows: a press that shows another is a form to fill where it appeared.
        const initialFormPrints = new Set<string>(await evalInPage(page, visibleFormPrints).catch(() => [] as string[]));
        const revealedPrints = new Set<string>();
        const revealedEarly: { forms: FormResult[]; metrics: Record<string, any> } = { forms: [], metrics: {} };
        /** A press that landed on another address of the product: that screen is walked (app-audit), and the button is not pressed again elsewhere. */
        const noteLanding = (c: { kind: string; label: string }) => {
            const at = String(page.url() || '');
            if (at && at !== probeStartUrl) {
                const landed: string[] = (metrics.landedOn = Array.isArray(metrics.landedOn) ? metrics.landedOn : []);
                if (!landed.includes(at)) landed.push(at);
            }
            if (c.kind !== 'link' && c.kind !== 'anchor' && c.kind !== 'submit') opts?.travelled?.add(c.label);
        };
        /**
         * ⛔ A CONTROL THE WALK'S OWN PRESSES TOOK AWAY IS NOT ONE IT COULD NOT REACH.
         *
         * The hard sample, 2026-11-09 (L451, a project tracker's board): each
         * card offers «→ In Progress», «→ Review», «→ Done» for the moves its
         * workflow allows. The walk pressed one, the server kept the move, and
         * the baseline the walk restored was another board: the card's other
         * moves were gone — or, once the builder drew every move on every card,
         * disabled — and «2 of 58 controls were gone before I could press them»
         * refused a working board six times in 35 minutes. A control missing from
         * the restored baseline is told apart: the product still shows it and
         * declines it in this state («declined», as a control disabled from the
         * start is never pressed), or the walk's own presses wrote to the product
         * and the page it was found on no longer exists («consumed»). Neither is
         * pressed, neither is judged dead, neither is «gone before I could press».
         */
        let wroteToProduct = false;
        const probeOrigin = (() => { try { return new URL(probeStartUrl).origin; } catch { return ''; } })();
        const onWrite = (response: any) => {
            try {
                const method = String(response?.request?.()?.method?.() || '').toUpperCase();
                if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || Number(response.status()) >= 400) return;
                if (probeOrigin && new URL(String(response.url())).origin !== probeOrigin) return;
                wroteToProduct = true;
            } catch { /* a response that cannot be read wrote nothing we know of */ }
        };
        try { page.on('response', onWrite); } catch { /* a page without events */ }
        //  The refused writes of this probe, remembered by address (isExpectedRefusal), and the mark of its document.
        const probeWrites = watchWrites(page);
        const docMark = `doc-${Date.now().toString(36)}`;
        /** Whether a press did the job its words promise (qa-control-intent.ts), judged on the page read before and after it. */
        const judgeJob = async (label: string, sel: string, effectNow: string, job: IntentRead, factsBefore: PageFacts | null, stateBefore: ControlState | null) => {
            if (job.intent === 'none' || !factsBefore) return;
            let met: boolean | null = null;
            //  A cart that counts after its request answers is given a moment before it is called wrong.
            const until = Date.now() + 1500;
            do {
                const factsAfter = await evalInPage(page, readFacts).catch(() => null);
                const stateAfter = job.intent === 'toggle' ? await page.evaluate(readControlState, sel).catch(() => null) : null;
                met = judgeIntent(job, factsBefore, factsAfter, { before: stateBefore, after: stateAfter }, effectNow);
                if (met !== false) break;
                await page.waitForTimeout(200).catch(() => { });
            } while (Date.now() < until);
            if (met === null) return;
            metrics.intentsJudged = Number(metrics.intentsJudged || 0) + 1;
            if (met) {
                metrics.intentsMet = Number(metrics.intentsMet || 0) + 1;
                //  Counted by job too: a store's journey asks whether any «add to cart» did its job (qa-product-profile.ts).
                metrics.intentsMetBy = { ...(metrics.intentsMetBy || {}), [job.intent]: Number(metrics.intentsMetBy?.[job.intent] || 0) + 1 };
            }
            else {
                //  What was read, so the builder sees the number that did not move (a cart's badge before and after).
                const seen = job.intent === 'add_to_cart' ? await evalInPage(page, readFacts).then((x: PageFacts) => ({ cartsBefore: factsBefore.cartBadges?.length ? factsBefore.cartBadges : factsBefore.carts, cartsAfter: x.cartBadges?.length ? x.cartBadges : x.carts })).catch(() => ({})) : {};
                (metrics.intentFailures = metrics.intentFailures || []).push({ label, intent: job.intent, ar: job.ar, en: job.en, weight: job.weight, ...seen });
            }
        };
        const goneByTheWalk = async (c: { label: string }): Promise<'' | 'declined' | 'consumed'> => {
            const declined = await page.evaluate((want: string) => Array.from(document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"], a'))
                .some((node: any) => {
                    if (!(node.disabled === true || node.getAttribute('aria-disabled') === 'true')) return false;
                    const text = String(node.innerText || node.value || '').trim().replace(/\s+/g, ' ').slice(0, 48);
                    const name = node.getAttribute('aria-label') || node.getAttribute('title') || '';
                    return text === want || name === want;
                }), c.label).catch(() => false);
            if (declined) return 'declined';
            /*
             * …and so is one the walk's own «remove», «decrease» or «clear» took away with
             * its line. The fifth live check, 2026-11-10 (L162, an Arabic store, phone
             * width): «إنقاص» emptied a cart line held in the browser, the line's «زيادة
             * كمية» went with it, and «1 of 22 controls were gone» refused the store three
             * times — no server write, so it was never «consumed».
             */
            return wroteToProduct || tookAway ? 'consumed' : '';
        };
        /**
         * ⛔ THE BASELINE INCLUDES WHERE THE PAGE WAS SCROLLED.
         *
         * A reload keeps the scroll position the last press left, not the one
         * the probe started from. The exam, 2026-11-03 (P204, a gym store at
         * tablet width): after «Equipment» the page sat 120px down, the
         * category chips were under the sticky header, and the reload meant
         * to restore them kept them there — «Supplements», «Apparel» and
         * «Accessories» were «gone before I could press them», six refusals.
         */
        const probeStartScroll = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY })).catch(() => ({ x: 0, y: 0 }));
        const restoreProbeStart = async () => {
            if (page.url() === probeStartUrl) {
                await page.reload({ waitUntil: 'load', timeout: 5000 }).catch(() => { });
            } else if (sameDocumentUrl(page.url(), probeStartUrl)) {
                /*
                 * ⛔ AN ADDRESS THAT DIFFERS ONLY AFTER ITS «#» IS NOT A WAY BACK BY ITSELF.
                 *
                 * L160: going from «/#cars» to «/» (or «/#summary») is a jump inside
                 * the same document — nothing loads, and a product that reads its
                 * #view only when the page loads stays on Cars. Every «restore»
                 * left the walk on the screen it had just left. A router that
                 * answers the jump draws the start again (its text is the start's);
                 * one that does not is loaded again.
                 */
                await page.goto(probeStartUrl, { waitUntil: 'load', timeout: 5000 }).catch(() => { });
                await page.waitForTimeout(250).catch(() => { });
                const nowText = await page.evaluate(snapshot).then((s: any) => s?.text).catch(() => null);
                if (nowText !== probeStartText) await page.reload({ waitUntil: 'load', timeout: 5000 }).catch(() => { });
            } else {
                await page.goto(probeStartUrl, { waitUntil: 'load', timeout: 5000 }).catch(() => { });
            }
            if (opts?.baselineViewport) {
                await applyViewportSize(page, opts.baselineViewport.width, opts.baselineViewport.height).catch(() => { });
            }
            //  A product that lost its session on the reload is signed in to again (ProbeOptions.signIn).
            if (opts?.signIn) {
                await page.waitForTimeout(300).catch(() => { });
                if (await showsSignInForm(page)) await signInThroughPage(page, opts.signIn, { timeoutMs: 8_000 }).catch(() => undefined);
            }
            await page.evaluate((at: { x: number; y: number }) => window.scrollTo(at.x, at.y), probeStartScroll).catch(() => { });
            await page.waitForTimeout(180).catch(() => { });
        };
        /**
         * ⛔ A TAB'S SECTION IS HIDDEN UNTIL ITS TAB IS PRESSED.
         *
         * The ladder, 2026-11-09 (L155, a photo studio's admin): «#sessions»,
         * «#clients», «#albums» each showed its own section and hid the others,
         * the commonest single-page layout there is. Read without a press, every
         * hidden one was «a section that is missing or not visible», the delivery
         * was refused, and the model rebuilt its navigation as pages. A link whose
         * section IS in the page but hidden is pressed once, and the section is
         * read again (a link with no section at all: below). The page is put
         * back where the probe started before anything else is pressed.
         */
        /*
         * ⛔ AND A HASH THAT A ROUTER ANSWERS IS A PAGE, NOT A MISSING SECTION.
         *
         * The hard sample, 2026-11-09 (L352, a coffee shop's ERP): «#inventory»,
         * «#sales», «#invoices» — eleven links of a router that renders each page
         * into one #view on hashchange; no element is called «inventory», and at
         * three widths the walk counted «33 navigation link(s) point at a section
         * that is missing». A link with no section is pressed too, and compared
         * with what an address the app does not know shows from the same place:
         * it works when its press changed the page AND the page is not what an
         * unknown address leaves (a router that ignores it changes nothing; a
         * page that hides every section on an unknown hash goes blank). The link
         * to the page already open changes nothing the first time, so a link that
         * changed nothing is tried once more after the others have moved the page.
         */
        const pressLink = (h: string) => evalInPage(page, function (target: string) {
            var links = Array.prototype.slice.call(document.querySelectorAll('a[href="#' + target + '"]'));
            for (var k = 0; k < links.length; k++) {
                var r = links[k].getBoundingClientRect();
                if (r.width > 2 && r.height > 2) { links[k].click(); return true; }
            }
            return false;
        }, h).catch(() => false);
        const sectionShown = (h: string) => evalInPage(page, function (target: string) {
            var el = document.getElementById(target);
            if (!el) return false;
            var rect = el.getBoundingClientRect();
            var visible = rect.width > 2 && rect.height > 2;
            var node: Element | null = el;
            while (visible && node) {
                var style = getComputedStyle(node);
                visible = style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0.05;
                node = node.parentElement;
            }
            return visible;
        }, h).catch(() => false);
        const pageNow = () => page.evaluate(snapshot).catch(() => null);
        const samePage = (x: any, y: any) => !!x && !!y && !changed({ ...x, url: '', scroll: 0 }, { ...y, url: '', scroll: 0 });
        const setHash = (h: string) => evalInPage(page, function (v: string) { location.hash = v; return true; }, h).catch(() => false);
        const settle = () => page.waitForTimeout(350).catch(() => { });
        /** 'worked' | 'still' (changed nothing from here) | 'dead' */
        const routes = async (h: string): Promise<'worked' | 'still' | 'dead'> => {
            const here = String(await page.evaluate(() => location.hash).catch(() => ''));
            const before = await pageNow();
            await setHash('joe-no-such-page'); await settle();
            const unknown = await pageNow();
            await setHash(here.replace(/^#/, '')); await settle();
            const back = await pageNow();
            if (!await pressLink(h)) return 'dead';
            await settle();
            const after = await pageNow();
            if (samePage(after, back || before)) return 'still';
            return samePage(after, unknown) ? 'dead' : 'worked';
        };
        const toRecheck = anchorTargets.map((a, i) => ({ a, i })).filter(x => !x.a.exists).slice(0, 16);
        if (toRecheck.length) {
            const credit = (i: number, effect: string) => {
                anchorTargets[i].exists = true;
                anchorControls[i].worked = true;
                anchorControls[i].effect = effect;
                /*
                 * ⛔ …AND A PAGE IS A SCREEN THE WALK WALKS.
                 *
                 * The third live check, 2026-11-10 (L160, a car rental admin): its nav was
                 * «#summary», «#cars», «#bookings», «#customers» — a router answering each
                 * hash. Proven pages here, they were never walked: «1 screen, 0 pressed, 0
                 * forms», the whole admin unseen behind its summary, and the delivery passed
                 * on that. A hash a router answers, or a tab's section it shows, is an
                 * address this press landed on (metrics.landedOn): app-audit walks it as a
                 * screen, and one that opens on the same view costs a look.
                 */
                try {
                    const at = new URL(`#${anchorTargets[i].target}`, probeStartUrl).href;
                    const landed: string[] = (metrics.landedOn = Array.isArray(metrics.landedOn) ? metrics.landedOn : []);
                    if (!landed.includes(at)) landed.push(at);
                } catch { /* an address that cannot be read is not a screen */ }
            };
            const still: Array<{ a: typeof anchorTargets[number]; i: number }> = [];
            for (const { a, i } of toRecheck) {
                if (opts?.isEyeOpen && !opts.isEyeOpen()) break;
                if (a.present) {
                    //  A section in the page, hidden until its tab is pressed.
                    if (!await pressLink(a.target)) continue;
                    await settle();
                    if (await sectionShown(a.target)) credit(i, 'target');
                    continue;
                }
                const r = await routes(a.target);
                if (r === 'worked') credit(i, 'navigation');
                else if (r === 'still') still.push({ a, i });
            }
            for (const { a, i } of still) {
                if (opts?.isEyeOpen && !opts.isEyeOpen()) break;
                if (await routes(a.target) === 'worked') credit(i, 'navigation');
            }
            await restoreProbeStart();
            metrics.deadAnchors = anchorTargets.filter(a => !a.exists).length;
        }
        /**
         * Can a person press it here: in view, and the topmost thing at its
         * centre? A sticky header or a fixed bar covers a control the page has
         * scrolled under; a person scrolls it to the middle of the screen, so
         * the probe does that once before calling it covered. A modal, an
         * overlay or a drawer over the whole row still covers it there.
         */
        const reachableNow = (sel: string) => page.evaluate((s: string) => {
            const node = document.querySelector(s) as HTMLElement | null;
            if (!node) return false;
            const r = node.getBoundingClientRect();
            const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 1);
            const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 1);
            const top = document.elementFromPoint(x, y);
            return r.bottom > 0 && r.top < window.innerHeight && (top === node || !!top && node.contains(top));
        }, sel).catch(() => false);
        const reachableOnScreen = async (sel: string) => {
            if (await reachableNow(sel)) return true;
            await page.evaluate((s: string) => document.querySelector(s)?.scrollIntoView({ block: 'center', inline: 'nearest' }), sel).catch(() => { });
            await page.waitForTimeout(80).catch(() => { });
            return reachableNow(sel);
        };
        /*
         * ⛔ CONTROLS ONLY CHECKED WITHIN REACH ARE CHECKED TOGETHER.
         *
         * L451 (2026-11-10): a tablet or phone pass spent ~0.5 s on each control
         * it only had to find within reach — a scroll, a wait and a reading,
         * one round trip each — 4-6 s a screen, two minutes a walk. Those
         * controls (pressed on the desktop, or a link to a place already
         * reached) are scrolled to and read in ONE pass in the page; a control
         * that is not found within reach there takes the full road below, with
         * its recoveries (a covering dialog, the baseline restored).
         */
        phase('prep');
        const checkOnly = (c: { kind: string; label: string; href?: string }) => c.kind !== 'anchor'
            && (!!opts?.reachOnly?.has(c.label) || (c.kind === 'link' && !!c.href && !!opts?.pressedHrefs?.has(c.href))
                || (c.kind !== 'link' && c.kind !== 'submit' && !!opts?.travelled?.has(c.label)));
        const reachedTogether = new Set<string>();
        const together = list.filter(checkOnly);
        if (together.length) {
            const within: boolean[] = await page.evaluate((sels: string[]) => sels.map(sel => {
                const el = document.querySelector(sel) as HTMLElement | null;
                if (!el) return false;
                //  At once: a page with smooth scrolling would be read before it arrived.
                el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
                const r = el.getBoundingClientRect();
                if (r.width < 2 || r.height < 2) return false;
                const x = r.left + r.width / 2;
                const y = r.top + r.height / 2;
                if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
                const top = document.elementFromPoint(x, y);
                return top === el || (!!top && el.contains(top));
            }), together.map(c => c.sel)).catch(() => [] as boolean[]);
            together.forEach((c, i) => { if (within[i]) reachedTogether.add(controlKey(c)); });
            await page.evaluate((at: { x: number; y: number }) => window.scrollTo(at.x, at.y), probeStartScroll).catch(() => { });
        }
        phase('together');
        for (const c of list) {
            if (c.kind === 'anchor') continue;                       // handled above
            if (Date.now() > deadline) { budgetHit = true; break; }
            if (reachedTogether.has(controlKey(c))) {
                controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'reached', instance: c.ordinal, href: c.href });
                metrics.reachedOnly = Number(metrics.reachedOnly || 0) + 1;
                continue;
            }
            let effect = '';
            try {
                if (opts?.isolateBaselineControls && baselineMayBeDirty) {
                    await restoreProbeStart();
                    baselineMayBeDirty = false;
                }
                // Each catalogue control belongs to the initial page state. A
                // previous button may have opened a dialog or drawer over the
                // next one; Escape restores transient UI without paying for a
                // full reload before every click.
                //  Only after a real press: a control only checked within reach opened nothing to close (reachOnly).
                if (attemptedControls++ > 0 && lastWasPressed) {
                    await page.keyboard.press('Escape').catch(() => { });
                    await page.waitForTimeout(120).catch(() => { });
                }
                lastWasPressed = false;
                // Every route link is judged from the route where it was
                // discovered. A previous React navigation may have completed
                // after the snapshot classified its DOM effect, so restore at
                // the start as well as after a detected navigation.
                if (c.kind === 'link' && page.url() !== probeStartUrl) {
                    await restoreProbeStart();
                    await page.waitForSelector('a[href^="#/"]', { timeout: 2500 }).catch(() => { });
                }
                // React is allowed to replace the node after a previous click.
                // Re-discover the same semantic control before calling it dead;
                // a stale data-joe-ctl selector is not evidence of a bad button.
                let current = c;
                let el = await page.$(current.sel);
                if (!el) {
                    const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
                    const replacement = replacementFor(fresh, c);
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
                /**
                 * ⛔ A CONTROL AN EARLIER PRESS REMOVED IS SOUGHT ON THE BASELINE.
                 *
                 * The exam, 2026-11-03 (P451, a support chatbot): its quick
                 * replies are replaced as soon as one is used, so after «Hours»
                 * the chips «Prices» and «Insurance» were no longer on the page,
                 * and three working buttons were «gone before I could press
                 * them» — eight minutes of refusals. Every control was
                 * discovered on probeStartUrl: restore that baseline once, as a
                 * covered control is restored below, before calling it
                 * unreachable.
                 */
                if (!el) {
                    await restoreProbeStart();
                    baselineMayBeDirty = false;
                    const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
                    const replacement = replacementFor(fresh, c);
                    if (replacement) {
                        current = replacement;
                        el = await page.$(current.sel);
                    }
                }
                if (!el) {
                    //  Gone from the restored baseline: declined by the product, or consumed by the walk (above).
                    const gone = await goneByTheWalk(c);
                    controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: gone || 'not found', instance: c.ordinal, href: c.href });
                    continue;
                }
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
                    if (blocked) { controls.push({ label: c.label, kind: 'submit', worked: true, effect: 'validation', instance: c.ordinal, href: c.href }); continue; }
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
                let reachable = await reachableOnScreen(current.sel);
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
                        const replacement = replacementFor(fresh, c);
                        if (replacement) {
                            current = replacement;
                            el = await page.$(current.sel);
                            await el?.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                        }
                        reachable = await reachableOnScreen(current.sel);
                    }
                }
                // A transient surface may not identify itself as a modal. The
                // control was discovered on probeStartUrl, so restore that
                // exact baseline once before declaring it unreachable.
                if (!reachable) {
                    await restoreProbeStart();
                    const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
                    const replacement = replacementFor(fresh, c);
                    if (replacement) {
                        current = replacement;
                        el = await page.$(current.sel);
                        await el?.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                        reachable = await reachableOnScreen(current.sel);
                    }
                }
                if (!reachable) {
                    controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'not found', instance: c.ordinal, href: c.href });
                    continue;
                }
                //  Pressed on the desktop: reached here, on screen and uncovered — not pressed again (reachOnly).
                if (opts?.reachOnly?.has(c.label) || (c.kind === 'link' && !!c.href && !!opts?.pressedHrefs?.has(c.href))
                    || (c.kind !== 'link' && c.kind !== 'submit' && !!opts?.travelled?.has(c.label))) {
                    controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'reached', instance: c.ordinal, href: c.href });
                    metrics.reachedOnly = Number(metrics.reachedOnly || 0) + 1;
                    continue;
                }
                // From this point onward the pointer, hover, or click may alter
                // state even when the final DOM fingerprint is unchanged.
                baselineMayBeDirty = true;
                lastWasPressed = true;
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
                //  Its job, read from its words, and what that job can move, read before the press.
                const job = intentOf(c.label, c.kind);
                const factsBefore = job.intent !== 'none' ? await evalInPage(page, readFacts).catch(() => null) : null;
                const stateBefore = job.intent === 'toggle' ? await page.evaluate(readControlState, current.sel).catch(() => null) : null;
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                /**
                 * …AND A DOWNLOAD IS AN EFFECT.
                 *
                 * «تصدير CSV» hands the visitor a file and changes not one node
                 * of the page. Judged by the DOM alone it is indistinguishable
                 * from a button wired to nothing.
                 */
                const download = observeDownload(page);
                const handoff = observeHandoff(page);
                await handoff.arm();
                //  A save the server took, or a refusal it gave, is the control working even when the page shows nothing new.
                const savedBeforePress = probeWrites.saved();
                const refusedBeforePress = probeWrites.refused();
                try {
                    if (!eyeIsOpen()) break;
                    el = await stableHandle(c, el).catch(() => null);
                    if (!el) {
                        controls.push({ label: c.label, kind: c.kind as any, worked: false, effect: 'not found', instance: c.ordinal, href: c.href });
                        continue;
                    }
                    //  A form's own button pressed by the QA sends whatever the form holds: the product refusing it decides about the QA's input.
                    if (c.kind === 'submit') {
                        expectRefusal(page, 3000);
                        await page.evaluate((n: string) => { (window as any).__joeQaDoc = n; }, docMark).catch(() => { });
                    }
                    // Use Playwright's stability check. A forced coordinate click
                    // can land on a different node while React is laying out.
                    await el.click({ timeout: 2500, noWaitAfter: true }).catch((error: any) => {
                        metrics.controlClickErrors = metrics.controlClickErrors || [];
                        metrics.controlClickErrors.push({ label: c.label, message: String(error?.message || error).slice(0, 180) });
                    });
                    const settleDeadline = Math.min(deadline, Date.now() + 2500);
                    do {
                        await page.waitForTimeout(100);
                        const after = await page.evaluate(snapshot).catch(() => null);
                        effect = download.succeeded() ? 'download' : (await handoff.target()) ? 'handoff' : page.url() !== beforeUrl ? 'navigation'
                            : (changed(before, after) || (hoverEffect ? `hover:${hoverEffect}` : ''));
                    } while (!effect && !download.failed() && Date.now() < settleDeadline && eyeIsOpen());
                } finally {
                    download.stop();
                    handoff.stop();
                }
                if (!effect && probeWrites.saved() > savedBeforePress) effect = 'saved';
                else if (!effect && probeWrites.refused() > refusedBeforePress) effect = 'refused';
                if (effect && forwardRank(c.label) === 2) tookAway = true;
                await judgeJob(c.label, current.sel, effect, job, factsBefore, stateBefore);
                // A submit that reloads the page proves the form is NOT handled —
                // an unhandled submit is the browser's default, not a feature.
                //  …unless it took him to another view of the same document, or the server answered with another page (probeForms says why).
                if (c.kind === 'submit' && effect === 'navigation') {
                    const sameDocument = await page.evaluate((n: string) => (window as any).__joeQaDoc === n, docMark).catch(() => false);
                    const pathOf = (u: string) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };
                    if (!sameDocument && pathOf(String(page.url() || '')) === pathOf(beforeUrl)) effect = 'reload';
                }
                //  A hand-off leaves the page «leaving» (beforeunload fired, no
                //  document came), and the next press reaches nothing (measured).
                //  A phone opens its dialler and keeps the page; the probe reloads it.
                if (effect === 'handoff') {
                    await restoreProbeStart();
                    baselineMayBeDirty = false;
                }
                if (effect === 'navigation') {
                    if (c.kind === 'link' && c.href) opts?.pressedHrefs?.add(c.href);
                    noteLanding(c);
                    await restoreProbeStart();
                    await page.waitForSelector('a[href^="#/"]', { timeout: 2500 }).catch(() => { });
                }
                /*
                 * ⛔ A FORM A PRESS SHOWED IS FILLED WHERE IT APPEARED.
                 *
                 * L160: «Add car», «Add booking», «Add customer» each showed their
                 * form; the forms pass ran on the page put back as it started (no
                 * form), and exploration never pressed them again (pressed once
                 * already). Three forms of an admin, 0 fields filled. A press that
                 * shows a form the start did not show has that form tried there —
                 * its cases, its valid submit, its record — and the page is put back.
                 */
                else if (effect && !['reload', 'download', 'handoff', 'not found'].includes(effect) && c.kind !== 'submit'
                    && opts?.fillForms !== false && Date.now() < formsDeadline - 4000 && eyeIsOpen()) {
                    const prints: string[] = await evalInPage(page, visibleFormPrints).catch(() => [] as string[]);
                    const fresh = prints.filter(p => !initialFormPrints.has(p) && !revealedPrints.has(p));
                    if (fresh.length) {
                        fresh.forEach(p => revealedPrints.add(p));
                        const shown = await probeForms(page, {
                            eyes, budgetMs: Math.max(6000, Math.min(20_000, formsDeadline - Date.now())), seenForms: seenFormsHere,
                            formScope: opts?.formScope, formContext: opts?.formContext, isEyeOpen: eyeIsOpen,
                        }).catch(() => null);
                        if (shown && (shown.metrics.formsFilled || shown.metrics.fieldCasesTried)) {
                            revealedEarly.forms.push(...shown.forms);
                            addFormMetrics(revealedEarly.metrics, shown.metrics);
                            opts?.onProgress?.(`revealed form filled after ${c.label}: ${shown.metrics.formsFilled ?? 0} form(s), ${shown.metrics.fieldCasesTried ?? 0} case(s)`);
                        }
                        await restoreProbeStart();
                    }
                }
            } catch { /* the control itself is what is under test */ }
            controls.push({ label: c.label, kind: c.kind as any, worked: !!effect && effect !== 'reload', effect, instance: c.ordinal, href: c.href });
        }
        metrics.budgetExhausted = budgetHit;
        phase('controls');
        try { page.off('response', onWrite); } catch { /* the page may be gone */ }

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
        /*
         * A submitted form can create the first meaningful application state:
         * a transaction row reveals Delete, a booking reveals Cancel, and a
         * cart reveals its quantity controls.  Exploring before the form pass
         * made those controls invisible, so QA claimed only the empty screen
         * had been examined. Fill before state exploration, then let the
         * frontier discover what the successful submit created.
         */
        if (opts?.fillForms !== false) {
            try {
                // State-changing forms must be tested before generic controls:
                // their successful submit often reveals the most important
                // follow-up action (delete, cancel, checkout, edit).
                opts?.onProgress?.('forms');
                const r = await probeForms(page, {
                    eyes, budgetMs: Math.max(6000, formsDeadline - Date.now()), seenForms: seenFormsHere,
                    formScope: opts?.formScope, formContext: opts?.formContext, isEyeOpen: eyeIsOpen,
                });
                filled = r.forms;
                Object.assign(metrics, r.metrics);
                //  …with the forms a press showed in the controls' pass, counted once and added (revealedEarly).
                if (revealedEarly.forms.length) {
                    filled.push(...revealedEarly.forms);
                    addFormMetrics(metrics, revealedEarly.metrics);
                    metrics.formsRevealed = Number(metrics.formsRevealed || 0) + Number(revealedEarly.metrics.formsFilled || 0);
                }
                //  Said, never only counted: a forms phase that saw nothing, or could not look, is a fact of the walk.
                opts?.onProgress?.(`forms seen ${r.metrics.formsSeen ?? 0}, filled ${r.metrics.formsFilled ?? 0}, cases ${r.metrics.fieldCasesTried ?? 0}${r.metrics.formsError ? `, error: ${r.metrics.formsError}` : ''}${r.metrics.formsNotReached ? `, not reached ${r.metrics.formsNotReached}` : ''}${r.metrics.formsRepeated ? `, already tried ${r.metrics.formsRepeated}` : ''}`);
                // A custom React validation path can deliberately use
                // `noValidate` and an accessible alert instead of native
                // `required`. Judge the empty submission we just performed,
                // not only the HTML attribute inventory.
                metrics.formsWithoutValidation = Math.max(0,
                    Number(metrics.formsWithoutValidation || 0) - Number(r.metrics.formsEmptyRejected || 0));
            } catch { /* a form that fights back is a finding, not a crash */ }
        }

        // A form probe owns submission in this visible state. Repeating the
        // same submit can be idempotent feedback or duplicate a real write.
        const measuredSubmits = new Set(filled
            .filter(form => form.effect === 'submitted' || form.effect === 'validation' || form.effect === 'refused' || form.effect === 'searched')
            .map(form => form.label));

        const initialKeys = new Set(list.map(controlKey));
        const discoveredKeys = new Set(initialKeys);
        const exploredKeys = new Set<string>();
        const successfulSemanticKeys = new Set(controls.filter(control => control.worked)
            .map(control => `${control.kind}|${control.bare || control.label}|${control.instance ?? 0}`));
        const stateKeys = new Set<string>();
        const stateKey = (value: any) => {
            try { return JSON.stringify(value).slice(0, 4000); } catch { return ''; }
        };
        const initialState = await page.evaluate(snapshot).catch(() => null);
        if (initialState) stateKeys.add(stateKey(initialState));
        metrics.statesVisited = stateKeys.size;
        metrics.controlsDiscovered = discoveredKeys.size;
        metrics.exploratoryActions = 0;
        /*
         * ⛔ EXPLORATION HAS A SHARE OF ITS OWN, AND WHAT A PRESS REVEALED COMES FIRST.
         *
         * The owner, 2026-11-10, watching the QA: «القوائم ما بعبيهم … كل قائمة
         * لازم يفتحها، في كل قائمة يشوف شو البنود اللي تحتيها». Measured on L451:
         * «Notifications» was pressed twice on every screen and nothing in it
         * ever was — exploration took the FIRST candidate in page order, and the
         * menu's own toggle (stateful) comes before the items it reveals, so the
         * second turn closed it. And its clock was the controls' deadline, long
         * spent: about one second a screen. Exploration now runs on what is left
         * of the whole probe (never under 6 s), presses what the last press
         * revealed before any toggle again, and fills the forms a press revealed
         * (a dialog's «New issue» form) as the base page's forms are filled.
         */
        const explorationDeadline = Math.max(Date.now() + 6000, Math.min(formsDeadline, Date.now() + Math.max(6000, Math.min(30_000, (opts?.budgetMs || DEFAULT_BUDGET_MS) / 2))));
        let explorationBudgetHit = false;
        phase('forms');
        opts?.onProgress?.('exploring');
        for (let turn = 0; turn < MAX_EXPLORATION_TURNS && Date.now() < explorationDeadline; turn++) {
            const fresh = await evalInPage(page, findControls, limit).catch(() => [] as any[]);
            for (const c of fresh as Array<{ kind: string; label: string; href?: string; ordinal?: number }>) discoveredKeys.add(controlKey(c));
            metrics.controlsDiscovered = discoveredKeys.size;
            const visibleStateKey = stateKey(await page.evaluate(snapshot).catch(() => null));
            const candidates = (fresh as Array<{ sel: string; kind: string; label: string; href?: string; ordinal?: number; stateful?: boolean }>)
                .filter(c => c.kind !== 'anchor')
                // A stateful control deserves an exploratory pass even when
                // the baseline catalogue already pressed its first state.
                // The fresh catalogue and stable key prevent blind repetition.
                .filter(c => !exploredKeys.has(`${visibleStateKey}|${controlKey(c)}`)
                    && (c.stateful || !successfulSemanticKeys.has(`${c.kind}|${c.label}|${c.ordinal ?? 0}`))
                    && !(c.kind === 'submit' && measuredSubmits.has(c.label))
                    && !opts?.reachOnly?.has(c.label)
                    && !(c.kind !== 'link' && opts?.travelled?.has(c.label))
                    && (!initialKeys.has(controlKey(c)) || c.stateful));
            /*
             * What the last press revealed (a menu's items, a dialog's buttons) before any toggle again —
             * and, of those, what goes forward before what takes away. L161 (2026-11-10, a water
             * store): «Add to cart» revealed each line's «Decrease», «Increase», «Remove» and the
             * cart's «Proceed to checkout»; exploration pressed them in page order, «Decrease» emptied
             * the cart, «Proceed to checkout» was gone with it, and the checkout form — the store's
             * journey — was never reached (qa-product-profile: «no such form was found on any screen»).
             */
            const ranked = (xs: typeof candidates) => xs.map((c, i) => ({ c, i, r: forwardRank(c.label) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.c);
            const revealedNow = candidates.filter(c => !initialKeys.has(controlKey(c)));
            const candidate = ranked(revealedNow)[0] || ranked(candidates)[0];
            if (!candidate) break;
            opts?.onProgress?.(`state:${candidate.kind}:${candidate.label}`);
            // The same control can be a different test in a different visible
            // state: a tab, dialog, expanded menu, cart, or filtered result.
            // Keying only by label/selector silently skipped those states and
            // made exploration look broad while pressing very little.
            const key = `${visibleStateKey}|${controlKey(candidate)}`;
            exploredKeys.add(key);
            let effect = '';
            try {
                if (!eyeIsOpen()) break;
                let el = await page.$(candidate.sel);
                if (!el) continue;
                await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, candidate.sel), {
                    note: `استكشاف ${KIND_AR[candidate.kind] || 'عنصر'}: ${candidate.label}`.slice(0, 64),
                    tone: 'warn', moveMouse: true,
                });
                el = await stableHandle(candidate, el);
                if (!el) continue;
                const before = await page.evaluate(snapshot).catch(() => null);
                const job = intentOf(candidate.label, candidate.kind);
                const factsBefore = job.intent !== 'none' ? await evalInPage(page, readFacts).catch(() => null) : null;
                const stateBefore = job.intent === 'toggle' ? await page.evaluate(readControlState, candidate.sel).catch(() => null) : null;
                if (!eyeIsOpen()) break;
                const download = observeDownload(page);
                const handoff = observeHandoff(page);
                await handoff.arm();
                const savedBeforePress = probeWrites.saved();
                const refusedBeforePress = probeWrites.refused();
                try {
                    if (candidate.kind === 'submit') expectRefusal(page, 3000);
                    await el.click({ timeout: 2500, noWaitAfter: true }).catch((error: any) => {
                        metrics.controlClickErrors = metrics.controlClickErrors || [];
                        metrics.controlClickErrors.push({ label: candidate.label, message: String(error?.message || error).slice(0, 180) });
                    });
                    // A Blob download usually settles immediately, but leave a
                    // small bounded window for the browser to confirm it.
                    const settleDeadline = Math.min(explorationDeadline, Date.now() + 1200);
                    do {
                        await page.waitForTimeout(100);
                        const after = await page.evaluate(snapshot).catch(() => null);
                        effect = download.succeeded() ? 'download' : (await handoff.target()) ? 'handoff' : changed(before, after);
                    } while (!effect && !download.failed() && Date.now() < settleDeadline && eyeIsOpen());
                } finally {
                    download.stop();
                    handoff.stop();
                }
                if (!effect && probeWrites.saved() > savedBeforePress) effect = 'saved';
                else if (!effect && probeWrites.refused() > refusedBeforePress) effect = 'refused';
                if (effect && forwardRank(candidate.label) === 2) tookAway = true;
                await judgeJob(candidate.label, candidate.sel, effect, job, factsBefore, stateBefore);
                if (effect === 'navigation') noteLanding(candidate);
                if (effect === 'navigation' || effect === 'handoff') {
                    // Hash routers and replaceState do not reliably create a
                    // history entry. Restore the exact discovery URL so the
                    // next frontier is never sampled from an unrelated route.
                    // A hand-off leaves the page «leaving»: the same reload.
                    await restoreProbeStart();
                }
                const afterState = await page.evaluate(snapshot).catch(() => null);
                if (afterState) stateKeys.add(stateKey(afterState));
                metrics.statesVisited = stateKeys.size;
                metrics.exploratoryActions++;
                const worked = !!effect && effect !== 'reload';
                controls.push({
                    label: candidate.label,
                    bare: candidate.label,
                    kind: candidate.kind as any,
                    worked,
                    effect,
                    exploratory: true,
                    instance: candidate.ordinal,
                });
                if (worked) successfulSemanticKeys.add(`${candidate.kind}|${candidate.label}|${candidate.ordinal ?? 0}`);
                //  A press that revealed a form (a dialog's «New issue»): its fields are tried here, once (seenFormsHere).
                if (worked && effect !== 'navigation' && opts?.fillForms !== false && Date.now() < explorationDeadline - 2000 && eyeIsOpen()) {
                    const shownForms = await evalInPage(page, function () {
                        return Array.from(document.querySelectorAll('form')).filter(x => { const r = (x as HTMLElement).getBoundingClientRect(); return r.width > 2 && r.height > 2; }).length;
                    }).catch(() => 0);
                    if (shownForms > 0) {
                        const revealed = await probeForms(page, {
                            eyes, budgetMs: Math.max(6000, explorationDeadline - Date.now()), seenForms: seenFormsHere,
                            formScope: opts?.formScope, formContext: opts?.formContext, isEyeOpen: eyeIsOpen,
                        }).catch(() => null);
                        if (revealed && (revealed.metrics.formsFilled || revealed.metrics.fieldCasesTried)) {
                            filled.push(...revealed.forms);
                            addFormMetrics(metrics, revealed.metrics);
                            metrics.formsRevealed = (metrics.formsRevealed || 0) + Number(revealed.metrics.formsFilled || 0);
                            opts?.onProgress?.(`revealed form filled after ${candidate.label}: ${revealed.metrics.formsFilled ?? 0} form(s), ${revealed.metrics.fieldCasesTried ?? 0} case(s)`);
                        }
                    }
                }
            } catch { /* discovery continues even when one state is hostile */ }
        }
        if (Date.now() >= explorationDeadline) explorationBudgetHit = true;
        metrics.explorationBudgetExhausted = explorationBudgetHit;
        phase('explore');

        /**
         * A disclosure is not proven by clicking one remembered button. Walk
         * every visible trigger in sequence, measure the shared open state,
         * then close the final item with the keyboard. This gives acceptance
         * an inspectable witness for accordions at every audited viewport.
         */
        const disclosureTriggers = await page.$$('button[aria-expanded][aria-controls]');
        if (disclosureTriggers.length > 1) {
            const visibleIndexes: number[] = [];
            for (let index = 0; index < disclosureTriggers.length; index++) {
                const visible = await disclosureTriggers[index].evaluate((node: Element) => {
                    const rect = (node as HTMLElement).getBoundingClientRect();
                    const style = getComputedStyle(node);
                    return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
                }).catch(() => false);
                if (visible) visibleIndexes.push(index);
            }
            if (visibleIndexes.length > 1) {
                for (const index of visibleIndexes) {
                    const trigger = (await page.$$('button[aria-expanded][aria-controls]'))[index];
                    if (trigger && await trigger.getAttribute('aria-expanded') === 'true') {
                        await trigger.click({ timeout: 2500, noWaitAfter: true }).catch(() => { });
                        await page.waitForTimeout(120).catch(() => { });
                    }
                }
                let opened = 0;
                let oneAtATime = true;
                for (const index of visibleIndexes) {
                    if (!eyeIsOpen()) break;
                    const current = (await page.$$('button[aria-expanded][aria-controls]'))[index];
                    if (!current) continue;
                    const label = await handleLabel(current);
                    await current.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                    await eyes.lookAt(page, await current.boundingBox().catch(() => null), {
                        note: `اختبار السؤال: ${label}`.slice(0, 64), tone: 'warn', moveMouse: true,
                    });
                    await current.click({ timeout: 2500, noWaitAfter: true }).catch(() => { });
                    await page.waitForTimeout(180).catch(() => { });
                    const state = await page.evaluate(() => {
                        const triggers = [...document.querySelectorAll('button[aria-expanded][aria-controls]')]
                            .filter((node: Element) => {
                                const rect = (node as HTMLElement).getBoundingClientRect();
                                const style = getComputedStyle(node);
                                return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden';
                            });
                        return { expanded: triggers.filter(node => node.getAttribute('aria-expanded') === 'true').length };
                    }).catch(() => ({ expanded: 0 }));
                    if (await current.getAttribute('aria-expanded') === 'true') opened++;
                    oneAtATime = oneAtATime && state.expanded === 1;
                }
                let keyboardClosed = false;
                const lastIndex = visibleIndexes[visibleIndexes.length - 1];
                const last = (await page.$$('button[aria-expanded][aria-controls]'))[lastIndex];
                if (last && opened === visibleIndexes.length && oneAtATime) {
                    await last.focus().catch(() => { });
                    await page.keyboard.press('Enter').catch(() => { });
                    await page.waitForTimeout(180).catch(() => { });
                    keyboardClosed = await last.getAttribute('aria-expanded') === 'false';
                }
                let viewport: { width: number; height: number } | null = null;
                try { viewport = page.viewportSize(); } catch { /* evidence keeps an empty viewport */ }
                metrics.disclosureEvidence = [{
                    count: visibleIndexes.length,
                    opened,
                    oneAtATime,
                    keyboardClosed,
                    viewport: viewport ? `${viewport.width}x${viewport.height}` : '',
                }];
            }
        }

        const calculator = await page.$('[data-qa-calculator]');
        if (calculator && eyeIsOpen()) {
            const select = await calculator.$('[data-calculator-service], select');
            const currencySelect = await calculator.$('[data-calculator-currency]');
            const input = await calculator.$('input[type="number"]');
            const promoInput = await calculator.$('[data-calculator-promo]');
            const promoApply = await calculator.$('[data-calculator-apply]');
            const reset = await calculator.$('[data-calculator-reset], .calculator-reset');
            if (select && input && reset) {
                await eyes.lookAt(page, await calculator.boundingBox().catch(() => null), {
                    note: 'اختبار الحاسبة والقيم الحدية', tone: 'warn', moveMouse: true,
                });
                const choices = await select.$$eval('option', (options: Element[]) => options.length).catch(() => 0);
                const taxRate = Number(await calculator.getAttribute('data-tax-rate') || 0) / 100;
                const discountRate = Number(await calculator.getAttribute('data-discount-rate') || 0) / 100;
                const promoCode = String(await calculator.getAttribute('data-promo-code') || '');
                let choicesTested = 0;
                let mathCorrect = true;
                const read = async () => page.evaluate(() => {
                    const root = document.querySelector('[data-qa-calculator]');
                    const service = root?.querySelector('[data-calculator-service], select') as HTMLSelectElement | null;
                    const selected = service?.querySelector('option:checked') as HTMLOptionElement | null;
                    const currency = root?.querySelector('[data-calculator-currency]') as HTMLSelectElement | null;
                    const hours = Number((root?.querySelector('input[type="number"]') as HTMLInputElement | null)?.value || 0);
                    const rate = Number(selected?.dataset.rate || 0);
                    const subtotal = Number((root?.querySelector('[data-calculator-subtotal]') as HTMLElement | null)?.dataset.calculatorSubtotal || NaN);
                    const discount = Number((root?.querySelector('[data-calculator-discount]') as HTMLElement | null)?.dataset.calculatorDiscount || 0);
                    const tax = Number((root?.querySelector('[data-calculator-tax]') as HTMLElement | null)?.dataset.calculatorTax || NaN);
                    const total = Number((root?.querySelector('[data-calculator-total]') as HTMLElement | null)?.dataset.calculatorTotal || NaN);
                    const promo = (root?.querySelector('[data-calculator-promo]') as HTMLInputElement | null)?.value || '';
                    const promoState = (root?.querySelector('[data-calculator-promo-message]') as HTMLElement | null)?.dataset.state || '';
                    const currencyOption = currency?.querySelector('option:checked') as HTMLOptionElement | null;
                    return { hours, rate, subtotal, discount, tax, total, promo, promoState,
                        selectedIndex: service?.selectedIndex ?? -1,
                        currencyIndex: currency?.selectedIndex ?? 0,
                        currencyCode: currencyOption?.value || '',
                        currencyRate: Number(currencyOption?.dataset.rate || 1),
                    };
                });
                for (let index = 0; index < choices; index++) {
                    await select.selectOption(String(index)).catch(() => { });
                    await input.fill('2').catch(() => { });
                    await page.waitForTimeout(100).catch(() => { });
                    const state = await read();
                    const expectedSubtotal = state.rate * 2 * state.currencyRate;
                    mathCorrect = mathCorrect
                        && Number.isFinite(expectedSubtotal) && expectedSubtotal >= 0
                        && Math.abs(state.tax - expectedSubtotal * taxRate) < 0.01
                        && Math.abs(state.total - expectedSubtotal * (1 + taxRate)) < 0.01;
                    if (state.selectedIndex === index) choicesTested++;
                }
                await input.fill('0').catch(() => { });
                await page.waitForTimeout(80).catch(() => { });
                const zeroCorrect = Math.abs((await read()).total) < 0.01;
                await input.fill('9999').catch(() => { });
                await page.waitForTimeout(80).catch(() => { });
                const large = await read();
                const largeCorrect = Number.isFinite(large.total) && large.total > 0
                    && Math.abs(large.total - large.subtotal * (1 + taxRate)) < 0.01;
                await input.fill('-1').catch(() => { });
                const negativeRejected = await input.evaluate((node: HTMLInputElement) => !node.checkValidity()).catch(() => false);

                let currencyChoices = 0;
                let currencyRoundTrip = !currencySelect;
                let valuesPreserved = !currencySelect;
                if (currencySelect) {
                    currencyChoices = await currencySelect.$$eval('option', (options: Element[]) => options.length).catch(() => 0);
                    if (choices > 1) await select.selectOption(String(choices - 1)).catch(() => { });
                    await input.fill('3').catch(() => { });
                    const beforeCurrency = await read();
                    if (currencyChoices > 1) await currencySelect.selectOption({ index: currencyChoices - 1 }).catch(() => { });
                    const changedCurrency = await read();
                    await currencySelect.selectOption({ index: 0 }).catch(() => { });
                    const restoredCurrency = await read();
                    valuesPreserved = changedCurrency.selectedIndex === beforeCurrency.selectedIndex && changedCurrency.hours === beforeCurrency.hours;
                    currencyRoundTrip = currencyChoices > 1 && restoredCurrency.currencyIndex === 0
                        && restoredCurrency.selectedIndex === beforeCurrency.selectedIndex && restoredCurrency.hours === beforeCurrency.hours;
                }

                let promoCorrect = !promoInput && !promoApply;
                let promoInvalidFeedback = !promoInput && !promoApply;
                let discountBeforeTaxCorrect = !promoInput && !promoApply;
                if (promoInput && promoApply && promoCode && discountRate > 0) {
                    await promoInput.fill('WRONG-CODE').catch(() => { });
                    await promoApply.click({ timeout: 2500, noWaitAfter: true }).catch(() => { });
                    await page.waitForTimeout(80).catch(() => { });
                    promoInvalidFeedback = (await read()).promoState === 'invalid';
                    await promoInput.fill(promoCode).catch(() => { });
                    await promoApply.click({ timeout: 2500, noWaitAfter: true }).catch(() => { });
                    await page.waitForTimeout(80).catch(() => { });
                    const discounted = await read();
                    const expectedDiscount = discounted.subtotal * discountRate;
                    const expectedTaxable = discounted.subtotal - expectedDiscount;
                    promoCorrect = discounted.promoState === 'valid';
                    discountBeforeTaxCorrect = Math.abs(discounted.discount - expectedDiscount) < 0.01
                        && Math.abs(discounted.tax - expectedTaxable * taxRate) < 0.01
                        && Math.abs(discounted.total - expectedTaxable * (1 + taxRate)) < 0.01;
                }
                if (choices > 1) await select.selectOption(String(choices - 1)).catch(() => { });
                await input.fill('7').catch(() => { });
                await reset.click({ timeout: 2500, noWaitAfter: true }).catch(() => { });
                await page.waitForTimeout(100).catch(() => { });
                const resetState = await read();
                const resetWorked = resetState.selectedIndex === 0 && resetState.hours === 1;
                const resetCurrency = !currencySelect || resetState.currencyIndex === 0;
                const resetPromo = !promoInput || (resetState.promo === '' && Math.abs(resetState.discount) < 0.01);
                let viewport: { width: number; height: number } | null = null;
                try { viewport = page.viewportSize(); } catch { /* keep empty */ }
                metrics.calculatorEvidence = [{
                    choices, choicesTested, zeroCorrect, largeCorrect, mathCorrect,
                    negativeRejected, resetWorked, currencyChoices, currencyRoundTrip, valuesPreserved,
                    promoCorrect, promoInvalidFeedback, discountBeforeTaxCorrect, resetCurrency, resetPromo,
                    viewport: viewport ? `${viewport.width}x${viewport.height}` : '',
                }];
            }
        }

        // Does an empty required form actually refuse? Native validation counts.
        const forms = await page.evaluate(() => {
            const out: Array<{ fields: number; required: number; hasSubmit: boolean; guarded: boolean; allowsEmpty: boolean }> = [];
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
                const allowsEmpty = f.getAttribute('data-optional-submit') === 'true';
                out.push({ fields, required, hasSubmit, guarded, allowsEmpty });
            });
            return out;
        }).catch(() => []);
        metrics.forms = forms.length;
        metrics.formsWithoutValidation = forms.filter((f: any) => f.fields > 0 && f.required === 0 && !f.guarded && !f.allowsEmpty).length;

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

        /**
         * ⛔ A CONTROL THAT CHANGED NOTHING ON THE UNTOUCHED PAGE IS PRESSED
         * ONCE MORE ON A CHANGED ONE.
         *
         * The exam, 2026-11-03 (P204, a gym store): «Shop» clears the search,
         * the category and the cart drawer. On the page as it loads there is
         * nothing to clear, so its one press changed nothing, and
         * «Unresponsive controls: "Shop"» refused the store four times in a
         * row — the builder cannot make a reset visible on a page that needs
         * none. The exploration above re-presses a header menu like it in
         * other states only when its budget reaches that far (90 s: pressed;
         * 45 s: dead), and a plain button — «Clear filters» — never.
         *
         * A fair test gives the control something to undo: a control that
         * really changed this page is pressed first, the page is let settle,
         * then this one is pressed and measured the same way. A control with
         * no handler still changes nothing, and its verdict stands.
         */
        const workedSomewhere = new Set(controls.filter(r => r.worked).map(r => `${r.kind}|${r.bare || r.label}|${r.instance ?? 0}`));
        const pressedQuiet = controls.filter(r => !r.exploratory && ['button', 'menu', 'tab'].includes(r.kind) && !r.worked && r.effect === ''
            && !workedSomewhere.has(`${r.kind}|${r.label}|${r.instance ?? 0}`));
        const movers = controls.filter(r => !r.exploratory && r.worked && ['state', 'dom', 'count', 'text', 'open'].includes(r.effect));
        const catalogued = (r: ControlResult) => list.find(l => l.kind === r.kind && l.label === r.label && (l.ordinal ?? 0) === (r.instance ?? 0));
        const settled = async (until: number) => {
            let last = '';
            let same = 0;
            while (Date.now() < until && same < 3) {
                await page.waitForTimeout(200).catch(() => { });
                const now = JSON.stringify(await page.evaluate(snapshot).catch(() => null));
                same = now === last ? same + 1 : 0;
                last = now;
            }
            return same >= 3;
        };
        // Its own bounded time, so a probe that spent its budget elsewhere
        // still gives its quiet controls this one fair press.
        metrics.secondLook = [] as Array<{ label: string; after: string; effect: string }>;
        /**
         * The page's own name, as a visitor reads it (its title and its main heading): a nav item that
         * names it and changes nothing is the link to the page already open — «المتجر» on «متجر مكتب
         * شكاوى البلدية», «Home» on the home page — not a dead control (judged after the second look).
         */
        const pageNames = await page.evaluate(() => [document.title, ...Array.from(document.querySelectorAll('h1')).map(h => (h as HTMLElement).innerText)].join(' ')).catch(() => '');
        /**
         * ⛔ A SEARCH BUTTON IS PRESSED WITH WORDS IN ITS BOX, A CLEAR BUTTON
         * WITH SOMETHING TO CLEAR.
         *
         * The exam, 2026-11-05 (P069, a garage's admin): every list had a
         * search box, «Search» and «Clear», and both worked. On the page as it
         * loads the box is empty: «Search» lists the same rows and «Clear»
         * clears nothing, and «Unresponsive controls: "Search", "Clear"»
         * refused the garage five times. A person types before pressing
         * Search, and clears what they searched.
         *
         * A quiet control named for searching or clearing, beside a text box,
         * has that box filled with a word no record holds: «Search» is
         * measured from the typed box to after its press, «Clear» from the
         * search applied by Enter to after its press — or by the box it
         * emptied. A control wired to nothing still changes nothing.
         */
        const SEARCH_LABEL = /^(?:search|find|go|apply|filter|بحث|ابحث|تصفية|تطبيق)$/iu;
        //  The ladder, 2026-11-09: «مسح الحقول», «إعادة الضبط», «Reset filters» on a page as it
        //  loads clear nothing, correctly, and were reported as unresponsive.
        const CLEAR_LABEL = /^(?:clear|reset|clear search|clear filters?|clear all|clear form|reset (?:filters?|form|all|search)|show all|مسح|مسح الكل|مسح الحقول|مسح البحث|مسح الفلاتر|إعادة تعيين|اعادة تعيين|إعادة الضبط|اعادة الضبط|إعادة ضبط|اعادة ضبط|إلغاء البحث|إلغاء الفلترة|عرض الكل|إظهار الكل|اظهار الكل)$/iu;
        const QUERY = 'zzqxjv';
        const queryLookUntil = Date.now() + 10_000;
        const asked = pressedQuiet.filter(q => SEARCH_LABEL.test(q.label.trim()) || CLEAR_LABEL.test(q.label.trim()));
        for (const quiet of asked.slice(0, 4)) {
            const quietItem = catalogued(quiet);
            if (!quietItem || Date.now() >= queryLookUntil || !eyeIsOpen()) continue;
            const clearing = CLEAR_LABEL.test(quiet.label.trim());
            try {
                await restoreProbeStart();
                const found = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), quietItem);
                if (!found || !await reachableOnScreen(found.sel)) continue;
                //  Its box: a text field in the control's own form, search bar or toolbar.
                const hasBox = await page.evaluate((s: string) => {
                    document.querySelectorAll('[data-joe-qbox]').forEach(el => el.removeAttribute('data-joe-qbox'));
                    const control = document.querySelector(s);
                    if (!control) return false;
                    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    const scopes = [control.closest('form, [role="search"], .toolbar, .search, .search-bar, .filters'), control.parentElement, control.parentElement?.parentElement];
                    for (const scope of scopes) {
                        const box = scope && Array.from(scope.querySelectorAll('input')).find((el: any) => visible(el) && !el.disabled && !el.readOnly
                            && /^(?:|text|search)$/i.test(el.getAttribute('type') || ''));
                        if (box) { box.setAttribute('data-joe-qbox', '1'); return true; }
                    }
                    return false;
                }, found.sel).catch(() => false);
                if (!hasBox) continue;
                const box = page.locator('[data-joe-qbox="1"]').first();
                await box.fill(QUERY, { timeout: 2000 });
                if (clearing) await box.press('Enter').catch(() => { });
                await settled(Math.min(queryLookUntil, Date.now() + 2500));
                const ready = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), quietItem);
                if (!ready || !await reachableOnScreen(ready.sel)) continue;
                const boxValue = () => page.evaluate(() => {
                    const field = (document.querySelector('[data-joe-qbox="1"]') || document.querySelector('input[type="search"], [role="search"] input')) as HTMLInputElement | null;
                    return field ? field.value : null;
                }).catch(() => null);
                await eyes.lookAt(page, await boxOf(page, ready.sel), { note: `${KIND_AR[quiet.kind] || 'عنصر'}: ${quiet.label}`.slice(0, 64), moveMouse: true });
                const before = await page.evaluate(snapshot).catch(() => null);
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                await (await page.$(ready.sel))?.click({ timeout: 2500, noWaitAfter: true });
                let effect = '';
                const settleDeadline = Date.now() + 2500;
                do {
                    await page.waitForTimeout(100);
                    effect = page.url() !== probeStartUrl ? 'navigation' : changed(before, await page.evaluate(snapshot).catch(() => null));
                    if (!effect && clearing && await boxValue() === '') effect = 'cleared';
                } while (!effect && Date.now() < settleDeadline && eyeIsOpen());
                metrics.secondLook.push({ label: quiet.label, after: clearing ? `«${QUERY}» searched` : `«${QUERY}» typed`, effect });
                if (effect) controls.push({ label: quiet.label, kind: quiet.kind, worked: true, effect, instance: quiet.instance, href: quiet.href });
            } catch { /* the control under test keeps its first verdict */ }
        }
        const answered = new Set(controls.filter(r => r.worked).map(r => `${r.kind}|${r.label}|${r.instance ?? 0}`));
        const secondLookUntil = Date.now() + 12_000;
        for (const quiet of pressedQuiet.filter(q => !answered.has(`${q.kind}|${q.label}|${q.instance ?? 0}`)).slice(0, 3)) {
            const quietItem = catalogued(quiet);
            if (!quietItem || !eyeIsOpen()) continue;
            /*
             * A nav item undoes another nav item: «المتجر» (setView('shop')) after «السلة», not after
             * «أضف إلى السلة», which leaves the shop where it was (L162, the fifth live check: «Unresponsive
             * controls: "المتجر"» three times; Joe made it focus the search box, then a link, to quiet it).
             */
            const nav = (k: string) => k === 'menu' || k === 'tab' || k === 'link';
            const moverRank = (m: ControlResult) => (nav(quiet.kind) && nav(m.kind) ? 0 : 2) + (['dom', 'open', 'state'].includes(String(m.effect)) ? 0 : 1);
            const tried = movers.filter(m => m.label !== quiet.label).map((m, i) => ({ m, i })).sort((a, b) => moverRank(a.m) - moverRank(b.m) || a.i - b.i).map(x => x.m);
            for (const mover of tried.slice(0, 3)) {
                if (Date.now() >= secondLookUntil || !eyeIsOpen()) break;
                const moverItem = catalogued(mover);
                if (!moverItem) continue;
                try {
                    await restoreProbeStart();
                    const attemptUntil = Math.min(secondLookUntil, Date.now() + 4000);
                    const moverNow = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), moverItem);
                    if (!moverNow || !await reachableOnScreen(moverNow.sel)) continue;
                    await eyes.lookAt(page, await boxOf(page, moverNow.sel), { note: `${KIND_AR[mover.kind] || 'عنصر'}: ${mover.label}`.slice(0, 64), moveMouse: true });
                    await eyes.press(page);
                    await (await page.$(moverNow.sel))?.click({ timeout: 2500, noWaitAfter: true });
                    // A change still arriving from the first press would be
                    // credited to the second one: measure only a still page.
                    if (!await settled(attemptUntil) || page.url() !== probeStartUrl) continue;
                    const quietNow = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), quietItem);
                    if (!quietNow || !await reachableOnScreen(quietNow.sel)) continue;
                    await eyes.lookAt(page, await boxOf(page, quietNow.sel), { note: `${KIND_AR[quiet.kind] || 'عنصر'}: ${quiet.label}`.slice(0, 64), moveMouse: true });
                    const before = await page.evaluate(snapshot).catch(() => null);
                    if (!eyeIsOpen()) break;
                    await eyes.press(page);
                    await (await page.$(quietNow.sel))?.click({ timeout: 2500, noWaitAfter: true });
                    let effect = '';
                    const settleDeadline = Date.now() + 2500;
                    do {
                        await page.waitForTimeout(100);
                        effect = page.url() !== probeStartUrl ? 'navigation' : changed(before, await page.evaluate(snapshot).catch(() => null));
                    } while (!effect && Date.now() < settleDeadline && eyeIsOpen());
                    metrics.secondLook.push({ label: quiet.label, after: mover.label, effect });
                    if (effect) controls.push({ label: quiet.label, kind: quiet.kind, worked: true, effect, instance: quiet.instance, href: quiet.href });
                    if (effect) break;
                } catch { /* the control under test keeps its first verdict */ }
            }
            //  Still quiet, in the nav, and naming the page it is on (or «Home» on the start page): the current page's link.
            const stillQuiet = !controls.some(r => r.worked && r.kind === quiet.kind && r.label === quiet.label);
            if (stillQuiet && nav(quiet.kind) && namesCurrentPage(quiet.label, pageNames, probeStartUrl)) {
                controls.push({ label: quiet.label, kind: quiet.kind, worked: false, effect: 'current', instance: quiet.instance, href: quiet.href });
                metrics.currentPageLinks = Number(metrics.currentPageLinks || 0) + 1;
            }
        }
        probeWrites.stop();
        phase('rest');
    }

    return { controls, metrics, forms: filled };
}

/** What a value should be, given the field's own declared type. */
export function valueFor(type: string, tag: string, runNonce = '', language = 'en'): string {
    const today = new Date();
    const iso = today.toISOString().slice(0, 10);
    const isAr = /^ar(?:-|$)/i.test(language);
    switch (type) {
        case 'email': return `joe.qa+${runNonce || 'browser'}@example.com`;
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
        case 'textarea': return isAr ? 'رسالة اختبار من فحص الجودة الذاتي في جو.' : 'Joe self-QA test message.';
        default: return isAr ? 'اختبار جو' : 'Joe QA';
    }
}

/** Infer native input semantics without treating substrings such as "message" as "age". */
export function semanticTypeForField(tag: string, name: string): 'email' | 'tel' | 'date' | 'time' | 'number' | '' {
    if (String(tag).toLowerCase() !== 'input') return '';
    const label = String(name || '');
    /*
     * A search box searches: «Search name, email or phone…» is not an email field.
     * L160 (2026-11-10): read as one, the delivery was refused twice and Joe changed a
     * working search box to type="text" to quiet it.
     */
    if (/^\s*search\b|\bsearch\b|بحث|ابحث|فلترة|تصفية|filter/iu.test(label)) return '';
    if (/\bemail\b|e[- ]?mail|(?:البريد\s*)?(?:الإلكتروني|الالكتروني)/iu.test(label)) return 'email';
    if (/\b(?:phone|telephone|mobile|tel)\b|(?:رقم\s*)?(?:الهاتف|هاتف|الجوال|جوال|الموبايل|موبايل)/iu.test(label)) return 'tel';
    if (/\b(?:birth\s*date|date\s*of\s*birth|dob|date|expiry|expiration|deadline|due\s+date)\b|تاريخ\s*(?:الميلاد|الانتهاء|الاستحقاق)?/iu.test(label)) return 'date';
    if (/\b(?:time|start\s*time|end\s*time)\b|(?:وقت|موعد|ساعة)\s*(?:البدء|الانتهاء)?/iu.test(label)) return 'time';
    if (/\b(?:age|amount|price|quantity|count|capacity|duration|score|rating)\b|(?:العمر|عمر|المبلغ|مبلغ|السعر|سعر|الكمية|كمية|العدد|عدد|السعة|سعة|المدة|مدة|النقاط|التقييم)/iu.test(label)) return 'number';
    return '';
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
    opts?: { eyes?: AuditEyes; budgetMs?: number; maxForms?: number; seenForms?: Set<string>; formScope?: string; formContext?: string; isEyeOpen?: () => boolean },
): Promise<{ forms: FormResult[]; metrics: Record<string, any> }> {
    const eyes = opts?.eyes || new AuditEyes({});
    const deadline = Date.now() + Math.max(4000, opts?.budgetMs ?? 30_000);
    const out: FormResult[] = [];
    const metrics: Record<string, any> = {
        formsFilled: 0, fieldsFilled: 0, formsDeadSubmit: 0, formsDeadSubmitEvidence: [], formsNotReached: 0, formsNotReachedEvidence: [], formsValidated: 0, formsReloaded: 0,
        formsEmptyRejected: 0,
        formsPersisted: 0, formsPersistenceUnproven: 0, formsRefused: 0, qaRecordsDeleted: 0, qaRecordsNotDeleted: 0,
        semanticFieldsTested: 0, semanticValidationFailures: 0, semanticValidationEvidence: [],
        //  The case matrix (qa-field-cases.ts): tried, sent with the form, failed, and how each failed.
        fieldCasesTried: 0, fieldCasesSubmitted: 0, fieldCasesFailed: 0, fieldCaseFailures: [], markupTried: 0,
    };
    const runNonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const eyeIsOpen = () => {
        if (!opts?.isEyeOpen) return true;
        const open = opts.isEyeOpen();
        if (!open) metrics.eyeLost = true;
        return open;
    };
    const pageLanguage = await page.evaluate(() => {
        const lang = String(document.documentElement.lang || '').trim();
        if (lang) return lang;
        return document.documentElement.dir === 'rtl' ? 'ar' : 'en';
    }).catch(() => 'en');

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
    //  Each write the product's own origin took or refused while the forms are tried (watchWrites).
    const writes = watchWrites(page);

    const identity = (form: any) => JSON.stringify([form.label,
        form.fields.map((field: any) => [field.tag, field.type, field.name])]);
    const triedIdentities = new Set<string>();
    for (const planned of forms) {
        if (Date.now() > deadline) break;
        if (!eyeIsOpen()) break;
        // Persistence checks reload the page. Instrument handles from the previous
        // document are no longer evidence of where the next form lives.
        const current = await evalInPage(page, findForms, {
            maxForms: opts?.maxForms ?? MAX_FORMS, maxFields: MAX_FIELDS_PER_FORM,
        }).catch(() => []) || [];
        const matches = current.filter((form: any) => identity(form) === identity(planned));
        //  The same form drawn once a row (a «حفظ» for each lesson, L452): tried once, the rest are that form again.
        if (matches.length > 1) {
            if (triedIdentities.has(identity(planned))) { metrics.formsRepeated = (metrics.formsRepeated || 0) + 1; continue; }
            matches.splice(1);
        }
        if (matches.length === 1) triedIdentities.add(identity(planned));
        if (matches.length !== 1) {
            metrics.formsNotReached++;
            metrics.formsNotReachedEvidence.push({ label: planned.label,
                reason: matches.length ? 'ambiguous form identity' : 'form missing after state change' });
            continue;
        }
        const f = matches[0];
        // Its identity, not its position: the same form on a second route is
        // the same form, and it has already been filled in and sent.
        //  One form, tried once in a walk: the width it is seen at is not part of its name (a responsive pass measures layout).
        const key = `${String(opts?.formScope || 'default').replace(/^[^:]*:/, '')}|${f.label}|${f.fields.map((x: any) => x.type).join(',')}`;
        if (opts?.seenForms) {
            if (opts.seenForms.has(key)) { metrics.formsRepeated = (metrics.formsRepeated || 0) + 1; continue; }
            opts.seenForms.add(key);
        }
        let filledCount = 0;
        let semanticFieldsTested = 0;
        // A nonce is deliberately placed only in QA-created values. It lets us
        // find and remove our own record without ever touching visitor data.
        const persistenceAnchors: string[] = [];
        /** The valid value each field was given, to put back after a case was sent (refillValid). */
        const validValues = new Map<string, { kind: 'fill' | 'select' | 'check'; value: string }>();
        /** Major cases the field took at input: sent with the form, the product's own answer decides. */
        const submitCandidates: Array<{ sel: string; field: string; meaning: string; c: FieldCase }> = [];
        /** The one field markup is tried in: free text with room for it (markupFieldOf). */
        const asCaseFields: QaField[] = f.fields.map((x: any) => ({ tag: x.tag, type: x.type, name: x.name, required: x.required, pattern: x.pattern, min: x.min, max: x.max, minLength: x.minLength, maxLength: x.maxLength, step: x.step, inputMode: x.inputMode }));
        const markupAt = markupFieldOf(asCaseFields);
        const markupSel = markupAt >= 0 ? String(f.fields[markupAt].sel) : '';
        let savedInvalid = false;
        if (!eyeIsOpen()) break;
        await eyes.say(page, `تعبئة النموذج: ${f.label}`);

        // Prove that an empty submission is rejected before introducing valid
        // values. This covers both native constraints and custom validation
        // that renders an alert after an `onSubmit` handler runs.
        const emptyInvalid = await page.evaluate((sel: string) => {
            const form = document.querySelector(sel) as HTMLFormElement | null;
            return !!form && typeof form.checkValidity === 'function' && !form.checkValidity();
        }, f.sel).catch(() => false);
        let emptyEffect = '';
        if (!emptyInvalid && f.submitSel && eyeIsOpen()) {
            const beforeEmpty = await page.evaluate(snapshot).catch(() => null);
            expectRefusal(page, 2500);
            const submit = await page.$(f.submitSel);
            await submit?.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
            const deadlineEmpty = Date.now() + 1200;
            while (!emptyEffect && Date.now() < deadlineEmpty) {
                await page.waitForTimeout(150);
                emptyEffect = changed(beforeEmpty, await page.evaluate(snapshot).catch(() => null));
            }
        }
        if (emptyInvalid || emptyEffect) metrics.formsEmptyRejected++;

        //  Every field gets its valid value, even past the deadline (a fill is quick): a form sent half filled proves nothing.
        //  The cases take what the form leaves: they stop early enough for the rest of the fields to be filled.
        const casesUntil = deadline - Math.min(8000, f.fields.length * 500);
        /*
         * ⛔ A FORM THE PAGE DREW AGAIN IS FOUND AGAIN.
         *
         * L452 (2026-11-10): the course page drew its «تحديث الدورة» form again
         * after the first field was touched; the QA's marks went with the old
         * nodes, nothing more could be filled, and the form — two fields, both
         * there — was left «filled 0». The same form is found again by what it
         * is (its label and its fields), and the fields' new marks are taken.
         */
        const relocate = async (): Promise<boolean> => {
            const again = await evalInPage(page, findForms, { maxForms: opts?.maxForms ?? MAX_FORMS, maxFields: MAX_FIELDS_PER_FORM }).catch(() => []) || [];
            const same = (again as any[]).find((x: any) => identity(x) === identity(f));
            if (!same) return false;
            f.sel = same.sel; f.submitSel = same.submitSel;
            same.fields.forEach((x: any, i: number) => {
                const field = f.fields[i];
                if (!field) return;
                //  The valid value kept for the field moves with it to its new mark (refillValid).
                const kept = validValues.get(field.sel);
                if (kept) { validValues.delete(field.sel); validValues.set(x.sel, kept); }
                for (const cand of submitCandidates) if (cand.sel === field.sel) cand.sel = x.sel;
                field.sel = x.sel;
            });
            return true;
        };
        const freshField = async (el: any, fld: any): Promise<any> => {
            const alive = await el.evaluate((n: Element) => n.isConnected).catch(() => false);
            if (alive) return el;
            if (await relocate()) return (await page.$(fld.sel)) || el;
            return el;
        };
        for (const fld of f.fields) {
            if (Date.now() > deadline + FILL_GRACE_MS) break;
            if (!eyeIsOpen()) break;
            try {
                let el = await page.$(fld.sel);
                if (!el && await relocate()) el = await page.$(fld.sel);
                if (!el) continue;
                await el.scrollIntoViewIfNeeded({ timeout: 1500 }).catch(() => { });
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, fld.sel), { note: `${fld.type}`, tone: 'warn', moveMouse: true });
                if (fld.tag === 'select') {
                    if (!fld.options.length) continue;
                    await el.selectOption(fld.options[0], { timeout: 2000 });
                    validValues.set(fld.sel, { kind: 'select', value: fld.options[0] });
                } else if (fld.type === 'checkbox' || fld.type === 'radio') {
                    await el.check({ timeout: 2000, force: true });
                    if (fld.type === 'checkbox') validValues.set(fld.sel, { kind: 'check', value: '' });
                } else {
                    const semantic = semanticTypeForField(fld.tag, fld.name);
                    if (semantic) {
                        const expected = semantic;
                        const bad = semantic === 'email' ? 'not-an-email' : semantic === 'tel' || semantic === 'number' ? 'letters-only' : 'not-a-date';
                        const result = await page.evaluate(({ sel, bad, expected }: any) => {
                            const input = document.querySelector(sel) as HTMLInputElement | null;
                            if (!input) return { rejected: false, type: '', pattern: '' };
                            input.value = bad;
                            input.dispatchEvent(new Event('input', { bubbles: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true }));
                            const declared = input.type;
                            const constrainedNumericText = expected === 'number' && declared === 'text'
                                && ['numeric', 'decimal'].includes(input.inputMode) && Boolean(input.pattern);
                            const typeMatches = declared === expected || constrainedNumericText;
                            const rejected = input.value !== bad || !input.checkValidity();
                            return { rejected: typeMatches && rejected, type: declared, pattern: input.pattern || '' };
                        }, { sel: fld.sel, bad, expected });
                        semanticFieldsTested++;
                        metrics.semanticFieldsTested++;
                        /*
                         * The field's own TYPE is what this measures: a phone typed as text gives no
                         * keypad and no autofill. A «tel» the browser lets letters into is the product's
                         * to refuse on submit, and the case matrix below sends exactly that and sees
                         * (L161, 2026-11-10: «"phone" should be tel», of a type="tel" field whose
                         * checkout refused letters on submit).
                         */
                        const wrongType = !!result.type && result.type !== expected && !(expected === 'number' && result.pattern);
                        metrics.semanticValidationEvidence.push({ field: fld.name || fld.sel, expected, actual: result.type, rejected: result.rejected || !wrongType, pattern: result.pattern });
                        if (!result.rejected && wrongType) metrics.semanticValidationFailures++;
                    }
                    //  Every case a careful tester tries on it, by what it means (qa-field-cases.ts).
                    const caseField: QaField = {
                        tag: fld.tag, type: fld.type, name: fld.name, required: fld.required, pattern: fld.pattern,
                        min: fld.min, max: fld.max, minLength: fld.minLength, maxLength: fld.maxLength, step: fld.step, inputMode: fld.inputMode,
                    };
                    const meaning = meaningOf(caseField);
                    for (const c of casesFor(caseField)) {
                        if (c.expect === 'inert') continue;
                        if (Date.now() > casesUntil || !eyeIsOpen()) break;
                        await eyes.lookAt(page, await boxOf(page, fld.sel), { note: c.ar, tone: 'warn', moveMouse: false });
                        const at = await tryCaseAtInput(page, el, fld.sel, c.value);
                        //  The page drew the field again (an auto-save, a re-render): what it did with the value is not known.
                        if (at.unknown) {
                            metrics.fieldCasesUnknown = Number(metrics.fieldCasesUnknown || 0) + 1;
                            el = await freshField(el, fld);
                            continue;
                        }
                        metrics.fieldCasesTried++;
                        const label = String(fld.name || fld.type).split(/\s+/).slice(0, 4).join(' ');
                        if (c.expect === 'accept') {
                            if (!at.accepted) {
                                metrics.fieldCasesFailed++;
                                metrics.fieldCaseFailures.push({ form: f.label, field: label, meaning, case: c.id, value: c.value, ar: c.ar, en: c.en, weight: c.weight, outcome: 'rejected_valid' });
                            }
                        } else if (!at.rejected) {
                            if (c.weight === 'major' && f.submitSel) {
                                submitCandidates.push({ sel: fld.sel, field: label, meaning, c });
                            } else {
                                metrics.fieldCasesFailed++;
                                metrics.fieldCaseFailures.push({ form: f.label, field: label, meaning, case: c.id, value: c.value, ar: c.ar, en: c.en, weight: 'minor', outcome: 'accepted_at_input' });
                            }
                        }
                    }
                    // A real fill: the page's own input/change handlers run — with a value its field would take (fillValueFor).
                    let value = fillValueFor(caseField, runNonce, pageLanguage);
                    //  The field markup is tried in: sent as text, it must come back as text.
                    if (markupSel === fld.sel) value = `${MARKUP_PROBE} ${runNonce}`;
                    //  A value never outgrows its field: the browser would cut it, and the cut anchor is never found again.
                    if (fld.maxLength > 0 && value.length > fld.maxLength) {
                        //  A short field (a key, a code) gets a short value of its own each run: a fixed one repeats, and a product refuses a key twice.
                        value = fld.maxLength < 12
                            ? ('Q' + runNonce.split('-').reverse().join('')).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, fld.maxLength)
                            : value.slice(0, fld.maxLength);
                    }
                    if (value.includes(runNonce)) persistenceAnchors.push(markupSel === fld.sel ? runNonce : value);
                    el = await freshField(el, fld);
                    await el.fill(value, { timeout: 2500 });
                    validValues.set(fld.sel, { kind: 'fill', value });
                }
                filledCount++;
            } catch { /* one stubborn field must not lose the whole form */ }
        }
        metrics.fieldsFilled += filledCount;
        if (filledCount) metrics.formsFilled++;

        /*
         * ⛔ A WRONG VALUE THE FIELD TOOK IS SENT — AND THE PRODUCT'S OWN ANSWER DECIDES.
         *
         * Many forms check on submit, not while typing. Each major case a field
         * took at input is sent with the form (every other field valid): a
         * message, a field marked invalid, or nothing saved is a refusal; a save
         * the server accepted is the defect («the price took "abc" and kept it»).
         * What the product saved this way carries the QA nonce in its other
         * fields and is removed after the form (deleteOwnRecords).
         */
        for (const cand of submitCandidates.slice(0, MAX_SUBMITTED_CASES_PER_FORM)) {
            if (Date.now() > deadline || !eyeIsOpen()) break;
            await refillValid(page, validValues);
            const field = await page.$(cand.sel);
            if (!field) continue;
            await eyes.lookAt(page, await boxOf(page, cand.sel), { note: `${cand.c.ar} — إرسال`, tone: 'warn', moveMouse: false });
            try { await field.fill(cand.c.value, { timeout: 1500 }); } catch { continue; }
            const wroteBefore = writes.saved();
            const feedbackBefore = await formFeedback(page, f.sel);
            const submitButton = f.submitSel ? await page.$(f.submitSel) : null;
            if (!submitButton) break;
            expectRefusal(page, 3500);
            await submitButton.click({ timeout: 2500, force: true, noWaitAfter: true }).catch(() => { });
            let answer = '';
            const until = Math.min(deadline, Date.now() + 2200);
            while (!answer && Date.now() < until) {
                await page.waitForTimeout(150);
                if (writes.saved() > wroteBefore) answer = 'saved';
                else if (hasNewVisibleFormFeedback(feedbackBefore, await formFeedback(page, f.sel))) answer = 'message';
                else if (await page.evaluate((sel: string) => {
                    const x = document.querySelector(sel) as HTMLInputElement | null;
                    return !!x && (x.getAttribute('aria-invalid') === 'true' || (typeof x.checkValidity === 'function' && !x.checkValidity()));
                }, cand.sel).catch(() => false)) answer = 'marked';
            }
            metrics.fieldCasesSubmitted++;
            if (answer === 'saved') {
                savedInvalid = true;
                metrics.fieldCasesFailed++;
                metrics.fieldCaseFailures.push({ form: f.label, field: cand.field, meaning: cand.meaning, case: cand.c.id, value: cand.c.value, ar: cand.c.ar, en: cand.c.en, weight: 'major', outcome: 'saved_invalid' });
            } else if (!answer) {
                metrics.fieldCasesFailed++;
                metrics.fieldCaseFailures.push({ form: f.label, field: cand.field, meaning: cand.meaning, case: cand.c.id, value: cand.c.value, ar: cand.c.ar, en: cand.c.en, weight: 'minor', outcome: 'refused_silently' });
            }
        }
        if (submitCandidates.length) await refillValid(page, validValues);
        if (markupSel) await page.evaluate(() => { (window as any).__joeQaXss = 0; }).catch(() => { });

        // …and sent, through the button a visitor would press.
        let effect = '';
        /** A submit that took him to what he made: the form's own page, opened again once the record is checked. */
        let returnAfterForm = '';
        /** What this form made was found again after a reload (a journey's proof, qa-product-profile.ts). */
        let persistedThis = false;
        /** The page's words before the form was sent: what the submit made is what was not there (newRecordTokens). */
        let tokensBefore: string[] = [];
        try {
            const before = await page.evaluate(snapshot).catch(() => null);
            const feedbackBefore = await formFeedback(page, f.sel);
            const stillInvalid = await page.evaluate((sel: string) => {
                const form = document.querySelector(sel) as HTMLFormElement | null;
                return !!form && typeof form.checkValidity === 'function' && !form.checkValidity();
            }, f.sel).catch(() => false);
            //  Marked, so a new document is told from the same one moving to another of its views (below).
            const urlBeforeSubmit = String(page.url() || '');
            const savedBeforeSubmit = writes.saved();
            const refusedBeforeSubmit = writes.refused();
            tokensBefore = f.expectsPersistence ? await evalInPage(page, pageTokens).catch(() => [] as string[]) : [];
            await page.evaluate((n: string) => { (window as any).__joeQaDoc = n; }, runNonce).catch(() => { });
            //  A server that refuses what the QA sent decides about the QA's value; it is not a broken request.
            expectRefusal(page, 3500);
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
            // Submission handlers are often async (for example, a contact
            // form posts to Joe's inbox before showing its honest fallback).
            // A single 650ms snapshot called those real forms dead on a busy
            // local API. Poll for a bounded window instead: the result still
            // requires a measured DOM/state/navigation change, never merely
            // the passage of time.
            const pending = () => page.evaluate((sel: string) => {
                const form = document.querySelector(sel);
                return !!form && (form.getAttribute('aria-busy') === 'true'
                    || !!form.querySelector('fieldset[disabled],button[type="submit"]:disabled,input[type="submit"]:disabled'));
            }, f.sel).catch(() => true);
            let after = await page.evaluate(snapshot).catch(() => null);
            effect = await pending() ? '' : changed(before, after);
            const effectDeadline = Math.min(deadline, Date.now() + 2500);
            while (!effect && Date.now() < effectDeadline && eyeIsOpen()) {
                await page.waitForTimeout(250);
                after = await page.evaluate(snapshot).catch(() => null);
                effect = await pending() ? '' : changed(before, after);
            }
            if (effect === 'navigation') {
                /*
                 * ⛔ A FORM THAT TAKES HIM TO WHAT HE MADE DID NOT RELOAD.
                 *
                 * L451 (2026-11-10): «Create project» opened the new project's
                 * board (#/p/2/board) — the same document, another of its views
                 * — and was reported «the form reloads the page instead of
                 * handling it». A reload is the browser's own submit landing on
                 * the same address in a new document; the same document at
                 * another address, or a server's redirect to another page
                 * (post, then show), handled it.
                 */
                const sameDocument = await page.evaluate((n: string) => (window as any).__joeQaDoc === n, runNonce).catch(() => false);
                const pathOf = (u: string) => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return u; } };
                const reloadedHere = !sameDocument && pathOf(String(page.url() || '')) === pathOf(urlBeforeSubmit);
                effect = reloadedHere ? 'reload' : 'submitted';
                if (!reloadedHere) metrics.formsNavigated = Number(metrics.formsNavigated || 0) + 1;
                if (reloadedHere) {
                    await page.goBack({ timeout: 5000 }).catch(() => { });
                    await page.waitForTimeout(250);
                } else {
                    //  What he made is looked for where he was taken (the new wiki page), and the form's page is opened again after.
                    returnAfterForm = urlBeforeSubmit;
                    await page.waitForTimeout(250);
                }
            } else {
                const feedbackAfter = await formFeedback(page, f.sel);
                if (hasNewVisibleFormFeedback(feedbackBefore, feedbackAfter)) {
                    // A server may reject an unauthenticated mutation. That is a
                    // real, visible outcome, not evidence that the submit is dead.
                    //  What it says NOW: a hint that was there before («must be 8 characters») is not this submit's answer.
                    const was = new Set(String(feedbackBefore || '').split('\n'));
                    const fresh = String(feedbackAfter || '').split('\n').filter(line => !was.has(line)).join('\n');
                    effect = isVisibleFormRefusal(fresh || feedbackAfter) ? 'refused' : 'submitted';
                } else if (!effect && stillInvalid) {
                    // The browser refused it — which is the behaviour that was asked
                    // for, not a dead form.
                    effect = 'validation';
                } else if (effect) {
                    effect = 'submitted';
                }
            }
            /*
             * ⛔ WHAT THE SERVER SAID DECIDES WHAT THE PAGE DID NOT SHOW.
             *
             * L451 (2026-11-10): «Save» on a project's settings wrote its PUT
             * and changed nothing on the page — the values were already in their
             * fields — and was called «nothing happened at all»; «Add or update»
             * a member named «QA …» was refused (404, no such user) and the QA
             * then looked for the member it had «created». A write the product
             * took is a submit that worked, shown or not; a write it refused is
             * a refusal of the QA's value — said as a weak check when the
             * visitor is told nothing — never a record to find.
             */
            const savedNow = writes.saved() > savedBeforeSubmit;
            const refusedNow = writes.refused() > refusedBeforeSubmit;
            if (refusedNow && !savedNow && effect !== 'validation' && effect !== 'reload') {
                if (!hasNewVisibleFormFeedback(feedbackBefore, await formFeedback(page, f.sel)) && !effect) {
                    metrics.fieldCasesFailed++;
                    metrics.fieldCaseFailures.push({ form: f.label, field: f.label, meaning: 'form', case: 'form:refused', value: '', ar: 'رُفض الإرسال دون رسالة للزائر', en: 'the submit was refused and the visitor was told nothing', weight: 'minor', outcome: 'refused_silently' });
                }
                effect = 'refused';
            } else if (!effect && savedNow) {
                effect = 'submitted';
                metrics.formsSavedQuietly = Number(metrics.formsSavedQuietly || 0) + 1;
            }
        } catch { /* the form is what is under test */ }

        /*
         * ⛔ MARKUP SENT AS TEXT COMES BACK AS TEXT.
         *
         * One free-text field is sent with `<b>…</b><img src=x onerror=…>`: a
         * product that writes what a visitor typed into its page as HTML runs
         * that visitor's script in everyone's browser. Run → critical; drawn as
         * an image → major; shown as the text it was → as it must be.
         */
        if (markupSel && (effect === 'submitted' || effect === 'refused')) {
            await page.waitForTimeout(350).catch(() => { });
            const seen = await page.evaluate(() => ({
                ran: (window as any).__joeQaXss === 1,
                drawn: Array.from(document.querySelectorAll('img[src="x"]')).some(img => !img.closest('form')),
            })).catch(() => ({ ran: false, drawn: false }));
            metrics.markupTried++;
            if (seen.ran || seen.drawn) {
                metrics.fieldCasesFailed++;
                metrics.fieldCaseFailures.push({ form: f.label, field: 'markup', meaning: 'text', case: 'text:markup', value: MARKUP_PROBE, ar: 'وسوم HTML لا تُنفَّذ', en: 'HTML markup that must stay text', weight: seen.ran ? 'critical' : 'major', outcome: seen.ran ? 'markup_ran' : 'markup_drawn' });
            }
        }

        if (effect === 'submitted') { /* counted by presence in the list */ }
        else if (effect === 'validation') metrics.formsValidated++;
        else if (effect === 'refused') metrics.formsRefused++;
        else if (effect === 'reload') metrics.formsReloaded++;
        else if (f.fields.length && filledCount < f.fields.length) {
            //  Not every field was filled (out of time, a field that would not take a value): sent like this, it proves nothing.
            metrics.formsUnfinished = Number(metrics.formsUnfinished || 0) + 1;
        }
        /*
         * A search that finds nothing to change is a search, not a dead form. L160 (2026-11-10):
         * «Search» over an empty customers list — the QA's words matched nothing, and nothing
         * was there to hide — was «filled in completely and submitted, and nothing happened»,
         * a blocking refusal. What a search does is judged where it can be seen: the list, by
         * the control's own job (qa-control-intent filter).
         */
        else if (f.fields.length && f.fields.every((x: any) => meaningOf({ tag: x.tag, type: x.type, name: x.name }) === 'search')) {
            effect = 'searched';
            metrics.searchesUnchanged = Number(metrics.searchesUnchanged || 0) + 1;
        }
        else if (f.fields.length) {
            metrics.formsDeadSubmit++;
            metrics.formsDeadSubmitEvidence.push({
                label: f.label, kind: 'submit', sel: f.submitSel || f.sel,
                form: f.sel, fields: f.fields.length, filled: filledCount,
            });
        }

        // A successful-looking submit is not enough for an application that
        // promises a saved record. First find the exact QA record, then reload
        // the real page and verify it survived. Finally test only that record's
        // delete action, keeping the test reversible and data-safe.
        //  No free text to carry the run's mark (a form of codes and numbers): what it made is still looked for (newRecordTokens).
        const anchor = persistenceAnchors.find(value => value.length > 4) || '';
        if (effect === 'submitted' && f.expectsPersistence && (anchor || tokensBefore.length) && Date.now() < deadline && eyeIsOpen()) {
            /*
             * Where the record shows: anywhere in the page's own text (a card, a
             * board column, a heading — L451 drew its records as cards no list
             * selector named), never in a passing toast or alert; or back in a
             * field that shows it (an edit form after a reload: its value came
             * from the server).
             */
            const visibleNeedle = (needles: string[]) => page.evaluate((list: string[]) => {
                const noise = '[role="status"],[role="alert"],[aria-live],.toast,.flash,.snackbar,.notice';
                const shows = (needle: string) => {
                    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                        const host = n.parentElement;
                        if (!host || !String(n.textContent || '').includes(needle)) continue;
                        if (host.closest(noise) || host.closest('script,style,template')) continue;
                        const r = host.getBoundingClientRect();
                        if (r.width > 1 && r.height > 1) return true;
                    }
                    return Array.from(document.querySelectorAll('input,textarea'))
                        .some(x => String((x as HTMLInputElement).value || '').includes(needle));
                };
                return list.find(shows) || '';
            }, needles).catch(() => '');
            /*
             * ⛔ WHAT A FORM MADE IS WHAT IT MADE — NOT ONLY WHAT WAS TYPED INTO IT.
             *
             * L162 (2026-11-10, an Arabic store): «تأكيد الطلب» kept each order in a
             * «طلباتي» list — its number, its date, its total — and not the
             * buyer's name the QA had typed. The audit looked for the name, said
             * «appeared temporarily, not proven after a refresh» (it had never
             * looked after one), four times; Joe saved the order three ways and
             * the run ended undelivered after 32 minutes. What a submit made is
             * also what appeared outside the form that was not on the page before
             * it — a mark of its own (a number with letters, a date, a time; never
             * a bare price or count) in a new row, item or card — and kept is
             * found again after the reload: on the page, in the browser's own
             * storage, or in what the server sends back.
             */
            let needles = anchor ? [anchor] : [];
            let shownAs = needles.length ? await visibleNeedle(needles) : '';
            /*
             * …given the moment a list takes to come back. L160 (2026-11-10): «Create booking»
             * closed its form at once and drew the bookings table after its GET answered; looked
             * for in that instant, the booking «never showed». What was made is waited for, briefly.
             */
            const madeUntil = Math.min(deadline, Date.now() + 2500);
            while (!shownAs && eyeIsOpen()) {
                if (tokensBefore.length) {
                    const made: string[] = await evalInPage(page, newRecordTokens, tokensBefore).catch(() => [] as string[]);
                    if (made.length) { needles = made.slice(0, 6); shownAs = made[0]; break; }
                }
                if (Date.now() >= madeUntil) break;
                await page.waitForTimeout(250).catch(() => { });
                if (anchor) shownAs = await visibleNeedle([anchor]);
            }
            const unproven = (where: string) => {
                const evidence = { form: f.label, anchor, where, ...(needles[0] !== anchor ? { made: needles.slice(0, 3) } : {}) };
                if (f.placesOrder) {
                    metrics.ordersNotKept = Number(metrics.ordersNotKept || 0) + 1;
                    (metrics.ordersNotKeptEvidence = metrics.ordersNotKeptEvidence || []).push(evidence);
                    return;
                }
                metrics.formsPersistenceUnproven++;
                (metrics.formsPersistenceEvidence = metrics.formsPersistenceEvidence || []).push(evidence);
            };
            if (!shownAs) {
                unproven('after submit');
            } else {
                await eyes.say(page, 'أتحقق من حفظ النتيجة بعد تحديث الصفحة');
                //  What the server sends the reloaded page: a record it returns is kept, whichever view the page opens on.
                const served: string[] = [];
                const onServed = async (response: any) => {
                    try {
                        if (served.length >= 40 || String(response.request().method()).toUpperCase() !== 'GET') return;
                        if (new URL(response.url()).origin !== new URL(page.url()).origin) return;
                        if (!/json|text|javascript/i.test(String(response.headers()['content-type'] || ''))) return;
                        served.push(String(await response.text()).slice(0, 400_000));
                    } catch { /* a body that cannot be read says nothing */ }
                };
                try { page.on('response', onServed); } catch { /* a page without events */ }
                const reloaded = await page.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(6000, Math.max(1, deadline - Date.now())) })
                    .then((response: any) => !!response && response.ok()).catch(() => false);
                const persistenceDeadline = Math.min(deadline, Date.now() + 2500);
                let found = '';
                do {
                    if (!reloaded || Date.now() >= persistenceDeadline || !eyeIsOpen()) break;
                    found = await visibleNeedle(needles);
                    if (!found) await page.waitForTimeout(100);
                } while (!found && Date.now() < persistenceDeadline && eyeIsOpen());
                let keptBy = found ? 'page' : '';
                if (!found && reloaded) {
                    //  Kept by the browser: a form's own draft («draft», «autosave») is not a record.
                    const stored = await page.evaluate((list: string[]) => {
                        for (const store of [window.localStorage, window.sessionStorage]) {
                            try {
                                for (let i = 0; i < store.length; i++) {
                                    const key = String(store.key(i) || '');
                                    if (/draft|autosave|auto-save|unsaved|form-?state/i.test(key)) continue;
                                    const value = String(store.getItem(key) || '');
                                    if (list.some(n => value.includes(n))) return true;
                                }
                            } catch { /* a storage the page may not read */ }
                        }
                        return false;
                    }, needles).catch(() => false);
                    if (stored) keptBy = 'storage';
                    else if (served.some(body => needles.some(n => body.includes(n)))) keptBy = 'server';
                }
                try { page.off('response', onServed); } catch { /* the page may be gone */ }
                if (!keptBy) {
                    unproven('after reload');
                } else {
                    metrics.formsPersisted++;
                    persistedThis = true;
                    if (keptBy !== 'page') metrics.formsPersistedOutOfView = Number(metrics.formsPersistedOutOfView || 0) + 1;
                }
                if (found) {
                    const deleteSelector = await page.evaluate((needle: string) => {
                        const isDelete = (el: Element) => /delete|remove|حذف|إزالة/i.test([
                            el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLElement).innerText,
                        ].filter(Boolean).join(' '));
                        const candidates = Array.from(document.querySelectorAll('button,[role="button"],a'))
                            .filter(isDelete) as HTMLElement[];
                        const target = candidates.find(el => {
                            const record = el.closest('li,tr,[data-item],[data-row],.row,.item,.transaction,.entry,article');
                            return !!record && (record as HTMLElement).innerText.includes(needle);
                        });
                        if (!target) return '';
                        target.setAttribute('data-joe-qa-delete-own-record', 'true');
                        return '[data-joe-qa-delete-own-record="true"]';
                    }, found).catch(() => '');
                    if (deleteSelector) {
                        await eyes.say(page, 'أختبر إزالة السجل الذي أنشأه الفحص فقط');
                        await page.$(deleteSelector).then((el: any) => el?.click({ timeout: 2500, force: true, noWaitAfter: true })).catch(() => { });
                        const removalDeadline = Date.now() + 1800;
                        let removed = false;
                        while (!removed && Date.now() < removalDeadline) {
                            await page.waitForTimeout(150);
                            removed = await page.evaluate((needle: string) => !document.body.innerText.includes(needle), found).catch(() => false);
                        }
                        if (removed) metrics.qaRecordsDeleted++;
                        else metrics.qaRecordsNotDeleted++;
                    }
                }
            }
        }
        if (returnAfterForm) {
            await page.goto(returnAfterForm, { timeout: 8000 }).catch(() => { });
            await page.waitForTimeout(250).catch(() => { });
        }
        //  What a wrong value the product kept left behind is the QA's own: removed, never a visitor's.
        if (savedInvalid && eyeIsOpen()) {
            const removed = await deleteOwnRecords(page, runNonce, 4);
            metrics.qaRecordsDeleted += removed;
        }
        out.push({ label: f.label, fields: f.fields.length, filled: filledCount, effect, semanticFieldsTested, scope: opts?.formContext || (opts?.formScope ? opts.formScope : ''), ...(persistedThis ? { persisted: true } : {}) });
    }
    writes.stop();
    return { forms: out, metrics };
}

/* ---- judgement, on what actually happened ------------------------------ */

/** Controls that were never pressed: unreachable, declined by the product, consumed by the walk. */
const NOT_PRESSED: ReadonlySet<string> = new Set(['not found', 'declined', 'consumed', 'reached', 'current']);

/** The verdict, kept separate so both audits reach it by the same road. */
export function judgeBehaviour(
    controls: ControlResult[],
    metrics: Record<string, any>,
    jsErrors: string[] = [],
    forms: FormResult[] = [],
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
    // State exploration can encounter the same control more than once. Keep
    // route, viewport and occurrence independent, while allowing measured
    // success to dominate a later idempotent press of that exact control.
    const evidence = new Map<string, ControlResult>();
    controls.forEach((control, index) => {
        // Legacy/external evidence without an occurrence id remains distinct;
        // equal labels alone never prove two buttons are the same element.
        const occurrence = control.instance === undefined ? `legacy-${index}` : String(control.instance);
        const key = `${control.context || ''}|${control.kind}|${control.bare || control.label}|${occurrence}`;
        const previous = evidence.get(key);
        if (!previous || (!previous.worked && control.worked)
            //  A quiet press later known to be the link to the page already open (probeControls second look).
            || (!previous.worked && control.effect === 'current')
            || (previous.effect === 'not found' && control.effect !== 'not found')
            || (NOT_PRESSED.has(String(previous.effect || '')) && !NOT_PRESSED.has(String(control.effect || '')))) evidence.set(key, control);
    });
    const judgedControls = [...evidence.values()];
    const pressable = judgedControls.filter(c => c.kind !== 'anchor' && !NOT_PRESSED.has(String(c.effect || '')));
    const unreachable = judgedControls.filter(c => c.kind !== 'anchor' && c.effect === 'not found');
    //  Declined by the product, or consumed by the walk's own writes (probeControls): told in the metrics, never judged.
    metrics.goneByTheWalk = judgedControls.filter(c => c.kind !== 'anchor' && (c.effect === 'declined' || c.effect === 'consumed')).length;
    /*
     * A form's own button, pressed empty by the controls' walk, is judged by the forms pass that filled and sent
     * it. The walk names its screen «desktop:#/instructor» and the form «#/instructor إضافة درس» (L452,
     * 2026-11-10: eight submits «unresponsive» that the forms pass had filled, sent and seen answered):
     * both are read as the screen and the button's own words.
     */
    //  A scope with no width is the walk's forms pass, which fills at the desktop width: it answers for the desktop's buttons only,
    //  and a form measured at one width never hides a dead submit at another (form-scope-prevents-false-dead-control).
    const hasWidth = (s: string) => /^[^:#/]+:/u.test(String(s || ''));
    const bareOf = (label: string, screen: string) => screen !== '/' && String(label).startsWith(`${screen} `) ? String(label).slice(screen.length + 1) : String(label);
    const measuredFormSubmits = new Set(forms.filter(form => form.effect === 'submitted' || form.effect === 'validation' || form.effect === 'refused' || form.effect === 'searched')
        .flatMap(form => {
            const scope = String(form.scope || '');
            if (hasWidth(scope)) return [`${scope}|${form.label}`];
            const screen = scope || '/';
            return [`${scope}|${form.label}`, `desktop:${screen}|${bareOf(form.label, screen)}`];
        }));
    const dead = pressable.filter(c => !c.worked && !(c.kind === 'submit' && measuredFormSubmits.has(`${c.context || ''}|${c.bare || c.label}`)));
    metrics.pressed = pressable.length;
    metrics.dead = dead.length;
    metrics.unreachable = unreachable.length;

    if (unreachable.length) {
        /*
         * «Not pressed, so not judged» — told, not refused, when it is a few of many: the builder cannot
         * make the walk press what its own presses took away (L162, three refusals for 1 of 22). A walk
         * that lost a fifth of the page or more saw a page that keeps redrawing itself: that refuses.
         */
        const share = judgedControls.length ? unreachable.length / judgedControls.length : 1;
        findings.push({
            code: 'controls_not_reached', severity: share >= 0.2 ? 'major' : 'minor',
            ar: `لم أصل إلى ${unreachable.length} من ${judgedControls.length} زرّاً لأجرّبه: ${unreachable.slice(0, 3).map(d => `«${d.label}»`).join('، ')} — اختفت من الصفحة قبل الضغط، ولا أدّعي أنّها معطوبة`,
            en: `${unreachable.length} of ${judgedControls.length} controls were gone before I could press them: ${unreachable.slice(0, 3).map(d => `"${d.label}"`).join(', ')} — not pressed, so not judged`,
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
            ar: `${metrics.deadAnchors} رابط تنقّل يشير إلى قسم غير موجود أو غير مرئي في الصفحة`,
            en: `${metrics.deadAnchors} navigation link(s) point at a section that is missing or not visible`,
            hint: 'give every target section a matching id and ensure neither it nor an ancestor is visually hidden',
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
            evidence: (metrics.formsDeadSubmitEvidence || []).slice(0, 8),
        });
    }
    if ((metrics.formsNotReached || 0) > 0) {
        findings.push({
            code: 'forms_not_reached', severity: 'major',
            ar: 'لم يمكن تحديد بعض النماذج بعد تغيّر الصفحة؛ لم تُختبر ولا أعدّها معطوبة.',
            en: 'Some forms could not be uniquely rediscovered after the page changed; they were not tested and are not judged dead.',
            hint: 'rediscover the current form identity before submitting; do not rewrite application handlers based on missing QA targets',
            evidence: (metrics.formsNotReachedEvidence || []).slice(0, 8),
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
    if ((metrics.semanticValidationFailures || 0) > 0) {
        const failed = (metrics.semanticValidationEvidence || []).filter((item: any) => !item.rejected).slice(0, 4);
        findings.push({
            code: 'semantic_input_validation', severity: 'major',
            ar: `${metrics.semanticValidationFailures} حقل دلالي لا يرفض القيمة الخاطئة: ${failed.map((item: any) => `«${item.field}» يجب أن يكون ${item.expected}`).join('، ')}`,
            en: `${metrics.semanticValidationFailures} semantic field(s) accept an invalid value: ${failed.map((item: any) => `"${item.field}" should be ${item.expected}`).join(', ')}`,
            hint: 'use the native email, tel, number, date, or time type and a restrictive pattern where the native type permits free text',
            evidence: failed,
        });
    }
    //  Each control asked whether it did its own job (qa-control-intent.ts): said with its words and its promise.
    const jobs: any[] = Array.isArray(metrics.intentFailures) ? metrics.intentFailures : [];
    const jobLine = (list: any[], ar: boolean) => list.slice(0, 4)
        .map(j => ar ? `«${j.label}» يجب أن ${j.ar}` : `"${j.label}" should be the control that ${j.en}`)
        .join(ar ? '، ' : '; ');
    const missedMajor = jobs.filter(j => j.weight === 'major');
    if (missedMajor.length) findings.push({
        code: 'control_missed_its_job', severity: 'major',
        ar: `${missedMajor.length} زرّاً ضُغط ولم يؤدِّ عمله: ${jobLine(missedMajor, true)}`,
        en: `${missedMajor.length} control(s) were pressed and did not do their job: ${jobLine(missedMajor, false)}`,
        hint: 'make each control do exactly what its words say: «Add to cart» raises the cart count, «Close» closes its dialog, «+» and «−» move the number beside them by one',
        evidence: missedMajor,
    });
    const missedMinor = jobs.filter(j => j.weight !== 'major');
    if (missedMinor.length) findings.push({
        code: 'control_job_unseen', severity: 'minor',
        ar: `${missedMinor.length} زرّاً لم يظهر أنه أدّى ما تعد به كلماته: ${jobLine(missedMinor, true)}`,
        en: `${missedMinor.length} control(s) did not visibly do what their words promise: ${jobLine(missedMinor, false)}`,
        hint: 'a sort reorders, a next page shows other items, a like or follow flips its own state (aria-pressed), a view opens what it shows',
        evidence: missedMinor,
    });
    //  The case matrix (qa-field-cases.ts, probeForms): each failure said with the field, the value and what was expected.
    const caseFailures: any[] = Array.isArray(metrics.fieldCaseFailures) ? metrics.fieldCaseFailures : [];
    const said = (list: any[], ar: boolean) => list.slice(0, 4).map(x => ar
        ? `«${x.field}» في «${x.form}»: ${x.ar}`
        : `"${x.field}" in "${x.form}": ${x.en}`).join(ar ? '، ' : '; ');
    const ran = caseFailures.filter(x => x.outcome === 'markup_ran');
    if (ran.length) findings.push({
        code: 'markup_executes', severity: 'critical',
        ar: `ما يكتبه الزائر يُنفَّذ في الصفحة: نصّ فيه وسم <img onerror> شغّل شيفرته بعد الحفظ (${said(ran, true)}) — أي زائر يستطيع تشغيل شيفرته عند كل من يفتح الصفحة`,
        en: `What a visitor types runs in the page: text with an <img onerror> tag ran its script after it was saved (${said(ran, false)}) — any visitor can run code in everyone's browser`,
        hint: 'write user text with textContent (or the framework\'s escaped binding), never innerHTML; escape it on the server too',
        evidence: ran,
    });
    const drawn = caseFailures.filter(x => x.outcome === 'markup_drawn');
    if (drawn.length) findings.push({
        code: 'markup_drawn', severity: 'major',
        ar: `ما يكتبه الزائر يُرسم كوسوم HTML بدل أن يظهر نصّاً: ${said(drawn, true)}`,
        en: `What a visitor types is drawn as HTML instead of shown as text: ${said(drawn, false)}`,
        hint: 'write user text with textContent (or the framework\'s escaped binding), never innerHTML',
        evidence: drawn,
    });
    const saved = caseFailures.filter(x => x.outcome === 'saved_invalid');
    if (saved.length) findings.push({
        code: 'field_accepts_invalid', severity: 'major',
        ar: `${saved.length} حقل قبل قيمة خاطئة وحفظها: ${said(saved, true)}`,
        en: `${saved.length} field(s) took a wrong value and saved it: ${said(saved, false)}`,
        hint: 'validate each field by what it means, in the page (type, min, max, maxlength, pattern, required) and again on the server, and show the visitor why it was refused',
        evidence: saved,
    });
    const refusedValid = caseFailures.filter(x => x.outcome === 'rejected_valid');
    if (refusedValid.length) findings.push({
        code: 'field_rejects_valid', severity: 'major',
        ar: `${refusedValid.length} حقل رفض قيمة صحيحة: ${said(refusedValid, true)}`,
        en: `${refusedValid.length} field(s) refused a valid value: ${said(refusedValid, false)}`,
        hint: 'accept Arabic and every valid value a visitor may type; a pattern must not exclude non-Latin letters unless the request asks for it',
        evidence: refusedValid,
    });
    const minorCases = caseFailures.filter(x => x.outcome === 'accepted_at_input' || x.outcome === 'refused_silently');
    if (minorCases.length) findings.push({
        code: 'field_case_minor', severity: 'minor',
        ar: `${minorCases.length} حالة تحقّق ضعيفة في الحقول: ${minorCases.slice(0, 4).map(x => x.outcome === 'refused_silently' ? `«${x.field}» رفض «${x.value}» دون أن يقول للزائر لماذا` : `«${x.field}» قبِل عند الكتابة: ${x.ar}`).join('، ')}`,
        en: `${minorCases.length} weak field check(s): ${minorCases.slice(0, 4).map(x => x.outcome === 'refused_silently' ? `"${x.field}" refused "${x.value}" without telling the visitor why` : `"${x.field}" took at input: ${x.en}`).join('; ')}`,
        hint: 'tell the visitor what is wrong beside the field, and refuse what the field\'s meaning forbids',
        evidence: minorCases,
    });
    if ((metrics.formsPersistenceUnproven || 0) > 0) {
        /*
         * Said as it was measured: a form whose work never showed is not a form
         * whose work «appeared temporarily» (L162: Joe was told the second and
         * the first was true, and mended what was not broken).
         */
        const evidence: any[] = Array.isArray(metrics.formsPersistenceEvidence) ? metrics.formsPersistenceEvidence : [];
        const neverShown = evidence.filter(x => x?.where === 'after submit');
        const gone = evidence.filter(x => x?.where !== 'after submit');
        const parts = { ar: [] as string[], en: [] as string[] };
        if (neverShown.length) {
            parts.ar.push(`أُرسل ${neverShown.map(x => `«${x.form}»`).join('، ')} وقَبِله، ولم يظهر خارج النموذج ما صنعه: لا ما كتبه الفحص (${neverShown.map(x => `«${x.anchor}»`).join('، ')}) ولا سجلّ جديد`);
            parts.en.push(`${neverShown.map(x => `"${x.form}"`).join(', ')} was sent and taken, and what it made never showed outside the form: neither what the QA typed (${neverShown.map(x => `"${x.anchor}"`).join(', ')}) nor a new record`);
        }
        if (gone.length) {
            parts.ar.push(`ظهر ما صنعه ${gone.map(x => `«${x.form}»`).join('، ')}، وبعد تحديث الصفحة لم يُعثر عليه: لا في الصفحة ولا في تخزين المتصفح ولا فيما أعاده الخادم`);
            parts.en.push(`what ${gone.map(x => `"${x.form}"`).join(', ')} made showed, and after a refresh it was found nowhere: not on the page, not in the browser's storage, not in what the server sent back`);
        }
        findings.push({
            code: 'form_persistence_unproven', severity: 'major',
            ar: parts.ar.join('؛ ') || `${metrics.formsPersistenceUnproven} نتيجة نموذج لم يثبت بقاؤها بعد تحديث الصفحة`,
            en: parts.en.join('; ') || `${metrics.formsPersistenceUnproven} form result(s) could not be proven to survive a page refresh`,
            hint: neverShown.length && !gone.length
                ? 'after a successful submit, show what it made outside the form — the new row, card or entry with what was entered — and keep it'
                : 'persist the created record and render it again after reload; do not treat a transient success message as saved work',
            ...(evidence.length ? { evidence: evidence.slice(0, 6) } : {}),
        });
    }
    if ((metrics.ordersNotKept || 0) > 0) {
        const orders: any[] = Array.isArray(metrics.ordersNotKeptEvidence) ? metrics.ordersNotKeptEvidence : [];
        findings.push({
            code: 'order_not_kept', severity: 'minor',
            ar: `أُكِّد الطلب في ${orders.map(x => `«${x.form}»`).join('، ') || 'نموذج الدفع'}، ولا أثر له بعد تحديث الصفحة: لا يستطيع المشتري أن يرى ما طلبه`,
            en: `the order was confirmed by ${orders.map(x => `"${x.form}"`).join(', ') || 'the checkout'}, and nothing of it remains after a refresh: a shopper cannot see what he ordered`,
            hint: 'keep each placed order (a «my orders» list, with its number and items) where the shopper can find it again',
            ...(orders.length ? { evidence: orders.slice(0, 6) } : {}),
        });
    }
    if ((metrics.qaRecordsNotDeleted || 0) > 0) {
        findings.push({
            code: 'qa_created_record_not_deletable', severity: 'major',
            ar: `تعذر حذف سجل أنشأه فحص الجودة نفسه`,
            en: 'A record created by the QA run itself could not be deleted',
            hint: 'make the record-level removal action reachable and update the visible state after deletion',
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
