/**
 * THE FIRST WHOLE JSON OBJECT IN A MODEL'S ANSWER.
 *
 * From his own run:
 *
 *   [IntelligentRouter] Advanced analysis failed, falling back to regex:
 *   SyntaxError: Unexpected non-whitespace character after JSON at position 166
 *       at advancedAnalyzeTask
 *
 * The extractor was `text.match(/\{[\s\S]*\}/)` — greedy, so it reaches for the
 * LAST closing brace in the whole reply. A model that answers with its JSON and
 * then adds a sentence containing a brace hands that regex a span with two
 * objects glued together, and `JSON.parse` refuses it. The analysis was thrown
 * away and every request fell back to regex routing, silently, forever.
 *
 * Reading the braces instead of guessing at them costs nothing and cannot make
 * that mistake: strings are skipped, escapes are honoured, and the scan stops
 * at the brace that closes the object it started.
 */

/**
 * Where the value opening at `start` closes, or -1 when it never does.
 * Every opener the scan meets outside a string is answered on the way (`memo`):
 * a scan begun at that opener would follow exactly the same characters, so a
 * reply is read once however many brackets its prose holds.
 */
function closeOf(s: string, start: number, memo: Map<number, number>): number {
    const known = memo.get(start);
    if (known !== undefined) return known;
    const open: Record<string, number[]> = { '{': [], '[': [] };
    let inStr = false;
    let quote = '';
    for (let i = start; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (c === '\\') { i++; continue; }       // escaped char, whatever it is
            if (c === quote) inStr = false;
            continue;
        }
        if (c === '"' || c === "'") { inStr = true; quote = c; continue; }
        if (c === '{' || c === '[') { open[c].push(i); continue; }
        if (c === '}' || c === ']') {
            const opener = open[c === '}' ? '{' : '['].pop();
            if (opener === undefined) continue;
            memo.set(opener, i);
            if (opener === start) return i;
        }
    }
    for (const stack of Object.values(open)) for (const opener of stack) memo.set(opener, -1);
    return -1;
}

/**
 * True when what follows an opener that never closes reads as JSON up to the
 * next opener or the end: strings, numbers, literals, `:` and `,`. That is a
 * value the reply was cut inside, and every later bracket is a piece of it —
 * never an answer of its own. Anything else (words, a full stop) means the
 * bracket was prose, «use [ for lists», and the answer may still follow.
 */
function opensCutValue(s: string, opener: number): boolean {
    for (let i = opener + 1; i < s.length; i++) {
        const c = s[i];
        if (/\s|[:,0-9.+\-eE]/u.test(c)) continue;
        if (c === '"') {
            let j = i + 1;
            for (; j < s.length; j++) {
                if (s[j] === '\\') { j++; continue; }
                if (s[j] === '"') break;
            }
            if (j >= s.length) return true;             // cut inside a string
            i = j;
            continue;
        }
        if (c === '{' || c === '[') return true;
        const literal = /^(?:true|false|null)/u.exec(s.slice(i, i + 5));
        if (literal) { i += literal[0].length - 1; continue; }
        return false;
    }
    return true;
}

/**
 * Every whole JSON-shaped value in the text, in order: each balanced `{…}` or
 * `[…]` at the top level (a value nested in one already found is part of it,
 * never a candidate of its own). Nothing bounds the search but the text.
 * A bracket in the prose that never closes is passed over; a value the reply
 * was cut inside ends the search, so a fragment of it is never offered.
 */
export function balancedJsonSpans(text: string): string[] {
    const s = String(text ?? '');
    const memo = new Map<number, number>();
    const out: string[] = [];
    let from = 0;
    while (from < s.length) {
        let start = from;
        while (start < s.length && s[start] !== '{' && s[start] !== '[') start++;
        if (start >= s.length) break;
        const end = closeOf(s, start, memo);
        if (end >= 0) {
            out.push(s.slice(start, end + 1));
            from = end + 1;
            continue;
        }
        if (opensCutValue(s, start)) break;
        from = start + 1;
    }
    return out;
}

