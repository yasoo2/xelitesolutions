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

const MAX_ENTITIES = 5;
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
    request: string,
    opts?: { onNote?: (note: string) => void; timeoutMs?: number },
): Promise<ModelEntity[]> {
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

    const known = deriveDataModel(request);
    // The deterministic domains are BETTER than a model guess when they match:
    // they are hand-checked, and they cost nothing.
    if (known.length) { opts?.onNote?.(`data model: a known domain matched — ${known.map(e => e.key).join(', ')}`); return known; }

    /**
     * AND BEFORE ANY MODEL IS ASKED — READ WHAT HE ACTUALLY WROTE.
     *
     * «ابنِ نظاماً لمشتل نباتات: النباتات والموردون والطلبيات». He listed the
     * tables himself, after a colon, separated by «و». That build produced a
     * generic «إضافة سجلّ» form with العنوان/التفاصيل/قيمة, because «مشتل» is
     * not one of the six domains and every provider was rate-limited that
     * minute — so the model was never reached and the list was never read.
     *
     * Needing a 70-billion-parameter model to parse a list a human typed is
     * not intelligence, it is dependence. This costs nothing, works offline,
     * and declines whenever it is not sure.
     */
    const listed = namedEntities(request);
    if (listed.length) {
        opts?.onNote?.(`data model: read from the request itself — ${listed.map(e => e.key).join(', ')}`);
        return listed;
    }

    /**
     * AND THEN THE GENERAL PATH — «يجب ان نجد طريقه اخرى».
     *
     * He is right that adding a domain per prompt is not a plan: «هذا يعني ان
     * يجب ان اطور جو لالاف الميزات … وهذا غير ممكن». Everything above this
     * line is a whitelist — six domains, forty nouns — and a whitelist of the
     * world has no end.
     *
     * This reads the request by the SHAPE of its words: what a noun looks
     * like, what a gerund looks like, which suffixes mark a person, a payment,
     * an appointment, a container. It has never heard of a veterinary clinic
     * or a car rental and it builds both, because that list grows with a
     * language and not with the world.
     *
     * It runs BEFORE the model, not after: it costs nothing, works with every
     * provider rate-limited, and never invents a table it cannot give columns.
     */
    const { inferModel } = require('./entity-inference');
    const inferred = inferModel(request);
    if (inferred.entities.length >= 2) {
        const valid = validateDesign(inferred.entities);
        if (valid && valid.length >= 2) {
            opts?.onNote?.(`data model: inferred from the request's own words — ${valid.map(e => e.key).join(', ')}`
                + (inferred.capabilities.length ? ` (not tables: ${inferred.capabilities.slice(0, 4).join(', ')})` : ''));
            return valid;
        }
    }

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
