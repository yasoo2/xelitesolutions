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
 * Parse the first JSON value in a model's reply, tolerating the prose around it
 * and a ```json fence. Returns null rather than throwing — a router that dies
 * on a stray sentence is worse than one that falls back.
 */
export function parseFirstJson<T = any>(text: string): T | null {
    const raw = String(text ?? '').trim();
    if (!raw) return null;
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    for (const candidate of [fenced?.[1], raw]) {
        const span = firstJsonSpan(String(candidate || ''));
        if (!span) continue;
        try { return JSON.parse(span) as T; } catch { /* try the next candidate */ }
    }
    return null;
}
