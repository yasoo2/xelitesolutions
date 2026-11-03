/**
 * FILTERING, SEARCH AND SORTING ARE BEHAVIOUR, SO THEY ARE MEASURED ON THE PAGE.
 *
 * The 500-prompt exam, 2026-11-03. Three interactive reports were refused four
 * times each with «artifact coverage — missing: filtering» (P352, P353, P354).
 * In every one the filter worked: a period <select>, two date inputs, each
 * change re-drawing the charts and the totals from `records.filter(...)`. The
 * scope audit reads source text, and its filter evidence wanted a variable
 * whose name ends in «Filter» (or set…Category, activeRange …). The builders,
 * told only «missing: filtering», added a filtering.js, then a README that
 * describes the filtering, then gave up. A capability that is behaviour was
 * judged by what its variables are called.
 *
 * A name list cannot be repaired by growing it: «any .filter( beside any
 * input» passes a delete handler next to an add form, which is the false
 * «built» the scope audit exists to refuse. So when the source does not show
 * the capability, Joe operates the live page the way the user would and
 * watches the data the page shows:
 *
 *   - filtering: changing a <select>, a date/month/range/number input, a
 *     checkbox or radio, or a text box changes the data shown (the repeated
 *     items, the numbers, a chart) — not merely its order; a button counts
 *     only when it narrows the items or changes the numbers and charts while
 *     the page's frame (its headings and controls) stays the same, so a tab
 *     that swaps the view is not a filter;
 *   - search: typing into a text box narrows the items (or empties them);
 *   - sorting: choosing an option or pressing a column header reorders the
 *     same items.
 *
 * A change that needs an «Apply» press is tried with the nearest button of the
 * control's form. Nothing is inferred: what was operated and what changed is
 * the evidence, and when nothing changed the builder is told what was tried.
 */
import { getChromiumLaunchOptions } from '../../modules/browser/manager';

export type InteractiveCapability = 'search' | 'filtering' | 'sorting';
export const INTERACTIVE_CAPABILITIES: readonly InteractiveCapability[] = ['search', 'filtering', 'sorting'];

export interface InteractionEvidence {
    capability: InteractiveCapability;
    ok: boolean;
    /** What was operated and what changed — or what was tried and stayed the same. */
    detail: string;
    /** Controls operated for this capability. */
    tried: number;
}

export interface InteractionMeasurement {
    /** False when the page could not be opened at all: nothing was measured. */
    measured: boolean;
    results: InteractionEvidence[];
    error?: string;
}

interface Snapshot {
    items: string[];
    numbers: string[];
    charts: string[];
    frame: string;
}

interface Candidate {
    id: string;
    kind: 'select' | 'date' | 'month' | 'week' | 'datetime-local' | 'range' | 'number' | 'toggle' | 'text' | 'chip' | 'header';
    label: string;
    options: string[];
    min: string;
    max: string;
}

/**
 * In-page helpers, plain JavaScript (no compiled helper reaches the browser):
 * `visible`, `clean`, and `collection()` — the elements of the largest group
 * of same-kind siblings that carry text: the rows, cards or items the page shows.
 */
const PAGE_HELPERS = `
  const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const clean = t => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, 200);
  const collection = () => {
    let best = [];
    for (const parent of document.querySelectorAll('body *')) {
      if (parent.closest('select, script, style, head')) continue;
      const groups = new Map();
      for (const child of parent.children) {
        if (/^(SCRIPT|STYLE|OPTION|BR|SELECT|INPUT|BUTTON|LABEL)$/.test(child.tagName) || !visible(child)) continue;
        if (!clean(child.innerText)) continue;
        const key = child.tagName + '.' + String(child.className || '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(child);
      }
      // A row of boxes that mostly hold a field to fill is the form's layout,
      // not the data: P352 (2026-11-03) wrapped its period select and two
      // date inputs in three div.field boxes, and the probe took them for the
      // items and set aside the very controls it had to operate.
      const fieldBox = el => !!el.querySelector('select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])');
      for (const g of groups.values()) {
        if (g.length < 2 || g.length <= best.length) continue;
        if (g.filter(fieldBox).length * 2 >= g.length) continue;
        best = g;
      }
    }
    return best;
  };
`;

