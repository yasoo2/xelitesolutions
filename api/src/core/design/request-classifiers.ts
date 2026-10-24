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
 * THE SAME TWO READINGS IN BOTH LANGUAGES — one source for classifyBuildScope
 * and PlanningEngine.isCliRequest, which each kept a private English-only copy.
 *
 * Eval round 15 (2026-10-24): «اكتب أداة سطر أوامر بلغة Python تقرأ ملف CSV
 * فيه الطلبات لـمغسلة ملابس …» matched no English word, so the data word
 * «الطلبات» made a command-line tool a database SYSTEM while its English twin
 * («Write a Python command-line tool that reads a CSV file of orders …») was
 * a CLI. `\b` cannot bound an Arabic word in JS, so the Arabic alternatives
 * use Unicode lookarounds; the English ones keep their ASCII `\b`.
 */
const CLI_SIGNALS = new RegExp([
    '\\b(?:cli|command[- ]?line|utility|script|tool|utility\\s+script|command[- ]?line\\s+tool|console\\s+app|terminal\\s+app|standalone\\s+(?:tool|script|utility)|runnable\\s+(?:script|tool|utility)|exit\\s+code|stdin|stdout|stderr|argument\\s+parsing|flag\\s+parsing)\\b',
    // سطر الأوامر / الطرفية / كونسول / سكربت (never the «سكريبت» of «جافا سكريبت») / نص برمجي / رمز الخروج
    '(?<![\\p{L}\\p{N}_])(?:[وفب]?(?:ال)?)(?:سطر\\s+(?:ال)?[أا]وامر|طرفي[ةه]|تيرمينال|كونسول|(?<!(?:جافا|تايب)\\s*)سكر[يِ]?بت|(?:نص|برنامج)\\s+(?:برمجي|نصي)|رمز\\s+(?:ال)?خروج)(?![\\p{L}\\p{N}_])',
].join('|'), 'iu');

const CSV_INPUT_SIGNALS = new RegExp([
    '\\b(?:csv|tsv)\\b.*\\b(?:column|field|header)\\b|\\bcolumn\\b.*\\b(?:csv|tsv)\\b|(?:\\binput\\b|\\bfile\\b).*\\b(?:csv|tsv)\\b|\\b(?:csv|tsv)\\b.*\\b(?:input|file)\\b',
    // «ملف CSV» / «مدخلات CSV» / «CSV … أعمدة»
    '(?:ملف|مدخلات|إدخال|ادخال)[^.؟!\\n]{0,40}\\b(?:csv|tsv)\\b|\\b(?:csv|tsv)\\b[^.؟!\\n]{0,80}(?:ملف|عمود|أعمدة|اعمدة|حقل|حقول|ترويس[ةه])',
].join('|'), 'iu');

/** Detects if the request is a CLI/utility/script request (not a web system). */
export function isCliRequest(goalRaw: string): boolean {
    return CLI_SIGNALS.test(goalRaw || '');
}

/**
 * Detects if the request is a CSV/TSV input with columns (input data, not a persistent record schema).
 */
export function isCsvInputRequest(goalRaw: string): boolean {
    return CSV_INPUT_SIGNALS.test(goalRaw || '');
}