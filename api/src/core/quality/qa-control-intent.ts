/**
 * ⛔ EVERY CONTROL IS ASKED WHETHER IT DID ITS OWN JOB — NOT WHETHER IT CHANGED SOMETHING.
 *
 * The owner, 2026-11-10: «بنى مثلا 100 زر، لازم بيعرف كل 100 زر هذول شو شغلهن،
 * ويجي لما يجربهن يعطي الشغل بالضبط … ويتأكد كل زر عمل شغله». The walk judged a
 * press by any change of the page: an «Add to cart» that opened a toast and
 * left the cart at 0, a «Close» that changed a colour and left its dialog
 * open, a «Sort by price» that re-drew the same order — each «worked».
 *
 * A control's job is read from its own words (Arabic or English), its role
 * and its symbol, and each job has a measurable promise: the cart's count
 * goes up, the dialog closes, the number beside it moves by one, the order
 * changes, the state flips, the list shows other items, a view opens. The
 * page is read before and after the press (readFacts, in the page) and the
 * promise is judged on those two readings. A control whose job has no
 * measurable promise here is judged as before, by any change.
 *
 * Pure: the browser side is probeControls (behaviour-audit.ts).
 */

export type ControlIntent =
    | 'add_to_cart' | 'close' | 'increment' | 'decrement' | 'sort' | 'next_page' | 'prev_page'
    | 'toggle' | 'open' | 'filter' | 'none';

export interface IntentRead {
    intent: ControlIntent;
    /** What it must do, in the reader's language. */
    ar: string;
    en: string;
    /** A wrong answer refuses the delivery (major) or is told with it (minor). */
    weight: 'major' | 'minor';
}

/** What the page shows that a control's job can move: read in the page before and after a press. */
export interface PageFacts {
    url: string;
    /** Open dialogs, drawers and modals. */
    dialogs: number;
    /** The numbers shown on cart-like badges and counters. */
    carts: number[];
    /** The rows, items and cards of the largest list on the page. */
    listSize: number;
    /** The first items of that list, in order: a sort is seen here. */
    listHead: string[];
    /** The texts of every number shown beside +/- steppers. */
    steppers: number[];
}

/** The pressed control's own state before and after (aria-pressed / aria-checked / aria-expanded / an «active» class). */
export interface ControlState { pressed: string; checked: string; expanded: string; active: boolean; text: string }

const W = (re: RegExp, s: string) => re.test(s);

