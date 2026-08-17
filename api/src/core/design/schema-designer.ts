/**
 * THE CEILING, REMOVED.
 *
 * `data-model.ts` knows six domains. Ask for a veterinary clinic, a real-estate
 * platform, a freight system, a gym — anything outside those six — and it
 * answers with silence, and the build falls back to one table. Adding a seventh
 * domain by hand, then an eighth, is exactly the objection he raised:
 *
 *     «لماذا يُطوَّر جو بكل خطوة لينفّذها… لماذا لا يملك الأدوات المناسبة
 *      ويتم تحريكه بواسطة الذكاء الاصطناعي؟»
 *
 * He is right. So the model is let in — but ONLY where it is trustworthy on a
 * 15-watt laptop: it DESIGNS, it does not WRITE. It answers one constrained
 * JSON object describing the system's entities; a strict validator refuses
 * anything unsafe or unserious; and the deterministic generator — the one
 * already proven to produce working tables, CRUD, foreign keys and screens —
 * builds it.
 *
 * Every failure path lands on the six domains, so a machine with no model, no
 * quota and no network builds exactly what it built yesterday.
 */
import type { ModelEntity } from './data-model';
import { deriveDataModel } from './data-model';
import { namedEntities } from './named-entities';
import { declaredTables } from './declared-tables';

/** The shape the model is constrained to. Small on purpose — it must fit a 7B. */
export const ENTITY_SCHEMA: Record<string, any> = {
    type: 'object',
    properties: {
        entities: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    label_ar: { type: 'string' },
                    label_en: { type: 'string' },
                    fields: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                key: { type: 'string' },
                                type: { type: 'string', enum: ['TEXT', 'REAL', 'INT'] },
                                required: { type: 'boolean' },
                                label_ar: { type: 'string' },
                                label_en: { type: 'string' },
                            },
                            required: ['key', 'type'],
                        },
                    },
                    belongs_to: { type: 'string' },
                },
                required: ['key', 'label_ar', 'label_en', 'fields'],
            },
        },
    },
    required: ['entities'],
};

// The model may return as many tables as the request warrants; the shared
// guard rail is the same one the deterministic paths use.
const MAX_ENTITIES = 12;
const MAX_FIELDS = 8;
/** A table name is a SQL identifier and a URL segment — both, or neither. */
const SAFE = /^[a-z][a-z0-9_]{1,30}$/;
/**
 * Names that would collide with what the generator already owns.
 *
 * Exported because the list-reader needs the SAME rule: «الطلبيات» in his
 * sentence produced a real `orders` table that the base server's own
 * `POST /api/orders` then shadowed — every write came back
 * «{"ok":false,"error":"item_required"}» from a route the entity never owned.
 * A second table wearing an existing route's name is worse than no table.
 */
export const RESERVED_TABLES = new Set(['orders', 'users', 'products', 'items', 'health', 'auth', 'api', 'sqlite_master']);
const RESERVED = RESERVED_TABLES;

/**
 * The validator. It is deliberately harsher than the schema: a shape can be
 * perfectly typed and still be nonsense — a table called «table», a foreign key
 * to something nobody declared, forty columns nobody asked for.
 */