/**
 * What the page shows. «mark» finds the collection and marks its container;
 * «follow» reads the same container's items again, so one row left after a
 * search is read as one row — not as the table's two headers, which became
 * the largest group once the rows were gone.
 */
const PAGE_SNAPSHOT = `(mode => {${PAGE_HELPERS}
  const keyOf = c => c.tagName + '.' + String(c.className || '');
  const anchor = mode === 'follow' ? document.querySelector('[data-joe-coll]') : null;
  let els;
  if (anchor) {
    const key = anchor.getAttribute('data-joe-coll');
    els = Array.from(anchor.children).filter(c => keyOf(c) === key && visible(c) && clean(c.innerText));
  } else {
    for (const old of document.querySelectorAll('[data-joe-coll]')) old.removeAttribute('data-joe-coll');
    els = collection();
    if (els.length && els[0].parentElement) els[0].parentElement.setAttribute('data-joe-coll', keyOf(els[0]));
  }
  const best = els.map(el => clean(el.innerText));
  const body = document.body ? document.body.innerText : '';
  const numbers = (body.match(/[0-9\\u0660-\\u0669][0-9\\u0660-\\u0669.,٬٫%]*/g) || []).slice(0, 400);
  const charts = [];
  for (const c of document.querySelectorAll('canvas')) {
    if (!visible(c)) continue;
    try { const d = c.toDataURL(); let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d.charCodeAt(i)) | 0; charts.push('c' + d.length + ':' + h); } catch (e) { charts.push('c?'); }
  }
  for (const s of document.querySelectorAll('svg')) {
    if (!visible(s) || s.querySelectorAll('rect, path, circle, line, polyline, polygon').length < 3) continue;
    const d = s.innerHTML; let h = 0; for (let i = 0; i < d.length; i += 3) h = (h * 31 + d.charCodeAt(i)) | 0; charts.push('s' + d.length + ':' + h);
  }
  const frame = Array.from(document.querySelectorAll('h1, h2, h3, h4, label, legend, th'))
    .filter(visible).map(e => clean(e.innerText)).join('|') + '#' + document.querySelectorAll('select, input, textarea').length;
  return { items: best.slice(0, 300), numbers, charts, frame };
})`;

/**
 * Marks every candidate control with data-joe-ip and describes it. A control
 * inside one of the shown items (its delete button, its «done» checkbox) acts
 * on that item, not on the collection: it is never a candidate.
 */
const PAGE_CANDIDATES = `(() => {${PAGE_HELPERS}
  const items = collection();
  const inItem = el => items.some(it => it.contains(el));
  const labelOf = el => {
    const byFor = el.id ? document.querySelector('label[for="' + CSS.escape(el.id) + '"]') : null;
    const wrap = el.closest('label');
    // A button is called what it says; its id is the last resort («resetBtn» told the builder nothing).
    const own = /^(BUTTON|TH|A)$/.test(el.tagName) || el.getAttribute('role') ? el.innerText : '';
    return clean(el.getAttribute('aria-label') || (byFor && byFor.innerText) || (wrap && wrap.innerText) || el.getAttribute('placeholder') || own || el.getAttribute('name') || el.id || el.innerText || el.value).slice(0, 60);
  };
  const out = [];
  let n = 0;
  const add = (el, kind, extra) => {
    if (out.length >= 24 || inItem(el)) return;
    el.setAttribute('data-joe-ip', String(++n));
    out.push(Object.assign({ id: String(n), kind, label: labelOf(el) || kind, options: [], min: el.getAttribute('min') || '', max: el.getAttribute('max') || '' }, extra || {}));
  };
  for (const el of document.querySelectorAll('select')) {
    if (!visible(el) || el.disabled) continue;
    const options = Array.from(el.options).filter(o => !o.disabled).map(o => o.value);
    if (options.length >= 2) add(el, 'select', { options });
  }
  for (const el of document.querySelectorAll('input')) {
    if (!visible(el) || el.disabled || el.readOnly) continue;
    const t = (el.getAttribute('type') || 'text').toLowerCase();
    if (['date', 'month', 'week', 'datetime-local', 'range', 'number'].includes(t)) add(el, t);
    else if (t === 'checkbox' || t === 'radio') add(el, 'toggle');
    else if (t === 'text' || t === 'search') add(el, 'text');
  }
  for (const parent of document.querySelectorAll('body *')) {
    const buttons = Array.from(parent.children).filter(c => (c.tagName === 'BUTTON' || c.getAttribute('role') === 'button' || c.getAttribute('role') === 'tab')
      && visible(c) && !c.disabled && (c.getAttribute('type') || '').toLowerCase() !== 'submit' && clean(c.innerText).length > 0 && clean(c.innerText).length <= 24);
    if (buttons.length < 2) continue;
    for (const b of buttons.slice(0, 6)) if (!b.hasAttribute('data-joe-ip')) add(b, 'chip');
  }
  for (const th of document.querySelectorAll('th')) if (visible(th) && clean(th.innerText)) add(th, 'header');
  return out;
})()`;

