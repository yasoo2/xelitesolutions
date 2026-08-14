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