/** The substring of the first balanced `{…}` (or `[…]`), or '' when there is none. */
export function firstJsonSpan(text: string): string {
    return balancedJsonSpans(text)[0] ?? '';
}

/**
 * Every place a model's JSON answer can sit, best first.
 *
 * From his own run (P001, a 31-minute plan thrown away):
 *
 *   [ProjectPlanner] initial-parse-failed SyntaxError: Unexpected token 'b',
 *   "bash\ncd c"... is not valid JSON   (response 7800 chars, `{` … `}`)
 *
 * The reply WAS the plan. One of its strings — the README it planned — held
 * a ```bash block, and the reader took the first fence anywhere in the text
 * as the answer. A fence inside a string is the answer's content, not its
 * wrapper. So: when the reply opens with JSON, that whole value comes first
 * (strings are skipped, so nothing inside them can cut it); then the bodies
 * of ```json or bare fences; then every balanced value in the prose, in order.
 *
 * «Every», not «the first»: «Here is the plan for [clinic-landing-ar]: {…}»
 * offered only `[clinic-landing-ar]`, which is not JSON, and the plan after it
 * was never read.
 */
export function jsonReplyCandidates(text: string): string[] {
    const raw = String(text ?? '').trim();
    if (!raw) return [];
    const out: string[] = [];
    const add = (candidate: string) => { if (candidate && !out.includes(candidate)) out.push(candidate); };
    if (raw[0] === '{' || raw[0] === '[') add(firstJsonSpan(raw));
    for (const fence of raw.matchAll(/```([A-Za-z0-9_+-]*)[^\S\n]*\n?([\s\S]*?)```/g)) {
        if (fence[1] && !/^json5?c?$/i.test(fence[1])) continue;   // ```bash is code he asked for
        for (const span of balancedJsonSpans(fence[2])) add(span);
    }
    for (const span of balancedJsonSpans(raw)) add(span);
    return out;
}

/**
 * A RAW LINE BREAK INSIDE A STRING HAS ONE MEANING, AND IT IS NOT «REFUSE».
 *
 * From his own run (P001, run-1793116203492): six model-authored sections,
 * 8 to 31 minutes of generation each, and four came back refused as «the
 * reply held no usable file». Reproduced on the same prompt: a 4.5 KB Cta in
 * `{"files":{"Cta":"…"}}` with every line break escaped as `\n` but ONE,
 *
 *     SyntaxError: Bad control character in string literal … (line 3 column 4560)
 *
 * and `JSON.parse` threw the whole file away for it. A small model writing a
 * file inside a JSON string slips like this all the time. Inside a JSON
 * string a raw newline, tab or other control character can only mean
 * itself, so it is escaped and the span parsed again. Nothing else is
 * guessed: outside strings the text is left as written, and a reply that is
 * still not JSON stays refused.
 */
export function escapeControlCharsInStrings(span: string): string {
    const s = String(span ?? '');
    let out = '';
    let inStr = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (inStr) {
            if (c === '\\') { out += c + (s[i + 1] ?? ''); i++; continue; }
            if (c === '"') inStr = false;
            const code = c.charCodeAt(0);
            if (code < 0x20) {
                out += c === '\n' ? '\\n' : c === '\r' ? '\\r' : c === '\t' ? '\\t'
                    : '\\u' + code.toString(16).padStart(4, '0');
                continue;
            }
        } else if (c === '"') inStr = true;
        out += c;
    }
    return out;
}

/** `JSON.parse`, then once more with raw control characters in strings escaped. Throws as `JSON.parse` does. */
export function parseModelJson<T = any>(span: string): T {
    try {
        return JSON.parse(span) as T;
    } catch (first) {
        const repaired = escapeControlCharsInStrings(span);
        if (repaired === span) throw first;
        return JSON.parse(repaired) as T;
    }
}

/**
 * Parse the first JSON value in a model's reply, tolerating the prose around it
 * and a ```json fence. Returns null rather than throwing — a router that dies
 * on a stray sentence is worse than one that falls back.
 */