/**
 * The «apply» of a control: the submit button of its own form, and nothing
 * else. A nearby button is not an apply — on P352 the nearest one was «load
 * sample data», which changes the data by itself and would have credited the
 * select beside it with a filter.
 */
const PAGE_APPLY = `(id => {
  const el = document.querySelector('[data-joe-ip="' + id + '"]');
  if (!el) return '';
  const form = el.closest('form');
  if (!form) return '';
  // A form with a box to type into is an entry form: its submit adds a record.
  const entry = Array.from(form.querySelectorAll('textarea, input')).some(i => i !== el && !i.disabled
    && ['text', 'email', 'tel', 'url', 'password', 'number', ''].includes((i.getAttribute('type') || '').toLowerCase()));
  if (entry) return '';
  const b = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  if (!b || b.disabled) return '';
  b.setAttribute('data-joe-apply', '1');
  return String(b.innerText || b.value || 'apply').trim().slice(0, 40);
})`;

const counts = (list: string[]) => {
    const m = new Map<string, number>();
    for (const x of list) m.set(x, (m.get(x) || 0) + 1);
    return m;
};

/** Same items, in another order. */
export function reordered(a: string[], b: string[]): boolean {
    if (a.length < 2 || a.length !== b.length || a.join('\u0001') === b.join('\u0001')) return false;
    const ca = counts(a), cb = counts(b);
    return Array.from(ca).every(([k, v]) => cb.get(k) === v);
}

/** Fewer items, every one of them shown before (none left counts). */
export function narrowed(a: string[], b: string[]): boolean {
    if (!a.length || b.length >= a.length) return false;
    const ca = counts(a);
    for (const [k, v] of counts(b)) if ((ca.get(k) || 0) < v) return false;
    return true;
}

const sameMultiset = (a: string[], b: string[]) => a.length === b.length && reorderedOrSame(a, b);
function reorderedOrSame(a: string[], b: string[]): boolean {
    const ca = counts(a), cb = counts(b);
    return ca.size === cb.size && Array.from(ca).every(([k, v]) => cb.get(k) === v);
}

/** What changes on the page by itself (a clock, an animation): never evidence. */
export interface Noise { items: boolean; numbers: boolean; charts: boolean }
const QUIET: Noise = { items: false, numbers: false, charts: false };

/** Did the data shown change — not merely its order, and not what moves by itself? */
export function dataChanged(before: Snapshot, after: Snapshot, noise: Noise = QUIET): string {
    if (!noise.items && narrowed(before.items, after.items)) return `the items shown went from ${before.items.length} to ${after.items.length}`;
    if (!noise.items && !sameMultiset(before.items, after.items)) return `the items shown changed (${before.items.length} → ${after.items.length})`;
    if (!noise.numbers && !sameMultiset(before.numbers, after.numbers)) return 'the numbers on the page changed';
    if (!noise.charts && before.charts.join() !== after.charts.join()) return 'a chart was redrawn with other data';
    return '';
}

/**
 * What typing must change: the items shown or a chart. A number alone is not
 * a search — a «12/100» counter beside a message box changes with every key.
 */