export function validateDesign(raw: any): ModelEntity[] | null {
    /**
     * TWO SHAPES REACH THIS VALIDATOR, AND IT ONLY EVER READ ONE.
     *
     * The model answers `{ entities: [...] }` with `label_ar` / `label_en`,
     * because that is the JSON schema it was constrained to. The two readers
     * that need no model — the shape inference and the declaration reader —
     * hand over a plain ARRAY of ModelEntity with `ar` / `en`.
     *
     * `Array.isArray(raw?.entities)` is `false` for an array, so every call
     * from those two returned null and fell through to the language model.
     * The offline path existed, was tested in isolation, and was unreachable
     * in the one function that calls it — which is how his log came back
     * «a known domain matched» on a request that declared its own tables.
     * Found by running it, not by reading it.
     */
    const list: any[] | null = Array.isArray(raw) ? raw
        : Array.isArray(raw?.entities) ? raw.entities
            : null;
    if (!list || !list.length) return null;

    const out: ModelEntity[] = [];
    const seen = new Set<string>();
    for (const e of list.slice(0, MAX_ENTITIES)) {
        const key = String(e?.key || '').trim().toLowerCase();
        if (!SAFE.test(key) || RESERVED.has(key) || seen.has(key)) continue;

        const fields: ModelEntity['fields'] = [];
        const fieldSeen = new Set<string>();
        for (const f of (Array.isArray(e?.fields) ? e.fields : []).slice(0, MAX_FIELDS)) {
            const fk = String(f?.key || '').trim().toLowerCase();
            if (!SAFE.test(fk) || fk === 'id' || fk === 'created_at' || fieldSeen.has(fk)) continue;
            const type = ['TEXT', 'REAL', 'INT'].includes(String(f?.type)) ? String(f.type) : 'TEXT';
            fields.push({
                key: fk, type: type as any, required: !!f?.required,
                // Both spellings, because both shapes reach here: `label_ar`
                // from the model's constrained JSON, `ar` from the readers
                // that build a ModelEntity directly.
                ar: String(f?.label_ar || f?.ar || fk).slice(0, 40),
                en: String(f?.label_en || f?.en || fk).slice(0, 40),
            });
            fieldSeen.add(fk);
        }
        // A table with no columns is a table with nothing in it.
        if (!fields.length) continue;

        seen.add(key);
        out.push({
            key,
            ar: String(e?.label_ar || e?.ar || key).slice(0, 40),
            en: String(e?.label_en || e?.en || key).slice(0, 40),
            fields,
        });
    }
    if (out.length < 2) return null;   // one table is what we already had

    // Foreign keys, resolved LAST — a link can only point at a table that
    // survived validation, and it must have a column to live in.
    const names = new Set(out.map(e => e.key));
    for (let i = 0; i < out.length; i++) {
        const declared = String((list[i] as any)?.belongs_to || (list[i] as any)?.belongsTo?.entity || '').trim().toLowerCase();
        if (!declared || !names.has(declared) || declared === out[i].key) continue;
        const fkKey = `${declared.replace(/s$/, '')}_id`;
        if (!SAFE.test(fkKey)) continue;
        if (!out[i].fields.some(f => f.key === fkKey)) {
            if (out[i].fields.length >= MAX_FIELDS) continue;
            out[i].fields.unshift({ key: fkKey, type: 'INT' as any, ar: declared, en: declared });
        }
        out[i].belongsTo = { entity: declared, key: fkKey };
    }
    return out;
}

function financeContract(requestRaw: string): ModelEntity[] | null {
    const request = String(requestRaw || '');
    const strongFinance = /(?:personal\s+finance|money\s+management|finance\s+tracker|budget(?:ing)?\s+app|financial\s+dashboard|تطبيق\s+مالي|إدارة\s+المال|ميزاني(?:ة|ات)|تتبّ?ع\s+المصاريف|إدارة\s+المصاريف)/i.test(request);
    const hasIncome = /\b(income|incomes|earning|earnings|salary|revenue)\b|دخل|إيراد|راتب/i.test(request);
    const hasExpense = /\b(expense|expenses|spending|spend|costs?)\b|مصروف|مصاريف|إنفاق|تكاليف/i.test(request);
    const hasBudget = /\b(budget|budgets|budgeting)\b|ميزاني(?:ة|ات)/i.test(request);
    if (!strongFinance && !(hasIncome && hasExpense && hasBudget)) return null;

    const T = (key: string, ar: string, en: string, required = false): ModelField => ({ key, type: 'TEXT', required, ar, en });
    const N = (key: string, ar: string, en: string, required = false): ModelField => ({ key, type: 'REAL', required, ar, en });
    return [
        {
            key: 'incomes', ar: 'الدخل', en: 'Incomes',
            fields: [T('source', 'مصدر الدخل', 'Source', true), N('amount', 'المبلغ', 'Amount', true), T('category', 'الفئة', 'Category'), T('date', 'التاريخ', 'Date', true), T('note', 'ملاحظة', 'Note')],
        },
        {
            key: 'expenses', ar: 'المصاريف', en: 'Expenses',
            fields: [T('title', 'البند', 'Item', true), N('amount', 'المبلغ', 'Amount', true), T('category', 'الفئة', 'Category'), T('date', 'التاريخ', 'Date', true), T('note', 'ملاحظة', 'Note')],
        },
        {
            key: 'budgets', ar: 'الميزانيات', en: 'Budgets',
            fields: [T('category', 'الفئة', 'Category', true), N('limit_amount', 'حد الميزانية', 'Budget limit', true), T('period', 'الفترة', 'Period', true), T('start_date', 'تاريخ البداية', 'Start date'), T('end_date', 'تاريخ النهاية', 'End date')],
        },
    ];
}

