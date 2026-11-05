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
 *
 * A PRODUCT CATALOGUE IS WHAT THE PAGE SHOWS, NOT WHAT ITS DATA IS CALLED.
 *
 * The 500-prompt exam, 2026-11-04, P207: «ابني متجر إلكتروني لـمكتب عقارات:
 * عرض المنتجات بالصور والأسعار…». The store showed six property cards, each
 * with its photo, its name and its price, from `filtered.map(...)`; the scope
 * audit's catalogue evidence wanted a word «product» beside a .map, a
 * ProductCard or /api/products. Refused seven times with «missing: product
 * catalogue»; the builder renamed its data file to products.js, searched the
 * project for «catalogue», and gave up. On the live page a catalogue is a
 * group of two or more same-kind items that carry a photo or a price — read,
 * not operated, on the page as it opens and behind its doors.
 */
import { getChromiumLaunchOptions } from '../../modules/browser/manager';

export type InteractiveCapability = 'search' | 'filtering' | 'sorting' | 'product catalogue';
export const INTERACTIVE_CAPABILITIES: readonly InteractiveCapability[] = ['search', 'filtering', 'sorting', 'product catalogue'];

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
    /** The page's other lists, each read where it sits (see PAGE_SNAPSHOT). */
    others?: string[][];
    /** Where those lists sit — returned by a «mark» snapshot only. */
    places?: string[];
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
  const keyOf = c => c.tagName + '.' + String(c.className || '');
  // A row of boxes that mostly hold a field to fill is the form's layout,
  // not the data: P352 (2026-11-03) wrapped its period select and two
  // date inputs in three div.field boxes, and the probe took them for the
  // items and set aside the very controls it had to operate.
  const fieldBox = el => !!el.querySelector('select, textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"])');
  /** Every group of two or more same-kind siblings that carry text, largest first (ties in page order). */
  const sameKindGroups = () => {
    const found = [];
    for (const parent of document.querySelectorAll('body *')) {
      if (parent.closest('select, script, style, head')) continue;
      const byKey = new Map();
      for (const child of parent.children) {
        if (/^(SCRIPT|STYLE|OPTION|BR|SELECT|INPUT|BUTTON|LABEL)$/.test(child.tagName) || !visible(child)) continue;
        if (!clean(child.innerText)) continue;
        const key = keyOf(child);
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(child);
      }
      for (const [key, g] of byKey) {
        if (g.length < 2 || g.filter(fieldBox).length * 2 >= g.length) continue;
        found.push({ parent, key, els: g });
      }
    }
    return found.sort((a, b) => b.els.length - a.els.length);
  };
  const collection = () => { const all = sameKindGroups(); return all.length ? all[0].els : []; };
  /** Where a list sits: its container's tag, id and classes, and its items' kind. */
  const placeOf = (parent, key) => parent.tagName + (parent.id ? '#' + parent.id : '')
    + (typeof parent.className === 'string' && parent.className.trim() ? '.' + parent.className.trim().split(/\\s+/).join('.') : '') + '\\u0001' + key;