export function parseFirstJson<T = any>(text: string): T | null {
    for (const span of jsonReplyCandidates(text)) {
        try { return parseModelJson<T>(span); } catch { /* try the next candidate */ }
    }
    return null;
}

/**
 * ONE WAY TO READ A MODEL'S JSON ANSWER.
 *
 * Every reader of a model's JSON reply kept its own copy of «first fence, else
 * first `{` to last `}`, then JSON.parse», so each fix reached one reader and
 * not the others: the raw line break that parseModelJson tolerates still
 * threw away named requirements, verdicts, plans and intents; the README fence
 * that jsonReplyCandidates learned to pass over still cut the authored readers;
 * and a sentence with a brace after the answer still glued two objects into one
 * span for every greedy reader.
 *
 * Here the candidates come from jsonReplyCandidates, each is parsed by
 * parseModelJson, and `pick` says whether it is the answer this reader asked
 * for — returning the value to hand back, or undefined/null to try the next
 * candidate. What a reader then accepts is its own decision, unchanged.
 */
export function readModelJson<T>(text: string, pick: (parsed: any) => T | undefined | null): T | undefined {
    for (const span of jsonReplyCandidates(text)) {
        let parsed: any;
        try { parsed = parseModelJson(span); } catch { continue; }
        const picked = pick(parsed);
        if (picked !== undefined && picked !== null) return picked;
    }
    return undefined;
}

/** The first JSON object (not an array, not a scalar) in a model's reply, or null. */
export function readModelJsonObject<T extends Record<string, any> = Record<string, any>>(text: string): T | null {
    return readModelJson<T>(text, parsed => (parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as T : undefined)) ?? null;
}

const TRAILING_COMMA = /,\s*([}\]])/g;

/**
 * A model's JSON ARRAY answer — a plan of steps — or null.
 *
 * The field log: «Dynamic DAG generation failed: SyntaxError: Expected ',' or
 * '}' after property value at position 1306» — one bad character from a weak
 * model threw away an otherwise valid 5-node plan. So every array the reply
 * holds is read the shared way first, then the repairs a weak model needs are
 * tried in turn (trailing commas, typographic quotes, objects with no comma
 * between them) — on each candidate and on the widest `[…]` span — and as the
 * last resort every whole object inside that span that parses is kept: four
 * good nodes beat zero. A salvage is said, never silent.
 */
export function parseModelJsonArray(text: string, onSalvage?: (kept: number) => void): any[] | null {
    const cleaned = String(text ?? '').replace(/```(?:json)?/gi, '');
    const widest = cleaned.match(/\[[\s\S]*\]/)?.[0] || '';
    const spans = [...jsonReplyCandidates(text).filter(span => span.startsWith('[')), widest].filter(Boolean);
    const repairs: Array<(span: string) => string> = [
        span => span,
        span => span.replace(TRAILING_COMMA, '$1'),
        span => span.replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(TRAILING_COMMA, '$1'),
        span => span.replace(/\}\s*\{/g, '},{').replace(TRAILING_COMMA, '$1'),
    ];
    for (const span of [...new Set(spans)]) {
        for (const repair of repairs) {
            try {
                const value = parseModelJson(repair(span));
                if (Array.isArray(value)) return value;
            } catch { /* the next repair */ }
        }
    }
    if (!widest) return null;
    // Salvage: each whole object, read with strings skipped (a `}` inside a
    // step's description no longer splits it). An object that never closes is
    // where the reply was cut; nothing after it is a node of its own.
    const kept: any[] = [];
    const memo = new Map<number, number>();
    for (let at = widest.indexOf('{'); at >= 0;) {
        const end = closeOf(widest, at, memo);
        if (end < 0) break;
        try { kept.push(parseModelJson(widest.slice(at, end + 1).replace(TRAILING_COMMA, '$1'))); } catch { /* the broken one is dropped */ }
        at = widest.indexOf('{', end + 1);
    }
    if (kept.length) onSalvage?.(kept.length);
    return kept.length ? kept : null;
}
