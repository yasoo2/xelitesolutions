/**
 * AN ADDRESS INSIDE ARABIC STANDS ON ITS OWN, LEFT TO RIGHT.
 *
 * Seen in the ladder exam's capture of Joe's page, 2026-11-07 (L008): in an
 * Arabic delivery message «المعاينة الحية: http://127.0.0.1:8000/» read as
 * «/http://127.0.0.1:8000» — the final slash jumped to the front — and
 * «(ثم افتح http://127.0.0.1:8000/index.html)» closed with a mirrored bracket.
 * The Unicode bidi algorithm treats a URL's slashes and colons as neutral and
 * lets the Arabic around them pull them over. Isolated, the address keeps
 * its own order and the sentence keeps its own.
 */
export interface BidiPiece { text: string; ltr: boolean }

//  An address ends before the punctuation of the sentence that holds it.
const ADDRESS = /(https?:\/\/[^\s<>«»"'`]+[^\s<>«»"'`.,;:!?،؛)\]])/gu;

/** The text cut into plain pieces and the addresses inside it, in order. */
export function splitAddresses(text: string): BidiPiece[] {
    const out: BidiPiece[] = [];
    let last = 0;
    for (const m of String(text).matchAll(ADDRESS)) {
        const at = m.index ?? 0;
        if (at > last) out.push({ text: text.slice(last, at), ltr: false });
        out.push({ text: m[0], ltr: true });
        last = at + m[0].length;
    }
    if (last < text.length) out.push({ text: text.slice(last), ltr: false });
    return out.length ? out : [{ text, ltr: false }];
}
