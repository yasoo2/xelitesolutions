/**
 * «لا أريد رموزاً داخل اللوجز أو داخل دردشة جو» — the owner wants a formal,
 * grounded surface. The engine decorates its lines with pictographs (brains,
 * folders, gears); this strips emoji and dingbats at RENDER time only, so the
 * stored evidence keeps its original text for the raw receipts.
 *
 * Deliberately NOTHING else is touched: no whitespace collapsing and no
 * leading-character trimming, because the same function runs over markdown
 * with indented code blocks where every space is meaningful.
 */
const PICTOGRAPHS = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{2049}\u{203C}\u{2139}]️?[ ]?/gu;

export function stripPictographs(input: unknown): string {
    return String(input ?? '').replace(PICTOGRAPHS, '');
}

/**
 *  ONE STRING, TWO SURFACES, AND ONLY ONE OF THEM DRAWS MARKDOWN.
 *
 *  Seen on his screen, the same sentence in both panels at once:
 *
 *      chat:  One thing before I start — so I build what you actually mean
 *             1. What is the site about? A restaurant, a store, a company…
 *      logs:  **One thing before I start** — so I build what you actually
 *             1. **What is the site about?** A restaurant, a store, a…
 *
 *  The chat renders markdown; the log panel is a transcript and does not.
 *  So the log showed him the syntax — asterisks, backticks, list markers —
 *  as if Joe had typed them at him.
 *
 *  A transcript should carry what was SAID, not how it was marked up. This
 *  removes the marks and keeps every word, including the list numbering,
 *  which markdown would have drawn and a log has to spell.
 */
//  ONE TABLE, IMPORTED — NOT A SECOND COPY.
//
//  These rules now run in two places: here, on an event arriving live,
//  and on the server, on the same event read back from run-evidence when
//  he reopens a past session. Two copies would drift the first time one
//  was edited, and a restored log would stop reading like a live one.
export { asPlainLine, logTextFor } from '../../../api/src/core/session/log-line';


/**
 *  A LOG CLOCK ASKS THE INTERFACE, NEVER THE OPERATING SYSTEM.
 *
 *  `new Date().toLocaleTimeString()` with no argument reads the machine's
 *  locale. His Windows is Arabic, so an English interface was stamping
 *  every log line «[5:12:34 ص]» — an Arabic meridiem inside an English
 *  panel, from a call that never asked which language the app was in.
 *
 *  A timestamp in a log is machine data. Twenty-four hours, zero-padded,
 *  built from the numbers themselves so no locale is consulted at all —
 *  which is what every developer tool prints, and reads identically in
 *  every language.
 */
export function logStamp(at: Date = new Date()): string {
    const two = (n: number) => String(n).padStart(2, '0');
    return `${two(at.getHours())}:${two(at.getMinutes())}:${two(at.getSeconds())}`;
}

/**
 *  AND A TIME A PERSON READS FOLLOWS THE INTERFACE.
 *
 *  The other half of the same defect. `logStamp` is for machine lines;
 *  this is for the times shown to him in words — «Updated 5:12», a
 *  trace header, a note beside a screenshot. Those must be written in
 *  the language he set the app to, which is the one thing an argument-
 *  less `toLocaleTimeString()` never asks.
 *
 *  Passing the language explicitly is deliberate: a default here would
 *  be a second answer to «which language is this», and this repository
 *  has paid for that question having several answers already.
 */
export function uiTime(value: unknown, language: string, withDate = false): string {
    const at = value instanceof Date ? value : new Date(Number(value) || String(value ?? ''));
    if (Number.isNaN(at.getTime())) return '';
    const lang = String(language || 'en').split('-')[0] || 'en';
    try {
        return withDate ? at.toLocaleString(lang) : at.toLocaleTimeString(lang);
    } catch {
        //  An unknown tag must not take the line down with it.
        return withDate ? at.toLocaleString() : at.toLocaleTimeString();
    }
}
