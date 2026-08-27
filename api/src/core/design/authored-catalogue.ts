/**
 *  HE ASKED FOR SIX KINDS OF HONEY WITH PRICES. JOE BUILT THE SHELVES EMPTY.
 *
 *  Watched live by the owner. His request, verbatim:
 *
 *      «اعمل لي متجراً إلكترونياً لبيع العسل الطبيعي اسمه «شهد» … وصفحة منتجات
 *        فيها ستة أنواع عسل مع أسعارها …»
 *
 *  The store built, the build was real, the four pages he named were there,
 *  and the preview showed:
 *
 *      عدد المنتجات  0        قيمة المعروض  0
 *      متوسط السعر   —        في السلة      0
 *
 *  Read from the generated `src/content.js`: there is no product list in it at
 *  all. The engine reads its rows from browser storage, which is empty on a
 *  first visit, so the shop is a data-entry app waiting for someone to type
 *  six honeys in by hand.
 *
 *  ⛔ THE CLASS IS THE FOURTH LAW, in the plainest form it has taken all day:
 *  HE SAID WHAT TO PUT ON THE SHELVES AND JOE BUILT THE SHELVES. The number
 *  was in his sentence — «ستة» — and so was the requirement that they carry
 *  prices, and so was the rule that no price may be zero or negative. None of
 *  it reached the thing he was shown.
 *
 *  So the catalogue is written from his request like everything else tonight,
 *  and judged against what the store really is: the rows must match the
 *  engine's own field schema, honour the constraints his sentence stated, and
 *  come in the count he asked for. Anything less keeps the empty shelf, which
 *  is honest, rather than inventing a shop he did not describe.
 */

export interface FieldSpec {
    key: string;
    label?: string;
    type?: string;
    required?: boolean;
    min?: number;
}

export interface CatalogueSpec {
    /** His sentence, verbatim. */
    request: string;
    brand: string;
    isArabic: boolean;
    /** What one row is called in his store — «منتج», «طبق», «خدمة». */
    entityOne: string;
    /** The engine's own field schema; the rows are judged against it. */
    fields: FieldSpec[];
    /** How many rows he asked for, when his sentence said a number. */
    wanted?: number;
    /** Lower bound his sentence stated for numeric fields, e.g. «لا سعر صفراً». */
    minNumeric?: number;
}

export interface AuthoredCatalogue {
    rows: Array<Record<string, any>>;
    rejected: Array<{ row: string; reason: string }>;
}

/**
 *  ⛔ HOW MANY DID HE ASK FOR — READ FROM HIS SENTENCE, NOT ASSUMED.
 *
 *  «ستة أنواع» is six. A store built with three, or with twelve, is not the
 *  store he described, and «some products» is the catalogue answer this whole
 *  session exists to delete.
 */
const ARABIC_NUMBER_WORDS: Record<string, number> = {
    'واحد': 1, 'اثنين': 2, 'اثنان': 2, 'ثلاث': 3, 'ثلاثة': 3, 'اربع': 4, 'اربعة': 4,
    'خمس': 5, 'خمسة': 5, 'ست': 6, 'ستة': 6, 'سبع': 7, 'سبعة': 7, 'ثمان': 8, 'ثمانية': 8,
    'تسع': 9, 'تسعة': 9, 'عشر': 10, 'عشرة': 10, 'اثني عشر': 12, 'اثنا عشر': 12,
};

export function countHeAskedFor(request: string): number | undefined {
    const text = String(request || '')
        .replace(/[\u064b-\u0652\u0640]/g, '')
        .replace(/[\u0623\u0625\u0622]/g, '\u0627');
    //  A digit next to a counted noun: «6 أنواع», «6 منتجات», «6 products».
    const digit = text.match(/(\d{1,2})\s*(?:\u0623?\u0646\u0648\u0627\u0639|\u0645\u0646\u062a\u062c|\u0635\u0646\u0641|items?|products?|kinds?|types?)/i);
    if (digit) {
        const n = parseInt(digit[1], 10);
        if (n >= 1 && n <= 60) return n;
    }
    //  Or the number written as a word, immediately before the counted noun.
    for (const [word, n] of Object.entries(ARABIC_NUMBER_WORDS)) {
        //  ⛔ The text is FOLDED before this runs (أإآ -> ا), so the pattern must
        //  expect the folded spelling. Written with ا rather than أ?, because a
        //  pattern that still carries the hamza matches nothing at all — measured:
        //  «ستة أنواع» folds to «ستة انواع» and the first version read zero.
        const re = new RegExp(word + '[\\s]+(?:انواع|منتج|صنف)');
        if (re.test(text)) return n;
    }
    return undefined;
}

/**
 *  ⛔ AND THE RULE HE STATED ABOUT THE NUMBERS.
 *
 *  «ولا تقبل سعراً صفراً أو سالباً» is a constraint on his data, not a note
 *  about validation UI. A catalogue seeded with a zero price would break the
 *  rule in the very first thing he sees.
 */
export function minimumHeStated(request: string): number | undefined {
    const text = String(request || '').replace(/[\u064b-\u0652\u0640]/g, '');
    const refusesZero = /(?:\u0644\u0627\s*\u062a\u0642\u0628\u0644|\u0645\u0645\u0646\u0648\u0639|\u063a\u064a\u0631\s*\u0645\u0642\u0628\u0648\u0644)[^.\n]{0,40}(?:\u0635\u0641\u0631|\u0633\u0627\u0644\u0628)/.test(text)
        || /\b(?:no|reject|refuse)\b[^.\n]{0,30}\b(?:zero|negative)\b/i.test(text);
    return refusesZero ? 1 : undefined;
}