`;

/**
 * What the page shows. «mark» finds the collection and marks its container;
 * «follow» reads the same container's items again, so one row left after a
 * search is read as one row — not as the table's two headers, which became
 * the largest group once the rows were gone.
 *
 * ⛔ AND THE LARGEST LIST IS NOT ALWAYS THE ONE A CONTROL ACTS ON. The hard
 * exam, 2026-11-05, H11: a blog's search worked («No posts match your
 * search.») and was refused four times with «the data shown never changed» —
 * the probe watched the tag cloud beside the posts, four tags to two posts.
 * So the page's other lists are read too, each by where it sits (`places`,
 * chosen by the «mark» snapshot and passed back to every «follow»): a page
 * that re-renders replaces its elements, not their place.
 */
const PAGE_SNAPSHOT = `((mode, places) => {${PAGE_HELPERS}
  const anchor = mode === 'follow' ? document.querySelector('[data-joe-coll]') : null;
  let els;
  if (anchor) {
    const key = anchor.getAttribute('data-joe-coll');
    els = Array.from(anchor.children).filter(c => keyOf(c) === key && visible(c) && clean(c.innerText));
  } else {
    for (const old of document.querySelectorAll('[data-joe-coll]')) old.removeAttribute('data-joe-coll');
    var groupsNow = sameKindGroups();
    els = groupsNow.length ? groupsNow[0].els : [];
    if (els.length && els[0].parentElement) els[0].parentElement.setAttribute('data-joe-coll', keyOf(els[0]));
  }
  const best = els.map(el => clean(el.innerText));
  const mainPlace = els.length && els[0].parentElement ? placeOf(els[0].parentElement, keyOf(els[0])) : '';
  const where = mode === 'mark'
    ? Array.from(new Set((groupsNow || []).map(g => placeOf(g.parent, g.key)))).filter(p => p !== mainPlace).slice(0, 8)
    : (places || []);
  const at = new Map();
  for (const p of document.querySelectorAll('body *')) {
    const place = placeOf(p, '');
    if (!at.has(place)) at.set(place, []);
    at.get(place).push(p);
  }
  const others = where.map(place => {
    const cut = place.lastIndexOf('\\u0001');
    const key = place.slice(cut + 1);
    const items = [];
    for (const p of at.get(place.slice(0, cut + 1)) || []) {
      for (const c of p.children) if (keyOf(c) === key && visible(c) && clean(c.innerText)) items.push(clean(c.innerText));
    }
    return items.slice(0, 300);
  });
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
  return Object.assign({ items: best.slice(0, 300), others, numbers, charts, frame }, mode === 'mark' ? { places: where } : {});
})`;

/**
 * Marks every candidate control with data-joe-ip and describes it. A control
 * inside one of the shown items (its delete button, its «done» checkbox) acts
 * on that item, not on the collection: it is never a candidate.
 */
const PAGE_CANDIDATES = `(() => {${PAGE_HELPERS}
  for (const old of document.querySelectorAll('[data-joe-ip]')) old.removeAttribute('data-joe-ip');
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
 * WHAT OPENS ANOTHER VIEW OF THE PAGE: its links to itself and its buttons —
 * never one item's own button, never a form's. P354 (2026-11-03) showed its
 * date filter only once «تحميل بيانات تجريبية» had loaded the data, and an
 * admin dashboard keeps its search inside the Orders tab; measured on the
 * first view alone, both were «no control that filters». Marked in order, so
 * the same door is found again after a reload.
 */
const PAGE_DOORS = `(() => {${PAGE_HELPERS}
  for (const old of document.querySelectorAll('[data-joe-door]')) old.removeAttribute('data-joe-door');
  const items = collection();
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('a[href], button, [role="tab"], [role="button"]')) {
    if (out.length >= 6) break;
    // A link that IS one of the repeated items (a nav row of links) is a door; a button inside an item acts on it.
    if (!visible(el) || el.disabled || el.closest('form') || items.some(it => it !== el && it.contains(el))) continue;
    const text = clean(el.innerText).slice(0, 40);
    if (!text) continue;
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      // A placeholder link («#») leads nowhere; a menu of them took every door of a store (P207).
      if (/^(mailto|tel|javascript):/i.test(href) || /^#?$/.test(href.trim())) continue;
      const target = new URL(href, location.href);
      if (target.origin !== location.origin || target.href === location.href) continue;
    }
    const key = el.tagName + '|' + text;
    if (seen.has(key)) continue;
    seen.add(key);
    el.setAttribute('data-joe-door', String(out.length));
    out.push({ index: out.length, label: text });
  }
  return out;
})()`;

/** A price as a page writes it: a number beside a currency (on either side), or after the word price. */
const CURRENCY = String.raw`[$€£¥₹₪₺﷼]|\b(?:USD|EUR|GBP|SAR|AED|EGP|JOD|KWD|QAR|BHD|OMR|MAD|TND|DZD|LBP|IQD|TRY|SYP)\b|ر\.\s?س|د\.\s?إ|د\.\s?ك|د\.\s?أ|ج\.\s?م|ريال|دينار|درهم|جنيه|ليرة|دولار|يورو`;
const PRICE_SOURCE = String.raw`(?:${CURRENCY})[\s\u200e\u200f]*[0-9\u0660-\u0669]|[0-9\u0660-\u0669][\s\u200e\u200f]*(?:${CURRENCY})|(?:price|السعر|سعر)\s*[:：]?\s*[0-9\u0660-\u0669]`;

/**
 * The page's catalogue: of every group of two or more same-kind siblings that
 * carry text, the one whose items most often show a photo (an image that
 * loaded, a picture, a background image, of a real size) or a price (a number
 * beside a currency, or in an element called price). Nothing is clicked.
 */
const PAGE_CATALOGUE = `(() => {${PAGE_HELPERS}
  const PRICE = new RegExp(${JSON.stringify(PRICE_SOURCE)}, 'iu');
  const sized = el => { const r = el.getBoundingClientRect(); return r.width >= 40 && r.height >= 40; };
  const loaded = e => e.tagName !== 'IMG' || (!!e.getAttribute('src') && (e.naturalWidth > 0 || !e.complete));
  const photo = it => Array.from(it.querySelectorAll('img, picture, video, svg')).some(e => visible(e) && sized(e) && loaded(e))
    || [it, ...Array.from(it.querySelectorAll('*')).slice(0, 60)].some(e => sized(e) && /url\\(/.test(getComputedStyle(e).backgroundImage || ''));
  const price = it => PRICE.test(it.innerText || '') || Array.from(it.querySelectorAll('[class*="price" i], [id*="price" i]')).some(e => /[0-9\\u0660-\\u0669]/.test(e.innerText || ''));
  let best = null;
  for (const parent of document.querySelectorAll('body *')) {
    if (parent.closest('select, script, style, head, nav, form')) continue;
    const groups = new Map();
    for (const child of parent.children) {
      if (/^(SCRIPT|STYLE|OPTION|BR|SELECT|INPUT|BUTTON|LABEL)$/.test(child.tagName) || !visible(child) || !clean(child.innerText)) continue;
      const key = child.tagName + '.' + String(child.className || '');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(child);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const withPhoto = g.filter(photo).length;
      const withPrice = g.filter(price).length;
      const score = Math.max(withPhoto, withPrice);
      if (score < 2 || score * 2 < g.length) continue;
      if (!best || score > best.score) best = { score, count: g.length, withPhoto, withPrice, sample: clean(g[0].innerText).slice(0, 80) };
    }
  }
  return best;
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
    const deadline = Date.now() + Math.max(5_000, opts.timeoutMs ?? 60_000);
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
        /** Where the page's other lists sit, as the last «mark» snapshot chose them. */
        let places: string[] = [];
        const snap = async (mode: 'mark' | 'follow' = 'follow'): Promise<Snapshot> => {
            const shot: Snapshot = await page.evaluate(`(${PAGE_SNAPSHOT})(${JSON.stringify(mode)}, ${JSON.stringify(places)})`);
            if (mode === 'mark') places = shot.places || [];
            delete shot.places;
            return shot;
        };
        /** A snapshot of the page once it stops moving (bounded); what keeps moving is noise. */
        let noise: Noise = { ...QUIET };
        /** The other lists that moved before anything was touched. */
        const noisy = new Set<string>();
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
                if (mode === 'mark') (last.others || []).forEach((list, k) => { if (!sameMultiset(list, next.others?.[k] || [])) noisy.add(places[k]); });
                last = next;
            }
            return last;
        };
        const settle = () => page.waitForTimeout(150);
        /** The view being measured: the page as it opens, or after one of its doors was pressed. */
        let door: { index: number; label: string } | null = null;
        const openView = async () => {
            await open();
            if (!door) return;
            await page.evaluate(PAGE_DOORS);
            await page.locator(`[data-joe-door="${door.index}"]`).first().click({ timeout: 3_000 }).catch(() => { });
            await page.waitForTimeout(600);
        };
        let candidates: Candidate[] = await page.evaluate(PAGE_CANDIDATES);
        let dirty = false;
        const fresh = async () => {
            if (!dirty) return;
            await openView();
            candidates = await page.evaluate(PAGE_CANDIDATES);
            dirty = false;
        };
        const at = (c: Candidate) => page.locator(`[data-joe-ip="${c.id}"]`).first();
        type Judge = (b: Snapshot, a: Snapshot, n: Noise) => string;
        /**
         * The same judge on the page's other lists, when the largest did not
         * answer (H11). A list that moved before anything was touched, or that
         * grew, is never evidence; only its items are compared — the numbers
         * and charts were judged already, with the whole page.
         */
        const elsewhere = (b: Snapshot, a: Snapshot, judge: Judge): string => {
            for (let k = 0; k < (b.others || []).length; k++) {
                const was = b.others?.[k] || [], now = a.others?.[k] || [];
                if (!was.length || noisy.has(places[k]) || now.length > was.length) continue;
                const verdict = judge({ ...b, items: was }, { ...a, items: now, numbers: b.numbers, charts: b.charts }, { ...noise, items: false });
                if (verdict) return `${verdict} in the list «${was[0].slice(0, 40)}»`;
            }
            return '';
        };
        /** Operate, then compare; if nothing changed, try the control's «apply». */
        const attempt = async (c: Candidate, act: () => Promise<void>, judge: Judge): Promise<string> => {
            const before = await steady('mark');
            dirty = true;
            try { await act(); } catch { return ''; }
            await settle();
            // A list that grew was added to (an Enter in an entry form submits it), never filtered.
            const first = await steady();
            let verdict = first.items.length > before.items.length ? '' : judge(before, first, noise) || elsewhere(before, first, judge);
            if (verdict) return verdict;
            const apply = String(await page.evaluate(`(${PAGE_APPLY})(${JSON.stringify(c.id)})`).catch(() => '') || '');
            if (apply) {
                await page.locator('[data-joe-apply="1"]').first().click().catch(() => { });
                await settle();
                // A list that grew was added to, not filtered.
                const after = await steady();
                verdict = after.items.length > before.items.length ? '' : judge(before, after, noise) || elsewhere(before, after, judge);
                if (verdict) return `${verdict} (after pressing «${apply}»)`;
            }
            return '';
        };
        const byLabel = (c: Candidate) => `«${c.label}» (${c.kind === 'toggle' ? 'checkbox' : c.kind === 'chip' ? 'button' : c.kind === 'header' ? 'column header' : c.kind})`;

        const measureView = async () => {
        for (const cap of want) {
            if (found.has(cap)) continue;
            if (cap === 'product catalogue') {
                //  Read, never operated: what the view shows as it opens.
                await fresh();
                await steady();
                const shown: { count: number; withPhoto: number; withPrice: number; sample: string } | null = await page.evaluate(PAGE_CATALOGUE).catch(() => null);
                note(cap, door ? `the view behind «${door.label}»` : 'the page as it opens');
                if (shown) {
                    const what = [shown.withPhoto ? `${shown.withPhoto} with a photo` : '', shown.withPrice ? `${shown.withPrice} with a price` : ''].filter(Boolean).join(' and ');
                    const verdict = `the page shows ${shown.count} items, ${what} — e.g. «${shown.sample}»`;
                    found.set(cap, door ? `after pressing «${door.label}», ${verdict}` : verdict);
                }
                continue;
            }
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
                    const order: Judge = (b, a, n) => !n.items && reordered(b.items, a.items) ? `the same ${a.items.length} items were reordered` : '';
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
                        }, (b, a, n) => typedChange(b, a, n));
                        if (verdict) verdict = `typing «${term}» into ${byLabel(c)}: ${verdict}`;
                        await at(c).fill('').catch(() => { });
                    }
                } else if (c.kind === 'select') {
                    const current = await at(c).inputValue().catch(() => '');
                    for (const v of c.options.filter(o => o !== current).slice(0, 5)) {
                        if (verdict || stopped()) break;
                        verdict = await attempt(c, () => at(c).selectOption(v), (b, a, n) => dataChanged(b, a, n));
                        if (verdict) verdict = `choosing «${v}» in ${byLabel(c)}: ${verdict}`;
                    }
                } else if (c.kind === 'toggle') {
                    verdict = await attempt(c, () => at(c).click(), (b, a, n) => dataChanged(b, a, n));
                    if (verdict) verdict = `ticking ${byLabel(c)}: ${verdict}`;
                } else if (c.kind === 'chip') {
                    verdict = await attempt(c, () => at(c).click(), (b, a, n) => {
                        if (!n.items && narrowed(b.items, a.items)) return `the items shown went from ${b.items.length} to ${a.items.length}`;
                        if (b.frame !== a.frame) return '';
                        return sameMultiset(b.items, a.items) ? dataChanged(b, a, n) : '';
                    });
                    if (verdict) verdict = `pressing ${byLabel(c)}: ${verdict}`;
                } else {
                    for (const v of valuesFor(c)) {
                        if (verdict || stopped()) break;
                        verdict = await attempt(c, () => at(c).fill(v), (b, a, n) => dataChanged(b, a, n));
                        if (verdict) verdict = `setting ${byLabel(c)} to ${v}: ${verdict}`;
                    }
                }
                if (verdict) found.set(cap, door ? `after pressing «${door.label}», ${verdict}` : verdict);
            }
        }
        };
        await measureView();
        //  What the first view did not show may be one step away: a «load
        //  sample data», a tab, a link to another page. Each door is opened
        //  from a fresh page and measured the same way, within the deadline.
        if (want.some(cap => !found.has(cap)) && !stopped()) {
            await open();
            const doors: Array<{ index: number; label: string }> = await page.evaluate(PAGE_DOORS);
            for (const d of doors) {
                if (stopped() || want.every(cap => found.has(cap))) break;
                door = d;
                await openView();
                candidates = await page.evaluate(PAGE_CANDIDATES);
                dirty = false;
                await measureView();
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
            if (cap === 'product catalogue') {
                return { capability: cap, ok: false, tried: ops.length, detail: `on the live page (${ops.slice(0, 4).join(', ')}) no group of two or more items shows a photo or a price` };
            }
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
