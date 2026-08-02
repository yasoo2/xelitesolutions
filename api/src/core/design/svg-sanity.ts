/**
 * SVG sanity — deterministic repairs for the ways models actually break
 * inline SVG, measured from a real shipped build (an admin dashboard):
 *
 *  1. `font-size="var(--step-0)"` — a CSS custom property in a PRESENTATION
 *     ATTRIBUTE. Attributes are not CSS: `var()` is invalid there, the value
 *     is discarded, and the axis labels of every hand-drawn chart rendered at
 *     the browser default or not at all. The same value in a `style`
 *     attribute is legal and resolves — so that is where it is moved.
 *
 *  2. `stroke="var(--on-brand)"` on a sparkline. `--on-brand` is the text
 *     colour FOR brand-filled surfaces — white, usually. Models copy it onto
 *     charts that sit on white cards, and the line measured 1.05:1 against
 *     its background: drawn, invisible. Inside <svg> markup it is mapped to
 *     `--brand`, which is what a data line on a card should be.
 *
 *  3. An icon-only <button>/<a> with no aria-label. The behaviour audit
 *     reported them («unnamed icon buttons») build after build; the fix is a
 *     string operation, not a judgement call, so it never needed a model.
 *
 * Every function here is idempotent and logs what it changed.
 */

const VAR_ATTRS = ['font-size', 'fill', 'stroke', 'stroke-width', 'stop-color'];

export interface SvgSanityResult {
    html: string;
    /** var()-valued presentation attributes moved into style="". */
    movedToStyle: number;
    /** var(--on-brand) strokes/fills remapped to var(--brand). */
    remappedOnBrand: number;
    notesAr: string[];
}

export function sanitizeInlineSvg(html: string): SvgSanityResult {
    let movedToStyle = 0;
    let remappedOnBrand = 0;

    const out = String(html || '').replace(/<svg\b[\s\S]*?<\/svg\s*>/gi, (block) => {
        let b = block;

        // (1) var() in a presentation attribute → the same declaration in style.
        b = b.replace(/<[a-zA-Z][^>]*>/g, (tag) => {
            const moved: string[] = [];
            let t = tag;
            for (const attr of VAR_ATTRS) {
                const re = new RegExp(`\\s${attr}\\s*=\\s*"([^"]*var\\([^"]*\\)[^"]*)"`, 'i');
                const m = t.match(re);
                if (!m) continue;
                moved.push(`${attr}:${m[1]}`);
                t = t.replace(re, '');
            }
            if (!moved.length) return tag;
            movedToStyle += moved.length;
            const styleAt = t.match(/\bstyle\s*=\s*"([^"]*)"/i);
            if (styleAt) {
                t = t.replace(/\bstyle\s*=\s*"([^"]*)"/i,
                    (_s, cur: string) => `style="${cur.replace(/;\s*$/, '')};${moved.join(';')}"`);
            } else {
                t = t.replace(/^<([a-zA-Z][\w-]*)/, `<$1 style="${moved.join(';')}"`);
            }
            return t;
        });

        // (2) --on-brand as an ink inside drawn SVG → --brand. The one place
        // --on-brand is right is text ON a brand-filled surface, and that case
        // is CSS on HTML text, not markup inside an <svg> drawing.
        b = b.replace(/var\(\s*--on-brand\s*\)/gi, () => {
            remappedOnBrand++;
            return 'var(--brand)';
        });

        return b;
    });

    const notesAr: string[] = [];
    if (movedToStyle) notesAr.push(`نقلتُ ${movedToStyle} خاصية var() من سمات SVG إلى style — كانت قيمًا غير صالحة يتجاهلها المتصفح`);
    if (remappedOnBrand) notesAr.push(`صحّحتُ ${remappedOnBrand} لونًا في رسومات SVG كان أبيض على أبيض (var(--on-brand) → var(--brand))`);
    return { html: out, movedToStyle, remappedOnBrand, notesAr };
}

