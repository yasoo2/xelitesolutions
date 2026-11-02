/**
 * Request classifiers for detecting CLI/CSV requests.
 * Extracted to a separate module to avoid circular dependencies.
 */

// A SECURITY PRIMITIVE IMPORTS NOTHING. It lives alone in this file, and
// not beside the workspace service, for two reasons: a boundary check that
// depends on a service can be broken by that service, and a check that is
// costly to import gets re-typed inline at the call site — which is exactly
// how one question came to have fourteen slightly-different answers.

/**
 * Detects if the request is a CLI/utility/script request (not a web system).
 * Uses the same signals as classifyBuildScope for consistency.
 */
export function isCliRequest(goalRaw: string): boolean {
    const cliSignals = /\b(?:cli|command[- ]?line|utility|script|tool|utility\s+script|command[- ]?line\s+tool|console\s+app|terminal\s+app|standalone\s+(?:tool|script|utility)|runnable\s+(?:script|tool|utility)|exit\s+code|stdin|stdout|stderr|argument\s+parsing|flag\s+parsing)\b/i;
    return cliSignals.test(goalRaw || '');
}

/**
 * Detects if the request is a CSV/TSV input with columns (input data, not a persistent record schema).
 */
export function isCsvInputRequest(goalRaw: string): boolean {
    const csvInputSignals = /\b(?:csv|tsv)\b.*\b(?:column|field|header)\b|\bcolumn\b.*\b(?:csv|tsv)\b|(?:\binput\b|\bfile\b).*\b(?:csv|tsv)\b|\b(?:csv|tsv)\b.*\b(?:input|file)\b/i;
    return csvInputSignals.test(goalRaw || '');
}