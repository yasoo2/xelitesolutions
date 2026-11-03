/**
 * JOE'S ANSWER APPEARS WORD BY WORD — the arithmetic, kept pure.
 *
 * «وادخال هيك كلمة كلمة» — the owner, 2026-11-02. A finished answer used to
 * land on screen all at once. A reply that arrives while the user is
 * watching now unfolds a word at a time; history loaded from the server
 * appears whole, as it should.
 *
 * The pace follows the length: short replies read at a natural speed, long
 * ones speed up so none takes more than a few seconds.
 */

/** Words and the spaces after them, so joining a prefix keeps the original line breaks. */
export function revealTokens(text: string): string[] {
    const s = String(text || '');
    const out: string[] = [];
    const re = /\S+\s*/g;
    const lead = /^\s*/.exec(s)?.[0] || '';
    let m: RegExpExecArray | null;
    let first = true;
    while ((m = re.exec(s))) {
        out.push(first ? lead + m[0] : m[0]);
        first = false;
    }
    return out;
}

/** The first `words` words of the text, exactly as written. */
export function revealPrefix(tokens: string[], words: number): string {
    return tokens.slice(0, Math.max(0, words)).join('');
}

export const REVEAL_MIN_MS = 500;
export const REVEAL_MAX_MS = 4500;
export const REVEAL_MS_PER_WORD = 32;

/** How long the whole reveal takes, in milliseconds. */
export function revealDuration(wordCount: number): number {
    return Math.min(REVEAL_MAX_MS, Math.max(REVEAL_MIN_MS, wordCount * REVEAL_MS_PER_WORD));
}

/** How many words are shown `elapsed` ms after the reveal began. */
export function wordsAt(elapsed: number, wordCount: number): number {
    if (wordCount <= 0) return 0;
    const total = revealDuration(wordCount);
    if (elapsed >= total) return wordCount;
    return Math.max(1, Math.ceil((elapsed / total) * wordCount));
}
