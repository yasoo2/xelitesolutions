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
import { casesFor, fillValueFor, markupFieldOf, meaningOf, selectValueFor, type FieldCase, type QaField } from './qa-field-cases';
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
    'some_dead_controls', 'semantic_input_validation', 'form_persistence_unproven', 'form_persistence_unmeasured',
    'qa_created_record_not_deletable', 'order_not_kept',
    'markup_executes', 'markup_drawn', 'field_accepts_invalid', 'field_rejects_valid', 'field_case_minor',
    'control_missed_its_job', 'control_job_unseen', 'form_submit_disabled',
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
    /**
     * Pressed on a state it had something to answer (a box typed into, a field moved, another view
     * opened) and still quiet: a measured dead result. The review of 2026-11-15: an «idle» reset from
     * one walk must never replace this in the verdict's merge (judgeBehaviour).
     */
    fair?: boolean;
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
        /*
         * A field is filled, never pressed. The eleventh live check, 2026-11-11 (L232, a laundry):
         * «Search orders» (an input type=search) and «Filter by status» (a select) carried
         * data-filter, were catalogued as tabs, pressed, changed nothing — «Unresponsive controls»,
         * five refusals. A field is the forms pass's, and a search's second look.
         */
        //  A checkbox or a radio too: the fourth review (2026-11-11) found a radio already checked
        //  pressed, changing nothing, and reported dead under the label «input»; a checkbox always toggles.
        if (/^(?:INPUT|SELECT|TEXTAREA)$/u.test(el.tagName) && !/^(?:submit|button|reset|image)$/iu.test(String((el as HTMLInputElement).type || ''))) return;
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
    /*
     * …but a class named «filter» is not a control. The exam, 2026-11-13 (P397, P236): the whole
     * bar («From To Last 3 months Last 6 months Reset range», a <div class="filter">) and a
     * <label class="filter"> around a <select> were pressed as tabs and called unresponsive. A
     * «.filter» or «[data-filter]» is one only when it is itself pressable (a button, a link, a
     * control's role, a tab stop, or a pointer with nothing pressable inside) and holds no field.
     */
    const ownControl = (el: Element): boolean => {
        if (el.matches('[role="tab"], [data-tab], .tab')) return true;
        if (el.querySelector('input, select, textarea')) return false;
        if (el.matches('button, a[href], input[type="button"], input[type="radio"], input[type="checkbox"], [role="button"], [role="radio"], [role="option"], [role="menuitem"], [role="menuitemradio"], [role="link"], [role="switch"], [role="checkbox"], [tabindex]:not([tabindex="-1"])')) return true;
        return getComputedStyle(el).cursor === 'pointer' && !el.querySelector('button, a[href], [role="button"], [role="tab"], [role="link"]');
    };
    document.querySelectorAll('[role="tab"], [data-tab], .tab, .filter, [data-filter]').forEach(el => { if (ownControl(el)) push(el, 'tab'); });
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
    /*
     * …and the submit stamps with them. The seventh live check, 2026-11-10 (L160, one document, its views
     * hidden and shown): the cars view's «Save» kept «joe-form-1» from the cars pass; on the customers
     * view the customers' «Save» got «joe-form-1» too, and the QA filled the customers' form and pressed
     * the first stamp in the document — the hidden cars «Save». Nothing was sent: «filled in completely and
     * submitted, and nothing happened at all», ten refusals, and a working dashboard failed after 76 minutes.
     */
    document.querySelectorAll('[data-joe-sub]').forEach(el => el.removeAttribute('data-joe-sub'));
    const forms: Array<{
        sel: string; label: string;
        fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[]; name: string; pattern: string; min: string; max: string; minLength: number; maxLength: number; step: string; inputMode: string; autocomplete: string; placeholder: string }>;
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
        const fields: Array<{ sel: string; tag: string; type: string; required: boolean; options: string[]; name: string; pattern: string; min: string; max: string; minLength: number; maxLength: number; step: string; inputMode: string; autocomplete: string; placeholder: string }> = [];
        const raw = Array.from(f.querySelectorAll('input,textarea,select'));
        /*
         * A group of radios is one question, answered once. run500 P298 (a booking page, 2026-11-13):
         * twelve time slots, each taken as a field of its own, filled the form's fourteen before its
         * phone was reached; the form was sent with no phone, the page said «رقم الهاتف مطلوب», and
         * nothing reached the server. Its first choice a person can take stands for the group.
         */
        const radioGroups = new Set<string>();
        for (const el of raw) {
            if (fields.length >= maxFields) break;
            const h = el as HTMLInputElement;
            const type = (h.getAttribute('type') || (el.tagName === 'TEXTAREA' ? 'textarea' : el.tagName === 'SELECT' ? 'select' : 'text')).toLowerCase();
            if (['hidden', 'submit', 'button', 'image', 'reset', 'file'].includes(type)) continue;
            if (h.disabled || h.readOnly) continue;
            if (!vis(el)) continue;
            if (type === 'radio' && h.name) {
                if (radioGroups.has(h.name)) continue;
                radioGroups.add(h.name);
            }
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
                //  A card field is known by its autocomplete token too (cc-number, cc-csc, cc-exp: qa-field-cases.ts).
                autocomplete: h.getAttribute('autocomplete') || '', placeholder: h.getAttribute('placeholder') || '',
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
        /*
         * «طلب» and «order» alone are not a record to find again. The exam, 2026-11-12 (P041, a landing
         * page): its contact form's «إرسال الطلب» («send the request») was read as a record the page must
         * show after a refresh, and refused four times. A form that sends a message is proven by its
         * answer and the server's; only words that make a record — or «طلب»/«order» with no word of
         * sending beside them — ask for one (expectsPersistentRecord says the same for Node).
         */
        const makesRecord = /\b(?:add|create|save|register|book|reserve|new record)\b|أضف|اضف|إضافة|اضافة|إنشاء|انشاء|حفظ|احفظ|تسجيل|حجز|احجز/i.test(persistenceContext);
        const sendsMessage = /\b(?:send|contact|message|inquiry|enquiry|get in touch|subscribe|newsletter|request a (?:quote|call|callback))\b|أرسل|ارسل|إرسال|ارسال|تواصل|اتصل|راسل|رسالة|استفسار|اشترك|اشتراك|النشرة/i.test(persistenceContext);
        const expectsPersistence = !signsIn && (makesRecord || (!sendsMessage && /\border\b|طلب/i.test(persistenceContext)));
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

/** Runs in the page: how many shown controls carry each name, named as findControls names them — stamping nothing. Self-contained. */
export function controlLabelCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    document.querySelectorAll('button, [role="button"], a[href], summary, input[type="submit"], input[type="button"], [role="tab"], [role="menuitem"], [role="link"], [data-tab], .tab, .filter, [data-filter], [aria-expanded], [aria-haspopup], .menu-toggle, .nav-toggle, .hamburger, .burger, [data-menu]').forEach(node => {
        const el = node as HTMLElement;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!(r.width > 4 && r.height > 4 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05)) return;
        const text = (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || text || el.tagName.toLowerCase();
        out[name] = (out[name] || 0) + 1;
    });
    return out;
}

/** Runs in the page: the headings a visitor sees, numbers masked — the view he is on («Your cart (2)» is the cart either way). Self-contained. */
export function visibleHeadings(skipFormTitles?: boolean): string[] {
    const out: string[] = [];
    /*
     * A form's own title says which mode the form is in, not which view is open. The
     * mosque app, qa-live15 (2026-11-11): «Edit lesson» above the fields while a record
     * was edited, «Add lesson» after the reload — the view «was another», nothing was
     * counted, and «found nowhere» refused the delivery three times on unchanged code.
     * Asked for by the persistence check only; a title inside a form, or the one the
     * form names as its label, is set aside.
     */
    const titles = new Set<Element>();
    if (skipFormTitles) {
        document.querySelectorAll('form').forEach(form => {
            form.querySelectorAll('h1, h2, h3, [role="heading"]').forEach(h => titles.add(h));
            for (const id of String(form.getAttribute('aria-labelledby') || '').split(/\s+/)) {
                const el = id ? document.getElementById(id) : null;
                if (el) titles.add(el);
            }
        });
    }
    document.querySelectorAll('h1, h2, [role="heading"]').forEach(node => {
        if (titles.has(node)) return;
        const h = node as HTMLElement;
        const r = h.getBoundingClientRect();
        const s = getComputedStyle(h);
        if (r.width <= 0 || r.height <= 0 || s.visibility === 'hidden' || s.display === 'none') return;
        const t = String(h.innerText || '').trim().replace(/\s+/g, ' ').replace(/\d+(?:[.,]\d+)?/g, '#').slice(0, 80);
        if (t) out.push(t);
    });
    return out;
}

/**
 * Runs in the page: marks, best first, the tabs and navigation links named like the
 * headings that a refresh took away — what a visitor presses to get back to the tab he
 * was on. Returns how many were marked (data-joe-viewback="0", "1", …); the caller
 * presses them one by one until the view is back. Words are compared whole, either way
 * round («Stock» opens «Stock list», «📦 Stock (3)» opens «Stock»); a control holding a
 * heading of its own (a brand link) and a form's button are never marked. Self-contained.
 */
