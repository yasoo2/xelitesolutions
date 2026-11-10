/**
 * ⛔ EVERY FIELD IS TRIED THE WAY A CAREFUL TESTER TRIES IT — BY WHAT IT MEANS.
 *
 * The owner, watching Joe's Browser QA on 2026-11-10: «الأزرار ما بجربهم زر زر،
 * القوائم ما بعبيهم … إذا في خيارات لازم يحطها أرقام أحرف، إذا بس الأرقام ها بس
 * الأحرف، يجرب حالات». Measured on L451 (a project management suite): 74
 * controls found, not one field filled, not one value tried.
 *
 * Each field is read for what it means — an email, a phone, a price, a
 * quantity, an age, a date, a name, a password, free text — from its type, its
 * own constraints (required, min, max, maxlength, pattern, step) and the words
 * a visitor reads beside it, in Arabic or English. Its cases follow from that
 * meaning: what a tester types to break it, and what it must accept. Each case
 * says what is expected, why, and whether a wrong answer refuses the delivery
 * («major») or is told with it («minor»).
 *
 * Pure: the browser runner (behaviour-audit probeFieldCases) carries them out.
 */

export interface QaField {
    tag: string;
    type: string;
    /** Every word a visitor reads for it: name, id, label, placeholder, aria-label. */
    name: string;
    required?: boolean;
    pattern?: string;
    min?: string;
    max?: string;
    minLength?: number;
    maxLength?: number;
    step?: string;
    inputMode?: string;
    options?: string[];
}

export type FieldMeaning =
    | 'email' | 'tel' | 'url' | 'money' | 'quantity' | 'age' | 'number' | 'percent'
    | 'date' | 'time' | 'password' | 'name' | 'search' | 'longtext' | 'text'
    | 'select' | 'check' | 'color' | 'range';

export type CaseExpect = 'reject' | 'accept' | 'inert';

export interface FieldCase {
    /** Stable id: the meaning and what is tried («money:letters»). */
    id: string;
    value: string;
    expect: CaseExpect;
    /** What the case tries, in the reader's language. */
    ar: string;
    en: string;
    /** A wrong answer refuses the delivery (major) or is told with it (minor). */
    weight: 'major' | 'minor';
}

const has = (re: RegExp, s: string) => re.test(s);

/** What the field means, from its type, its constraints and the words beside it. */
export function meaningOf(f: QaField): FieldMeaning {
    const type = String(f.type || '').toLowerCase();
    const tag = String(f.tag || '').toLowerCase();
    const words = String(f.name || '').toLowerCase();
    if (tag === 'select') return 'select';
    if (type === 'checkbox' || type === 'radio') return 'check';
    if (type === 'color') return 'color';
    if (type === 'range') return 'range';
    if (type === 'email' || has(/e-?mail|البريد|بريد\s*إلكتروني|الإيميل|ايميل/u, words)) return 'email';
    if (type === 'tel' || has(/phone|mobile|\btel\b|whatsapp|هاتف|جوال|جوّال|موبايل|رقم\s*(?:ال)?(?:تواصل|الاتصال)|واتس/u, words)) return 'tel';
    if (type === 'url' || has(/\burl\b|website|link|الموقع\s*الإلكتروني|رابط/u, words)) return 'url';
    if (type === 'password' || has(/password|كلمة\s*(?:ال)?(?:مرور|سر)/u, words)) return 'password';
    if (type === 'date' || type === 'datetime-local' || type === 'month' || type === 'week' || has(/\bdate\b|birth|تاريخ|ميلاد/u, words)) return 'date';
    if (type === 'time' || has(/\btime\b|الوقت|الساعة/u, words)) return 'time';
    if (type === 'search' || has(/search|بحث|ابحث/u, words)) return 'search';
    if (has(/price|cost|amount|salary|fee|total|budget|\$|سعر|السعر|تكلفة|مبلغ|راتب|رسوم|ميزانية|المجموع/u, words)) return 'money';
    if (has(/percent|%|نسبة|خصم/u, words)) return 'percent';
    if (has(/\bage\b|العمر|عمر\b/u, words)) return 'age';
    if (has(/quantity|qty|stock|count|seats|guests|points|pages|كمية|الكمية|عدد|مقاعد|نقاط|مخزون/u, words)) return 'quantity';
    if (type === 'number' || f.inputMode === 'numeric' || f.inputMode === 'decimal') return 'number';
    if (tag === 'textarea' || has(/description|notes?|comment|message|bio|body|content|وصف|ملاحظات|تعليق|رسالة|نبذة|محتوى/u, words)) return 'longtext';
    if (has(/(?:^|\s|_)(?:first|last|full|user)?_?name\b|الاسم|اسم/u, words)) return 'name';
    return 'text';
}

