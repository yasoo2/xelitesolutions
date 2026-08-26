/**
 * The content contract — the same treatment the design got.
 *
 * The design stopped depending on the model's goodwill the moment the rules
 * were applied to the CSS instead of written in a prompt. Content had no such
 * enforcement, and it showed: a pricing section with no prices, testimonials
 * with no names and no quotes, three service cards carrying the same sentence
 * with one word swapped, "info@example.com" as the contact address, and two
 * buttons the user asked for by name that were never built.
 *
 * Content cannot be manufactured in code — inventing a price or a customer
 * quote would be fabrication, which is worse than the gap. So this module does
 * the two things that CAN be done deterministically:
 *
 *   1. VERIFY. Objective, checkable claims: a pricing block must contain a
 *      number, a testimonial must contain a quote, sibling cards must not be
 *      near-duplicates, links must lead somewhere, and everything the user
 *      explicitly asked for must exist.
 *   2. REPAIR what is mechanical — section ids, nav links wired to them —
 *      and hand the rest back to the model as a precise list, the way a
 *      compiler hands back errors, then verify again.
 */

export interface ContentIssue {
    code: string;
    /** What is wrong, in the user's language. */
    ar: string;
    en: string;
    /** Can the model plausibly fix this if asked directly? */
    repairable: boolean;
    /**
     * The section ids this is about, when the check can say.
     *
     * A finding that names its sections can be repaired section by section on a
     * page too large for a whole-page pass — which is every real page. A finding
     * that only counts cannot be repaired at all, which is why some were
     * detected on every build and fixed on none.
     */
    sections?: string[];
}

export interface Requirements {
    /** Controls the user named explicitly ("زر تسجيل دخول", "login button"). */
    buttons: string[];
    /** Section-ish things they named ("من نحن", "pricing"). */
    sections: string[];
    /** They asked for photographs. */
    wantsImages: boolean;
}

/* ---------- what the user actually asked for -------------------------------- */

const BUTTON_WORDS = /(?:زر|أزرار|ازرار|button|buttons?)\s*(?:مثل|such as|like)?\s*/gi;

/** Named controls, in both languages, with the label to look for in the page. */
/**
 * The controls a user can name, and how to recognise one already on the page.
 *
 * EXPORTED because there used to be a second copy of this list in chrome.ts with
 * slightly different patterns, and the two disagreed: chrome.ts accepted
 * «تواصل معنا» as the contact control and did not add one, while this list
 * required «…بنا» and reported it missing. Joe told the user a button was
 * missing from a page Joe had decided already had it. One list, one answer.
 */
export const KNOWN_CONTROLS: Array<{ re: RegExp; ar: string; en: string; match: RegExp }> = [
    { re: /تسجيل\s*(ال)?دخول|log\s*in|login|sign\s*in/i, ar: 'تسجيل الدخول', en: 'Sign in', match: /تسجيل\s*(ال)?دخول|log\s*in|login|sign\s*in/i },
    { re: /تسجيل\s*(ال)?خروج|(?:^|\s)خروج|log\s*out|logout|sign\s*out/i, ar: 'تسجيل الخروج', en: 'Sign out', match: /تسجيل\s*(ال)?خروج|(?:>|\s)خروج|log\s*out|logout|sign\s*out/i },
    { re: /من\s*نحن|about\s*us|about/i, ar: 'من نحن', en: 'About', match: /من\s*نحن|عن\s*(نا|الشركة)|about/i },
    // «تواصل معنا» is the same control as «اتصل بنا». Requiring «…بنا» made
    // this list disagree with the one that inserts the button.
    { re: /(?:ات[صّ]ل|اتص|تواصل)\s*(بنا|معنا)|contact\s*us|contact/i, ar: 'اتصل بنا', en: 'Contact', match: /(?:ات[صّ]ل|اتص|تواصل)\s*(بنا|معنا)|راسلنا|contact/i },
    { re: /التسجيل|إنشاء\s*حساب|انشاء\s*حساب|sign\s*up|register/i, ar: 'إنشاء حساب', en: 'Sign up', match: /التسجيل|إنشاء\s*حساب|انشاء\s*حساب|sign\s*up|register/i },
    //  Singular counts. «a service list with prices» asks for a services
    //  section as plainly as «our services» does, and the plural-only
    //  pattern silently dropped it from the owner's own reference brief.
    { re: /خدماتنا|services/i, ar: 'خدماتنا', en: 'Services', match: /خدمات|\bservices?\b/i },
    { re: /الأسعار|الاسعار|pricing|prices/i, ar: 'الأسعار', en: 'Pricing', match: /سعر|أسعار|اسعار|pricing|price/i },
];