export function markViewControls(missing: string[]): number {
    document.querySelectorAll('[data-joe-viewback]').forEach(el => el.removeAttribute('data-joe-viewback'));
    const words = (s: string) => String(s || '').normalize('NFKC').toLowerCase()
        .replace(/[\p{Extended_Pictographic}\p{P}\p{S}\d#]+/gu, ' ').split(/\s+/u).filter(w => w.length >= 2);
    const wanted = (Array.isArray(missing) ? missing : []).map(words).filter(w => w.some(x => x.length >= 3));
    if (!wanted.length) return 0;
    const contains = (big: string[], small: string[]) => small.length > 0 && small.every(w => big.includes(w));
    //  Tabs before navigation, navigation before a page's header and its links.
    const tiers = ['[role="tab"]', '[role="tablist"] button, [role="tablist"] a', 'nav a, nav button, aside a, aside button', 'a[href^="#"]', 'header a, header button'];
    const seen = new Set<Element>();
    let n = 0;
    for (const sel of tiers) {
        for (const node of Array.from(document.querySelectorAll(sel))) {
            const el = node as HTMLElement;
            if (seen.has(el)) continue;
            seen.add(el);
            if (el.closest('form') || el.querySelector('h1, h2, h3, [role="heading"]')) continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue;
            const label = words(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
            if (!label.some(w => w.length >= 3)) continue;
            if (wanted.some(h => contains(h, label) || contains(label, h))) el.setAttribute('data-joe-viewback', String(n++));
        }
    }
    return n;
}

/** Runs in the page: what says a quiet nav item is the link to the view already open (probeControls). Self-contained. */
export function currentLinkFacts(sel: string): { names: string; toggle: boolean; marked: boolean; first: boolean; brand: boolean } | null {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    const shown = (n: Element) => {
        const r = (n as HTMLElement).getBoundingClientRect();
        const s = getComputedStyle(n as HTMLElement);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const names = [document.title, ...Array.from(document.querySelectorAll('h1')).filter(shown).map(h => (h as HTMLElement).innerText)].join(' ');
    const cls = String(el.getAttribute('class') || '');
    const popup = el.getAttribute('aria-haspopup');
    const toggle = el.hasAttribute('aria-expanded') || (!!popup && popup !== 'false') || /(?:^|[\s_-])(?:menu-toggle|nav-toggle|hamburger|burger|toggle)(?:$|[\s_-])/i.test(cls);
    const current = el.getAttribute('aria-current');
    const marked = (!!current && current !== 'false') || el.getAttribute('aria-selected') === 'true' || /(?:^|\s)(?:active|current|selected|is-active|is-current)(?:$|\s)/i.test(cls);
    const group = el.closest('nav, [role="navigation"], [role="tablist"], [role="menubar"]');
    const items = group ? Array.from(group.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="link"], [role="menuitem"]')).filter(shown) : [];
    /*
     * …or its only one. The replay of the exam's P236 (2026-11-15): a store's header <nav> held one
     * button, «Shop» (setView('shop')), on the shop it opens on; no other control could leave that
     * view to try it from, and it was «unresponsive». Tried from another view and still quiet, it is
     * dead (probeControls testedElsewhere), alone or not.
     */
    const own = String(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').toLowerCase();
    /*
     * …but alone, only when the page shows it has other views the walk could not open: the review of
     * 2026-11-15 — `<nav><button>السلة</button></nav>` wired to nothing, on an app with one view,
     * was «the first item of its navigation» and never dead. A lone item is the open view's own link
     * when its words are the view a site opens on («Shop», «Home», «المتجر», «الرئيسية»), or when the
     * page holds a way to another view it does not let a visitor take yet (P236: «Proceed to
     * checkout» disabled on an empty cart) or a view it keeps hidden.
     */
    const landing = /^(?:home|shop|store|products|catalog(?:ue)?|browse|all products|الرئيسية|الصفحة الرئيسية|المتجر|المنتجات|تسوق|التسوق|تسوّق|الكتالوج)$/iu.test(own);
    /*
     * …and only a way that really leads to another view. The second review of 2026-11-15: a pager's
     * disabled «السابق», or a closed edit panel (`<section hidden><h2>تعديل المنتج</h2>`), made a
     * lone dead «السلة» «the first item» on a page with one view. A waiting way names a view it
     * leads to (a checkout, a cart, a payment); a hidden view stands beside the open one and is
     * named by a control the page shows.
     */
    const flat = (s: string) => String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const waitingWay = () => Array.from(document.querySelectorAll('button:disabled, [aria-disabled="true"]'))
        .some(b => b !== el && !b.closest('form') && !b.closest('.pager, .pagination, [class*="pagination"], [aria-label*="pag" i]') && !(b as HTMLButtonElement).form && shown(b)
            && /check\s*-?out|\bcart\b|basket|payment|\bpay\b|place (?:the |your )?order|proceed|إتمام|اتمام|الدفع|ادفع|السلة|سلة|الطلب|اطلب|الحجز/iu.test(String((b as HTMLElement).innerText || b.getAttribute('aria-label') || '')));
    const VIEW = 'section, main, [role="tabpanel"], [data-view], [data-page], [data-screen], .view, .page, .screen, .tab-pane';
    const named = Array.from(document.querySelectorAll('a[href], button, [role="button"], [role="tab"], [role="link"], [role="menuitem"]'))
        .filter(c => c !== el && !c.closest('form') && shown(c))
        .map(c => flat((c as HTMLElement).innerText || c.getAttribute('aria-label') || c.getAttribute('title') || ''))
        .filter(t => t.length >= 2 && t.length <= 60);
    const hiddenView = () => Array.from(document.querySelectorAll(VIEW))
        .some(v => {
            if (v.closest('[role="dialog"], dialog') || shown(v)) return false;
            const beside = Array.from(v.parentElement?.children || []).some(s => s !== v && s.matches(VIEW) && shown(s));
            if (!beside) return false;
            const heads = Array.from(v.querySelectorAll('h1, h2, h3, [role="heading"]')).map(h => flat(h.textContent || '')).filter(h => h.length >= 2);
            return heads.some(h => named.some(t => t === h || t.includes(h) || (t.length >= 4 && h.includes(t))));
        });
    const first = items.length > 0 && items[0] === el && (items.length > 1 || landing || waitingWay() || hiddenView());
    const brand = !!el.closest('header, [role="banner"]') && !group && own.length >= 2 && String(document.title || '').toLowerCase().includes(own);
    return { names, toggle, marked, first, brand };
}

/**
 * A FORM THAT SEARCHES: a search box, with nothing beside it but what narrows the search — a
 * select, a date, a checkbox, a number. Sent with words that match what the list already shows,
 * it rightly changes nothing. The seventh live check, 2026-11-10 (L160): the bookings' «Search»
 * with its «All statuses» select was «filled in completely and submitted, and nothing happened»,
 * because only a box alone counted as a search — a blocking refusal of a working search.
 */
export function isSearchForm(fields: Array<{ tag?: string; type?: string; name?: string }>, label = ''): boolean {
    if (!fields.length) return false;
    //  The second review, 2026-11-11: «Add booking» with a «Search customer…» box beside its dates is a form that writes.
    if (/\b(?:add|create|save|submit|book|reserve|order|send|register|update|post|publish|confirm|pay|check ?out|sign (?:in|up)|log ?in|apply now)\b|أضف|إضافة|اضافة|حفظ|احفظ|أرسل|ارسل|إرسال|ارسال|احجز|حجز|تأكيد|سجّل|سجل|تسجيل|اطلب|ادفع/iu.test(String(label))) return false;
    const meanings = fields.map(x => meaningOf({ tag: x.tag, type: x.type, name: x.name } as any));
    return meanings.includes('search') && meanings.every(m => m === 'search' || m === 'select' || m === 'check' || m === 'date' || m === 'range' || m === 'number');
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
    //  Cut as newRecordTokens cuts: a word's own full stop or question mark is not part of it.
    for (const raw of String(document.body?.innerText || '').split(/[\s،؛,;:()[\]{}«»"'|—–]+/)) {
        const t = raw.replace(/^[.!?؟…]+|[.!?؟…]+$/gu, '');
        if (t) out.add(t);
    }
    return Array.from(out).slice(0, 30_000);
}

/**
 * Runs in the page: a fingerprint of what the browser itself keeps for the page — its storage (a
 * form's own draft aside), its cookies, its IndexedDB databases. A submit that changed none of it,
 * and that no server took, kept nothing anywhere: the one positive proof that a record was lost
 * (probeForms). Self-contained.
 */
export async function browserKept(): Promise<string> {
    const parts: string[] = [];
    for (const [name, store] of [['local', window.localStorage], ['session', window.sessionStorage]] as Array<[string, Storage]>) {
        try {
            for (let i = 0; i < store.length; i++) {
                const key = String(store.key(i) || '');
                if (/draft|autosave|auto-save|unsaved|form-?state/i.test(key)) continue;
                parts.push(`${name}:${key}=${String(store.getItem(key) || '')}`);
            }
        } catch { parts.push(`${name}:?`); }
    }
    parts.sort();
    try { parts.push(`cookie:${document.cookie}`); } catch { /* none */ }
    try {
        const dbs = typeof (indexedDB as any)?.databases === 'function' ? await (indexedDB as any).databases() : [];
        //  A page that keeps an IndexedDB may have kept the record there: it is never «kept nothing».
        if (dbs.length) parts.push(`idb:${Date.now()}`);
    } catch { /* none */ }
    let h = 5381;
    const text = parts.join('\n');
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
    return `${text.length}:${h}`;
}

/**
 * In Node: whether the server, asked again where a write went, lists its records under the very field
 * the QA's mark was sent in — and this one is not among them. That is a 201 that kept nothing,
 * measured: positive proof, as a submit that wrote nowhere is. A collection that does not show that
 * field (a booking list of slots without names) proves nothing and is never read as lost, nor is one
 * of fifty records or more (a page of a longer list may simply not hold it yet).
 */
export function serverListsWithout(
    posts: Array<{ at: string; body: string; method?: string; answer?: string }>,
    answers: Array<string | { at: string; body: string }>,
    mark: string,
    said = '',
): boolean {
    return !!serverListVerdict(posts, answers, mark, said);
}

/** A key by which a list may show only some of its records: a state, an approval, a publication. */
const LIST_STATE_KEY = /^(?:status|state|stage|approved|is_?approved|published|is_?published|visible|is_?visible|hidden|is_?hidden|moderat\w*|review_?status|pending|is_?pending|active|is_?active|archived|is_?archived|deleted|is_?deleted|draft|is_?draft)$/i;
/*
 * Words that say a record is kept and waits before it is listed: a review held for approval — said in
 * a sentence about review or approval, never a status badge. The second review of 2026-11-15: a booking
 * drawn with its «Pending» badge, or «Booking #9 … Pending», switched the empty-list proof off for a 201
 * that kept nothing; «pending» counts only beside a review, an approval, a moderation or a confirmation.
 */
export const HELD_FOR_REVIEW = /\b(?:moderat\w*|awaiting (?:review|approval|moderation|confirmation)|under review|in review|for (?:approval|review|moderation)|needs? approval|pending (?:review|approval|moderation|confirmation|verification)|(?:review|approval|moderation)s? (?:is |are )?pending|(?:once|after|until|when) (?:it is |it's |it has been |they are |they have been )?(?:approved|reviewed|moderated|confirmed)|will (?:appear|show) (?:after|once|when|soon|shortly)|will be (?:shown|published|visible|listed|reviewed|approved))\b|بانتظار\s+(?:ال)?(?:مراجع|موافق|اعتماد|تأكيد|تاكيد|نشر)|قيد\s+المراجع|بعد\s+(?:المراجع|الموافق|الاعتماد|مراجعت|اعتماد|موافق)|موافقة\s+(?:الإدارة|الادارة|المشرف|المسؤول)|سيظهر|ستظهر|سيتم\s+نشر|ستُنشر|سيُنشر|ستنشر|سينشر/iu;
/**
 * A state that says the record is kept and not shown: approved, published or visible false; hidden,
 * pending (as a flag), a draft, archived, deleted; a status of review or moderation. A bare
 * «"status": "pending"» or «"new"» is what most orders and bookings answer, listed or not: no hold.
 */
function heldState(o: Record<string, unknown> | null): boolean {
    if (!o) return false;
    for (const [k, v] of Object.entries(o)) {
        if (!LIST_STATE_KEY.test(k)) continue;
        const s = String(v ?? '').trim().toLowerCase();
        if (/^(?:is_?)?(?:approved|published|visible|active)$/i.test(k) && (v === false || v === 0 || s === 'false' || s === '0')) return true;
        if (/^(?:is_?)?(?:hidden|pending|draft|archived|deleted)$/i.test(k) && (v === true || v === 1 || s === 'true' || s === '1')) return true;
        if (/^(?:status|state|stage|moderat\w*|review_?status)$/i.test(k) && /^(?:pending[_ -]?(?:review|approval|moderation|verification)|awaiting[_ -]?\w+|in[_ -]?review|under[_ -]?review|unapproved|not[_ -]?approved|moderation|moderating|in[_ -]?moderation|hidden|draft|archived|deleted|rejected|spam|unpublished|private)$/.test(s)) return true;
    }
    return false;
}
/** A list asked with a filter in its address («?status=approved»): an empty answer says nothing of the rest. */
function filteredList(at: string): boolean {
    try { return new URL(String(at)).search.length > 1; } catch { return /\?./.test(String(at || '')); }
}
/** The values a write carried, as text, for a form's own values to be found in (serverListVerdict). */
function sentValues(body: string): string[] {
    const out: string[] = [];
    const walk = (v: unknown, depth: number) => {
        if (out.length > 400) return;
        if (typeof v === 'string' || typeof v === 'number') { out.push(String(v).trim().toLowerCase()); return; }
        if (depth < 4 && v && typeof v === 'object') for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
    };
    try { walk(JSON.parse(String(body)), 0); } catch {
        try { for (const [, v] of new URLSearchParams(String(body))) out.push(String(v).trim().toLowerCase()); } catch { /* not a form body */ }
    }
    return out;
}
/** The length of a page a list is cut to: a list this long may hold the record on its next page. */
const PAGE_SIZES: ReadonlySet<number> = new Set([10, 12, 15, 20, 24, 25, 30, 40]);

/**
 * In Node: the measured proof that a write the server answered was not kept — '' when there is none.
 * 'empty': the collection the record was posted to, asked again, lists nothing at all (the commonest
 * «201 that keeps nothing», the review of 2026-11-15). 'others': it lists records under the very field
 * the QA's mark was sent in — or, for a form with nothing typed, records that share none of the values
 * it sent — and not this one.
 *
 * Read only from the collection's own answer (the POST's own address), its own top-level array or the
 * one array its top-level object holds — never a parent's record (POST /api/products/3/reviews is not
 * answered by /api/products/3). And never from a list that may show only some records: one cut to a
 * page (a total beyond it, a next page, a length a page is cut to, fifty or more), one whose every
 * record shares one state (approved, published) or that hides the state this record was given
 * (pending), one the server's answer or the page's own words say is held for review.
 *
 * Judged on the form's own write only — the first POST of the submit that carried the form's mark or
 * one of the values it was sent with (`values`). The second review of 2026-11-15: a barber's booking was
 * kept, the page then POSTed /api/notifications, whose list is empty for a visitor, and that empty list
 * «proved» the booking lost. With `values` not given, the first POST that carries the mark, or else the
 * submit's first POST.
 */
export function serverListVerdict(
    posts: Array<{ at: string; body: string; method?: string; answer?: string }>,
    answers: Array<string | { at: string; body: string }>,
    mark: string,
    said = '',
    values?: string[],
): '' | 'empty' | 'others' {
    if (HELD_FOR_REVIEW.test(String(said || ''))) return '';
    const made = (posts || []).filter(p => !p?.method || String(p.method).toUpperCase() === 'POST');
    const own = (values || []).map(v => String(v ?? '').trim().toLowerCase()).filter(v => v.length >= 2);
    const carries = (p: { body: string }) => {
        const body = String(p?.body || '');
        if (mark && body.includes(mark)) return true;
        if (!own.length) return false;
        const sent = sentValues(body);
        return own.some(v => sent.includes(v));
    };
    const first = made.find(carries) || (values === undefined ? made[0] : undefined);
    const judged = first ? [first] : [];
    const norm = (u: string) => {
        try { const x = new URL(String(u)); return (x.origin + x.pathname).replace(/\/+$/, ''); } catch { return String(u || '').split(/[?#]/)[0].replace(/\/+$/, ''); }
    };
    const parse = (t: string): unknown => { try { return JSON.parse(String(t)); } catch { return undefined; } };
    const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
    //  Kept, wherever it was asked: any answer that holds the mark.
    if (mark && (answers || []).some(a => String(typeof a === 'string' ? a : a?.body || '').includes(mark))) return '';
    const listOf = (value: unknown): { list: unknown[]; paged: boolean } | null => {
        if (Array.isArray(value)) return { list: value, paged: false };
        if (!isObject(value)) return null;
        const arrays = Object.keys(value).filter(k => Array.isArray(value[k]));
        if (arrays.length !== 1) return null;
        const list = value[arrays[0]] as unknown[];
        const total = ['total', 'count', 'totalCount', 'total_count', 'totalItems', 'total_items', 'totalResults', 'total_results']
            .map(k => Number(value[k])).find(n => Number.isFinite(n) && n >= 0);
        const more = ['next', 'nextCursor', 'next_cursor', 'nextPage', 'next_page', 'hasMore', 'has_more', 'hasNext', 'has_next', 'cursor'].some(k => !!value[k]);
        const pages = Number(value.totalPages ?? value.total_pages ?? value.pages ?? value.pageCount);
        return { list, paged: more || (total !== undefined && total > list.length) || (Number.isFinite(pages) && pages > 1) };
    };
    /** The record a write's own answer (or its body) describes: itself, or the one record it wraps. */
    const recordOf = (value: unknown): Record<string, unknown> | null => {
        if (!isObject(value)) return null;
        for (const k of ['data', 'item', 'record', 'result', 'entry', 'review', 'booking', 'order']) if (isObject(value[k])) return value[k] as Record<string, unknown>;
        return value;
    };
    const statesOf = (o: Record<string, unknown> | null) => (o ? Object.keys(o).filter(k => LIST_STATE_KEY.test(k)) : []);
    let verdict: '' | 'empty' | 'others' = '';
    for (const p of judged) {
        const body = String(p?.body || '');
        //  What its answer says in words («Your review is awaiting moderation»); a state it gives («pending») is judged against the list below.
        if (p?.answer) {
            const answered = parse(String(p.answer));
            const words: string[] = [];
            const read = (v: unknown, key: string, depth: number) => {
                if (typeof v === 'string') { if (!LIST_STATE_KEY.test(key)) words.push(v); return; }
                if (depth < 3 && v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) read(x, Array.isArray(v) ? key : k, depth + 1);
            };
            if (answered === undefined) words.push(String(p.answer));
            else read(answered, '', 0);
            if (HELD_FOR_REVIEW.test(words.join('\n'))) return '';
        }
        const sent = parse(body);
        /** The fields the mark was sent in; with no mark in this write, the values it sent. */
        const fields = new Set<string>();
        const values = new Map<string, string>();
        if (mark && body.includes(mark)) {
            const take = (key: string, value: unknown, depth: number): void => {
                if (typeof value === 'string') { if (value.includes(mark) && key) fields.add(key); return; }
                if (depth > 3 || !value || typeof value !== 'object') return;
                for (const [k, v] of Object.entries(value as Record<string, unknown>)) take(Array.isArray(value) ? key : k, v, depth + 1);
            };
            if (sent !== undefined) take('', sent, 0);
            else { try { for (const [k, v] of new URLSearchParams(body)) if (v.includes(mark)) fields.add(k); } catch { /* not a form body */ } }
            if (!fields.size) continue;
        } else {
            const own = recordOf(sent);
            const pairs: Array<[string, unknown]> = own ? Object.entries(own) : (() => { try { return Array.from(new URLSearchParams(body)); } catch { return []; } })();
            for (const [k, v] of pairs) {
                if (/pass|token|csrf|secret/i.test(k) || v === null || v === undefined || typeof v === 'object' || typeof v === 'boolean') continue;
                const s = String(v).trim();
                if (s && s.length <= 200) values.set(k, s);
            }
            if (!values.size) continue;
        }
        /** The states this record was given, by its own answer or by what was sent. */
        const ours = new Map<string, string>();
        const given = [recordOf(sent), recordOf(parse(String(p?.answer || '')))];
        for (const o of given) for (const k of statesOf(o)) ours.set(k, JSON.stringify(o![k]));
        /** The server says it keeps the record unseen (approved false, a status of review): no list proves it gone. */
        const held = given.some(heldState);
        const at = norm(p?.at);
        for (const a of answers || []) {
            if (typeof a !== 'string' && norm(a?.at) !== at) continue;
            const shown = listOf(parse(typeof a === 'string' ? a : a.body));
            if (!shown || shown.paged || shown.list.length >= 50 || PAGE_SIZES.has(shown.list.length)) continue;
            const records = shown.list.filter(isObject);
            //  A list of names or ids, not of records, proves nothing.
            if (records.length !== shown.list.length) continue;
            if (records.length) {
                //  Every record shown shares one state: the list may be that state only.
                const first = records[0];
                if (statesOf(first).some(k => records.every(r => JSON.stringify(r[k]) === JSON.stringify(first[k])))) continue;
                //  …or it shows records without the state this one was given.
                if ([...ours.keys()].some(k => !records.every(r => k in r))) continue;
                //  …or none in the state this one was given (a review kept «pending», a list of «approved» and «featured»).
                if ([...ours].some(([k, v]) => !records.some(r => JSON.stringify(r[k]) === v))) continue;
                if (held) continue;
            } else {
                /*
                 * Empty: lost, unless the list was asked with a filter or the server says it keeps the record
                 * unseen. The second review of 2026-11-15: any state in the answer («"status": "pending"», what
                 * most orders and bookings answer) switched this proof off; an unfiltered empty list after a
                 * 201 has room for every state, and it holds none.
                 */
                if (held || (typeof a !== 'string' && filteredList(a?.at))) continue;
                verdict = verdict || 'empty';
                continue;
            }
            if (fields.size) {
                if (records.some(r => [...fields].some(k => typeof r[k] === 'string' && String(r[k]).trim() !== ''))) verdict = 'others';
                continue;
            }
            //  Nothing typed: records sharing a key with what was sent, and none holding any of its values.
            const same = (x: unknown, v: string) => {
                const s = String(x ?? '').trim().toLowerCase(), w = v.toLowerCase();
                if (!s) return false;
                if (s === w || s.startsWith(w) || w.startsWith(s)) return true;
                return Number.isFinite(Number(s)) && Number.isFinite(Number(w)) && Number(s) === Number(w);
            };
            const sharing = records.filter(r => [...values.keys()].some(k => k in r));
            if (!sharing.length) continue;
            if (sharing.some(r => [...values].some(([k, v]) => k in r && same(r[k], v)))) continue;
            verdict = 'others';
        }
    }
    return verdict;
}

/*
 * ⛔ A FORM THAT SAVES A RECORD WITH POST EDITS IT — THE QA NEVER DELETES IT AS ITS OWN.
 *
 * The second review of 2026-11-15: a prefilled «Edit movie» form that POSTs /api/items/1 (HTML forms,
 * Express `app.post('/items/:id')`, GraphQL) was read as a create, and the QA deleted movie 1 as its own.
 * A POST made a record only when it went to a collection and the rows grew, or when its answer named a
 * new id — one the page did not show, the address does not hold and the write itself did not send. A
 * POST to a record's own address (/items/1, /items/1/update) is an edit unless it answered a new id.
 * A form that opened empty and POSTed to a collection made a record, as before. And another origin's
 * write (Supabase, Firebase) that carried the form's mark is judged the same way: a hosted database's
 * create is the QA's own to delete, its update never.
 */
/** The id a write's address ends on (/items/1, /items/1/update, a uuid, a database's own key), or ''. */
export function recordIdOfUrl(at: string): string {
    let path = '';
    try { path = new URL(String(at)).pathname; } catch { path = String(at || '').split(/[?#]/)[0]; }
    const parts = path.split('/').filter(Boolean);
    while (parts.length > 1 && /^(?:update|edit|save|patch|modify|replace|change|upsert)$/i.test(parts[parts.length - 1])) parts.pop();
    let last = parts[parts.length - 1] || '';
    try { last = decodeURIComponent(last); } catch { /* kept as written */ }
    if (parts.length < 2) return '';
    if (/^\d+$/.test(last) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(last) || /^[0-9a-f]{24}$/i.test(last)) return last;
    return /^[A-Za-z0-9_-]{6,40}$/.test(last) && /\d/.test(last) && /[A-Za-z]/.test(last) && !/^v\d+$/i.test(last) ? last : '';
}
/** The id a write's answer names: the record it returns, or the one record it wraps (`data`, a list of one, a GraphQL field). */
export function answeredRecordId(answer: string): string {
    let value: unknown;
    try { value = JSON.parse(String(answer || '')); } catch { return ''; }
    const queue: Array<{ v: unknown; depth: number }> = [{ v: value, depth: 0 }];
    while (queue.length) {
        const { v, depth } = queue.shift()!;
        if (Array.isArray(v)) { if (v.length === 1 && depth < 4) queue.push({ v: v[0], depth: depth + 1 }); continue; }
        if (!v || typeof v !== 'object') continue;
        const o = v as Record<string, unknown>;
        for (const k of ['id', '_id', 'uuid', 'ID', 'Id']) {
            const id = o[k];
            if ((typeof id === 'string' || typeof id === 'number') && String(id).length <= 80 && String(id) !== '') return String(id);
        }
        if (depth < 4) for (const x of Object.values(o)) if (x && typeof x === 'object') queue.push({ v: x, depth: depth + 1 });
    }
    return '';
}
/** Whether a write sent this id itself (`{"id": 1, …}`, GraphQL variables, `id=1`): it named a record that was there. */
function writeNamesId(body: string, id: string): boolean {
    if (!id) return false;
    const idKey = /^(?:id|_id|uuid|\w*[_-]?id)$/i;
    let found = false;
    const walk = (v: unknown, key: string, depth: number) => {
        if (found || depth > 5) return;
        if ((typeof v === 'string' || typeof v === 'number') && idKey.test(key) && String(v) === id) { found = true; return; }
        if (v && typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, Array.isArray(v) ? key : k, depth + 1);
    };
    try { walk(JSON.parse(String(body)), '', 0); } catch {
        try { for (const [k, v] of new URLSearchParams(String(body))) if (idKey.test(k) && v === id) found = true; } catch { /* not a form body */ }
    }
    return found;
}
/** Whether one write made a new record (true) or changed one that was there (false). */
export function writeMadeRecord(
    w: { at: string; body: string; method: string; answer?: string },
    facts: { openedFilled: boolean; rowsGrew: boolean; seenIds: Set<string> | string[] },
): boolean {
    if (String(w?.method || '').toUpperCase() !== 'POST') return false;
    const seen = facts.seenIds instanceof Set ? facts.seenIds : new Set((facts.seenIds || []).map(String));
    const urlId = recordIdOfUrl(w.at);
    const id = answeredRecordId(String(w.answer || ''));
    const newId = !!id && id !== urlId && !seen.has(id) && !writeNamesId(String(w.body || ''), id);
    if (urlId) return newId;
    if (!facts.openedFilled) return true;
    return facts.rowsGrew || newId;
}
/** Whether a form's writes edited a record that was there (never deleted) — and why, as told. */
export function formEditedRecord(
    list: Array<{ at: string; body: string; method: string; answer?: string }>,
    mark: string,
    facts: { openedFilled: boolean; rowsGrew: boolean; seenIds: Set<string> | string[] },
): { edited: boolean; why: string } {
    const changed = (w: { method: string }) => /^(?:PUT|PATCH)$/i.test(String(w.method || ''));
    if (list.some(w => changed(w) && !!mark && String(w.body || '').includes(mark))) return { edited: true, why: 'its writes changed a record with the values the QA typed (PUT/PATCH)' };
    const posts = list.filter(w => String(w.method || '').toUpperCase() === 'POST');
    if (posts.some(w => writeMadeRecord(w, facts))) return { edited: false, why: '' };
    if (posts.length) return { edited: true, why: facts.openedFilled ? 'the form opened holding a record, and its POST made none' : 'its POST went to a record that was there' };
    if (facts.openedFilled) return { edited: true, why: 'the form opened holding a record' };
    return list.some(changed) ? { edited: true, why: 'its writes only changed a record (PUT/PATCH)' } : { edited: false, why: '' };
}

/** Runs in the page: the ids the page shows of its records before a form is sent — a POST that answers one of them changed it (writeMadeRecord). Self-contained. */
export function shownRecordIds(): string[] {
    const out = new Set<string>();
    const nodes = Array.from(document.querySelectorAll('*')).slice(0, 20_000);
    for (const n of nodes) {
        for (const a of Array.from(n.attributes)) {
            if (/^data-(?:[\w-]*-)?(?:id|key|uuid)$/i.test(a.name) && a.value && a.value.length <= 80) out.add(a.value.trim());
        }
        if (n.tagName === 'A') {
            try {
                const u = new URL(String((n as HTMLAnchorElement).href || ''));
                const last = u.pathname.split('/').filter(Boolean).pop() || '';
                if (last && last.length <= 80) out.add(decodeURIComponent(last));
                u.searchParams.forEach(v => { if (v && v.length <= 80) out.add(v); });
            } catch { /* not an address */ }
        }
        if (n.tagName === 'INPUT' && String((n as HTMLInputElement).type).toLowerCase() === 'hidden') {
            const v = String((n as HTMLInputElement).value || '').trim();
            if (v && v.length <= 80) out.add(v);
        }
        if (out.size > 5000) break;
    }
    return Array.from(out);
}

/** Runs in the page: whether the page keeps any IndexedDB database. Self-contained. */
export async function browserHasIndexedDb(): Promise<boolean> {
    try {
        const dbs = typeof (indexedDB as any)?.databases === 'function' ? await (indexedDB as any).databases() : [];
        return dbs.length > 0;
    } catch { return false; }
}

/** Runs in the page: whether the browser's storage holds one of these marks — a form's own draft («draft», «autosave») aside. Self-contained. */
export function storageHolds(list: string[]): boolean {
    for (const store of [window.localStorage, window.sessionStorage]) {
        try {
            for (let i = 0; i < store.length; i++) {
                const key = String(store.key(i) || '');
                if (/draft|autosave|auto-save|unsaved|form-?state/i.test(key)) continue;
                const value = String(store.getItem(key) || '');
                if ((list || []).some(n => !!n && value.includes(n))) return true;
            }
        } catch { /* a storage the page may not read */ }
    }
    return false;
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
    /*
     * A row is read without the passing messages inside it. The exam, 2026-11-12 (P280, a booking
     * page): its <section class="card"> held the form's <p role="status">, and the confirmation
     * «تم حجز موعدك … يا اختبار جو mwdtsde1-cm098.» gave «mwdtsde1-cm098.» — the name with the
     * sentence's full stop — as the record's own mark; kept without it, it was «found nowhere».
     */
    const textOf = (el: HTMLElement): string => {
        if (!el.querySelector(noise)) return String(el.innerText || '');
        //  What is shown of it, outside its messages and forms: text that is drawn, never a hidden panel's.
        const parts: string[] = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
            const host = n.parentElement;
            if (!host || host.closest(noise) || !host.getClientRects().length) continue;
            parts.push(String(n.textContent || ''));
        }
        return parts.join(' ');
    };
    for (const el of rows) {
        if (el.closest(noise)) continue;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        for (const raw of textOf(el as HTMLElement).split(/[\s،؛,;:()[\]{}«»"'|—–]+/)) {
            //  …and a word without its own full stop, question mark or ellipsis: «#1042.» is «#1042».
            const t = raw.replace(/^[.!?؟…]+|[.!?؟…]+$/gu, '');
            if (t.length < 4 || known.has(t) || out.includes(t)) continue;
            if (!/[0-9٠-٩]/.test(t) || /^[-+]?[0-9٠-٩.,٫٬]+%?$/.test(t)) continue;
            out.push(t);
        }
    }
    const lettered = (t: string) => /[A-Za-z\u0600-\u06FF]/.test(t) ? 1 : 0;
    return out.sort((a, b) => lettered(b) - lettered(a)).slice(0, 12);
}

/**
 * Runs in the page: the delete button of a record that holds the QA's own mark, stamped — or ''.
 * Self-contained.
 *
 * The second review, 2026-11-11: «exactly one record holds the mark» counted the containers the
 * delete buttons sat in, then clicked the first button. In a card grid (.row > .col > .card), every
 * «Delete» resolved to the one .row, the count was 1, and the first card — a visitor's — was the one
 * pressed. Now each delete is tied to the smallest part of the page that holds the mark above it,
 * and that part must hold no other delete: the record's own button, never a neighbour's. With
 * `onlyOne`, two such records (two of the QA's, or a lookalike) are never guessed between.
 */
export function stampOwnDelete(arg: { needle: string; stamp: string; onlyOne: boolean }): string {
    const { needle, stamp, onlyOne } = arg;
    document.querySelectorAll(`[${stamp}]`).forEach(el => el.removeAttribute(stamp));
    if (!needle) return '';
    const isDelete = (el: Element) => /delete|remove|حذف|إزالة/i.test([el.getAttribute('aria-label'), el.getAttribute('title'), (el as HTMLElement).innerText].filter(Boolean).join(' '));
    const deletes = (Array.from(document.querySelectorAll('button,[role="button"],a')) as HTMLElement[]).filter(isDelete);
    const own = deletes.filter(button => {
        let holder: HTMLElement | null = button.parentElement;
        while (holder && holder !== document.body && !String(holder.innerText || '').includes(needle)) holder = holder.parentElement;
        if (!holder || holder === document.body) return false;
        const inside = holder;
        return deletes.filter(d => inside.contains(d)).length === 1;
    });
    if (!own.length || (onlyOne && own.length !== 1)) return '';
    own[0].setAttribute(stamp, '1');
    return `[${stamp}="1"]`;
}

/**
 * Runs in the page: watches the page's message areas for what a submit writes into them — the same
 * words written again included. Self-contained; readFormAnswer() reads and stops it.
 *
 * The eleventh live check, 2026-11-11 (L171, a dental clinic's booking): «احجز الموعد» answered
 * «اختر التاريخ أولاً.» in its role="status" line — the date and the slot are picked outside the
 * form — and the QA's earlier cases had drawn the very same words. Compared before and after, the
 * page had not changed: «filled in completely and submitted, and nothing happened at all». A
 * person sees the message come again; the walk now sees it written.
 */
export function watchFormAnswer(): boolean {
    const w = window as any;
    try { w.__joeQaAnswerObs?.disconnect(); } catch { /* none yet */ }
    w.__joeQaAnswer = [];
    w.__joeQaAmbient = [];
    const MSG = '[role="alert"],[role="status"],[aria-live],.error,.err,.msg,.message,.notice,.feedback,.toast,.alert,[data-error],[data-status]';
    const obs = new MutationObserver(records => {
        for (const r of records) {
            const node = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
            const msg = node && node.closest(MSG);
            //  A line learnt to change by itself (learnAmbient: a clock in a status line) answers no submit.
            if (!msg || msg.closest('[data-joe-ambient]') || node!.closest('[data-joe-ambient]') || w.__joeQaAnswer.length >= 100) continue;
            w.__joeQaAnswer.push({ el: msg, text: String((msg as HTMLElement).innerText || '').trim().slice(0, 300) });
        }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    w.__joeQaAnswerObs = obs;
    return true;
}

/**
 * Runs in the page: what changed on its own while nothing was pressed (a clock, a sync line, a live
 * counter) is set aside — the third review, 2026-11-11: such a line would answer every submit. Self-contained.
 */
export function markAnswerAmbient(): number {
    const w = window as any;
    const seen: Array<{ el: Element }> = Array.isArray(w.__joeQaAnswer) ? w.__joeQaAnswer : [];
    w.__joeQaAmbient = seen.map(x => x.el);
    w.__joeQaAnswer = [];
    return w.__joeQaAmbient.length;
}

/** Runs in the page: what the message areas were written with since watchFormAnswer (the ambient set aside), and stops watching. Self-contained. */
export function readFormAnswer(): string[] {
    const w = window as any;
    try { w.__joeQaAnswerObs?.disconnect(); } catch { /* not watching */ }
    const ambient: Element[] = Array.isArray(w.__joeQaAmbient) ? w.__joeQaAmbient : [];
    const seen: Array<{ el: Element; text: string }> = Array.isArray(w.__joeQaAnswer) ? w.__joeQaAnswer : [];
    const out = seen.filter(x => !ambient.includes(x.el)).map(x => x.text).slice(0, 50);
    w.__joeQaAnswer = [];
    w.__joeQaAmbient = [];
    return out;
}

/**
 * Runs in the page: what a booking page asks first, outside its form — a date, a time, a choice
 * left empty — stamped for the walk to fill (choosePrerequisites). Self-contained.
 */
export function stampPrerequisites(formSel: string): Array<{ sel: string; kind: 'date' | 'time' | 'datetime' | 'select' }> {
    document.querySelectorAll('[data-joe-pre]').forEach(el => el.removeAttribute('data-joe-pre'));
    const form = document.querySelector(formSel);
    const shown = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el as HTMLElement); return r.width > 2 && r.height > 2 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const out: Array<{ sel: string; kind: 'date' | 'time' | 'datetime' | 'select' }> = [];
    document.querySelectorAll('input[type="date"],input[type="time"],input[type="datetime-local"],select').forEach((el, i) => {
        if ((form && form.contains(el)) || !shown(el) || (el as HTMLInputElement).disabled) return;
        if ((el as HTMLInputElement).value) return;
        //  Never another form's field, nor a list's filter: choosing one would narrow the list the persistence check counts (the fifth review).
        const owner = el.closest('form');
        if (owner && owner !== form) return;
        const named = [el.getAttribute('name'), el.id, el.getAttribute('aria-label'), el.getAttribute('data-filter') !== null ? 'filter' : '', (el as HTMLInputElement).labels?.[0]?.textContent].join(' ');
        if (/search|filter|sort|order\s*by|بحث|فلتر|تصفية|ترتيب|فرز/iu.test(named)) return;
        const type = String((el as HTMLInputElement).type || '').toLowerCase();
        const kind = el.tagName === 'SELECT' ? 'select' : type === 'date' ? 'date' : type === 'time' ? 'time' : 'datetime';
        el.setAttribute('data-joe-pre', String(i));
        out.push({ sel: `[data-joe-pre="${i}"]`, kind });
    });
    return out.slice(0, 4);
}

/** Runs in the page: the first choice a booking page offers outside its form (a time slot, an option), stamped. Self-contained. */
export function stampFirstChoice(formSel: string): string {
    document.querySelectorAll('[data-joe-choice]').forEach(el => el.removeAttribute('data-joe-choice'));
    const form = document.querySelector(formSel);
    const shown = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); return r.width > 2 && r.height > 2; };
    const choice = (Array.from(document.querySelectorAll('button,[role="option"],[role="radio"],[data-slot],[data-time]')) as HTMLElement[]).find(el => {
        if ((form && form.contains(el)) || !shown(el) || (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true') return false;
        const marks = [el.className, el.getAttribute('role'), el.getAttribute('data-slot') !== null ? 'slot' : '', el.getAttribute('data-time') !== null ? 'time' : ''].join(' ');
        return /slot|time|hour|option|choice|موعد|وقت/iu.test(marks) || /^\s*[0-9٠-٩]{1,2}[:٫.][0-9٠-٩]{2}/u.test(el.innerText || '');
    });
    if (!choice) return '';
    choice.setAttribute('data-joe-choice', '1');
    return '[data-joe-choice="1"]';
}

/**
 * Runs in the page: each group of radios in the form with none chosen gets its first enabled,
 * shown one chosen — clicked, so the page hears it as a person's choice. Returns how many groups.
 * Self-contained.
 */
export function chooseUnchosenRadios(formSel: string): number {
    const form = document.querySelector(formSel);
    if (!form) return 0;
    const shown = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const s = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const groups = new Map<string, HTMLInputElement[]>();
    (Array.from(form.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]).forEach(r => {
        const key = r.name || (r.id ? `#${r.id}` : '');
        if (!key) return;
        const list = groups.get(key) || [];
        list.push(r);
        groups.set(key, list);
    });
    let n = 0;
    for (const list of Array.from(groups.values())) {
        if (list.some(r => r.checked)) continue;
        //  A radio a styled label hides is still chosen through its label, as a person clicks it.
        const label = (r: HTMLInputElement) => (r.labels && r.labels[0]) as HTMLElement | undefined;
        const pick = list.find(r => !r.disabled && (shown(r) || (label(r) && shown(label(r)!))));
        if (!pick) continue;
        if (shown(pick)) pick.click(); else label(pick)!.click();
        if (pick.checked) n++;
    }
    return n;
}

/** Runs in the page: how many records the page shows — the innermost rows, items and cards, outside forms, menus and notices. Self-contained. */
export function recordRowCount(): number {
    const ROW = 'li,tr,article,[role="listitem"],[role="row"],.card,.item,.entry,.record,[data-item],[data-id],[data-row]';
    const noise = '[role="status"],[role="alert"],[aria-live],.toast,.flash,.snackbar,.notice,form,nav,header,footer,thead,script,style,template';
    let n = 0;
    document.querySelectorAll(ROW).forEach(el => {
        //  A panel holding a form is the form, not a record: its closing must not cancel the row it added.
        if (el.closest(noise) || el.querySelector(ROW) || el.querySelector('form')) return;
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 1 && r.height > 1) n++;
    });
    return n;
}

/**
 * Runs in the page: the ids the page's controls and fields carry more than once. Self-contained.
 *
 * The ninth live check, 2026-11-11 (L160, a car rental dashboard, one document): each screen drew
 * its own «+ Add …» with id="addBtn" into its own section, and wired it with getElementById —
 * which finds the FIRST, the hidden Cars screen's. Opened at its address, Customers worked; after
 * Cars, its «+ Add customer» did nothing. The walk was right to call it dead, and the builder,
 * told only «unresponsive», changed the form's validation twice.
 */
export function duplicateControlIds(): Array<{ id: string; count: number; labels: string[] }> {
    const seen = new Map<string, { count: number; labels: string[] }>();
    document.querySelectorAll('button[id],a[id],input[id],select[id],textarea[id],form[id],[role="button"][id]').forEach(el => {
        const id = el.getAttribute('id') || '';
        if (!id) return;
        const s = seen.get(id) || { count: 0, labels: [] };
        s.count++;
        //  Named as findControls names a control, so the hint is given only beside a dead control that carries the id.
        const name = el.getAttribute('aria-label') || el.getAttribute('title') || String((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' ').slice(0, 48);
        if (name && !s.labels.includes(name)) s.labels.push(name);
        seen.set(id, s);
    });
    return Array.from(seen.entries()).filter(([, s]) => s.count > 1).map(([id, s]) => ({ id, count: s.count, labels: s.labels.slice(0, 8) })).slice(0, 6);
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
/**
 * ⛔ WHAT CHANGES ON ITS OWN IS NO PRESS'S ANSWER.
 *
 * The third review, 2026-11-11: a clock in a status line («الوقت الآن 10:32:15»), a countdown, a
 * «synced 3 s ago» changes the page every second with nothing pressed — and every dead button and
 * every dead form beside it looked alive: the fingerprint after the press differed from the one
 * before. Watched once per view while nothing is pressed (watchAmbient → stampAmbient), what
 * changed by itself is stamped and left out of every fingerprint. Small leaves only: never a
 * container holding a control, never a long text — a list a press refreshes is still that press's
 * answer. Runs in the page; self-contained.
 */
export function watchAmbient(): boolean {
    const w = window as any;
    try { w.__joeQaAmbientObs?.disconnect(); } catch { /* none yet */ }
    const seen = new Set<Element>();
    w.__joeQaAmbientSeen = seen;
    const obs = new MutationObserver(records => {
        for (const r of records) {
            const el = (r.target.nodeType === 1 ? r.target : r.target.parentElement) as Element | null;
            if (el && seen.size < 200) seen.add(el);
        }
    });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    w.__joeQaAmbientObs = obs;
    return true;
}

/**
 * Runs in the page: stamps what watchAmbient saw change by itself (data-joe-ambient), stops
 * watching, and returns where each stamped leaf sits (a path from the body), so a reload can
 * stamp them again (restampAmbient). Self-contained.
 */
export function stampAmbient(): Array<{ path: string; tag: string }> {
    const w = window as any;
    try { w.__joeQaAmbientObs?.disconnect(); } catch { /* not watching */ }
    const seen: Element[] = Array.from(w.__joeQaAmbientSeen || []);
    w.__joeQaAmbientSeen = null;
    const pathOf = (el: Element): string => {
        const parts: string[] = [];
        for (let n: Element | null = el; n && n !== document.body && n.parentElement; n = n.parentElement) {
            parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${Array.prototype.indexOf.call(n.parentElement.children, n) + 1})`);
        }
        return ['body', ...parts].join(' > ');
    };
    const out: Array<{ path: string; tag: string }> = [];
    for (const el of seen) {
        if (!(el instanceof HTMLElement) || !el.isConnected || el === document.body || el === document.documentElement) continue;
        if (el.querySelector('button,a[href],input,select,textarea,form,[role="button"],[role="link"],[contenteditable="true"]')) continue;
        if (el.closest('button,a[href],[role="button"],[role="link"]')) continue;
        if (String(el.textContent || '').length > 160) continue;
        el.setAttribute('data-joe-ambient', '1');
        if (out.length < 40) out.push({ path: pathOf(el), tag: el.tagName });
    }
    return out;
}

/** Runs in the page: stamps again, where they are, the leaves learnt to change by themselves (stampAmbient's paths). Self-contained. */
export function restampAmbient(leaves: Array<{ path: string; tag: string }>): number {
    let n = 0;
    for (const leaf of leaves || []) {
        let el: Element | null = null;
        try { el = document.querySelector(leaf.path); } catch { el = null; }
        //  Still the leaf that was learnt: the same element, as small, outside every control, and
        //  holding what ticks (a digit) — a total or a status line moved into its place is not stamped.
        if (!(el instanceof HTMLElement) || el.tagName !== leaf.tag) continue;
        if (el.querySelector('button,a[href],input,select,textarea,form,[role="button"],[role="link"],[contenteditable="true"]')) continue;
        if (el.closest('button,a[href],[role="button"],[role="link"]')) continue;
        const text = String(el.textContent || '');
        if (text.length > 160 || !/[0-9٠-٩]/u.test(text)) continue;
        el.setAttribute('data-joe-ambient', '1');
        n++;
    }
    (window as any).__joeQaAmbientAt = location.href;
    return n;
}

/**
 * What changes by itself on this view, learnt while nothing is pressed (watchAmbient, stampAmbient)
 * — once per document and address, a second at most, and only on a view that shows what ticks: a
 * time («10:32», «2026-11-11T10:32»), a countdown, a «3 s ago». A view showing none of it is not
 * waited on (a walk of many screens would pay a second for each).
 */
export async function learnAmbient(page: any, watchMs = 1100): Promise<number> {
    /*
     * A view learnt once is not learnt again: a reload, a baseline restored, the persistence check
     * wipe every stamp, and the fourth review (2026-11-11) found the clock back in every fingerprint
     * after the first restore. What was learnt here is stamped again where it is, at once.
     */
    /*
     * …per audit (app-audit drops what a page learnt when a new audit begins) and per viewport: a
     * phone's layout puts other leaves at the desktop's paths (the fifth review, 2026-11-11).
     */
    const learnt: Map<string, Array<{ path: string; tag: string }>> = page.__joeQaAmbientLearnt || (page.__joeQaAmbientLearnt = new Map());
    const size = (() => { try { const v = page.viewportSize?.(); return v ? `${v.width}x${v.height}` : ''; } catch { return ''; } })();
    const here = `${String(page.url() || '')}|${size}`;
    const leaves = learnt.get(here);
    //  Watched once, never again: a view whose times stood still (a booking's «10:30» slots) costs one second, not one per restore.
    if (leaves) return leaves.length ? page.evaluate(restampAmbient, leaves).catch(() => 0) : 0;
    const state: string = await page.evaluate(() => {
        const w = window as any;
        if (w.__joeQaAmbientAt === location.href) return 'known';
        const text = String((document.body && document.body.innerText) || '').slice(0, 30000);
        const ticks = /[0-9٠-٩]{1,2}[:٫][0-9٠-٩]{2}|\b(?:ago|seconds?|secs?|countdown|remaining|refreshed|synced)\b|منذ|ثانية|ثوانٍ|ثوان|متبقي|المتبقي|العد التنازلي|آخر تحديث/iu.test(text);
        //  …or a place made for one, still empty until its first tick (`setInterval(draw, 1000)` draws nothing for a second).
        const holder = !!document.querySelector('[role="timer"],[role="marquee"],[class*="clock" i],[id*="clock" i],[class*="timer" i],[id*="timer" i],[class*="countdown" i],[id*="countdown" i],[class*="ticker" i]');
        if (!ticks && !holder) w.__joeQaAmbientAt = location.href;
        return ticks || holder ? 'watch' : 'still';
    }).catch(() => 'known');
    //  A view that showed nothing ticking is asked again next time (cheaply, no wait): a time drawn later is learnt then.
    if (state !== 'watch') return 0;
    await page.evaluate(watchAmbient).catch(() => false);
    await page.waitForTimeout(watchMs).catch(() => { });
    const stamped: Array<{ path: string; tag: string }> = await page.evaluate(stampAmbient).catch(() => [] as Array<{ path: string; tag: string }>);
    learnt.set(here, stamped);
    await page.evaluate(() => { (window as any).__joeQaAmbientAt = location.href; }).catch(() => { });
    return stamped.length;
}

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
    /*
     * What changes on its own (stampAmbient) is left out: its text, its markup. Read without it
     * the same way before and after every press, so a clock is no press's answer.
     */
    const ambient = Array.from(document.querySelectorAll('[data-joe-ambient]')) as HTMLElement[];
    let text = document.body.innerText || '';
    let bodyHtml = document.body.innerHTML || '';
    if (ambient.length) {
        const parts: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (n: Node) => {
                const p = n.parentElement;
                if (!p || p.closest('[data-joe-ambient],script,style,noscript,template')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        for (let n = walker.nextNode(); n && parts.length < 20000; n = walker.nextNode()) {
            const s = String(n.nodeValue || '').trim();
            if (s) parts.push(s);
        }
        text = parts.join('\n');
        for (const el of ambient) {
            const outer = el.outerHTML;
            if (outer) bodyHtml = bodyHtml.split(outer).join('');
        }
    }
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
    const html = bodyHtml.slice(0, 200000)
        .replace(/caret-color:\s*transparent\s*!important;?\s*/gi, '')
        // These handles belong to Joe's instrument, not the application.
        .replace(/\sdata-joe-(?:ctl|form|fld|sub|qbox|qa-[\w-]+)="[^"]*"/gi, '')
        //  …and so do the mark of what changes by itself (stampAmbient) and of what a booking asked first (stampPrerequisites, stampFirstChoice).
        .replace(/\sdata-joe-(?:ambient|pre|choice)="[^"]*"/gi, '')
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
    /*
     * …but a success that asks him to keep something is no refusal. The second review of 2026-11-15
     * (the older rule of finding 5): «تم استلام طلبك بنجاح، يرجى الاحتفاظ برقم الطلب» — «please keep your
     * order number» — was read as the form saying no, and the order was never looked for. A polite word
     * («يرجى», «الرجاء», «من فضلك»), «must», «مطلوب» or «يجب أن» in a message that says it succeeded refuses
     * only when it asks him to enter, choose, fill or correct something; a field's own error words
     * («is required», «invalid», «غير صالح») always do.
     */
    const succeeded = /(?:^|[\s.،!؛:])تمّ?ت?(?=\s)|بنجاح|شكر[اًا]|شكرًا|\bthanks?\b|\bthank you\b|\bsuccess(?:ful(?:ly)?)?\b|\bsaved\b|\bdone\b|\bconfirmed\b|\bbooked\b|\bplaced\b/iu.test(said);
    if (/\b(?:is|are) required\b|\brequired field|\bplease (?:enter|select|choose|fill|provide|correct|add|pick)\b|\binvalid\b|\bnot (?:a )?valid\b|\b(?:cannot|can't|can not) be (?:empty|blank|in the past|before|after)\b|\btoo (?:short|long|many|few)\b|\b(?:select|choose|pick) an? \w+ first\b|إلزامي|الزامي|غير صالح|غير صحيح|لا يمكن أن يكون|قصير جد|طويل جد|اختر .{0,20}أولاً|(?:يرجى|الرجاء|من فضلك)\s+(?:إدخال|ادخال|أدخل|ادخل|اختيار|اختر|كتابة|اكتب|ملء|املأ|تعبئة|عبّ?ئ|تحديد|حدد|حدّد|تصحيح|صحح|صحّح|التحقق|تحقق|إكمال|اكمال|أكمل|اكمل|إعادة|اعادة)|(?:حقل|الحقل)\s+\S+\s+مطلوب/iu.test(said)) return true;
    if (!succeeded && /\bmust (?:be|contain|have|include|match|look|start|end|use)\b|مطلوب|يجب أن|يجب ان|يرجى|الرجاء|من فضلك/iu.test(said)) return true;
    /*
     * …and a line that tells him to choose: «اختر موعدًا من القائمة». The exam, 2026-11-13 (P290): the
     * booking's slots sit outside its form, none was chosen, the page said so, and the QA read it as
     * «submitted» — then found its own name in the form's still-filled field and looked for a booking
     * never made. «أولًا» is spelled with its tanween on either letter, or with none.
     */
    /*
     * Both read only a line that starts by telling him to choose, in a message that says nothing of a
     * success. The review of 2026-11-15: «تم الطلب بنجاح. يمكنك اختيار منتجات أخرى من القائمة» and
     * «شكراً لك\nاختر خدمة أخرى إن أردت» were read as refusals, and an order the store then lost was
     * never looked for.
     */
    if (!succeeded && /(?:^|\n)\s*(?:(?:يرجى|الرجاء|من فضلك)\s+)?(?:اختر|اختاري|اختيار|حدد|حدّد)\s.{0,30}(?:أولاً|أولًا|أولا|اولاً|اولًا|اولا|من القائمة|من الجدول|من المواعيد|من الأوقات)/u.test(said)) return true;
    if (!succeeded && /(?:^|\n)\s*(?:(?:يرجى|الرجاء|من فضلك)\s+)?(?:اختر|اختاري|حدد|حدّد)\s|(?:^|\n)\s*(?:please\s+)?(?:select|choose|pick)\s+(?:a|an|the|your|one)\b/iu.test(said)) return true;
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
    //  The same rule findForms writes out in the page: a form that sends a message makes no record to find.
    if (/\b(?:add|create|save|register|book|reserve|new record)\b|أضف|اضف|إضافة|اضافة|إنشاء|انشاء|حفظ|احفظ|تسجيل|حجز|احجز/i.test(text)) return true;
    const sendsMessage = /\b(?:send|contact|message|inquiry|enquiry|get in touch|subscribe|newsletter|request a (?:quote|call|callback))\b|أرسل|ارسل|إرسال|ارسال|تواصل|اتصل|راسل|رسالة|استفسار|اشترك|اشتراك|النشرة/i;
    return !sendsMessage.test(text) && /\border\b|طلب/i.test(text);
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
            //  A status line that changes by itself (a clock: stampAmbient) answers no submit.
            .filter(el => visible(el) && !el.closest('[data-joe-ambient]'))
            //  …nor does the clock inside one («Last sync <time>10:32:15</time>»): read without it (the fifth review).
            .map(el => {
                if (!el.querySelector('[data-joe-ambient]')) return (el as HTMLElement).innerText.trim();
                const copy = el.cloneNode(true) as HTMLElement;
                copy.querySelectorAll('[data-joe-ambient]').forEach(x => x.remove());
                return String(copy.textContent || '').replace(/\s+/g, ' ').trim();
            })
            .filter(Boolean)
            .join('\n')
            .slice(0, 1200);
    }, selector).catch(() => '');
}

/**
 * What the form shows NOW that says it refused: its fields marked aria-invalid, and the error text
 * drawn in it or beside it — whenever it was drawn. The exam, 2026-11-13 (P230, P236, P238, P246,
 * P250): five checkouts validated their card number live, the error was on screen before «Place
 * order» was pressed, so nothing NEW answered the submit, and a form that told its visitor exactly
 * what was wrong was «filled in completely and submitted, and nothing happened at all». Read in the
 * page; judged in Node (isVisibleFormRefusal).
 */
export async function refusalOnScreen(page: any, selector: string): Promise<{ invalid: string[]; said: string[]; tied: string[] }> {
    //  Never thrown: a page that navigates or closes while it is read says no refusal, and the walk's forms are kept (C7, the second review).
    try { return await refusalRead(page, selector); } catch { return { invalid: [], said: [], tied: [] }; }
}

function refusalRead(page: any, selector: string): Promise<{ invalid: string[]; said: string[]; tied: string[] }> {
    return page.evaluate((sel: string) => {
        const form = document.querySelector(sel) as HTMLElement | null;
        //  The form gone (a thank-you view in its place) says no refusal.
        if (!form) return { invalid: [], said: [], tied: [] };
        const shown = (el: Element) => {
            const r = (el as HTMLElement).getBoundingClientRect();
            const s = getComputedStyle(el as HTMLElement);
            return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none';
        };
        const invalidFields = Array.from(form.querySelectorAll('[aria-invalid="true"]')).filter(shown);
        const invalid = invalidFields
            .map(el => String(el.getAttribute('name') || el.id || el.getAttribute('aria-label') || el.tagName).slice(0, 60)).slice(0, 6);
        //  The words an invalid field points at (aria-errormessage, aria-describedby) are its refusal, whatever they say.
        const tied = invalidFields.flatMap(el => `${el.getAttribute('aria-errormessage') || ''} ${el.getAttribute('aria-describedby') || ''}`.split(/\s+/).filter(Boolean))
            .map(id => document.getElementById(id)).filter((el): el is HTMLElement => !!el && shown(el))
            .map(el => String(el.innerText || '').trim().replace(/\s+/g, ' ')).filter(t => t.length > 1 && t.length <= 240).slice(0, 4);
        const scope = form.closest('[role="dialog"],section,article') || form.parentElement || form;
        const errorish = '[role="alert"],[aria-live],[role="status"],.error,.err,.errors,.invalid-feedback,.field-error,.error-message,.form-error,.help-block,.text-danger,[data-error],[id$="-error"],[id$="Error"],[class*="error"],[class*="Error"],[class*="invalid"]';
        const said = Array.from(new Set([...Array.from(form.querySelectorAll(errorish)), ...Array.from(scope.querySelectorAll('[role="alert"],[aria-live],.error,.form-error,.error-message'))]))
            .filter(el => shown(el) && !el.closest('[data-joe-ambient]') && !el.querySelector('input,select,textarea,button'))
            .map(el => String((el as HTMLElement).innerText || '').trim().replace(/\s+/g, ' '))
            .filter(t => t.length > 1 && t.length <= 240).slice(0, 8);
        return { invalid, said, tied };
    }, selector).catch(() => ({ invalid: [], said: [], tied: [] }));
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

/**
 * Whether the QA itself asked this address, and lately: a Map of address → until when (probeForms asks
 * from inside the page only when it cannot ask beside it), or a set of addresses with no time.
 */
function askedByQa(page: any, url: string): boolean {
    try {
        const asked = page?.__joeQaAskedUrls;
        const key = String(url).replace(/\/+$/, '');
        if (asked instanceof Map) return Number(asked.get(key) || 0) >= Date.now();
        return !!asked?.has?.(key);
    } catch { return false; }
}

/** A refusal inside a window the QA opened: 400, 409 or 422, while the QA was sending what should be refused. */
export function isExpectedRefusal(page: any, status: number, url = '', method = ''): boolean {
    /*
     * An address the QA itself asked when it looked for a record (probeForms: the record a POST's answer
     * named, a parent, a redirect's target) is the QA's question, never the product's broken request:
     * the replay of P189 (2026-11-15) — GET /api/users/<id> answered 404, a route the app never calls.
     */
    if ((status === 404 || status === 405) && url && /^(?:|GET)$/i.test(method) && askedByQa(page, url)) return true;
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
export function watchWrites(page: any): {
    saved: () => number; refused: () => number; written: () => string[]; pending: () => number; stop: () => void;
    /**
     * Writes taken anywhere — a redirect after a post, and another origin's 2xx (a hosted database)
     * that carried one of `marks` — where a record may be kept. The review of 2026-11-15: an analytics
     * or error beacon fired on submit (GA collect, Plausible, Sentry) is not where a record is kept.
     */
    kept: (marks?: string[]) => number;
    /** The page's own credentials, as its last same-origin request carried them: the QA asks its server as the page does. */
    auth: () => Record<string, string>;
    /**
     * Each write its origin took (2xx, or a redirect after it), with what was sent and what was
     * answered: where a record was written, under which field names, how (POST makes, PUT and PATCH
     * change), and where a redirect sent the page (keptAtServer).
     */
    posted: () => Array<{ at: string; body: string; method: string; status: number; answer: string; location: string }>;
    /** Each write another origin took (a hosted database: Supabase, Firebase), with how and what it answered (editedRecord). */
    away: () => Array<{ at: string; body: string; method: string; status: number; answer: string; location: string }>;
} {
    let saved = 0;
    let refused = 0;
    let redirected = 0;
    /** Another origin's writes it took, with what they carried: kept only when they carried the QA's values. */
    const elsewhere: Array<{ at: string; body: string; method: string; status: number; answer: string; location: string }> = [];
    const posts: Array<{ at: string; body: string; method: string; status: number; answer: string; location: string }> = [];
    const bodyOf = (response: any): string => { try { return String(response.request().postData() || '').slice(0, 20_000); } catch { return ''; } };
    let auth: Record<string, string> = {};
    /** Writes sent and not answered yet: what the page drew meanwhile is not their answer. */
    let pending = 0;
    /** Where the product took a write (POST, PUT, PATCH), in order: where what a form made is asked for again. */
    const written: string[] = [];
    let origin = '';
    try { origin = new URL(String(page.url())).origin; } catch { origin = ''; }
    const on = (response: any) => {
        try {
            const method = String(response?.request?.()?.method?.() || '').toUpperCase();
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
            const at = String(response.url());
            const status = Number(response.status());
            if (origin && new URL(at).origin !== origin) {
                if (status >= 200 && status < 300 && method !== 'DELETE') {
                    const body = bodyOf(response);
                    let decoded = body;
                    try { decoded = decodeURIComponent(body.replace(/\+/g, ' ')); } catch { /* kept as sent */ }
                    const entry = { at, body: `${body}\n${decoded}`.slice(0, 40_000), method, status, answer: '', location: '' };
                    elsewhere.push(entry);
                    try { Promise.resolve(response.text()).then((t: any) => { entry.answer = String(t || '').slice(0, 20_000); }).catch(() => { }); } catch { /* no body */ }
                }
                return;
            }
            //  A post answered by a redirect (post, then show) was taken: counted as kept, never as a save a wrong value got.
            //  …and where it sent the page is asked for the record too (the review of 2026-11-15).
            if (status >= 300 && status < 400 && method !== 'DELETE') {
                redirected++;
                let location = '';
                try { location = new URL(String(response.headers()?.location || ''), at).href; } catch { location = ''; }
                posts.push({ at, body: bodyOf(response), method, status, answer: '', location });
                return;
            }
            if (status >= 200 && status < 300) {
                if (method !== 'DELETE') {
                    saved++; written.push(at);
                    const entry = { at, body: bodyOf(response), method, status, answer: '', location: '' };
                    posts.push(entry);
                    //  What it answered (an id, a state such as «pending»): read as it arrives.
                    try { Promise.resolve(response.text()).then((t: any) => { entry.answer = String(t || '').slice(0, 20_000); }).catch(() => { }); } catch { /* no body */ }
                }
                return;
            }
            if (status >= 400 && status < 500) {
                refused++;
                if (!page.__joeQaRefusedUrls) page.__joeQaRefusedUrls = new Set<string>();
                page.__joeQaRefusedUrls.add(at);
            }
        } catch { /* a response that cannot be read wrote nothing we know of */ }
    };
    const isWrite = (request: any) => {
        try {
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(request?.method?.() || '').toUpperCase())) return false;
            return !origin || new URL(String(request.url())).origin === origin;
        } catch { return false; }
    };
    const sent = (request: any) => {
        //  Its credentials, from any request of its own origin: a Bearer token kept in localStorage is in no cookie.
        try {
            if (origin && new URL(String(request.url())).origin === origin) {
                const headers = request.headers?.() || {};
                const own: Record<string, string> = {};
                for (const [k, v] of Object.entries(headers)) if (/^(?:authorization|x-[\w-]*(?:token|auth|session|api-key|csrf)[\w-]*)$/i.test(k) && v) own[k] = String(v);
                if (Object.keys(own).length) auth = own;
            }
        } catch { /* a request that cannot be read carries nothing we use */ }
        if (isWrite(request)) pending++;
    };
    const answered = (response: any) => { if (isWrite(response?.request?.())) pending = Math.max(0, pending - 1); on(response); };
    const lost = (request: any) => { if (isWrite(request)) pending = Math.max(0, pending - 1); };
    try { page.on('request', sent); page.on('response', answered); page.on('requestfailed', lost); } catch { /* a page without events */ }
    return {
        saved: () => saved, refused: () => refused, written: () => written.slice(), pending: () => pending,
        kept: (marks: string[] = []) => {
            const own = (marks || []).filter(m => String(m || '').length >= 4);
            return saved + redirected + elsewhere.filter(w => own.some(m => w.body.includes(m))).length;
        },
        auth: () => ({ ...auth }), posted: () => posts.slice(), away: () => elsewhere.slice(),
        stop: () => { try { page.off('request', sent); page.off('response', answered); page.off('requestfailed', lost); } catch { /* gone */ } },
    };
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
            //  Each of its own records by its own button (stampOwnDelete); a stamp left by the last turn is cleared first.
            const sel = await page.evaluate(stampOwnDelete, { needle, stamp: 'data-joe-qa-own-delete', onlyOne: false }).catch(() => '');
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
    //  Read as the walk finds the page, before any restore draws it fresh (a reload loses the second copy).
    const idsAtStart: Array<{ id: string; count: number; labels: string[] }> = await page.evaluate(duplicateControlIds).catch(() => []);
    //  What changes by itself here (a clock, a countdown) is learnt before the first press, and credited to none.
    const ambientHere = await learnAmbient(page);
    if (ambientHere) metrics.ambientLeaves = ambientHere;
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
        /*
         * What the walk's own take-away presses (remove, decrease, clear, delete, ×) took with them:
         * each control name, as many times as it was there just before the press and gone just after.
         * Only those are the walk's doing — a «×» that closed a drawer early does not excuse every
         * control that went missing later (the review of 2026-11-10).
         */
        const takenAway = new Map<string, number>();
        //  Read, never stamped: findControls wipes every handle the walk still holds (data-joe-ctl), and the
        //  walk then sought its own controls again, press by press — a minute lost on a ten-control page.
        const controlCounts = async (): Promise<Map<string, number>> =>
            new Map(Object.entries(await page.evaluate(controlLabelCounts).catch(() => ({} as Record<string, number>))));
        const noteTakenAway = async (before: Map<string, number> | null) => {
            if (!before) return;
            const after = await controlCounts();
            for (const [name, n] of before) {
                const gone = n - (after.get(name) || 0);
                if (gone > 0) takenAway.set(name, (takenAway.get(name) || 0) + gone);
            }
        };
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
            return wroteToProduct || (takenAway.get(c.label) || 0) > 0 ? 'consumed' : '';
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
            //  What changes by itself here is stamped again (learnAmbient: learnt once, no new wait).
            await learnAmbient(page).catch(() => 0);
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
                const countsBefore = forwardRank(c.label) === 2 ? await controlCounts() : null;
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
                if (effect) await noteTakenAway(countsBefore);
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
                /*
                 * ⛔ …ON THE PAGE AS IT STARTED, NOT AS THE LAST CONTROL LEFT IT.
                 *
                 * qa-live17b, 2026-11-12 (L052, an event tracker): «Add event», then
                 * the filters «All», «Active», «Done», then the list. The desktop walk
                 * keeps its presses (not isolated), and its last press was «Done»; the
                 * forms pass then sent «Add event» on a list filtered to done events.
                 * The new event, active, was not drawn, and «sent and taken, never
                 * shown outside the form» refused the delivery four times in 60
                 * minutes, while Joe's own browser saw it on every fresh page.
                 */
                if (baselineMayBeDirty) {
                    await restoreProbeStart();
                    baselineMayBeDirty = false;
                }
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
                const countsBefore = forwardRank(candidate.label) === 2 ? await controlCounts() : null;
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
                if (effect) await noteTakenAway(countsBefore);
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
        //  The exam, 2026-11-13 (P386): «كل الفترات» on a report that opens on every period was «unresponsive».
        const CLEAR_LABEL = /^(?:clear|reset|clear search|clear filters?|clear all|clear form|reset (?:filters?|form|all|search|range|dates?|period)|show all|all periods|all time|all dates|any time|مسح|مسح الكل|مسح الحقول|مسح البحث|مسح الفلاتر|إعادة تعيين|اعادة تعيين|إعادة الضبط|اعادة الضبط|إعادة ضبط|اعادة ضبط|إلغاء البحث|إلغاء الفلترة|عرض الكل|إظهار الكل|اظهار الكل|كل الفترات|كل الفتره|جميع الفترات|كل الأوقات|كل الاوقات|كل التواريخ|جميع التواريخ)$/iu;
        /** Pressed on a state it had something to undo (a box typed into, a field moved, another control's press): only then may it be called dead. */
        const fairPress = new Set<string>();
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
                /*
                 * Its box: a text field in the control's own form, search bar or toolbar — or, for a
                 * control that clears, any other field of its group to move first: the exam, 2026-11-13
                 * (P386), «كل الفترات» reset a date filter that has no text box at all, and stayed
                 * «unresponsive» on a report that opens on every period.
                 */
                /*
                 * …never a field of a record. The review of 2026-11-15: a «عرض الكل» beside a list whose
                 * rows carry autosaving «done» checkboxes or status selects made the QA tick a real record.
                 * A field inside a row, item or card is moved only when that card is the filter bar
                 * itself (P386: <section class="card filters">); a field moved to be cleared is one of the
                 * control's own filter bar, never of its parent's or grandparent's.
                 */
                const picked: { kind: string; key: { id: string; name: string; label: string; placeholder: string; type: string; tag: string } } | null = await page.evaluate(({ s, clearing }: { s: string; clearing: boolean }) => {
                    document.querySelectorAll('[data-joe-qbox]').forEach(el => el.removeAttribute('data-joe-qbox'));
                    const control = document.querySelector(s);
                    if (!control) return null;
                    const visible = (el: Element) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
                    const ROW = 'li, tr, [role="row"], [role="listitem"], [data-id], [data-row], [data-item], .card, .item, .record, .entry, article';
                    const FILTERS = '[role="search"], form[role="search"], [role="toolbar"], .toolbar, .filters, .filter-bar, .filter, .filter-group, [data-filters], .search-bar';
                    const filterBar = control.closest(FILTERS);
                    //  A record's field: inside a row that is not the filter bar the control belongs to, nor holds it.
                    const ofRecord = (el: Element) => { const row = el.closest(ROW); return !!row && !(filterBar && (row === filterBar || row.contains(filterBar))); };
                    const keyOf = (el: Element) => ({
                        id: el.id || '', name: el.getAttribute('name') || '', label: el.getAttribute('aria-label') || '',
                        placeholder: el.getAttribute('placeholder') || '', type: (el.getAttribute('type') || '').toLowerCase(), tag: el.tagName,
                    });
                    const scopes = [control.closest('form, [role="search"], [role="toolbar"], [role="group"], .toolbar, .search, .search-bar, .filters, .filter-bar, .controls'), control.parentElement, control.parentElement?.parentElement];
                    for (const scope of scopes) {
                        const box = scope && Array.from(scope.querySelectorAll('input')).find((el: any) => visible(el) && !el.disabled && !el.readOnly
                            && /^(?:|text|search)$/i.test(el.getAttribute('type') || '') && !ofRecord(el));
                        if (box) { box.setAttribute('data-joe-qbox', '1'); return { kind: 'text', key: keyOf(box) }; }
                    }
                    if (!clearing || !filterBar) return null;
                    const field = (Array.from(filterBar.querySelectorAll('select, input')) as HTMLInputElement[]).find(el => visible(el) && !el.disabled && !el.readOnly && !ofRecord(el)
                        && (el.tagName === 'SELECT' ? (el as unknown as HTMLSelectElement).options.length > 1
                            : /^(?:date|month|week|time|datetime-local|number|range|checkbox|radio)$/i.test(el.type)));
                    if (field) { field.setAttribute('data-joe-qbox', '1'); return { kind: field.tagName === 'SELECT' ? 'select' : field.type.toLowerCase(), key: keyOf(field) }; }
                    return null;
                }, { s: found.sel, clearing }).catch(() => null);
                if (!picked) continue;
                const boxKind = picked.kind;
                const box = page.locator('[data-joe-qbox="1"]').first();
                /** The value the field was moved to: a press that clears takes it away. */
                let movedTo = '';
                if (boxKind === 'text') {
                    await box.fill(QUERY, { timeout: 2000 });
                    if (clearing) await box.press('Enter').catch(() => { });
                } else {
                    //  Moved as a person moves it: another option, another date, a box ticked.
                    const target: string = await page.evaluate(() => {
                        const el = document.querySelector('[data-joe-qbox="1"]') as HTMLInputElement | null;
                        if (!el) return '';
                        if (el.tagName === 'SELECT') {
                            const sel = el as unknown as HTMLSelectElement;
                            return Array.from(sel.options).find(o => !o.disabled && o.value !== sel.value)?.value ?? '';
                        }
                        const t = el.type.toLowerCase();
                        if (t === 'checkbox' || t === 'radio') return el.checked ? '' : 'on';
                        if (t === 'number' || t === 'range') {
                            const min = el.min !== '' ? Number(el.min) : NaN, max = el.max !== '' ? Number(el.max) : NaN;
                            const now = el.value !== '' ? Number(el.value) : NaN;
                            const next = Number.isFinite(now) ? now + 1 : Number.isFinite(min) ? min : 1;
                            return String(Number.isFinite(max) && next > max ? (Number.isFinite(min) ? min : now - 1) : next);
                        }
                        const day = el.min || '2020-01-15';
                        const pick = t === 'month' ? day.slice(0, 7) : t === 'week' ? '2020-W03' : t === 'time' ? '10:15' : t === 'datetime-local' ? `${day.slice(0, 10)}T10:15` : day.slice(0, 10);
                        return el.value === pick ? (t === 'date' ? '2020-02-15' : '') : pick;
                    }).catch(() => '');
                    if (!target) continue;
                    if (boxKind === 'select') await box.selectOption(target, { timeout: 2000 });
                    else if (boxKind === 'checkbox' || boxKind === 'radio') await box.check({ timeout: 2000, force: true });
                    else await box.fill(target, { timeout: 2000 });
                    movedTo = boxKind === 'checkbox' || boxKind === 'radio' ? 'true' : target;
                }
                await settled(Math.min(queryLookUntil, Date.now() + 2500));
                const ready = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), quietItem);
                if (!ready || !await reachableOnScreen(ready.sel)) continue;
                /*
                 * Its own box, found again by what it is when the page drew it again — never «any search
                 * box»: the review of 2026-11-15, a toolbar redrawn with innerHTML lost the mark, an empty
                 * header search was read instead, and a dead Reset «cleared» it. Not found, it says nothing.
                 */
                const boxValue = () => page.evaluate((key: { id: string; name: string; label: string; placeholder: string; type: string; tag: string }) => {
                    let field = document.querySelector('[data-joe-qbox="1"]') as HTMLInputElement | null;
                    if (!field) {
                        const like = (Array.from(document.querySelectorAll(key.tag === 'SELECT' ? 'select' : 'input')) as HTMLInputElement[])
                            .filter(el => (el.getAttribute('type') || '').toLowerCase() === key.type && (!key.id || el.id === key.id) && (!key.name || el.getAttribute('name') === key.name)
                                && (!key.label || el.getAttribute('aria-label') === key.label) && (!key.placeholder || el.getAttribute('placeholder') === key.placeholder));
                        field = (key.id || key.name || key.label || key.placeholder) && like.length === 1 ? like[0] : null;
                    }
                    if (!field) return null;
                    return field.type === 'checkbox' || field.type === 'radio' ? String(field.checked) : field.value;
                }, picked.key).catch(() => null);
                await eyes.lookAt(page, await boxOf(page, ready.sel), { note: `${KIND_AR[quiet.kind] || 'عنصر'}: ${quiet.label}`.slice(0, 64), moveMouse: true });
                const before = await page.evaluate(snapshot).catch(() => null);
                //  …and what it held as it was pressed: a box already empty (or already back) was cleared by nothing.
                const heldAtPress = clearing ? await boxValue() : null;
                const hadSomething = heldAtPress !== null && (movedTo ? heldAtPress === movedTo : heldAtPress !== '');
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                await (await page.$(ready.sel))?.click({ timeout: 2500, noWaitAfter: true });
                let effect = '';
                const settleDeadline = Date.now() + 2500;
                do {
                    await page.waitForTimeout(100);
                    effect = page.url() !== probeStartUrl ? 'navigation' : changed(before, await page.evaluate(snapshot).catch(() => null));
                    if (!effect && clearing && hadSomething) {
                        const value = await boxValue();
                        if (value !== null && (movedTo ? value !== movedTo : value === '')) effect = 'cleared';
                    }
                } while (!effect && Date.now() < settleDeadline && eyeIsOpen());
                //  A clear pressed on a box that held nothing of the QA's had nothing to undo: not a fair press.
                if (!clearing || hadSomething) fairPress.add(`${quiet.kind}|${quiet.label}|${quiet.instance ?? 0}`);
                metrics.secondLook.push({ label: quiet.label, after: movedTo ? `its ${boxKind} field moved to «${movedTo}»` : clearing ? `«${QUERY}» searched` : `«${QUERY}» typed`, effect });
                if (effect) controls.push({ label: quiet.label, kind: quiet.kind, worked: true, effect, instance: quiet.instance, href: quiet.href });
            } catch { /* the control under test keeps its first verdict */ }
        }
        const answered = new Set(controls.filter(r => r.worked).map(r => `${r.kind}|${r.label}|${r.instance ?? 0}`));
        const secondLookUntil = Date.now() + 12_000;
        const nav = (k: string) => k === 'menu' || k === 'tab' || k === 'link';
        /**
         * ⛔ A QUIET NAV ITEM IS THE LINK TO THE VIEW ALREADY OPEN ONLY WITH EVIDENCE, AND NEVER ONCE IT WAS TRIED FROM ANOTHER VIEW.
         *
         * «المتجر» on «متجر مكتب شكاوى البلدية» (L162) and «Shop» beside a disabled cart (L161, the sixth
         * live check: refused twice, then rebuilt as a hash router) change nothing on the view they name.
         * But the review of 2026-11-10 found the excuse too wide: read from hidden headings, wherever the
         * walk ended, for a burger menu too, and after a nav item stayed quiet on a view another item had
         * moved to. So, read on the page as the walk started and from what is shown there:
         *   - never a menu toggle (aria-expanded, aria-haspopup, a burger);
         *   - never one that stayed quiet after another control had moved the view away;
         *   - and one of: its words are the page's shown title or main heading; it is marked current
         *     (aria-current, aria-selected, «active»); it is the site's own name in the header; or it is
         *     the first item of its navigation, when no other view could be reached to try it from.
         */
        const currentPageEvidence = async (quiet: ControlResult, quietItem: any): Promise<string> => {
            try {
                await restoreProbeStart();
                const now = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), quietItem);
                if (!now) return '';
                const seen = await page.evaluate(currentLinkFacts, now.sel).catch(() => null);
                if (!seen || seen.toggle) return '';
                if (!nav(quiet.kind) && !seen.brand) return '';
                if (namesCurrentPage(quiet.label, seen.names, probeStartUrl)) return 'its words name the page';
                if (seen.marked) return 'marked as the current page';
                if (seen.brand) return 'the site\'s own name, in its header';
                if (seen.first) return 'the first item of its navigation, and no other view could be reached to try it from';
                return '';
            } catch { return ''; }
        };
        /*
         * ⛔ EVERY QUIET CONTROL GETS ITS FIRST SECOND LOOK BEFORE ANY GETS ITS THIRD.
         *
         * P204's own test, 2026-11-11 (failing on main too, at 100% CPU): «Wishlist», wired to
         * nothing, took the whole 12 s — three movers, a reload each — and «Clear filters», the reset
         * the second look exists for, was never pressed on a changed page: «Unresponsive». The movers
         * are taken in rounds: each quiet control after its best mover first, then the next.
         */
        const quietOnes = pressedQuiet.filter(q => !answered.has(`${q.kind}|${q.label}|${q.instance ?? 0}`)).slice(0, 3).map(quiet => {
            /*
             * A nav item undoes another nav item: «المتجر» (setView('shop')) after «السلة», not after
             * «أضف إلى السلة», which leaves the shop where it was (L162, the fifth live check: «Unresponsive
             * controls: "المتجر"» three times; Joe made it focus the search box, then a link, to quiet it).
             */
            const moverRank = (m: ControlResult) => (nav(quiet.kind) && nav(m.kind) ? 0 : 2) + (['dom', 'open', 'state'].includes(String(m.effect)) ? 0 : 1);
            const tried = movers.filter(m => m.label !== quiet.label).map((m, i) => ({ m, i })).sort((a, b) => moverRank(a.m) - moverRank(b.m) || a.i - b.i).map(x => x.m);
            /** Pressed again on a view another control had moved to, and still quiet: tried where it had somewhere to go. */
            return { quiet, quietItem: catalogued(quiet), tried: tried.slice(0, 3), testedElsewhere: false, answered: false };
        }).filter(q => !!q.quietItem);
        for (let round = 0; round < 3; round++) {
            for (const q of quietOnes) {
                if (q.answered || Date.now() >= secondLookUntil || !eyeIsOpen()) continue;
                const { quiet, quietItem } = q;
                const mover = q.tried[round];
                if (!mover) continue;
                const moverItem = catalogued(mover);
                if (!moverItem) continue;
                try {
                    await restoreProbeStart();
                    const attemptUntil = Math.min(secondLookUntil, Date.now() + 4000);
                    const moverNow = replacementFor(await evalInPage(page, findControls, limit).catch(() => [] as any[]), moverItem);
                    if (!moverNow || !await reachableOnScreen(moverNow.sel)) continue;
                    const viewBefore: string[] = await page.evaluate(visibleHeadings).catch(() => []);
                    await eyes.lookAt(page, await boxOf(page, moverNow.sel), { note: `${KIND_AR[mover.kind] || 'عنصر'}: ${mover.label}`.slice(0, 64), moveMouse: true });
                    await eyes.press(page);
                    await (await page.$(moverNow.sel))?.click({ timeout: 2500, noWaitAfter: true });
                    // A change still arriving from the first press would be
                    // credited to the second one: measure only a still page.
                    if (!await settled(attemptUntil) || page.url() !== probeStartUrl) continue;
                    //  The view was left when a heading shown before is gone («المنتجات» → «سلتك»); a badge's number is not a view.
                    const viewAfter: string[] = await page.evaluate(visibleHeadings).catch(() => []);
                    const left = viewBefore.some(h => !viewAfter.includes(h));
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
                    fairPress.add(`${quiet.kind}|${quiet.label}|${quiet.instance ?? 0}`);
                    if (!effect && left) q.testedElsewhere = true;
                    if (effect) controls.push({ label: quiet.label, kind: quiet.kind, worked: true, effect, instance: quiet.instance, href: quiet.href });
                    if (effect) q.answered = true;
                } catch { /* the control under test keeps its first verdict */ }
            }
        }
        for (const { quiet, quietItem, testedElsewhere } of quietOnes) {
            //  Still quiet, never tried from another view, and with evidence it is the open view's own link.
            const stillQuiet = !controls.some(r => r.worked && r.kind === quiet.kind && r.label === quiet.label);
            const why = stillQuiet && !testedElsewhere && eyeIsOpen() ? await currentPageEvidence(quiet, quietItem) : '';
            if (why) {
                controls.push({ label: quiet.label, kind: quiet.kind, worked: false, effect: 'current', instance: quiet.instance, href: quiet.href });
                metrics.currentPageLinks = Number(metrics.currentPageLinks || 0) + 1;
                (metrics.currentPageWhy = metrics.currentPageWhy || []).push(`${quiet.label}: ${why}`);
            }
        }
        /*
         * ⛔ A CONTROL THAT UNDOES IS DEAD ONLY AFTER IT HAD SOMETHING TO UNDO.
         *
         * A reset, a «show all», an «all periods» on a page already at its defaults changes nothing,
         * correctly (P386, the exam of 2026-11-13). Pressed after a box was typed into, a field of its
         * group moved, or another control's press, and still quiet, it is dead; never given that
         * state, it is not judged («idle»), and told in the metrics.
         */
        //  Pressed on a state it had something to answer, and still quiet: its dead result is a measurement (judgeBehaviour keeps it).
        for (const r of controls) {
            if (r.worked || NOT_PRESSED.has(String(r.effect || '')) || !fairPress.has(`${r.kind}|${r.label}|${r.instance ?? 0}`)) continue;
            if (controls.some(o => o.worked && o.kind === r.kind && o.label === r.label && (o.instance ?? 0) === (r.instance ?? 0))) continue;
            r.fair = true;
        }
        for (const quiet of pressedQuiet) {
            if (!CLEAR_LABEL.test(quiet.label.trim())) continue;
            const key = `${quiet.kind}|${quiet.label}|${quiet.instance ?? 0}`;
            if (fairPress.has(key)) continue;
            if (controls.some(r => r.kind === quiet.kind && r.label === quiet.label && (r.instance ?? 0) === (quiet.instance ?? 0) && (r.worked || r.effect === 'current' || r.effect === 'idle'))) continue;
            controls.push({ label: quiet.label, kind: quiet.kind, worked: false, effect: 'idle', instance: quiet.instance, href: quiet.href });
            (metrics.nothingToUndo = metrics.nothingToUndo || []).push(quiet.label);
        }
        probeWrites.stop();
        phase('rest');
    }
    const idsAtEnd: Array<{ id: string; count: number; labels: string[] }> = await page.evaluate(duplicateControlIds).catch(() => []);
    metrics.duplicateIds = [...idsAtStart, ...idsAtEnd.filter(d => !idsAtStart.some(s => s.id === d.id))].slice(0, 6);

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
    /*
     * A payment card's fields are not a date, a phone or an amount: its «Expiry (MM/YY)» is text by
     * every card form's design, and «should be type=date» refused checkouts that were right (the
     * exam, 2026-11-13: P230, P236, P238, P246, P250). Their own cases test them (qa-field-cases.ts).
     */
    if (/\b(?:card|cc|credit|debit|cvc|cvv|csc)\b|\bmm\s*\/\s*yy|بطاقة|البطاقة/iu.test(label)) return '';
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
    //  What changes by itself here is learnt before the first submit (learnAmbient; once per view).
    const ambientHere = await learnAmbient(page);
    if (ambientHere) metrics.ambientLeaves = ambientHere;
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
    /** Each form tried gets its own number, and its own mark from it (formMark). */
    let formIndex = 0;
    for (const planned of forms) {
        if (Date.now() > deadline) break;
        if (!eyeIsOpen()) break;
        //  …and wipe the stamps of what changes by itself: stamped again where they are (learnAmbient, no new wait).
        await learnAmbient(page).catch(() => 0);
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
        /*
         * ⛔ EACH FORM CARRIES ITS OWN MARK.
         *
         * The review of 2026-11-15: one mark for every form of the walk let form A's row (or a record
         * a wrong value left) «prove» form B's lost record. The run's mark with one letter of this
         * form's own — every mark the same length, so no form's mark is part of another's (never
         * «…-1» inside «…-10») — and a row proves only the form that made it, and the QA deletes only
         * what this form made. One letter costs a field with a length limit as little as it can.
         */
        formIndex++;
        const formMark = formIndex <= 26
            ? `${runNonce}${String.fromCharCode(96 + formIndex)}`
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        // A nonce is deliberately placed only in QA-created values. It lets us
        // find and remove our own record without ever touching visitor data.
        const persistenceAnchors: string[] = [];
        /** The writes the product had taken before this form was touched: the ones after are this form's (an edit's PUT). */
        const formWritesFrom = writes.posted().length;
        /*
         * ⛔ A FORM THAT OPENS HOLDING A RECORD EDITS THAT RECORD — THE QA NEVER DELETES IT.
         *
         * The replay of the exam's P179 (2026-11-15): the walk opened a movie's edit form, the QA typed
         * its marked values over the movie's own, the PUT kept them, and the QA found its mark in that
         * row and deleted the movie as its own — a visitor's record gone. A form that opened with its
         * text already filled in, or whose writes only changed (PUT, PATCH) and made nothing (POST),
         * edited a record that was there before: never deleted, counted and told.
         */
        const openedFilled: boolean = await page.evaluate((sel: string) => {
            const form = document.querySelector(sel);
            if (!form) return false;
            return Array.from(form.querySelectorAll('input, textarea')).some(node => {
                const x = node as HTMLInputElement;
                const type = String(x.getAttribute('type') || 'text').toLowerCase();
                if (x.tagName === 'INPUT' && !/^(?:text|email|tel|url)$/.test(type)) return false;
                const r = x.getBoundingClientRect();
                return r.width > 0 && r.height > 0 && !x.disabled && !x.readOnly && String(x.value || '').trim() !== '';
            });
        }, f.sel).catch(() => false);
        /** What another origin had taken before this form (watchWrites away): the ones after are its own. */
        const formAwayFrom = writes.away().length;
        /** The record ids the page showed before this form was sent: a POST that answers one changed it (formEditedRecord). */
        const idsShownBefore = new Set<string>(await page.evaluate(shownRecordIds).catch(() => [] as string[]));
        /** The rows grew once the form was sent (recordRowCount): a POST to a collection made a record. */
        let rowsGrewOnSubmit = false;
        //  What the form said no with before the QA touched it (a hint drawn from the start): no answer of its submit (refusalOnScreen).
        const screenAtStart = await refusalOnScreen(page, f.sel).catch(() => ({ invalid: [] as string[], said: [] as string[], tied: [] as string[] }));
        /** The valid value each field was given, to put back after a case was sent (refillValid). */
        const validValues = new Map<string, { kind: 'fill' | 'select' | 'check'; value: string }>();
        /** Major cases the field took at input: sent with the form, the product's own answer decides. */
        const submitCandidates: Array<{ sel: string; field: string; meaning: string; c: FieldCase }> = [];
        /** The one field markup is tried in: free text with room for it (markupFieldOf). */
        /*
         * The form's own words — its name and every field's — beside each field's: a bare «Security code» is a
         * card's only in a form that pays or holds a card number, and a «Card number» in a form named for an
         * insurance or a student card is no payment card (qa-field-cases.ts cardMeaning; the r40 review, 2026-11-15).
         */
        const formWords = [f.label, ...f.fields.map((x: any) => String(x.name || ''))].join(' ').replace(/\s+/g, ' ').slice(0, 600);
        const asCaseFields: QaField[] = f.fields.map((x: any) => ({ tag: x.tag, type: x.type, name: x.name, required: x.required, pattern: x.pattern, min: x.min, max: x.max, minLength: x.minLength, maxLength: x.maxLength, step: x.step, inputMode: x.inputMode, autocomplete: x.autocomplete, placeholder: x.placeholder, options: x.options, context: formWords }));
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
                //  Its meaning, from its type, its limits, its words and its autocomplete token (qa-field-cases.ts).
                const caseField: QaField = {
                    tag: fld.tag, type: fld.type, name: fld.name, required: fld.required, pattern: fld.pattern,
                    min: fld.min, max: fld.max, minLength: fld.minLength, maxLength: fld.maxLength, step: fld.step, inputMode: fld.inputMode,
                    autocomplete: fld.autocomplete, placeholder: fld.placeholder, options: fld.options, context: formWords,
                };
                if (fld.tag === 'select') {
                    if (!fld.options.length) continue;
                    //  The option its meaning asks for: a card's expiry year in the future, never this year (selectValueFor).
                    const choice = selectValueFor(caseField) || fld.options[0];
                    await el.selectOption(choice, { timeout: 2000 });
                    validValues.set(fld.sel, { kind: 'select', value: choice });
                } else if (fld.type === 'checkbox' || fld.type === 'radio') {
                    await el.check({ timeout: 2000, force: true });
                    if (fld.type === 'checkbox') validValues.set(fld.sel, { kind: 'check', value: '' });
                } else {
                    //  A card's MM/YY, its number and its code are not a date, a phone or an amount: their own cases test them.
                    const cardField = /^(?:card|cvc|expiry|expiry-month|expiry-year|cardholder)$/.test(meaningOf(caseField));
                    const semantic = cardField ? '' : semanticTypeForField(fld.tag, fld.name);
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
                    let value = fillValueFor(caseField, formMark, pageLanguage);
                    //  The field markup is tried in: sent as text, it must come back as text.
                    if (markupSel === fld.sel) value = `${MARKUP_PROBE} ${formMark}`;
                    //  A value never outgrows its field: the browser would cut it, and the cut anchor is never found again.
                    if (fld.maxLength > 0 && value.length > fld.maxLength) {
                        //  A short field (a key, a code) gets a short value of its own each run: a fixed one repeats, and a product refuses a key twice.
                        value = fld.maxLength < 12
                            ? ('Q' + formMark.split('-').reverse().join('')).replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, fld.maxLength)
                            : value.slice(0, fld.maxLength);
                    }
                    if (value.includes(formMark)) persistenceAnchors.push(markupSel === fld.sel ? formMark : value);
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
        /*
         * ⛔ A SENT CASE IS WAITED FOR BEFORE THE NEXT FILL.
         *
         * The eleventh live check, 2026-11-11 (L232, a laundry): «Save customer» sent with letters in
         * its phone was refused 400, and the app then reloaded the order and drew its form again —
         * after the walk had already typed the valid values. The redraw put the stored «call-me»
         * back, the last submit sent nothing, a leftover redraw was read as its answer, and «sent and
         * taken, never shown» refused the laundry four times. Each sent case waits for its write to
         * be answered and the page to be still, and so does the last fill.
         */
        const settleAfterSubmit = async (maxMs = 3000) => {
            const until = Math.min(deadline, Date.now() + maxMs);
            while (writes.pending() > 0 && Date.now() < until) await page.waitForTimeout(100);
            let last = await page.evaluate(snapshot).catch(() => null);
            while (Date.now() < until) {
                await page.waitForTimeout(250);
                const now = await page.evaluate(snapshot).catch(() => null);
                if (!changed(last, now)) break;
                last = now;
            }
            //  A form the page drew again is found again, and its valid values move to its new fields (relocate).
            const marks = [f.sel, ...(f.submitSel ? [f.submitSel] : []), ...validValues.keys()];
            const alive = await page.evaluate((list: string[]) => list.every(s => !!document.querySelector(s)), marks).catch(() => true);
            if (!alive) await relocate();
        };
        for (const cand of submitCandidates.slice(0, MAX_SUBMITTED_CASES_PER_FORM)) {
            if (Date.now() > deadline || !eyeIsOpen()) break;
            if (cand !== submitCandidates[0]) await settleAfterSubmit();
            await refillValid(page, validValues);
            const field = await page.$(cand.sel);
            if (!field) continue;
            await eyes.lookAt(page, await boxOf(page, cand.sel), { note: `${cand.c.ar} — إرسال`, tone: 'warn', moveMouse: false });
            try { await field.fill(cand.c.value, { timeout: 1500 }); } catch { continue; }
            const wroteBefore = writes.saved();
            const refusedBeforeCase = writes.refused();
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
                //  The server refused the wrong value: the product said no, whatever the page then drew.
                else if (writes.refused() > refusedBeforeCase) answer = 'refused';
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
        if (submitCandidates.length) {
            /*
             * …and what was typed is still there a moment later. The laundry's own test, under load
             * (2026-11-11): the page reloaded the record 600 ms after answering a refused case, the
             * page had been still for 250 ms, so the walk typed the valid values — and the redraw
             * wiped them: the last submit sent the stored «call-me». Typed again until they hold.
             */
            const valuesHeld = () => page.evaluate((entries: Array<[string, { kind: string; value: string }]>) => entries.every(([s, v]) => {
                const el = document.querySelector(s) as HTMLInputElement | null;
                if (!el) return false;
                return v.kind === 'check' ? el.checked === true : String(el.value) === String(v.value);
            }), Array.from(validValues.entries())).catch(() => true);
            for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
                await settleAfterSubmit();
                await refillValid(page, validValues);
                await page.waitForTimeout(700).catch(() => { });
                if (await valuesHeld()) break;
            }
        }
        if (markupSel) await page.evaluate(() => { (window as any).__joeQaXss = 0; }).catch(() => { });

        // …and sent, through the button a visitor would press.
        let effect = '';
        /** A submit that took him to what he made: the form's own page, opened again once the record is checked. */
        let returnAfterForm = '';
        /** What this form made was found again after a reload (a journey's proof, qa-product-profile.ts). */
        let persistedThis = false;
        /** The page's words before the form was sent: what the submit made is what was not there (newRecordTokens). */
        let tokensBefore: string[] = [];
        /** …and how many records it showed: a record with no mark of its own is the row it added (recordRowCount). */
        let rowsBefore = -1;
        /** The headings the form was sent under: the view a row count is compared on. */
        let viewBeforeSubmit: string[] = [];
        /** How many writes the product had taken before this form was sent: the ones after are this form's. */
        let writtenBeforeSubmit = 0;
        /** …and taken anywhere (watchWrites kept): a redirect after a post, another origin's database. */
        let keptBeforeSubmit = 0;
        /** What the browser itself kept before the submit (browserKept): a record the page stores is kept there. */
        let storageBeforeSubmit = '';
        /** The form still said no when it was sent: its invalid fields and its words (refusalOnScreen). */
        let refusedOnScreen: { invalid: string[]; said: string[] } | null = null;
        /** The marks a write of this form carries: another origin's write counts as kept only with one of them (watchWrites kept). */
        const ownValues = [formMark, ...[...validValues.values()].filter(v => v.kind !== 'check').map(v => v.value)].filter(v => String(v).length >= 4);
        /** How many writes the origin had answered before this form was sent (watchWrites posted): the ones after are its own. */
        let postedBeforeSubmit = writes.posted().length;
        /** The page's lines before the submit: the new ones are what it said of the record («will appear once approved»). */
        let linesBeforeSubmit: string[] = [];
        /** What the page said once the form was sent: its messages, and the lines it drew. */
        let answeredWith = '';
        try {
            /*
             * ⛔ A SUBMIT THE PRODUCT KEEPS DISABLED WAS NOT SENT.
             *
             * The eleventh live check, 2026-11-11 (L171, a dental clinic): «احجز الموعد» stayed disabled
             * until a date and a time slot — both outside the form — were chosen, as booking pages do.
             * The QA filled the name and the phone, pressed the greyed button, and called the form
             * «filled in completely and submitted, and nothing happened at all»; the builder enabled the
             * button to quiet it. The product declined the submit until what it needs is chosen: told as
             * declined (the booking's journey says whether it was proven), never as a dead form.
             */
            const isSubmitDisabled = async (): Promise<boolean> => f.submitSel ? page.evaluate((s: string) => {
                const b = document.querySelector(s) as HTMLButtonElement | null;
                return !!b && (b.disabled === true || b.getAttribute('aria-disabled') === 'true');
            }, f.submitSel).catch(() => false) : false;
            let submitDisabled = await isSubmitDisabled();
            /*
             * …but first, what the page asks for outside its form, chosen as a person would: the empty
             * date or time beside it, the first slot it then offers. The third review, 2026-11-11: told
             * only «declined», a submit a bug keeps disabled forever would pass unseen; a booking whose
             * slot is chosen is sent, and proven.
             */
            if (submitDisabled) {
                const asked: Array<{ sel: string; kind: string }> = await page.evaluate(stampPrerequisites, f.sel).catch(() => []);
                for (const p of asked) {
                    if (p.kind === 'select') {
                        const value = await page.evaluate((s: string) => { const x = document.querySelector(s) as HTMLSelectElement | null; return x ? (Array.from(x.options).find(o => o.value && !o.disabled)?.value || '') : ''; }, p.sel).catch(() => '');
                        if (value) await page.selectOption(p.sel, value, { timeout: 1500 }).catch(() => { });
                    } else {
                        const day = valueFor('date', 'input', runNonce, pageLanguage);
                        await page.fill(p.sel, p.kind === 'time' ? '10:30' : p.kind === 'datetime' ? `${day}T10:30` : day, { timeout: 1500 }).catch(() => { });
                    }
                }
                if (asked.length) await page.waitForTimeout(1500).catch(() => { });
                const choice: string = await page.evaluate(stampFirstChoice, f.sel).catch(() => '');
                if (choice) { await page.click(choice, { timeout: 2500 }).catch(() => { }); await page.waitForTimeout(500).catch(() => { }); }
                if (asked.length || choice) metrics.formsPrerequisitesChosen = Number(metrics.formsPrerequisitesChosen || 0) + 1;
                submitDisabled = await isSubmitDisabled();
            }
            /*
             * …and a group of radios the page drew again with nothing chosen is chosen again. run500 P298
             * (a booking page, 2026-11-13): its time slots are radios drawn again when the date changes,
             * and drawing them clears the choice; the walk checked a slot, then set the date, and sent a
             * form with no time — the page said «اختر الوقت», nothing reached the server, and the booking
             * was called «found nowhere» after the refresh. A tester looks before he presses the button.
             */
            const rechosen: number = await page.evaluate(chooseUnchosenRadios, f.sel).catch(() => 0);
            if (rechosen) {
                metrics.formsRadiosChosenAgain = Number(metrics.formsRadiosChosenAgain || 0) + rechosen;
                await page.waitForTimeout(300).catch(() => { });
            }
            //  Every baseline below is taken after what the page asked for was chosen: those choices are no answer of the submit.
            const before = await page.evaluate(snapshot).catch(() => null);
            const feedbackBefore = await formFeedback(page, f.sel);
            const stillInvalid = await page.evaluate((sel: string) => {
                const form = document.querySelector(sel) as HTMLFormElement | null;
                return !!form && typeof form.checkValidity === 'function' && !form.checkValidity();
            }, f.sel).catch(() => false);
            //  Marked, so a new document is told from the same one moving to another of its views (below).
            const urlBeforeSubmit = String(page.url() || '');
            const savedBeforeSubmit = writes.saved();
            writtenBeforeSubmit = writes.written().length;
            const refusedBeforeSubmit = writes.refused();
            keptBeforeSubmit = writes.kept(ownValues);
            postedBeforeSubmit = writes.posted().length;
            linesBeforeSubmit = f.expectsPersistence ? await page.evaluate(() => String(document.body?.innerText || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4000)).catch(() => [] as string[]) : [];
            storageBeforeSubmit = f.expectsPersistence ? await evalInPage(page, browserKept).catch(() => '?') : '';
            tokensBefore = f.expectsPersistence ? await evalInPage(page, pageTokens).catch(() => [] as string[]) : [];
            rowsBefore = f.expectsPersistence ? await page.evaluate(recordRowCount).catch(() => -1) : -1;
            viewBeforeSubmit = f.expectsPersistence ? await page.evaluate(visibleHeadings, true).catch(() => [] as string[]) : [];            await page.evaluate((n: string) => { (window as any).__joeQaDoc = n; }, runNonce).catch(() => { });
            //  What the submit writes into the page's messages, the same words again included (watchFormAnswer);
            //  what writes itself while nothing is pressed is set aside first (markAnswerAmbient).
            await page.evaluate(watchFormAnswer).catch(() => false);
            await page.waitForTimeout(400).catch(() => { });
            await page.evaluate(markAnswerAmbient).catch(() => 0);
            //  What the form says no with as it is pressed: a page that changes answers only with what it draws after (refusalOnScreen).
            const screenAtPress = await refusalOnScreen(page, f.sel).catch(() => ({ invalid: [] as string[], said: [] as string[], tied: [] as string[] }));
            //  A server that refuses what the QA sent decides about the QA's value; it is not a broken request.
            expectRefusal(page, 3500);
            if (f.submitSel) {
                if (!eyeIsOpen()) break;
                await eyes.lookAt(page, await boxOf(page, f.submitSel), { note: `إرسال: ${f.label}`, moveMouse: true });
                if (!eyeIsOpen()) break;
                await eyes.press(page);
                if (!eyeIsOpen()) break;
                //  Read again as it is pressed: a check that enables it a moment later is not a declined form.
                submitDisabled = await isSubmitDisabled();
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
            //  A disabled submit sends nothing: there is no answer to wait for.
            /*
             * A form already sent is waited for on its own time, never cut by the forms budget: the replay of
             * the exam's P096 (2026-11-15) pressed «أضف التقييم» as the budget ran out, looked once, saw nothing
             * yet, and called a form whose POST was still on its way «filled in and nothing happened».
             */
            const effectDeadline = submitDisabled ? Date.now() : Date.now() + 2500;
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
                } else if (stillInvalid && (!effect || !f.noValidate)) {
                    /*
                     * A form the browser holds invalid is not sent at all, whatever else moved meanwhile: the
                     * replay of the exam's P179 (2026-11-15) chose a showtime the QA had just deleted, the select
                     * stayed empty and required, a list redrew beside it, and «Add ticket» — never sent — was
                     * looked for as a record and called lost.
                     */
                    // The browser refused it — which is the behaviour that was asked
                    // for, not a dead form.
                    effect = 'validation';
                } else {
                    //  The form still says no — a field marked invalid, an error drawn before this press (refusalOnScreen).
                    /*
                     * …but only what the QA's own work on this form drew: never a hint the page showed from
                     * the start («الرجاء …» in an aria-live line), never another form's leftovers. And a page
                     * that otherwise changed answered with what it drew after the press, never with an error
                     * left from before it (the review of 2026-11-15: a client-only app that drew the record
                     * beside a static hint was «refused», and its lost record was never looked for).
                     */
                    const onScreen = await refusalOnScreen(page, f.sel).catch(() => ({ invalid: [] as string[], said: [] as string[], tied: [] as string[] }));
                    const base = effect ? screenAtPress : screenAtStart;
                    const newer = (now: string[] = [], was: string[] = []) => { const left = [...was]; return now.filter(x => { const i = left.indexOf(x); if (i < 0) return true; left.splice(i, 1); return false; }); };
                    const invalidNow = newer(onScreen.invalid, base.invalid);
                    const saidNo = [...new Set([...newer(onScreen.tied, base.tied), ...newer(onScreen.said, base.said).filter(line => isVisibleFormRefusal(line))])];
                    if (invalidNow.length || saidNo.length) {
                        effect = 'refused';
                        refusedOnScreen = { invalid: invalidNow, said: saidNo.slice(0, 3) };
                    } else if (effect) {
                        effect = 'submitted';
                    }
                }
            }
            //  What the page wrote into its messages (read now, judged after what the server said).
            const written: string[] = await page.evaluate(readFormAnswer).catch(() => [] as string[]);
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
            /*
             * A write still on its way is waited for: the page may draw before the server answers (a
             * disabled button, a spinner, a list reloaded), and that drawing is not the answer. The
             * eleventh live check, 2026-11-11 (L232): «Save customer» was refused 400 («phone may only
             * contain digits») after the page had already changed, and was judged «sent and taken,
             * never shown» — a record the server had refused, looked for four times.
             */
            //  …and so is its write: its answer is the submit's (the same replay, P179: a POST still pending read as «nothing kept»).
            const writesUntil = Date.now() + 4000;
            while (writes.pending() > 0 && Date.now() < writesUntil) await page.waitForTimeout(100);
            const savedNow = writes.saved() > savedBeforeSubmit;
            const refusedNow = writes.refused() > refusedBeforeSubmit;
            //  An error still drawn from an earlier case is not this submit's answer when the server took the write.
            if (refusedOnScreen && savedNow) { effect = 'submitted'; refusedOnScreen = null; }
            if (refusedNow && !savedNow && effect !== 'validation' && effect !== 'reload') {
                //  Told nothing unless the page wrote a refusal: said again in the same words is telling (watchFormAnswer);
                //  a «Saving…» it then wiped is not (the fifth review).
                if (!hasNewVisibleFormFeedback(feedbackBefore, await formFeedback(page, f.sel)) && !effect && !written.some(w => isVisibleFormRefusal(w))) {
                    metrics.fieldCasesFailed++;
                    metrics.fieldCaseFailures.push({ form: f.label, field: f.label, meaning: 'form', case: 'form:refused', value: '', ar: 'رُفض الإرسال دون رسالة للزائر', en: 'the submit was refused and the visitor was told nothing', weight: 'minor', outcome: 'refused_silently' });
                }
                effect = 'refused';
            } else if (!effect && savedNow) {
                effect = 'submitted';
                metrics.formsSavedQuietly = Number(metrics.formsSavedQuietly || 0) + 1;
            }
            //  Nothing changed to the eye and the server said nothing, yet the page wrote its answer again — the same words an earlier case drew.
            if (!effect && written.some(Boolean)) {
                effect = isVisibleFormRefusal(written.join('\n')) ? 'refused' : 'submitted';
                metrics.formsAnsweredAgain = Number(metrics.formsAnsweredAgain || 0) + 1;
            }
            if (!effect && submitDisabled) effect = 'declined';
            if (effect === 'submitted' && f.expectsPersistence) {
                //  What it said of what it made: «your review will appear once approved» is a record kept and held (serverListVerdict).
                const was = new Set(linesBeforeSubmit);
                const drawn: string[] = await page.evaluate(() => String(document.body?.innerText || '').split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4000)).catch(() => [] as string[]);
                answeredWith = [await formFeedback(page, f.sel), ...written, ...drawn.filter(l => !was.has(l)).slice(0, 40)].join('\n').slice(0, 6000);
            }
        } catch { /* the form is what is under test */ }
        /*
         * Refused by the product, on screen, with every field given its valid value: the product decided
         * about the QA's value (a card number it checks, a slot it wants chosen) — told as a weak check
         * with its own words, never a dead form (judgeBehaviour, field_case_minor).
         */
        if (effect === 'refused' && refusedOnScreen) {
            const shown = refusedOnScreen as { invalid: string[]; said: string[] };
            const words = shown.said.length ? shown.said.join(' / ') : `marked invalid: ${shown.invalid.join(', ')}`;
            metrics.formsRefusedOnScreen = Number(metrics.formsRefusedOnScreen || 0) + 1;
            metrics.fieldCasesFailed++;
            metrics.fieldCaseFailures.push({
                form: f.label, field: shown.invalid[0] || f.label, meaning: 'form', case: 'form:refused_on_screen', value: '',
                ar: `رفض النموذج القيم الصالحة التي أدخلها الفحص وقال: «${words.slice(0, 160)}»`,
                en: `the form refused the QA's valid values and said: "${words.slice(0, 160)}"`,
                weight: 'minor', outcome: 'refused_on_screen',
            });
        }

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
        else if (effect === 'declined') {
            metrics.formsDeclined = Number(metrics.formsDeclined || 0) + 1;
            (metrics.formsDeclinedEvidence = metrics.formsDeclinedEvidence || []).push({ label: f.label, fields: f.fields.length, why: 'its submit stayed disabled with every field filled, and with what the page offered outside the form chosen' });
        }
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
        else if (isSearchForm(f.fields, f.label) && !f.placesOrder) {
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
        /*
         * It changed a record that was there with the QA's mark (a PUT or PATCH that carried it): that record
         * now holds the mark, and deleting «the QA's own» could take it. Or it made nothing on any server
         * (no POST) and opened holding a record: a client-only edit. A form that opened filled and then
         * POSTed made a new record (the replay of P179: its create-or-edit form PUT the movie unchanged
         * on the empty submit, then created the QA's own) — that record is the QA's to delete.
         */
        /*
         * …and a POST is a create only when it went to a collection and the rows grew, or answered a new id
         * (formEditedRecord): the second review of 2026-11-15 — an edit form that POSTs /api/items/1 had its
         * movie deleted; a create form writing to a hosted database (another origin) never had the QA's own
         * deleted. Another origin's writes count when they carried this form's mark.
         */
        const formEdit = () => formEditedRecord(
            [...writes.posted().slice(formWritesFrom), ...writes.away().slice(formAwayFrom).filter(w => String(w.body || '').includes(formMark))],
            formMark, { openedFilled, rowsGrew: rowsGrewOnSubmit, seenIds: idsShownBefore });
        const editedRecord = () => formEdit().edited;
        let editTold = false;
        const tellEdit = async (mark: string) => {
            if (editTold) return;
            editTold = true;
            metrics.qaRecordsEdited = Number(metrics.qaRecordsEdited || 0) + 1;
            (metrics.qaRecordsEditedEvidence = metrics.qaRecordsEditedEvidence || []).push({ form: f.label, mark, why: formEdit().why || 'the form opened holding a record' });
            if (eyeIsOpen()) await eyes.say(page, `«${f.label}» عدّل سجلاً موجوداً — لا أحذفه، فهو ليس سجلاً أنشأه الفحص`);
        };
        //  No free text to carry the run's mark (a form of codes and numbers): what it made is still looked for (newRecordTokens).
        const anchor = persistenceAnchors.find(value => value.length > 4) || '';
        if (effect === 'submitted' && f.expectsPersistence && (anchor || tokensBefore.length || rowsBefore >= 0) && Date.now() < deadline && eyeIsOpen()) {
            /*
             * Where the record shows: anywhere in the page's own text (a card, a
             * board column, a heading — L451 drew its records as cards no list
             * selector named), never in a passing toast or alert; or back in a
             * field that shows it (an edit form after a reload: its value came
             * from the server).
             */
            /*
             * Right after the submit, never in the submitted form's own fields: the exam, 2026-11-13 (P290),
             * a booking refused for want of a slot kept the QA's name in its field, and that was taken for
             * the record. After a reload a field that shows it is the server's (an edit form).
             */
            const visibleNeedle = (needles: string[], formSel = '') => page.evaluate(({ list, formSel }: { list: string[]; formSel: string }) => {
                const noise = '[role="status"],[role="alert"],[aria-live],.toast,.flash,.snackbar,.notice';
                const own = formSel ? document.querySelector(formSel) : null;
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
                        .some(x => !(own && own.contains(x)) && String((x as HTMLInputElement).value || '').includes(needle));
                };
                return list.find(shows) || '';
            }, { list: needles, formSel }).catch(() => '');
            /** The run's own mark inside what was typed: what a server keeps of a name it trims or splits. */
            const ownNonce = anchor.includes(formMark) && anchor !== formMark ? formMark : '';
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
            //  What was typed, and the run's mark inside it: a server that trims or splits a name still keeps the mark.
            let needles = anchor ? [anchor, ...(ownNonce ? [ownNonce] : [])] : [];
            let shownAs = needles.length ? await visibleNeedle(needles, f.sel) : '';
            /*
             * …or, with nothing of its own to show (a booking: a car, a customer, two dates — all already on
             * the page), the row it added. The eighth live check, 2026-11-10 (L160): «Add booking» was taken,
             * its row was drawn, and «never showed outside the form» refused it four times. Proven by the count
             * of records, after the submit and again after a reload; never deleted (it carries no run mark).
             */
            let byRows = false;
            /*
             * Only with no mark of its own to look for, and only on the view the form was sent from — the
             * second review, 2026-11-11: a list filtered empty before the submit, or a reload that opens
             * on a dashboard of cards, raises the count without a record; a heading shown before that is
             * gone is another view, and proves nothing.
             */
            const sameView = async (afterReload = false) => {
                if (viewBeforeSubmit.length) {
                    const now: string[] = await page.evaluate(visibleHeadings, true).catch(() => [] as string[]);
                    return viewBeforeSubmit.every(h => now.includes(h));
                }
                /*
                 * Every heading was a form's own title, and a title that follows the form's mode or
                 * what is typed says nothing about the view. Right after the submit it is the same
                 * page; after a reload, the same view is one that still has no heading outside its
                 * forms — a reload that opens on a dashboard with headings of its own is another.
                 */
                if (!afterReload) return true;
                const now: string[] = await page.evaluate(visibleHeadings, true).catch(() => ['?'] as string[]);
                return now.length === 0;
            };
            /** The headings of the view the form was sent from that are not on the page now. */
            const missingHeadings = async (): Promise<string[]> => {
                const now: string[] = await page.evaluate(visibleHeadings, true).catch(() => [] as string[]);
                return viewBeforeSubmit.filter(h => !now.includes(h));
            };
            const rowAdded = async (afterReload = false) => !anchor && rowsBefore >= 0 && await sameView(afterReload) && await page.evaluate(recordRowCount).catch(() => -1) > rowsBefore;
            /*
             * …given the moment a list takes to come back. L160 (2026-11-10): «Create booking»
             * closed its form at once and drew the bookings table after its GET answered; looked
             * for in that instant, the booking «never showed». What was made is waited for, briefly.
             */
            const madeUntil = Date.now() + 2500;
            while (!shownAs && eyeIsOpen()) {
                if (tokensBefore.length) {
                    const made: string[] = await evalInPage(page, newRecordTokens, tokensBefore).catch(() => [] as string[]);
                    //  Beside what was typed, never instead of it (P280: the made mark was the typed name with a full stop).
                    if (made.length) { needles = [...new Set([...needles, ...made.slice(0, 6)])]; shownAs = made[0]; break; }
                }
                //  After its own marks: a mark says which record it is; a count says only that one was added.
                if (await rowAdded()) { byRows = true; shownAs = 'a new row'; break; }
                if (Date.now() >= madeUntil) break;
                await page.waitForTimeout(250).catch(() => { });
                if (anchor) shownAs = await visibleNeedle(needles, f.sel);
            }
            //  The rows after the submit, beside the rows before: a POST to a collection that grew them made a record (formEditedRecord).
            if (rowsBefore >= 0) rowsGrewOnSubmit = byRows || await page.evaluate(recordRowCount).catch(() => -1) > rowsBefore;
            /*
             * ⛔ «LOST» NEEDS PROOF THAT NOTHING WAS KEPT; WHAT THE QA COULD NOT LOOK FOR IS «NOT MEASURED».
             *
             * The exam, 2026-11-12/13 (P041, P096, P179, P189, P197, P280, P290, P499): eight sound apps were
             * refused for records they kept — a mark cut wrongly, a signed-in server asked without its
             * token, a booking that changes a row and adds none, a page searched after the QA's time had
             * run out — and each builder proved the record in his own browser after a reload, then spent
             * his remaining rounds pleasing the checker. A record is called lost only when nothing of the
             * submit was kept anywhere it could be: no write the product's server (or another origin, or a
             * redirect after a post) took, and nothing new in the browser's storage, cookies or IndexedDB.
             * Otherwise what was not found is told as not measured, with what was looked for and where.
             */
            //  A write still unanswered may yet be kept: never the proof that nothing was.
            const tookWrite = writes.kept(ownValues) > keptBeforeSubmit || writes.pending() > 0;
            //  With a mark to look for, the browser kept the record only if what it stored holds the mark; a «{}» it wrote is nothing.
            const storageMoved = !!storageBeforeSubmit && storageBeforeSubmit !== await evalInPage(page, browserKept).catch(() => '?');
            const storedSomething = storageMoved && (!needles.length || await evalInPage(page, storageHolds, needles).catch(() => true)
                //  An IndexedDB is not read here: a page that keeps one may have kept the record in it.
                || await evalInPage(page, browserHasIndexedDb).catch(() => true));
            const taken = tookWrite || storedSomething;
            const evidenceOf = (where: string) => ({ form: f.label, anchor, where, ...(needles[0] !== anchor ? { made: needles.slice(0, 3) } : {}), ...(byRows ? { by: 'rows' } : {}) });
            const unproven = (where: string) => {
                const evidence = { ...evidenceOf(where), kept: 'nothing' };
                if (f.placesOrder) {
                    metrics.ordersNotKept = Number(metrics.ordersNotKept || 0) + 1;
                    (metrics.ordersNotKeptEvidence = metrics.ordersNotKeptEvidence || []).push(evidence);
                    return;
                }
                metrics.formsPersistenceUnproven++;
                (metrics.formsPersistenceEvidence = metrics.formsPersistenceEvidence || []).push(evidence);
            };
            /** Kept somewhere, and not found again: told with the delivery, never refused (judgeBehaviour form_persistence_unmeasured). */
            const unmeasured = (where: string, more: Record<string, any> = {}) => {
                metrics.formsPersistenceUnmeasured = Number(metrics.formsPersistenceUnmeasured || 0) + 1;
                if (f.placesOrder) return;
                (metrics.formsPersistenceEvidence = metrics.formsPersistenceEvidence || []).push({
                    ...evidenceOf(where), unmeasured: true, kept: tookWrite ? 'server' : 'browser', ...more,
                });
            };
            /*
             * …and with nothing typed to look for (a form of choices: a slot, a service), a POST the
             * server answered is asked of the collection it was written to after a reload: the review
             * of 2026-11-15 — a 201 that never showed a row was «not measured» even where the server's
             * own list, asked, holds nothing at all.
             */
            const postedHere = () => writes.posted().slice(postedBeforeSubmit);
            const askable = postedHere().some(p => p.method === 'POST');
            /** Nothing of its own to look for on the page: only the server's list can say it was kept. */
            const nothingToSeek = !shownAs && !needles.length;
            //  Nothing of its own showed: with a mark to look for and a write taken, it is still looked for after a reload.
            if (!shownAs && !(taken && (needles.length || askable))) {
                if (taken) unmeasured('after submit');
                else unproven('after submit');
            } else {
                await eyes.say(page, 'أتحقق من حفظ النتيجة بعد تحديث الصفحة');
                //  What the server sends the reloaded page: a record it returns is kept, whichever view the page opens on.
                const served: string[] = [];
                /** When the reloaded page last heard from its server: while it is still being answered, it is still drawing. */
                let lastServedAt = 0;
                const onServed = async (response: any) => {
                    try {
                        if (served.length >= 40 || String(response.request().method()).toUpperCase() !== 'GET') return;
                        lastServedAt = Date.now();
                        if (new URL(response.url()).origin !== new URL(page.url()).origin) return;
                        if (!/json|text|javascript/i.test(String(response.headers()['content-type'] || ''))) return;
                        served.push(String(await response.text()).slice(0, 400_000));
                    } catch { /* a body that cannot be read says nothing */ }
                };
                try { page.on('response', onServed); } catch { /* a page without events */ }
                /*
                 * A record already sent is checked to the end: the forms budget ending in the middle of its
                 * check left a page reloaded and never searched, and «found nowhere» said of it (the exam,
                 * 2026-11-13, P179/P189/P197). Its own bounded time — a reload, a search, the server asked
                 * — once per walk at most, since no other form starts past the deadline.
                 */
                const checkUntil = Math.max(deadline, Date.now() + 9000);
                const reloaded = await page.reload({ waitUntil: 'domcontentloaded', timeout: Math.min(6000, Math.max(1, checkUntil - Date.now())) })
                    .then((response: any) => !!response && response.ok()).catch(() => false);
                /*
                 * 2.5 s, and longer while the page is still being answered (1.2 s after its last answer,
                 * 6 s at most): under load the laundry's test page fetched its record, waited 600 ms and
                 * drew it after the fixed window had closed — «never shown» for a record it kept.
                 */
                const reloadedAt = Date.now();
                const persistenceUntil = () => Math.min(checkUntil, reloadedAt + 6000, Math.max(reloadedAt + 2500, lastServedAt + 1200));
                let found = '';
                /** The reloaded page was looked at at least once: «found nowhere» is said only of a page searched. */
                let searched = false;
                do {
                    if (!reloaded || Date.now() >= persistenceUntil() || !eyeIsOpen()) break;
                    found = byRows ? (await rowAdded(true) ? 'a new row' : '') : await visibleNeedle(needles);
                    searched = true;
                    if (!found) await page.waitForTimeout(100);
                } while (!found && Date.now() < persistenceUntil() && eyeIsOpen());
                /*
                 * …and on the view it was made on. A reload of a page whose tabs are state, not
                 * addresses, opens on its first one; a tester goes back to the tab he was on and
                 * counts again. Without it a record proven by its row is found nowhere — and an
                 * app that loses it on every reload is not told from one that keeps it.
                 */
                let returnedToView = false;
                if (!found && byRows && reloaded && eyeIsOpen() && !(await sameView(true))) {
                    //  Named like what the refresh took away — never like the site's own heading, still on screen.
                    const marked: number = await page.evaluate(markViewControls, await missingHeadings()).catch(() => 0);
                    for (let i = 0; i < marked && !returnedToView && eyeIsOpen() && Date.now() < checkUntil; i++) {
                        await page.evaluate((n: number) => {
                            (document.querySelector(`[data-joe-viewback="${n}"]`) as HTMLElement | null)?.click();
                        }, i).catch(() => { });
                        //  A tab that fetches its list when opened is waited for while it is being answered.
                        const pressedAt = Date.now();
                        const backUntil = () => Math.min(checkUntil, pressedAt + 8000, Math.max(pressedAt + 3000, lastServedAt + 1200));
                        await page.waitForTimeout(300).catch(() => { });
                        while (!found && Date.now() < backUntil() && eyeIsOpen()) {
                            if (await sameView(true)) { returnedToView = true; found = await rowAdded(true) ? 'a new row' : ''; }
                            if (!found) await page.waitForTimeout(150).catch(() => { });
                        }
                    }
                    await page.evaluate(() => document.querySelectorAll('[data-joe-viewback]').forEach(el => el.removeAttribute('data-joe-viewback'))).catch(() => { });
                }
                let keptBy = found ? 'page' : '';
                /** What the server answered when its collection was asked: told with a record not found again. */
                let serverAnswered: number[] = [];
                /** The server took the write, and its own list of those records lacks this one: measured lost. */
                let lostAtServer: '' | 'empty' | 'others' = '';
                if (!found && reloaded) {
                    //  Kept by the browser: a form's own draft («draft», «autosave») is not a record.
                    const stored = await evalInPage(page, storageHolds, needles).catch(() => false);
                    if (stored) keptBy = 'storage';
                    else if (served.some(body => needles.some(n => body.includes(n)))) keptBy = 'server';
                    /*
                     * …and, still not found, asked of the server where it was written. The tenth live check,
                     * 2026-11-11 (L160, a React dashboard): a customer saved, shown, and after a reload the app
                     * opened on its summary — the customers' tab is state, not an address — and fetched only
                     * the totals. «Found nowhere», twice, for a record the server kept. A tester asks the
                     * collection it was written to (POST /api/customers → GET /api/customers; PUT …/7 → …/7
                     * and its collection), as the page itself would.
                     */
                    if (!keptBy && (needles.length || askable)) {
                        /*
                         * In order: where each write went (a POST's collection, a PUT's record); the record a
                         * POST's own answer named («{"id": 9}» → its collection's /9); where a redirect after a
                         * post sent the page (the review of 2026-11-15: a 302 was never asked); and a record's
                         * collection.
                         */
                        const asks: string[] = [];
                        const ask = (u: string) => { if (u && !asks.includes(u)) asks.push(u); };
                        const bare = (at: string) => { try { const u = new URL(at); u.search = ''; u.hash = ''; return u.href.replace(/\/+$/, ''); } catch { return ''; } };
                        const mine = postedHere();
                        /** The record a POST's own answer named, asked by its id: answered with it, it was kept. */
                        const byId: string[] = [];
                        for (const p of mine) ask(bare(p.at));
                        for (const p of mine) {
                            if (p.method !== 'POST' || !p.answer) continue;
                            try {
                                const said = JSON.parse(p.answer);
                                const own = said && typeof said === 'object' && !Array.isArray(said) ? (['data', 'item', 'record', 'result', 'entry'].map(k => said[k]).find(v => v && typeof v === 'object' && !Array.isArray(v)) || said) : null;
                                const id = own ? (own.id ?? own._id ?? own.uuid) : undefined;
                                if ((typeof id === 'string' || typeof id === 'number') && String(id).length <= 80) {
                                    const one = `${bare(p.at)}/${encodeURIComponent(String(id))}`;
                                    ask(one);
                                    byId.push(one);
                                }
                            } catch { /* an answer that is not JSON names no record */ }
                        }
                        for (const p of mine) if (p.location) { try { if (new URL(p.location).origin === new URL(p.at).origin) ask(bare(p.location)); } catch { /* not asked */ } }
                        for (const p of mine) {
                            try {
                                const u = new URL(bare(p.at));
                                const parent = u.href.replace(/\/[^/]+\/?$/, '');
                                if (parent.length > u.origin.length + 1) ask(parent);
                            } catch { /* an address that cannot be read is not asked */ }
                        }
                        /*
                         * …with the page's own credentials. The exam, 2026-11-13 (P179, P189, P197): signed-in
                         * apps keep a Bearer token in localStorage, and the QA asked their API with cookies
                         * only — 401, «found nowhere». Asked as the page asks (watchWrites auth).
                         */
                        /*
                         * The QA's own questions: a 404 they get is never the product's failed request (isExpectedRefusal) —
                         * only when asked from inside the page (the fallback below), and only for a few seconds after. The
                         * second review of 2026-11-15: kept for the rest of the walk, the product's own later GET of the
                         * same address was excused too. Asked beside the page, the browser writes nothing of it anywhere.
                         */
                        const excuseAsked = (until: number) => {
                            try {
                                if (!(page.__joeQaAskedUrls instanceof Map)) page.__joeQaAskedUrls = new Map<string, number>();
                                //  …but never the collection the page itself writes to: a 404 the page's own list gets there is the product's.
                                const own = new Set(mine.map(p => bare(p.at)));
                                for (const u of asks.slice(0, 6)) if (!own.has(u)) page.__joeQaAskedUrls.set(u.replace(/\/+$/, ''), until);
                            } catch { /* a frozen page object */ }
                        };
                        //  Bounded: an endpoint that never answers (a stream, a long poll, a handler that threw) costs 3 s, never the walk.
                        /*
                         * Asked beside the page, never from inside it: the replays of P189 and P499 (2026-11-15) —
                         * the QA's own GET of /api/users/<id> and of a POST-only /api/chat answered 404, and the
                         * browser wrote «Failed to load resource: 404» into the page's console, a blocking finding
                         * about a request the product never made. The browser context's own request client sends
                         * the page's cookies, and the page's own credentials are added (watchWrites auth).
                         */
                        const outside = async (list: string[], auth: Record<string, string>) => {
                            const out: Array<{ at: string; body: string }> = [];
                            const statuses: number[] = [];
                            for (const at of list) {
                                try {
                                    const r = await page.request.get(at, { headers: { accept: 'application/json', ...auth }, timeout: 3000, failOnStatusCode: false });
                                    const status = Number(r.status());
                                    statuses.push(status);
                                    if (status >= 200 && status < 300) out.push({ at, body: String(await r.text()).slice(0, 400_000) });
                                } catch { statuses.push(0); }
                            }
                            return { bodies: out, statuses };
                        };
                        const asked: { bodies: Array<{ at: string; body: string }>; statuses: number[] } = await Promise.race([
                            typeof page?.request?.get === 'function'
                                ? outside(asks.slice(0, 6), writes.auth()).catch(() => ({ bodies: [] as Array<{ at: string; body: string }>, statuses: [] as number[] })) :
                            (excuseAsked(Date.now() + 25_000), page.evaluate(async ({ list, auth }: { list: string[]; auth: Record<string, string> }) => {
                                const out: Array<{ at: string; body: string }> = [];
                                const statuses: number[] = [];
                                for (const at of list) {
                                    try {
                                        const r = await fetch(at, { credentials: 'same-origin', headers: { accept: 'application/json', ...auth }, signal: AbortSignal.timeout(3000) });
                                        statuses.push(r.status);
                                        if (r.ok) out.push({ at, body: (await r.text()).slice(0, 400_000) });
                                    } catch { statuses.push(0); }
                                }
                                return { bodies: out, statuses };
                            }, { list: asks.slice(0, 6), auth: writes.auth() }).catch(() => ({ bodies: [] as Array<{ at: string; body: string }>, statuses: [] as number[] }))
                                .finally(() => excuseAsked(Date.now() + 5000))),
                            new Promise<{ bodies: Array<{ at: string; body: string }>; statuses: number[] }>(resolve => setTimeout(() => resolve({ bodies: [], statuses: [] }), 12_000)),
                        ]);
                        serverAnswered = asked.statuses;
                        if (asked.bodies.some(a => needles.some(n => a.body.includes(n)))) keptBy = 'server';
                        //  The record its answer named, asked by that id, answered as a record: the server keeps it.
                        else if (asked.bodies.some(a => byId.includes(a.at) && (() => {
                            try { const x = JSON.parse(a.body); return !!x && typeof x === 'object' && !Array.isArray(x) && !('error' in x) && Object.keys(x).length > 1; } catch { return false; }
                        })())) keptBy = 'server';
                        //  …and asked, its own list lacks this record: empty, or other records and not this one (serverListVerdict).
                        //  Judged on the form's own POST: the one that carried its mark or the values it was sent with (C1, the second review).
                        else if (searched) lostAtServer = serverListVerdict(mine, asked.bodies, formMark, answeredWith, [...validValues.values()].filter(v => v.kind !== 'check').map(v => v.value));
                    }
                }
                try { page.off('response', onServed); } catch { /* the page may be gone */ }
                /*
                 * Said as it was measured, never «found nowhere» for what was not searched: a reload
                 * that failed; a row-counted record whose list could not be reached again after the
                 * reload (the page opened elsewhere, and no tab led back); or a list counted again,
                 * on its own view, with no row more than before the submit.
                 */
                if (!keptBy) {
                    const where = !reloaded ? 'reload failed'
                        : byRows && !returnedToView && !(await sameView(true)) ? 'opened elsewhere'
                        : !searched ? 'not searched'
                        //  Nothing of its own to look for: said as before, it showed nothing of its own.
                        : nothingToSeek ? 'after submit'
                        : 'after reload';
                    /*
                     * Lost only when nothing was kept anywhere — or when the server, having answered the write,
                     * lists its records under the field the QA's mark was sent in and this one is not among them
                     * (a 201 that keeps nothing). Kept somewhere and not found again is not measured.
                     */
                    if (lostAtServer && f.placesOrder) {
                        metrics.ordersNotKept = Number(metrics.ordersNotKept || 0) + 1;
                        (metrics.ordersNotKeptEvidence = metrics.ordersNotKeptEvidence || []).push({ ...evidenceOf(where), kept: 'not listed', list: lostAtServer });
                    } else if (lostAtServer) {
                        metrics.formsPersistenceUnproven++;
                        (metrics.formsPersistenceEvidence = metrics.formsPersistenceEvidence || []).push({ ...evidenceOf(where), kept: 'not listed', list: lostAtServer, asked: serverAnswered.slice(0, 6) });
                    } else if (taken) unmeasured(where, serverAnswered.length ? { asked: serverAnswered.slice(0, 6) } : {});
                    else unproven(where);
                } else {
                    metrics.formsPersisted++;
                    persistedThis = true;
                    if (keptBy !== 'page') metrics.formsPersistedOutOfView = Number(metrics.formsPersistedOutOfView || 0) + 1;
                }
                /*
                 * ⛔ THE QA DELETES ONLY WHAT CARRIES ITS OWN MARK, AND ONLY WHEN ONE RECORD CARRIES IT.
                 *
                 * The seventh live check, 2026-11-10 (L160, a car rental dashboard): a booking has no
                 * text to type, so what the submit made was found by its date, «2026-11-17» — and an
                 * earlier booking on the same dates was the first row holding it. The QA deleted
                 * booking 1, a record that was not its own, kept its own, and then reported «a record
                 * created by the QA run itself could not be deleted». On a real system that is a
                 * visitor's data gone. A record the QA made without its mark is left, and said so.
                 */
                const ownMark = [anchor, ...needles].find(n => !!n && n.includes(formMark)) || '';
                if (found && !ownMark) metrics.qaRecordsLeft = Number(metrics.qaRecordsLeft || 0) + 1;
                //  A record that was there before and was edited carries the mark too: never deleted (editedRecord).
                if (found && ownMark && editedRecord()) await tellEdit(ownMark);
                else if (found && ownMark) {
                    //  Exactly one record holds the mark, by its own button (stampOwnDelete): never a guess, never a neighbour's.
                    const deleteSelector = await page.evaluate(stampOwnDelete, { needle: ownMark, stamp: 'data-joe-qa-delete-own-record', onlyOne: true }).catch(() => '');
                    if (deleteSelector) {
                        await eyes.say(page, 'أختبر إزالة السجل الذي أنشأه الفحص فقط');
                        await page.$(deleteSelector).then((el: any) => el?.click({ timeout: 2500, force: true, noWaitAfter: true })).catch(() => { });
                        /*
                         * 1.8 s after its DELETE is answered (6 s at most): the replay of the exam's P179
                         * (2026-11-15, a signed-in React admin under load) answered «Delete» — confirm, DELETE,
                         * reload the list — after the fixed 1.8 s had closed, and «could not be deleted» refused it.
                         */
                        const pressedAt = Date.now();
                        let removed = false;
                        let answeredAt = 0;
                        while (!removed && Date.now() < pressedAt + 6000) {
                            await page.waitForTimeout(150);
                            if (writes.pending() > 0) { answeredAt = 0; continue; }
                            if (!answeredAt) answeredAt = Date.now();
                            /*
                             * Gone from the page's records — never counted in the message that says so: the replay
                             * of P179 deleted the QA's account, the page said «Account joe.qa+… deleted.», and the
                             * mark still on screen in that line was «could not be deleted».
                             */
                            removed = await page.evaluate((needle: string) => {
                                const noise = '[role="status"],[role="alert"],[aria-live],.toast,.flash,.snackbar,.notice';
                                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                                for (let n = walker.nextNode(); n; n = walker.nextNode()) {
                                    const host = n.parentElement;
                                    if (!host || !String(n.textContent || '').includes(needle)) continue;
                                    if (host.closest(noise) || host.closest('script,style,template') || !host.getClientRects().length) continue;
                                    return false;
                                }
                                return true;
                            }, ownMark).catch(() => false);
                            if (Date.now() > Math.max(pressedAt + 1800, answeredAt + 1800)) break;
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
        //  What a wrong value the product kept left behind is the QA's own: removed, never a visitor's — nor one it edited.
        if (savedInvalid && editedRecord()) await tellEdit(formMark);
        else if (savedInvalid && eyeIsOpen()) {
            const removed = await deleteOwnRecords(page, formMark, 4);
            metrics.qaRecordsDeleted += removed;
        }
        out.push({ label: f.label, fields: f.fields.length, filled: filledCount, effect, semanticFieldsTested, scope: opts?.formContext || (opts?.formScope ? opts.formScope : ''), ...(persistedThis ? { persisted: true } : {}) });
    }
    writes.stop();
    return { forms: out, metrics };
}

/* ---- judgement, on what actually happened ------------------------------ */

/** Controls that were never pressed: unreachable, declined by the product, consumed by the walk. */
const NOT_PRESSED: ReadonlySet<string> = new Set(['not found', 'declined', 'consumed', 'reached', 'current', 'idle']);

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
            //  …or a reset never given anything to undo (probeControls: «idle») — never over a press that had something to undo
            //  and still did nothing (the review of 2026-11-15: an «idle» from one walk hid a measured dead reset from another).
            || (!previous.worked && control.effect === 'idle' && !previous.fair)
            //  …and a measured dead press is the one kept, whichever walk came first.
            || (!previous.worked && !previous.fair && !control.worked && !!control.fair && !NOT_PRESSED.has(String(control.effect || '')))
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
        //  Of the same population as what was not reached (links are not pressed), and screen by screen:
        //  a screen that lost half its buttons is not diluted by the screens that kept theirs (the review of 2026-11-10).
        const buttons = judgedControls.filter(c => c.kind !== 'anchor');
        const share = buttons.length ? unreachable.length / buttons.length : 1;
        const perScreen = new Map<string, { all: number; gone: number }>();
        for (const c of buttons) {
            const s = perScreen.get(String(c.context || '')) || { all: 0, gone: 0 };
            s.all++;
            if (c.effect === 'not found') s.gone++;
            perScreen.set(String(c.context || ''), s);
        }
        const screenLost = [...perScreen.values()].some(s => s.gone >= 3 && s.gone / s.all >= 0.5);
        findings.push({
            code: 'controls_not_reached', severity: share >= 0.2 || screenLost ? 'major' : 'minor',
            ar: `لم أصل إلى ${unreachable.length} من ${buttons.length} زرّاً لأجرّبه: ${unreachable.slice(0, 3).map(d => `«${d.label}»`).join('، ')} — اختفت من الصفحة قبل الضغط، ولا أدّعي أنّها معطوبة`,
            en: `${unreachable.length} of ${buttons.length} controls were gone before I could press them: ${unreachable.slice(0, 3).map(d => `"${d.label}"`).join(', ')} — not pressed, so not judged`,
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
    /*
     * A form whose submit stayed disabled with every field filled — and with what it waits for outside
     * the form chosen, where the walk could — is told (minor): a wait for a choice the visitor makes
     * elsewhere is a design, a submit no choice enables is a bug; the builder knows which.
     */
    if (Number(metrics.formsDeclined || 0) > 0) {
        const labels = (Array.isArray(metrics.formsDeclinedEvidence) ? metrics.formsDeclinedEvidence : []).map((e: any) => String(e.label || '')).filter(Boolean).slice(0, 3);
        findings.push({
            code: 'form_submit_disabled', severity: 'minor',
            ar: `${metrics.formsDeclined} نموذج بقي زرّ إرساله معطّلاً وكل حقوله مملوءة${labels.length ? `: ${labels.map(l => `«${l}»`).join('، ')}` : ''} — إن كان ينتظر اختياراً خارج النموذج (تاريخاً أو موعداً) فليكن ظاهراً، وإلا فهو خلل`,
            en: `${metrics.formsDeclined} form(s) kept their submit disabled with every field filled${labels.length ? `: ${labels.map(l => `"${l}"`).join(', ')}` : ''} — if it waits for a choice outside the form (a date, a slot), make it plain; if not, it is a bug`,
            hint: 'enable the submit once what it needs is chosen, and say what is missing beside it',
            evidence: (Array.isArray(metrics.formsDeclinedEvidence) ? metrics.formsDeclinedEvidence : []).slice(0, 4),
        });
    }
    const deadRatio = pressable.length ? dead.length / pressable.length : 0;
    //  Where a dead control's handler may have gone: an id the page holds twice (duplicateControlIds).
    const twice: Array<{ id: string; count: number; labels?: string[] }> = (Array.isArray(metrics.duplicateIds) ? metrics.duplicateIds : [])
        .filter((d: { labels?: string[] }) => !Array.isArray(d.labels) || dead.some(x => d.labels!.includes(String(x.bare || x.label))));
    const twiceEn = twice.length ? ` — the page holds ${twice.map(d => `id="${d.id}" ${d.count} times`).join(', ')}: code that finds an element by its id gets the first, which may be a hidden screen's copy; give each screen's controls their own ids, or look them up inside their own screen` : '';
    const twiceAr = twice.length ? ` — في الصفحة ${twice.map(d => `المعرّف «${d.id}» ${d.count} مرات`).join('، ')}: الشيفرة التي تبحث عن عنصر بمعرّفه تجد الأول، وقد يكون نسخة شاشة مخفية؛ أعطِ أزرار كل شاشة معرّفات خاصة بها، أو ابحث عنها داخل شاشتها` : '';
    if (dead.length >= 2 && deadRatio >= 0.4) {
        findings.push({
            code: 'dead_controls', severity: 'critical',
            ar: `${dead.length} من ${pressable.length} أزرار لا تفعل شيئًا عند الضغط: ${dead.slice(0, 3).map(d => `«${d.label}»`).join('، ')}${twiceAr}`,
            en: `${dead.length} of ${pressable.length} controls do nothing when clicked: ${dead.slice(0, 3).map(d => `"${d.label}"`).join(', ')}${twiceEn}`,
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
            ar: `أزرار لا تستجيب: ${dead.slice(0, 3).map(d => `«${d.label}»`).join('، ')}${twiceAr}`,
            en: `Unresponsive controls: ${dead.slice(0, 3).map(d => `"${d.label}"`).join(', ')}${twiceEn}`,
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
            //  What the QA could not reach is told, never a refusal (the exam, 2026-11-12/13: P094, P195 refused on it alone).
            code: 'forms_not_reached', severity: 'minor',
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
    const minorCases = caseFailures.filter(x => x.outcome === 'accepted_at_input' || x.outcome === 'refused_silently' || x.outcome === 'refused_on_screen');
    const minorAr = (x: any) => x.outcome === 'refused_silently' ? `«${x.field}» رفض «${x.value}» دون أن يقول للزائر لماذا`
        : x.outcome === 'refused_on_screen' ? `«${x.form}»: ${x.ar}` : `«${x.field}» قبِل عند الكتابة: ${x.ar}`;
    const minorEn = (x: any) => x.outcome === 'refused_silently' ? `"${x.field}" refused "${x.value}" without telling the visitor why`
        : x.outcome === 'refused_on_screen' ? `"${x.form}": ${x.en}` : `"${x.field}" took at input: ${x.en}`;
    if (minorCases.length) findings.push({
        code: 'field_case_minor', severity: 'minor',
        ar: `${minorCases.length} حالة تحقّق ضعيفة في الحقول: ${minorCases.slice(0, 4).map(minorAr).join('، ')}`,
        en: `${minorCases.length} weak field check(s): ${minorCases.slice(0, 4).map(minorEn).join('; ')}`,
        hint: 'tell the visitor what is wrong beside the field, and refuse what the field\'s meaning forbids',
        evidence: minorCases,
    });
    if ((metrics.formsPersistenceUnproven || 0) > 0) {
        /*
         * Said as it was measured: a form whose work never showed is not a form
         * whose work «appeared temporarily» (L162: Joe was told the second and
         * the first was true, and mended what was not broken).
         */
        //  Only what was measured lost: a record kept somewhere and not found again is told below, never here.
        const evidence: any[] = (Array.isArray(metrics.formsPersistenceEvidence) ? metrics.formsPersistenceEvidence : []).filter((x: any) => !x?.unmeasured);
        const neverShown = evidence.filter(x => x?.where === 'after submit');
        //  Counted, not searched: a record with nothing of its own to look for was a row more, and after the refresh it was not.
        const counted = evidence.filter(x => x?.where === 'after reload' && x?.by === 'rows');
        const gone = evidence.filter(x => x?.where === 'after reload' && x?.by !== 'rows');
        //  Not counted at all: the refresh opened on another view, and no tab or link led back to the list.
        const elsewhere = evidence.filter(x => x?.where === 'opened elsewhere');
        const unreloaded = evidence.filter(x => x?.where === 'reload failed');
        //  Shown, and the QA's time ran out before the reloaded page was searched: lost all the same, since nothing was kept.
        const unsearched = evidence.filter(x => x?.where === 'not searched');
        const parts = { ar: [] as string[], en: [] as string[] };
        if (unsearched.length) {
            parts.ar.push(`ظهر ما صنعه ${unsearched.map(x => `«${x.form}»`).join('، ')}، ولم يُبحث عنه بعد التحديث لنفاد وقت الفحص`);
            parts.en.push(`what ${unsearched.map(x => `"${x.form}"`).join(', ')} made showed, and the QA's time ran out before the refreshed page was searched`);
        }
        if (elsewhere.length) {
            parts.ar.push(`أضاف ${elsewhere.map(x => `«${x.form}»`).join('، ')} صفاً، وبعد تحديث الصفحة فُتحت على عرض آخر ولم يوصل إليه أي تبويب أو رابط، فلم يُعدّ ما أُضيف`);
            parts.en.push(`${elsewhere.map(x => `"${x.form}"`).join(', ')} added a row, and after a refresh the page opened on another view that no tab or link led back from, so what was added could not be counted`);
        }
        if (unreloaded.length) {
            parts.ar.push(`أُرسل ${unreloaded.map(x => `«${x.form}»`).join('، ')}، ولم تُفتح الصفحة من جديد عند تحديثها، فلم يُتحقق من بقاء ما صنعه`);
            parts.en.push(`${unreloaded.map(x => `"${x.form}"`).join(', ')} was sent, and the page did not open again when refreshed, so what it made could not be checked`);
        }
        if (neverShown.length) {
            //  A form of choices typed nothing: there is no text of the QA's to name (the review of 2026-11-15).
            const typed = neverShown.filter(x => !!x.anchor);
            parts.ar.push(`أُرسل ${neverShown.map(x => `«${x.form}»`).join('، ')} وقَبِله، ولم يظهر خارج النموذج ما صنعه: ${typed.length ? `لا ما كتبه الفحص (${typed.map(x => `«${x.anchor}»`).join('، ')}) ولا سجلّ جديد` : 'لا سجلّ جديد'}`);
            parts.en.push(`${neverShown.map(x => `"${x.form}"`).join(', ')} was sent and the page accepted it, and what it made never showed outside the form: ${typed.length ? `neither what the QA typed (${typed.map(x => `"${x.anchor}"`).join(', ')}) nor a new record` : 'no new record'}`);
        }
        //  The proof the refusal stands on, said once: the submit kept nothing anywhere a reload could bring back.
        const keptNothing = evidence.length > 0 && evidence.every(x => x?.kept === 'nothing');
        if (gone.length) {
            parts.ar.push(`ظهر ما صنعه ${gone.map(x => `«${x.form}»`).join('، ')}، وبعد تحديث الصفحة لم يُعثر عليه: لا في الصفحة ولا في تخزين المتصفح ولا فيما أعاده الخادم`);
            parts.en.push(`what ${gone.map(x => `"${x.form}"`).join(', ')} made showed, and after a refresh it was found nowhere: not on the page, not in the browser's storage, not in what the server sent back`);
        }
        if (counted.length) {
            parts.ar.push(`أضاف ${counted.map(x => `«${x.form}»`).join('، ')} صفاً إلى القائمة، وبعد تحديث الصفحة عادت القائمة نفسها بعدد صفوفها الذي كان قبل الإرسال`);
            parts.en.push(`${counted.map(x => `"${x.form}"`).join(', ')} added a row to the list, and after a refresh the same list was back to the rows it had before the submit`);
        }
        //  Asked again, the collection it was written to holds nothing at all: the commonest «201 that keeps nothing».
        const listedEmpty = evidence.filter(x => x?.kept === 'not listed' && x?.list === 'empty');
        if (listedEmpty.length) {
            parts.ar.push(`وقَبِل الخادم كتابة ${listedEmpty.map(x => `«${x.form}»`).join('، ')}، ثم حين سُئلت المجموعة التي كُتب إليها بصلاحيات الصفحة نفسها أعادت قائمة فارغة`);
            parts.en.push(`the server answered the write of ${listedEmpty.map(x => `"${x.form}"`).join(', ')}, and asked again with the page's own credentials, the collection it was written to returned an empty list`);
        }
        const notListed = evidence.filter(x => x?.kept === 'not listed' && x?.list !== 'empty');
        if (notListed.length) {
            parts.ar.push(`وقَبِل الخادم كتابة ${notListed.map(x => `«${x.form}»`).join('، ')}، ثم حين سُئل عن قائمتها بصلاحيات الصفحة نفسها أعاد سجلات أخرى بالحقل نفسه وليس هذا السجل بينها`);
            parts.en.push(`the server answered the write of ${notListed.map(x => `"${x.form}"`).join(', ')}, and asked again for its list with the page's own credentials, it returned other records under the same field and not this one`);
        }
        if (keptNothing) {
            parts.ar.push('ولم يُكتب منه شيء إلى أي خادم ولا في تخزين المتصفح، فلا يبقى بعد التحديث');
            parts.en.push('and nothing of it was written to any server or kept in the browser\'s storage, so a refresh loses it');
        }
        findings.push({
            code: 'form_persistence_unproven', severity: 'major',
            ar: parts.ar.join('؛ ') || `${metrics.formsPersistenceUnproven} نتيجة نموذج لم يثبت بقاؤها بعد تحديث الصفحة`,
            en: parts.en.join('; ') || `${metrics.formsPersistenceUnproven} form result(s) could not be proven to survive a page refresh`,
            hint: neverShown.length && !gone.length && !counted.length && !elsewhere.length && !unreloaded.length
                ? 'after a successful submit, show what it made outside the form — the new row, card or entry with what was entered — and keep it'
                : elsewhere.length && !gone.length && !counted.length
                    ? 'keep the view a visitor was on across a refresh (give each tab its own address, e.g. #orders, and open it from location.hash), and render the kept records there'
                    : 'persist the created record and render it again after reload; do not treat a transient success message as saved work',
            ...(evidence.length ? { evidence: evidence.slice(0, 6) } : {}),
        });
    }
    /*
     * Kept somewhere — a write the server took, something the browser stored — and not found again
     * by the QA: not measured, told with the delivery, never a refusal (probeForms, «lost needs proof»).
     */
    const unmeasured: any[] = (Array.isArray(metrics.formsPersistenceEvidence) ? metrics.formsPersistenceEvidence : []).filter((x: any) => !!x?.unmeasured);
    if (unmeasured.length) {
        const why = (x: any, ar: boolean) => {
            const where = String(x?.where || '');
            const asked = Array.isArray(x?.asked) && x.asked.length ? (ar ? `، وأجاب الخادم حين سُئل: ${x.asked.join('، ')}` : `; the server answered ${x.asked.join(', ')} when asked`) : '';
            if (where === 'after submit') return ar ? 'لم يظهر منه شيء خاص به أبحث عنه' : 'it showed nothing of its own to look for';
            if (where === 'not searched') return ar ? 'نفد وقت الفحص قبل البحث عنه بعد التحديث' : 'the QA\'s time ran out before the refreshed page was searched';
            if (where === 'reload failed') return ar ? 'لم تُفتح الصفحة من جديد عند التحديث' : 'the page did not open again when refreshed';
            if (where === 'opened elsewhere') return ar ? 'فُتحت الصفحة بعد التحديث على عرض آخر لم يوصل إليه رابط' : 'after a refresh the page opened on another view no link led back from';
            return (ar ? 'لم أجده بعد التحديث في الصفحة ولا في تخزين المتصفح ولا فيما أعاده الخادم' : 'after a refresh I did not find it on the page, in the browser\'s storage, or in what the server sent') + asked;
        };
        const kept = (x: any, ar: boolean) => x?.kept === 'browser' ? (ar ? 'حفظ المتصفح شيئاً' : 'the browser stored something') : (ar ? 'قبِل الخادم الكتابة' : 'the server took the write');
        findings.push({
            code: 'form_persistence_unmeasured', severity: 'minor',
            ar: `لم يُقَس بقاء ما صنعه ${unmeasured.slice(0, 3).map(x => `«${x.form}» (${kept(x, true)}، و${why(x, true)})`).join('؛ ')} — لا أعدّه ضائعاً`,
            en: `not measured whether what ${unmeasured.slice(0, 3).map(x => `"${x.form}" made survives a refresh (${kept(x, false)}, and ${why(x, false)})`).join('; ')} — not judged lost`,
            hint: 'show the kept record where a visitor finds it again after a refresh — the new row or card, with what was entered — so it can be seen, not only stored',
            evidence: unmeasured.slice(0, 6),
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
