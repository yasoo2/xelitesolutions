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

/** The substring of the first balanced `{…}` (or `[…]`), or '' when there is none. */
export function firstJsonSpan(text: string): string {
    const s = String(text ?? '');
    for (let start = 0; start < s.length; start++) {
        const open = s[start];
        if (open !== '{' && open !== '[') continue;
        const close = open === '{' ? '}' : ']';
        let depth = 0;
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
            if (c === open) depth++;
            else if (c === close) {
                depth--;
                if (depth === 0) return s.slice(start, i + 1);
            }
        }
        // Unbalanced from here — a later opener cannot help, the text is truncated.
        return '';
    }
    return '';
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
 * of ```json or bare fences; then the first balanced value in the prose.
 */
export function jsonReplyCandidates(text: string): string[] {
    const raw = String(text ?? '').trim();
    if (!raw) return [];
    const out: string[] = [];
    const add = (candidate: string) => { if (candidate && !out.includes(candidate)) out.push(candidate); };
    if (raw[0] === '{' || raw[0] === '[') add(firstJsonSpan(raw));
    for (const fence of raw.matchAll(/```([A-Za-z0-9_+-]*)[^\S\n]*\n?([\s\S]*?)```/g)) {
        if (fence[1] && !/^json5?c?$/i.test(fence[1])) continue;   // ```bash is code he asked for
        add(firstJsonSpan(fence[2]));
    }
    add(firstJsonSpan(raw));
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