/**
 *  ⛔ READ IN ANY INFLECTION, NAMED IN HIS LANGUAGE.
 *
 *  Measured on the owner's reference prompt and its Arabic twin:
 *
 *      EN  «a service list with prices, opening hours, location, phone CTA,
 *           and a booking form»          ->  sections: ["الأسعار"]
 *      AR  «قائمة خدمات بأسعارها وساعات العمل …»  ->  sections: []
 *
 *  Two defects in four lines. The name was pushed from `c.ar` whatever
 *  language the brief was written in, while the `en` twin sat unused beside
 *  it. And extraction used `re`, which demands one exact inflection --
 *  «خدماتنا» not «خدمات», "services" not "a service list" -- while a
 *  looser `match` for the same concept sat one field away, used only for
 *  verification. One concept, two patterns, and the strict one doing the
 *  work.
 *
 *  Extraction goes through the language layer now, which segments with
 *  Unicode's own rules and stems with the same stemmer Elasticsearch uses,
 *  so «خدمات» is «خدماتنا» is «خدماتكم» -- and is never «خدم».
 */
export function extractRequirements(request: string): Requirements {
    const r = String(request || '');
    const { saysAny } = require('../language/arabic');
    //  His language decides the NAME, because a name he cannot read is a
    //  requirement he cannot check.
    const isAr = /[؀-ۿ]/.test(r);
    const nameOf = (c: { ar: string; en: string }) => (isAr ? c.ar : c.en);
    //  The concept, in any form he wrote it. `match` is the loose pattern
    //  this table already carried for verification; extraction reads through
    //  the word layer, and falls back to that same loose pattern for the
    //  phrases a stemmer cannot help with.
    const asks = (c: { re: RegExp; match: RegExp; ar: string; en: string }) =>
        saysAny(r, [c.ar, c.en]) || c.match.test(r) || c.re.test(r);
    const buttons: string[] = [];
    // Only treat a control as REQUIRED when the user used the word "زر/button"
    // near it — otherwise every page that merely mentions contact would be
    // failed for lacking a contact button.
    const mentionsButtons = /زر|أزرار|ازرار|button/i.test(r);
    /**
     *  ⛔ «NEAR IT» WAS WRITTEN IN THE COMMENT AND NOWHERE ELSE.
     *
     *  The rule above says a control is REQUIRED as a button only when he
     *  used the word «زر» near it. The code asked whether that word appears
     *  ANYWHERE in the request, so «وزر اتصال» turned every recognised
     *  control in the whole brief into a required button -- and since a
     *  button is removed from the section list, «قائمة خدمات بأسعارها»
     *  came back with NO sections at all.
     *
     *  A rule stated in a comment with nothing enforcing it is the shape this
     *  repository keeps paying for. The window is enforced here.
     */
    const BUTTON_WORD = /زر|أزرار|ازرار|button/i;
    const askedAsButton = (c: { re: RegExp; match: RegExp }): boolean => {
        for (const re of [c.match, c.re]) {
            const m = new RegExp(re.source, re.flags.replace('g', '') + 'g');
            let hit: RegExpExecArray | null;
            while ((hit = m.exec(r)) !== null) {
                //  The word has to be beside the control, not merely present
                //  in the same paragraph. Thirty characters is one clause.
                const before = r.slice(Math.max(0, hit.index - 30), hit.index);
                if (BUTTON_WORD.test(before)) return true;
                if (m.lastIndex === hit.index) m.lastIndex++;
            }
        }
        return false;
    };
    if (mentionsButtons) {
        for (const c of KNOWN_CONTROLS) if (asks(c) && askedAsButton(c)) buttons.push(nameOf(c));
    }
    const sections: string[] = [];
    for (const c of KNOWN_CONTROLS) if (asks(c) && !buttons.includes(nameOf(c))) sections.push(nameOf(c));
    return {
        buttons,
        sections,
        wantsImages: /صور|صورة|image|photo/i.test(r),
    };
}