function promptFor(request: string): string {
    return `You are designing the DATABASE of a system a user asked for.

The user's request:
"""
${String(request).slice(0, 1200)}
"""

List the 2 to ${MAX_ENTITIES} tables this system needs, besides its main collection and its orders/users tables, which already exist.
Rules:
- table keys are lowercase english plurals, letters/digits/underscore only (vendors, patients, invoices)
- at most ${MAX_FIELDS} fields per table, each with a snake_case english key and type TEXT, REAL or INT
- label_ar / label_en are what a human reads on screen
- belongs_to names another table in your own list when a row cannot exist without it, otherwise leave it out
- do not invent tables the request does not imply`;
}

/**
 * The designed model, or the six known domains, or nothing — in that order.
 *
 * `onNote` receives one honest line about which of the three answered, because
 * a user who cannot tell whether a model designed his database or a keyword did
 * has been told nothing.
 */
export async function designDataModel(
    requestRaw: string,
    opts?: { onNote?: (note: string) => void; timeoutMs?: number },
): Promise<ModelEntity[]> {
    /**
     * «بفئات: طعام، مواصلات، فواتير، ترفيه» declares the OPTIONS of one
     * select field — and the shape readers below turned that list into three
     * TABLES on a live build. The clause is removed before any reader runs;
     * a genuine «الجداول: …» declaration never lives inside it.
     */
    const { stripDeclaredOptions } = require('./app-blueprints');
    const request = stripDeclaredOptions(requestRaw);

    /**
     * Finance is a coherent three-resource contract, not three incidental nouns.
     * Resolve it before shape inference so words such as «income», «expense» and
     * «budget» cannot be misread as generic money records or capabilities.
     */
    const finance = financeContract(request);
    if (finance) {
        opts?.onNote?.(`data model: finance contract — ${finance.map(e => e.key).join(', ')}`);
        return finance;
    }

    /**
     * WHAT HE WROTE DOWN COMES FIRST — BEFORE ANY RECOGNITION.
     *
     *     Tables: animals, vaccinations, doctors, appointments, invoices
     *     → data model: a known domain matched — doctors, patients, appointments
     *
     * The word «clinic» hit a hand-written domain and the domain outranked the
     * sentence: three named tables dropped, one invented. A keyword the system
     * recognises is a guess about what he means; a list he typed under the word
     * «Tables» is not a guess at all, and nothing in this file has standing to
     * overrule it.
     */
    const declared = declaredTables(request);
    if (declared.length) {
        const valid = validateDesign(declared);
        if (valid && valid.length >= 2) {
            opts?.onNote?.(`data model: the request declares its tables — ${valid.map(e => e.key).join(', ')}`);
            return valid;
        }
    }

    /**
     * WHAT HE NAMED OUTRANKS WHAT WE STOCKED.
     *
     * The canned domains used to sit here, above everything that reads the
     * request, on the argument that they are hand-checked and free. Measured
     * on his own eleven-domain sentence — «لشركة شحن: العملاء، الشحنات،
     * الحاويات، الجمارك، المستودعات، السائقون، الرواتب، الفوترة…» — that
     * argument cost him the whole request:
     *
     *     data model: a known domain matched — suppliers, movements
     *
     * Two tables, neither of them his, and ten domains he typed thrown away,
     * because a keyword in his sentence brushed against a stocked domain. A
     * hand-checked answer to a question he did not ask is not better than a
     * read of the question he did.
     *
     * So the order is now: what he DECLARED, then what his own words IMPLY,
     * and only then a stocked domain — which still earns its place on the
     * request that names nothing at all («ابنِ لي متجراً»), where there is
     * no sentence to read and a hand-checked shape is genuinely the best
     * available answer.
     */
    const { inferModel } = require('./entity-inference');

    /**
     * TWO READERS OF THE SAME SENTENCE — TAKE THE ONE THAT HEARD MORE OF IT.
     *
     * `namedEntities` matches against a curated list of nouns: high precision,
     * and blind to any noun nobody wrote down. `inferModel` reads by shape and
     * has never heard of freight. Given the same eleven-domain sentence the
     * curated reader returned five and the shape reader returned nine — and
     * because the curated one ran first and returned a non-empty answer, four
     * domains he typed were dropped without a word.
     *
     * Neither is wrong; they have different recall. So both read the sentence
     * and the fuller reading wins, with the curated one preferred on a tie
     * because its labels are hand-checked.
     */
    const listed = namedEntities(request);
    const shaped = inferModel(request).entities;
    if (listed.length || shaped.length >= 2) {
        const richer = shaped.length > listed.length ? shaped : listed;
        const valid = validateDesign(richer);
        if (valid && valid.length >= 2) {
            opts?.onNote?.(`data model: read from the request itself — ${valid.map(e => e.key).join(', ')}`
                + (richer === shaped && listed.length ? ` (${shaped.length} by shape beat ${listed.length} by name)` : ''));
            return valid;
        }
        if (listed.length >= 2) {
            opts?.onNote?.(`data model: read from the request itself — ${listed.map(e => e.key).join(', ')}`);
            return listed;
        }
    }

    /**
     * THE GENERAL PATH — «يجب ان نجد طريقه اخرى».
     *
     * He is right that adding a domain per prompt is not a plan: «هذا يعني ان
     * يجب ان اطور جو لالاف الميزات … وهذا غير ممكن». A stocked domain is a
     * whitelist — six domains, forty nouns — and a whitelist of the world has
     * no end.
     *
     * This reads the request by the SHAPE of its words: what a noun looks
     * like, what a gerund looks like, which suffixes mark a person, a payment,
     * an appointment, a container. It has never heard of a veterinary clinic
     * or a freight company and it builds both, because that list grows with a
     * language and not with the world.
     *
     * It runs BEFORE the model and before the stock: it costs nothing, works
     * with every provider rate-limited, and never invents a table it cannot
     * give columns.
     */
    const inferred = inferModel(request);
    if (inferred.entities.length >= 2) {
        const valid = validateDesign(inferred.entities);
        if (valid && valid.length >= 2) {
            opts?.onNote?.(`data model: inferred from the request's own words — ${valid.map(e => e.key).join(', ')}`
                + (inferred.capabilities.length ? ` (not tables: ${inferred.capabilities.slice(0, 4).join(', ')})` : ''));
            return valid;
        }
    }

    // Only now: a request that named nothing of its own.
    const known = deriveDataModel(request);
    if (known.length) { opts?.onNote?.(`data model: nothing was named, so a known domain answered — ${known.map(e => e.key).join(', ')}`); return known; }

    if (String(process.env.JOE_AI_SCHEMA || '1') === '0') return [];

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { askStructured } = require('../llm/structured');
        const designed = await askStructured({
            prompt: promptFor(request),
            schema: ENTITY_SCHEMA,
            timeoutMs: opts?.timeoutMs ?? 120_000,
            onNote: (n: string) => opts?.onNote?.(`data model: ${n}`),
        }, validateDesign);
        if (designed && designed.length) {
            opts?.onNote?.(`data model: designed for this request — ${designed.map((e: ModelEntity) => e.key).join(', ')}`);
            return designed;
        }
    } catch { /* a build is never blocked on a model */ }

    opts?.onNote?.('data model: no domain matched and no model answered — building the single-collection system');
    return [];
}