export function cataloguePrompt(spec: CatalogueSpec): string {
    const shown = spec.fields.map(f =>
        `  ${f.key}${f.required ? ' (required)' : ''}: ${f.type || 'text'}${f.label ? ` — ${f.label}` : ''}`);
    return [
        `Write the real starting catalogue for one specific shop.`,
        ``,
        `THE REQUEST, verbatim — the only authority for what this shop sells:`,
        spec.request,
        ``,
        `Shop: ${spec.brand}`,
        `One row is a «${spec.entityOne}».`,
        `Write every value in ${spec.isArabic ? 'Arabic' : 'English'}.`,
        ``,
        spec.wanted
            ? `Write EXACTLY ${spec.wanted} rows — he asked for that many.`
            : `Write between 4 and 8 rows.`,
        ``,
        `Each row has exactly these fields and no others:`,
        ...shown,
        ``,
        `RULES — a row that breaks any of these is discarded:`,
        `  · Every required field must be filled.`,
        spec.minNumeric !== undefined
            ? `  · Numbers must be at least ${spec.minNumeric} — he said so himself.`
            : `  · Numbers must be positive and realistic.`,
        `  · Leave «image» as an empty string; the build supplies pictures.`,
        `  · Real, specific items this shop would actually sell. Not «Product 1».`,
        ``,
        `REPLY WITH JSON AND NOTHING ELSE:`,
        `{"rows":[{${spec.fields.slice(0, 3).map(f => `"${f.key}":"…"`).join(',')}}]}`,
    ].join('\n');
}

export function parseRows(raw: string): Array<Record<string, any>> {
    const text = String(raw || '');
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    for (const c of [fenced ? fenced[1] : '', text]) {
        const start = c.indexOf('{');
        const end = c.lastIndexOf('}');
        if (start < 0 || end <= start) continue;
        try {
            const parsed = JSON.parse(c.slice(start, end + 1));
            const rows = parsed && (parsed.rows || parsed.items || parsed.products);
            if (Array.isArray(rows)) return rows.filter(r => r && typeof r === 'object');
        } catch { /* try the next candidate */ }
    }
    return [];
}

/** Why this row cannot go on the shelf. '' when it can. */
export function refuseRow(row: Record<string, any>, spec: CatalogueSpec): string {
    for (const f of spec.fields) {
        const v = row[f.key];
        if (f.required && (v === undefined || v === null || String(v).trim() === '')) {
            return `«${f.label || f.key}» is empty and the store requires it`;
        }
        if (v === undefined || v === null || v === '') continue;
        if (f.type === 'number') {
            const n = Number(v);
            if (!Number.isFinite(n)) return `«${f.label || f.key}» is not a number`;
            //  His stated rule outranks the field's own floor, never the reverse.
            const floor = spec.minNumeric !== undefined ? spec.minNumeric : (f.min ?? 0);
            if (n < floor) return `«${f.label || f.key}» is ${n}, below the ${floor} he asked for`;
        }
    }
    const unknown = Object.keys(row).filter(k => !spec.fields.some(f => f.key === k));
    if (unknown.length) return `it carries fields the store does not have: ${unknown.join(', ')}`;
    return '';
}

/**
 *  Write the catalogue, keep only rows the store can really hold.
 *
 *  An empty result is a real answer: the shelf stays empty, which is honest,
 *  rather than filled with a shop he never described.
 */
export async function authorCatalogue(
    spec: CatalogueSpec,
    call: (prompt: string) => Promise<string>,
): Promise<AuthoredCatalogue> {
    const out: AuthoredCatalogue = { rows: [], rejected: [] };
    if (!spec.fields.length) return out;

    let raw = '';
    try {
        raw = await call(cataloguePrompt(spec));
    } catch (e: any) {
        out.rejected.push({ row: '*', reason: `the model could not be reached: ${String(e && e.message || e).slice(0, 120)}` });
        return out;
    }

    const drafted = parseRows(raw);
    if (!drafted.length) {
        out.rejected.push({ row: '*', reason: 'the reply held no usable rows' });
        return out;
    }

    const primary = spec.fields.find(f => f.required)?.key || spec.fields[0].key;
    const seen = new Set<string>();
    for (const row of drafted) {
        const label = String(row[primary] ?? '(unnamed)').slice(0, 40);
        const why = refuseRow(row, spec);
        if (why) { out.rejected.push({ row: label, reason: why }); continue; }
        //  Two shelves of the same thing is not a catalogue.
        const key = label.trim().toLowerCase();
        if (seen.has(key)) { out.rejected.push({ row: label, reason: 'it repeats a row already on the shelf' }); continue; }
        seen.add(key);
        const clean: Record<string, any> = {};
        for (const f of spec.fields) {
            const v = row[f.key];
            clean[f.key] = f.type === 'number' ? Number(v ?? 0) : String(v ?? '');
        }
        out.rows.push(clean);
    }

    /**
     *  ⛔ AND THE COUNT HE ASKED FOR IS PART OF THE REQUEST.
     *
     *  «حين تحدّد عدداً، العدد جزءٌ من النطاق». Six means six. Delivering four
     *  and saying nothing is the same defect as delivering none.
     */
    if (spec.wanted && out.rows.length !== spec.wanted) {
        out.rejected.push({
            row: '*count',
            reason: `he asked for ${spec.wanted} and ${out.rows.length} survived the checks`,
        });
        if (out.rows.length > spec.wanted) out.rows = out.rows.slice(0, spec.wanted);
    }
    return out;
}
