/**
 * A COMMAND'S FAILURE LEADS WITH THE FAILURE.
 *
 * From his own run (P001, eval 2026-10-26):
 *
 *   - الخطأ: `npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:
 *   npm warn allow-scripts   esbuild@0.21.5 (install: (install scripts present))
 *   npm warn allow-scripts
 *   npm warn allow-scripts Run `n`
 *
 * The real line, `npm error could not determine executable to run`, came fifth.
 * Every short view of a failure reads it from the head — the 220-char headline
 * he is shown, the repair ticket, npm's 600-char timeout evidence, the eval's
 * failure class — so a tool that prints warnings or install progress before it
 * fails had its diagnosis cut away, and the more packages warned, the further.
 *
 * Only the LEADING run of lines that are noise by their own words (warnings,
 * npm notices, install/audit/funding progress, blank lines) moves behind the
 * rest. Nothing is dropped, and everything after the first meaningful line
 * keeps its order, so a stack trace or a `file:line` above a SyntaxError stays
 * where it was. Text that is noise from top to bottom is returned unchanged.
 */

const NOISE_LINE: RegExp[] = [
    /^\s*$/u,
    /^\s*npm (?:warn|notice)\b/iu,
    /^\s*warn(?:ing)?\b\s*[:\]]?/iu,
    /^\s*\[?warn(?:ing)?\]/iu,
    /^\s*\(node:\d+\) (?:\[[A-Z0-9_]+\] )?\w*Warning\b/u,
    /^\s*\(Use `node --trace-(?:warnings|deprecation)/u,
    /^\s*(?:added|removed|changed) \d+ packages?\b/iu,
    /^\s*up to date,? (?:and )?audited \d+ packages?/iu,
    /^\s*\d+ packages? (?:is|are) looking for funding/iu,
    /^\s*run `npm fund`/iu,
    /^\s*(?:found )?\d+ vulnerabilit(?:y|ies)\b/iu,
    /^\s*To address (?:all )?issues/iu,
    /^\s*npm audit fix\b/iu,
    /^\s*Run `npm audit`/iu,
];

function isNoiseLine(line: string): boolean {
    return NOISE_LINE.some((pattern) => pattern.test(line));
}

export function leadWithFailure(text: unknown): string {
    const value = String(text ?? '');
    if (!value) return value;
    const separator = value.includes('\r\n') ? '\r\n' : '\n';
    const lines = value.split(/\r?\n/u);
    let lead = 0;
    while (lead < lines.length && isNoiseLine(lines[lead])) lead += 1;
    if (lead === 0 || lead === lines.length) return value;
    const rest = lines.slice(lead);
    while (rest.length && !rest[rest.length - 1].trim()) rest.pop();
    const before = lines.slice(0, lead).filter((line) => line.trim());
    return [...rest, ...before].join(separator);
}