const NUMERIC_MEANINGS: ReadonlySet<FieldMeaning> = new Set(['money', 'quantity', 'age', 'number', 'percent']);

/** Never negative by what it means: a price, a quantity, an age, a percent. */
function neverNegative(meaning: FieldMeaning, f: QaField): boolean {
    if (f.min !== undefined && f.min !== '' && Number(f.min) >= 0) return true;
    return meaning === 'money' || meaning === 'quantity' || meaning === 'age' || meaning === 'percent';
}

/** A whole number by what it means, or by a declared step of 1. */
function wholeNumber(meaning: FieldMeaning, f: QaField): boolean {
    if (f.step && f.step !== 'any' && Number(f.step) >= 1) return true;
    return meaning === 'quantity' || meaning === 'age';
}

/** A value inside its declared bounds, or a sensible one for what it means. */
export function validValueFor(f: QaField, nonce = ''): string {
    const meaning = meaningOf(f);
    const tag = nonce ? ` ${nonce}` : '';
    const lo = f.min !== undefined && f.min !== '' && Number.isFinite(Number(f.min)) ? Number(f.min) : NaN;
    const hi = f.max !== undefined && f.max !== '' && Number.isFinite(Number(f.max)) ? Number(f.max) : NaN;
    const inRange = (want: number) => {
        let v = want;
        if (Number.isFinite(lo) && v < lo) v = lo;
        if (Number.isFinite(hi) && v > hi) v = hi;
        return String(v);
    };
    switch (meaning) {
        case 'email': return 'qa.tester@example.com';
        case 'tel': return '+962791234567';
        case 'url': return 'https://example.com';
        case 'money': return inRange(25);
        case 'percent': return inRange(10);
        case 'age': return inRange(30);
        case 'quantity': return inRange(2);
        case 'number': return inRange(3);
        case 'date': return f.min || '2030-01-15';
        case 'time': return '10:30';
        case 'password': return 'Qa-Pass-2026!';
        case 'search': return 'qa';
        case 'name': return `QA Tester${tag}`.slice(0, f.maxLength || 200);
        case 'longtext': return `QA note${tag}`.slice(0, f.maxLength || 2000);
        case 'select': return (f.options || [])[0] || '';
        //  A short field (a key, a code) gets a short value, not a nonce cut in half.
        default: return f.maxLength && f.maxLength < 12 ? 'QA'.slice(0, f.maxLength) : `QA value${tag}`.slice(0, f.maxLength || 200);
    }
}

/**
 * The cases a careful tester tries on this field, each with what is expected.
 * The valid value is tried last by the form's own submit, not here.
 */
