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
/** Names that would collide with what the generator already owns. */
const RESERVED = new Set(['orders', 'users', 'products', 'health', 'auth', 'api', 'sqlite_master']);

/**
 * The validator. It is deliberately harsher than the schema: a shape can be
 * perfectly typed and still be nonsense — a table called «table», a foreign key
 * to something nobody declared, forty columns nobody asked for.
 */
export function validateDesign(raw: any): ModelEntity[] | null {
    const list = Array.isArray(raw?.entities) ? raw.entities : null;
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
                ar: String(f?.label_ar || fk).slice(0, 40),
                en: String(f?.label_en || fk).slice(0, 40),
            });
            fieldSeen.add(fk);
        }
        // A table with no columns is a table with nothing in it.
        if (!fields.length) continue;

        seen.add(key);
        out.push({
            key,
            ar: String(e?.label_ar || key).slice(0, 40),
            en: String(e?.label_en || key).slice(0, 40),
            fields,
        });
    }
    if (out.length < 2) return null;   // one table is what we already had

    // Foreign keys, resolved LAST — a link can only point at a table that
    // survived validation, and it must have a column to live in.
    const names = new Set(out.map(e => e.key));
    for (let i = 0; i < out.length; i++) {
        const declared = String((list[i] as any)?.belongs_to || '').trim().toLowerCase();
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
    const known = deriveDataModel(request);
    // The deterministic domains are BETTER than a model guess when they match:
    // they are hand-checked, and they cost nothing.
    if (known.length) { opts?.onNote?.(`data model: a known domain matched — ${known.map(e => e.key).join(', ')}`); return known; }
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
