/**
 * WHEN HE WRITES THE TABLES DOWN, THOSE ARE THE TABLES.
 *
 * From his own run, with the request in front of it:
 *
 *     Build a complete system for a veterinary clinic called "Dar Al-Rifq"…
 *     Tables: animals, vaccinations, doctors, appointments, invoices
 *
 * and the trace answered:
 *
 *     data model: a known domain matched — doctors, patients, appointments
 *
 * Three of the five tables he named were dropped, and one he never mentioned —
 * `patients` — was invented, because the word «clinic» hit a hand-written
 * domain and the domain outranked the sentence. `animals` in a VETERINARY
 * clinic is not a detail; it is the whole subject.
 *
 * The order was the defect. `designDataModel` asked, in this sequence:
 * a keyword the system recognises → the list the user typed → the shapes of
 * his words → a language model. The first of those is a whitelist of six
 * domains, and it was sitting in front of the only source that cannot be
 * wrong about what he wants: what he wrote.
 *
 * So an EXPLICIT declaration — «Tables: …», «الجداول: …» — now runs first and
 * answers alone. Not a guess about the domain, not a shape heuristic: a label
 * he typed, followed by a list, which is as close to a specification as a
 * sentence gets. Everything else keeps its old order behind it.
 *
 * This reads a declaration, never prose. «a system for a clinic: it should be
 * fast» has a colon and no table in it, and this returns nothing there — the
 * label before the colon has to actually say «tables».
 */
import type { ModelEntity } from './data-model';
import { inferKind, fieldsForKind, keyForPhrase, NEVER, MAX_MODEL_ENTITIES } from './entity-inference';

/**
 * The label that turns a colon into a declaration. «Tables:» and «الجداول:»
 * are what a person writes when they have decided; «with:» and «features:» are
 * not — those are prose, and prose is read by the shape reader, not by this.
 */
const DECLARATION =
    /(?:^|[\n.!?؟•·-]\s*|\s)(?:tables?|entities|data\s*model|جداول|الجداول|كيانات|الكيانات|قواعد\s*البيانات)\s*[:：]\s*([^\n]{2,400})/i;

/**
 * The separators a list is written with. Same shapes as the rest of the
 * project: Arabic glues its «و» to the front of the next word, so it is
 * «space + waw + an Arabic letter», never `\bو` — `\b` is defined by `\w`,
 * which contains no Arabic letter at all.
 */
const SPLIT = /(?:\s*(?:،|,|؛|;|\/|\||\+)\s*)|(?:\s+and\s+)|(?:\s+و(?=[ء-ي]))/i;

/** Where the list stops and the next sentence begins. */
const TAIL = /\s+(?:with|and with|مع|بتصميم|وبتصميم)\s+/i;

/**
 * The tables the request declares, or nothing.
 *
 * Nothing is the common answer, and it is the right one: most requests do not
 * declare tables, and a wrong table is worse than no table because the entire
 * system — routes, screens, admin panel — is generated from it.
 */
export function declaredTables(request: string, limit = MAX_MODEL_ENTITIES): ModelEntity[] {
    const text = String(request || '');
    let m = text.match(DECLARATION);
    let listed: string;
    if (m) {
        listed = String(m[1]).split(TAIL)[0];
    } else {
        /**
         * THE DATABASE BLOCK OF A STRUCTURED BRIEF — one table per line.
         *
         * The TaskFlow live brief declared its schema exactly the way a
         * person writes a specification:
         *
         *     DATABASE
         *     ==================
         *     At minimum create:
         *
         *     users
         *     projects
         *     tasks
         *     activities
         *     notifications
         *
         * The inline reader above stops at the first newline, so a list
         * WRITTEN AS LINES was invisible — and the shape reader then chewed
         * the brief's instruction verbs into logins/logouts/appropriates.
         * A creation label followed by consecutive one-word lines is as
         * explicit as «Tables:» ever was; prose ends the list.
         */
        const block = text.match(
            /(?:at\s+minimum\s+create|create\s+(?:at\s+least|these\s+tables)|الجداول\s+المطلوبة|أنشئ\s+على\s+الأقل)\s*[:：]\s*\n((?:\s*\n)?(?:[ \t]*[\p{L}_][\p{L}\p{N}_]{1,23}[ \t]*\n){2,8})/iu,
        );
        if (!block) return [];
        listed = block[1].split(/\n/).map(s => s.trim()).filter(Boolean).join('، ');
    }
    const words = listed.split(SPLIT)
        .map(w => w.replace(/[.،؛!?"'()]+$/g, '').trim())
        .filter(Boolean);
    // One item after a «Tables:» label is a heading, not a list.
    if (words.length < 2) return [];

    const out: ModelEntity[] = [];
    const seen = new Set<string>();
    for (const word of words) {
        if (out.length >= limit) break;
        // «invoices for each visit» is a sentence that has resumed; a declared
        // table is a noun, at most a noun with its article or one qualifier.
        if (word.split(/\s+/).length > 2) continue;
        const key = keyForPhrase(word);
        if (!key || key.length < 3 || key.length > 40) continue;
        // The system already owns `orders` and `users`; a second table under
        // those names is a table nobody can reach, measured on his own build.
        if (NEVER.has(key) || seen.has(key)) continue;
        seen.add(key);
        out.push({ key, ar: word.trim(), en: key, fields: fieldsForKind(inferKind(word)) } as ModelEntity);
    }
    return out.length >= 2 ? out : [];
}

/** The names in the declaration this system already serves, so the report can say so. */
export function declaredButOwned(request: string): string[] {
    const m = String(request || '').match(DECLARATION);
    if (!m) return [];
    const out: string[] = [];
    for (const word of String(m[1]).split(TAIL)[0].split(SPLIT).map(w => w.trim()).filter(Boolean)) {
        if (word.split(/\s+/).length > 2) continue;
        const key = keyForPhrase(word);
        if (key && NEVER.has(key) && !out.includes(key)) out.push(key);
    }
    return out;
}