export function typedChange(before: Snapshot, after: Snapshot, noise: Noise = QUIET): string {
    return dataChanged(before, after, { ...noise, numbers: true });
}

const sameSnap = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

function valuesFor(c: Candidate): string[] {
    const far: Record<string, [string, string]> = {
        date: ['2099-12-31', '1990-01-01'],
        month: ['2099-12', '1990-01'],
        week: ['2099-W52', '1990-W01'],
        'datetime-local': ['2099-12-31T23:59', '1990-01-01T00:00'],
    };
    if (far[c.kind]) return [c.max || far[c.kind][0], c.min || far[c.kind][1]];
    if (c.kind === 'number' || c.kind === 'range') return [c.max || '999999', c.min || '0'];
    return [];
}

/** A word some items carry and others do not: typing it should narrow the list. */
function searchTerms(items: string[]): string[] {
    const words = new Map<string, number>();
    for (const item of items) {
        for (const w of new Set(item.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter(x => x.length >= 3 && !/^\d+$/.test(x)))) {
            words.set(w, (words.get(w) || 0) + 1);
        }
    }
    const partial = Array.from(words).filter(([, n]) => n >= 1 && n < items.length).sort((a, b) => b[1] - a[1]).map(([w]) => w);
    return [...partial.slice(0, 2), 'zzqxjv'];
}

/**
 * Operate the live page and report, for each wanted capability, whether the
 * data it shows answered. Bounded by `timeoutMs`; a page that cannot be opened
 * is «not measured», never «absent».
 */