/** What each sprite icon MEANS, for the accessible name of an icon-only control. */
const ICON_NAME: Record<string, { ar: string; en: string }> = {
    search: { ar: 'بحث', en: 'Search' }, user: { ar: 'الحساب', en: 'Account' },
    heart: { ar: 'المفضلة', en: 'Favorites' }, settings: { ar: 'الإعدادات', en: 'Settings' },
    home: { ar: 'الرئيسية', en: 'Home' }, plus: { ar: 'إضافة', en: 'Add' },
    minus: { ar: 'إنقاص', en: 'Decrease' }, trash: { ar: 'حذف', en: 'Delete' },
    edit: { ar: 'تعديل', en: 'Edit' }, eye: { ar: 'عرض', en: 'View' },
    lock: { ar: 'الأمان', en: 'Security' }, bell: { ar: 'التنبيهات', en: 'Notifications' },
    calendar: { ar: 'التقويم', en: 'Calendar' }, filter: { ar: 'تصفية', en: 'Filter' },
    download: { ar: 'تنزيل', en: 'Download' }, upload: { ar: 'رفع', en: 'Upload' },
    globe: { ar: 'اللغة', en: 'Language' }, box: { ar: 'الطلبات', en: 'Orders' },
    truck: { ar: 'الشحن', en: 'Shipping' }, wallet: { ar: 'المحفظة', en: 'Wallet' },
    logout: { ar: 'تسجيل الخروج', en: 'Sign out' }, refresh: { ar: 'تحديث', en: 'Refresh' },
    warning: { ar: 'تنبيه', en: 'Warning' }, info: { ar: 'معلومات', en: 'Info' },
    close: { ar: 'إغلاق', en: 'Close' }, menu: { ar: 'القائمة', en: 'Menu' },
    cart: { ar: 'السلة', en: 'Cart' }, mail: { ar: 'البريد', en: 'Email' },
    phone: { ar: 'الهاتف', en: 'Phone' }, pin: { ar: 'الموقع', en: 'Location' },
    clock: { ar: 'الوقت', en: 'Time' }, chart: { ar: 'الإحصاءات', en: 'Statistics' },
    check: { ar: 'تأكيد', en: 'Confirm' }, arrow: { ar: 'التالي', en: 'Next' },
    star: { ar: 'التقييم', en: 'Rating' }, shield: { ar: 'الحماية', en: 'Protection' },
    spark: { ar: 'مميز', en: 'Featured' }, users: { ar: 'المستخدمون', en: 'Users' },
    code: { ar: 'الكود', en: 'Code' },
    facebook: { ar: 'فيسبوك', en: 'Facebook' }, twitter: { ar: 'تويتر', en: 'Twitter' },
    x: { ar: 'إكس', en: 'X' }, linkedin: { ar: 'لينكدإن', en: 'LinkedIn' },
    instagram: { ar: 'إنستغرام', en: 'Instagram' }, whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
    youtube: { ar: 'يوتيوب', en: 'YouTube' },
};

/**
 * Give every icon-only control an accessible name derived from the icon it
 * shows. Only controls that have NO name at all are touched: no visible text,
 * no aria-label, no aria-labelledby, no title.
 */
export function labelIconOnlyButtons(html: string, isArabic: boolean): { html: string; fixed: number } {
    let fixed = 0;
    const out = String(html || '').replace(
        /<(button|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi,
        (whole, tag: string, attrs: string, inner: string) => {
            if (/\baria-label(ledby)?\s*=|\btitle\s*=/i.test(attrs)) return whole;
            // Visible text (tags stripped) means the control already has a name.
            const text = inner.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
            if (text) return whole;
            const icon = inner.match(/<use\b[^>]*href\s*=\s*"#i-([a-z-]+)"/i);
            if (!icon) return whole;
            const name = ICON_NAME[icon[1].toLowerCase()];
            if (!name) return whole;
            fixed++;
            return `<${tag}${attrs} aria-label="${isArabic ? name.ar : name.en}">${inner}</${tag}>`;
        },
    );
    return { html: out, fixed };
}