export function casesFor(f: QaField): FieldCase[] {
    const meaning = meaningOf(f);
    const out: FieldCase[] = [];
    const add = (id: string, value: string, expect: CaseExpect, weight: 'major' | 'minor', ar: string, en: string) =>
        out.push({ id: `${meaning}:${id}`, value, expect, weight, ar, en });

    if (f.required && meaning !== 'check' && meaning !== 'select' && meaning !== 'color' && meaning !== 'range') {
        add('empty', '', 'reject', 'major', 'تركه فارغاً وهو إلزامي', 'left empty although it is required');
    }
    if (meaning === 'select') {
        if (f.required) add('none', '', 'reject', 'major', 'بلا اختيار وهو إلزامي', 'no choice although it is required');
        return out;
    }
    if (meaning === 'check' || meaning === 'color' || meaning === 'range') return out;

    if (NUMERIC_MEANINGS.has(meaning)) {
        add('letters', 'abc', 'reject', 'major', 'حروف بدل الأرقام «abc»', 'letters instead of a number "abc"');
        if (neverNegative(meaning, f)) add('negative', '-5', 'reject', f.min !== undefined && f.min !== '' ? 'major' : 'minor', 'رقم سالب «-5»', 'a negative number "-5"');
        //  A declared step of 1 makes a fraction a defect; a fractional step allows it (story points of 0.5); the meaning alone only suggests it.
        const declaredWhole = !!f.step && f.step !== 'any' && Number(f.step) >= 1;
        const declaredFraction = !!f.step && (f.step === 'any' || Number(f.step) < 1);
        if (wholeNumber(meaning, f) && !declaredFraction) add('fraction', '2.5', 'reject', declaredWhole ? 'major' : 'minor', 'كسر عشري «2.5» لعدد صحيح', 'a fraction "2.5" for a whole number');
        if (f.max !== undefined && f.max !== '' && Number.isFinite(Number(f.max))) {
            add('above-max', String(Number(f.max) + 1), 'reject', 'major', `أكبر من الحد الأعلى ${f.max}`, `above its maximum ${f.max}`);
        } else if (meaning === 'age' || meaning === 'percent') {
            add('absurd', meaning === 'age' ? '500' : '150', 'reject', 'minor', meaning === 'age' ? 'عمر غير معقول «500»' : 'نسبة فوق 100 «150»', meaning === 'age' ? 'an impossible age "500"' : 'a percent above 100 "150"');
        }
        if (f.min !== undefined && f.min !== '' && Number.isFinite(Number(f.min)) && Number(f.min) > 0) {
            add('below-min', String(Number(f.min) - 1), 'reject', 'major', `أصغر من الحد الأدنى ${f.min}`, `below its minimum ${f.min}`);
        }
        return out;
    }
    switch (meaning) {
        case 'email':
            add('malformed', 'not-an-email', 'reject', 'major', 'بريد بلا صيغة «not-an-email»', 'an address with no form "not-an-email"');
            add('no-domain', 'qa@', 'reject', 'major', 'بريد بلا نطاق «qa@»', 'an address with no domain "qa@"');
            break;
        case 'tel':
            add('letters', 'call-me', 'reject', 'major', 'حروف بدل رقم الهاتف «call-me»', 'letters instead of a phone number "call-me"');
            break;
        case 'url':
            add('malformed', 'not a link', 'reject', 'major', 'رابط بلا صيغة «not a link»', 'a link with no form "not a link"');
            break;
        case 'date':
            if (f.min) add('before-min', '1900-01-01', 'reject', 'major', `تاريخ قبل ${f.min}`, `a date before ${f.min}`);
            if (f.max) add('after-max', '2999-12-31', 'reject', 'major', `تاريخ بعد ${f.max}`, `a date after ${f.max}`);
            break;
        case 'password':
            if (f.minLength && f.minLength > 1) add('short', '1'.repeat(Math.max(1, f.minLength - 1)), 'reject', 'major', `كلمة مرور أقصر من ${f.minLength}`, `a password shorter than ${f.minLength}`);
            break;
        case 'name':
            add('digits', '12345', 'reject', 'minor', 'أرقام فقط في الاسم «12345»', 'only digits in a name "12345"');
            if (f.required) add('spaces', '   ', 'reject', 'minor', 'مسافات فقط وهو إلزامي', 'only spaces although it is required');
            break;
        default:
            if (f.required) add('spaces', '   ', 'reject', 'minor', 'مسافات فقط وهو إلزامي', 'only spaces although it is required');
    }
    if (f.maxLength && f.maxLength > 0 && f.maxLength < 100_000) {
        add('too-long', 'x'.repeat(f.maxLength + 10), 'reject', 'major', `نص أطول من ${f.maxLength} حرفاً`, `text longer than ${f.maxLength} characters`);
    }
    if (f.pattern && meaning !== 'tel') {
        add('pattern', '!!!', 'reject', 'major', 'قيمة لا تطابق النمط المطلوب «!!!»', 'a value that breaks its pattern "!!!"');
    }
    //  Arabic must be taken — where the field leaves room for it: a pattern is a format he set (a key, a
    //  code), and what a valid value must fit inside its own length (L451's «Key», maxlength 10).
    if ((meaning === 'name' || meaning === 'text' || meaning === 'longtext') && !f.pattern) {
        const arabic = 'نص عربي للتجربة'.slice(0, f.maxLength && f.maxLength > 0 ? f.maxLength : undefined).trim();
        if (arabic.length >= 2 && (!f.minLength || arabic.length >= f.minLength)) add('arabic', arabic, 'accept', 'major', 'نص عربي', 'Arabic text');
    }
    if (markupFieldFits(f)) {
        add('markup', '<b>qa</b><img src=x onerror="window.__joeQaXss=1">', 'inert', 'major', 'وسوم HTML لا تُنفَّذ', 'HTML markup that must stay text');
    }
    return out;
}

/**
 * The field markup is tried in: free text with no format of its own and room
 * for the probe and the QA's nonce — a description, a comment, a name with no
 * limit. Never a key or a code (L451: the markup cut to «Key»'s 10 letters cut
 * the nonce off, and the saved record could no longer be found).
 */
export function markupFieldFits(f: QaField): boolean {
    const meaning = meaningOf(f);
    if (meaning !== 'longtext' && meaning !== 'name') return false;
    if (f.pattern) return false;
    return !f.maxLength || f.maxLength >= 80;
}

/** Of a form's fields, the one markup is tried in: free text first, then a name; none when none fits. */
export function markupFieldOf(fields: QaField[]): number {
    const longtext = fields.findIndex(f => meaningOf(f) === 'longtext' && markupFieldFits(f));
    if (longtext >= 0) return longtext;
    return fields.findIndex(f => markupFieldFits(f));
}

/** Every case of every field of a form, in the order a tester tries them. */
export function formCases(fields: QaField[]): Array<{ field: number; meaning: FieldMeaning; cases: FieldCase[] }> {
    return fields.map((f, field) => ({ field, meaning: meaningOf(f), cases: casesFor(f) }));
}