export async function measureInteractions(
    url: string,
    wanted: InteractiveCapability[],
    opts: { timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<InteractionMeasurement> {
    const want = Array.from(new Set(wanted.filter(w => INTERACTIVE_CAPABILITIES.includes(w))));
    if (!want.length || !url) return { measured: false, results: [] };
    const deadline = Date.now() + Math.max(5_000, opts.timeoutMs ?? 45_000);
    const left = () => deadline - Date.now();
    const stopped = () => left() <= 0 || opts.signal?.aborted === true;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { chromium } = require('playwright');
    let browser: any;
    try {
        browser = await chromium.launch({ ...getChromiumLaunchOptions(), headless: true });
    } catch (e: any) {
        return { measured: false, results: [], error: `the browser could not start: ${String(e?.message || e).slice(0, 200)}` };
    }
    const found = new Map<InteractiveCapability, string>();
    const tried = new Map<InteractiveCapability, string[]>();
    const note = (cap: InteractiveCapability, what: string) => {
        if (!tried.has(cap)) tried.set(cap, []);
        tried.get(cap)!.push(what);
    };
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        page.setDefaultTimeout(4_000);
        const open = async () => {
            await page.goto(url, { waitUntil: 'load', timeout: Math.min(15_000, Math.max(3_000, left())) });
            await page.waitForTimeout(500);
        };
        try { await open(); } catch (e: any) {
            return { measured: false, results: [], error: `the page did not open: ${String(e?.message || e).slice(0, 200)}` };
        }
        const snap = async (mode: 'mark' | 'follow' = 'follow'): Promise<Snapshot> => page.evaluate(`(${PAGE_SNAPSHOT})(${JSON.stringify(mode)})`);
        /** A snapshot of the page once it stops moving (bounded); what keeps moving is noise. */
        let noise: Noise = { ...QUIET };
        const steady = async (mode: 'mark' | 'follow' = 'follow'): Promise<Snapshot> => {
            let last = await snap(mode);
            for (let i = 0; i < 6 && !stopped(); i++) {
                await page.waitForTimeout(300);
                const next = await snap();
                if (sameSnap(last, next)) return next;
                noise = {
                    items: noise.items || !sameMultiset(last.items, next.items),
                    numbers: noise.numbers || !sameMultiset(last.numbers, next.numbers),
                    charts: noise.charts || last.charts.join() !== next.charts.join(),
                };
                last = next;
            }
            return last;
        };
        const settle = () => page.waitForTimeout(150);
        let candidates: Candidate[] = await page.evaluate(PAGE_CANDIDATES);
        let dirty = false;
        const fresh = async () => {
            if (!dirty) return;
            await open();
            candidates = await page.evaluate(PAGE_CANDIDATES);
            dirty = false;
        };
        const at = (c: Candidate) => page.locator(`[data-joe-ip="${c.id}"]`).first();
        /** Operate, then compare; if nothing changed, try the control's «apply». */
        const attempt = async (c: Candidate, act: () => Promise<void>, judge: (b: Snapshot, a: Snapshot) => string): Promise<string> => {
            const before = await steady('mark');
            dirty = true;
            try { await act(); } catch { return ''; }
            await settle();
            // A list that grew was added to (an Enter in an entry form submits it), never filtered.
            const first = await steady();
            let verdict = first.items.length > before.items.length ? '' : judge(before, first);
            if (verdict) return verdict;
            const apply = String(await page.evaluate(`(${PAGE_APPLY})(${JSON.stringify(c.id)})`).catch(() => '') || '');
            if (apply) {
                await page.locator('[data-joe-apply="1"]').first().click().catch(() => { });
                await settle();
                // A list that grew was added to, not filtered.
                const after = await steady();
                verdict = after.items.length > before.items.length ? '' : judge(before, after);
                if (verdict) return `${verdict} (after pressing «${apply}»)`;
            }
            return '';
        };
        const byLabel = (c: Candidate) => `«${c.label}» (${c.kind === 'toggle' ? 'checkbox' : c.kind === 'chip' ? 'button' : c.kind === 'header' ? 'column header' : c.kind})`;

        for (const cap of want) {
            const kinds: Candidate['kind'][] = cap === 'search' ? ['text']
                : cap === 'sorting' ? ['select', 'header', 'chip']
                    : ['select', 'date', 'month', 'week', 'datetime-local', 'range', 'number', 'toggle', 'text', 'chip'];
            const ids = candidates.filter(c => kinds.includes(c.kind)).map(c => c.id);
            for (const id of ids) {
                if (found.has(cap) || stopped()) break;
                await fresh();
                const c = candidates.find(x => x.id === id);
                if (!c) continue;
                note(cap, byLabel(c));
                let verdict = '';
                if (cap === 'sorting') {
                    const order = (b: Snapshot, a: Snapshot) => !noise.items && reordered(b.items, a.items) ? `the same ${a.items.length} items were reordered` : '';
                    if (c.kind === 'select') {
                        const current = await at(c).inputValue().catch(() => '');
                        for (const v of c.options.filter(o => o !== current).slice(0, 5)) {
                            if (verdict || stopped()) break;
                            verdict = await attempt(c, () => at(c).selectOption(v), order);
                            if (verdict) verdict = `choosing «${v}» in ${byLabel(c)}: ${verdict}`;
                        }
                    } else {
                        verdict = await attempt(c, () => at(c).click(), order);
                        if (verdict) verdict = `pressing ${byLabel(c)}: ${verdict}`;
                    }
                } else if (cap === 'search' || c.kind === 'text') {
                    const before = await steady('mark');
                    for (const term of searchTerms(before.items)) {
                        if (verdict || stopped()) break;
                        verdict = await attempt(c, async () => {
                            await at(c).fill(term);
                            await page.waitForTimeout(150);
                            await at(c).press('Enter').catch(() => { });
                        }, (b, a) => typedChange(b, a, noise));
                        if (verdict) verdict = `typing «${term}» into ${byLabel(c)}: ${verdict}`;
                        await at(c).fill('').catch(() => { });
                    }
                } else if (c.kind === 'select') {
                    const current = await at(c).inputValue().catch(() => '');
                    for (const v of c.options.filter(o => o !== current).slice(0, 5)) {
                        if (verdict || stopped()) break;
                        verdict = await attempt(c, () => at(c).selectOption(v), (b, a) => dataChanged(b, a, noise));
                        if (verdict) verdict = `choosing «${v}» in ${byLabel(c)}: ${verdict}`;
                    }
                } else if (c.kind === 'toggle') {
                    verdict = await attempt(c, () => at(c).click(), (b, a) => dataChanged(b, a, noise));
                    if (verdict) verdict = `ticking ${byLabel(c)}: ${verdict}`;
                } else if (c.kind === 'chip') {
                    verdict = await attempt(c, () => at(c).click(), (b, a) => {
                        if (!noise.items && narrowed(b.items, a.items)) return `the items shown went from ${b.items.length} to ${a.items.length}`;
                        if (b.frame !== a.frame) return '';
                        return sameMultiset(b.items, a.items) ? dataChanged(b, a, noise) : '';
                    });
                    if (verdict) verdict = `pressing ${byLabel(c)}: ${verdict}`;
                } else {
                    for (const v of valuesFor(c)) {
                        if (verdict || stopped()) break;
                        verdict = await attempt(c, () => at(c).fill(v), (b, a) => dataChanged(b, a, noise));
                        if (verdict) verdict = `setting ${byLabel(c)} to ${v}: ${verdict}`;
                    }
                }
                if (verdict) found.set(cap, verdict);
            }
        }
    } catch (e: any) {
        // A page that broke mid-measurement leaves what was already seen.
        if (!found.size) return { measured: false, results: [], error: `the page could not be operated: ${String(e?.message || e).slice(0, 200)}` };
    } finally {
        await browser.close().catch(() => { });
    }
    return {
        measured: true,
        results: want.map(cap => {
            const ops = tried.get(cap) || [];
            if (found.has(cap)) return { capability: cap, ok: true, detail: `on the live page, ${found.get(cap)}`, tried: ops.length };
            return {
                capability: cap,
                ok: false,
                tried: ops.length,
                detail: ops.length
                    ? `on the live page I operated ${ops.length} control(s) — ${ops.slice(0, 5).join(', ')} — and the data shown never ${cap === 'sorting' ? 'changed order' : 'changed'}`
                    : `the live page has no control ${cap === 'search' ? 'to type a search into' : cap === 'sorting' ? 'that sorts' : 'that filters'} (no select, date, range, checkbox or text box${cap === 'sorting' ? ', no column header' : ''})`,
            };
        }),
    };
}

/** The scope gate's verdict, as applyScopeAuditOutcome returns it. */
export interface ScopeVerdict {
    verified: boolean;
    liveUrl: string;
    verificationFailed: boolean;
    error?: string;
    scopeAudit: { requested: number; built: number; coverage: number; missing: string[] };
    scopeCoverageFailed?: boolean;
}

/** The interactive capabilities among those the scope audit could not find in the source. */
export function interactiveMissing(missing: string[]): InteractiveCapability[] {
    return missing.filter((m): m is InteractiveCapability => (INTERACTIVE_CAPABILITIES as readonly string[]).includes(m));
}

/**
 * The scope verdict once the page was operated: a capability the page showed
 * is built; one it did not show stays missing, with what was tried.
 */
export function reconcileScope<T extends ScopeVerdict>(scoped: T, measured: InteractionMeasurement): T & { interactions?: InteractionEvidence[] } {
    const audit = scoped.scopeAudit;
    if (!scoped.scopeCoverageFailed || !audit) return scoped;
    const shown = new Set(measured.results.filter(r => r.ok).map(r => r.capability as string));
    const missing = audit.missing.filter(m => !shown.has(m));
    const built = audit.built + (audit.missing.length - missing.length);
    const coverage = audit.requested ? built / audit.requested : 1;
    const scopeAudit = { ...audit, built, coverage, missing };
    if (!missing.length) {
        return { ...scoped, verified: true, verificationFailed: false, error: undefined, scopeAudit, scopeCoverageFailed: false, interactions: measured.results };
    }
    const why = measured.measured
        ? measured.results.filter(r => !r.ok && missing.includes(r.capability)).map(r => `${r.capability}: ${r.detail}`)
        : interactiveMissing(missing).length ? [`not measured on the live page: ${measured.error || 'the page could not be opened'}`] : [];
    return {
        ...scoped,
        error: `artifact coverage ${Math.round(coverage * 100)}% — missing: ${missing.slice(0, 8).join(', ')}${why.length ? ` — ${why.join(' | ')}` : ''}`,
        scopeAudit,
        interactions: measured.results,
    };
}
