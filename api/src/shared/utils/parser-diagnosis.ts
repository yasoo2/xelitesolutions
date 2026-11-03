/**
 * A PARSER'S REJECTION CARRIES THE PARSER'S WORDS.
 *
 * From his own run (P001, eval 2026-10-26, run-1793008690163): phase 3 asked
 * the model for src/mobile-menu.js; esbuild rejected it, the bounded syntax
 * retry was spent, and the phase failed with:
 *
 *   source_syntax_mismatch: clinic-landing-ar/src/mobile-menu.js is not valid
 *   JS syntax (Transform failed with 1 error:)
 *
 * esbuild's message is a header line, then one line per error
 * (`<stdin>:3:9: ERROR: Expected "}" but found "2"`). Every reader kept the
 * first line only, so the header was all anyone saw: the syntax retry asked
 * the model to fix a file without saying where or what, the self-fix ticket
 * and the owner's answer said the same empty words.
 *
 * This reads the structured `errors` esbuild attaches (line is 1-based,
 * column 0-based), and falls back to the message lines after the header for a
 * thrown value without them. Nothing about the error is invented: an error
 * with neither is reported as its own message.
 */
const MAX_REPORTED_ERRORS = 3;
const MAX_QUOTED_LINE = 200;

export function parserDiagnosis(error: any): string {
    const errors = Array.isArray(error?.errors) ? error.errors : [];
    const described = errors
        .filter((entry: any) => entry && String(entry.text || '').trim())
        .slice(0, MAX_REPORTED_ERRORS)
        .map((entry: any) => {
            const text = String(entry.text).trim();
            const location = entry.location;
            if (!location || !Number.isFinite(location.line)) return text;
            const where = `line ${location.line}, column ${Number(location.column || 0) + 1}`;
            // A minified line can be the whole file; the quote only points.
            const lineText = String(location.lineText || '').trim().slice(0, MAX_QUOTED_LINE);
            return lineText ? `${where}: ${text} — at \`${lineText}\`` : `${where}: ${text}`;
        });
    if (described.length) {
        const more = errors.length > described.length ? ` (+${errors.length - described.length} more)` : '';
        return `${described.join('; ')}${more}`;
    }
    const lines = String(error?.message || error || 'syntax parse failed')
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
    const body = /^(?:Transform|Build) failed with \d+ errors?:?$/iu.test(lines[0] || '') ? lines.slice(1) : lines;
    return (body.length ? body : lines).slice(0, MAX_REPORTED_ERRORS).join('; ') || 'syntax parse failed';
}
