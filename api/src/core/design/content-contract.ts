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
    { re: /خدماتنا|services/i, ar: 'خدماتنا', en: 'Services', match: /خدمات|services/i },
    { re: /الأسعار|الاسعار|pricing|prices/i, ar: 'الأسعار', en: 'Pricing', match: /سعر|أسعار|اسعار|pricing|price/i },
];

export function extractRequirements(request: string): Requirements {
    const r = String(request || '');
    const buttons: string[] = [];
    // Only treat a control as REQUIRED when the user used the word "زر/button"
    // near it — otherwise every page that merely mentions contact would be
    // failed for lacking a contact button.
    const mentionsButtons = /زر|أزرار|ازرار|button/i.test(r);
    if (mentionsButtons) {
        for (const c of KNOWN_CONTROLS) if (c.re.test(r)) buttons.push(c.ar);
    }
    const sections: string[] = [];
    for (const c of KNOWN_CONTROLS) if (c.re.test(r) && !buttons.includes(c.ar)) sections.push(c.ar);
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
    let dupSections = 0;
    for (const sec of sections) {
        const cards = cardTexts(sec);
        if (cards.length < 2) continue;
        let dup = false;
        for (let i = 0; i < cards.length && !dup; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                if (similarity(cards[i], cards[j]) >= 0.7) { dup = true; break; }
            }
        }
        if (dup) dupSections++;
    }
    if (dupSections) {
        issues.push({
            code: 'duplicated_copy',
            ar: `${dupSections} قسم فيه بطاقات بنفس النص تقريباً — محتوى حشو لا محتوى حقيقي`,
            en: `${dupSections} section(s) repeat the same text across cards — filler, not real content`,
            repairable: true,
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