/* ---------- text helpers ---------------------------------------------------- */

function stripTags(html: string): string {
    return String(html)
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokens(text: string): string[] {
    return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2);
}

/** Jaccard overlap — 1.0 means the two blocks say the same thing. */
function similarity(a: string, b: string): number {
    const A = new Set(tokens(a)), B = new Set(tokens(b));
    if (!A.size || !B.size) return 0;
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    return inter / (A.size + B.size - inter);
}

/** The repeated blocks in a section, as plain text. */
function cardTexts(sectionHtml: string): string[] {
    const out: string[] = [];
    const re = /<(div|article|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sectionHtml))) {
        const t = stripTags(m[2]);
        if (t.length > 15) out.push(t);
    }
    return out;
}

/**
 * A price, in any of the digit systems an Arabic page actually uses.
 *
 * `\d` matches ASCII 0-9 ONLY. A perfectly good Arabic pricing section written
 * «٢٩٩ ر.س» therefore looked like a section with no prices in it, and Joe told
 * the user their pricing was empty and asked the model to "repair" a page that
 * was already right. Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits
 * count as digits here.
 */
const DIGIT = '[0-9\\u0660-\\u0669\\u06F0-\\u06F9]';
const MONEY = new RegExp(
    `(${DIGIT}[${DIGIT.slice(1, -1)}.,\\u066B\\u066C]*)\\s*(ر\\.?س|ريال|درهم|د\\.?إ|جنيه|دينار|\\$|usd|sar|aed|egp|eur|€|£)`
    + `|[$€£]\\s*${DIGIT}`,
    'i',
);
const PLACEHOLDER_CONTACT = /(example\.(com|org)|test@|your-?email|0123456789|123-?456-?7890|\+1 ?234)/i;
const LOREM = /(lorem ipsum|dolor sit amet|اكتب هنا|النص هنا|your text here|placeholder)/i;

/* ---------- verification ---------------------------------------------------- */

