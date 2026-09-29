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

/** English number words — «four plants» counts exactly like «4 plants». */
const ENGLISH_NUMBER_WORDS: Record<string, number> = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6,
    'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
};

/** Nouns that mean «seed rows» in any domain — never things one shop sells. */
const SEED_NOUNS_EN = 'examples?|samples?|seeds?|rows?|records?|entries?|demos?';
/** Folded spelling (the ة stays, the hamza is already ا by the time we run). */
const SEED_NOUNS_AR = 'امثلة|مثال|عينات|عينة';
const SHOP_NOUNS_EN = 'items?|products?|kinds?|types?';
const SHOP_NOUNS_AR_FOLDED = 'انواع|منتج|صنف';
/** One optional adjective between the number and its noun — «6 delivery vans», «4 new tasks». Prepositions, articles and their Arabic twins never qualify: «6 of the vans» counts existing vans, it does not seed six. */
const ADJECTIVE_STOPS = 'of|the|a|an|to|for|from|in|on|with|per|each|than|that|which|who|and|or|as|by|at|من|في|على|الى|عن|مع|ال';
const ADJECTIVE_SKIP = `(?:(?!(?:${ADJECTIVE_STOPS})(?=\\s|$))[A-Za-z\\u0600-\\u06FF][^\\s,.!?;:()«»"']*\\s+)?`;

