/**
 * File kinds that auto_tester can parse without guessing.
 *
 * A syntax check is an executable contract, not a filename-shaped request:
 * JavaScript-family files go through Node's parser and JSON artifacts go
 * through JSON.parse. Other artifacts must be checked by a tool that actually
 * understands their format; silently feeding them to Node is a false result.
 */
export type SyntaxFileKind = 'javascript' | 'json';

const JAVASCRIPT_EXTENSIONS = new Set([
    '.js', '.jsx', '.mjs', '.cjs',
    '.ts', '.tsx', '.mts', '.cts',
]);

export function syntaxFileKind(file: string): SyntaxFileKind | null {
    const ext = String(file || '').trim().toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
    if (JAVASCRIPT_EXTENSIONS.has(ext)) return 'javascript';
    if (ext === '.json') return 'json';
    return null;
}

export function isSyntaxCheckableFile(file: string): boolean {
    return syntaxFileKind(file) !== null;
}

/**
 * Statement-free check shared by the vacuous-test detector (AutoTesterTool)
 * and vacuous-test recovery (SelfFixService): a file is statement-free when
 * nothing remains after removing the shebang, block/line comments, string
 * literals and bare separators. Detection and repair re-verification must
 * agree on this predicate, so it lives here rather than in either consumer.
 */
export function isStatementFreeNodeSource(source: string): boolean {
    const stripped = String(source || '')
        .replace(/^\s*#[^\n]*/, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/[^\n]*/g, '$1')
        .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '')
        .replace(/[\s;]+/g, '');
    return stripped.length === 0;
}