/** The job a control's words, role and symbol promise. */
export function intentOf(label: string, kind = 'button'): IntentRead {
    const s = String(label || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const none: IntentRead = { intent: 'none', ar: '', en: '', weight: 'minor' };
    if (!s || kind === 'anchor') return none;
    if (W(/add to (?:cart|basket|bag)|أضف (?:إلى|الى|لل)?\s*(?:ال)?سل[ةه]|اضف (?:إلى|الى)?\s*(?:ال)?سل[ةه]|إضافة (?:إلى|الى|لل) ?(?:ال)?سل[ةه]|أضف للسلة|add to order/u, s)) {
        return { intent: 'add_to_cart', ar: 'يزيد عدد السلة', en: 'raises the cart\'s count', weight: 'major' };
    }
    if (W(/^(?:×|✕|✖|x|close|dismiss|cancel|إغلاق|اغلاق|أغلق|اغلق|إلغاء|الغاء)$/u, s)) {
        return { intent: 'close', ar: 'يغلق النافذة المفتوحة', en: 'closes the open dialog', weight: 'major' };
    }
    if (W(/^(?:\+|＋|plus|increase|زيادة|زِد)$/u, s)) return { intent: 'increment', ar: 'يزيد الرقم بجانبه واحداً', en: 'raises the number beside it by one', weight: 'major' };
    if (W(/^(?:-|−|–|minus|decrease|إنقاص|انقاص|نقص)$/u, s)) return { intent: 'decrement', ar: 'ينقص الرقم بجانبه واحداً', en: 'lowers the number beside it by one', weight: 'major' };
    if (W(/^(?:sort|order)\b|\bsort by\b|ترتيب|رتّب|رتب حسب|الأحدث|الأقدم|الأعلى سعر|الأقل سعر|newest|oldest|price: (?:low|high)/u, s)) {
        return { intent: 'sort', ar: 'يغيّر ترتيب القائمة', en: 'changes the list\'s order', weight: 'minor' };
    }
    if (W(/^(?:next|more|load more|›|»|→|التالي|التالية|المزيد|عرض المزيد|←)$/u, s)) return { intent: 'next_page', ar: 'يعرض عناصر أخرى من القائمة', en: 'shows other items of the list', weight: 'minor' };
    if (W(/^(?:prev|previous|‹|«|السابق|السابقة)$/u, s)) return { intent: 'prev_page', ar: 'يعرض العناصر السابقة', en: 'shows the earlier items', weight: 'minor' };
    if (W(/^(?:♥|♡|❤|★|☆|like|unlike|follow|unfollow|favou?rite|bookmark|save for later|إعجاب|أعجبني|متابعة|تابع|إلغاء المتابعة|مفضلة|المفضلة|أضف للمفضلة|حفظ للمفضلة)$/u, s)) {
        return { intent: 'toggle', ar: 'يقلب حالته (مفعّل / غير مفعّل)', en: 'flips its own state on and off', weight: 'minor' };
    }
    if (W(/^(?:view|details|open|show|preview|read more|see more|عرض|تفاصيل|فتح|افتح|معاينة|اقرأ المزيد|المزيد من التفاصيل)$/u, s)) {
        return { intent: 'open', ar: 'يفتح ما يعرضه (نافذة أو صفحة)', en: 'opens what it shows (a dialog or a page)', weight: 'minor' };
    }
    return none;
}

/**
 * Whether the press did the job its words promise, judged on the page read
 * before and after it. null: the job has no measurable promise here, or the
 * page gave nothing to measure it on (no list, no badge, no number beside it)
 * — never a verdict on a guess.
 */
export function judgeIntent(read: IntentRead, before: PageFacts | null, after: PageFacts | null,
    state?: { before: ControlState | null; after: ControlState | null }, effect = ''): boolean | null {
    if (read.intent === 'none' || !before || !after) return null;
    if (effect === 'navigation' || effect === 'download' || effect === 'handoff') {
        //  A page of its own for a product or a list is its job done for «open» and the pages of a list.
        return read.intent === 'open' || read.intent === 'next_page' || read.intent === 'prev_page' ? true : null;
    }
    const sameList = before.listHead.join('\u0001') === after.listHead.join('\u0001');
    switch (read.intent) {
        case 'add_to_cart': {
            if (!before.carts.length && !after.carts.length) return null;
            const total = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
            return total(after.carts) > total(before.carts) || after.carts.length > before.carts.length;
        }
        case 'close':
            if (!before.dialogs) return null;
            return after.dialogs < before.dialogs;
        case 'increment':
        case 'decrement': {
            if (!before.steppers.length || before.steppers.length !== after.steppers.length) return null;
            const step = read.intent === 'increment' ? 1 : -1;
            const moved = after.steppers.some((v, i) => v - before.steppers[i] === step);
            //  At its floor a «−» rightly does nothing (a quantity of 1, a count of 0).
            if (!moved && read.intent === 'decrement' && before.steppers.some(v => v <= 1)) return null;
            return moved;
        }
        case 'sort':
            if (before.listHead.length < 2) return null;
            return !sameList;
        case 'next_page':
        case 'prev_page':
            if (!before.listHead.length) return null;
            return !sameList || after.url !== before.url;
        case 'toggle': {
            const a = state?.before, b = state?.after;
            if (!a || !b) return null;
            return a.pressed !== b.pressed || a.checked !== b.checked || a.active !== b.active || a.text !== b.text;
        }
        case 'open':
            return after.dialogs > before.dialogs || after.url !== before.url || null;
        default:
            return null;
    }
}

/** Runs in the page: what a control's job can move. Self-contained: it calls nothing outside itself. */
export function readFacts(): PageFacts {
    const shown = (el: Element) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        const cs = getComputedStyle(el as HTMLElement);
        return r.width > 2 && r.height > 2 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05;
    };
    const dialogs = Array.from(document.querySelectorAll('dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal,.drawer,.overlay'))
        .filter(shown).length;
    const num = (t: string) => { const m = String(t || '').replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).match(/-?\d+/); return m ? Number(m[0]) : NaN; };
    const carts = Array.from(document.querySelectorAll('[class*="cart" i],[id*="cart" i],[aria-label*="cart" i],[class*="basket" i],[class*="badge" i],[aria-label*="سلة"],[data-cart-count],[data-count]'))
        .filter(shown)
        .map(el => num((el as HTMLElement).innerText || el.getAttribute('data-count') || el.getAttribute('data-cart-count') || ''))
        .filter(n => Number.isFinite(n) && Math.abs(n) < 100000);
    //  The largest list: the parent with the most children alike (rows, cards, items), navigation aside.
    let best: Element[] = [];
    for (const parent of Array.from(document.querySelectorAll('tbody,ul,ol,[role="list"],[role="grid"],main,section,div'))) {
        if (parent.closest('nav,header,footer,[role="navigation"],form')) continue;
        const kids = Array.from(parent.children).filter(shown);
        if (kids.length < 2) continue;
        const tag = kids[0].tagName;
        const alike = kids.filter(k => k.tagName === tag && (k as HTMLElement).innerText.trim().length > 0);
        if (alike.length >= 2 && alike.length > best.length && alike.length >= kids.length * 0.6) best = alike;
    }
    const steppers = Array.from(document.querySelectorAll('input[type="number"],output,[class*="qty" i],[class*="quantity" i],[class*="count" i],[aria-live]'))
        .filter(shown)
        .map(el => num((el as HTMLInputElement).value ?? (el as HTMLElement).innerText))
        .filter(n => Number.isFinite(n))
        .slice(0, 40);
    return {
        url: location.href,
        dialogs,
        carts: carts.slice(0, 10),
        listSize: best.length,
        listHead: best.slice(0, 6).map(el => (el as HTMLElement).innerText.trim().replace(/\s+/g, ' ').slice(0, 60)),
        steppers,
    };
}

/** Runs in the page: the pressed control's own state. Self-contained. */
export function readControlState(sel: string): ControlState | null {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return null;
    return {
        pressed: String(el.getAttribute('aria-pressed') || ''),
        checked: String(el.getAttribute('aria-checked') || (el as HTMLInputElement).checked || ''),
        expanded: String(el.getAttribute('aria-expanded') || ''),
        active: /(?:^|\s)(?:active|is-active|on|selected|liked|followed|favou?rited|saved)(?:\s|$)/.test(String(el.className || '')),
        text: String(el.innerText || '').trim().slice(0, 40),
    };
}