export function countHeAskedFor(request: string, entityOne = ''): number | undefined {
    const text = String(request || '')
        .replace(/[\u064b-\u0652\u0640]/g, '')
        .replace(/[\u0623\u0625\u0622]/g, '\u0627');
    const inRange = (n: number): number | undefined =>
        (Number.isInteger(n) && n >= 1 && n <= 60) ? n : undefined;

    /**
     *  ⛔ WHAT NEVER COUNTS, IN EITHER LANGUAGE.
     *
     *  A count reader that fires on «delete 5 tasks» would seed five rows the
     *  moment he asked them gone — the exact inversion of his sentence. So a
     *  number spent on a deletion, on pagination («5 rows per page»), or split
     *  out of a longer number («101 products» is not «01») reads as no count.
     *  The guards below are the load-bearing half of every pattern above them.
     */
    const DIGIT = '(?<![\\d.-])(\\d{1,2})(?!\\d)';
    const NO_DELETE_BEFORE_EN = '(?<!\\b(?:delete|remove|drop|clear|erase)(?:s|d|ing)?\\s+(?:the\\s+)?)';
    const NO_DELETE_BEFORE_AR = '(?<!(?:احذف|حذف|امسح|مسح|ازل)(?:\\s+ال)?\\s+)';
    const NO_DELETE_AFTER_EN = '(?!\\s+(?:\\w+\\s+){0,2}(?:delet|remov|drop|clear|eras)\\w*\\b)';
    const NO_PER_PAGE = '(?!\\s*(?:per|a|each)\\s+pages?\\b)';

    //  Several counts may share one sentence («4 plants and 5 examples»); the
    //  first one he stated wins, whichever anchor reads it.
    const found: Array<{ index: number; value: number }> = [];
    const considerFirst = (re: RegExp, valueOf: (m: RegExpMatchArray) => number | undefined) => {
        const m = text.match(re);
        if (m && m.index !== undefined) {
            const v = valueOf(m);
            if (v !== undefined) found.push({ index: m.index, value: v });
        }
    };
    const digitValue = (m: RegExpMatchArray) => inRange(parseInt(m[1], 10));

    //  1. The shop nouns this reader was built for: «6 منتجات», «5 products».
    considerFirst(
        new RegExp(`${NO_DELETE_BEFORE_EN}${DIGIT}\\s*(?:${ADJECTIVE_SKIP}(?:ال)?(?:${SHOP_NOUNS_AR_FOLDED})|${ADJECTIVE_SKIP}(?:${SHOP_NOUNS_EN}))${NO_PER_PAGE}${NO_DELETE_AFTER_EN}`, 'i'),
        digitValue,
    );

    //  2. Seed-data nouns in any domain: «4 example plants», «5 sample rows».
    considerFirst(
        new RegExp(`${NO_DELETE_BEFORE_EN}${DIGIT}\\s*${ADJECTIVE_SKIP}(?:${SEED_NOUNS_EN})\\b${NO_PER_PAGE}${NO_DELETE_AFTER_EN}`, 'i'),
        digitValue,
    );

    //  3. Their Arabic twins: «4 امثلة».
    considerFirst(
        new RegExp(`${NO_DELETE_BEFORE_AR}${DIGIT}\\s*${ADJECTIVE_SKIP}(?:ال)?(?:${SEED_NOUNS_AR})`),
        digitValue,
    );

    //  4. The entity the build is actually seeding: «4 plants» with entityOne
    //  «plant», «5 طلبات» with entityOne «طلب». This is the structural end of
    //  the shop-noun list — one dynamic noun per request instead of a noun
    //  for every domain anyone will ever seed. (Irregular plurals — children,
    //  broken Arabic plurals — still miss; the anchors above stay the fallback.)
    const entity = String(entityOne || '').trim();
    if (entity.length >= 2) {
        const stem = entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
        if (/[a-z]/i.test(entity)) {
            considerFirst(
                new RegExp(`${NO_DELETE_BEFORE_EN}${DIGIT}\\s*${ADJECTIVE_SKIP}${stem}(?:s|es)?\\b(?!-)${NO_PER_PAGE}${NO_DELETE_AFTER_EN}`, 'i'),
                digitValue,
            );
        } else {
            considerFirst(
                new RegExp(`${NO_DELETE_BEFORE_AR}${DIGIT}\\s*${ADJECTIVE_SKIP}(?:ال)?${stem}(?:ة|ات|ين|ون|ان)?(?=$|[^0-9A-Za-z_\u0600-\u06FF])`),
                digitValue,
            );
        }
    }

    //  5. The seed verb itself: «seed it with 4», «seeds: 5». Deliberately
    //  narrow constructions — «seed round», «seed phrase» and «seed bank»
    //  are funding, crypto and agriculture, not seed data.
    for (const re of [
        new RegExp(`seed(?:s|ed|ing)?\\s+(?:it\\s+|them\\s+|the\\s+(?:\\w+\\s+){1,3})?with\\s+${DIGIT}`, 'i'),
        new RegExp(`${DIGIT}\\s+seeds?\\b`, 'i'),
        new RegExp(`seeds?\\s*(?:data\\s*)?:\\s*${DIGIT}`, 'i'),
    ]) {
        considerFirst(re, digitValue);
    }

    //  6. The number written as a word. Arabic keeps its shop nouns and gains
    //  the seed nouns; English gains words beside its digits. «More than one»
    //  and «not one» hedge the count instead of stating it, so they stay out.
    //  ⛔ The text is FOLDED before this runs (أإآ -> ا), so the pattern must
    //  expect the folded spelling. Written with ا rather than أ?, because a
    //  pattern that still carries the hamza matches nothing at all — measured:
    //  «ستة أنواع» folds to «ستة انواع» and the first version read zero.
    for (const [word, n] of Object.entries(ARABIC_NUMBER_WORDS)) {
        considerFirst(
            new RegExp(`${NO_DELETE_BEFORE_AR}${word}[\\s]+${ADJECTIVE_SKIP}(?:ال)?(?:${SHOP_NOUNS_AR_FOLDED}|${SEED_NOUNS_AR})`),
            () => n,
        );
    }
    {
        const entityBit = entity.length >= 2 && /[a-z]/i.test(entity)
            ? `|${entity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')}(?:s|es)?`
            : '';
        const words = Object.keys(ENGLISH_NUMBER_WORDS).join('|');
        considerFirst(
            new RegExp(`(?<!\\b(?:more|less|fewer|than|not|n\'t|never|without)\\s+)\\b(${words})\\b\\s+${ADJECTIVE_SKIP}(?:${SHOP_NOUNS_EN}|${SEED_NOUNS_EN}${entityBit})\\b(?!-)${NO_PER_PAGE}${NO_DELETE_AFTER_EN}`, 'i'),
            (m) => ENGLISH_NUMBER_WORDS[m[1].toLowerCase()],
        );
    }

    let best: { index: number; value: number } | undefined;
    for (const c of found) {
        if (!best || c.index < best.index) best = c;
    }
    return best?.value;
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

/**
 *  ⛔ THE CURRENCY HE NAMED, AND NOTHING WHEN HE NAMED NONE.
 *
 *  Measured on a generated store: every product showed a bare number —
 *  <b>85</b> beside a product name. No shop prices anything that way.
 *
 *  But a currency Joe picked for him would be worse than none: a shop
 *  labelled in the wrong money is a lie about the thing he is selling, and
 *  this repository has spent a day removing exactly that kind of invention.
 *  So the unit is read from his sentence, and silence returns silence.
 */
const CURRENCIES: Array<[RegExp, string]> = [
    [/ريال|" + "\bSAR\b|\briyals?\b/i, 'ر.س'],
    [/درهم|\bAED\b|\bdirhams?\b/i, 'د.إ'],
    [/دينار|\bKWD\b|\bBHD\b|\bdinars?\b/i, 'د.ك'],
    [/جنيه|\bEGP\b|\bpounds?\b/i, 'ج.م'],
    [/دولار|\bUSD\b|\bdollars?\b|\$/i, '$'],
    [/يورو|\bEUR\b|\beuros?\b|€/i, '€'],
];

export function currencyHeNamed(request: string): string {
    const text = String(request || '');
    for (const [re, symbol] of CURRENCIES) if (re.test(text)) return symbol;
    return '';
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
    const unknown = Object.keys(row).filter(k => k !== 'id' && !spec.fields.some(f => f.key === k));
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
        /**
         *  ⛔ AND IT CARRIES AN id, BECAUSE THE ENGINE KEYS ON ONE.
         *
         *  Measured on the owner's screen, one build after the shelves were
         *  finally filled. Six honeys arrived and the page reported:
         *
         *      console_errors  Each child in a list should have a unique "key" prop
         *      dead_controls   8 of 12 buttons do nothing: «السلة 0»,
         *                      «لوحة التاجر», «أضف إلى السلة»
         *
         *  Every row the engine creates itself gets `id: uid()`, and it keys
         *  its lists and its cart on `row.id`. The seed walked straight past
         *  the one line that gives a row its identity, so six products with no
         *  id rendered as six duplicate keys and could not be added to a cart.
         *
         *  THE CLASS: a second writer for rows that the ONE writer's invariant
         *  never reached — the same shape as every «one layer, two generators»
         *  defect this session, and it produced a shop that looked complete and
         *  could not be bought from.
         *
         *  The id is stable and derived from position, not from a clock: the
         *  seed is written once into storage, and a value that changed between
         *  a build and its audit would be a different kind of bug.
         */
        const clean: Record<string, any> = { id: `seed-${out.rows.length + 1}` };
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