export function verifyContent(html: string, req: Requirements): ContentIssue[] {
    const issues: ContentIssue[] = [];
    const page = String(html || '');
    const text = stripTags(page);

    // 1. Controls the user named must exist as something clickable.
    for (const wanted of req.buttons) {
        const ctl = KNOWN_CONTROLS.find(c => c.ar === wanted);
        if (!ctl) continue;
        const clickables = page.match(/<(a|button)\b[^>]*>[\s\S]*?<\/\1>/gi) || [];
        const found = clickables.some(c => ctl.match.test(stripTags(c)));
        if (!found) {
            issues.push({
                code: 'missing_control',
                ar: `الزر المطلوب «${wanted}» غير موجود في الصفحة`,
                en: `The requested "${wanted}" button is not in the page`,
                repairable: true,
            });
        }
    }

    // 2. A pricing section without a price is a heading, not a section.
    const priceSection = page.match(/<section[^>]*class="[^"]*(pricing|price|plans)[^"]*"[\s\S]*?<\/section>/i)
        || (/(الأسعار|الاسعار|الباقات|الحزم|pricing|plans)/i.test(text) ? [page] : null);
    if (priceSection && /(الأسعار|الاسعار|الباقات|الحزم|pricing|plans)/i.test(stripTags(priceSection[0]))) {
        if (!MONEY.test(stripTags(priceSection[0]))) {
            issues.push({
                code: 'pricing_without_prices',
                ar: 'قسم الأسعار لا يحتوي على أي سعر أو رقم أو عملة',
                en: 'The pricing section contains no price, number or currency',
                repairable: true,
            });
        }
    }

    // 3. A testimonial needs a person and their words.
    const tsSection = page.match(/<section[^>]*class="[^"]*(testimonial|review)[^"]*"[\s\S]*?<\/section>/i);
    if (tsSection) {
        const t = stripTags(tsSection[0]);
        const hasQuote = /["«»""'']/.test(tsSection[0]) || /<blockquote/i.test(tsSection[0]);
        const hasName = /(<cite|class="[^"]*(name|author)|—\s*\p{L}|-\s*\p{L}{3,}\s+\p{L}{3,})/u.test(tsSection[0]);
        if (!hasQuote || !hasName) {
            issues.push({
                code: 'testimonials_without_people',
                ar: 'قسم الشهادات بلا اقتباس حقيقي أو بلا اسم صاحب الشهادة',
                en: 'Testimonials have no real quote or no attributed name',
                repairable: true,
            });
        }
        void t;
    }

    // 4. Near-identical sibling cards — the "same sentence, one word swapped"
    //    pattern that makes a page read as filler.
    const sections = page.match(/<section\b[\s\S]*?<\/section>/gi) || [];
    /**
     * WHICH sections, not how many.
     *
     * This used to count them and report a number. A number cannot be repaired:
     * the whole-page repair is skipped on any real page, so «قسم فيه بطاقات بنفس
     * النص» was detected on every build and fixed on none. Naming the section
     * ids — and the sentence they share — lets the section-scoped repair go
     * straight at them, and lets the model be told exactly what to replace.
     */
    const dupIds: string[] = [];
    let dupExample = '';
    for (const sec of sections) {
        const cards = cardTexts(sec);
        if (cards.length < 2) continue;
        let dup = false;
        for (let i = 0; i < cards.length && !dup; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                if (similarity(cards[i], cards[j]) >= 0.7) {
                    dup = true;
                    if (!dupExample) dupExample = cards[i].slice(0, 70);
                    break;
                }
            }
        }
        if (dup) dupIds.push((sec.match(/\bid\s*=\s*["']([^"']+)["']/) || [, ''])[1] || 'section');
    }
    if (dupIds.length) {
        issues.push({
            code: 'duplicated_copy',
            ar: `${dupIds.length} قسم فيه بطاقات بنفس النص تقريباً — محتوى حشو لا محتوى حقيقي${dupExample ? ` («${dupExample}»)` : ''}`,
            en: `${dupIds.length} section(s) repeat the same text across cards — filler, not real content${dupExample ? ` ("${dupExample}")` : ''}`,
            repairable: true,
            sections: dupIds,
        });
    }

    // 5. Placeholder contact details presented as if real.
    if (PLACEHOLDER_CONTACT.test(text)) {
        issues.push({
            code: 'placeholder_contact',
            ar: 'بيانات تواصل وهمية (example.com أو رقم هاتف نموذجي) معروضة كأنها حقيقية',
            en: 'Placeholder contact details (example.com or a dummy phone) presented as real',
            repairable: true,
        });
    }
    if (LOREM.test(text)) {
        issues.push({ code: 'lorem', ar: 'نص حشو (lorem/placeholder) في الصفحة', en: 'Filler text (lorem/placeholder) in the page', repairable: true });
    }

    // 6. Links that go nowhere.
    const deadLinks = (page.match(/<a\b[^>]*href\s*=\s*["']#["'][^>]*>/gi) || []).length;
    if (deadLinks) {
        issues.push({
            code: 'dead_links',
            ar: `${deadLinks} رابط لا يؤدي إلى أي مكان (href="#")`,
            en: `${deadLinks} link(s) lead nowhere (href="#")`,
            repairable: false,   // repaired mechanically below
        });
    }

    // 7. A form that pretends to send.
    if (/<form\b/i.test(page) && /console\.log/i.test(page) && !/fetch\(|XMLHttpRequest|mailto:|action\s*=\s*["'][^"'#]/i.test(page)) {
        issues.push({
            code: 'fake_form',
            ar: 'نموذج التواصل لا يرسل شيئاً فعلياً (console.log فقط) — يجب أن يوضّح ذلك للزائر أو يرسل عبر mailto',
            en: 'The contact form does not actually send (console.log only) — it must say so or post via mailto',
            repairable: true,
        });
    }

    return issues;
}

/* ---------- mechanical repair ----------------------------------------------- */

/** Slug for an id, safe for Arabic headings too. */
function slugify(s: string, i: number): string {
    const base = s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
    return base ? base.slice(0, 40) : `section-${i}`;
}

/**
 * Give every section an id and point the navigation at it. A nav whose links
 * are all href="#" is the most obvious "this is a mock" signal a page can send,
 * and unlike the copy it is entirely mechanical to fix.
 */
export function wireNavigation(html: string): { html: string; fixed: string[] } {
    const fixed: string[] = [];
    let out = String(html || '');

    // 1. id on each section, derived from its own heading.
    const headings: Array<{ id: string; text: string }> = [];
    let idx = 0;
    out = out.replace(/<section\b([^>]*)>([\s\S]*?)<\/section>/gi, (full, attrs, body) => {
        idx++;
        if (/\bid\s*=/i.test(attrs)) {
            const existing = (attrs.match(/id\s*=\s*["']([^"']+)["']/i) || [])[1];
            const h = (body.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [, ''])[1];
            if (existing) headings.push({ id: existing, text: stripTags(h) });
            return full;
        }
        const h = (body.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i) || [, ''])[1];
        const label = stripTags(h);
        const id = slugify(label, idx);
        headings.push({ id, text: label });
        return `<section${attrs} id="${id}">${body}</section>`;
    });

    // 2. Repoint dead nav links whose label matches a section heading.
    let wired = 0;
    out = out.replace(/<a\b([^>]*?)href\s*=\s*["']#["']([^>]*)>([\s\S]*?)<\/a>/gi, (full, pre, post, label) => {
        const text = stripTags(label);
        const hit = headings.find(h => h.text && (h.text.includes(text) || text.includes(h.text)));
        if (!hit) return full;
        wired++;
        return `<a${pre}href="#${hit.id}"${post}>${label}</a>`;
    });

    if (idx) fixed.push(`gave ${idx} section(s) an anchor id`);
    if (wired) fixed.push(`pointed ${wired} dead nav link(s) at the matching section`);
    return { html: out, fixed };
}

/**
 * Dummy contact details PRE-FILLED into form fields, demoted to placeholders.
 *
 * A shipped contact form arrived with value="info@example.com" and
 * value="059999999999" — the visitor opens the page and the fields already
 * claim an address and a phone number that belong to nobody. The content check
 * above has flagged this on build after build («بيانات تواصل وهمية … معروضة
 * كأنها حقيقية») and fixed it on none, because the fix went to the model with
 * the whole page. It is mechanical: a dummy value= becomes placeholder= — the
 * grey hint text every form uses for exactly this — and a field that already
 * has a placeholder simply loses the fake value.
 */
export function demotePlaceholderPrefills(html: string): { html: string; fixed: number } {
    let fixed = 0;
    const isDummy = (v: string) => {
        const t = v.trim();
        if (!t) return false;
        if (PLACEHOLDER_CONTACT.test(t)) return true;
        const digits = t.replace(/[\s()+.-]/g, '');
        if (/^\d{6,15}$/.test(digits)) {
            if (/(\d)\1{4,}/.test(digits)) return true;                       // 059999999999
            if ('01234567890123456789'.includes(digits)) return true;         // 123456789…
        }
        return false;
    };
    const out = String(html || '').replace(/<input\b[^>]*>/gi, (tag) => {
        const m = tag.match(/\svalue\s*=\s*(["'])([^"']*)\1/i);
        if (!m || !isDummy(m[2])) return tag;
        fixed++;
        if (/\splaceholder\s*=/i.test(tag)) return tag.replace(m[0], '');
        return tag.replace(m[0], ` placeholder=${m[1]}${m[2]}${m[1]}`);
    });
    return { html: out, fixed };
}

/** The precise list handed back to the model, the way a compiler reports errors. */
export function repairBrief(issues: ContentIssue[], isAr: boolean): string {
    const repairable = issues.filter(i => i.repairable);
    if (!repairable.length) return '';
    return `The page you produced fails these content requirements. Fix ONLY these, keep everything else byte-identical, and return the COMPLETE HTML file:
${repairable.map((i, n) => `${n + 1}. ${i.en}`).join('\n')}

Rules for the fix:
- Write REAL, specific content: actual prices with a currency, named people with their role and a genuine-sounding quote, distinct copy for every card (never the same sentence with one word changed).
- Contact details must be plausible for this business, never example.com or 0123456789. If you do not know them, use a clearly-labelled placeholder the owner is told to replace.
- Every requested control must exist as a real <a> or <button> with the exact label asked for.
${isAr ? '- All copy in natural Arabic.' : ''}`;
}
